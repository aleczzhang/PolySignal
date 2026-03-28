export interface DomainConfig {
  id: string;
  name: string;                   // human-readable label
  keywords: string[];             // used to filter markets from Polymarket + Kalshi
  causalChainDescription: string; // passed to K2 in prompts — what chain to look for
  context: string;                // background context for K2 reasoning
}

// ── Known domain registry ─────────────────────────────────────────────────────

const DOMAINS: Record<string, DomainConfig> = {
  'iran-oil': {
    id: 'iran-oil',
    name: 'Iran / Oil Crisis',
    keywords: [
      'Iran', 'Hormuz', 'oil', 'crude', 'Brent', 'WTI', 'barrel',
      'OPEC', 'petroleum', 'gasoline', 'fuel', 'energy emergency',
      'SPR', 'Strategic Petroleum Reserve', 'ceasefire', 'sanctions',
      'refinery', 'tanker', 'strait',
    ],
    causalChainDescription:
      'Hormuz closure → crude spike → gasoline → energy emergency → SPR release',
    context:
      'Iran/Strait of Hormuz oil crisis. Brent crude ~$110-120/barrel. ' +
      'Iran near-complete closure of Strait of Hormuz throttling ~20% of global oil transit. ' +
      'Traders pricing in military escalation hours before strikes happen.',
  },

  'us-election': {
    id: 'us-election',
    name: 'US Election',
    keywords: [
      'election', 'president', 'senate', 'congress', 'vote', 'poll',
      'Republican', 'Democrat', 'swing state', 'Electoral College',
      'primary', 'candidate', 'approval rating',
    ],
    causalChainDescription:
      'polling shift → swing state movement → Electoral College outcome → policy change',
    context:
      'US federal election cycle. Prediction markets aggregating polling, ' +
      'fundraising, and news sentiment signals.',
  },

  'fed-rates': {
    id: 'fed-rates',
    name: 'Federal Reserve / Interest Rates',
    keywords: [
      'Fed', 'Federal Reserve', 'interest rate', 'rate hike', 'rate cut',
      'inflation', 'CPI', 'FOMC', 'basis points', 'recession', 'GDP',
      'unemployment', 'treasury', 'yield',
    ],
    causalChainDescription:
      'inflation reading → FOMC decision → rate change → credit market → equity/housing impact',
    context:
      'Federal Reserve monetary policy cycle. Markets pricing in probability ' +
      'of rate changes at upcoming FOMC meetings.',
  },

  'crypto': {
    id: 'crypto',
    name: 'Crypto / Bitcoin',
    keywords: [
      'Bitcoin', 'BTC', 'Ethereum', 'ETH', 'crypto', 'SEC', 'ETF',
      'halving', 'blockchain', 'stablecoin', 'regulation', 'exchange',
    ],
    causalChainDescription:
      'regulatory event → exchange flow → price movement → institutional adoption',
    context:
      'Cryptocurrency market dynamics. Prediction markets pricing in ' +
      'regulatory decisions, ETF approvals, and macro correlation.',
  },
};

// ── Exports ───────────────────────────────────────────────────────────────────

/** Returns a known domain config by ID, or builds a generic one from raw input. */
export function getDomain(
  idOrConfig: string | { keywords: string[]; causalChainDescription: string; context?: string },
): DomainConfig {
  // Known domain by ID
  if (typeof idOrConfig === 'string') {
    return DOMAINS[idOrConfig] ?? DOMAINS['iran-oil']; // fallback to iran-oil
  }

  // Dynamic domain passed directly from the frontend
  return {
    id: 'custom',
    name: 'Custom Domain',
    keywords: idOrConfig.keywords,
    causalChainDescription: idOrConfig.causalChainDescription,
    context: idOrConfig.context ?? '',
  };
}

export function listDomains(): DomainConfig[] {
  return Object.values(DOMAINS);
}
