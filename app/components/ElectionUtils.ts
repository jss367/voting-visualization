import type { Candidate } from './types';
import { getVoterPreference } from './votingMethods';

type Point = Pick<Candidate, 'x' | 'y'>;
export type VotingMethod = 'plurality' | 'approval' | 'irv';
export type Winners = Record<VotingMethod, string | null>;

export const DEFAULT_APPROVAL_THRESHOLD = 0.3;

export function getWeight(dist: number, radius: number): number {
    if (dist >= radius) return 0;
    return 0.5 * (1 + Math.cos(Math.PI * dist / radius));
}

// Midpoints of five equal-probability bands of a standard normal distribution.
// Their Cartesian product gives 25 equally weighted, repeatable voter positions.
const quantiles = [-1.28155, -0.52440, 0, 0.52440, 1.28155];
const spread = 0.15;
const offsets = quantiles.flatMap(x => quantiles.map(y => ({ x: x * spread, y: y * spread })));

export function electorateAt(x: number, y: number): Point[] {
    return offsets.map(offset => ({
        x: Math.max(0, Math.min(1, x + offset.x)),
        y: Math.max(0, Math.min(1, y + offset.y)),
    }));
}

// Counts are in candidate ID order. On a tie the lower ID takes precedence.
function leader(counts: Map<string, number>): string | null {
    let winner = null;
    let highest = 0;
    for (const [id, count] of counts) {
        if (count > highest) {
            winner = id;
            highest = count;
        }
    }
    return winner;
}

export function runElection(
    voters: Point[],
    candidates: Candidate[],
    approvalThreshold = DEFAULT_APPROVAL_THRESHOLD
): Winners {
    if (!candidates.length) throw new Error('No candidates provided');
    const ordered = [...candidates].sort((a, b) => a.id.localeCompare(b.id, 'en', { numeric: true }));
    const firstChoices = new Map(ordered.map(c => [c.id, 0]));
    const approvals = new Map(firstChoices);
    const ballots = voters.map(voter => {
        const preferences = getVoterPreference(voter.x, voter.y, ordered);
        const first = preferences[0].id;
        firstChoices.set(first, firstChoices.get(first)! + 1);
        for (const { id, dist } of preferences) {
            // Every positive approval counts as one ballot mark.
            if (getWeight(dist, approvalThreshold) > 0) approvals.set(id, approvals.get(id)! + 1);
        }
        return preferences.map(p => p.id);
    });

    const plurality = leader(firstChoices);
    let counts = firstChoices;
    let irv = plurality;
    while (irv !== null && counts.get(irv)! <= ballots.length / 2 && counts.size > 1) {
        let lowest = Infinity;
        let eliminated = irv;
        for (const [id, count] of counts) {
            if (count <= lowest) {
                lowest = count;
                eliminated = id;
            }
        }
        counts = new Map(counts);
        counts.delete(eliminated);
        for (const id of counts.keys()) counts.set(id, 0);
        for (const ballot of ballots) {
            const next = ballot.find(id => counts.has(id))!;
            counts.set(next, counts.get(next)! + 1);
        }
        irv = leader(counts);
    }
    return { plurality, approval: leader(approvals), irv };
}
