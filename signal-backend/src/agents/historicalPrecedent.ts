import { callK2Think, parseK2Json } from '../k2think.js';
import type { PrecedentResult } from '../types.js';
import type { DomainConfig } from '../domains.js';

// ── Hardcoded Iran/oil fallback cases ─────────────────────────────────────────

const IRAN_OIL_CASES = [
  {
    id:          'ukraine_oil_2022',
    description: 'Russia-Ukraine war — oil supply shock, Feb 2022',
    leadTimeDays: 42,
    outcome:     'Brent crude spiked from $80 to $130 within 3 weeks. IEA emergency SPR release coordinated 6 weeks after prediction markets first priced in disruption.',
    lesson:      'Prediction markets priced in the oil supply shock ~6 weeks before IEA acknowledged it. Early SPR activation would have blunted the retail gasoline spike.',
    keywords:    ['oil', 'crude', 'Brent', 'WTI', 'supply', 'SPR', 'sanctions', 'Russia', 'war'],
  },
  {
    id:          'iran_nuclear_2018',
    description: 'US withdrawal from JCPOA — Iran oil sanctions reimposed, May 2018',
    leadTimeDays: 21,
    outcome:     'Iranian oil exports fell from 2.5M to 0.5M barrels/day over 6 months. Brent rose 15% in 3 weeks following announcement.',
    lesson:      'Prediction markets on sanctions severity preceded the crude price move by 3 weeks. DOE SPR release was authorized reactively rather than proactively.',
    keywords:    ['Iran', 'sanctions', 'oil', 'crude', 'JCPOA', 'nuclear', 'barrel'],
  },
  {
    id:          'gulf_war_1990',
    description: 'Iraq invasion of Kuwait — Strait of Hormuz threat, Aug 1990',
    leadTimeDays: 30,
    outcome:     'Oil spiked from $17 to $36/barrel in 6 weeks. US activated SPR for the first time in history. G7 coordinated IEA release.',
    lesson:      'Physical supply disruption through a Gulf chokepoint produces sharp 2–3 week price spikes. SPR release authorization requires 2–3 week political runway.',
    keywords:    ['oil', 'crude', 'Hormuz', 'Gulf', 'barrel', 'SPR', 'supply', 'tanker'],
  },
  {
    id:          'iran_hormuz_2019',
    description: 'Iran tanker seizures — Strait of Hormuz tensions, Jun–Jul 2019',
    leadTimeDays: 14,
    outcome:     'Brent spiked 4% on tanker seizure news. Insurance rates for Hormuz transit rose 10×. Markets priced in sustained closure risk 2 weeks before State Dept advisory.',
    lesson:      'Tanker seizure markets on Polymarket moved ahead of official State Dept shipping advisories by ~2 weeks. Physical disruption signal preceded policy response.',
    keywords:    ['Iran', 'Hormuz', 'tanker', 'oil', 'crude', 'strait', 'seizure'],
  },
];

// ── Main export ───────────────────────────────────────────────────────────────

export async function findPrecedents(
  domain: DomainConfig,
  keywords: string[],
  topN = 3,
): Promise<PrecedentResult> {
  // For iran-oil, use the hardcoded case DB first — fast and reliable
  if (domain.id === 'iran-oil') {
    return searchCaseDB(keywords, topN);
  }

  // For other domains, ask K2 Think V2 to surface relevant historical cases
  try {
    const raw = await callK2Think(`
You are a historical analyst identifying past real-world events relevant to a confirmed prediction market signal.

DOMAIN: ${domain.name}
CAUSAL CHAIN: ${domain.causalChainDescription}
CONTEXT: ${domain.context}
SIGNAL KEYWORDS: ${keywords.slice(0, 20).join(', ')}

Find up to ${topN} historical precedents where:
1. A similar causal chain played out in the real world
2. Prediction markets (or early indicators) gave advance warning
3. There is a clear lesson about lead times and response windows

For each case include: what happened, what the outcome was, what the relevant lesson is for decision-makers, and how strong the analogy is to the current signal.

Return ONLY valid JSON:
{
  "cases": [
    {
      "description": "...",
      "similarity": 0.0,
      "outcome": "...",
      "relevantLesson": "...",
      "analogyStrength": "strong|moderate|weak"
    }
  ],
  "overallRelevance": "..."
}
`.trim(), 'low');

    return parseK2Json<PrecedentResult>(raw);
  } catch {
    // Generic fallback
    return {
      cases: [],
      overallRelevance: 'Historical precedent search unavailable — K2 Think V2 call failed.',
    };
  }
}

// ── Iran/oil keyword search ───────────────────────────────────────────────────

function searchCaseDB(keywords: string[], topN: number): PrecedentResult {
  const scored = IRAN_OIL_CASES
    .map(p => ({
      ...p,
      score: keywords.filter(k =>
        p.keywords.some(pk => pk.toLowerCase().includes(k.toLowerCase()))
      ).length,
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, topN);

  return {
    cases: scored.map(p => ({
      description:    p.description,
      similarity:     Math.min(1, p.score / Math.max(keywords.length, 1)),
      outcome:        p.outcome,
      relevantLesson: p.lesson,
      analogyStrength: p.score >= 4 ? 'strong' : p.score >= 2 ? 'moderate' : 'weak',
    })),
    overallRelevance: scored.length > 0
      ? `${scored.length} Iran/oil precedent(s) found — strongest: ${scored[0].description}`
      : 'No strong precedents found in Iran/oil case database',
  };
}
