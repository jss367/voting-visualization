import React, { useCallback, useEffect, useRef, useState } from 'react';

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

// LRU Cache implementation
class LRUCache<K, V> {
    private cache: Map<K, V>;
    private readonly maxSize: number;

    constructor(maxSize: number) {
        this.cache = new Map();
        this.maxSize = maxSize;
    }

    get(key: K): V | undefined {
        const value = this.cache.get(key);
        if (value !== undefined) {
            // Refresh position in cache
            this.cache.delete(key);
            this.cache.set(key, value);
        }
        return value;
    }

    set(key: K, value: V): void {
        if (this.cache.size >= this.maxSize) {
            // Remove oldest entry
            const firstKey = this.cache.keys().next().value;
            this.cache.delete(firstKey);
        }
        this.cache.set(key, value);
    }

    clear(): void {
        this.cache.clear();
    }
}


// Global cache for results


class ComputationController {
    private abortController: AbortController | null = null;

    startNewComputation() {
        this.cancelCurrentComputation();
        this.abortController = new AbortController();
        return this.abortController.signal;
    }

    cancelCurrentComputation() {
        if (this.abortController) {
            this.abortController.abort();
            this.abortController = null;
        }
    }

    isComputing() {
        return this.abortController !== null;
    }
}

// Calculate weighted vote based on distance
const getWeight = (dist: number, radius: number): number => {
    if (dist >= radius) {
        return 0;
    }
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

const VotingMethodComparisonGrid = () => {
    const cacheRef = useRef(new LRUCache<string, ResultCache>(20));
    const computationController = useRef(new ComputationController());

    const [candidates, setCandidates] = useState([
        { id: '1', x: 0.3, y: 0.7, color: '#22c55e', name: 'A' },
        { id: '2', x: 0.5, y: 0.5, color: '#ef4444', name: 'B' },
        { id: '3', x: 0.7, y: 0.3, color: '#3b82f6', name: 'C' },
    ]);

    // Preset configurations
    const presets = {
        spoiler: [
            { id: '1', x: 0.3, y: 0.5, color: '#22c55e', name: 'Progressive A' },
            { id: '2', x: 0.7, y: 0.5, color: '#3b82f6', name: 'Conservative' },
            { id: '3', x: 0.4, y: 0.5, color: '#ef4444', name: 'Progressive B' },
        ],
        default: [
            { id: '1', x: 0.3, y: 0.7, color: '#22c55e', name: 'A' },
            { id: '2', x: 0.5, y: 0.5, color: '#ef4444', name: 'B' },
            { id: '3', x: 0.7, y: 0.3, color: '#3b82f6', name: 'C' },
        ]
    };

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

    const drawCandidates = useCallback((ctx: CanvasRenderingContext2D) => {
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
    }, [candidates]);

    const computeAndCacheResults = useCallback(async (method: string, canvas: HTMLCanvasElement) => {
        const signal = computationController.current.startNewComputation();
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        try {
            const cacheKey = generateCacheKey(candidates, method);
            const cached = cacheRef.current.get(cacheKey);

            if (cached) {
                ctx.putImageData(cached.imageData, 0, 0);
                drawCandidates(ctx);
                return;
            }

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

            while (y < CANVAS_SIZE) {
                if (signal.aborted) {
                    throw new Error('Computation cancelled');
                }

                const endX = Math.min(x + CHUNK_SIZE, CANVAS_SIZE);
                const endY = Math.min(y + CHUNK_SIZE, CANVAS_SIZE);

                // Process chunk
                for (let cy = y; cy < endY; cy++) {
                    for (let cx = x; cx < endX; cx++) {
                        // Use supersampling for anti-aliasing
                        const samples = 4;
                        const colors = new Map<string, number>();

                        for (let sx = 0; sx < samples; sx++) {
                            for (let sy = 0; sy < samples; sy++) {
                                const px = (cx + (sx + 0.5) / samples) / CANVAS_SIZE;
                                const py = 1 - (cy + (sy + 0.5) / samples) / CANVAS_SIZE;

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

                        const idx = (cy * CANVAS_SIZE + cx) * 4;
                        data[idx] = r;
                        data[idx + 1] = g;
                        data[idx + 2] = b;
                        data[idx + 3] = 255;
                    }
                }

                // Update progress every few chunks
                if (y % 5 === 0) {
                    const progress = (y * CANVAS_SIZE) / (CANVAS_SIZE * CANVAS_SIZE);
                    setComputeProgress(Math.round(progress * 100));
                    ctx.putImageData(imageData, 0, 0);
                    // Allow UI updates
                    await new Promise(resolve => setTimeout(resolve, 0));
                }

                // Move to next chunk
                x += CHUNK_SIZE;
                if (x >= CANVAS_SIZE) {
                    x = 0;
                    y += CHUNK_SIZE;
                }
            }

            if (!signal.aborted) {
                // Only cache and render if computation wasn't cancelled
                cacheRef.current.set(cacheKey, {
                    imageData: ctx.getImageData(0, 0, CANVAS_SIZE, CANVAS_SIZE),
                    timestamp: Date.now()
                });

                // Final render
                ctx.putImageData(imageData, 0, 0);
                drawCandidates(ctx);
            }
        } catch (error) {
            if (error.message !== 'Computation cancelled') {
                console.error('Computation error:', error);
            }
        } finally {
            if (computationController.current.isComputing()) {
                computationController.current.cancelCurrentComputation();
            }
        }
    }, [candidates, drawCandidates, runElection]);



    const handleCompute = async () => {
        setIsComputing(true);
        setComputeProgress(0);

        try {
            await Promise.all(
                Object.entries(canvasRefs).map(async ([method, ref]) => {
                    if (ref.current) {
                        const cacheKey = generateCacheKey(candidates, method);
                        const cached = cacheRef.current.get(cacheKey);

                        if (cached) {
                            const ctx = ref.current.getContext('2d');
                            if (ctx) {
                                ctx.putImageData(cached.imageData, 0, 0);
                                drawCandidates(ctx);
                            }
                        } else {
                            await computeAndCacheResults(method, ref.current);
                        }
                    }
                })
            );
        } finally {
            setIsComputing(false);
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
        if (!isDragging || computationController.current.isComputing()) return;

        const canvas = e.currentTarget;
        const rect = canvas.getBoundingClientRect();
        const x = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
        const y = Math.max(0, Math.min(1, 1 - ((e.clientY - rect.top) / rect.height)));

        setCandidates(prev =>
            prev.map(c => c.id === isDragging ? { ...c, x, y } : c)
        );

        // Just redraw candidates without election results
        initializeCanvases();
    }, [isDragging, initializeCanvases]);

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

    const loadPreset = (presetName: keyof typeof presets) => {
        setCandidates(presets[presetName]);
        setIsComputing(false);
        setComputeProgress(0);
        cacheRef.current.clear(); // Clear the LRU cache
    };

    const PresetControls = () => (
        <div className="flex items-center gap-4 mb-4">
            <button
                onClick={() => loadPreset('spoiler')}
                className="px-4 py-2 bg-purple-500 hover:bg-purple-600 text-white rounded-lg transition-colors"
                title="Demonstrates how similar candidates can split the vote"
            >
                Demo Spoiler Effect
            </button>
            <button
                onClick={() => loadPreset('default')}
                className="px-4 py-2 bg-gray-500 hover:bg-gray-600 text-white rounded-lg transition-colors"
            >
                Reset to Default
            </button>
        </div>
    );

    useEffect(() => {
        return () => {
            computationController.current.cancelCurrentComputation();
        };
    }, []);

    return (
        <div className="w-full max-w-6xl p-4 bg-white rounded-lg shadow-lg">
            <div className="mb-6">
                <h2 className="text-2xl font-bold mb-2">Voting Method Comparison</h2>
                <div className="flex flex-col gap-4">
                    <div className="flex items-center gap-4">
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
                    <PresetControls />
                </div>
                <p className="text-sm text-gray-600 mt-2">
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
