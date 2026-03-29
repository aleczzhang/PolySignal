import { differenceInDays, parseISO } from 'date-fns';
import { kalshiHeaders } from '../kalshiAuth.js';
import { callK2Think, parseK2Json } from '../k2think.js';
import type { EnrichedMarket } from '../types.js';
import type { SearchStrategy } from './searchStrategy.js';
import type { DomainConfig } from '../domains.js';

// Minimum volume floor — only excludes markets with essentially zero trading activity.
// K2 makes all real relevance decisions; this just avoids sending empty markets to K2.
const MIN_MARKET_VOLUME = 1_000;

// K2 reliably returns valid JSON up to ~120 items per call.
// We batch candidates into groups of this size and run batches in parallel,
// so K2 sees the full dataset across batches rather than a truncated top-N.
const K2_BATCH_SIZE = 120;

// ── Stage 1: Fetch event candidates (titles + volume only, no price history) ──

interface EventCandidate {
  id:      string;
  title:   string;
  volume:  number;
  markets: any[];
}

async function fetchEventCandidates(active: boolean): Promise<EventCandidate[]> {
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
      const volume = parseFloat(event.volume ?? '0');
      if (volume < MIN_MARKET_VOLUME) continue;
      results.push({
        id:      String(event.id ?? event.slug ?? ''),
        title:   event.title ?? event.slug ?? '',
        volume,
        markets: event.markets ?? [],
      });
    }

    // Events are sorted by volume desc — once we're below the noise floor, stop paginating
    const lastVol = parseFloat(batch[batch.length - 1]?.volume ?? '0');
    if (lastVol < MIN_MARKET_VOLUME) break;
    if (batch.length < limit) break;
  }

  return results;
}

// ── Stage 2: K2 picks which events are relevant ───────────────────────────────

interface RelevanceResult {
  relevantIds:   string[];
  historicalIds: string[];
  reasoning:     string;
}

// Filter a single batch (≤ K2_BATCH_SIZE items) through K2.
async function filterBatch(
  batch: EventCandidate[],
  domain: DomainConfig,
  source: string,
  batchIndex: number,
  totalBatches: number,
): Promise<RelevanceResult> {
  try {
    const batchNote = totalBatches > 1
      ? ` (batch ${batchIndex + 1} of ${totalBatches} — evaluate these on their own merit)`
      : '';
    const raw = await callK2Think(`
You are filtering ${source} prediction market events for relevance to a specific domain.${batchNote}

Domain: ${domain.name}
Context: ${domain.context}
Causal chain: ${domain.causalChainDescription}

For each candidate below, decide:

RELEVANT — keep if the event is meaningfully connected to this domain. This includes:
  • Direct trigger events (e.g., sanctions, military actions, diplomatic decisions)
  • Downstream commodity/price markets (e.g., "Will WTI settle above $X?" — oil price IS the signal)
  • Policy response markets (e.g., SPR release, rate decisions related to the shock)
  • Any market whose resolution depends on how this domain plays out

HISTORICAL — resolved events that are useful precedents for this exact type of scenario

REJECT — clearly unrelated: sports, entertainment, elections (unless domain is elections),
  crypto (unless domain is crypto), or markets with no plausible connection to ${domain.name}

When in doubt about a commodity/price market, keep it — price-level markets are often the
best quantitative signal even if they don't mention the causal trigger explicitly.

CANDIDATES (id | title | volume):
${batch.map(e => `${e.id} | ${e.title} | $${Math.round(e.volume).toLocaleString()}`).join('\n')}

Return ONLY valid JSON with no explanation:
{
  "relevantIds": ["id1", "id2"],
  "historicalIds": ["id3", "id4"],
  "reasoning": "one sentence on what was kept and why"
}
`.trim(), 'low');
    return parseK2Json<RelevanceResult>(raw);
  } catch (err) {
    console.error(`[${source}] K2 batch ${batchIndex + 1} error:`, String(err).slice(0, 300));
    return { relevantIds: [], historicalIds: [], reasoning: 'error' };
  }
}

// Split candidates into batches and run all K2 filter calls in parallel.
async function filterByRelevance(
  candidates: EventCandidate[],
  domain: DomainConfig,
  source: string,
): Promise<{ relevantIds: string[]; historicalIds: string[]; reasoning: string[] }> {
  if (!candidates.length) return { relevantIds: [], historicalIds: [], reasoning: [] };

  const batches: EventCandidate[][] = [];
  for (let i = 0; i < candidates.length; i += K2_BATCH_SIZE) {
    batches.push(candidates.slice(i, i + K2_BATCH_SIZE));
  }

  const results = await Promise.all(
    batches.map((batch, i) => filterBatch(batch, domain, source, i, batches.length))
  );

  return {
    relevantIds:   results.flatMap(r => r.relevantIds),
    historicalIds: results.flatMap(r => r.historicalIds),
    reasoning:     results.map(r => r.reasoning).filter(Boolean),
  };
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

export async function fetchPolymarket(
  strategy: SearchStrategy,
  domain: DomainConfig,
): Promise<EnrichedMarket[]> {
  // Stage 1 — collect event stubs from active + resolved in parallel (no price history yet)
  const [activeCandidates, resolvedCandidates] = await Promise.all([
    fetchEventCandidates(true),
    fetchEventCandidates(false),
  ]);
  const allCandidates = [...activeCandidates, ...resolvedCandidates];

  const batchCount = Math.ceil(allCandidates.length / K2_BATCH_SIZE);
  console.log(`[Polymarket] ${allCandidates.length} candidates → K2 relevance filter (${batchCount} batch${batchCount !== 1 ? 'es' : ''} in parallel)`);

  // Stage 2 — K2 relevance filter across parallel batches
  const relevance  = await filterByRelevance(allCandidates, domain, 'Polymarket');
  const keptCount  = relevance.relevantIds.length + relevance.historicalIds.length;
  console.log(`[Polymarket] K2 kept ${keptCount} events. Reasoning: ${relevance.reasoning.join(' | ')}`);

  // K2 may return IDs as numbers or strings — normalise both sides to string
  const keptIds   = new Set([...relevance.relevantIds, ...relevance.historicalIds].map(String));
  const keptEvents = allCandidates.filter(e => keptIds.has(String(e.id)));

  // Stage 3 — fetch price history only for approved markets
  const markets = keptEvents.flatMap(e => e.markets);
  console.log(`[Polymarket] Enriching ${markets.length} markets with price history`);
  return Promise.all(markets.map(enrichPolymarket));
}

// ── Kalshi ────────────────────────────────────────────────────────────────────
// Mirrors the Polymarket 3-stage process:
// Stage 1: collect all market stubs (title + ticker + volume) from series tickers
// Stage 2: K2 relevance filter — same filterByRelevance function
// Stage 3: enrich only approved markets with candlestick history

interface KalshiCandidate {
  ticker:      string;
  title:       string;
  volume:      number;
  series:      string;
  isHistorical: boolean;
  raw:         any;
}

// Series-specific Kalshi fetch — one request per series for active and historical.
// Kalshi's historical endpoint ignores series_ticker when limit/cursor params are added
// (API quirk), so we use simple single-request queries per series. K2 filters for relevance.
async function collectKalshiCandidates(strategy: SearchStrategy): Promise<KalshiCandidate[]> {
  const candidates: KalshiCandidate[] = [];

  const activeResults = await Promise.allSettled(
    strategy.kalshiSeries.map(async series => {
      const path = `/trade-api/v2/markets?series_ticker=${series}&status=open`;
      const res  = await fetch(
        `${process.env.KALSHI_API_BASE}/markets?series_ticker=${series}&status=open`,
        { headers: kalshiHeaders('GET', path) }
      );
      if (!res.ok) return;
      const data = await res.json() as { markets: any[] };
      for (const m of (data.markets ?? [])) {
        if (!m.title) continue;
        const volume = parseFloat(m.volume_fp ?? '0');
        if (volume < MIN_MARKET_VOLUME) continue;
        candidates.push({ ticker: m.ticker, title: m.title, volume, series, isHistorical: false, raw: m });
      }
    })
  );

  const histResults = await Promise.allSettled(
    strategy.kalshiSeries.map(async series => {
      const path = `/trade-api/v2/historical/markets?series_ticker=${series}`;
      const res  = await fetch(
        `${process.env.KALSHI_API_BASE}/historical/markets?series_ticker=${series}`,
        { headers: kalshiHeaders('GET', path) }
      );
      if (!res.ok) return;
      const data = await res.json() as { markets: any[] };
      for (const m of (data.markets ?? [])) {
        if (!m.title) continue;
        const volume = parseFloat(m.volume_fp ?? '0');
        if (volume < MIN_MARKET_VOLUME) continue;
        candidates.push({ ticker: m.ticker, title: m.title, volume, series, isHistorical: true, raw: m });
      }
    })
  );

  [...activeResults, ...histResults].forEach(r => {
    if (r.status === 'rejected') console.error('[Kalshi] fetch error:', String(r.reason).slice(0, 200));
  });

  return candidates;
}

export async function fetchKalshi(
  strategy: SearchStrategy,
  domain:   DomainConfig,
): Promise<EnrichedMarket[]> {
  // Stage 1 — series-specific paginated fetch (all series in parallel)
  const candidates = await collectKalshiCandidates(strategy);
  if (!candidates.length) return [];

  console.log(`[Kalshi] ${candidates.length} candidates (series: ${strategy.kalshiSeries.join(', ')})`);

  const eventCandidates = candidates.map(c => ({ id: c.ticker, title: c.title, volume: c.volume, markets: [] }));
  const batchCount = Math.ceil(eventCandidates.length / K2_BATCH_SIZE);
  console.log(`[Kalshi] → K2 relevance filter (${batchCount} batch${batchCount !== 1 ? 'es' : ''} in parallel)`);

  // Stage 2 — K2 relevance filter across parallel batches
  const relevance = await filterByRelevance(eventCandidates, domain, 'Kalshi');
  const keptIds   = new Set([...relevance.relevantIds, ...relevance.historicalIds].map(String));
  const kept      = candidates.filter(c => keptIds.has(String(c.ticker)));
  console.log(`[Kalshi] K2 kept ${kept.length} markets${kept.length > 0 ? ': ' + kept.map(c => c.title).join(', ') : ''}`);

  // Stage 3 — enrich only approved markets with candlestick history
  const enriched = await Promise.all(kept.map(c => enrichKalshi(c.raw, c.series, c.isHistorical)));
  return enriched.filter((m): m is EnrichedMarket => m !== null);
}

async function enrichKalshi(m: any, series: string, isHistorical: boolean): Promise<EnrichedMarket | null> {
  const title = m.title ?? '';
  if (!title) return null;  // skip untitled markets only

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
  const [polyMarkets, kalshiMarkets] = await Promise.allSettled([
    fetchPolymarket(strategy, domain),
    fetchKalshi(strategy, domain),
  ]);

  const all: EnrichedMarket[] = [
    ...(polyMarkets.status   === 'fulfilled' ? polyMarkets.value   : []),
    ...(kalshiMarkets.status === 'fulfilled' ? kalshiMarkets.value : []),
  ];

  return deduplicateMarkets(all);
}

export function deduplicateMarkets(markets: EnrichedMarket[]): EnrichedMarket[] {
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
