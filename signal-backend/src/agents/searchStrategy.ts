import { callK2Think, parseK2Json } from '../k2think.js';
import type { DomainConfig } from '../domains.js';

export interface SearchStrategy {
  kalshiSeries: string[];  // Kalshi series tickers to query
  minVolume:    number;    // drop markets below this USD volume
}

export async function generateSearchStrategy(domain: DomainConfig): Promise<SearchStrategy> {
  const raw = await callK2Think(`
You are helping a prediction market intelligence system find the right Kalshi series to query.

Domain: ${domain.name}
Context: ${domain.context}
Causal chain: ${domain.causalChainDescription}

Kalshi organizes markets by series tickers (e.g. KXWTI = WTI crude oil, KXBRENT = Brent crude,
KXOIL = oil price, KXGAS = natural gas, KXENERGY = energy markets, KXIRAN = Iran-related).

Return the series tickers most relevant to this domain, and a minimum volume threshold (in USD)
to filter out noise. Use 50000 for major geopolitical/commodity events.

Return ONLY valid JSON:
{
  "kalshiSeries": ["KXWTI", "KXBRENT"],
  "minVolume": 50000
}
`.trim(), 'low');

  try {
    return parseK2Json<SearchStrategy>(raw);
  } catch {
    return {
      kalshiSeries: ['KXWTI', 'KXBRENT', 'KXOIL', 'KXGAS', 'KXENERGY'],
      minVolume:    50000,
    };
  }
}
