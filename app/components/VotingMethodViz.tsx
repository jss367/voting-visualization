"use client"
import React, { useCallback, useEffect, useRef, useState } from 'react';
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
const VotingMethodViz = () => {
    const canvasRef = useRef(null);
    const [candidates, setCandidates] = useState([
        { id: '1', x: 0.3, y: 0.7, color: '#22c55e', name: 'Candidate A' },
        { id: '2', x: 0.5, y: 0.5, color: '#ef4444', name: 'Candidate B' },
        { id: '3', x: 0.7, y: 0.3, color: '#3b82f6', name: 'Candidate C' },
    ]);
    const [selectedMethod, setSelectedMethod] = useState('plurality');
    const [isDragging, setIsDragging] = useState(null);
    const [approvalThreshold, setApprovalThreshold] = useState(0.3);
    const [showSettings, setShowSettings] = useState(false);
    const [voters, setVoters] = useState([]);
    const [voterCount, setVoterCount] = useState(100);
    const [voterDistribution, setVoterDistribution] = useState('uniform');
    const [electionResults, setElectionResults] = useState(null);
    const [hasGeneratedVoters, setHasGeneratedVoters] = useState(false);

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

    const randn_bm = () => {
        let u = 0, v = 0;
        while (u === 0) u = Math.random();
        while (v === 0) v = Math.random();
        return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
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

    const generateVoters = useCallback((count: number, distribution: 'uniform' | 'normal' | 'clustered') => {
        const newVoters: Voter[] = [];

        for (let i = 0; i < count; i++) {
            let x: number, y: number;

            switch (distribution) {
                case 'normal':
                    x = Math.min(1, Math.max(0, 0.5 + (randn_bm() * 0.3)));
                    y = Math.min(1, Math.max(0, 0.5 + (randn_bm() * 0.3)));
                    break;

                case 'clustered':
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
    }, []);

    const runPluralityElection = useCallback((): ElectionResult => {
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
    }, [voters, candidates]);

    const runApprovalElection = useCallback((): ElectionResult => {
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
    }, [voters, candidates, approvalThreshold]);

    const runBordaElection = useCallback((): ElectionResult => {
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
    }, [voters, candidates]);

    const runIRVElection = useCallback((): ElectionResult => {
        let remainingCandidates = [...candidates];
        const roundDetails: string[] = [];
        const eliminated: string[] = [];

        while (remainingCandidates.length > 1) {
            const roundVotes: Record<string, number> = {};
            remainingCandidates.forEach(c => roundVotes[c.id] = 0);

            voters.forEach(voter => {
                const prefs = getVoterPreference(voter.x, voter.y)
                    .filter(p => remainingCandidates.some(c => c.id === p.id));
                roundVotes[prefs[0].id]++;
            });

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

            const loser = Object.entries(roundVotes)
                .reduce((a, b) => a[1] < b[1] ? a : b);
            remainingCandidates = remainingCandidates.filter(c => c.id !== loser[0]);
            eliminated.push(loser[0]);

            roundDetails.push(
                `Round ${roundDetails.length + 1}: ${candidates.find(c => c.id === loser[0])?.name} eliminated with ${loser[1]} votes`
            );
        }

        return {
            winnerId: remainingCandidates[0].id,
            votes: { [remainingCandidates[0].id]: voters.length },
            roundDetails,
            eliminated
        };
    }, [voters, candidates]);

    const runElection = useCallback(() => {
        let result: ElectionResult;
        switch (selectedMethod) {
            case 'approval':
                result = runApprovalElection();
                break;
            case 'borda':
                result = runBordaElection();
                break;
            case 'irv':
                result = runIRVElection();
                break;
            default:
                result = runPluralityElection();
        }
        setElectionResults(result);
    }, [selectedMethod, runPluralityElection, runApprovalElection, runBordaElection, runIRVElection]);

    const addCandidate = () => {
        if (candidates.length >= availableColors.length) return;

        const newId = (Math.max(0, ...candidates.map(c => parseInt(c.id))) + 1).toString();
        const newColor = availableColors[candidates.length];
        const letter = String.fromCharCode(65 + candidates.length);

        setCandidates([...candidates, {
            id: newId,
            x: 0.5,
            y: 0.5,
            color: newColor,
            name: `Candidate ${letter}`
        }]);
    };

    const removeCandidate = (id: string) => {
        if (candidates.length <= 2) return;
        setCandidates(candidates.filter(c => c.id !== id));
    };

    const updateCandidateName = (id: string, name: string) => {
        setCandidates(candidates.map(c =>
            c.id === id ? { ...c, name } : c
        ));
    };

    const updateCandidatePosition = (id: string, newX: number, newY: number) => {
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

    const drawVisualization = useCallback(() => {
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

                let winnerId;
                if (selectedMethod === 'approval') {
                    // For approval, color based on approved candidates
                    const prefs = getVoterPreference(voterX, voterY);
                    const approvedCandidates = prefs.filter(p => p.dist <= approvalThreshold);
                    winnerId = approvedCandidates.length > 0 ? approvedCandidates[0].id : prefs[0].id;
                } else if (selectedMethod === 'borda') {
                    // For Borda, color based on points
                    const prefs = getVoterPreference(voterX, voterY);
                    const points = new Map();
                    prefs.forEach((p, i) => {
                        points.set(p.id, candidates.length - 1 - i);
                    });
                    winnerId = [...points.entries()].reduce((a, b) =>
                        a[1] > b[1] ? a : b)[0];
                } else {
                    // For plurality and IRV, color based on closest candidate
                    winnerId = getVoterPreference(voterX, voterY)[0].id;
                }

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

        // Draw voters
        ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
        voters.forEach(voter => {
            ctx.beginPath();
            ctx.arc(
                voter.x * width,
                (1 - voter.y) * height,
                2,
                0,
                2 * Math.PI
            );
            ctx.fill();
        });

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

            ctx.fillStyle = 'black';
            ctx.font = '12px sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText(candidate.name, candidate.x * width, (1 - candidate.y) * height + 20);
        });

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
    }, [candidates, selectedMethod, approvalThreshold, voters]);

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


    const votingMethods = {
        plurality: (voterX: number, voterY: number) => {
            return [getVoterPreference(voterX, voterY)[0].id];
        },

        approval: (voterX: number, voterY: number) => {
            const prefs = getVoterPreference(voterX, voterY);
            const approvedCandidates = prefs.filter(p => p.dist <= approvalThreshold);
            return approvedCandidates.length > 0 ? approvedCandidates.map(c => c.id) : [prefs[0].id];
        },

        borda: (voterX: number, voterY: number) => {
            const prefs = getVoterPreference(voterX, voterY);
            const points = new Map<string, number>();

            prefs.forEach((p, i) => {
                points.set(p.id, (candidates.length - 1 - i));
            });

            return [...points.entries()]
                .sort((a, b) => b[1] - a[1])
                .map(([id]) => id);
        },

        irv: (voterX: number, voterY: number) => {
            return getVoterPreference(voterX, voterY).map(p => p.id);
        }
    };


    const calculateWinningAreas = useCallback((method: keyof typeof votingMethods) => {
        const samplePoints = 50;
        const votes = new Map<string, number>();
        candidates.forEach(c => votes.set(c.id, 0));

        // For IRV, we need to collect all votes first
        const allVotes: string[][] = [];

        for (let x = 0; x < samplePoints; x++) {
            for (let y = 0; y < samplePoints; y++) {
                const voterX = x / (samplePoints - 1);
                const voterY = y / (samplePoints - 1);
                const voteResult = votingMethods[method](voterX, voterY);

                if (method === 'approval') {
                    // For approval, count all approved candidates
                    voteResult.forEach(id => votes.set(id, votes.get(id)! + 1));
                } else if (method === 'borda') {
                    // For Borda, give points based on ranking
                    voteResult.forEach((id, index) => {
                        votes.set(id, votes.get(id)! + (candidates.length - 1 - index));
                    });
                } else if (method === 'irv') {
                    // For IRV, collect all votes for later processing
                    allVotes.push(voteResult);
                } else {
                    // For plurality, just count first preference
                    votes.set(voteResult[0], votes.get(voteResult[0])! + 1);
                }
            }
        }

        // Special handling for IRV
        if (method === 'irv') {
            let remainingCandidates = new Set(candidates.map(c => c.id));

            while (remainingCandidates.size > 1) {
                const roundVotes = new Map<string, number>();
                remainingCandidates.forEach(id => roundVotes.set(id, 0));

                // Count first preferences among remaining candidates
                allVotes.forEach(prefs => {
                    const firstChoice = prefs.find(id => remainingCandidates.has(id));
                    if (firstChoice) {
                        roundVotes.set(firstChoice, roundVotes.get(firstChoice)! + 1);
                    }
                });

                const totalVotes = [...roundVotes.values()].reduce((a, b) => a + b, 0);
                const majorityThreshold = totalVotes / 2;

                // Check if any candidate has a majority
                const [winner] = [...roundVotes.entries()].reduce((a, b) =>
                    b[1] > a[1] ? b : a
                );
                if (roundVotes.get(winner)! > majorityThreshold) {
                    votes.clear();
                    candidates.forEach(c => votes.set(c.id, 0));
                    votes.set(winner, totalVotes);
                    break;
                }

                // Eliminate candidate with fewest votes
                const [loser] = [...roundVotes.entries()].reduce((a, b) =>
                    a[1] < b[1] ? a : b
                );
                remainingCandidates.delete(loser);
            }

            // If we get here without finding a majority winner, the last remaining candidate wins
            if (remainingCandidates.size === 1) {
                const winner = remainingCandidates.values().next().value;
                votes.clear();
                candidates.forEach(c => votes.set(c.id, 0));
                votes.set(winner, samplePoints * samplePoints);
            }
        }

        const totalPoints = method === 'approval' ?
            [...votes.values()].reduce((a, b) => a + b, 0) :
            method === 'borda' ?
                (samplePoints * samplePoints * (candidates.length * (candidates.length - 1) / 2)) :
                samplePoints * samplePoints;

        const results: Record<string, number> = {};
        for (const [id, voteCount] of votes.entries()) {
            results[id] = (voteCount / totalPoints) * 100;
        }

        return {
            votes: Object.fromEntries(votes),
            percentages: results
        };
    }, [candidates, votingMethods, approvalThreshold]);

    const calculateActualVotes = useCallback((method: keyof typeof votingMethods) => {
        if (!hasGeneratedVoters || voters.length === 0) return null;

        const votes = new Map<string, number>();
        candidates.forEach(c => votes.set(c.id, 0));

        if (method === 'irv') {
            let remainingCandidates = [...candidates];
            const allVotes = voters.map(voter =>
                votingMethods[method](voter.x, voter.y)
            );

            while (remainingCandidates.length > 1) {
                const roundVotes = new Map<string, number>();
                remainingCandidates.forEach(c => roundVotes.set(c.id, 0));

                allVotes.forEach(prefs => {
                    const firstChoice = prefs.find(id =>
                        remainingCandidates.some(c => c.id === id)
                    );
                    if (firstChoice) {
                        roundVotes.set(firstChoice, roundVotes.get(firstChoice)! + 1);
                    }
                });

                const majorityNeeded = voters.length / 2;
                const leader = [...roundVotes.entries()].reduce((a, b) =>
                    a[1] > b[1] ? a : b
                );

                if (leader[1] > majorityNeeded) {
                    votes.set(leader[0], leader[1]);
                    break;
                }

                const loser = [...roundVotes.entries()].reduce((a, b) =>
                    a[1] < b[1] ? a : b
                )[0];
                remainingCandidates = remainingCandidates.filter(c => c.id !== loser);
            }

            if (remainingCandidates.length === 1) {
                votes.set(remainingCandidates[0].id, voters.length);
            }
        } else {
            voters.forEach(voter => {
                const voteResult = votingMethods[method](voter.x, voter.y);
                if (method === 'approval') {
                    voteResult.forEach(id => votes.set(id, votes.get(id)! + 1));
                } else if (method === 'borda') {
                    voteResult.forEach((id, index) => {
                        votes.set(id, votes.get(id)! + (candidates.length - 1 - index));
                    });
                } else {
                    votes.set(voteResult[0], votes.get(voteResult[0])! + 1);
                }
            });
        }

        const totalVotes = method === 'approval' ?
            [...votes.values()].reduce((a, b) => a + b, 0) :
            method === 'borda' ?
                (voters.length * (candidates.length * (candidates.length - 1) / 2)) :
                voters.length;

        const results: Record<string, number> = {};
        for (const [id, voteCount] of votes.entries()) {
            results[id] = (voteCount / totalVotes) * 100;
        }

        return {
            votes: Object.fromEntries(votes),
            percentages: results
        };
    }, [candidates, voters, hasGeneratedVoters, votingMethods]);

    useEffect(() => {
        drawVisualization();
    }, [drawVisualization]);



    const handleGenerateVoters = () => {
        const newVoters = generateVoters(voterCount, voterDistribution);
        setVoters(newVoters);
        setHasGeneratedVoters(true);
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

            {hasGeneratedVoters ? (
                <div className="mt-4 space-y-4">
                    {/* Theoretical Area Coverage */}
                    <div className="p-4 bg-gray-50 rounded-lg">
                        <h3 className="font-semibold mb-2">Theoretical Area Coverage</h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                            {Object.entries(methods).map(([method, label]) => {
                                const areaResults = calculateWinningAreas(method);
                                const winner = candidates.find(c =>
                                    c.id === Object.entries(areaResults.percentages)
                                        .reduce((a, b) => a[1] > b[1] ? a : b)[0]
                                );

                                return (
                                    <div key={`area-${method}`} className={`p-3 rounded-lg border ${method === selectedMethod ? 'bg-white border-blue-500' : 'bg-white'}`}>
                                        <div className="font-medium">{label}</div>
                                        <div className="flex items-center gap-2 mt-1">
                                            <div className="w-3 h-3 rounded-full" style={{ backgroundColor: winner?.color }} />
                                            <span>{winner?.name}</span>
                                        </div>
                                        <div className="text-sm text-gray-600">
                                            {areaResults.percentages[winner.id].toFixed(1)}% of map area
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    {/* Actual Voter Results */}
                    <div className="p-4 bg-gray-50 rounded-lg">
                        <h3 className="font-semibold mb-2">Actual Voter Results ({voters.length} voters)</h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                            {Object.entries(methods).map(([method, label]) => {
                                const voterResults = calculateActualVotes(method);
                                const winner = candidates.find(c =>
                                    c.id === Object.entries(voterResults.percentages)
                                        .reduce((a, b) => a[1] > b[1] ? a : b)[0]
                                );

                                return (
                                    <div key={`votes-${method}`} className={`p-3 rounded-lg border ${method === selectedMethod ? 'bg-white border-blue-500' : 'bg-white'}`}>
                                        <div className="font-medium">{label}</div>
                                        <div className="flex items-center gap-2 mt-1">
                                            <div className="w-3 h-3 rounded-full" style={{ backgroundColor: winner?.color }} />
                                            <span>{winner?.name}</span>
                                        </div>
                                        <div className="text-sm text-gray-600">
                                            {voterResults.votes[winner.id]} votes ({voterResults.percentages[winner.id].toFixed(1)}%)
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>
            ) : (
                <div className="mt-4 p-4 bg-gray-100 rounded-lg text-center">
                    <p className="text-gray-600 mb-2">Generate voters to see election results</p>
                    <button
                        onClick={handleGenerateVoters}
                        className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
                    >
                        Generate {voterCount} Voters
                    </button>
                </div>
            )}

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

                        <div>
                            <h3 className="font-semibold mb-2">Voter Settings</h3>
                            <div className="space-y-2">
                                <div className="flex items-center gap-2">
                                    <label>Number of Voters:</label>
                                    <input
                                        type="number"
                                        value={voterCount}
                                        onChange={(e) => setVoterCount(Math.max(1, parseInt(e.target.value) || 0))}
                                        className="px-2 py-1 border rounded w-24"
                                    />
                                    <button
                                        onClick={() => setVoters(generateVoters(voterCount, voterDistribution))}
                                        className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
                                    >
                                        Generate Voters
                                    </button>
                                </div>
                                <div className="flex items-center gap-2">
                                    <label>Distribution:</label>
                                    <select
                                        value={voterDistribution}
                                        onChange={(e) => setVoterDistribution(e.target.value as typeof voterDistribution)}
                                        className="px-2 py-1 border rounded"
                                    >
                                        <option value="uniform">Uniform</option>
                                        <option value="normal">Normal</option>
                                        <option value="clustered">Clustered</option>
                                    </select>
                                </div>
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

export { VotingMethodViz };
