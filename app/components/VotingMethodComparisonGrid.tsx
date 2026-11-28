import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { electorateAt, runElection, type VotingMethod } from './ElectionUtils';
import { distance, methods } from './votingMethods';

const CANVAS_SIZE = 300;
const CELL_SIZE = 4;
const NEUTRAL = '#d1d5db';
const comparisonMethods: VotingMethod[] = ['plurality', 'approval', 'irv'];

const availableColors = [
        '#22c55e', '#ef4444', '#3b82f6', '#f59e0b', '#8b5cf6',
        '#ec4899', '#10b981', '#6366f1', '#f97316', '#06b6d4'
    ];

const VotingMethodComparisonGrid = () => {
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

    const plurality = useRef<HTMLCanvasElement>(null);
    const approval = useRef<HTMLCanvasElement>(null);
    const irv = useRef<HTMLCanvasElement>(null);
    const canvasRefs = useMemo(() => ({ plurality, approval, irv }), []);
    const activeRun = useRef(0);
    useEffect(() => () => { activeRun.current++; }, []);

    const [isComputing, setIsComputing] = useState(false);
    const [isDragging, setIsDragging] = useState<string | null>(null);
    const [computeProgress, setComputeProgress] = useState(0);


    const drawCandidates = useCallback((ctx: CanvasRenderingContext2D) => {
        for (const candidate of candidates) {
            const x = candidate.x * CANVAS_SIZE;
            const y = (1 - candidate.y) * CANVAS_SIZE;
            ctx.beginPath();
            ctx.arc(x, y, 6, 0, 2 * Math.PI);
            ctx.fillStyle = 'white';
            ctx.fill();
            ctx.strokeStyle = candidate.color;
            ctx.lineWidth = 2;
            ctx.stroke();
            ctx.fillStyle = 'black';
            ctx.font = '12px sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText(candidate.name, x, y + 20);
        }
    }, [candidates]);

    const handleCompute = async () => {
        const run = ++activeRun.current;
        const panels = comparisonMethods.map(method => ({
            method, ctx: canvasRefs[method].current?.getContext('2d'),
        }));
        const colors = new Map(candidates.map(c => [c.id, c.color]));
        setIsComputing(true);
        setComputeProgress(0);
        try {
            for (let y = 0; y < CANVAS_SIZE; y += CELL_SIZE) {
                if (y % (CELL_SIZE * 5) === 0) {
                    setComputeProgress(Math.round(100 * y / CANVAS_SIZE));
                    await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
                    if (activeRun.current !== run) return;
                }
                for (let x = 0; x < CANVAS_SIZE; x += CELL_SIZE) {
                    const voters = electorateAt((x + CELL_SIZE / 2) / CANVAS_SIZE, 1 - (y + CELL_SIZE / 2) / CANVAS_SIZE);
                    const winners = runElection(voters, candidates);
                    for (const { method, ctx } of panels) {
                        if (!ctx) continue;
                        const winner = winners[method];
                        ctx.fillStyle = winner === null ? NEUTRAL : colors.get(winner)!;
                        ctx.fillRect(x, y, CELL_SIZE, CELL_SIZE);
                    }
                }
            }
            for (const { ctx } of panels) {
                if (ctx) drawCandidates(ctx);
            }
        } finally {
            if (activeRun.current === run) setIsComputing(false);
        }
    };

    const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
        if (isComputing) {
            return;
        }

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

    useEffect(() => {
        for (const ref of Object.values(canvasRefs)) {
            const ctx = ref.current?.getContext('2d');
            if (!ctx) continue;
            ctx.fillStyle = 'white';
            ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
            drawCandidates(ctx);
        }
    }, [drawCandidates, canvasRefs]);

    const handleMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
        if (!isDragging || isComputing) {
            return;
        }

        const canvas = e.currentTarget;
        const rect = canvas.getBoundingClientRect();
        const x = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
        const y = Math.max(0, Math.min(1, 1 - ((e.clientY - rect.top) / rect.height)));

        setCandidates(prev =>
            prev.map(c => c.id === isDragging ? { ...c, x, y } : c)
        );

    }, [isDragging, isComputing]);

    const handleMouseUp = () => {
        setIsDragging(null);
    };

    const addCandidate = useCallback(() => {
        if (candidates.length >= availableColors.length) {
            return;
        }

        const newId = (Math.max(0, ...candidates.map(c => parseInt(c.id))) + 1).toString();
        const newColor = availableColors.find(color => candidates.every(candidate => candidate.color !== color))!;
        const letter = String.fromCharCode(64 + Number(newId));

        setCandidates(prev => [...prev, {
            id: newId,
            x: 0.5,
            y: 0.5,
            color: newColor,
            name: letter
        }]);
    }, [candidates]);

    const removeCandidate = useCallback((id: string) => {
        if (candidates.length <= 2) {
            return;
        }
        setCandidates(prev => prev.filter(c => c.id !== id));
    }, [candidates]);

    const loadPreset = (presetName: keyof typeof presets) => {
        setCandidates(presets[presetName]);
        setIsComputing(false);
        setComputeProgress(0);


    };

    const PresetControls = () => (
        <div className="flex items-center gap-4 mb-4">
            <button
                disabled={isComputing}
                onClick={() => loadPreset('spoiler')}
                className="px-4 py-2 bg-purple-500 hover:bg-purple-600 text-white rounded-lg transition-colors"
                title="Demonstrates how similar candidates can split the vote"
            >
                Demo Spoiler Effect
            </button>
            <button
                disabled={isComputing}
                onClick={() => loadPreset('default')}
                className="px-4 py-2 bg-gray-500 hover:bg-gray-600 text-white rounded-lg transition-colors"
            >
                Reset to Default
            </button>
        </div>
    );

    return (
        <div className="w-full max-w-6xl p-4 bg-white dark:bg-gray-800 rounded-lg shadow-lg dark:text-white">
            <div className="mb-6">
                <h2 className="text-2xl font-bold mb-2 text-black dark:text-white">Voting Method Comparison</h2>
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
                    Drag candidates to reposition them, then click &#34;Compute Results&#34; to see the outcomes.
                    Each cell centers the same pattern of 25 nearby voters on all three maps.
                    Plurality counts first choices. Approval counts every candidate within 0.3 map units of each voter
                    (gray means no approvals). Instant runoff eliminates the last-place candidate and transfers ballots
                    until one wins. Ties favor the earlier-created candidate.
                </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {comparisonMethods.map((method) => (
                    <div key={method}>
                        <h3 className="text-lg font-semibold mb-2 capitalize">{methods[method]}</h3>
                        <canvas
                            ref={canvasRefs[method]}
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
