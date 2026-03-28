import type { EnrichedMarket, ScreenedMarket, LagMatrix, LagResult } from '../types.js';

function pearson(a: number[], b: number[]): number {
  const n  = a.length;
  const ma = a.reduce((s, x) => s + x, 0) / n;
  const mb = b.reduce((s, x) => s + x, 0) / n;
  const num = a.reduce((s, x, i) => s + (x - ma) * (b[i] - mb), 0);
  const da  = Math.sqrt(a.reduce((s, x) => s + (x - ma) ** 2, 0));
  const db  = Math.sqrt(b.reduce((s, x) => s + (x - mb) ** 2, 0));
  return (da === 0 || db === 0) ? 0 : num / (da * db);
}

export function screenMarkets(
  markets: EnrichedMarket[],
  excludeIds: string[] = []
): ScreenedMarket[] {
  const eligible = markets.filter(m =>
    !excludeIds.includes(m.id) &&
    m.probHistory.length >= 14 &&
    m.volumeHistory.length > 0
  );

  const maxVol = Math.max(...eligible.map(m =>
    m.volumeHistory.reduce((s, v) => s + v, 0) / (m.volumeHistory.length || 1)
  ), 1);

  return eligible.map(m => {
    const avgVol  = m.volumeHistory.reduce((s, v) => s + v, 0) / m.volumeHistory.length;
    const vwScore = Math.min(1, Math.sqrt(avgVol / maxVol) * Math.abs(m.probability - 0.5) * 2);
    const regime  = detectRegime(m.probHistory);
    return {
      ...m, vwScore,
      regime:          regime.regime,
      transitionDay:   regime.transitionDay,
      stressedSince:   regime.stressedSince,
      passesScreening: vwScore > 0.15 && regime.regime !== 'insufficient_data',
    };
  }).filter(m => m.passesScreening);
}

function detectRegime(history: number[]) {
  if (history.length < 14)
    return { regime: 'insufficient_data' as const, transitionDay: null, stressedSince: null };

  const changes = history.slice(1).map((p, i) => Math.abs(p - history[i]));
  const rolling: number[] = [];
  for (let i = 6; i < changes.length; i++) {
    const w    = changes.slice(i - 6, i + 1);
    const mean = w.reduce((s, x) => s + x, 0) / 7;
    rolling.push(Math.sqrt(w.reduce((s, x) => s + (x - mean) ** 2, 0) / 7));
  }

  const median    = [...rolling].sort((a, b) => a - b)[Math.floor(rolling.length / 2)];
  const threshold = median * 1.5;
  const transIdx  = rolling.findIndex(s => s > threshold);
  const current   = rolling[rolling.length - 1] ?? 0;

  return {
    regime: (current > threshold * 1.5 ? 'stressed' :
             current > threshold        ? 'transitioning' : 'stable') as ScreenedMarket['regime'],
    transitionDay: transIdx >= 0 ? transIdx + 6 : null,
    stressedSince: transIdx >= 0 ? history.length - transIdx - 6 : null,
  };
}

export function buildLagMatrix(markets: EnrichedMarket[]): LagMatrix {
  const pairs: LagResult[]                  = [];
  const leaderCount: Record<string, number> = {};

  for (let i = 0; i < markets.length; i++) {
    for (let j = i + 1; j < markets.length; j++) {
      const a = markets[i].probHistory;
      const b = markets[j].probHistory;
      if (!a || !b || a.length < 14 || b.length < 14) continue;

      const profile: { lag: number; r: number }[] = [];
      for (let lag = -14; lag <= 14; lag++) {
        const as_ = lag >= 0 ? a.slice(0, a.length - lag) : a.slice(-lag);
        const bs_ = lag >= 0 ? b.slice(lag)               : b.slice(0, b.length + lag);
        if (as_.length >= 7) profile.push({ lag, r: pearson(as_, bs_) });
      }

      const best = profile.reduce((x, y) => x.r > y.r ? x : y);
      pairs.push({
        marketIdA: markets[i].id, marketIdB: markets[j].id,
        bestLag: best.lag, bestR: best.r, lagProfile: profile,
      });

      if (best.lag > 0)      leaderCount[markets[i].id] = (leaderCount[markets[i].id] ?? 0) + 1;
      else if (best.lag < 0) leaderCount[markets[j].id] = (leaderCount[markets[j].id] ?? 0) + 1;
    }
  }

  const avgBestR       = pairs.length ? pairs.reduce((s, p) => s + p.bestR, 0) / pairs.length : 0;
  const dominantLeader = Object.keys(leaderCount).length
    ? Object.entries(leaderCount).sort((a, b) => b[1] - a[1])[0][0] : null;

  const summary = pairs.sort((a, b) => b.bestR - a.bestR).slice(0, 3).map(p => {
    const at = markets.find(m => m.id === p.marketIdA)?.title.slice(0, 25) ?? p.marketIdA;
    const bt = markets.find(m => m.id === p.marketIdB)?.title.slice(0, 25) ?? p.marketIdB;
    return p.bestLag > 0 ? `"${at}…" leads "${bt}…" by ${p.bestLag}d (r=${p.bestR.toFixed(2)})`
         : p.bestLag < 0 ? `"${bt}…" leads "${at}…" by ${Math.abs(p.bestLag)}d (r=${p.bestR.toFixed(2)})`
         :                  `"${at}…" and "${bt}…" simultaneous (r=${p.bestR.toFixed(2)})`;
  }).join('. ');

  return { pairs, dominantLeader, avgBestR, propagationSummary: summary };
}

export function validateCluster(
  cluster: ScreenedMarket[],
  lagMatrix: LagMatrix
): { pairs: { ids: [string, string]; r: number; lag: number }[]; avgR: number; passed: boolean } {
  const pairs = [];

  for (let i = 0; i < cluster.length; i++) {
    for (let j = i + 1; j < cluster.length; j++) {
      const entry = lagMatrix.pairs.find(p =>
        (p.marketIdA === cluster[i].id && p.marketIdB === cluster[j].id) ||
        (p.marketIdA === cluster[j].id && p.marketIdB === cluster[i].id)
      );
      const lag = entry?.bestLag ?? 0;
      const a   = cluster[i].probHistory;
      const b   = cluster[j].probHistory;
      if (!a || !b) continue;
      const as_ = lag >= 0 ? a.slice(0, a.length - lag) : a.slice(-lag);
      const bs_ = lag >= 0 ? b.slice(lag)               : b.slice(0, b.length + lag);
      if (as_.length >= 7)
        pairs.push({ ids: [cluster[i].id, cluster[j].id] as [string, string], r: pearson(as_, bs_), lag });
    }
  }

  const avgR = pairs.length ? pairs.reduce((s, p) => s + p.r, 0) / pairs.length : 0;
  return { pairs, avgR, passed: pairs.length > 0 && pairs.every(p => p.r >= 0.50) };
}
