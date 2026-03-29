import { differenceInDays, parseISO } from 'date-fns';
import { kalshiHeaders } from '../kalshiAuth.js';
import { callK2Think, parseK2Json } from '../k2think.js';
import type { EnrichedMarket } from '../types.js';
import type { SearchStrategy } from './searchStrategy.js';
import type { DomainConfig } from '../domains.js';

// ── Stage 1: Fetch event candidates (titles + volume only, no price history) ──

interface EventCandidate {
  id:      string;
  title:   string;
  volume:  number;
  markets: any[];
}

async function fetchEventCandidates(
  active: boolean,
  minVolume: number,
): Promise<EventCandidate[]> {
  const results: EventCandidate[] = [];
  const limit  = 100;
  const status = active ? 'active=true&closed=false' : 'active=false&closed=true';

  for (let page = 0; page < 5; page++) {
    const res = await fetch(
      `${process.env.POLYMARKET_GAMMA_BASE}/events?${status}&limit=${limit}&offset=${page * limit}&order=volume&ascending=false`
    );
    if (!res.ok) break;
    const batch = await res.json() as any[];
    if (!batch.length) break;

    for (const event of batch) {
      results.push({
        id:      String(event.id ?? event.slug ?? ''),
        title:   event.title ?? event.slug ?? '',
        volume:  parseFloat(event.volume ?? '0'),
        markets: event.markets ?? [],
      });
    }

    // Events are sorted by volume desc — stop once we're below the floor
    const lastVol = parseFloat(batch[batch.length - 1]?.volume ?? '0');
    if (lastVol < minVolume) break;
    if (batch.length < limit) break;
  }

  return results.filter(e => e.volume >= minVolume);
}

// ── Stage 2: K2 picks which events are relevant ───────────────────────────────

interface RelevanceResult {
  relevantIds:   string[];  // active events in the causal chain
  historicalIds: string[];  // resolved events useful as precedents
  reasoning:     string;
}

async function filterByRelevance(
  candidates: EventCandidate[],
  domain: DomainConfig,
): Promise<RelevanceResult> {
  if (!candidates.length) {
    return { relevantIds: [], historicalIds: [], reasoning: 'no candidates' };
  }

  try {
    const raw = await callK2Think(`
You are filtering Polymarket events for relevance to a specific domain.

Domain: ${domain.name}
Context: ${domain.context}
Causal chain: ${domain.causalChainDescription}

Below are Polymarket events sorted by trading volume. For each, decide:

RELEVANT — active events directly in this domain's causal chain right now
HISTORICAL — resolved events that are strong historical precedents for this exact scenario
  (past oil crises, past sanctions regimes, past Hormuz incidents, past SPR releases, etc.)
  These are valuable even if old — they serve as ground truth for the analysis.
REJECT — anything not meaningfully connected (sports, entertainment, AI releases, elections, crypto, etc.)

Be strict on REJECT. If the connection to ${domain.name} is tenuous, reject it.

CANDIDATES (id | title | volume):
${candidates.map(e => `${e.id} | ${e.title} | $${Math.round(e.volume).toLocaleString()}`).join('\n')}

Return ONLY valid JSON:
{
  "relevantIds": ["id1", "id2"],
  "historicalIds": ["id3", "id4"],
  "reasoning": "one sentence on what was kept and why"
}
`.trim(), 'low');
    return parseK2Json<RelevanceResult>(raw);
  } catch (err) {
    console.error('[Polymarket] K2 filter error:', String(err).slice(0, 300));
    return { relevantIds: [], historicalIds: [], reasoning: 'error' };
  }
}

// ── Stage 3: Enrich only approved markets (fetch price history) ───────────────

async function enrichPolymarket(m: any): Promise<EnrichedMarket> {
  const outcomePrices = typeof m.outcomePrices === 'string'
    ? JSON.parse(m.outcomePrices) : (m.outcomePrices ?? []);
  const probability      = parseFloat(outcomePrices[0] ?? '0.5');
  const isResolved       = m.closed === true || m.resolved === true;
  const daysToResolution = m.endDate
    ? differenceInDays(parseISO(m.endDate), new Date()) : (isResolved ? 0 : 999);

  let probHistory: number[]   = [];
  let volumeHistory: number[] = [];
  try {
    const tokenIds = typeof m.clobTokenIds === 'string'
      ? JSON.parse(m.clobTokenIds) : (m.clobTokenIds ?? []);
    const tokenId  = tokenIds[0] ?? m.conditionId ?? m.id;
    const fidelity = isResolved ? 720 : 1440;

    const hist = await fetch(
      `${process.env.POLYMARKET_CLOB_BASE}/prices-history?market=${tokenId}&interval=max&fidelity=${fidelity}`
    );
    if (hist.ok) {
      const data = await hist.json() as { history: { t: number; p: number }[] };
      probHistory   = (data.history ?? []).map(h => h.p);
      volumeHistory = probHistory.map(
        () => parseFloat(m.volume ?? '0') / Math.max(probHistory.length, 1)
      );
    }
  } catch {}

  return buildEnrichedMarket({
    id:        `poly_${m.conditionId ?? m.id}`,
    title:     m.question ?? m.title ?? '',
    probability,
    volume:    parseFloat(m.volume ?? '0'),
    daysToResolution,
    isResolved,
    outcome:   isResolved ? (outcomePrices[0] === '1' ? 'yes' : 'no') : undefined,
    source:    'polymarket',
    probHistory,
    volumeHistory,
  });
}

async function fetchPolymarket(
  strategy: SearchStrategy,
  domain: DomainConfig,
): Promise<EnrichedMarket[]> {
  // Stage 1 — collect event titles from active + resolved in parallel
  const [activeCandidates, resolvedCandidates] = await Promise.all([
    fetchEventCandidates(true,  strategy.minVolume),
    fetchEventCandidates(false, strategy.minVolume),
  ]);
  const allCandidates = [...activeCandidates, ...resolvedCandidates];

  // Cap at top 200 by volume before sending to K2 (context limit)
  const topCandidates = allCandidates.slice(0, 200);
  console.log(`[Polymarket] ${allCandidates.length} candidates → trimmed to top ${topCandidates.length} → sending to K2 for relevance filter`);

  // Stage 2 — K2 decides what's relevant
  const relevance = await filterByRelevance(topCandidates, domain);
  const keptCount = relevance.relevantIds.length + relevance.historicalIds.length;
  console.log(`[Polymarket] K2 kept ${keptCount} events: ${relevance.reasoning}`);

  // K2 may return IDs as numbers or strings — normalise both sides to string
  const keptIds   = new Set([...relevance.relevantIds, ...relevance.historicalIds].map(String));
  const keptEvents = allCandidates.filter(e => keptIds.has(String(e.id)));

  // Stage 3 — fetch price history only for approved markets
  const markets = keptEvents.flatMap(e => e.markets);
  console.log(`[Polymarket] Enriching ${markets.length} markets with price history`);
  return Promise.all(markets.map(enrichPolymarket));
}

// ── Kalshi ────────────────────────────────────────────────────────────────────
// Series tickers are already domain-specific — KXWTI only has WTI markets, etc.
// No AI filtering needed here.

async function fetchKalshiActive(strategy: SearchStrategy): Promise<EnrichedMarket[]> {
  const results: EnrichedMarket[] = [];
  for (const series of strategy.kalshiSeries) {
    try {
      const path = `/trade-api/v2/markets?series_ticker=${series}&status=open`;
      const res  = await fetch(
        `${process.env.KALSHI_API_BASE}/markets?series_ticker=${series}&status=open`,
        { headers: kalshiHeaders('GET', path) }
      );
      if (!res.ok) continue;
      const data = await res.json() as { markets: any[] };
      for (const m of (data.markets ?? [])) {
        const enriched = await enrichKalshi(m, series, false);
        if (enriched) results.push(enriched);
      }
    } catch {}
  }
  return results;
}

async function fetchKalshiHistorical(strategy: SearchStrategy): Promise<EnrichedMarket[]> {
  const results: EnrichedMarket[] = [];
  for (const series of strategy.kalshiSeries) {
    try {
      const path = `/trade-api/v2/historical/markets?series_ticker=${series}`;
      const res  = await fetch(
        `${process.env.KALSHI_API_BASE}/historical/markets?series_ticker=${series}`,
        { headers: kalshiHeaders('GET', path) }
      );
      if (!res.ok) continue;
      const data = await res.json() as { markets: any[] };
      for (const m of (data.markets ?? [])) {
        const enriched = await enrichKalshi(m, series, true);
        if (enriched) results.push(enriched);
      }
    } catch {}
  }
  return results;
}

const KALSHI_ENERGY_TERMS = /oil|gas|energy|wti|brent|crude|barrel|opec|lng|ngl|fuel|gasoline|diesel|petroleum|spr|strategic.?petroleum|iran|hormuz|sanction/i;

async function enrichKalshi(m: any, series: string, isHistorical: boolean): Promise<EnrichedMarket | null> {
  const title = m.title ?? '';
  if (!KALSHI_ENERGY_TERMS.test(title)) return null;

  const probability      = parseFloat(m.last_price_dollars ?? m.yes_bid_dollars ?? '0.5');
  const isResolved       = m.status === 'settled' || m.result === 'yes' || m.result === 'no';
  const closeTime        = m.close_time ? new Date(m.close_time) : null;
  const daysToResolution = closeTime
    ? differenceInDays(closeTime, new Date()) : (isResolved ? 0 : 999);

  let probHistory: number[] = [];
  try {
    const endpoint = isHistorical
      ? `${process.env.KALSHI_API_BASE}/historical/markets/${m.ticker}/candlesticks?period_interval=1440`
      : `${process.env.KALSHI_API_BASE}/series/${series}/markets/${m.ticker}/candlesticks?period_interval=1440`;
    const candlePath = isHistorical
      ? `/trade-api/v2/historical/markets/${m.ticker}/candlesticks?period_interval=1440`
      : `/trade-api/v2/series/${series}/markets/${m.ticker}/candlesticks?period_interval=1440`;

    const hist = await fetch(endpoint, { headers: kalshiHeaders('GET', candlePath) });
    if (hist.ok) {
      const data = await hist.json() as { candlesticks: { price: { close_dollars: string } }[] };
      probHistory = (data.candlesticks ?? []).map(c => parseFloat(c.price.close_dollars));
    }
  } catch {}

  const volume = parseFloat(m.volume_fp ?? '0');
  return buildEnrichedMarket({
    id:        `kalshi_${m.ticker}`,
    title:     m.title ?? '',
    probability,
    volume,
    daysToResolution,
    isResolved,
    outcome:   isResolved ? m.result : undefined,
    source:    'kalshi',
    probHistory,
    volumeHistory: probHistory.map(() => volume / Math.max(probHistory.length, 1)),
  });
}

// ── Shared ────────────────────────────────────────────────────────────────────

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
  if (isResolved) return 0.85;
  if (days <= 0)  return 0;
  if (days <= 14) return 1.0;
  if (days <= 45) return 0.65;
  if (days <= 90) return 0.30;
  return 0.10;
}

// ── Main exports ──────────────────────────────────────────────────────────────

export async function fetchAndEnrich(
  strategy: SearchStrategy,
  domain: DomainConfig,
): Promise<EnrichedMarket[]> {
  const [polyMarkets, kalshiActive, kalshiHistorical] = await Promise.allSettled([
    fetchPolymarket(strategy, domain),
    fetchKalshiActive(strategy),
    fetchKalshiHistorical(strategy),
  ]);

  const all: EnrichedMarket[] = [
    ...(polyMarkets.status      === 'fulfilled' ? polyMarkets.value      : []),
    ...(kalshiActive.status     === 'fulfilled' ? kalshiActive.value     : []),
    ...(kalshiHistorical.status === 'fulfilled' ? kalshiHistorical.value : []),
  ];

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
