import { callK2Think, parseK2Json } from '../k2think.js';
import type { DomainConfig } from '../domains.js';

export interface SearchStrategy {
  kalshiSeries: string[];  // Kalshi series tickers to query
  minVolume:    number;    // drop markets below this USD volume
}

export async function generateSearchStrategy(
  domain: DomainConfig,
  opts: { broader?: boolean } = {},
): Promise<SearchStrategy> {
  const broaderNote = opts.broader
    ? `\nIMPORTANT: The initial search returned too few markets. Return MORE series tickers (aim for 6-10) and lower the minVolume threshold to 10000 to cast a wider net.`
    : '';

  const raw = await callK2Think(`
You are helping a prediction market intelligence system find the right Kalshi series to query.

Domain: ${domain.name}
Context: ${domain.context}
Causal chain: ${domain.causalChainDescription}

Kalshi organizes markets by series tickers (e.g. KXWTI = WTI crude oil, KXBRENT = Brent crude,
KXOIL = oil price, KXGAS = natural gas, KXENERGY = energy markets, KXIRAN = Iran-related,
KXELECTION = US elections, KXFED = Federal Reserve, KXBTC = Bitcoin, KXETH = Ethereum).

Return the series tickers most relevant to this domain, and a minimum volume threshold (in USD)
to filter out noise. Use 50000 for major geopolitical/commodity events.${broaderNote}

Return ONLY valid JSON:
{
  "kalshiSeries": ["KXWTI", "KXBRENT"],
  "minVolume": 50000
}
`.trim(), 'low');

  try {
    return parseK2Json<SearchStrategy>(raw);
  } catch {
    return opts.broader
      ? { kalshiSeries: ['KXWTI', 'KXBRENT', 'KXOIL', 'KXGAS', 'KXENERGY', 'KXELECTION', 'KXFED', 'KXBTC', 'KXETH'], minVolume: 10000 }
      : { kalshiSeries: ['KXWTI', 'KXBRENT', 'KXOIL', 'KXGAS', 'KXENERGY'], minVolume: 50000 };
  }
}
