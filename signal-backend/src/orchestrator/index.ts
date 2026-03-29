import { fetchPolymarket, fetchKalshi, loadSnapshot, deduplicateMarkets } from '../agents/marketFetcher.js';
import { generateSearchStrategy }          from '../agents/searchStrategy.js';
import { callK2Think, parseK2Json }        from '../k2think.js';
import { getDomain }                       from '../domains.js';
import type { DomainConfig }               from '../domains.js';
import { generateReport }                  from '../pipeline/report.js';
import type {
  EnrichedMarket, ScoredMarket, MarketStats,
  CausalAnalysis, ActionDirective, HistoricalContext,
  PipelineResult, PipelineEvent,
} from '../types.js';

// ── Market scoring ────────────────────────────────────────────────────────────
// Pick markets with the strongest, most actionable signal.

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

function selectBySignalStrength(markets: EnrichedMarket[], minScore = 0.32): ScoredMarket[] {
  const maxVol = Math.max(...markets.map(m => m.volume), 1);
  const scored = markets
    .map(m => ({ ...m, score: scoreMarket(m, maxVol) }))
    .sort((a, b) => b.score - a.score);

  const aboveThreshold = scored.filter(m => m.score >= minScore);
  // Keep all above threshold (min 3, max 10); fall back to top-3 if none clear the bar
  if (aboveThreshold.length >= 3) return aboveThreshold.slice(0, 10);
  return scored.slice(0, 3);
}

function computeMarketStats(markets: ScoredMarket[]): MarketStats {
  const probs  = markets.map(m => m.probability);
  const mean   = probs.reduce((s, p) => s + p, 0) / probs.length;
  const spread = Math.sqrt(probs.reduce((s, p) => s + (p - mean) ** 2, 0) / probs.length);

  const topHist    = markets[0]?.probHistory ?? [];
  const recent     = topHist.slice(-7);
  const trendDelta = recent.length >= 2 ? recent[recent.length - 1] - recent[0] : 0;
  const strength   = Math.min(1, markets[0]?.score ?? 0);

  return {
    signalStrength:       strength,
    topMarketProbability: markets[0]?.probability ?? 0,
    meanProbability:      mean,
    probSpread:           spread,
    trendDirection:       trendDelta > 0.03 ? 'rising' : trendDelta < -0.03 ? 'falling' : 'flat',
    correlationStrength:  strength > 0.65 ? 'strong' : strength > 0.40 ? 'moderate' : 'weak',
    marketCount:          markets.length,
  };
}

async function generateHistoricalContext(
  domain: DomainConfig,
  markets: ScoredMarket[],
): Promise<HistoricalContext | null> {
  try {
    const raw = await callK2Think(`
You are identifying historical precedents for a prediction market intelligence analysis.

Domain: ${domain.name}
Context: ${domain.context}
Causal chain: ${domain.causalChainDescription}

Current market signals:
${markets.slice(0, 4).map(m => `- "${m.title}": ${Math.round(m.probability * 100)}% probability`).join('\n')}

Identify 2-3 specific historical events that are the most relevant precedents for what these markets are currently pricing in.
For each, describe what the markets showed at the time and what actually happened.

Return ONLY valid JSON:
{
  "precedents": [
    {
      "event": "<name of historical event>",
      "year": <year as integer>,
      "outcome": "<what actually happened>",
      "marketSignal": "<what prediction markets or futures showed beforehand>",
      "relevance": "<one sentence on why this matters for the current signal>"
    }
  ],
  "patternSummary": "<one sentence on what the historical pattern implies for the current signal>"
}
`.trim(), 'low');
    return parseK2Json<HistoricalContext>(raw);
  } catch (err: any) {
    console.error('[precedent step failed]', err?.message);
    return null;
  }
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

  // ── Step 2: Fetch markets ─────────────────────────────────────────────────
  // Strategy generates first (both fetches depend on the same Kalshi series tickers).
  // Then Polymarket and Kalshi fetch in true parallel — same process, different API endpoints.
  let markets: EnrichedMarket[];

  if (useCached) {
    emit({ step: 'fetch_poly',   status: 'running',  agentName: 'PolymarketFetchAgent' });
    emit({ step: 'fetch_kalshi', status: 'running',  agentName: 'KalshiFetchAgent'     });
    markets = await loadSnapshot();
    emit({ step: 'fetch_poly',   status: 'complete', data: { count: markets.length } });
    emit({ step: 'fetch_kalshi', status: 'complete', data: { count: 0 } });
  } else {
    // Step 2a: Generate strategy (sequential — shared by both fetches)
    const strategy = await generateSearchStrategy(domain);

    // Step 2b: Both fetches start simultaneously with the real strategy
    emit({ step: 'fetch_poly',   status: 'running', agentName: 'PolymarketFetchAgent' });
    emit({ step: 'fetch_kalshi', status: 'running', agentName: 'KalshiFetchAgent'     });

    const polyPromise = fetchPolymarket(strategy, domain)
      .then(result => {
        emit({ step: 'fetch_poly', status: 'complete', data: { count: result.length } });
        return result;
      })
      .catch(() => {
        emit({ step: 'fetch_poly', status: 'failed' });
        return [] as EnrichedMarket[];
      });

    const kalshiPromise = fetchKalshi(strategy, domain)
      .then(result => {
        emit({ step: 'fetch_kalshi', status: 'complete', data: { count: result.length } });
        return result;
      })
      .catch(() => {
        emit({ step: 'fetch_kalshi', status: 'failed' });
        return [] as EnrichedMarket[];
      });

    const [polyMarkets, kalshiMarkets] = await Promise.all([polyPromise, kalshiPromise]);
    markets = deduplicateMarkets([...polyMarkets, ...kalshiMarkets]);

    // Expand search if too few markets came back
    if (markets.length < 4) {
      emit({ step: 'fetch_poly',   status: 'running', agentName: 'PolymarketFetchAgent', message: 'Expanding search…' });
      emit({ step: 'fetch_kalshi', status: 'running', agentName: 'KalshiFetchAgent',     message: 'Expanding search…' });
      try {
        const broadStrategy = await generateSearchStrategy(domain, { broader: true });
        const [extraPoly, extraKalshi] = await Promise.allSettled([
          fetchPolymarket(broadStrategy, domain),
          fetchKalshi(broadStrategy, domain),
        ]);
        const extra = deduplicateMarkets([
          ...(extraPoly.status   === 'fulfilled' ? extraPoly.value   : []),
          ...(extraKalshi.status === 'fulfilled' ? extraKalshi.value : []),
        ]);
        markets = deduplicateMarkets([...markets, ...extra]);
      } catch { /* proceed with what we have */ }
      emit({ step: 'fetch_poly',   status: 'complete', data: { count: markets.length } });
      emit({ step: 'fetch_kalshi', status: 'complete', data: { count: markets.length } });
    }
  }

  if (!markets.length) {
    const result: PipelineResult = {
      domain: domainId, enrichedMarkets: [], selectedMarkets: [],
      causalAnalysis: null, actionDirective: null, report: null,
      status: 'no_signal', statusReason: 'No markets found for this domain.',
    };
    emit({ step: 'done', status: 'complete', data: result });
    return result;
  }

  // ── Step 3: Score and select by signal strength ───────────────────────────
  emit({ step: 'select', status: 'running', agentName: 'MarketSelectorAgent' });
  const selectedMarkets = selectBySignalStrength(markets);
  emit({ step: 'select', status: 'complete', data: { selected: selectedMarkets } });

  // ── Step 4: Statistical analysis ──────────────────────────────────────────
  emit({ step: 'stat', status: 'running', agentName: 'StatisticalScreenerAgent' });
  const marketStats = computeMarketStats(selectedMarkets);
  emit({ step: 'stat', status: 'complete', data: marketStats });

  // ── Step 5: K2 causal reasoning + historical precedents (parallel) ────────
  emit({ step: 'precedent', status: 'running', agentName: 'HistoricalPrecedentAgent' });
  emit({ step: 'causal',    status: 'running', agentName: 'K2ThinkV2-CausalReasoning' });

  const decisionMaker = role || org
    ? `${role || 'Policy analyst'} at ${org || 'unspecified organization'}`
    : 'a senior policy analyst';

  // Separate active (forward-looking) from resolved (historical fact) markets.
  // Only active markets are valid prediction signals. Resolved markets are ground truth.
  const activeMarkets   = selectedMarkets.filter(m => !m.isResolved);
  const resolvedMarkets = selectedMarkets.filter(m => m.isResolved);
  // Use active markets for probability stats; fall back to all if none are active
  const signalMarkets   = activeMarkets.length > 0 ? activeMarkets : selectedMarkets;

  const activeSignalsText = activeMarkets.length > 0
    ? activeMarkets.map(m => `- "${m.title}"
  Probability: ${Math.round(m.probability * 100)}%  |  Volume: $${Math.round(m.volume).toLocaleString()}
  Days to resolution: ${m.daysToResolution}  |  Source: ${m.source}  |  Signal score: ${m.score.toFixed(2)}`).join('\n')
    : '(none — all fetched markets have already resolved)';

  const resolvedContextText = resolvedMarkets.length > 0
    ? resolvedMarkets.map(m => `- "${m.title}": resolved ${m.outcome === 'yes' ? 'YES' : 'NO'} (was at ${Math.round(m.probability * 100)}%)`).join('\n')
    : '(none)';

  const [historicalContext, causal] = await Promise.all([
    generateHistoricalContext(domain, signalMarkets),
    (async (): Promise<CausalAnalysis | null> => {
      try {
        const causalRaw = await callK2Think(`
You are a prediction market intelligence analyst.

Domain: ${domain.name}
Context: ${domain.context}
Causal chain: ${domain.causalChainDescription}
DECISION-MAKER: ${decisionMaker} — emphasize the aspects of the causal mechanism most operationally relevant to their authority and constraints.

STATISTICAL ANALYSIS SUMMARY:
- Active (unresolved) markets: ${activeMarkets.length}
- Resolved (settled) markets: ${resolvedMarkets.length}
- Signal strength: ${(marketStats.signalStrength * 100).toFixed(0)}% (${marketStats.correlationStrength})
- Top market probability: ${Math.round(marketStats.topMarketProbability * 100)}%
- Mean probability across markets: ${Math.round(marketStats.meanProbability * 100)}%
- Probability spread (std dev): ${(marketStats.probSpread * 100).toFixed(1)}%
- Trend direction (7-day): ${marketStats.trendDirection}

FORWARD-LOOKING SIGNALS — unresolved markets (base your causal reasoning on these):
${activeSignalsText}

RESOLVED MARKET CONTEXT — already settled (treat as historical facts, not predictions):
${resolvedContextText}

Based on the forward-looking signals:
1. Identify the causal mechanism — what chain of events does the market consensus imply?
2. Describe the propagation chain from the leading signal to downstream effects.
3. Assign a confidence score (0–100). Confirm the signal if >= 50 AND at least one active signal exists.
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
        return parseK2Json<CausalAnalysis>(causalRaw);
      } catch (err: any) {
        console.error('[causal step failed]', err?.message);
        return null;
      }
    })(),
  ]);

  emit({ step: 'precedent', status: 'complete', data: historicalContext });
  emit({ step: 'causal',    status: 'complete', data: causal });

  // ── Step 6: K2 action directive ───────────────────────────────────────────
  emit({ step: 'action', status: 'running', agentName: 'K2ThinkV2-ActionDirective' });

  // Weighted probability uses only active (unresolved) markets as signals
  const avgProb   = signalMarkets.reduce((s, m) => s + m.probability, 0) / signalMarkets.length;
  const topProb   = signalMarkets[0]?.probability ?? 0.5;
  const jointProb = topProb * 0.6 + avgProb * 0.4;
  const ciLow     = Math.max(0, jointProb - 0.10);
  const ciHigh    = Math.min(1, jointProb + 0.10);

  const historicalNote = historicalContext?.precedents?.length
    ? `\nHISTORICAL PRECEDENTS:\n${historicalContext.precedents.map(p => `- ${p.event} (${p.year}): ${p.relevance}`).join('\n')}\nPattern: ${historicalContext.patternSummary}`
    : '';

  const resolvedNote = resolvedMarkets.length > 0
    ? `\nRESOLVED MARKET CONTEXT (already happened — use for reasoning context, not as forward signal):\n${resolvedMarkets.map(m => `- "${m.title}": ${m.outcome === 'yes' ? 'YES' : 'NO'}`).join('\n')}`
    : '';

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
Confidence: ${causal.confidenceScore}/100` : ''}${historicalNote}${resolvedNote}
Joint probability: ${Math.round(jointProb * 100)}%

FORWARD-LOOKING SIGNALS (base your recommendation on these — unresolved markets only):
${activeMarkets.length > 0
  ? activeMarkets.map(m => `- "${m.title}": ${Math.round(m.probability * 100)}%`).join('\n')
  : '(no active markets — all context is from resolved events; acknowledge this limits predictive confidence)'
}

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

  // ── Step 7: Report ────────────────────────────────────────────────────────
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
    marketStats,
    historicalContext,
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
