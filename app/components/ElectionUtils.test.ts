import { describe, expect, test } from 'vitest';
import { electorateAt, getWeight, runElection } from './ElectionUtils';

const candidates = [0, 0.6, 0.9].map((x, i) => ({
    id: String(i + 1), x, y: 0.5, name: String(i + 1), color: '#ffffff',
}));
const votersAt = (x: number, count = 1) => Array.from({ length: count }, () => ({ x, y: 0.5 }));

describe('comparison elections', () => {
    test('preserves the cosine midpoint and cutoff', () => {
        expect(getWeight(0, 0.3)).toBe(1);
        expect(getWeight(0.15, 0.3)).toBeCloseTo(0.5);
        expect(getWeight(0.3, 0.3)).toBe(0);
        expect(getWeight(0.4, 0.3)).toBe(0);
    });

    test('transfers second choices to defeat the plurality leader', () => {
        // First choices 4–3–2. Both voters for candidate 3 rank 2 next.
        const voters = [...votersAt(0, 4), ...votersAt(0.6, 3), ...votersAt(0.9, 2)];
        expect(runElection(voters, candidates, 0.31)).toEqual({
            plurality: '1', approval: '2', irv: '2',
        });
    });

    test('counts multiple approvals on a ballot', () => {
        const voters = [...votersAt(0.29, 3), ...votersAt(0.7, 2)];
        expect(runElection(voters, candidates, 0.32).approval).toBe('2');
    });

    test('no approvals stays neutral when the candidate order changes', () => {
        for (const order of [candidates, [...candidates].reverse()]) {
            expect(runElection(votersAt(0.4), order, 0.1)).toEqual({
                plurality: '2', irv: '2', approval: null,
            });
        }
    });

    test('breaks ballot and tally ties consistently by candidate ID', () => {
        const pair = [candidates[0], { ...candidates[1], x: 1 }];
        for (const order of [pair, [...pair].reverse()]) {
            expect(runElection(votersAt(0.5), order, 1)).toEqual({ plurality: '1', approval: '1', irv: '1' });
            expect(runElection([...votersAt(0), ...votersAt(1)], order).irv).toBe('1');
        }
    });

    test('handles empty electorates, empty fields and unapproved sole candidates', () => {
        expect(runElection([], candidates)).toEqual({ plurality: null, approval: null, irv: null });
        expect(() => runElection([], [])).toThrow('No candidates provided');
        expect(runElection(votersAt(1), [candidates[0]])).toEqual({ plurality: '1', approval: null, irv: '1' });
    });

    test('reuses a symmetric electorate and keeps edge voters on the map', () => {
        const voters = electorateAt(0.5, 0.5);
        expect(voters).toHaveLength(25);
        expect(voters).toEqual(electorateAt(0.5, 0.5));
        expect(voters.reduce((sum, v) => sum + v.x, 0) / voters.length).toBeCloseTo(0.5);
        expect(electorateAt(0, 1).every(v => v.x >= 0 && v.y <= 1)).toBe(true);
    });
});
