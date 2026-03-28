# Signal — Backend Spec
## Claude Code Implementation Reference

---

## What this system is

Signal converts prediction market data into executable real-world directives. Every existing prediction market tool tells you probabilities. Signal tells you what to do about them — specifically, immediately, and with reasoning you can follow and push back on.

The core pitch: **"Prediction markets have been telling us what's coming for 30 years. We built the first system that tells you what to do about it."**

---

## Why prediction markets over documents

Traditional data sources — government reports, economic indicators, sensor networks — tell you what **has already happened**. By the time EIA oil supply data is collected, verified, and published it describes events weeks or months in the past. A decision maker receiving that data is not getting early warning. They're getting a post-mortem dressed as a dashboard.

Prediction markets tell you what **informed people believe will happen** — and crucially, what they're willing to stake money on. When an energy trader who knows something about Iran strait disruption risk acts on that knowledge, it enters the market price immediately. The price is a continuous aggregation of the private forward-looking knowledge of everyone paying attention.

The 2022 Ukraine invasion commodity spike: prediction markets started pricing in energy and food stress in late February. Official government acknowledgment came mid-April. **Six weeks of lead time.** That gap is the entire value proposition.

---

## Demo domain: Iran/oil crisis

This is the right domain. Polymarket currently has 272 active Iran markets with $157M+ in trading volume. Brent crude hit $119.50 this month as Iran's near-complete closure of the Strait of Hormuz throttled ~20% of global oil transit. Traders have been pricing in military escalation hours before strikes happen — the 2022 Ukraine analog holds exactly here.

**The live causal cluster:**

| Market | Platform | Current probability | Role in chain |
|---|---|---|---|
| "US forces enter Iran by April 30" | Polymarket | ~62% | Leading geopolitical trigger |
| "US x Iran ceasefire by Dec 31" | Polymarket | ~76% | Conflict duration signal |
| "Strait of Hormuz closure sustained" | Polymarket | active | Physical bottleneck |
| "Brent crude above $120" | Kalshi/Polymarket | active | 3–5 day lag from Hormuz |
| "Oil hits $150 a barrel" | Polymarket | active | 7–14 day escalation |
| "US declares energy emergency" | Kalshi | active | 14–21 day policy response |
| "SPR emergency release authorized" | Kalshi | active | Action directive target |

**Causal propagation delays:**
- Hormuz closure → Brent spike: 3–5 days (traders price it immediately, physical supply takes a week)
- Brent spike → US gasoline: 7–10 days (refinery margins, retail pass-through)
- Gasoline spike → energy emergency declaration: 14–21 days (political threshold)
- Emergency declaration → SPR release authorization: 48–72 hours (DOE administrative)

**The demo pitch line:** "Prediction markets priced in the February 28 US-Israel strikes on Iran hours before they happened. We built the system that converts that signal into an action directive for the people who need to act on it."

**Historical precedent for validation:** Ukraine 2022 — prediction markets priced in the energy supply shock 6 weeks before the IEA acknowledged it. Use resolved Polymarket markets from Feb–April 2022 as ground truth validation of the pipeline.

---

## Why agentic AI — the core architectural argument

The pipeline has steps requiring fundamentally different kinds of intelligence:

- Market fetching → pure code, no reasoning needed
- Statistical screening → pure math, no reasoning needed
- Causal reasoning → deep chain-of-thought, this is K2 Think V2's job
- Historical precedent lookup → structured DB, no reasoning needed
- Action recommendation → structured output with moderate reasoning

**Domain knowledge agent removed:** K2 Think V2 already knows energy economics, geopolitics, and oil market dynamics well. A separate domain LLM adds latency with no meaningful gain.

**No artificial cluster cap:** K2 Think V2 includes every market it finds causally connected, as long as each passes r ≥ 0.50 at optimal lag. There is no 2–5 market restriction.

Asking one model to do all pipeline steps is a wrapper. A multi-agent system lets each specialized agent do exactly one thing well. **K2 Think V2 does the one thing only it can do — reason about what the agents found, decide whether to trust it, and determine what to do next.**

---

## Tech stack

- **Runtime**: Node.js 20+
- **Framework**: Fastify
- **Language**: TypeScript via `tsx`
- **Orchestrator**: K2 Think V2 (`LLM360/K2-Think-V2`) via OpenAI-compatible SDK
- **Agents**: mix of pure code, pure math, structured knowledge bases, small LLM
- **Frontend communication**: SSE for real-time streaming

---

## Project setup

```bash
mkdir signal-backend && cd signal-backend
npm init -y
npm install fastify @fastify/cors openai date-fns tsx
npm install -D typescript @types/node
npx tsc --init --module nodenext --target es2022 --strict
```

```json
{
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "start": "tsx src/index.ts"
  }
}
```

---

## Environment variables

```bash
# Polymarket
POLYMARKET_GAMMA_BASE=https://gamma-api.polymarket.com
POLYMARKET_CLOB_BASE=https://clob.polymarket.com

# Kalshi
KALSHI_API_BASE=https://api.elections.kalshi.com/trade-api/v2
KALSHI_API_KEY=your_key_here

# K2 Think V2
K2_THINK_BASE_URL=http://localhost:8000/v1
K2_THINK_API_KEY=key

PORT=3001
```

---

## File structure

```
signal-backend/
├── src/
│   ├── index.ts                       # Fastify server
│   ├── k2think.ts                     # K2 Think V2 orchestrator client
│   ├── types.ts                       # all TypeScript interfaces
│   ├── agents/
│   │   ├── marketFetcher.ts           # Polymarket + Kalshi fetch (pure code)
│   │   ├── statisticalScreener.ts    # math agent (pure code)
│   │   ├── contradictionDetector.ts   # logic checker (pure code)
│   │   ├── historicalPrecedent.ts     # precedent search (structured DB)
│   │   └── stakeholder.ts             # institutional knowledge (structured KB)
│   ├── orchestrator/
│   │   └── index.ts                   # main orchestration loop — K2 Think V2 runs here
│   └── pipeline/
│       ├── counterfactual.ts
│       ├── divergence.ts
│       └── report.ts
├── data/
│   ├── polymarket-snapshot.json       # pre-cached Polymarket fallback
│   └── kalshi-snapshot.json           # pre-cached Kalshi fallback
│   └── polymarket-snapshot.json
├── .env
├── package.json
└── tsconfig.json
```

---

## Types (`src/types.ts`)

```typescript
export interface EnrichedMarket {
  id: string;
  title: string;
  probability: number;
  volume: number;
  daysToResolution: number;
  decayWeight: number;
  historicalVolatility: number;
  probHistory: number[];
  volumeHistory: number[];
  source: 'polymarket' | 'kalshi';
  isResolved: boolean;
  outcome?: 'yes' | 'no';   // only set for resolved markets — ground truth
}

export interface ScreenedMarket extends EnrichedMarket {
  vwScore: number;
  regime: 'stable' | 'transitioning' | 'stressed' | 'insufficient_data';
  transitionDay: number | null;
  stressedSince: number | null;
  passesScreening: boolean;
}

export interface LagResult {
  marketIdA: string;
  marketIdB: string;
  bestLag: number;
  bestR: number;
  lagProfile: { lag: number; r: number }[];
}

export interface LagMatrix {
  pairs: LagResult[];
  dominantLeader: string | null;
  avgBestR: number;
  propagationSummary: string;
}

export interface ContradictionResult {
  hasContradiction: boolean;
  contradictions: {
    claimA: string;
    claimB: string;
    explanation: string;
    severity: 'blocking' | 'moderate' | 'minor';
  }[];
}

export interface PrecedentResult {
  cases: {
    description: string;
    similarity: number;
    outcome: string;
    relevantLesson: string;
    analogyStrength: 'strong' | 'moderate' | 'weak';
  }[];
  overallRelevance: string;
}

export interface StakeholderResult {
  primaryActor: {
    name: string;
    role: string;
    authority: string;
    legalMechanism: string;
    deploymentLeadTime: string;
  };
  secondaryActors: { name: string; role: string }[];
  institutionalContext: string;
}

export interface ClusterSelectionResult {
  selectedIds: string[];
  causalRanking: string[];
  selectionReasoning: string;
  provisionalIds: string[];
  provisionalReasoning: string;
  agentsToConsult: {
    agent: 'precedent';   // domain agent removed — K2 Think V2 already knows energy economics
    question: string;
    reason: string;
  }[];
}

export interface CausalAnalysis {
  causalMechanism: string;
  propagationChain: string;
  confoundingRisk: 'none' | 'low' | 'medium' | 'high';
  confoundingExplanation: string;
  rejectedMarketIds: string[];
  rejectionReasons: Record<string, string>;
  timeDecayNote: string;
  signalConfirmed: boolean;
  confidenceScore: number;
  confidenceReasoning: string;
  precedentsIntegrated: string;
}

export interface MathAnalysis {
  correlationDecayAssessment: string;
  adjustedCorrelationConfidence: number;
  jointPosteriorProbability: number;
  jointPosteriorReasoning: string;
  confidenceIntervalLow: number;
  confidenceIntervalHigh: number;
  confidenceIntervalReasoning: string;
  derivedDecayWeights: Record<string, number>;
  decayDerivationReasoning: string;
  mathSignalStrength: number;
  effectiveActionWindowDays: number;
}

export interface ActionDirective {
  actor: string;
  specificRole: string;
  action: string;
  legalMechanism: string;
  geography: string;
  timeWindow: string;
  effectiveWindowDays: number;
  reasoning: string;
  confidenceScore: number;
  confidenceIntervalLow: number;
  confidenceIntervalHigh: number;
  jointPosteriorProbability: number;
  avgDecayWeight: number;
  urgency: 'immediate' | 'urgent' | 'planned';
}

export interface OrchestrationAudit {
  agentsCalledInOrder: string[];
  agentTrustDecisions: { agent: string; trusted: boolean; reasoning: string }[];
  unexpectedFindings: string[];
  gapsIdentified: string[];
  gapsFilled: string[];
  gapsUnfilled: string[];
  orchestrationConfidence: number;
  wouldChangeWith: string[];
}

export type PipelineStatus =
  | 'confirmed'
  | 'low_confidence'
  | 'no_signal'
  | 'causally_ambiguous';

export interface PipelineResult {
  domain: string;
  enrichedMarkets: EnrichedMarket[];
  screenedMarkets: ScreenedMarket[];
  lagMatrix: LagMatrix | null;
  selectedCluster: ScreenedMarket[];
  rejectedClusters: { markets: ScreenedMarket[]; reason: string; avgR: number }[];
  validationResult: { pairs: any[]; avgR: number; passed: boolean } | null;
  causalAnalysis: CausalAnalysis | null;
  mathAnalysis: MathAnalysis | null;
  directive: ActionDirective | null;
  audit: OrchestrationAudit | null;
  report: ReportContent | null;
  statRetryCount: number;
  causalRetryCount: number;
  status: PipelineStatus;
  statusReason: string;
}

export interface ReportContent {
  title: string;
  executiveSummary: string;
  causalReasoningProse: string;
  generatedAt: string;
}

export interface PipelineEvent {
  step: 'fetch' | 'screen' | 'cluster' | 'contradiction' | 'precedent'
      | 'causal' | 'math' | 'action' | 'audit' | 'report' | 'done' | 'error';
  status: 'running' | 'streaming' | 'complete' | 'failed' | 'retry'
        | 'investigating' | 'ambiguous';
  data?: unknown;
  message?: string;
  agentName?: string;
  k2Decision?: string;
  retryCount?: number;
}

export interface CounterfactualRequest {
  assumption: string;
  overrideProbabilities?: Record<string, number>;
}

export interface CounterfactualResult {
  assumption: string;
  originalJointPosterior: number;
  revisedJointPosterior: number;
  posteriorDelta: number;
  revisedConfidenceIntervalLow: number;
  revisedConfidenceIntervalHigh: number;
  revisedMathSignalStrength: number;
  signalStillConfirmed: boolean;
  revisedRecommendation: string;
  reasoning: string;
}
```

---

## K2 Think V2 client (`src/k2think.ts`)

```typescript
import OpenAI from 'openai';

const client = new OpenAI({
  baseURL: process.env.K2_THINK_BASE_URL ?? 'http://localhost:8000/v1',
  apiKey:  process.env.K2_THINK_API_KEY  ?? 'key',
});

export type ReasoningEffort = 'low' | 'medium' | 'high';

export async function callK2Think(
  prompt: string,
  effort: ReasoningEffort
): Promise<string> {
  const res = await client.chat.completions.create({
    model: 'LLM360/K2-Think-V2',
    messages: [
      {
        role: 'system',
        content: 'You are K2-Think, an advanced reasoning assistant created by MBZUAI IFM. You are the orchestrator of a multi-agent system. You reason carefully about what each agent tells you, decide whether to trust it, and determine what to do next.',
      },
      { role: 'user', content: prompt },
    ],
    extra_body: { chat_template_kwargs: { reasoning_effort: effort } },
  } as any);
  return res.choices[0].message.content ?? '';
}

export async function callK2ThinkStream(
  prompt: string,
  effort: ReasoningEffort,
  onToken: (token: string) => void
): Promise<string> {
  const stream = await client.chat.completions.create({
    model: 'LLM360/K2-Think-V2',
    messages: [
      { role: 'system', content: 'You are K2-Think, an advanced reasoning assistant created by MBZUAI IFM. You are the orchestrator of a multi-agent system.' },
      { role: 'user', content: prompt },
    ],
    stream: true,
    extra_body: { chat_template_kwargs: { reasoning_effort: effort } },
  } as any);

  let full = '';
  for await (const chunk of stream) {
    const token = chunk.choices[0]?.delta?.content ?? '';
    if (token) { full += token; onToken(token); }
  }
  return full;
}

export function parseK2Json<T>(raw: string): T {
  const cleaned = raw
    .replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/i, '').trim();
  return JSON.parse(cleaned) as T;
}
```

**Effort by step:**

| Step | Effort | Why |
|---|---|---|
| Cluster selection | `low` | Ranking pre-screened candidates — fast |
| Evaluating agent outputs | `low` | Quick trust decisions |
| Causal reasoning | `high` | Core reasoning — needs full budget |
| Math analysis | `high` | Bayesian derivation, CI |
| Directive generation | `medium` | Structured output |
| Meta-reasoning audit | `medium` | Reasoning about its own process |
| Report prose | `medium` | Plain-language writing |
| Counterfactual | `high` | Re-deriving math under constraints |

---

## Agents (`src/agents/`)

### Market Fetcher (`agents/marketFetcher.ts`)
Pure code. No LLM. Pulls from both Polymarket and Kalshi — active markets and resolved/historical markets. For the energy demo, keyword-filters upfront so we never process irrelevant markets.

**What each source gives us:**
- **Polymarket (Gamma API):** Active + recently closed energy markets. Price history via CLOB `prices-history` endpoint at daily fidelity. Resolved markets return history at 12h+ granularity only — daily is fine.
- **Kalshi:** Active + historical energy markets via two tiers. Live markets: `GET /markets?series_ticker=KXWTI` etc. Historical (settled before cutoff): `GET /historical/markets` filtered by event ticker. Candlestick history: `GET /historical/markets/{ticker}/candlesticks?period_interval=1440` (1440 min = 1 day).

```typescript
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
  // Fetch active markets
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
  // GET /historical/cutoff tells us the boundary timestamp
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
    outcome:              args.outcome,
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
    ...(polyActive.status     === 'fulfilled' ? polyActive.value     : []),
    ...(polyResolved.status   === 'fulfilled' ? polyResolved.value   : []),
    ...(kalshiActive.status   === 'fulfilled' ? kalshiActive.value   : []),
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
```

### Statistical Screener (`agents/statisticalScreener.ts`)
Pure math. No LLM.

```typescript
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
    const avgVol   = m.volumeHistory.reduce((s, v) => s + v, 0) / m.volumeHistory.length;
    const vwScore  = Math.min(1, Math.sqrt(avgVol / maxVol) * Math.abs(m.probability - 0.5) * 2);
    const regime   = detectRegime(m.probHistory);
    return {
      ...m, vwScore,
      regime:       regime.regime,
      transitionDay: regime.transitionDay,
      stressedSince: regime.stressedSince,
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
  const pairs: LagResult[]            = [];
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
      pairs.push({ marketIdA: markets[i].id, marketIdB: markets[j].id,
                   bestLag: best.lag, bestR: best.r, lagProfile: profile });
      if (best.lag > 0)      leaderCount[markets[i].id] = (leaderCount[markets[i].id] ?? 0) + 1;
      else if (best.lag < 0) leaderCount[markets[j].id] = (leaderCount[markets[j].id] ?? 0) + 1;
    }
  }

  const avgBestR       = pairs.length ? pairs.reduce((s, p) => s + p.bestR, 0) / pairs.length : 0;
  const dominantLeader = Object.keys(leaderCount).length
    ? Object.entries(leaderCount).sort((a, b) => b[1] - a[1])[0][0] : null;
  const summary        = pairs.sort((a, b) => b.bestR - a.bestR).slice(0, 3).map(p => {
    const at = markets.find(m => m.id === p.marketIdA)?.title.slice(0, 25) ?? p.marketIdA;
    const bt = markets.find(m => m.id === p.marketIdB)?.title.slice(0, 25) ?? p.marketIdB;
    return p.bestLag > 0  ? `"${at}…" leads "${bt}…" by ${p.bestLag}d (r=${p.bestR.toFixed(2)})`
         : p.bestLag < 0  ? `"${bt}…" leads "${at}…" by ${Math.abs(p.bestLag)}d (r=${p.bestR.toFixed(2)})`
         :                   `"${at}…" and "${bt}…" simultaneous (r=${p.bestR.toFixed(2)})`;
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
        pairs.push({ ids: [cluster[i].id, cluster[j].id] as [string,string], r: pearson(as_, bs_), lag });
    }
  }
  const avgR = pairs.length ? pairs.reduce((s, p) => s + p.r, 0) / pairs.length : 0;
  return { pairs, avgR, passed: pairs.length > 0 && pairs.every(p => p.r >= 0.50) };
}
```

### Domain Knowledge Agent (`agents/domainKnowledge.ts`)
Smaller, faster LLM. K2 Think V2 dispatches specific questions here rather than reasoning about domain facts itself.

```typescript
import OpenAI from 'openai';
import type { DomainKnowledgeResult } from '../types.js';

const client = new OpenAI({
  baseURL: process.env.K2_THINK_BASE_URL ?? 'http://localhost:8000/v1',
  apiKey:  process.env.K2_THINK_API_KEY  ?? 'key',
});

export async function askDomainAgent(
  question: string,
  domain: string
): Promise<DomainKnowledgeResult> {
  const res = await client.chat.completions.create({
    model: 'LLM360/K2-Think-V2',
    messages: [{
      role: 'user',
      content: `You are a domain expert in ${domain} economics and policy.
Answer this specific question concisely. If uncertain, say so — a low-confidence
answer is more useful than a confident wrong one.

QUESTION: ${question}

Return ONLY valid JSON:
{"question":"${question}","answer":"...","confidence":"high|medium|low","sourceReasoning":"..."}`,
    }],
    extra_body: { chat_template_kwargs: { reasoning_effort: 'low' } },
  } as any);

  const raw = res.choices[0].message.content ?? '{}';
  try {
    return JSON.parse(raw.replace(/^```json\s*/i,'').replace(/```\s*$/i,'').trim());
  } catch {
    return { question, answer: raw, confidence: 'low', sourceReasoning: 'parse error' };
  }
}
```

### Contradiction Detector (`agents/contradictionDetector.ts`)
Pure logic. No LLM.

```typescript
import type { ContradictionResult } from '../types.js';

export function detectContradictions(claims: string[]): ContradictionResult {
  const contradictions = [];
  for (let i = 0; i < claims.length; i++) {
    for (let j = i + 1; j < claims.length; j++) {
      const a = claims[i].toLowerCase();
      const b = claims[j].toLowerCase();
      if (
        (a.includes('increases') && b.includes('decreases') && shareWords(a, b)) ||
        (a.includes('leads')     && b.includes('lags')      && shareWords(a, b)) ||
        (a.includes('causes')    && b.includes('caused by') && shareWords(a, b))
      ) {
        contradictions.push({
          claimA: claims[i], claimB: claims[j],
          explanation: 'Opposing assertions about the same relationship',
          severity: 'blocking' as const,
        });
      }
    }
  }
  return { hasContradiction: contradictions.length > 0, contradictions };
}

function shareWords(a: string, b: string): boolean {
  const wa = new Set(a.split(/\s+/).filter(w => w.length > 4));
  return b.split(/\s+/).some(w => w.length > 4 && wa.has(w));
}
```

### Historical Precedent Agent (`agents/historicalPrecedent.ts`)
Structured case database — Iran/oil domain only.

```typescript
import type { PrecedentResult } from '../types.js';

const CASES = [
  {
    id: 'ukraine_oil_2022',
    description: 'Russia-Ukraine war — oil supply shock, Feb 2022',
    leadTimeDays: 42,
    outcome: 'Brent crude spiked from $80 to $130 within 3 weeks. IEA emergency SPR release coordinated 6 weeks after prediction markets first priced in disruption.',
    lesson: 'Prediction markets priced in the oil supply shock ~6 weeks before IEA acknowledged it. Early SPR activation would have blunted the retail gasoline spike.',
    keywords: ['oil', 'crude', 'Brent', 'WTI', 'supply', 'SPR', 'sanctions', 'Russia', 'war'],
  },
  {
    id: 'iran_nuclear_2018',
    description: 'US withdrawal from JCPOA — Iran oil sanctions reimposed, May 2018',
    leadTimeDays: 21,
    outcome: 'Iranian oil exports fell from 2.5M to 0.5M barrels/day over 6 months. Brent rose 15% in 3 weeks following announcement.',
    lesson: 'Prediction markets on sanctions severity preceded the crude price move by 3 weeks. DOE SPR release was authorized reactively rather than proactively.',
    keywords: ['Iran', 'sanctions', 'oil', 'crude', 'JCPOA', 'nuclear', 'barrel'],
  },
  {
    id: 'gulf_war_1990',
    description: 'Iraq invasion of Kuwait — Strait of Hormuz threat, Aug 1990',
    leadTimeDays: 30,
    outcome: 'Oil spiked from $17 to $36/barrel in 6 weeks. US activated SPR for the first time in history. G7 coordinated IEA release.',
    lesson: 'Physical supply disruption through a Gulf chokepoint produces sharp 2–3 week price spikes. SPR release authorization requires 2–3 week political runway.',
    keywords: ['oil', 'crude', 'Hormuz', 'Gulf', 'barrel', 'SPR', 'supply', 'tanker'],
  },
  {
    id: 'iran_hormuz_2019',
    description: 'Iran tanker seizures — Strait of Hormuz tensions, Jun–Jul 2019',
    leadTimeDays: 14,
    outcome: 'Brent spiked 4% on tanker seizure news. Insurance rates for Hormuz transit rose 10×. Markets priced in sustained closure risk 2 weeks before State Dept advisory.',
    lesson: 'Tanker seizure markets on Polymarket moved ahead of official State Dept shipping advisories by ~2 weeks. Physical disruption signal preceded policy response.',
    keywords: ['Iran', 'Hormuz', 'tanker', 'oil', 'crude', 'strait', 'seizure'],
  },
];

export function findPrecedents(keywords: string[], topN = 3): PrecedentResult {
  const scored = CASES
    .map(p => ({ ...p, score: keywords.filter(k => p.keywords.some(pk => pk.toLowerCase().includes(k.toLowerCase()))).length }))
    .sort((a, b) => b.score - a.score)
    .slice(0, topN);

  return {
    cases: scored.map(p => ({
      description: p.description,
      similarity: Math.min(1, p.score / Math.max(keywords.length, 1)),
      outcome: p.outcome,
      relevantLesson: p.lesson,
      analogyStrength: p.score >= 4 ? 'strong' : p.score >= 2 ? 'moderate' : 'weak',
    })),
    overallRelevance: scored.length > 0
      ? `${scored.length} Iran/oil precedent(s) found — strongest: ${scored[0].description}`
      : 'No strong oil/Iran precedents found in DB',
  };
}
```

### Stakeholder Agent (`agents/stakeholder.ts`)
Iran/oil domain only. Hardcoded — no lookup needed.

```typescript
import type { StakeholderResult } from '../types.js';

// Single domain — Iran/oil crisis response
export function getStakeholders(): StakeholderResult {
  return {
    primaryActor: {
      name: 'US Department of Energy — Office of Petroleum Reserves',
      role: 'Strategic Petroleum Reserve authorization and release',
      authority: 'Emergency SPR drawdown authority',
      legalMechanism: 'Energy Policy and Conservation Act (EPCA) — 42 USC 6241. President can authorize SPR drawdown upon finding "severe energy supply interruption." DOE Secretary executes within 48 hours of presidential authorization.',
      deploymentLeadTime: '48 hours for presidential authorization, 13–15 days for first barrels to reach market after drawdown order',
    },
    secondaryActors: [
      {
        name: 'International Energy Agency (IEA)',
        role: 'Coordinated strategic reserve release across member nations',
      },
      {
        name: 'Federal Energy Regulatory Commission (FERC)',
        role: 'Emergency orders for pipeline capacity and gas supply rerouting',
      },
      {
        name: 'Department of State',
        role: 'Diplomatic pressure on OPEC+ for emergency production increase',
      },
      {
        name: 'US Navy 5th Fleet (Bahrain)',
        role: 'Strait of Hormuz naval escort and freedom of navigation operations',
      },
    ],
    institutionalContext: `
The SPR holds ~350 million barrels — roughly 18 days of US consumption.
A full emergency drawdown of 1M barrels/day for 30 days would release 30M barrels.
This is most effective when coordinated with IEA allies (total IEA reserve ~1.5B barrels).
The 13–15 day pipeline from drawdown order to market delivery means authorization
must happen before prices peak — not after. This is exactly the lead-time problem
that prediction markets solve.

Key constraint: SPR releases dampen price spikes by ~$3–8/barrel depending on
coordination. They do not replace lost Hormuz throughput (15M bbl/day) —
they buy time for diplomatic resolution or supply rerouting.
`.trim(),
  };
}
```
---

## The orchestration loop (`src/orchestrator/index.ts`)

K2 Think V2 actively manages the entire process. At each step it receives agent outputs, reasons about them, and decides what to do next. The loop is different every run.

```typescript
import { fetchAndEnrich, loadSnapshot }            from '../agents/marketFetcher.js';
import { screenMarkets, buildLagMatrix,
         validateCluster }                          from '../agents/statisticalScreener.js';
import { detectContradictions }                     from '../agents/contradictionDetector.js';
import { findPrecedents }                           from '../agents/historicalPrecedent.js';
import { getStakeholders }                          from '../agents/stakeholder.js';
import { callK2Think, callK2ThinkStream, parseK2Json } from '../k2think.js';
import type {
  PipelineEvent, PipelineResult, ScreenedMarket,
  ClusterSelectionResult, CausalAnalysis, MathAnalysis,
  ActionDirective, OrchestrationAudit,
} from '../types.js';

const MAX_STAT_RETRIES   = 3;
const MAX_CAUSAL_RETRIES = 2;

export async function runPipeline(
  emit: (e: PipelineEvent) => void,
  useCached = false
): Promise<PipelineResult> {

  const audit: OrchestrationAudit = {
    agentsCalledInOrder: [], agentTrustDecisions: [],
    unexpectedFindings: [], gapsIdentified: [], gapsFilled: [],
    gapsUnfilled: [], orchestrationConfidence: 0, wouldChangeWith: [],
  };

  // ── Step 1: Market Fetcher ────────────────────────────────────────────────
  emit({ step: 'fetch', status: 'running', agentName: 'MarketFetcherAgent' });
  audit.agentsCalledInOrder.push('MarketFetcherAgent');
  const markets = useCached ? await loadSnapshot() : await fetchAndEnrich();
  emit({ step: 'fetch', status: 'complete', data: { count: markets.length } });

  // ── Step 2: Statistical Screener ──────────────────────────────────────────
  emit({ step: 'screen', status: 'running', agentName: 'StatisticalScreenerAgent' });
  audit.agentsCalledInOrder.push('StatisticalScreenerAgent');
  const screened  = screenMarkets(markets);
  const lagMatrix = buildLagMatrix(screened);
  emit({ step: 'screen', status: 'complete', data: {
    total: markets.length, passed: screened.length, lagMatrix,
    regimeSummary: {
      stable:        screened.filter(m => m.regime === 'stable').length,
      transitioning: screened.filter(m => m.regime === 'transitioning').length,
      stressed:      screened.filter(m => m.regime === 'stressed').length,
    },
  }});

  // ── Track A: cluster selection + validation loop ──────────────────────────
  let statRetry = 0;
  let excludeIds: string[]                          = [];
  let rejectedClusters: PipelineResult['rejectedClusters'] = [];
  let cluster: ScreenedMarket[]                     = [];
  let validation: any;

  while (statRetry <= MAX_STAT_RETRIES) {

    // K2 Think V2 selects cluster
    emit({ step: 'cluster', status: statRetry > 0 ? 'retry' : 'running',
           agentName: 'K2ThinkV2-Orchestrator', retryCount: statRetry });
    audit.agentsCalledInOrder.push('K2ThinkV2-ClusterSelection');

    const selRaw = await callK2Think(`
You are orchestrating a multi-agent prediction market analysis system.
Domain: Iran/oil crisis — Strait of Hormuz disruption and downstream oil price effects.

Statistical Screener returned ${screened.length} pre-screened markets (vwScore>0.15, 14+ days history).
Sources: Polymarket + Kalshi. Includes both active and resolved markets.

SCREENED MARKETS:
${JSON.stringify(screened.filter(m => !excludeIds.includes(m.id)).map(m => ({
  id: m.id, title: m.title, probability: m.probability,
  daysToResolution: m.daysToResolution, vwScore: m.vwScore,
  regime: m.regime, stressedSince: m.stressedSince,
})), null, 2)}

LAG STRUCTURE: ${lagMatrix.propagationSummary}
${excludeIds.length > 0 ? `EXCLUDED (failed validation): ${JSON.stringify(excludeIds)}` : ''}

Select ALL markets that share a causal mechanism in the Iran/oil chain:
Hormuz closure → crude spike → gasoline → energy emergency → SPR release.
No cap on cluster size — include every market passing r ≥ 0.50.
Rank by causal importance using lag structure (leading markets first).
Flag uncertain markets as provisional.

Return ONLY valid JSON:
{
  "selectedIds": [], "causalRanking": [], "selectionReasoning": "...",
  "provisionalIds": [], "provisionalReasoning": "...",
  "agentsToConsult": []
}
`.trim(), 'low');

    const selection = parseK2Json<ClusterSelectionResult>(selRaw);
    cluster = screened.filter(m => selection.selectedIds.includes(m.id));
    emit({ step: 'cluster', status: 'complete',
           data: { cluster, selection, lagMatrix },
           k2Decision: selection.selectionReasoning });

    validation = validateCluster(cluster, lagMatrix);
    emit({ step: 'screen', status: 'complete',
           data: { validation, cluster, lagMatrix, rejectedClusters } });

    if (validation.passed) break;

    rejectedClusters.push({
      markets: cluster,
      reason:  `avg r = ${validation.avgR.toFixed(2)} < 0.50 at optimal lags`,
      avgR:    validation.avgR,
    });
    excludeIds = [...excludeIds, ...cluster.map(m => m.id)];
    statRetry++;

    if (statRetry > MAX_STAT_RETRIES) {
      const reason = 'No statistically correlated cluster found after 3 attempts.';
      emit({ step: 'done', status: 'complete', data: { status: 'no_signal', reason } });
      return buildResult({ markets, screened, lagMatrix, cluster: [],
        rejectedClusters, validation: null, causal: null, math: null,
        directive: null, audit, report: null,
        statRetry, causalRetry: 0, status: 'no_signal', statusReason: reason });
    }
  }

  // ── Contradiction check ───────────────────────────────────────────────────
  emit({ step: 'contradiction', status: 'running', agentName: 'ContradictionDetectorAgent' });
  audit.agentsCalledInOrder.push('ContradictionDetectorAgent');
  const claims = cluster.map(m =>
    `Market "${m.title}" probability ${m.probability.toFixed(2)}, ${m.regime} regime`
  );
  const contradictions = detectContradictions(claims);
  if (contradictions.hasContradiction)
    audit.unexpectedFindings.push(`${contradictions.contradictions.length} contradiction(s) found`);
  emit({ step: 'contradiction', status: 'complete', data: contradictions });

  // ── Historical precedents ─────────────────────────────────────────────────
  emit({ step: 'precedent', status: 'running', agentName: 'HistoricalPrecedentAgent' });
  audit.agentsCalledInOrder.push('HistoricalPrecedentAgent');
  const keywords  = cluster.flatMap(m => m.title.toLowerCase().split(/\s+/)).filter(w => w.length > 3);
  const precedents = findPrecedents(keywords);
  emit({ step: 'precedent', status: 'complete', data: precedents });

  // ── Track B: causal reasoning loop ───────────────────────────────────────
  let causalRetry      = 0;
  let prevRejections: string[] = [];
  let causal: CausalAnalysis | null = null;

  while (causalRetry <= MAX_CAUSAL_RETRIES) {
    emit({ step: 'causal', status: causalRetry > 0 ? 'retry' : 'running',
           agentName: 'K2ThinkV2-CausalReasoning' });
    audit.agentsCalledInOrder.push('K2ThinkV2-CausalReasoning');

    const causalTokens: string[] = [];
    const causalRaw = await callK2ThinkStream(`
You are the orchestrator reasoning about causal structure for the Iran/oil crisis domain.
${prevRejections.length ? `PREVIOUS REJECTIONS:\n${prevRejections.join('\n')}` : ''}

CLUSTER:
${JSON.stringify(cluster.map(m => ({
  id: m.id, title: m.title, probability: m.probability,
  daysToResolution: m.daysToResolution, vwScore: m.vwScore,
  regime: m.regime, stressedSince: m.stressedSince,
  source: m.source, isResolved: m.isResolved,
})), null, 2)}

LAG STRUCTURE: ${lagMatrix.propagationSummary}

CONTRADICTION CHECK: ${contradictions.hasContradiction
  ? contradictions.contradictions.map(c => `CONFLICT: ${c.claimA} vs ${c.claimB}`).join('\n')
  : 'None detected'}

HISTORICAL PRECEDENTS:
${precedents.cases.map(p => `- ${p.description}: ${p.relevantLesson} (${p.analogyStrength})`).join('\n')}

Context: Iran/Strait of Hormuz oil crisis. Brent crude ~$110-120/barrel.
Causal chain to reason about: Hormuz closure risk → crude spike → gasoline → energy emergency → SPR.

1. CAUSAL MECHANISM: specific chain using the lag values as hard constraints
2. PARTIAL REJECTION: any markets that don't fit — list with specific reasons
3. CONFOUNDING CHECK: could a shared driver explain both correlation AND lag structure?
4. VERDICT: score from ${100 - causalRetry * 10}. -30 weak mechanism, -25 high confounding,
   -15 lag inconsistency, +10 strong precedent match. Confirmed if >= 50.

Return ONLY valid JSON:
{
  "causalMechanism":"...","propagationChain":"...",
  "confoundingRisk":"none|low|medium|high","confoundingExplanation":"...",
  "rejectedMarketIds":[],"rejectionReasons":{},
  "timeDecayNote":"...","signalConfirmed":true,"confidenceScore":0,
  "confidenceReasoning":"...","precedentsIntegrated":"..."
}
`.trim(), 'high', token => {
      causalTokens.push(token);
      emit({ step: 'causal', status: 'streaming', data: { partial: causalTokens.join('') } });
    });

    causal = parseK2Json<CausalAnalysis>(causalRaw);
    emit({ step: 'causal', status: 'complete', data: causal,
           k2Decision: causal.signalConfirmed ? 'Signal confirmed' : `Rejected (${causal.confidenceScore}/100)` });

    if (causal.signalConfirmed) break;

    // B1: partial rejection — drop flagged markets
    if (causal.rejectedMarketIds.length > 0 && causal.rejectedMarketIds.length < cluster.length - 1) {
      const why = Object.entries(causal.rejectionReasons).map(([id,r]) => `${id}: ${r}`).join('; ');
      prevRejections.push(`Attempt ${causalRetry + 1} rejected [${causal.rejectedMarketIds.join(',')}] — ${why}`);
      cluster    = cluster.filter(m => !causal!.rejectedMarketIds.includes(m.id));
      validation = validateCluster(cluster, lagMatrix);
      if (!validation.passed) { causalRetry = MAX_CAUSAL_RETRIES + 1; break; }
      causalRetry++; continue;
    }

    // B2: full rejection
    prevRejections.push(`Attempt ${causalRetry + 1}: no mechanism. Score: ${causal.confidenceScore}`);
    causalRetry++;
  }

  if (!causal?.signalConfirmed) {
    const status = causalRetry > MAX_CAUSAL_RETRIES ? 'causally_ambiguous' : 'low_confidence';
    const reason = `K2 Think V2 could not confirm causal mechanism after ${causalRetry} attempt(s). Human analyst review recommended.`;
    emit({ step: 'done', status: status === 'causally_ambiguous' ? 'ambiguous' : 'complete',
           data: { status, reason } });
    return buildResult({ markets, screened, lagMatrix, cluster,
      rejectedClusters, validation, causal, math: null, directive: null, audit, report: null,
      statRetry, causalRetry, status, statusReason: reason });
  }

  // ── Math analysis (streaming) ─────────────────────────────────────────────
  emit({ step: 'math', status: 'running', agentName: 'K2ThinkV2-MathReasoning' });
  audit.agentsCalledInOrder.push('K2ThinkV2-MathReasoning');
  const mathTokens: string[] = [];
  const mathRaw = await callK2ThinkStream(`
Advanced mathematical analysis on confirmed prediction market signal.
Show all derivations step by step.

CLUSTER: ${JSON.stringify(cluster.map(m => ({
  id: m.id, title: m.title, probability: m.probability,
  daysToResolution: m.daysToResolution, decayWeight: m.decayWeight,
  vwScore: m.vwScore, historicalVolatility: m.historicalVolatility,
  probHistory: m.probHistory,
})), null, 2)}

LAG MATRIX: ${lagMatrix.propagationSummary}
Avg best-lag r: ${lagMatrix.avgBestR.toFixed(3)}
Causal chain: ${causal.propagationChain}

1. CORRELATION DECAY: discount r by daysToResolution + historicalVolatility
2. JOINT POSTERIOR: Bayesian, account for shared information — do NOT average
3. 80% CI from historicalVolatility
4. DERIVED DECAY WEIGHTS: weight_i = base_decay × (1 - σ_i/σ_max) × vwScore_i
5. EFFECTIVE ACTION WINDOW: leading market daysToResolution minus propagation lag

Return ONLY valid JSON:
{
  "correlationDecayAssessment":"...","adjustedCorrelationConfidence":0.0,
  "jointPosteriorProbability":0.0,"jointPosteriorReasoning":"...",
  "confidenceIntervalLow":0.0,"confidenceIntervalHigh":0.0,"confidenceIntervalReasoning":"...",
  "derivedDecayWeights":{},"decayDerivationReasoning":"...",
  "mathSignalStrength":0,"effectiveActionWindowDays":0
}
`.trim(), 'high', token => {
    mathTokens.push(token);
    emit({ step: 'math', status: 'streaming', data: { partial: mathTokens.join('') } });
  });
  const math = parseK2Json<MathAnalysis>(mathRaw);
  emit({ step: 'math', status: 'complete', data: math });

  // ── Stakeholder lookup + Action directive ─────────────────────────────────
  emit({ step: 'action', status: 'running', agentName: 'K2ThinkV2-ActionDirective' });
  audit.agentsCalledInOrder.push('StakeholderAgent');
  const stakeholders = getStakeholders();   // Iran/oil hardcoded — no domain param needed
  audit.agentsCalledInOrder.push('K2ThinkV2-ActionDirective');

  const actionRaw = await callK2Think(`
Generate an operationally specific action directive for the Iran/oil crisis.

Causal mechanism: ${causal.causalMechanism}
Joint posterior: ${Math.round(math.jointPosteriorProbability * 100)}%
80% CI: [${Math.round(math.confidenceIntervalLow * 100)}%, ${Math.round(math.confidenceIntervalHigh * 100)}%]
Effective action window: ${math.effectiveActionWindowDays} days

STAKEHOLDER CONTEXT:
${JSON.stringify(stakeholders, null, 2)}

Rules:
- Reference the LEGAL MECHANISM (EPCA 42 USC 6241 for SPR)
- Reference the EFFECTIVE ACTION WINDOW as the deadline
- Reference the CONFIDENCE INTERVAL
- The 13–15 day SPR pipeline means authorization must happen NOW, not after prices peak
- BAD: "DOE should consider SPR options"
- GOOD: "DOE Office of Petroleum Reserves should seek presidential authorization for
  emergency SPR drawdown under EPCA 42 USC 6241 within ${math.effectiveActionWindowDays} days —
  ${Math.round(math.jointPosteriorProbability * 100)}% joint posterior (CI: ${Math.round(math.confidenceIntervalLow*100)}–${Math.round(math.confidenceIntervalHigh*100)}%)
  and the 13-day delivery pipeline mean authorization before day ${math.effectiveActionWindowDays}
  is required to blunt the price peak"

Return ONLY valid JSON:
{
  "actor":"...","specificRole":"...","action":"...","legalMechanism":"...",
  "geography":"...","timeWindow":"...","effectiveWindowDays":${math.effectiveActionWindowDays},
  "reasoning":"...","confidenceScore":${causal.confidenceScore},
  "confidenceIntervalLow":${math.confidenceIntervalLow},
  "confidenceIntervalHigh":${math.confidenceIntervalHigh},
  "jointPosteriorProbability":${math.jointPosteriorProbability},
  "avgDecayWeight":${cluster.reduce((s,m) => s + m.decayWeight, 0) / cluster.length},
  "urgency":"immediate|urgent|planned"
}
`.trim(), 'medium');
  const directive = parseK2Json<ActionDirective>(actionRaw);
  emit({ step: 'action', status: 'complete', data: directive });

  // ── Meta-reasoning audit ──────────────────────────────────────────────────
  emit({ step: 'audit', status: 'running', agentName: 'K2ThinkV2-MetaReasoning' });
  audit.agentsCalledInOrder.push('K2ThinkV2-MetaReasoning');
  const auditRaw = await callK2Think(`
Audit your own orchestration process.

Agents called: ${audit.agentsCalledInOrder.join(' → ')}
Final directive: ${directive.actor} should ${directive.action}
Confidence: ${directive.confidenceScore}/100

1. Which agent outputs did you rely on most heavily?
2. If those agents were wrong, how wrong is the directive?
3. What agent should you have called but didn't?
4. What information would change this directive?

Return ONLY valid JSON:
{
  "agentsCalledInOrder":${JSON.stringify(audit.agentsCalledInOrder)},
  "agentTrustDecisions":${JSON.stringify(audit.agentTrustDecisions)},
  "unexpectedFindings":[],"gapsIdentified":[],"gapsFilled":[],
  "gapsUnfilled":[],"orchestrationConfidence":0,"wouldChangeWith":[]
}
`.trim(), 'medium');
  const finalAudit = parseK2Json<OrchestrationAudit>(auditRaw);
  emit({ step: 'audit', status: 'complete', data: finalAudit });

  // ── Report ────────────────────────────────────────────────────────────────
  emit({ step: 'report', status: 'running', agentName: 'K2ThinkV2-ReportWriter' });
  audit.agentsCalledInOrder.push('K2ThinkV2-ReportWriter');
  const { generateReport } = await import('../pipeline/report.js');
  const report = await generateReport({
    selectedCluster: cluster, lagMatrix,
    mathAnalysis: math, causalAnalysis: causal, directive, stakeholders,
  });
  emit({ step: 'report', status: 'complete', data: report });

  emit({ step: 'done', status: 'complete', data: { status: 'confirmed' } });
  return buildResult({ markets, screened, lagMatrix, cluster, rejectedClusters,
    validation, causal, math, directive, audit: finalAudit, report,
    statRetry, causalRetry, status: 'confirmed',
    statusReason: 'Signal confirmed with causal mechanism and operational directive.' });
}

function buildResult(a: any): PipelineResult {
  return {
    domain: 'energy/iran-oil',
    enrichedMarkets: a.markets, screenedMarkets: a.screened,
    lagMatrix: a.lagMatrix, selectedCluster: a.cluster, rejectedClusters: a.rejectedClusters,
    validationResult: a.validation, causalAnalysis: a.causal, mathAnalysis: a.math,
    directive: a.directive, audit: a.audit, report: a.report,
    statRetryCount: a.statRetry, causalRetryCount: a.causalRetry,
    status: a.status, statusReason: a.statusReason,
  };
}
```

---

## Fastify server (`src/index.ts`)

```typescript
import Fastify from 'fastify';
import cors from '@fastify/cors';
import { runPipeline }       from './orchestrator/index.js';
import { runCounterfactual } from './pipeline/counterfactual.js';
import type { PipelineEvent } from './types.js';

const app = Fastify({ logger: true });
await app.register(cors, { origin: 'http://localhost:5173' });

// Single domain — Iran/oil. No :domain param needed.
app.get('/api/run', async (req, reply) => {
  const useCached = (req.query as any).cached === 'true';
  reply.raw.writeHead(200, {
    'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'Connection': 'keep-alive',
  });
  const emit = (e: PipelineEvent) => reply.raw.write(`data: ${JSON.stringify(e)}\n\n`);
  try { await runPipeline(emit, useCached); }
  catch (err) { emit({ step: 'error', status: 'failed', message: String(err) }); }
  finally { reply.raw.end(); }
});

app.post('/api/counterfactual', async (req, reply) => {
  const b = req.body as any;
  return reply.send(await runCounterfactual(b.cluster, b.lagMatrix, b.math, b.causal, b.request));
});

app.get('/health', async () => ({ ok: true }));
await app.listen({ port: Number(process.env.PORT ?? 3001), host: '0.0.0.0' });
```

---

## Pre-hackathon checklist

- [ ] Confirm K2 Think V2 access — Cerebras credits, Together.ai, Fireworks, or local vLLM
- [ ] Test streaming call end-to-end before the event
- [ ] Get Kalshi API key — free at kalshi.com, needed for energy series
- [ ] Fetch and save Polymarket Iran/oil markets snapshot:
  ```bash
  curl "https://gamma-api.polymarket.com/markets?active=true&limit=200" > data/polymarket-raw.json
  # Then filter to Iran/oil keywords in your fetch script
  ```
- [ ] Fetch and save Kalshi WTI + energy markets:
  ```bash
  curl "https://api.elections.kalshi.com/trade-api/v2/markets?series_ticker=KXWTI" \
    -H "Authorization: Bearer $KALSHI_API_KEY" > data/kalshi-wti.json
  curl "https://api.elections.kalshi.com/trade-api/v2/historical/markets?series_ticker=KXWTI" \
    -H "Authorization: Bearer $KALSHI_API_KEY" > data/kalshi-wti-historical.json
  ```
- [ ] Pre-run full pipeline on live data, save all SSE events as JSON for demo replay:
  ```bash
  curl http://localhost:3001/api/run > data/demo-replay.ndjson
  ```
- [ ] Have these numbers memorized for the pitch:
  - 272 active Iran markets on Polymarket, $157M+ trading volume
  - Brent crude peaked at $119.50 this month
  - Hormuz carries ~20% of global oil, ~35% of seaborne LNG
  - SPR drawdown takes 13–15 days from authorization to market
  - In 2022, prediction markets priced in the oil supply shock ~6 weeks before IEA acknowledged it

---

## Quick start prompt for Claude Code

> "Build the Signal multi-agent backend for the Iran/oil crisis domain using this spec. Start with `src/types.ts` (EnrichedMarket has source, isResolved, outcome fields), then `src/k2think.ts`. Build agents: `agents/marketFetcher.ts` (dual-source Polymarket Gamma API + Kalshi API, keyword-filtered for Iran/oil terms, fetches active + resolved markets, Kalshi candlestick history at 1440min), `agents/statisticalScreener.ts` (screenMarkets, buildLagMatrix, validateCluster — no cluster size cap), `agents/contradictionDetector.ts` (pure logic), `agents/historicalPrecedent.ts` (4 Iran/oil cases: Ukraine 2022, JCPOA 2018, Gulf War 1990, Iran tankers 2019 — findPrecedents takes only keywords, no domain param), `agents/stakeholder.ts` (single export getStakeholders() — no param — returns DOE SPR with EPCA 42 USC 6241 mechanism). Then `orchestrator/index.ts` — runPipeline takes only emit + useCached, no domain param. No domain knowledge agent anywhere. Fastify: single GET /api/run endpoint (no :domain). OpenAI-compatible SDK, NOT Anthropic SDK. Model LLM360/K2-Think-V2. TypeScript, run with tsx."
