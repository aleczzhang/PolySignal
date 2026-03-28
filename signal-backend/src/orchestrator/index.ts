import { fetchAndEnrich, loadSnapshot }               from '../agents/marketFetcher.js';
import { screenMarkets, buildLagMatrix, validateCluster } from '../agents/statisticalScreener.js';
import { detectContradictions }                          from '../agents/contradictionDetector.js';
import { findPrecedents }                                from '../agents/historicalPrecedent.js';
import { callK2Think, callK2ThinkStream, parseK2Json }   from '../k2think.js';
import type {
  PipelineEvent, PipelineResult, ScreenedMarket,
  ClusterSelectionResult, CausalAnalysis, OrchestrationAudit,
} from '../types.js';

const MAX_STAT_RETRIES   = 3;
const MAX_CAUSAL_RETRIES = 2;

export async function runPipeline(
  emit: (e: PipelineEvent) => void,
  useCached = false,
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

  // ── Step 3: K2 Think V2 — cluster selection loop ──────────────────────────
  let statRetry = 0;
  let excludeIds:      string[]                          = [];
  let rejectedClusters: PipelineResult['rejectedClusters'] = [];
  let cluster: ScreenedMarket[]                          = [];
  let validation: ReturnType<typeof validateCluster> | null = null;

  while (statRetry <= MAX_STAT_RETRIES) {
    emit({
      step: 'cluster',
      status: statRetry > 0 ? 'retry' : 'running',
      agentName: 'K2ThinkV2-Orchestrator',
      retryCount: statRetry,
    });
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
No cap on cluster size — include every market passing r >= 0.50.
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
    emit({
      step: 'cluster', status: 'complete',
      data: { cluster, selection, lagMatrix },
      k2Decision: selection.selectionReasoning,
    });

    validation = validateCluster(cluster, lagMatrix);
    emit({ step: 'screen', status: 'complete', data: { validation, cluster, lagMatrix, rejectedClusters } });

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
      return buildResult({
        markets, screened, lagMatrix, cluster: [], rejectedClusters,
        validation: null, causal: null, math: null, directive: null,
        audit, report: null, statRetry, causalRetry: 0,
        status: 'no_signal', statusReason: reason,
      });
    }
  }

  // ── Step 4: Contradiction check ───────────────────────────────────────────
  emit({ step: 'contradiction', status: 'running', agentName: 'ContradictionDetectorAgent' });
  audit.agentsCalledInOrder.push('ContradictionDetectorAgent');
  const claims = cluster.map(m =>
    `Market "${m.title}" probability ${m.probability.toFixed(2)}, ${m.regime} regime`
  );
  const contradictions = detectContradictions(claims);
  if (contradictions.hasContradiction)
    audit.unexpectedFindings.push(`${contradictions.contradictions.length} contradiction(s) found`);
  emit({ step: 'contradiction', status: 'complete', data: contradictions });

  // ── Step 5: Historical precedents ─────────────────────────────────────────
  emit({ step: 'precedent', status: 'running', agentName: 'HistoricalPrecedentAgent' });
  audit.agentsCalledInOrder.push('HistoricalPrecedentAgent');
  const keywords  = cluster.flatMap(m => m.title.toLowerCase().split(/\s+/)).filter(w => w.length > 3);
  const precedents = findPrecedents(keywords);
  emit({ step: 'precedent', status: 'complete', data: precedents });

  // ── Step 6: K2 Think V2 — causal reasoning loop ───────────────────────────
  let causalRetry      = 0;
  let prevRejections: string[] = [];
  let causal: CausalAnalysis | null = null;

  while (causalRetry <= MAX_CAUSAL_RETRIES) {
    emit({
      step: 'causal',
      status: causalRetry > 0 ? 'retry' : 'running',
      agentName: 'K2ThinkV2-CausalReasoning',
    });
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
    emit({
      step: 'causal', status: 'complete', data: causal,
      k2Decision: causal.signalConfirmed ? 'Signal confirmed' : `Rejected (${causal.confidenceScore}/100)`,
    });

    if (causal.signalConfirmed) break;

    // B1: partial rejection — drop flagged markets and re-validate
    if (causal.rejectedMarketIds.length > 0 && causal.rejectedMarketIds.length < cluster.length - 1) {
      const why = Object.entries(causal.rejectionReasons).map(([id, r]) => `${id}: ${r}`).join('; ');
      prevRejections.push(`Attempt ${causalRetry + 1} rejected [${causal.rejectedMarketIds.join(',')}] — ${why}`);
      cluster    = cluster.filter(m => !causal!.rejectedMarketIds.includes(m.id));
      validation = validateCluster(cluster, lagMatrix);
      if (!validation.passed) { causalRetry = MAX_CAUSAL_RETRIES + 1; break; }
      causalRetry++;
      continue;
    }

    // B2: full rejection
    prevRejections.push(`Attempt ${causalRetry + 1}: no mechanism. Score: ${causal.confidenceScore}`);
    causalRetry++;
  }

  if (!causal?.signalConfirmed) {
    const status = causalRetry > MAX_CAUSAL_RETRIES ? 'causally_ambiguous' : 'low_confidence';
    const reason = `K2 Think V2 could not confirm causal mechanism after ${causalRetry} attempt(s). Human analyst review recommended.`;
    emit({
      step: 'done',
      status: status === 'causally_ambiguous' ? 'ambiguous' : 'complete',
      data: { status, reason },
    });
    return buildResult({
      markets, screened, lagMatrix, cluster, rejectedClusters,
      validation, causal, math: null, directive: null,
      audit, report: null, statRetry, causalRetry,
      status, statusReason: reason,
    });
  }

  // ── Steps 7–10: Math, Action, Audit, Report ───────────────────────────────
  // TODO: implemented by teammates — stubs for now
  emit({ step: 'done', status: 'complete', data: { status: 'confirmed', causal } });
  return buildResult({
    markets, screened, lagMatrix, cluster, rejectedClusters,
    validation, causal, math: null, directive: null,
    audit, report: null, statRetry, causalRetry,
    status: 'confirmed', statusReason: 'Causal signal confirmed — downstream steps pending',
  });
}

// ── Helper ────────────────────────────────────────────────────────────────────

function buildResult(args: {
  markets: any[]; screened: ScreenedMarket[]; lagMatrix: any;
  cluster: ScreenedMarket[]; rejectedClusters: PipelineResult['rejectedClusters'];
  validation: any; causal: CausalAnalysis | null; math: any; directive: any;
  audit: OrchestrationAudit; report: any;
  statRetry: number; causalRetry: number;
  status: PipelineResult['status']; statusReason: string;
}): PipelineResult {
  return {
    domain:            'iran-oil',
    enrichedMarkets:   args.markets,
    screenedMarkets:   args.screened,
    lagMatrix:         args.lagMatrix,
    selectedCluster:   args.cluster,
    rejectedClusters:  args.rejectedClusters,
    validationResult:  args.validation,
    causalAnalysis:    args.causal,
    mathAnalysis:      args.math,
    directive:         args.directive,
    audit:             args.audit,
    report:            args.report,
    statRetryCount:    args.statRetry,
    causalRetryCount:  args.causalRetry,
    status:            args.status,
    statusReason:      args.statusReason,
  };
}
