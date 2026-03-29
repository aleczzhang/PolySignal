import { callK2Think, parseK2Json } from '../k2think.js';
import type { ScoredMarket, CausalAnalysis, ActionDirective, ReportContent } from '../types.js';

interface ReportInput {
  selectedMarkets: ScoredMarket[];
  causal:          CausalAnalysis;
  directive:       ActionDirective;
  role?: string;
  org?:  string;
}

export async function generateReport(input: ReportInput): Promise<ReportContent> {
  const { selectedMarkets, causal, directive, role = '', org = '' } = input;
  const decisionMaker = role || org
    ? `${role || 'Policy analyst'} at ${org || 'unspecified organization'}`
    : 'a senior decision-maker';

  const raw = await callK2Think(`
Write a concise intelligence report addressed specifically to: ${decisionMaker}.
Calibrate technical depth, tone, and recommended actions to their institutional context and authority level.

SIGNAL SUMMARY:
- Confidence: ${causal.confidenceScore}/100
- Key insight: ${causal.keyInsight}
- Causal mechanism: ${causal.causalMechanism}
- Propagation chain: ${causal.propagationChain}

MARKET EVIDENCE (top ${selectedMarkets.length} signals):
${selectedMarkets.map(m => `- "${m.title}": ${Math.round(m.probability * 100)}% probability ($${Math.round(m.volume).toLocaleString()} volume)`).join('\n')}

DIRECTIVE:
${directive.actor} — ${directive.action}
Mechanism: ${directive.legalMechanism}
Window: ${directive.timeWindow} | Urgency: ${directive.urgency}

Write:
1. TITLE — short, specific, declassification-style
2. EXECUTIVE SUMMARY — 3 sentences: what the signal says, confidence, required action.
3. CAUSAL REASONING — 2 paragraphs: the mechanism, the market evidence, what to do.

Return ONLY valid JSON:
{
  "title": "...",
  "executiveSummary": "...",
  "causalReasoningProse": "..."
}
`.trim(), 'low');

  const parsed = parseK2Json<{ title: string; executiveSummary: string; causalReasoningProse: string }>(raw);
  return { ...parsed, generatedAt: new Date().toISOString() };
}
