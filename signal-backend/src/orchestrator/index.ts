import { fetchAndEnrich, loadSnapshot }   from '../agents/marketFetcher.js';
import { generateSearchStrategy }          from '../agents/searchStrategy.js';
import { callK2Think, parseK2Json }        from '../k2think.js';
import { getDomain }                       from '../domains.js';
import type { DomainConfig }               from '../domains.js';
import { generateReport }                  from '../pipeline/report.js';
import type {
  EnrichedMarket, ScoredMarket,
  CausalAnalysis, ActionDirective,
  PipelineResult, PipelineEvent,
} from '../types.js';

// ── Market scoring ────────────────────────────────────────────────────────────
// Pick the 5 markets with the strongest, most actionable signal.

function scoreMarket(m: EnrichedMarket, maxVolume: number): number {
  // How far from 50%? (0 = coin flip, 1 = certainty)
  const conviction = Math.abs(m.probability - 0.5) * 2;

  // Volume normalised to [0,1] via sqrt (diminishing returns)
  const volNorm = maxVolume > 0 ? Math.sqrt(m.volume / maxVolume) : 0;

  // Time urgency — resolved markets are useful as precedents but lower priority
  const recency = m.isResolved
    ? 0.2
    : m.daysToResolution <= 14 ? 1.0
    : m.daysToResolution <= 45 ? 0.7
    : m.daysToResolution <= 90 ? 0.4
    : 0.1;

  // Needs enough history to be meaningful
  const hasHistory = m.probHistory.length >= 7 ? 1 : 0.3;

  return conviction * 0.45 + volNorm * 0.30 + recency * 0.15 + hasHistory * 0.10;
}

function selectTopMarkets(markets: EnrichedMarket[], n: number): ScoredMarket[] {
  const maxVol = Math.max(...markets.map(m => m.volume), 1);
  return markets
    .map(m  => ({ ...m, score: scoreMarket(m, maxVol) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, n);
}

// ── Pipeline ──────────────────────────────────────────────────────────────────

export async function runPipeline(
  emit:     (e: PipelineEvent) => void,
  domainId = 'iran-oil',
  useCached = false,
  role = '',
  org  = '',
): Promise<PipelineResult> {
  const domain: DomainConfig = getDomain(domainId);

  // ── Step 1: Search strategy (silent — not shown in UI) ────────────────────
  const strategy = await generateSearchStrategy(domain);

  // ── Step 2: Fetch markets ─────────────────────────────────────────────────
  emit({ step: 'fetch', status: 'running', agentName: 'MarketFetcherAgent' });
  const markets = useCached
    ? await loadSnapshot()
    : await fetchAndEnrich(strategy, domain);
  emit({ step: 'fetch', status: 'complete', data: { count: markets.length } });

  if (!markets.length) {
    const result: PipelineResult = {
      domain: domainId, enrichedMarkets: [], selectedMarkets: [],
      causalAnalysis: null, actionDirective: null, report: null,
      status: 'no_signal', statusReason: 'No markets found for this domain.',
    };
    emit({ step: 'done', status: 'complete', data: result });
    return result;
  }

  // ── Step 3: Score and select top 5 ───────────────────────────────────────
  emit({ step: 'select', status: 'running', agentName: 'MarketSelectorAgent' });
  const selectedMarkets = selectTopMarkets(markets, 5);
  emit({ step: 'select', status: 'complete', data: { selected: selectedMarkets } });

  // ── Step 4: K2 causal reasoning ───────────────────────────────────────────
  emit({ step: 'causal', status: 'running', agentName: 'K2ThinkV2-CausalReasoning' });
  const decisionMaker = role || org
    ? `${role || 'Policy analyst'} at ${org || 'unspecified organization'}`
    : 'a senior policy analyst';

  let causal: CausalAnalysis | null = null;
  try {
    const causalRaw = await callK2Think(`
You are a prediction market intelligence analyst.

Domain: ${domain.name}
Context: ${domain.context}
Causal chain: ${domain.causalChainDescription}
DECISION-MAKER: ${decisionMaker} — emphasize the aspects of the causal mechanism most operationally relevant to their authority and constraints.

TOP PREDICTION MARKET SIGNALS (ranked by signal strength):
${selectedMarkets.map(m => `- "${m.title}"
  Probability: ${Math.round(m.probability * 100)}%  |  Volume: $${Math.round(m.volume).toLocaleString()}
  Days to resolution: ${m.daysToResolution}  |  Source: ${m.source}  |  Signal score: ${m.score.toFixed(2)}`).join('\n')}

Based on these signals:
1. Identify the causal mechanism — what chain of events does the market consensus imply?
2. Describe the propagation chain from the leading signal to downstream effects.
3. Assign a confidence score (0–100). Confirm the signal if >= 50.
4. Write one key insight: the single sentence a decision-maker needs to act.

Return ONLY a valid JSON object with these exact keys:
{
  "causalMechanism": "<one paragraph describing the causal chain>",
  "propagationChain": "<step-by-step propagation from leading signal to downstream effects>",
  "confidenceScore": <integer 0-100>,
  "signalConfirmed": <true or false>,
  "keyInsight": "<single actionable sentence>"
}
`.trim(), 'medium');
    causal = parseK2Json<CausalAnalysis>(causalRaw);
  } catch (err: any) {
    console.error('[causal step failed]', err?.message);
  }
  emit({ step: 'causal', status: 'complete', data: causal });

  // ── Step 5: K2 action directive ───────────────────────────────────────────
  emit({ step: 'action', status: 'running', agentName: 'K2ThinkV2-ActionDirective' });

  // Weighted probability: top market gets 60%, average of rest gets 40%
  const avgProb   = selectedMarkets.reduce((s, m) => s + m.probability, 0) / selectedMarkets.length;
  const topProb   = selectedMarkets[0]?.probability ?? 0.5;
  const jointProb = topProb * 0.6 + avgProb * 0.4;
  const ciLow     = Math.max(0, jointProb - 0.10);
  const ciHigh    = Math.min(1, jointProb + 0.10);

  let directive: ActionDirective | null = null;
  try {
    const actionRaw = await callK2Think(`
Generate an operationally specific action directive.

DECISION-MAKER CONTEXT: ${decisionMaker}
The actor, action, legal mechanism, and reasoning MUST be tailored specifically to this person's authority, constraints, and institutional context.
- A Goldman Sachs energy trader gets a trading desk directive (spread positions, futures)
- A DOE deputy secretary gets a regulatory or legal action (SPR release, emergency authority)
- A researcher gets an analytical or policy memo recommendation

Domain: ${domain.name}
${causal ? `Causal mechanism: ${causal.causalMechanism}
Key insight: ${causal.keyInsight}
Confidence: ${causal.confidenceScore}/100` : ''}
Joint probability: ${Math.round(jointProb * 100)}%

SIGNALS:
${selectedMarkets.map(m => `- "${m.title}": ${Math.round(m.probability * 100)}%`).join('\n')}

Rules:
- Name the EXACT actor matching the decision-maker's role and organization
- Specify the legal, regulatory, or trading mechanism available to that specific actor
- Be concrete — bad: "consider options"; good: "invoke EPCA § 6241 within 72 hours" or "initiate long Brent/short WTI spread"
- In your "reasoning" field, you MUST cite specific market probabilities from the SIGNALS list above
  (e.g., "WTI front-month >$90 at 96% with 3 days to resolution means...") and explain the causal
  chain from those specific numbers to this specific action. Do NOT just restate the directive — give
  the evidence-based argument for why these probabilities require action now.

Return ONLY a valid JSON object with these exact keys:
{
  "actor": "<exact title and organization of the decision-maker>",
  "action": "<specific, concrete recommended action>",
  "legalMechanism": "<specific legal, regulatory, or procedural mechanism>",
  "geography": "<specific market or geographic scope>",
  "timeWindow": "<e.g. 72 hours, 5 trading days, 30 days>",
  "effectiveWindowDays": <integer number of days>,
  "urgency": "<exactly one of: immediate, urgent, planned>",
  "reasoning": "<why this specific actor must take this specific action now, given the signal>"
}
`.trim(), 'low');
    const parsed = parseK2Json<Omit<ActionDirective, 'confidenceScore' | 'jointPosteriorProbability' | 'confidenceIntervalLow' | 'confidenceIntervalHigh'>>(actionRaw);
    // Merge computed probability fields — K2 does not fill these
    directive = {
      ...parsed,
      confidenceScore:           causal?.confidenceScore ?? 50,
      jointPosteriorProbability: jointProb,
      confidenceIntervalLow:     ciLow,
      confidenceIntervalHigh:    ciHigh,
    } as ActionDirective;
  } catch (err: any) {
    console.error('[action step failed]', err?.message);
  }
  emit({ step: 'action', status: 'complete', data: directive });

  // ── Step 6: Report ────────────────────────────────────────────────────────
  emit({ step: 'report', status: 'running', agentName: 'K2ThinkV2-ReportWriter' });
  let report = null;
  try {
    if (causal && directive) {
      report = await generateReport({ selectedMarkets, causal, directive, role, org });
    }
  } catch (err: any) {
    console.error('[report step failed]', err?.message);
  }
  emit({ step: 'report', status: 'complete', data: report });

  const finalResult: PipelineResult = {
    domain:          domainId,
    enrichedMarkets: markets,
    selectedMarkets,
    causalAnalysis:  causal,
    actionDirective: directive,
    report,
    status:      causal?.signalConfirmed ? 'confirmed' : 'low_confidence',
    statusReason: causal?.signalConfirmed
      ? 'Signal confirmed with causal mechanism and operational directive.'
      : causal
        ? `Low confidence. Score: ${causal.confidenceScore}/100`
        : 'Causal analysis unavailable.',
  };

  emit({ step: 'done', status: 'complete', data: finalResult });
  return finalResult;
}
