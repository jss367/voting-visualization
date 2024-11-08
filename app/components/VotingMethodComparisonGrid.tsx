import React, { useCallback, useEffect, useRef, useState } from 'react';

const CANVAS_SIZE = 300;
const VOTER_COUNT = 200000;
const NORMAL_SD = 0.15;

// Helper function to generate normally distributed random numbers
const randn_bm = () => {
    let u = 0, v = 0;
    while (u === 0) u = Math.random();
    while (v === 0) v = Math.random();
    return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
};

// Generate voters with normal distribution around a center point
const generateVoters = (centerX: number, centerY: number, count: number) => {
    const voters = [];
    for (let i = 0; i < count; i++) {
        const x = Math.min(1, Math.max(0, centerX + (randn_bm() * NORMAL_SD)));
        const y = Math.min(1, Math.max(0, centerY + (randn_bm() * NORMAL_SD)));
        voters.push({ x, y });
    }
    return voters;
};

// Calculate distance between two points
const distance = (x1: number, y1: number, x2: number, y2: number) =>
    Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);

const VotingMethodComparisonGrid = () => {
    const [candidates, setCandidates] = useState([
        { id: '1', x: 0.3, y: 0.7, color: '#22c55e', name: 'A' },
        { id: '2', x: 0.5, y: 0.5, color: '#ef4444', name: 'B' },
        { id: '3', x: 0.7, y: 0.3, color: '#3b82f6', name: 'C' },
    ]);
    const [isDragging, setIsDragging] = useState<string | null>(null);
    const canvasRefs = {
        plurality: useRef<HTMLCanvasElement>(null),
        approval: useRef<HTMLCanvasElement>(null),
        irv: useRef<HTMLCanvasElement>(null)
    };

    const runElection = useCallback((method: string, centerX: number, centerY: number) => {
        const voters = generateVoters(centerX, centerY, VOTER_COUNT);

        // Get voter preferences
        const voterPreferences = voters.map(voter => {
            return candidates
                .map(candidate => ({
                    id: candidate.id,
                    dist: distance(voter.x, voter.y, candidate.x, candidate.y)
                }))
                .sort((a, b) => a.dist - b.dist)
                .map(p => p.id);
        });

        const votes: Record<string, number> = {};
        candidates.forEach(c => votes[c.id] = 0);

        switch (method) {
            case 'plurality':
                voterPreferences.forEach(prefs => {
                    votes[prefs[0]]++;
                });
                break;

            case 'approval':
                const threshold = 0.3;
                voterPreferences.forEach((prefs, i) => {
                    candidates.forEach(candidate => {
                        if (distance(voters[i].x, voters[i].y, candidate.x, candidate.y) <= threshold) {
                            votes[candidate.id]++;
                        }
                    });
                });
                break;

            case 'irv':
                let remainingCandidates = new Set(candidates.map(c => c.id));
                while (remainingCandidates.size > 1) {
                    // Reset votes for this round
                    candidates.forEach(c => votes[c.id] = 0);

                    // Count first preferences among remaining candidates
                    voterPreferences.forEach(prefs => {
                        const firstChoice = prefs.find(id => remainingCandidates.has(id));
                        if (firstChoice) votes[firstChoice]++;
                    });

                    const totalVotes = Object.values(votes).reduce((a, b) => a + b, 0);
                    const majorityThreshold = totalVotes / 2;

                    // Check if any candidate has majority
                    const [winner] = Object.entries(votes).reduce((a, b) => b[1] > a[1] ? b : a);
                    if (votes[winner] > majorityThreshold) break;

                    // Eliminate candidate with fewest votes
                    const [loser] = Object.entries(votes).reduce((a, b) => b[1] < a[1] ? b : a);
                    remainingCandidates.delete(loser);
                }
                break;
        }

        // Return the winner
        return Object.entries(votes).reduce((a, b) => b[1] > a[1] ? b : a)[0];
    }, [candidates]);

    const drawCanvas = useCallback((canvasRef: React.RefObject<HTMLCanvasElement>, method: string) => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const imageData = ctx.createImageData(CANVAS_SIZE, CANVAS_SIZE);

        // For each pixel in the canvas
        for (let x = 0; x < CANVAS_SIZE; x++) {
            for (let y = 0; y < CANVAS_SIZE; y++) {
                // Convert canvas coordinates to [0,1] range
                const centerX = x / CANVAS_SIZE;
                const centerY = 1 - (y / CANVAS_SIZE);

                // Run election with this center point
                const winnerId = runElection(method, centerX, centerY);
                const winnerColor = candidates.find(c => c.id === winnerId)?.color ?? '#000000';

                // Convert hex color to RGB
                const rgb = parseInt(winnerColor.slice(1), 16);
                const idx = (y * CANVAS_SIZE + x) * 4;
                imageData.data[idx] = (rgb >> 16) & 255;     // R
                imageData.data[idx + 1] = (rgb >> 8) & 255;  // G
                imageData.data[idx + 2] = rgb & 255;         // B
                imageData.data[idx + 3] = 255;               // A
            }
        }

        ctx.putImageData(imageData, 0, 0);

        // Draw candidates
        candidates.forEach(candidate => {
            ctx.beginPath();
            ctx.arc(
                candidate.x * CANVAS_SIZE,
                (1 - candidate.y) * CANVAS_SIZE,
                6,
                0,
                2 * Math.PI
            );
            ctx.fillStyle = 'white';
            ctx.fill();
            ctx.strokeStyle = candidate.color;
            ctx.lineWidth = 2;
            ctx.stroke();
        });
    }, [candidates, runElection]);

    useEffect(() => {
        Object.entries(canvasRefs).forEach(([method, ref]) => {
            drawCanvas(ref, method);
        });
    }, [candidates, drawCanvas]);

    const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
        const canvas = e.currentTarget;
        const rect = canvas.getBoundingClientRect();
        const x = (e.clientX - rect.left) / rect.width;
        const y = 1 - ((e.clientY - rect.top) / rect.height);

        const clickedCandidate = candidates.find(candidate =>
            distance(x, y, candidate.x, candidate.y) < 0.05
        );

        if (clickedCandidate) {
            setIsDragging(clickedCandidate.id);
            e.preventDefault();
        }
    };

    const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
        if (!isDragging) return;

        const canvas = e.currentTarget;
        const rect = canvas.getBoundingClientRect();
        const x = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
        const y = Math.max(0, Math.min(1, 1 - ((e.clientY - rect.top) / rect.height)));

        setCandidates(candidates.map(c =>
            c.id === isDragging ? { ...c, x, y } : c
        ));
    };

    const handleMouseUp = () => {
        setIsDragging(null);
    };

    return (
        <div className="w-full max-w-6xl p-4 bg-white rounded-lg shadow-lg">
            <div className="mb-6">
                <h2 className="text-2xl font-bold mb-2">Voting Method Comparison</h2>
                <p className="text-sm text-gray-600">
                    Each point represents an election with voter opinions normally distributed around that point.
                    Colors show which candidate would win that election. Drag the candidates to explore different configurations.
                </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                    <h3 className="text-lg font-semibold mb-2">Plurality</h3>
                    <canvas
                        ref={canvasRefs.plurality}
                        width={CANVAS_SIZE}
                        height={CANVAS_SIZE}
                        className="border rounded w-full cursor-move"
                        onMouseDown={handleMouseDown}
                        onMouseMove={handleMouseMove}
                        onMouseUp={handleMouseUp}
                        onMouseLeave={handleMouseUp}
                    />
                </div>
                <div>
                    <h3 className="text-lg font-semibold mb-2">Approval</h3>
                    <canvas
                        ref={canvasRefs.approval}
                        width={CANVAS_SIZE}
                        height={CANVAS_SIZE}
                        className="border rounded w-full cursor-move"
                        onMouseDown={handleMouseDown}
                        onMouseMove={handleMouseMove}
                        onMouseUp={handleMouseUp}
                        onMouseLeave={handleMouseUp}
                    />
                </div>
                <div>
                    <h3 className="text-lg font-semibold mb-2">IRV (Hare)</h3>
                    <canvas
                        ref={canvasRefs.irv}
                        width={CANVAS_SIZE}
                        height={CANVAS_SIZE}
                        className="border rounded w-full cursor-move"
                        onMouseDown={handleMouseDown}
                        onMouseMove={handleMouseMove}
                        onMouseUp={handleMouseUp}
                        onMouseLeave={handleMouseUp}
                    />
                </div>
            </div>
        </div>
    );
};

export default VotingMethodComparisonGrid;
