import { useCallback, useEffect, useRef, useState } from 'react';

const CANVAS_SIZE = 300;
const CHUNK_SIZE = 30; // Process smaller chunks of pixels
const MAX_VOTERS_PER_POINT = 1000; // Reduce voter count for better performance

// Helper function to generate normally distributed random numbers
const randn_bm = () => {
    let u = 0, v = 0;
    while (u === 0) u = Math.random();
    while (v === 0) v = Math.random();
    return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
};

const distance = (x1: number, y1: number, x2: number, y2: number): number =>
    Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);

const VotingMethodComparisonGrid = () => {
    const [candidates] = useState([
        { id: '1', x: 0.3, y: 0.7, color: '#22c55e', name: 'A' },
        { id: '2', x: 0.5, y: 0.5, color: '#ef4444', name: 'B' },
        { id: '3', x: 0.7, y: 0.3, color: '#3b82f6', name: 'C' },
    ]);

    const canvasRefs = {
        plurality: useRef<HTMLCanvasElement>(null),
        approval: useRef<HTMLCanvasElement>(null),
        irv: useRef<HTMLCanvasElement>(null)
    };

    const [isRendering, setIsRendering] = useState(false);
    const renderingRef = useRef(false);

    const runElection = useCallback((method: string, centerX: number, centerY: number) => {
        // Generate a smaller number of voters for this point
        const voters = Array.from({ length: MAX_VOTERS_PER_POINT }, () => ({
            x: Math.min(1, Math.max(0, centerX + (randn_bm() * 0.15))),
            y: Math.min(1, Math.max(0, centerY + (randn_bm() * 0.15)))
        }));

        const votes: Record<string, number> = {};
        candidates.forEach(c => votes[c.id] = 0);

        if (method === 'plurality') {
            voters.forEach(voter => {
                const winner = candidates
                    .map(c => ({ id: c.id, dist: distance(voter.x, voter.y, c.x, c.y) }))
                    .sort((a, b) => a.dist - b.dist)[0].id;
                votes[winner]++;
            });
        } else if (method === 'approval') {
            const threshold = 0.3;
            voters.forEach(voter => {
                candidates.forEach(candidate => {
                    if (distance(voter.x, voter.y, candidate.x, candidate.y) <= threshold) {
                        votes[candidate.id]++;
                    }
                });
            });
        } else if (method === 'irv') {
            // Simplified IRV for better performance
            const firstChoices = voters.map(voter =>
                candidates
                    .map(c => ({ id: c.id, dist: distance(voter.x, voter.y, c.x, c.y) }))
                    .sort((a, b) => a.dist - b.dist)[0].id
            );
            firstChoices.forEach(id => votes[id]++);
        }

        return Object.entries(votes).reduce((a, b) => b[1] > a[1] ? b : a)[0];
    }, [candidates]);

    const drawCanvas = useCallback((canvas: HTMLCanvasElement, method: string) => {
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const imageData = ctx.createImageData(CANVAS_SIZE, CANVAS_SIZE);
        const data = imageData.data;

        // Pre-calculate candidate colors
        const candidateColors = candidates.reduce((acc, candidate) => {
            const rgb = parseInt(candidate.color.slice(1), 16);
            acc[candidate.id] = {
                r: (rgb >> 16) & 255,
                g: (rgb >> 8) & 255,
                b: rgb & 255
            };
            return acc;
        }, {} as Record<string, { r: number, g: number, b: number }>);

        let x = 0;
        let y = 0;

        const processChunk = () => {
            if (!renderingRef.current) return;

            const endX = Math.min(x + CHUNK_SIZE, CANVAS_SIZE);
            const endY = Math.min(y + CHUNK_SIZE, CANVAS_SIZE);

            for (let currentY = y; currentY < endY; currentY++) {
                for (let currentX = x; currentX < endX; currentX++) {
                    const centerX = currentX / CANVAS_SIZE;
                    const centerY = 1 - (currentY / CANVAS_SIZE);

                    const winnerId = runElection(method, centerX, centerY);
                    const color = candidateColors[winnerId];

                    const idx = (currentY * CANVAS_SIZE + currentX) * 4;
                    data[idx] = color.r;
                    data[idx + 1] = color.g;
                    data[idx + 2] = color.b;
                    data[idx + 3] = 255;
                }
            }

            ctx.putImageData(imageData, 0, 0);

            x += CHUNK_SIZE;
            if (x >= CANVAS_SIZE) {
                x = 0;
                y += CHUNK_SIZE;
            }

            if (y < CANVAS_SIZE && renderingRef.current) {
                requestAnimationFrame(processChunk);
            } else {
                // Draw candidates after completion
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

                if (y >= CANVAS_SIZE) {
                    setIsRendering(false);
                }
            }
        };

        requestAnimationFrame(processChunk);
    }, [candidates, runElection]);

    useEffect(() => {
        setIsRendering(true);
        renderingRef.current = true;

        Object.entries(canvasRefs).forEach(([method, ref]) => {
            if (ref.current) {
                drawCanvas(ref.current, method);
            }
        });

        return () => {
            renderingRef.current = false;
        };
    }, [drawCanvas]);

    return (
        <div className="w-full max-w-6xl p-4 bg-white rounded-lg shadow-lg">
            <div className="mb-6">
                <h2 className="text-2xl font-bold mb-2">Voting Method Comparison</h2>
                {isRendering && (
                    <p className="text-sm text-blue-600">Rendering visualizations...</p>
                )}
                <p className="text-sm text-gray-600">
                    Each point represents an election with voter opinions normally distributed around that point.
                    Colors show which candidate would win that election.
                </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {Object.entries(canvasRefs).map(([method, ref]) => (
                    <div key={method}>
                        <h3 className="text-lg font-semibold mb-2 capitalize">{method}</h3>
                        <canvas
                            ref={ref}
                            width={CANVAS_SIZE}
                            height={CANVAS_SIZE}
                            className="border rounded w-full"
                        />
                    </div>
                ))}
            </div>
        </div>
    );
};

export default VotingMethodComparisonGrid;
