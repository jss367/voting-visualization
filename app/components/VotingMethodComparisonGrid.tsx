import React, { useCallback, useEffect, useRef, useState } from 'react';

const NORMAL_SD = 0.15;
const CANVAS_SIZE = 300;
const CHUNK_SIZE = 10; // Smaller chunks for smoother rendering
const VOTER_RADIUS = 0.15; // Radius of voter influence

interface CacheKey {
    candidates: Array<{ id: string; x: number; y: number; color: string }>;
    method: string;
}

interface ResultCache {
    imageData: ImageData;
    timestamp: number;
}

// Global cache for results
const resultCache = new Map<string, ResultCache>();

// Helper function to generate normally distributed random numbers
// const randn_bm = () => {
//     let u = 0, v = 0;
//     while (u === 0) u = Math.random();
//     while (v === 0) v = Math.random();
//     return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
// };

// Calculate weighted vote based on distance
const getWeight = (dist: number, radius: number): number => {
    if (dist >= radius) return 0;
    // Smooth falloff using cosine
    return 0.5 * (1 + Math.cos(Math.PI * dist / radius));
};

const distance = (x1: number, y1: number, x2: number, y2: number): number =>
    Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);

// Generate cache key from current configuration
const generateCacheKey = (candidates: CacheKey['candidates'], method: string): string => {
    const config = {
        candidates: candidates.map(c => ({
            id: c.id,
            x: Math.round(c.x * 100) / 100, // Round to 2 decimal places for cache efficiency
            y: Math.round(c.y * 100) / 100,
            color: c.color
        })),
        method
    };
    return JSON.stringify(config);
};

// Generate a fixed pattern of voter offsets in a normal distribution
const generateVoterPattern = (count: number = 100) => {
    const pattern: Array<{ dx: number, dy: number }> = [];

    // Create a grid of points and apply inverse normal CDF
    const gridSize = Math.ceil(Math.sqrt(count));
    const step = 3 / gridSize; // Use 3 standard deviations

    for (let i = 0; i < gridSize; i++) {
        for (let j = 0; j < gridSize; j++) {
            // Convert from uniform to normal distribution
            // Using Box-Muller transform
            const u1 = (i + 0.5) * step - 1.5; // -1.5 to 1.5
            const u2 = (j + 0.5) * step - 1.5;

            // Scale by our desired standard deviation
            const dx = u1 * NORMAL_SD;
            const dy = u2 * NORMAL_SD;

            // Only add points within 3 standard deviations
            if (Math.sqrt(dx * dx + dy * dy) <= 3 * NORMAL_SD) {
                pattern.push({ dx, dy });
            }
        }
    }

    return pattern;
};


// Create our fixed voter pattern
const VOTER_PATTERN = generateVoterPattern();

const VotingMethodComparisonGrid = () => {
    const [candidates, setCandidates] = useState([
        { id: '1', x: 0.3, y: 0.7, color: '#22c55e', name: 'A' },
        { id: '2', x: 0.5, y: 0.5, color: '#ef4444', name: 'B' },
        { id: '3', x: 0.7, y: 0.3, color: '#3b82f6', name: 'C' },
    ]);

    const availableColors = [
        '#22c55e', '#ef4444', '#3b82f6', '#f59e0b', '#8b5cf6',
        '#ec4899', '#10b981', '#6366f1', '#f97316', '#06b6d4'
    ];

    const canvasRefs = {
        plurality: useRef<HTMLCanvasElement>(null),
        approval: useRef<HTMLCanvasElement>(null),
        irv: useRef<HTMLCanvasElement>(null)
    };

    const [isComputing, setIsComputing] = useState(false);
    const [isDragging, setIsDragging] = useState<string | null>(null);
    const renderingRef = useRef(false);
    const [computeProgress, setComputeProgress] = useState(0);

    const runElection = useCallback((method: string, centerX: number, centerY: number) => {
        const votes: Record<string, number> = {};
        candidates.forEach(c => votes[c.id] = 0);

        if (method === 'plurality') {
            // For each candidate, calculate their weighted influence at this point
            const weights = candidates.map(candidate => ({
                id: candidate.id,
                weight: getWeight(distance(centerX, centerY, candidate.x, candidate.y), VOTER_RADIUS)
            }));

            // Winner is the candidate with highest weight
            const winner = weights.reduce((a, b) => a.weight > b.weight ? a : b);
            return winner.id;

        } else if (method === 'approval') {
            const threshold = 0.3;
            candidates.forEach(candidate => {
                const dist = distance(centerX, centerY, candidate.x, candidate.y);
                if (dist <= threshold) {
                    votes[candidate.id] = getWeight(dist, threshold);
                }
            });

            // Winner is candidate with highest approval weight
            return Object.entries(votes).reduce((a, b) => b[1] > a[1] ? b : a)[0];

        } else if (method === 'irv') {
            // Calculate distances to all candidates
            const distances = candidates.map(candidate => ({
                id: candidate.id,
                dist: distance(centerX, centerY, candidate.x, candidate.y)
            }));

            // Sort by distance and weight by position
            return distances
                .sort((a, b) => a.dist - b.dist)
                .map(c => c.id)[0];
        }

        return candidates[0].id; // Fallback
    }, [candidates]);

    const drawCanvas = useCallback((canvasRef: React.RefObject<HTMLCanvasElement>, method: string) => {
        const canvas = canvasRef.current;
        if (!canvas) return;

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

        // Draw with anti-aliasing
        for (let y = 0; y < CANVAS_SIZE; y += 1) {
            for (let x = 0; x < CANVAS_SIZE; x += 1) {
                // Use supersampling for anti-aliasing
                const samples = 4;
                const colors = new Map<string, number>();

                for (let sx = 0; sx < samples; sx++) {
                    for (let sy = 0; sy < samples; sy++) {
                        const px = (x + (sx + 0.5) / samples) / CANVAS_SIZE;
                        const py = 1 - (y + (sy + 0.5) / samples) / CANVAS_SIZE;

                        const winnerId = runElection(method, px, py);
                        colors.set(winnerId, (colors.get(winnerId) || 0) + 1);
                    }
                }

                // Blend colors based on sample counts
                let r = 0, g = 0, b = 0;
                for (const [id, count] of colors.entries()) {
                    const color = candidateColors[id];
                    const weight = count / (samples * samples);
                    r += color.r * weight;
                    g += color.g * weight;
                    b += color.b * weight;
                }

                const idx = (y * CANVAS_SIZE + x) * 4;
                data[idx] = r;
                data[idx + 1] = g;
                data[idx + 2] = b;
                data[idx + 3] = 255;
            }

            // Update progress more frequently
            if (y % 10 === 0) {
                ctx.putImageData(imageData, 0, 0);
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

            // Draw candidate label
            ctx.fillStyle = 'black';
            ctx.font = '12px sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText(candidate.name, candidate.x * CANVAS_SIZE, (1 - candidate.y) * CANVAS_SIZE + 20);
        });
    }, [candidates, runElection]);

    const computeAndCacheResults = useCallback(async (method: string, canvas: HTMLCanvasElement) => {
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const cacheKey = generateCacheKey(candidates, method);
        const cached = resultCache.get(cacheKey);

        if (cached) {
            ctx.putImageData(cached.imageData, 0, 0);
            drawCandidates(ctx);
            return;
        }

        const imageData = ctx.createImageData(CANVAS_SIZE, CANVAS_SIZE);
        const data = imageData.data;

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

        while (y < CANVAS_SIZE && renderingRef.current) {
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

            // Update progress
            const progress = (y * CANVAS_SIZE + x) / (CANVAS_SIZE * CANVAS_SIZE);
            setComputeProgress(Math.round(progress * 100));

            x += CHUNK_SIZE;
            if (x >= CANVAS_SIZE) {
                x = 0;
                y += CHUNK_SIZE;
            }

            // Allow UI to update
            await new Promise(resolve => setTimeout(resolve, 0));
        }

        // Cache the result
        resultCache.set(cacheKey, {
            imageData: ctx.getImageData(0, 0, CANVAS_SIZE, CANVAS_SIZE),
            timestamp: Date.now()
        });

        drawCandidates(ctx);
    }, [candidates, runElection]);

    const drawCandidates = (ctx: CanvasRenderingContext2D) => {
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

            ctx.fillStyle = 'black';
            ctx.font = '12px sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText(candidate.name, candidate.x * CANVAS_SIZE, (1 - candidate.y) * CANVAS_SIZE + 20);
        });
    };

    const handleCompute = async () => {
        setIsComputing(true);
        setComputeProgress(0);
        renderingRef.current = true;

        try {
            await Promise.all(
                Object.entries(canvasRefs).map(async ([method, ref]) => {
                    if (ref.current) {
                        // Check cache first
                        const cacheKey = generateCacheKey(candidates, method);
                        const cached = resultCache.get(cacheKey);

                        if (cached) {
                            const ctx = ref.current.getContext('2d');
                            if (ctx) {
                                ctx.putImageData(cached.imageData, 0, 0);
                                drawCandidates(ctx); // Redraw candidates on top
                            }
                        } else {
                            // Compute new results
                            await drawCanvas(ref, method);
                        }
                    }
                })
            );
        } finally {
            setIsComputing(false);
            renderingRef.current = false;
            setComputeProgress(100);
        }
    };

    const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
        if (isComputing) return;

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

    const initializeCanvases = useCallback(() => {
        Object.values(canvasRefs).forEach(ref => {
            const canvas = ref.current;
            if (!canvas) return;

            const ctx = canvas.getContext('2d');
            if (!ctx) return;

            // Clear canvas with white background
            ctx.fillStyle = 'white';
            ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);

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

                // Draw candidate label
                ctx.fillStyle = 'black';
                ctx.font = '12px sans-serif';
                ctx.textAlign = 'center';
                ctx.fillText(candidate.name, candidate.x * CANVAS_SIZE, (1 - candidate.y) * CANVAS_SIZE + 20);
            });
        });
    }, [candidates]);

    // Call initializeCanvases when component mounts and when candidates change
    useEffect(() => {
        initializeCanvases();
    }, [initializeCanvases]);

    const handleMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
        if (!isDragging || isComputing) return;

        const canvas = e.currentTarget;
        const rect = canvas.getBoundingClientRect();
        const x = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
        const y = Math.max(0, Math.min(1, 1 - ((e.clientY - rect.top) / rect.height)));

        setCandidates(prev =>
            prev.map(c => c.id === isDragging ? { ...c, x, y } : c)
        );

        // Just redraw candidates without election results
        initializeCanvases();
    }, [isDragging, isComputing, initializeCanvases]);

    const handleMouseUp = () => {
        setIsDragging(null);
    };

    const addCandidate = useCallback(() => {
        if (candidates.length >= availableColors.length) return;

        const newId = (Math.max(0, ...candidates.map(c => parseInt(c.id))) + 1).toString();
        const newColor = availableColors[candidates.length];
        const letter = String.fromCharCode(65 + candidates.length);

        setCandidates(prev => [...prev, {
            id: newId,
            x: 0.5,
            y: 0.5,
            color: newColor,
            name: letter
        }]);
    }, [candidates, availableColors]);

    const removeCandidate = useCallback((id: string) => {
        if (candidates.length <= 2) return;
        setCandidates(prev => prev.filter(c => c.id !== id));
    }, [candidates]);

    return (
        <div className="w-full max-w-6xl p-4 bg-white rounded-lg shadow-lg">
            <div className="mb-6">
                <h2 className="text-2xl font-bold mb-2">Voting Method Comparison</h2>
                <div className="flex items-center gap-4 mb-4">
                    <button
                        onClick={handleCompute}
                        disabled={isComputing}
                        className={`px-4 py-2 rounded-lg ${isComputing
                                ? 'bg-gray-300 cursor-not-allowed'
                                : 'bg-blue-500 hover:bg-blue-600 text-white'
                            }`}
                    >
                        {isComputing ? `Computing (${computeProgress}%)` : 'Compute Results'}
                    </button>
                    <button
                        onClick={addCandidate}
                        disabled={candidates.length >= availableColors.length || isComputing}
                        className="px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 disabled:bg-gray-300 disabled:cursor-not-allowed"
                    >
                        Add Candidate
                    </button>
                </div>
                <p className="text-sm text-gray-600">
                    Drag candidates to reposition them, then click "Compute Results" to see the outcomes.
                    Each point represents an election with voter opinions normally distributed around that point.
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
                            className="border rounded w-full cursor-move touch-none"
                            onMouseDown={handleMouseDown}
                            onMouseMove={handleMouseMove}
                            onMouseUp={handleMouseUp}
                            onMouseLeave={handleMouseUp}
                        />
                    </div>
                ))}
            </div>

            <div className="mt-4 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
                {candidates.map((candidate) => (
                    <div key={candidate.id}
                        className="flex items-center gap-2 p-2 border rounded">
                        <div className="w-4 h-4 rounded-full"
                            style={{ backgroundColor: candidate.color }}></div>
                        <span>{candidate.name}</span>
                        {candidates.length > 2 && (
                            <button
                                onClick={() => removeCandidate(candidate.id)}
                                className="ml-auto text-red-500 hover:text-red-700"
                                disabled={isComputing}
                            >
                                ✕
                            </button>
                        )}
                    </div>
                ))}
            </div>
        </div>
    );
};

export default VotingMethodComparisonGrid;
