# Signal — Backend Spec
## Claude Code Implementation Reference

---

## What the backend does

Pulls prediction market data from Polymarket, runs a **statistical screening layer** entirely in code (cross-correlation lag analysis, volume-weighted signal scoring, regime detection), then passes statistically pre-screened markets to K2 Think V2 for semantic discovery and reasoning. K2 Think V2 never sees raw data — it only reasons about markets that have already passed quantitative filters. If K2 Think V2 rejects a statistically valid cluster (because it cannot find a genuine causal mechanism), the system handles this on a separate track from statistical failures, eventually escalating to a human-reviewable "causally ambiguous" signal rather than failing silently.

**The key architectural principle:** statistical methods do real independent computational work that K2 Think V2 cannot replicate from text alone. K2 Think V2 interprets the quantitative findings — it does not produce them.

---

## Why not CUSUM?

CUSUM (Cumulative Sum Control Chart) detects *change* in a time series — it fires when a market shifts regime. But a market that has been at 72% for 90 days and resolves "yes" is one of your strongest signals. CUSUM would never fire on it because there is no change. In prediction markets, **stability at a high probability is itself a signal** — the crowd reached consensus early and held it. CUSUM punishes exactly this case. The statistical methods used here are selected to reward signal quality, not signal novelty.

---

## Statistical layer — what each method does and why

### 1. Cross-correlation lag analysis

Standard Pearson correlation checks if markets move together at the *same* time. But causally linked markets have propagation delays — one leads and others follow. CPI food prices move first, grocery retail prices follow 7–12 days later, SNAP enrollment responds 14–21 days after that. These delays are deterministic properties of the causal chain, not coincidences.

Cross-correlation shifts one time series by N days and measures Pearson r at each lag from -14 to +14 days. The lag that produces the highest r is the propagation delay between those two markets. This produces a concrete number — "market A leads market B by 9 days" — that K2 Think V2 receives and uses to construct a more precise causal argument. The propagation delays also determine the action recommendation's time window: if the leading market resolves in 22 days and the lag to the downstream event is 9 days, the effective action window is 13 days.

```typescript
function crossCorrelationLag(
  a: number[],
  b: number[],
  maxLag = 14
): LagResult {
  const lagProfile: { lag: number; r: number }[] = [];

  for (let lag = -maxLag; lag <= maxLag; lag++) {
    const aSlice = lag >= 0 ? a.slice(0, a.length - lag)   : a.slice(-lag);
    const bSlice = lag >= 0 ? b.slice(lag)                  : b.slice(0, b.length + lag);
    if (aSlice.length < 7) continue;
    lagProfile.push({ lag, r: pearson(aSlice, bSlice) });
  }

  const best = lagProfile.reduce((a, b) => (a.r > b.r ? a : b));
  return {
    bestLag: best.lag,     // positive = b lags behind a (a leads)
    bestR: best.r,
    lagProfile,
  };
}
```

The lag matrix is computed for every pair in the filtered candidate set. K2 Think V2 receives the full matrix — not just the best pairs — so it can reason about the entire propagation structure.

### 2. Volume-weighted signal scoring

A market at 70% probability on $4k daily volume can be moved by a single trader placing $2,800. The same reading on $180k daily volume represents genuine crowd consensus. A binary volume cutoff ($10k threshold) treats a $10,001 market the same as a $200,000 market. Volume-weighted scoring applies a continuous discount:

```typescript
function volumeWeightedScore(
  probability: number,
  volumeHistory: number[],  // daily volume in USD over 30 days
  maxVolumeInCatalog: number
): number {
  const avgVolume = volumeHistory.reduce((s, v) => s + v, 0) / volumeHistory.length;

  // sqrt scaling: large volume gains matter less at extremes
  const volumeFactor = Math.sqrt(avgVolume / maxVolumeInCatalog);

  // Probability distance from 0.5 — markets far from even are more informative
  const informativenss = Math.abs(probability - 0.5) * 2;

  return volumeFactor * informativenss;
}
```

Markets with `vwScore < 0.15` are excluded before K2 Think V2 ever sees them. K2 Think V2 receives the score for each market it does see and is explicitly told to downweight low-scoring markets in its ranking.

### 3. Regime detection (2-state volatility model)

A market that has been at 65% with ±2% daily variance for three weeks and then starts moving ±8% per day has transitioned from a "stable" regime to a "stressed" regime. This transition is a qualitatively different kind of signal than a market that was always volatile. Stable → stressed transitions often precede large probability moves.

This uses a simplified 2-state model: compute rolling 7-day standard deviation of daily probability changes. When the rolling std dev crosses a threshold (1.5× its own 30-day median), mark that day as a regime transition.

```typescript
function detectRegime(probHistory: number[]): RegimeResult {
  if (probHistory.length < 14) {
    return { regime: 'insufficient_data', transitionDay: null, stressedSince: null };
  }

  const changes = probHistory.slice(1).map((p, i) => Math.abs(p - probHistory[i]));
  const rollingStd: number[] = [];

  for (let i = 6; i < changes.length; i++) {
    const window = changes.slice(i - 6, i + 1);
    const mean = window.reduce((s, x) => s + x, 0) / 7;
    const std = Math.sqrt(window.reduce((s, x) => s + (x - mean) ** 2, 0) / 7);
    rollingStd.push(std);
  }

  const medianStd = [...rollingStd].sort((a, b) => a - b)[Math.floor(rollingStd.length / 2)];
  const threshold = medianStd * 1.5;

  // Find first day where rolling std crossed threshold
  const transitionIdx = rollingStd.findIndex(s => s > threshold);
  const transitionDay = transitionIdx >= 0 ? transitionIdx + 6 : null;

  const currentStd = rollingStd[rollingStd.length - 1] ?? 0;
  const regime: 'stable' | 'transitioning' | 'stressed' =
    currentStd > threshold * 1.5 ? 'stressed' :
    currentStd > threshold        ? 'transitioning' :
    'stable';

  return {
    regime,
    transitionDay,
    stressedSince: transitionDay !== null ? probHistory.length - transitionDay : null,
  };
}
```

A market in "stressed" regime that hasn't resolved is under active pressure. K2 Think V2 uses regime labels to assess urgency. A stable high-probability market is a long-running consensus signal. A recently stressed market is a new development requiring different framing in the recommendation.

---

## Two-track rejection logic

The pipeline can fail in two fundamentally different ways, and the system handles them on separate tracks. This distinction is important — it's the difference between "no signal" and "signal we can't explain," which are very different outputs for a government user.

### Track A: Statistical failure

Markets don't pass the quantitative filters — low volume-weighted score, no lag correlation above 0.50, or K2 Think V2's initial discovery doesn't find a coherent cluster from the filtered set. This means the domain genuinely has no strong signal in Polymarket right now.

**Response:** Retry discovery with different market combinations, up to 3 times. After 3 failures, emit `status: 'no_signal'` with the statistical reason. This is meaningful — it tells the user the domain is quiet in prediction markets today.

### Track B: Causal rejection by K2 Think V2

Markets *do* pass statistical screening — volume is solid, cross-correlation lags are consistent, regime transitions detected — but K2 Think V2 cannot identify a genuine causal mechanism. It can articulate why: "These markets correlate because they both track general election uncertainty, not because of a direct food security causal chain."

This is not a statistical problem. These markets are genuinely moving together. The issue is that the movement has a different explanation than the one the system is looking for.

**Response:** Two sub-cases:

**B1 — Partial rejection:** K2 Think V2 accepts some markets but rejects others as confounded. Drop the rejected markets, re-run correlation validation on the remaining subset, continue if ≥2 markets remain and validation passes.

**B2 — Full causal rejection after retries:** After 2 rounds where stats pass but K2 Think V2 finds no mechanism, escalate to `status: 'causally_ambiguous'`. This is NOT a failure — it is a distinct finding. The report for this outcome says: "Prediction markets in this domain are showing statistically correlated movement that this system cannot explain causally. A human analyst should review whether this represents an emerging signal the model's causal knowledge doesn't cover, or a genuine confounding factor." This output is arguably more interesting to a policy analyst than a clean confirmation, because it surfaces something anomalous.

```typescript
type PipelineStatus =
  | 'confirmed'           // stats pass + K2 Think V2 confirms causal mechanism
  | 'low_confidence'      // stats pass + K2 Think V2 accepts but scores < 50
  | 'no_signal'           // stats fail after 3 retries — domain is quiet
  | 'causally_ambiguous'; // stats pass + K2 Think V2 cannot find mechanism after 2 rounds
```

---

## File structure

```
signal-backend/
├── src/
│   ├── index.ts                    # Fastify server + route registration
│   ├── k2think.ts                  # K2 Think V2 client wrapper
│   ├── types.ts                    # shared TypeScript interfaces
│   ├── fetch/
│   │   ├── polymarket.ts           # Polymarket API client + enrichment
│   │   └── timeseries.ts           # 30-day historical probability + volume fetch
│   ├── stats/
│   │   ├── lagCorrelation.ts       # cross-correlation lag analysis
│   │   ├── volumeWeight.ts         # volume-weighted signal scoring
│   │   ├── regime.ts               # 2-state regime detection
│   │   └── screen.ts               # runs all three, returns screened candidates
│   ├── pipeline/
│   │   ├── discovery.ts            # K2 Think V2 discovery on pre-screened markets
│   │   ├── validation.ts           # Pearson at optimal lag (pure math)
│   │   ├── math.ts                 # K2 Think V2 mathematical reasoning (effort: high)
│   │   ├── causal.ts               # K2 Think V2 causal reasoning (effort: high)
│   │   ├── action.ts               # K2 Think V2 action recommendation (effort: medium)
│   │   ├── report.ts               # K2 Think V2 executive summary (effort: medium)
│   │   ├── counterfactual.ts       # K2 Think V2 stress testing (effort: high)
│   │   └── divergence.ts           # anomaly detection (pure code + K2 Think V2 low)
│   └── orchestrator.ts             # pipeline runner, SSE emitter, retry logic
├── data/
│   └── polymarket-snapshot.json    # pre-cached fallback for demo
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
  probability: number;            // 0–1, current
  volume: number;                 // USD, total
  daysToResolution: number;
  decayWeight: number;            // 0–1, lookup-table first pass
  historicalVolatility: number;   // std dev of daily prob changes
  probHistory: number[];          // 30-day daily probability
  volumeHistory: number[];        // 30-day daily volume in USD
}

// Output of statistical screening — one per market
export interface ScreenedMarket extends EnrichedMarket {
  vwScore: number;                // volume-weighted signal score 0–1
  regime: 'stable' | 'transitioning' | 'stressed' | 'insufficient_data';
  transitionDay: number | null;   // day regime changed (null if stable throughout)
  stressedSince: number | null;   // days since regime became stressed
  passesScreening: boolean;       // vwScore > 0.15 and probHistory.length >= 14
}

// Output of lag analysis — one per market pair
export interface LagResult {
  marketIdA: string;
  marketIdB: string;
  bestLag: number;                // positive = B lags behind A (A leads)
  bestR: number;                  // Pearson r at optimal lag
  lagProfile: { lag: number; r: number }[];
}

// Full lag matrix for a cluster
export interface LagMatrix {
  pairs: LagResult[];
  dominantLeader: string | null;  // market that leads the most pairs
  avgBestR: number;
  propagationSummary: string;     // e.g. "market A leads B by 9d, B leads C by 6d"
}

export interface ValidationResult {
  pairs: { ids: [string, string]; r: number; lag: number }[];
  avgR: number;
  passed: boolean;
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
  mathSignalReasoning: string;
}

export interface CausalAnalysis {
  causalMechanism: string;
  confoundingRisk: 'none' | 'low' | 'medium' | 'high';
  confoundingExplanation: string;
  // B1 partial rejection: which markets K2 Think V2 is rejecting and why
  rejectedMarketIds: string[];
  rejectionReasons: Record<string, string>;
  timeDecayNote: string;
  signalConfirmed: boolean;
  confidenceScore: number;
  confidenceReasoning: string;
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
  validationResult: ValidationResult | null;
  mathAnalysis: MathAnalysis | null;
  causalAnalysis: CausalAnalysis | null;
  recommendation: ActionRecommendation | null;
  report: ReportContent | null;
  retryCount: number;
  causalRetryCount: number;
  status: PipelineStatus;
  statusReason: string;
}

export interface PipelineEvent {
  step: 'fetch' | 'screen' | 'lag' | 'discovery' | 'validation'
      | 'math' | 'causal' | 'action' | 'report' | 'done' | 'error';
  status: 'running' | 'streaming' | 'complete' | 'failed' | 'retry' | 'ambiguous';
  data?: unknown;
  message?: string;
  retryCount?: number;
  causalRetryCount?: number;
}

export interface ActionRecommendation {
  actor: string;
  action: string;
  geography: string;
  timeWindow: string;
  effectiveWindowDays: number;    // derived from daysToResolution minus propagation lag
  reasoning: string;
  confidenceScore: number;
  confidenceIntervalLow: number;
  confidenceIntervalHigh: number;
  avgDecayWeight: number;
  jointPosteriorProbability: number;
}

export interface ReportContent {
  title: string;
  executiveSummary: string;
  causalReasoningProse: string;
  generatedAt: string;
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

export interface DivergenceAlert {
  marketIdA: string;
  marketIdB: string;
  titleA: string;
  titleB: string;
  probA: number;
  probB: number;
  divergenceMagnitude: number;
  possibleExplanations: string[];
  severity: 'low' | 'medium' | 'high';
}

export interface DivergenceResult {
  alerts: DivergenceAlert[];
  hasCriticalDivergence: boolean;
  summaryNote: string;
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

export async function callK2Think(prompt: string, effort: ReasoningEffort): Promise<string> {
  const res = await client.chat.completions.create({
    model: 'LLM360/K2-Think-V2',
    messages: [
      { role: 'system', content: 'You are K2-Think, a helpful assistant created by MBZUAI IFM.' },
      { role: 'user',   content: prompt },
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
      { role: 'system', content: 'You are K2-Think, a helpful assistant created by MBZUAI IFM.' },
      { role: 'user',   content: prompt },
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

// Strips markdown fences if K2 Think wraps output
export function parseK2Json<T>(raw: string): T {
  const cleaned = raw
    .replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/i, '').trim();
  return JSON.parse(cleaned) as T;
}
```

**reasoning_effort by step:**

| Step | Effort | Reason |
|---|---|---|
| Discovery | `low` | Ranking pre-screened candidates — fast |
| Validation | none | Pure Pearson math |
| Math reasoning | `high` | Bayesian derivation, CI, decay weights |
| Causal reasoning | `high` | Must commit to mechanism, catch confounders |
| Action | `medium` | Structured output with moderate complexity |
| Report prose | `medium` | Plain-language writing, not deep reasoning |
| Counterfactual | `high` | Re-deriving math under new constraints |
| Divergence explain | `low` | Short explanations only when anomalies found |

---

## Statistical screening (`src/stats/`)

### `src/stats/lagCorrelation.ts`

```typescript
import type { EnrichedMarket, LagResult, LagMatrix } from '../types.js';

function pearson(a: number[], b: number[]): number {
  const n = a.length;
  const ma = a.reduce((s, x) => s + x, 0) / n;
  const mb = b.reduce((s, x) => s + x, 0) / n;
  const num = a.reduce((s, x, i) => s + (x - ma) * (b[i] - mb), 0);
  const da  = Math.sqrt(a.reduce((s, x) => s + (x - ma) ** 2, 0));
  const db  = Math.sqrt(b.reduce((s, x) => s + (x - mb) ** 2, 0));
  if (da === 0 || db === 0) return 0;
  return num / (da * db);
}

export function crossCorrelationLag(
  a: number[], b: number[], maxLag = 14
): { bestLag: number; bestR: number; lagProfile: { lag: number; r: number }[] } {
  const lagProfile: { lag: number; r: number }[] = [];

  for (let lag = -maxLag; lag <= maxLag; lag++) {
    const aSlice = lag >= 0 ? a.slice(0, a.length - lag) : a.slice(-lag);
    const bSlice = lag >= 0 ? b.slice(lag)               : b.slice(0, b.length + lag);
    if (aSlice.length < 7) continue;
    lagProfile.push({ lag, r: pearson(aSlice, bSlice) });
  }

  const best = lagProfile.reduce((a, b) => (a.r > b.r ? a : b));
  return { bestLag: best.lag, bestR: best.r, lagProfile };
}

export function buildLagMatrix(markets: EnrichedMarket[]): LagMatrix {
  const pairs: LagResult[] = [];
  const leaderCount: Record<string, number> = {};

  for (let i = 0; i < markets.length; i++) {
    for (let j = i + 1; j < markets.length; j++) {
      const a = markets[i].probHistory;
      const b = markets[j].probHistory;
      if (!a || !b || a.length < 14 || b.length < 14) continue;

      const result = crossCorrelationLag(a, b);
      pairs.push({
        marketIdA: markets[i].id,
        marketIdB: markets[j].id,
        ...result,
      });

      // Positive lag means A leads B
      if (result.bestLag > 0) {
        leaderCount[markets[i].id] = (leaderCount[markets[i].id] ?? 0) + 1;
      } else if (result.bestLag < 0) {
        leaderCount[markets[j].id] = (leaderCount[markets[j].id] ?? 0) + 1;
      }
    }
  }

  const avgBestR = pairs.length > 0
    ? pairs.reduce((s, p) => s + p.bestR, 0) / pairs.length : 0;

  const dominantLeader = Object.keys(leaderCount).length > 0
    ? Object.entries(leaderCount).sort((a, b) => b[1] - a[1])[0][0]
    : null;

  // Build human-readable propagation summary
  const sortedPairs = [...pairs].sort((a, b) => b.bestR - a.bestR).slice(0, 3);
  const propagationSummary = sortedPairs.map(p => {
    const aTitle = markets.find(m => m.id === p.marketIdA)?.title.slice(0, 25) ?? p.marketIdA;
    const bTitle = markets.find(m => m.id === p.marketIdB)?.title.slice(0, 25) ?? p.marketIdB;
    return p.bestLag > 0
      ? `"${aTitle}…" leads "${bTitle}…" by ${p.bestLag}d (r=${p.bestR.toFixed(2)})`
      : p.bestLag < 0
      ? `"${bTitle}…" leads "${aTitle}…" by ${Math.abs(p.bestLag)}d (r=${p.bestR.toFixed(2)})`
      : `"${aTitle}…" and "${bTitle}…" move simultaneously (r=${p.bestR.toFixed(2)})`;
  }).join('. ');

  return { pairs, dominantLeader, avgBestR, propagationSummary };
}
```

### `src/stats/volumeWeight.ts`

```typescript
export function computeVolumeWeightedScore(
  probability: number,
  volumeHistory: number[],
  maxVolumeInCatalog: number
): number {
  if (volumeHistory.length === 0 || maxVolumeInCatalog === 0) return 0;

  const avgVolume = volumeHistory.reduce((s, v) => s + v, 0) / volumeHistory.length;
  // sqrt scaling so large volumes don't dominate entirely
  const volumeFactor = Math.sqrt(avgVolume / maxVolumeInCatalog);
  // Informativeness: how far from the 50/50 baseline
  const informativeness = Math.abs(probability - 0.5) * 2;

  return Math.min(1, volumeFactor * informativeness);
}
```

### `src/stats/regime.ts`

```typescript
export interface RegimeResult {
  regime: 'stable' | 'transitioning' | 'stressed' | 'insufficient_data';
  transitionDay: number | null;
  stressedSince: number | null;
  rollingStd: number[];
}

export function detectRegime(probHistory: number[]): RegimeResult {
  if (probHistory.length < 14) {
    return { regime: 'insufficient_data', transitionDay: null, stressedSince: null, rollingStd: [] };
  }

  const changes = probHistory.slice(1).map((p, i) => Math.abs(p - probHistory[i]));
  const rollingStd: number[] = [];

  for (let i = 6; i < changes.length; i++) {
    const window = changes.slice(i - 6, i + 1);
    const mean = window.reduce((s, x) => s + x, 0) / 7;
    const std  = Math.sqrt(window.reduce((s, x) => s + (x - mean) ** 2, 0) / 7);
    rollingStd.push(std);
  }

  const sorted = [...rollingStd].sort((a, b) => a - b);
  const medianStd  = sorted[Math.floor(sorted.length / 2)];
  const threshold  = medianStd * 1.5;

  const transitionIdx = rollingStd.findIndex(s => s > threshold);
  const transitionDay = transitionIdx >= 0 ? transitionIdx + 6 : null;

  const currentStd = rollingStd[rollingStd.length - 1] ?? 0;
  const regime: RegimeResult['regime'] =
    currentStd > threshold * 1.5 ? 'stressed'      :
    currentStd > threshold        ? 'transitioning' : 'stable';

  return {
    regime,
    transitionDay,
    stressedSince: transitionDay !== null ? probHistory.length - transitionDay : null,
    rollingStd,
  };
}
```

### `src/stats/screen.ts`

```typescript
import { differenceInDays, parseISO } from 'date-fns';
import { computeVolumeWeightedScore } from './volumeWeight.js';
import { detectRegime } from './regime.js';
import { computeDecayWeight } from '../fetch/polymarket.js';
import type { EnrichedMarket, ScreenedMarket } from '../types.js';

export function screenMarkets(
  markets: EnrichedMarket[],
  excludeIds: string[] = []
): ScreenedMarket[] {
  const eligible = markets.filter(m =>
    !excludeIds.includes(m.id) &&
    m.probHistory && m.probHistory.length >= 14 &&
    m.volumeHistory && m.volumeHistory.length > 0
  );

  // Find max volume across catalog for normalization
  const maxVolume = Math.max(...eligible.map(m =>
    m.volumeHistory.reduce((s, v) => s + v, 0) / m.volumeHistory.length
  ), 1);

  return eligible.map(m => {
    const vwScore     = computeVolumeWeightedScore(m.probability, m.volumeHistory, maxVolume);
    const regimeResult = detectRegime(m.probHistory!);

    return {
      ...m,
      vwScore,
      regime: regimeResult.regime,
      transitionDay: regimeResult.transitionDay,
      stressedSince: regimeResult.stressedSince,
      passesScreening: vwScore > 0.15 && regimeResult.regime !== 'insufficient_data',
    };
  }).filter(m => m.passesScreening);
}
```

---

## Pipeline steps

### Discovery (`src/pipeline/discovery.ts`)

K2 Think V2 receives pre-screened markets — it ranks and selects, it does not filter. The lag matrix and regime labels give it quantitative grounding for its ranking.

```typescript
import { callK2Think, parseK2Json } from '../k2think.js';
import type { ScreenedMarket, LagMatrix } from '../types.js';

const DOMAIN_KEYWORDS: Record<string, string[]> = {
  food:    ['food', 'CPI', 'grocery', 'SNAP', 'USDA', 'hunger', 'commodity', 'crop'],
  energy:  ['energy', 'gas', 'grid', 'ERCOT', 'blackout', 'oil', 'utility', 'electric'],
  housing: ['eviction', 'rent', 'HUD', 'shelter', 'mortgage', 'housing', 'homeless'],
  labor:   ['unemployment', 'payroll', 'layoff', 'jobs', 'workforce', 'wages'],
};

interface DiscoveryResult {
  selectedIds: string[];
  causalRanking: string[];   // ordered by causal importance, not probability
  selectionReasoning: string;
  rejectedIds: string[];
  rejectionReasons: Record<string, string>;
}

export async function runDiscovery(
  screened: ScreenedMarket[],
  lagMatrix: LagMatrix,
  domain: string,
  excludeIds: string[] = []
): Promise<{ cluster: ScreenedMarket[]; result: DiscoveryResult }> {
  const candidates = screened.filter(m => !excludeIds.includes(m.id));

  // Keyword pre-filter narrows the list K2 Think V2 receives
  const keywords = DOMAIN_KEYWORDS[domain] ?? [];
  const keywordMatched = candidates.filter(m =>
    keywords.some(kw => m.title.toLowerCase().includes(kw))
  );
  // Fall back to all candidates if keyword filter is too aggressive
  const toRank = keywordMatched.length >= 2 ? keywordMatched : candidates;

  const prompt = `
You are selecting and ranking prediction markets for signal analysis in the domain: ${domain}.

These markets have already passed statistical screening:
- Volume-weighted signal score > 0.15 (thin liquidity markets excluded)
- 14+ days of probability history available

STATISTICALLY SCREENED CANDIDATES:
${JSON.stringify(toRank.map(m => ({
  id: m.id,
  title: m.title,
  probability: m.probability,
  daysToResolution: m.daysToResolution,
  decayWeight: m.decayWeight,
  vwScore: m.vwScore,
  regime: m.regime,
  stressedSince: m.stressedSince,
})), null, 2)}

CROSS-CORRELATION LAG STRUCTURE:
${lagMatrix.propagationSummary}

Full lag matrix (top pairs by r):
${JSON.stringify(lagMatrix.pairs
  .filter(p => toRank.some(m => m.id === p.marketIdA) && toRank.some(m => m.id === p.marketIdB))
  .sort((a, b) => b.bestR - a.bestR)
  .slice(0, 10)
  .map(p => ({ ...p, lagProfile: undefined })), null, 2)}

Your task:
1. Select 2–5 markets that form a coherent causal cluster for ${domain}.
2. Rank them by causal importance (which market is the leading indicator vs lagging confirmation).
   Use the lag structure — positive bestLag means market A leads market B.
3. For any market you REJECT, state the specific reason.
   Valid rejection reasons: "confounded by [X]", "correlates on volume not substance",
   "lag relationship inconsistent with causal direction", "regime change unexplained".
4. Do NOT reject a market simply because its probability is moderate.
   A stable 55% market with strong volume and consistent lag leadership is valuable.

Return ONLY valid JSON — no preamble, no markdown fences.

{
  "selectedIds": ["id1", "id2"],
  "causalRanking": ["id1", "id2"],
  "selectionReasoning": "...",
  "rejectedIds": ["id3"],
  "rejectionReasons": { "id3": "specific reason" }
}
`.trim();

  const raw = await callK2Think(prompt, 'low');
  const result = parseK2Json<DiscoveryResult>(raw);
  const cluster = toRank.filter(m => result.selectedIds.includes(m.id));

  return { cluster, result };
}
```

### Validation (`src/pipeline/validation.ts`)

Uses the optimal lag from the lag matrix rather than lag=0 Pearson. A pair that correlates best at lag=9 is measured at lag=9, not at the same time.

```typescript
import type { ScreenedMarket, LagMatrix, ValidationResult } from '../types.js';

function pearson(a: number[], b: number[]): number {
  const n = a.length;
  const ma = a.reduce((s, x) => s + x, 0) / n;
  const mb = b.reduce((s, x) => s + x, 0) / n;
  const num = a.reduce((s, x, i) => s + (x - ma) * (b[i] - mb), 0);
  const da  = Math.sqrt(a.reduce((s, x) => s + (x - ma) ** 2, 0));
  const db  = Math.sqrt(b.reduce((s, x) => s + (x - mb) ** 2, 0));
  if (da === 0 || db === 0) return 0;
  return num / (da * db);
}

function pearsonAtLag(a: number[], b: number[], lag: number): number {
  const aSlice = lag >= 0 ? a.slice(0, a.length - lag) : a.slice(-lag);
  const bSlice = lag >= 0 ? b.slice(lag)               : b.slice(0, b.length + lag);
  if (aSlice.length < 7) return 0;
  return pearson(aSlice, bSlice);
}

export function validateCluster(
  cluster: ScreenedMarket[],
  lagMatrix: LagMatrix
): ValidationResult {
  const pairs: { ids: [string, string]; r: number; lag: number }[] = [];

  for (let i = 0; i < cluster.length; i++) {
    for (let j = i + 1; j < cluster.length; j++) {
      const a = cluster[i].probHistory;
      const b = cluster[j].probHistory;
      if (!a || !b) continue;

      // Find the best lag from the pre-computed matrix
      const matrixEntry = lagMatrix.pairs.find(
        p => (p.marketIdA === cluster[i].id && p.marketIdB === cluster[j].id) ||
             (p.marketIdA === cluster[j].id && p.marketIdB === cluster[i].id)
      );
      const optimalLag = matrixEntry?.bestLag ?? 0;
      const r = pearsonAtLag(a, b, optimalLag);

      pairs.push({ ids: [cluster[i].id, cluster[j].id], r, lag: optimalLag });
    }
  }

  const avgR = pairs.length > 0
    ? pairs.reduce((s, p) => s + p.r, 0) / pairs.length : 0;

  return { pairs, avgR, passed: pairs.length > 0 && pairs.every(p => p.r >= 0.50) };
}
```

### Math reasoning (`src/pipeline/math.ts`)

K2 Think V2 now receives the lag structure and regime labels alongside the market data. The propagation delays feed directly into the CI and action window calculations.

```typescript
import { callK2ThinkStream, parseK2Json } from '../k2think.js';
import type { ScreenedMarket, LagMatrix, ValidationResult, MathAnalysis } from '../types.js';

export async function runMathAnalysis(
  cluster: ScreenedMarket[],
  lagMatrix: LagMatrix,
  validation: ValidationResult,
  onToken: (t: string) => void
): Promise<MathAnalysis> {
  const prompt = `
You are performing advanced mathematical analysis on prediction market signals.
Show all derivations step by step.

CLUSTER:
${JSON.stringify(cluster.map(m => ({
  id: m.id, title: m.title, probability: m.probability,
  daysToResolution: m.daysToResolution, decayWeight: m.decayWeight,
  vwScore: m.vwScore, regime: m.regime, stressedSince: m.stressedSince,
  historicalVolatility: m.historicalVolatility, probHistory: m.probHistory,
})), null, 2)}

CROSS-CORRELATION LAG STRUCTURE:
${lagMatrix.propagationSummary}
Avg best-lag r: ${lagMatrix.avgBestR.toFixed(3)}
Dominant leading market: ${lagMatrix.dominantLeader ?? 'none identified'}

PEARSON VALIDATION (at optimal lags):
${JSON.stringify(validation, null, 2)}

Perform four analyses:

1. CORRELATION DECAY
   How much should each pair's r be discounted given daysToResolution and
   historicalVolatility? A low-volatility market near resolution is highly reliable.
   A high-volatility market far from resolution is not.
   Derive adjustedCorrelationConfidence (0–1) for the cluster.

2. JOINT POSTERIOR PROBABILITY
   Using Bayesian reasoning, compute the probability that the underlying ${cluster[0]?.id ?? 'domain'}
   event materializes. Account for correlation structure — correlated markets share
   information, so do not multiply independent probabilities.
   Also account for vwScore — low-vwScore markets contribute less to the posterior.
   Show full derivation in jointPosteriorReasoning.

3. CONFIDENCE INTERVAL
   Using historicalVolatility per market, derive the 80% CI on the joint posterior.
   Report confidenceIntervalLow and confidenceIntervalHigh as 0–1 probabilities.

4. DERIVED DECAY WEIGHTS
   Improve on the lookup-table decayWeight using:
   weight_i = base_decay × (1 - σ_i / σ_max) × vwScore_i
   where σ_i = historicalVolatility. Show derivation.

Return ONLY valid JSON — no preamble, no markdown fences.

{
  "correlationDecayAssessment": "...",
  "adjustedCorrelationConfidence": 0.0,
  "jointPosteriorProbability": 0.0,
  "jointPosteriorReasoning": "step-by-step...",
  "confidenceIntervalLow": 0.0,
  "confidenceIntervalHigh": 0.0,
  "confidenceIntervalReasoning": "...",
  "derivedDecayWeights": {},
  "decayDerivationReasoning": "...",
  "mathSignalStrength": 0,
  "mathSignalReasoning": "..."
}
`.trim();

  const raw = await callK2ThinkStream(prompt, 'high', onToken);
  return parseK2Json<MathAnalysis>(raw);
}
```

### Causal reasoning (`src/pipeline/causal.ts`)

Receives the lag structure and regime labels. The propagation delays make causal arguments precise. Handles both Track A (statistical failure) and Track B (causal rejection) via its output.

```typescript
import { callK2ThinkStream, parseK2Json } from '../k2think.js';
import type { ScreenedMarket, LagMatrix, MathAnalysis, ValidationResult, CausalAnalysis } from '../types.js';

export async function runCausalReasoning(
  domain: string,
  cluster: ScreenedMarket[],
  lagMatrix: LagMatrix,
  validation: ValidationResult,
  math: MathAnalysis,
  onToken: (t: string) => void,
  previousRejections: string[] = []
): Promise<CausalAnalysis> {
  const rejectionNote = previousRejections.length > 0
    ? `\nPREVIOUS CAUSAL REJECTIONS IN THIS RUN:\n${previousRejections.join('\n')}\nDo not repeat these rejected explanations.`
    : '';

  const prompt = `
You are validating whether correlated prediction markets represent a REAL causal
signal or a SPURIOUS correlation for the domain: ${domain}.${rejectionNote}

CLUSTER:
${JSON.stringify(cluster.map(m => ({
  id: m.id, title: m.title, probability: m.probability,
  daysToResolution: m.daysToResolution, vwScore: m.vwScore,
  regime: m.regime, stressedSince: m.stressedSince,
})), null, 2)}

STATISTICAL FINDINGS:
- Propagation structure: ${lagMatrix.propagationSummary}
- Dominant leader: ${lagMatrix.dominantLeader ?? 'none'}
- Avg cross-lag r: ${lagMatrix.avgBestR.toFixed(3)}
- Math signal strength: ${math.mathSignalStrength}/100
- Joint posterior: ${math.jointPosteriorProbability.toFixed(3)}
- 80% CI: [${math.confidenceIntervalLow.toFixed(3)}, ${math.confidenceIntervalHigh.toFixed(3)}]

Answer all four:

1. CAUSAL MECHANISM
   Write the specific causal chain using the propagation delays the statistics found.
   Example: "Market A (CPI food) leads market B (grocery prices) by ~${lagMatrix.pairs[0]?.bestLag ?? 'N'}d
   because commodity cost increases take [mechanism] weeks to reach retail shelves.
   Market B then leads market C (SNAP) by ~${lagMatrix.pairs[1]?.bestLag ?? 'N'}d because [mechanism]."
   The lag values are quantitative constraints — your causal chain must be consistent with them.
   "They are both economic indicators" is NOT a mechanism.

2. PARTIAL REJECTION (if applicable)
   If any specific markets in the cluster do NOT fit the causal chain:
   - List their IDs in rejectedMarketIds
   - Give a specific rejection reason for each in rejectionReasons
   - The remaining markets can still form a valid signal
   If all markets fit, rejectedMarketIds should be empty.

3. CONFOUNDING CHECK
   Could a shared external driver explain the correlation AND the lag structure?
   Lag structure makes confounding harder to sustain — a confounder must explain
   why market A consistently leads market B by exactly N days.
   Name any confounder explicitly.

4. VERDICT
   Start at math signal strength: ${math.mathSignalStrength}
   - Subtract 30: weak or speculative causal mechanism
   - Subtract 25: high confounding risk
   - Subtract 10: medium confounding risk
   - Subtract 15: lag structure inconsistent with proposed mechanism
   - Add 10: lag values precisely match known domain propagation times
   Confirmed only if final score >= 50.

Return ONLY valid JSON — no preamble, no markdown fences.

{
  "causalMechanism": "...",
  "confoundingRisk": "none | low | medium | high",
  "confoundingExplanation": "...",
  "rejectedMarketIds": [],
  "rejectionReasons": {},
  "timeDecayNote": "...",
  "signalConfirmed": true | false,
  "confidenceScore": 0-100,
  "confidenceReasoning": "..."
}
`.trim();

  const raw = await callK2ThinkStream(prompt, 'high', onToken);
  return parseK2Json<CausalAnalysis>(raw);
}
```

---

## Orchestrator (`src/orchestrator.ts`)

The orchestrator now manages both retry tracks explicitly. Statistical failures and causal failures follow separate paths with separate counters.

```typescript
import { fetchMarkets, loadSnapshot } from './fetch/polymarket.js';
import { attachProbHistory }           from './fetch/timeseries.js';
import { screenMarkets }               from './stats/screen.js';
import { buildLagMatrix }              from './stats/lagCorrelation.js';
import { runDiscovery }                from './pipeline/discovery.js';
import { validateCluster }             from './pipeline/validation.js';
import { runDivergenceDetection }      from './pipeline/divergence.js';
import { runMathAnalysis }             from './pipeline/math.js';
import { runCausalReasoning }          from './pipeline/causal.js';
import { runActionRecommendation }     from './pipeline/action.js';
import { generateReport }              from './pipeline/report.js';
import type { PipelineEvent, PipelineResult, ScreenedMarket } from './types.js';

const MAX_STAT_RETRIES   = 3;  // Track A: statistical failures
const MAX_CAUSAL_RETRIES = 2;  // Track B: causal rejections before ambiguous flag

export async function runPipeline(
  domain: string,
  emit: (e: PipelineEvent) => void,
  useCached = false
): Promise<PipelineResult> {

  // ── Step 1: Fetch ──────────────────────────────────────────────────────────
  emit({ step: 'fetch', status: 'running' });
  let markets = useCached ? await loadSnapshot() : await fetchMarkets(200);
  markets = await attachProbHistory(markets);
  emit({ step: 'fetch', status: 'complete', data: { count: markets.length } });

  // ── Step 2: Statistical screening ─────────────────────────────────────────
  emit({ step: 'screen', status: 'running' });
  const screened = screenMarkets(markets);
  emit({ step: 'screen', status: 'complete', data: {
    total: markets.length,
    passed: screened.length,
    regimeSummary: {
      stable:        screened.filter(m => m.regime === 'stable').length,
      transitioning: screened.filter(m => m.regime === 'transitioning').length,
      stressed:      screened.filter(m => m.regime === 'stressed').length,
    }
  }});

  // ── Step 3: Lag matrix (on screened candidates only) ──────────────────────
  emit({ step: 'lag', status: 'running' });
  const lagMatrix = buildLagMatrix(screened);
  emit({ step: 'lag', status: 'complete', data: lagMatrix });

  // ── Track A loop: discovery + validation ──────────────────────────────────
  let statRetry = 0;
  let excludeIds: string[] = [];
  let rejectedClusters: PipelineResult['rejectedClusters'] = [];
  let cluster: ScreenedMarket[] = [];
  let discoveryResult: any;
  let validation: any;

  while (statRetry <= MAX_STAT_RETRIES) {
    emit({ step: 'discovery', status: statRetry > 0 ? 'retry' : 'running', retryCount: statRetry });
    const disc = await runDiscovery(screened, lagMatrix, domain, excludeIds);
    cluster = disc.cluster;
    discoveryResult = disc.result;
    emit({ step: 'discovery', status: 'complete', data: { cluster, lagMatrix, result: discoveryResult } });

    // Divergence detection runs in parallel with validation
    emit({ step: 'validation', status: 'running' });
    const [val, divergence] = await Promise.all([
      validateCluster(cluster, lagMatrix),
      runDivergenceDetection(screened, domain),
    ]);
    validation = val;
    emit({ step: 'validation', status: 'complete', data: { validation, divergence, cluster, rejectedClusters } });

    if (validation.passed) break;

    // Statistical failure — exclude and retry
    rejectedClusters.push({ markets: cluster, reason: `avg r = ${validation.avgR.toFixed(2)} < 0.50`, avgR: validation.avgR });
    excludeIds = [...excludeIds, ...cluster.map(m => m.id)];
    statRetry++;

    if (statRetry > MAX_STAT_RETRIES) {
      const reason = 'No statistically correlated cluster found after 3 attempts. Domain signal is weak in current Polymarket data.';
      emit({ step: 'done', status: 'complete', data: { status: 'no_signal', reason } });
      return buildResult({ domain, markets, screened, lagMatrix, cluster: [], rejectedClusters, validation: null, math: null, causal: null, recommendation: null, report: null, statRetry, causalRetry: 0, status: 'no_signal', statusReason: reason });
    }
  }

  // ── Track B loop: math + causal with partial rejection handling ───────────
  let causalRetry = 0;
  let previousRejections: string[] = [];
  let math: any;
  let causal: any;

  while (causalRetry <= MAX_CAUSAL_RETRIES) {

    // Math analysis (streaming)
    emit({ step: 'math', status: causalRetry > 0 ? 'retry' : 'running', causalRetryCount: causalRetry });
    math = await runMathAnalysis(cluster, lagMatrix, validation, (token) => {
      emit({ step: 'math', status: 'streaming', data: { partial: token } });
    });
    emit({ step: 'math', status: 'complete', data: math });

    // Causal reasoning (streaming)
    emit({ step: 'causal', status: causalRetry > 0 ? 'retry' : 'running', causalRetryCount: causalRetry });
    causal = await runCausalReasoning(domain, cluster, lagMatrix, validation, math, (token) => {
      emit({ step: 'causal', status: 'streaming', data: { partial: token } });
    }, previousRejections);
    emit({ step: 'causal', status: 'complete', data: causal });

    if (causal.signalConfirmed) break;

    // ── Track B1: partial rejection — drop flagged markets and re-validate ──
    if (causal.rejectedMarketIds.length > 0 && causal.rejectedMarketIds.length < cluster.length - 1) {
      const rejectionSummary = Object.entries(causal.rejectionReasons)
        .map(([id, reason]) => `${id}: ${reason}`).join('; ');
      previousRejections.push(`Causal attempt ${causalRetry + 1} rejected markets [${causal.rejectedMarketIds.join(', ')}] — ${rejectionSummary}`);

      cluster = cluster.filter(m => !causal.rejectedMarketIds.includes(m.id));
      validation = validateCluster(cluster, lagMatrix);

      if (!validation.passed) {
        // Dropping markets broke statistical validity — escalate
        causalRetry = MAX_CAUSAL_RETRIES + 1;
        break;
      }
      causalRetry++;
      continue;
    }

    // ── Track B2: full causal rejection ────────────────────────────────────
    previousRejections.push(`Causal attempt ${causalRetry + 1}: no mechanism found. Score: ${causal.confidenceScore}`);
    causalRetry++;

    if (causalRetry > MAX_CAUSAL_RETRIES) break;
  }

  // ── Causally ambiguous escalation ─────────────────────────────────────────
  if (!causal?.signalConfirmed) {
    const reason = causal?.confidenceScore < 50
      ? `K2 Think V2 found statistically correlated markets but could not confirm a causal mechanism after ${causalRetry} attempt(s). Human analyst review recommended.`
      : `Signal below confidence threshold (${causal?.confidenceScore}/100).`;

    const status = causalRetry > MAX_CAUSAL_RETRIES ? 'causally_ambiguous' : 'low_confidence';
    emit({ step: 'done', status: status === 'causally_ambiguous' ? 'ambiguous' : 'complete', data: { status, reason } });
    return buildResult({ domain, markets, screened, lagMatrix, cluster, rejectedClusters, validation, math, causal, recommendation: null, report: null, statRetry, causalRetry, status, statusReason: reason });
  }

  // ── Action recommendation ──────────────────────────────────────────────────
  emit({ step: 'action', status: 'running' });
  const recommendation = await runActionRecommendation(domain, cluster, lagMatrix, math, causal);
  emit({ step: 'action', status: 'complete', data: recommendation });

  // ── Report generation ──────────────────────────────────────────────────────
  emit({ step: 'report', status: 'running' });
  const report = await generateReport({ domain, selectedCluster: cluster, lagMatrix, mathAnalysis: math, causalAnalysis: causal, recommendation });
  emit({ step: 'report', status: 'complete', data: report });

  emit({ step: 'done', status: 'complete', data: { status: 'confirmed' } });
  return buildResult({ domain, markets, screened, lagMatrix, cluster, rejectedClusters, validation, math, causal, recommendation, report, statRetry, causalRetry, status: 'confirmed', statusReason: 'Signal confirmed with causal mechanism.' });
}

function buildResult(args: any): PipelineResult {
  return {
    domain: args.domain,
    enrichedMarkets: args.markets,
    screenedMarkets: args.screened,
    lagMatrix: args.lagMatrix,
    selectedCluster: args.cluster,
    rejectedClusters: args.rejectedClusters,
    validationResult: args.validation,
    mathAnalysis: args.math,
    causalAnalysis: args.causal,
    recommendation: args.recommendation,
    report: args.report,
    retryCount: args.statRetry,
    causalRetryCount: args.causalRetry,
    status: args.status,
    statusReason: args.statusReason,
  };
}
```

---

## Fastify server (`src/index.ts`)

```typescript
import Fastify from 'fastify';
import cors from '@fastify/cors';
import { runPipeline }        from './orchestrator.js';
import { runCounterfactual }  from './pipeline/counterfactual.js';
import type { PipelineEvent } from './types.js';

const app = Fastify({ logger: true });
await app.register(cors, { origin: 'http://localhost:5173' });

// Main SSE pipeline endpoint
app.get('/api/run/:domain', async (req, reply) => {
  const { domain }  = req.params as { domain: string };
  const useCached   = (req.query as any).cached === 'true';

  reply.raw.writeHead(200, {
    'Content-Type':  'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection':    'keep-alive',
  });

  const emit = (e: PipelineEvent) => reply.raw.write(`data: ${JSON.stringify(e)}\n\n`);

  try {
    await runPipeline(domain, emit, useCached);
  } catch (err) {
    emit({ step: 'error', status: 'failed', message: String(err) });
  } finally {
    reply.raw.end();
  }
});

// Counterfactual stress-test endpoint
app.post('/api/counterfactual', async (req, reply) => {
  const body = req.body as any;
  const result = await runCounterfactual(
    body.domain, body.cluster, body.lagMatrix, body.math, body.causal, body.request
  );
  return reply.send(result);
});

app.get('/health', async () => ({ ok: true }));
await app.listen({ port: Number(process.env.PORT ?? 3001), host: '0.0.0.0' });
```

---

## Pre-hackathon checklist

- [ ] Confirm K2 Think V2 access (Cerebras credits, Together.ai, Fireworks, or local vLLM)
- [ ] Test `reasoning_effort: "high"` streaming call end to end
- [ ] `curl` Polymarket and save snapshot to `data/polymarket-snapshot.json`
- [ ] Verify the timeseries endpoint returns volumeHistory — some markets may not have it; have fallback synthetic volume ready
- [ ] Pre-run the full pipeline on food domain, save all SSE events as JSON for demo replay
- [ ] Have 2022 commodity spike lead-time numbers ready: ~42 days ahead of USDA acknowledgment

---

## Quick start prompt for Claude Code

> "Build the Signal backend using this spec. Start with `src/types.ts`, then `src/k2think.ts` with `callK2Think`, `callK2ThinkStream`, and `parseK2Json`. Then `src/fetch/polymarket.ts` and `src/fetch/timeseries.ts` including `volumeHistory`. Then the stats layer in order: `src/stats/volumeWeight.ts`, `src/stats/regime.ts`, `src/stats/lagCorrelation.ts`, `src/stats/screen.ts`. Then pipeline steps: `discovery.ts` (receives screened markets + lagMatrix), `validation.ts` (uses optimal lag per pair), `math.ts` (streaming, receives lagMatrix), `causal.ts` (streaming, receives lagMatrix + previousRejections, handles partial rejection via rejectedMarketIds), `action.ts`, `report.ts`, `counterfactual.ts`, `divergence.ts`. Wire `orchestrator.ts` with both retry tracks. Then `index.ts`. Use OpenAI-compatible SDK — NOT Anthropic SDK. Model is `LLM360/K2-Think-V2`. TypeScript throughout, run with `tsx`."
