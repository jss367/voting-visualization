"use client"

import React, { useEffect, useRef, useState } from 'react';

interface Candidate {
    id: string;
    x: number;
    y: number;
    color: string;
    name: string;
}

interface Voter {
    id: string;
    x: number;
    y: number;
}

interface ElectionResult {
    winnerId: string;
    roundDetails: string[];
    votes: Record<string, number>;
    eliminated?: string[];
}

const [voters, setVoters] = useState<Voter[]>([]);
const [voterCount, setVoterCount] = useState(100);
const [voterDistribution, setVoterDistribution] = useState<'uniform' | 'normal' | 'clustered'>('uniform');


const generateVoters = (count: number, distribution: 'uniform' | 'normal' | 'clustered') => {
    const newVoters: Voter[] = [];
    
    for (let i = 0; i < count; i++) {
        let x: number, y: number;
        
        switch (distribution) {
            case 'normal':
                // Generate normally distributed voters around the center
                x = Math.min(1, Math.max(0, 0.5 + (randn_bm() * 0.3)));
                y = Math.min(1, Math.max(0, 0.5 + (randn_bm() * 0.3)));
                break;
                
            case 'clustered':
                // Create 2-3 clusters
                const clusters = [[0.3, 0.3], [0.7, 0.7], [0.5, 0.5]];
                const cluster = clusters[Math.floor(Math.random() * clusters.length)];
                x = Math.min(1, Math.max(0, cluster[0] + (randn_bm() * 0.2)));
                y = Math.min(1, Math.max(0, cluster[1] + (randn_bm() * 0.2)));
                break;
                
            default: // uniform
                x = Math.random();
                y = Math.random();
        }
        
        newVoters.push({
            id: `voter-${i}`,
            x,
            y
        });
    }
    
    return newVoters;
};

// Helper function for normal distribution
const randn_bm = () => {
    let u = 0, v = 0;
    while(u === 0) u = Math.random();
    while(v === 0) v = Math.random();
    return Math.sqrt( -2.0 * Math.log( u ) ) * Math.cos( 2.0 * Math.PI * v );
};

// Modify the voting methods to use actual voters
const runElection = (method: keyof typeof votingMethods): ElectionResult => {
    switch (method) {
        case 'plurality':
            return runPluralityElection();
        case 'approval':
            return runApprovalElection();
        case 'borda':
            return runBordaElection();
        case 'irv':
            return runIRVElection();
        default:
            throw new Error(`Unknown method: ${method}`);
    }
};

const runPluralityElection = (): ElectionResult => {
    const votes: Record<string, number> = {};
    candidates.forEach(c => votes[c.id] = 0);
    
    voters.forEach(voter => {
        const pref = getVoterPreference(voter.x, voter.y);
        votes[pref[0].id]++;
    });
    
    const winnerId = Object.entries(votes)
        .reduce((a, b) => a[1] > b[1] ? a : b)[0];
    
    return {
        winnerId,
        votes,
        roundDetails: [`Total votes: ${voters.length}`]
    };
};

const runApprovalElection = (): ElectionResult => {
    const votes: Record<string, number> = {};
    candidates.forEach(c => votes[c.id] = 0);
    
    voters.forEach(voter => {
        const prefs = getVoterPreference(voter.x, voter.y);
        prefs.forEach(p => {
            if (p.dist <= approvalThreshold) {
                votes[p.id]++;
            }
        });
    });
    
    const winnerId = Object.entries(votes)
        .reduce((a, b) => a[1] > b[1] ? a : b)[0];
    
    return {
        winnerId,
        votes,
        roundDetails: [`Average approvals per voter: ${(Object.values(votes).reduce((a, b) => a + b, 0) / voters.length).toFixed(2)}`]
    };
};

const runBordaElection = (): ElectionResult => {
    const votes: Record<string, number> = {};
    candidates.forEach(c => votes[c.id] = 0);
    
    voters.forEach(voter => {
        const prefs = getVoterPreference(voter.x, voter.y);
        prefs.forEach((p, i) => {
            votes[p.id] += candidates.length - 1 - i;
        });
    });
    
    const winnerId = Object.entries(votes)
        .reduce((a, b) => a[1] > b[1] ? a : b)[0];
    
    return {
        winnerId,
        votes,
        roundDetails: [`Total Borda points: ${Object.values(votes).reduce((a, b) => a + b, 0)}`]
    };
};

const runIRVElection = (): ElectionResult => {
    let remainingCandidates = [...candidates];
    const roundDetails: string[] = [];
    const eliminated: string[] = [];
    
    while (remainingCandidates.length > 1) {
        const roundVotes: Record<string, number> = {};
        remainingCandidates.forEach(c => roundVotes[c.id] = 0);
        
        // Count first preferences among remaining candidates
        voters.forEach(voter => {
            const prefs = getVoterPreference(voter.x, voter.y)
                .filter(p => remainingCandidates.some(c => c.id === p.id));
            roundVotes[prefs[0].id]++;
        });
        
        // Check for majority
        const majorityNeeded = voters.length / 2;
        const leader = Object.entries(roundVotes)
            .reduce((a, b) => a[1] > b[1] ? a : b);
        
        if (leader[1] > majorityNeeded) {
            return {
                winnerId: leader[0],
                votes: roundVotes,
                roundDetails: [...roundDetails, `Final round: ${leader[0]} wins with ${leader[1]} votes`],
                eliminated
            };
        }
        
        // Eliminate last place
        const loser = Object.entries(roundVotes)
            .reduce((a, b) => a[1] < b[1] ? a : b);
        remainingCandidates = remainingCandidates.filter(c => c.id !== loser[0]);
        eliminated.push(loser[0]);
        
        roundDetails.push(
            `Round ${roundDetails.length + 1}: ${loser[0]} eliminated with ${loser[1]} votes`
        );
    }
    
    return {
        winnerId: remainingCandidates[0].id,
        votes: { [remainingCandidates[0].id]: voters.length },
        roundDetails,
        eliminated
    };
};


export const VotingMethodViz = () => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [candidates, setCandidates] = useState<Candidate[]>([
        { id: '1', x: 0.3, y: 0.7, color: '#22c55e', name: 'Candidate A' },
        { id: '2', x: 0.5, y: 0.5, color: '#ef4444', name: 'Candidate B' },
        { id: '3', x: 0.7, y: 0.3, color: '#3b82f6', name: 'Candidate C' },
    ]);
    const [selectedMethod, setSelectedMethod] = useState('plurality');
    const [isDragging, setIsDragging] = useState<string | null>(null);
    const [approvalThreshold, setApprovalThreshold] = useState(0.3);
    const [showSettings, setShowSettings] = useState(false);

    const availableColors = [
        '#22c55e', '#ef4444', '#3b82f6', '#f59e0b', '#8b5cf6',
        '#ec4899', '#10b981', '#6366f1', '#f97316', '#06b6d4'
    ];

    const methods = {
        plurality: 'Plurality',
        approval: 'Approval',
        borda: 'Borda Count',
        irv: 'Instant Runoff'
    };

    const methodDescriptions = {
        plurality: "Each voter chooses their closest candidate. The candidate with the most votes wins.",
        approval: "Voters 'approve' all candidates within a certain distance. The most approved candidate wins.",
        borda: "Voters rank candidates by distance. Each rank gives points (n-1 for 1st, n-2 for 2nd, etc.). Highest points wins.",
        irv: "Voters rank by distance. If no majority, eliminate last place and retry with remaining candidates."
    };

    const distance = (x1: number, y1: number, x2: number, y2: number): number =>
        Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);

    const getVoterPreference = (voterX: number, voterY: number) => {
        const distances = candidates.map((candidate) => ({
            id: candidate.id,
            dist: distance(voterX, voterY, candidate.x, candidate.y)
        }));
        return distances.sort((a, b) => a.dist - b.dist);
    };

    const votingMethods = {
        plurality: (voterX: number, voterY: number) => {
            const pref = getVoterPreference(voterX, voterY);
            return pref[0].id;
        },

        approval: (voterX: number, voterY: number) => {
            const pref = getVoterPreference(voterX, voterY);
            return pref.find(p => p.dist <= approvalThreshold)?.id ?? pref[0].id;
        },

        borda: (voterX: number, voterY: number) => {
            const pref = getVoterPreference(voterX, voterY);
            const scores = new Map<string, number>();
            candidates.forEach(c => scores.set(c.id, 0));
            pref.forEach((p, i) => {
                scores.set(p.id, candidates.length - 1 - i);
            });
            return [...scores.entries()].reduce((a, b) => scores.get(a)! > scores.get(b[0])! ? a : b[0]);
        },

        irv: (voterX: number, voterY: number) => {
            const pref = getVoterPreference(voterX, voterY);
            return pref[0].id;
        }
    };

    const addCandidate = () => {
        if (candidates.length >= availableColors.length) return;

        const newId = (Math.max(0, ...candidates.map(c => parseInt(c.id))) + 1).toString();
        const newColor = availableColors[candidates.length];
        const letter = String.fromCharCode(65 + candidates.length); // A, B, C, etc.

        setCandidates([...candidates, {
            id: newId,
            x: 0.5,
            y: 0.5,
            color: newColor,
            name: `Candidate ${letter}`
        }]);
    };

    const removeCandidate = (id: string) => {
        if (candidates.length <= 2) return; // Maintain at least 2 candidates
        setCandidates(candidates.filter(c => c.id !== id));
    };

    const updateCandidateName = (id: string, name: string) => {
        setCandidates(candidates.map(c =>
            c.id === id ? { ...c, name } : c
        ));
    };

    const drawVisualization = () => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const width = canvas.width;
        const height = canvas.height;

        // Draw the voting map
        const imageData = ctx.createImageData(width, height);
        for (let x = 0; x < width; x++) {
            for (let y = 0; y < height; y++) {
                const voterX = x / width;
                const voterY = 1 - (y / height);

                const winnerId = votingMethods[selectedMethod as keyof typeof votingMethods](voterX, voterY);
                const winnerColor = candidates.find(c => c.id === winnerId)?.color ?? '#000000';
                const rgb = parseInt(winnerColor.slice(1), 16);

                const idx = (y * width + x) * 4;
                imageData.data[idx] = (rgb >> 16) & 255;     // R
                imageData.data[idx + 1] = (rgb >> 8) & 255;  // G
                imageData.data[idx + 2] = rgb & 255;         // B
                imageData.data[idx + 3] = 255;               // A
            }
        }
        ctx.putImageData(imageData, 0, 0);

        // Draw candidates
        candidates.forEach((candidate) => {
            ctx.beginPath();
            ctx.arc(
                candidate.x * width,
                (1 - candidate.y) * height,
                8,
                0,
                2 * Math.PI
            );
            ctx.fillStyle = 'white';
            ctx.fill();
            ctx.strokeStyle = candidate.color;
            ctx.lineWidth = 3;
            ctx.stroke();

            // Draw candidate label
            ctx.fillStyle = 'black';
            ctx.font = '12px sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText(candidate.name, candidate.x * width, (1 - candidate.y) * height + 20);
        });

        // Draw approval radius if approval voting is selected
        if (selectedMethod === 'approval') {
            ctx.strokeStyle = 'rgba(0, 0, 0, 0.2)';
            ctx.lineWidth = 1;
            candidates.forEach((candidate) => {
                ctx.beginPath();
                ctx.arc(
                    candidate.x * width,
                    (1 - candidate.y) * height,
                    approvalThreshold * width,
                    0,
                    2 * Math.PI
                );
                ctx.stroke();
            });
        }
    };

    useEffect(() => {
        drawVisualization();
    }, [candidates, selectedMethod, approvalThreshold]);

    const handleCanvasMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const rect = canvas.getBoundingClientRect();
        // Account for any scaling between canvas internal size and displayed size
        const scaleX = canvas.width / rect.width;
        const scaleY = canvas.height / rect.height;

        const x = ((e.clientX - rect.left) * scaleX) / canvas.width;
        const y = 1 - ((e.clientY - rect.top) * scaleY) / canvas.height;

        const clickedCandidate = candidates.find(candidate =>
            distance(x, y, candidate.x, candidate.y) < 0.1  // Increased click detection area
        );

        if (clickedCandidate) {
            setIsDragging(clickedCandidate.id);
            e.preventDefault(); // Prevent text selection while dragging
        }
    };

    const handleCanvasMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
        if (isDragging !== null) {
            const canvas = canvasRef.current;
            if (!canvas) return;

            const rect = canvas.getBoundingClientRect();
            const scaleX = canvas.width / rect.width;
            const scaleY = canvas.height / rect.height;

            const x = ((e.clientX - rect.left) * scaleX) / canvas.width;
            const y = 1 - ((e.clientY - rect.top) * scaleY) / canvas.height;

            // Clamp the values between 0 and 1
            const clampedX = Math.max(0, Math.min(1, x));
            const clampedY = Math.max(0, Math.min(1, y));

            setCandidates(candidates.map(candidate =>
                candidate.id === isDragging ? { ...candidate, x: clampedX, y: clampedY } : candidate
            ));

            e.preventDefault(); // Prevent text selection while dragging
        }
    };

    const handleCanvasMouseUp = () => {
        setIsDragging(null);
    };

    const updateCandidatePosition = (id: string, newX: number, newY: number) => {
        // Clamp values between 0 and 1
        const x = Math.max(0, Math.min(1, newX));
        const y = Math.max(0, Math.min(1, newY));

        setCandidates(candidates.map(c =>
            c.id === id ? { ...c, x, y } : c
        ));
    };

    const handleCoordinateInput = (id: string, coord: 'x' | 'y', value: string) => {
        const numValue = parseFloat(value);
        if (isNaN(numValue)) return;

        const candidate = candidates.find(c => c.id === id);
        if (!candidate) return;

        updateCandidatePosition(
            id,
            coord === 'x' ? numValue : candidate.x,
            coord === 'y' ? numValue : candidate.y
        );
    };

    const calculateWinner = (method: keyof typeof votingMethods) => {
        const samplePoints = 50; // Number of points to sample in each dimension
        const votes = new Map<string, number>();
        candidates.forEach(c => votes.set(c.id, 0));

        // Sample points across the map
        for (let x = 0; x < samplePoints; x++) {
            for (let y = 0; y < samplePoints; y++) {
                const voterX = x / (samplePoints - 1);
                const voterY = y / (samplePoints - 1);
                const winnerId = votingMethods[method](voterX, voterY);
                votes.set(winnerId, votes.get(winnerId)! + 1);
            }
        }

        // Find the winner
        const winner = [...votes.entries()].reduce((a, b) =>
            a[1] > b[1] ? a : b
        );

        const totalVotes = [...votes.values()].reduce((a, b) => a + b, 0);
        const winnerPercentage = (winner[1] / totalVotes) * 100;

        return {
            winnerId: winner[0],
            percentage: winnerPercentage,
            votes: Object.fromEntries(votes)
        };
    };

    return (
        <div className="w-full max-w-6xl p-4 bg-white rounded-lg shadow-lg">
            <div className="flex justify-between items-start mb-4">
                <div>
                    <h2 className="text-2xl font-bold mb-2">Voting Method Comparison</h2>
                    <div className="flex gap-4 items-center">
                        <select
                            value={selectedMethod}
                            onChange={(e) => setSelectedMethod(e.target.value)}
                            className="block w-40 px-4 py-2 border rounded-md shadow-sm"
                        >
                            {Object.entries(methods).map(([value, label]) => (
                                <option key={value} value={value}>
                                    {label}
                                </option>
                            ))}
                        </select>
                        <button
                            onClick={() => setShowSettings(!showSettings)}
                            className="px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-md"
                        >
                            {showSettings ? 'Hide Settings' : 'Show Settings'}
                        </button>
                    </div>
                    <p className="mt-2 text-gray-600">
                        {methodDescriptions[selectedMethod as keyof typeof methods]}
                    </p>
                </div>
            </div>

            <div className="mt-4 p-4 bg-gray-50 rounded-lg">
                <h3 className="font-semibold mb-2">Election Results</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                    {Object.entries(methods).map(([method, label]) => {
                        const result = calculateWinner(method as keyof typeof votingMethods);
                        const winner = candidates.find(c => c.id === result.winnerId);
                        return (
                            <div key={method} className={`p-3 rounded-lg border ${method === selectedMethod ? 'bg-white border-blue-500' : 'bg-white'}`}>
                                <div className="font-medium">{label}</div>
                                <div className="flex items-center gap-2 mt-1">
                                    <div
                                        className="w-3 h-3 rounded-full"
                                        style={{ backgroundColor: winner?.color }}
                                    />
                                    <span>{winner?.name}</span>
                                </div>
                                <div className="text-sm text-gray-600">
                                    {result.percentage.toFixed(1)}% of the area
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>

            {showSettings && (
                <div className="mb-4 p-4 bg-gray-50 rounded-lg">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <h3 className="font-semibold mb-2">Candidates</h3>
                            <div className="space-y-2">
                                {candidates.map((candidate) => (
                                    <div key={candidate.id} className="flex flex-wrap items-center gap-2 p-2 border rounded bg-white">
                                        <div className="w-4 h-4 rounded-full" style={{ backgroundColor: candidate.color }}></div>
                                        <input
                                            type="text"
                                            value={candidate.name}
                                            onChange={(e) => updateCandidateName(candidate.id, e.target.value)}
                                            className="px-2 py-1 border rounded w-32"
                                        />
                                        <div className="flex items-center gap-2">
                                            <label className="text-sm">X:</label>
                                            <input
                                                type="number"
                                                value={candidate.x.toFixed(2)}
                                                onChange={(e) => handleCoordinateInput(candidate.id, 'x', e.target.value)}
                                                step="0.05"
                                                min="0"
                                                max="1"
                                                className="px-2 py-1 border rounded w-20"
                                            />
                                            <label className="text-sm">Y:</label>
                                            <input
                                                type="number"
                                                value={candidate.y.toFixed(2)}
                                                onChange={(e) => handleCoordinateInput(candidate.id, 'y', e.target.value)}
                                                step="0.05"
                                                min="0"
                                                max="1"
                                                className="px-2 py-1 border rounded w-20"
                                            />
                                        </div>
                                        <button
                                            onClick={() => removeCandidate(candidate.id)}
                                            className="px-2 py-1 text-red-600 hover:bg-red-50 rounded ml-auto"
                                        >
                                            Remove
                                        </button>
                                    </div>
                                ))}
                                <button
                                    onClick={addCandidate}
                                    className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
                                    disabled={candidates.length >= availableColors.length}
                                >
                                    Add Candidate
                                </button>
                            </div>
                            <div className="mt-2 text-sm text-gray-600">
                                <p>Tip: You can adjust positions by either:</p>
                                <ul className="list-disc ml-4">
                                    <li>Dragging the circles on the visualization</li>
                                    <li>Entering coordinates (0-1 range for both X and Y)</li>
                                </ul>
                            </div>
                        </div>

                        {selectedMethod === 'approval' && (
                            <div>
                                <h3 className="font-semibold mb-2">Approval Voting Settings</h3>
                                <div className="flex items-center gap-2">
                                    <label>Approval Threshold:</label>
                                    <input
                                        type="range"
                                        min="0.1"
                                        max="0.5"
                                        step="0.05"
                                        value={approvalThreshold}
                                        onChange={(e) => setApprovalThreshold(parseFloat(e.target.value))}
                                        className="w-40"
                                    />
                                    <span>{(approvalThreshold * 100).toFixed(0)}%</span>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}

            <div className="border rounded-lg p-4">
                <canvas
                    ref={canvasRef}
                    width={400}
                    height={400}
                    className="w-full border rounded cursor-move"
                    style={{ touchAction: 'none' }}
                    onMouseDown={handleCanvasMouseDown}
                    onMouseMove={handleCanvasMouseMove}
                    onMouseUp={handleCanvasMouseUp}
                    onMouseLeave={handleCanvasMouseUp}
                />
            </div>
        </div>
    );
};
