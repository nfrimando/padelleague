import { computeV3ExpectedWinProbability } from "@/lib/ratings/v3/calculate";

export type DuelCandidate = { id: string; rating: number };

export type FairDuelResult = {
  t1p2: string; // your partner
  t2p1: string; // opponent
  t2p2: string; // opponent
  ewp: number; // expected win probability for your team (you + partner)
};

// "Me + random-among-fair": you (`me`) are always locked into team 1. From the
// candidate pool we take the players nearest you by rating (to bound the search),
// enumerate every 3-player foursome and the three me-fixed team splits, score each
// by how close its expected win probability is to 50/50, keep the K fairest, and
// pick one at random — so re-running yields different, still-fair matchups.
export function generateFairDuel(
  me: DuelCandidate,
  candidates: DuelCandidate[],
  opts?: { nearestCount?: number; topK?: number },
): FairDuelResult | null {
  const nearestCount = opts?.nearestCount ?? 20;
  const topK = opts?.topK ?? 12;

  const others = candidates.filter((c) => c.id !== me.id);
  if (others.length < 3) return null;

  const nearest = [...others]
    .sort(
      (a, b) =>
        Math.abs(a.rating - me.rating) - Math.abs(b.rating - me.rating),
    )
    .slice(0, nearestCount);

  type Option = FairDuelResult & { fairness: number };
  const options: Option[] = [];

  for (let i = 0; i < nearest.length; i++) {
    for (let j = i + 1; j < nearest.length; j++) {
      for (let k = j + 1; k < nearest.length; k++) {
        const trio = [nearest[i], nearest[j], nearest[k]];
        // Three ways to choose your partner; the remaining two are opponents.
        for (let p = 0; p < 3; p++) {
          const partner = trio[p];
          const opps = trio.filter((_, idx) => idx !== p);
          const [ewp1] = computeV3ExpectedWinProbability(
            (me.rating + partner.rating) / 2,
            (opps[0].rating + opps[1].rating) / 2,
          );
          options.push({
            t1p2: partner.id,
            t2p1: opps[0].id,
            t2p2: opps[1].id,
            ewp: ewp1,
            fairness: Math.abs(ewp1 - 0.5),
          });
        }
      }
    }
  }

  if (options.length === 0) return null;

  options.sort((a, b) => a.fairness - b.fairness);
  const top = options.slice(0, Math.min(topK, options.length));
  const chosen = top[Math.floor(Math.random() * top.length)];
  return { t1p2: chosen.t1p2, t2p1: chosen.t2p1, t2p2: chosen.t2p2, ewp: chosen.ewp };
}
