import { Candidate } from './types';

// Constants
export const methods = {
    plurality: 'Plurality',
    approval: 'Approval',
    borda: 'Borda Count',
    irv: 'Instant Runoff'
};

export const methodDescriptions = {
    plurality: "Each voter chooses their closest candidate. The candidate with the most votes wins.",
    approval: "Voters 'approve' all candidates within a certain distance. The most approved candidate wins.",
    borda: "Voters rank candidates by distance. Each rank gives points (n-1 for 1st, n-2 for 2nd, etc.). Highest points wins.",
    irv: "Voters rank by distance. If no majority, eliminate last place and retry with remaining candidates."
};

// Utility functions
export const distance = (x1: number, y1: number, x2: number, y2: number): number =>
    Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);

export const getVoterPreference = (
    voterX: number, 
    voterY: number, 
    candidates: Candidate[]
) => {
    return candidates
        .map((candidate) => ({
            id: candidate.id,
            dist: distance(voterX, voterY, candidate.x, candidate.y)
        }))
        .sort((a, b) => a.dist - b.dist);
};

// Voting method implementations
export const votingMethods = {
    plurality: (voterX: number, voterY: number, candidates: Candidate[]) => {
        return [getVoterPreference(voterX, voterY, candidates)[0].id];
    },

    approval: (voterX: number, voterY: number, candidates: Candidate[], approvalThreshold: number) => {
        const prefs = getVoterPreference(voterX, voterY, candidates);
        const approvedCandidates = prefs.filter(p => p.dist <= approvalThreshold);
        return approvedCandidates.length > 0 ? approvedCandidates.map(c => c.id) : [prefs[0].id];
    },

    borda: (voterX: number, voterY: number, candidates: Candidate[]) => {
        const prefs = getVoterPreference(voterX, voterY, candidates);
        const points = new Map<string, number>();

        prefs.forEach((p, i) => {
            points.set(p.id, (candidates.length - 1 - i));
        });

        return [...points.entries()]
            .sort((a, b) => b[1] - a[1])
            .map(([id]) => id);
    },

    irv: (voterX: number, voterY: number, candidates: Candidate[]) => {
        return getVoterPreference(voterX, voterY, candidates).map(p => p.id);
    }
};

// // Election running functions
// export const runPluralityElection = (
//     voters: Voter[], 
//     candidates: Candidate[]
// ): ElectionResult => {
//     const votes: Record<string, number> = {};
//     candidates.forEach(c => votes[c.id] = 0);

//     voters.forEach(voter => {
//         const pref = getVoterPreference(voter.x, voter.y, candidates);
//         votes[pref[0].id]++;
//     });

//     const winnerId = Object.entries(votes)
//         .reduce((a, b) => a[1] > b[1] ? a : b)[0];

//     return {
//         winnerId,
//         votes,
//         roundDetails: [`Total votes: ${voters.length}`]
//     };
// };

// export const runApprovalElection = (
//     voters: Voter[], 
//     candidates: Candidate[],
//     approvalThreshold: number
// ): ElectionResult => {
//     const votes: Record<string, number> = {};
//     candidates.forEach(c => votes[c.id] = 0);

//     voters.forEach(voter => {
//         const prefs = getVoterPreference(voter.x, voter.y, candidates);
//         prefs.forEach(p => {
//             if (p.dist <= approvalThreshold) {
//                 votes[p.id]++;
//             }
//         });
//     });

//     const winnerId = Object.entries(votes)
//         .reduce((a, b) => a[1] > b[1] ? a : b)[0];

//     return {
//         winnerId,
//         votes,
//         roundDetails: [`Average approvals per voter: ${(Object.values(votes).reduce((a, b) => a + b, 0) / voters.length).toFixed(2)}`]
//     };
// };

// export const runBordaElection = (
//     voters: Voter[], 
//     candidates: Candidate[]
// ): ElectionResult => {
//     const votes: Record<string, number> = {};
//     candidates.forEach(c => votes[c.id] = 0);

//     voters.forEach(voter => {
//         const prefs = getVoterPreference(voter.x, voter.y, candidates);
//         prefs.forEach((p, i) => {
//             votes[p.id] += candidates.length - 1 - i;
//         });
//     });

//     const winnerId = Object.entries(votes)
//         .reduce((a, b) => a[1] > b[1] ? a : b)[0];

//     return {
//         winnerId,
//         votes,
//         roundDetails: [`Total Borda points: ${Object.values(votes).reduce((a, b) => a + b, 0)}`]
//     };
// };

// export const runIRVElection = (
//     voters: Voter[], 
//     candidates: Candidate[]
// ): ElectionResult => {
//     let remainingCandidates = [...candidates];
//     const roundDetails: string[] = [];
//     const eliminated: string[] = [];

//     while (remainingCandidates.length > 1) {
//         const roundVotes: Record<string, number> = {};
//         remainingCandidates.forEach(c => roundVotes[c.id] = 0);

//         voters.forEach(voter => {
//             const prefs = getVoterPreference(voter.x, voter.y, candidates)
//                 .filter(p => remainingCandidates.some(c => c.id === p.id));
//             roundVotes[prefs[0].id]++;
//         });

//         const majorityNeeded = voters.length / 2;
//         const leader = Object.entries(roundVotes)
//             .reduce((a, b) => a[1] > b[1] ? a : b);

//         if (leader[1] > majorityNeeded) {
//             return {
//                 winnerId: leader[0],
//                 votes: roundVotes,
//                 roundDetails: [...roundDetails, `Final round: ${leader[0]} wins with ${leader[1]} votes`],
//                 eliminated
//             };
//         }

//         const loser = Object.entries(roundVotes)
//             .reduce((a, b) => a[1] < b[1] ? a : b);
//         remainingCandidates = remainingCandidates.filter(c => c.id !== loser[0]);
//         eliminated.push(loser[0]);

//         roundDetails.push(
//             `Round ${roundDetails.length + 1}: ${candidates.find(c => c.id === loser[0])?.name} eliminated with ${loser[1]} votes`
//         );
//     }

//     return {
//         winnerId: remainingCandidates[0].id,
//         votes: { [remainingCandidates[0].id]: voters.length },
//         roundDetails,
//         eliminated
//     };
// };
