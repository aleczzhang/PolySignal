import { callK2Think, parseK2Json } from '../k2think.js';
import type { DomainConfig } from '../domains.js';

export interface SearchStrategy {
  kalshiSeries: string[];  // Kalshi series tickers to query
}

export async function generateSearchStrategy(
  domain: DomainConfig,
  opts: { broader?: boolean } = {},
): Promise<SearchStrategy> {
  const broaderNote = opts.broader
    ? `\nIMPORTANT: The initial search returned too few markets. Return MORE series tickers (aim for 6-10) to cast a wider net.`
    : '';

  const raw = await callK2Think(`
You are helping a prediction market intelligence system find the right Kalshi series to query.

Domain: ${domain.name}
Context: ${domain.context}
Causal chain: ${domain.causalChainDescription}

Kalshi organizes markets by series tickers. ONLY use series from this verified list:
- Energy:          KXWTI, KXBRENT, KXGAS
- Monetary policy: KXFED, KXINFLATION, KXCPI
- US elections:    KXELECTION, KXPOTUS, KXSENATE, KXHOUSE
- Crypto:          KXBTC, KXETH
- Metals:          KXGOLD, KXSILVER
- Equity indices:  KXSPX, KXNASDAQ
- Geopolitical:    KXIRAN, KXCHINA, KXRUSSIA, KXUKRAINE
- Economic:        KXJOBS, KXGDP

IMPORTANT: Do NOT invent series tickers. Only use tickers from the list above.
Return 2–4 series most directly relevant to this domain.${broaderNote}

Return ONLY valid JSON:
{
  "kalshiSeries": ["KXWTI", "KXBRENT"]
}
`.trim(), 'low');

  try {
    const strategy = parseK2Json<SearchStrategy>(raw);
    console.log(`[Strategy] Kalshi series chosen: ${strategy.kalshiSeries.join(', ')}`);
    return strategy;
  } catch {
    return opts.broader
      ? { kalshiSeries: ['KXWTI', 'KXBRENT', 'KXOIL', 'KXGAS', 'KXENERGY', 'KXELECTION', 'KXFED', 'KXBTC', 'KXETH'] }
      : { kalshiSeries: ['KXWTI', 'KXBRENT', 'KXOIL', 'KXGAS', 'KXENERGY'] };
  }
}
