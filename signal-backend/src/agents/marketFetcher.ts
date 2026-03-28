import { differenceInDays, parseISO } from 'date-fns';
import type { EnrichedMarket } from '../types.js';

// Iran/oil domain keywords — targeted fetch, no noise
const IRAN_OIL_KEYWORDS = [
  'Iran', 'Hormuz', 'oil', 'crude', 'Brent', 'WTI', 'barrel',
  'OPEC', 'petroleum', 'gasoline', 'fuel', 'energy emergency',
  'SPR', 'Strategic Petroleum Reserve', 'ceasefire', 'sanctions',
  'refinery', 'tanker', 'strait',
];

function matchesKeyword(title: string): boolean {
  const lower = title.toLowerCase();
  return IRAN_OIL_KEYWORDS.some(kw => lower.includes(kw.toLowerCase()));
}

// ── Polymarket ────────────────────────────────────────────────────────────────

async function fetchPolymarketActive(): Promise<EnrichedMarket[]> {
  const res = await fetch(
    `${process.env.POLYMARKET_GAMMA_BASE}/markets?limit=200&active=true&closed=false`
  );
  if (!res.ok) throw new Error(`Polymarket active fetch failed: ${res.status}`);
  const raw = await res.json() as any[];
  const filtered = raw.filter(m => matchesKeyword(m.question ?? m.title ?? ''));
  return Promise.all(filtered.map(enrichPolymarket));
}

async function fetchPolymarketResolved(): Promise<EnrichedMarket[]> {
  // Resolved markets — useful as historical precedents with known outcomes
  const res = await fetch(
    `${process.env.POLYMARKET_GAMMA_BASE}/markets?limit=200&active=false&closed=true`
  );
  if (!res.ok) return [];
  const raw = await res.json() as any[];
  const filtered = raw.filter(m => matchesKeyword(m.question ?? m.title ?? ''));
  return Promise.all(filtered.map(enrichPolymarket));
}

async function enrichPolymarket(m: any): Promise<EnrichedMarket> {
  const probability      = parseFloat(m.outcomePrices?.[0] ?? '0.5');
  const isResolved       = m.closed === true || m.resolved === true;
  const daysToResolution = m.endDate
    ? differenceInDays(parseISO(m.endDate), new Date()) : (isResolved ? 0 : 999);

  let probHistory: number[]   = [];
  let volumeHistory: number[] = [];
  try {
    // Resolved markets: use fidelity=720 (12h) — finer granularity returns empty for resolved
    const fidelity = isResolved ? 720 : 1440;
    const hist = await fetch(
      `${process.env.POLYMARKET_CLOB_BASE}/prices-history?market=${m.id}&interval=max&fidelity=${fidelity}`
    );
    if (hist.ok) {
      const data = await hist.json() as { history: { t: number; p: number }[] };
      // Downsample to daily if needed
      probHistory   = (data.history ?? []).map(h => h.p);
      volumeHistory = probHistory.map(() => parseFloat(m.volume ?? '0') / Math.max(probHistory.length, 1));
    }
  } catch {}

  return buildEnrichedMarket({
    id:       `poly_${m.id}`,
    title:    m.question ?? m.title ?? '',
    probability,
    volume:   parseFloat(m.volume ?? '0'),
    daysToResolution,
    isResolved,
    outcome:  isResolved ? (m.outcomePrices?.[0] === '1' ? 'yes' : 'no') : undefined,
    source:   'polymarket',
    probHistory,
    volumeHistory,
  });
}

// ── Kalshi ────────────────────────────────────────────────────────────────────

// Kalshi energy series tickers — add more as relevant
const KALSHI_ENERGY_SERIES = ['KXWTI', 'KXBRENT', 'KXOIL', 'KXGAS', 'KXENERGY'];

async function fetchKalshiActive(): Promise<EnrichedMarket[]> {
  const results: EnrichedMarket[] = [];

  for (const series of KALSHI_ENERGY_SERIES) {
    try {
      const res = await fetch(
        `${process.env.KALSHI_API_BASE}/markets?series_ticker=${series}&status=open`,
        { headers: { Authorization: `Bearer ${process.env.KALSHI_API_KEY}` } }
      );
      if (!res.ok) continue;
      const data = await res.json() as { markets: any[] };

      for (const m of (data.markets ?? [])) {
        if (!matchesKeyword(m.title ?? '')) continue;
        const enriched = await enrichKalshi(m, series, false);
        if (enriched) results.push(enriched);
      }
    } catch {}
  }

  return results;
}

async function fetchKalshiHistorical(): Promise<EnrichedMarket[]> {
  // Kalshi historical endpoint — markets settled before the cutoff
  const results: EnrichedMarket[] = [];

  for (const series of KALSHI_ENERGY_SERIES) {
    try {
      const res = await fetch(
        `${process.env.KALSHI_API_BASE}/historical/markets?series_ticker=${series}`,
        { headers: { Authorization: `Bearer ${process.env.KALSHI_API_KEY}` } }
      );
      if (!res.ok) continue;
      const data = await res.json() as { markets: any[] };

      for (const m of (data.markets ?? [])) {
        if (!matchesKeyword(m.title ?? '')) continue;
        const enriched = await enrichKalshi(m, series, true);
        if (enriched) results.push(enriched);
      }
    } catch {}
  }

  return results;
}

async function enrichKalshi(m: any, series: string, isHistorical: boolean): Promise<EnrichedMarket | null> {
  const probability = parseFloat(m.last_price_dollars ?? m.yes_bid_dollars ?? '0.5');
  const isResolved  = m.status === 'settled' || m.result === 'yes' || m.result === 'no';
  const closeTime   = m.close_time ? new Date(m.close_time) : null;
  const daysToResolution = closeTime
    ? differenceInDays(closeTime, new Date()) : (isResolved ? 0 : 999);

  let probHistory: number[] = [];

  try {
    // Candlestick history — 1440 min = 1 day
    const endpoint = isHistorical
      ? `${process.env.KALSHI_API_BASE}/historical/markets/${m.ticker}/candlesticks?period_interval=1440`
      : `${process.env.KALSHI_API_BASE}/series/${series}/markets/${m.ticker}/candlesticks?period_interval=1440`;

    const hist = await fetch(endpoint, {
      headers: { Authorization: `Bearer ${process.env.KALSHI_API_KEY}` }
    });

    if (hist.ok) {
      const data = await hist.json() as { candlesticks: { price: { close_dollars: string } }[] };
      probHistory = (data.candlesticks ?? []).map(c => parseFloat(c.price.close_dollars));
    }
  } catch {}

  const volume = parseFloat(m.volume_fp ?? '0');

  return buildEnrichedMarket({
    id:       `kalshi_${m.ticker}`,
    title:    m.title ?? '',
    probability,
    volume,
    daysToResolution,
    isResolved,
    outcome:  isResolved ? m.result : undefined,
    source:   'kalshi',
    probHistory,
    volumeHistory: probHistory.map(() => volume / Math.max(probHistory.length, 1)),
  });
}

// ── Shared enrichment ─────────────────────────────────────────────────────────

function buildEnrichedMarket(args: {
  id: string; title: string; probability: number; volume: number;
  daysToResolution: number; isResolved: boolean; outcome?: string;
  source: 'polymarket' | 'kalshi';
  probHistory: number[]; volumeHistory: number[];
}): EnrichedMarket {
  const { probHistory } = args;
  const changes = probHistory.slice(1).map((p, i) => Math.abs(p - probHistory[i]));
  const mean    = changes.length ? changes.reduce((s, x) => s + x, 0) / changes.length : 0;
  const historicalVolatility = changes.length
    ? Math.sqrt(changes.reduce((s, x) => s + (x - mean) ** 2, 0) / changes.length) : 0;

  return {
    id:                   args.id,
    title:                args.title,
    probability:          args.probability,
    volume:               args.volume,
    daysToResolution:     args.daysToResolution,
    decayWeight:          computeDecayWeight(args.daysToResolution, args.isResolved),
    historicalVolatility,
    probHistory:          args.probHistory,
    volumeHistory:        args.volumeHistory,
    isResolved:           args.isResolved,
    outcome:              args.outcome as 'yes' | 'no' | undefined,
    source:               args.source,
  };
}

export function computeDecayWeight(days: number, isResolved = false): number {
  // Resolved markets with known outcomes get a fixed weight — useful as ground truth anchors
  if (isResolved) return 0.85;
  if (days <= 0)  return 0;
  if (days <= 14) return 1.0;
  if (days <= 45) return 0.65;
  if (days <= 90) return 0.30;
  return 0.10;
}

// ── Main export ───────────────────────────────────────────────────────────────

export async function fetchAndEnrich(): Promise<EnrichedMarket[]> {
  const [polyActive, polyResolved, kalshiActive, kalshiHistorical] = await Promise.allSettled([
    fetchPolymarketActive(),
    fetchPolymarketResolved(),
    fetchKalshiActive(),
    fetchKalshiHistorical(),
  ]);

  const all: EnrichedMarket[] = [
    ...(polyActive.status       === 'fulfilled' ? polyActive.value       : []),
    ...(polyResolved.status     === 'fulfilled' ? polyResolved.value     : []),
    ...(kalshiActive.status     === 'fulfilled' ? kalshiActive.value     : []),
    ...(kalshiHistorical.status === 'fulfilled' ? kalshiHistorical.value : []),
  ];

  // Deduplicate by title similarity — Polymarket and Kalshi sometimes have the same market
  return deduplicateMarkets(all);
}

function deduplicateMarkets(markets: EnrichedMarket[]): EnrichedMarket[] {
  const seen = new Set<string>();
  return markets.filter(m => {
    const key = m.title.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 40);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export async function loadSnapshot(): Promise<EnrichedMarket[]> {
  const { readFile } = await import('fs/promises');
  const [poly, kalshi] = await Promise.allSettled([
    readFile('./data/polymarket-snapshot.json', 'utf-8').then(JSON.parse),
    readFile('./data/kalshi-snapshot.json', 'utf-8').then(JSON.parse),
  ]);
  return [
    ...(poly.status   === 'fulfilled' ? poly.value   : []),
    ...(kalshi.status === 'fulfilled' ? kalshi.value : []),
  ];
}
