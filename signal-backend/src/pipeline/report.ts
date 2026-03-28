import { callK2Think, parseK2Json } from '../k2think.js';
import type {
  ScreenedMarket, LagMatrix, MathAnalysis,
  CausalAnalysis, ActionDirective, StakeholderResult, ReportContent,
} from '../types.js';

interface ReportInput {
  selectedCluster: ScreenedMarket[];
  lagMatrix:       LagMatrix;
  mathAnalysis:    MathAnalysis;
  causalAnalysis:  CausalAnalysis;
  directive:       ActionDirective;
  stakeholders:    StakeholderResult;
}

export async function generateReport(input: ReportInput): Promise<ReportContent> {
  const { selectedCluster, lagMatrix, mathAnalysis, causalAnalysis, directive, stakeholders } = input;

  const raw = await callK2Think(`
Write a concise policy-grade intelligence report based on the following confirmed prediction market signal.
This report will be handed to a senior government official — write at that level.

CAUSAL MECHANISM: ${causalAnalysis.causalMechanism}
PROPAGATION CHAIN: ${causalAnalysis.propagationChain}
CONFIDENCE: ${causalAnalysis.confidenceScore}/100
CONFOUNDING RISK: ${causalAnalysis.confoundingRisk} — ${causalAnalysis.confoundingExplanation}

MATHEMATICAL FINDINGS:
- Joint posterior probability: ${Math.round(mathAnalysis.jointPosteriorProbability * 100)}%
- 80% confidence interval: [${Math.round(mathAnalysis.confidenceIntervalLow * 100)}%, ${Math.round(mathAnalysis.confidenceIntervalHigh * 100)}%]
- Signal strength: ${mathAnalysis.mathSignalStrength}/100
- Effective action window: ${mathAnalysis.effectiveActionWindowDays} days
- ${mathAnalysis.correlationDecayAssessment}

CONFIRMED MARKETS (${selectedCluster.length}):
${selectedCluster.map(m => `- "${m.title}" — ${Math.round(m.probability * 100)}% probability, ${m.daysToResolution}d to resolution`).join('\n')}

LAG STRUCTURE: ${lagMatrix.propagationSummary}

DIRECTIVE:
${directive.actor} — ${directive.action}
Legal mechanism: ${directive.legalMechanism}
Time window: ${directive.timeWindow}
Urgency: ${directive.urgency}

PRIMARY ACTOR: ${stakeholders.primaryActor.name}
${stakeholders.institutionalContext}

HISTORICAL PRECEDENTS INTEGRATED: ${causalAnalysis.precedentsIntegrated}

Write:
1. TITLE — short, specific, declassification-style (e.g. "SIGNAL ASSESSMENT: Strait of Hormuz Disruption Risk — SPR Authorization Window")
2. EXECUTIVE SUMMARY — 3–4 sentences. What the signal says, confidence level, and what must happen in what timeframe.
3. CAUSAL REASONING — 2–3 paragraphs. The mechanism, the lag structure as evidence, historical precedent validation.

Return ONLY valid JSON:
{
  "title": "...",
  "executiveSummary": "...",
  "causalReasoningProse": "..."
}
`.trim(), 'medium');

  const parsed = parseK2Json<{ title: string; executiveSummary: string; causalReasoningProse: string }>(raw);

  return {
    title:               parsed.title,
    executiveSummary:    parsed.executiveSummary,
    causalReasoningProse: parsed.causalReasoningProse,
    generatedAt:         new Date().toISOString(),
  };
}
