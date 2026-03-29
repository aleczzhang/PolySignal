import { callK2Think, parseK2Json } from '../k2think.js';

export interface DomainSuggestion {
  id: string;
  relevanceNote: string;
}

interface SuggestionResponse {
  suggestions: DomainSuggestion[];
}

export async function suggestDomains(role: string, org: string): Promise<DomainSuggestion[]> {
  const raw = await callK2Think(`
You are helping a prediction market intelligence system surface the most relevant signal domains for a specific user.

User profile:
- Role / Occupation: ${role}
- Organization: ${org}

Available domains (return their exact id values):
- id: "iran-oil"    — Energy & Geopolitics: Iran/Hormuz oil crisis, crude prices, SPR, OPEC, energy supply chains
- id: "fed-rates"   — Monetary Policy: Federal Reserve decisions, interest rates, CPI/inflation, FOMC meetings, credit markets
- id: "us-election" — US Politics: Elections, congressional composition, presidential approval, policy shifts
- id: "crypto"      — Digital Assets: Bitcoin/Ethereum price, SEC/ETF regulatory decisions, institutional adoption

Return all domains ordered from MOST to LEAST relevant for this specific role and organization.
Include 3–4 domains. For each, write one brief phrase (max 12–15 words) that explicitly uses the person's role title and organization name, and states the concrete impact this market has on them. Do not use "you" or "your" — name the role and org directly.

Return ONLY valid JSON:
{
  "suggestions": [
    { "id": "iran-oil", "relevanceNote": "Hormuz closure risk directly threatens NATO's allied energy supply chain commitments." },
    { "id": "fed-rates", "relevanceNote": "Rate hikes reprice NATO's defense financing costs and member-state budget headroom." }
  ]
}
`.trim(), 'medium');

  try {
    const parsed = parseK2Json<SuggestionResponse>(raw);
    // Validate: filter to known domain IDs only
    const knownIds = new Set(['iran-oil', 'fed-rates', 'us-election', 'crypto']);
    return parsed.suggestions.filter(s => knownIds.has(s.id)).slice(0, 7);
  } catch {
    // Fallback: role/org-aware notes so even the fallback is personalized
    return [
      { id: 'iran-oil',    relevanceNote: `Energy supply disruptions and crude price moves relevant to ${role} at ${org}.` },
      { id: 'fed-rates',   relevanceNote: `Rate and credit market signals relevant to ${role} at ${org}.` },
      { id: 'us-election', relevanceNote: `Policy and political risk signals relevant to ${role} at ${org}.` },
      { id: 'crypto',      relevanceNote: `Digital asset market signals relevant to ${role} at ${org}.` },
    ];
  }
}
