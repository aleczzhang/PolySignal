import type { DomainId } from '../types';

export interface Signal {
  q:     string;
  pct:   number;
  delta: string;
  src:   string;
  spark: number[];
}

export interface SignalDomain {
  id:      DomainId;
  label:   string;
  tag:     string;
  desc:    string;
  oi:      string;
  oiPct:   number;
  x:       number;
  y:       number;
  r:       number;
  signals: [Signal, Signal, Signal];
}

export const SIGNAL_DOMAINS: SignalDomain[] = [
  {
    id: 'iran-oil', label: 'Iran · Oil Crisis', tag: 'ENERGY · FUTURES',
    desc: 'Geopolitical risk in the Persian Gulf driving crude oil supply disruptions and energy futures volatility.',
    oi: '$4.2B', oiPct: 0.85, x: 0.35, y: 0.44, r: 54,
    signals: [
      { q: 'Strait of Hormuz closes by June?',      pct: 67, delta: '+3%', src: 'POLYMARKET', spark: [38,40,35,36,34,38,30,28,26,32,28,22,20,18,16] },
      { q: 'Brent crude exceeds $120/barrel?',      pct: 54, delta: '+7%', src: 'POLYMARKET', spark: [44,43,42,42,40,38,36,36,34,32,28,26,22,20,20] },
      { q: 'US releases >50M barrels from SPR?',    pct: 42, delta: '+5%', src: 'KALSHI',     spark: [32,34,32,34,36,32,30,30,32,34,32,30,30,30,30] },
    ],
  },
  {
    id: 'fed-rates', label: 'Fed Rates', tag: 'MONETARY · MACRO',
    desc: 'Federal Reserve monetary policy and its macroeconomic impact on interest rates, inflation, and credit markets.',
    oi: '$1.1B', oiPct: 0.22, x: 0.22, y: 0.62, r: 38,
    signals: [
      { q: 'Fed cuts rates at June meeting?',        pct: 61, delta: '+8%', src: 'KALSHI',     spark: [44,42,40,38,36,32,28,24,22,20,18,14,12,10,8]  },
      { q: 'CPI falls below 2.5% by September?',    pct: 47, delta: '+3%', src: 'POLYMARKET', spark: [30,32,30,32,34,32,30,32,34,32,34,36,34,36,34]  },
      { q: 'Recession within 12 months?',           pct: 34, delta: '-2%', src: 'POLYMARKET', spark: [32,34,36,34,32,30,28,30,28,26,26,24,26,24,26]  },
    ],
  },
  {
    id: 'us-election', label: 'US Election', tag: 'POLITICAL · POLLS',
    desc: 'U.S. electoral cycle dynamics, congressional composition, and approval ratings affecting downstream policy markets.',
    oi: '$890M', oiPct: 0.18, x: 0.72, y: 0.30, r: 40,
    signals: [
      { q: 'Democrats win Senate in 2026?',          pct: 44, delta: '+2%', src: 'POLYMARKET', spark: [28,30,30,32,28,26,28,30,32,30,28,26,28,26,28]  },
      { q: 'Presidential approval above 45% Q3?',   pct: 38, delta: '-1%', src: 'KALSHI',     spark: [36,34,34,32,30,28,28,26,26,24,26,24,24,24,24]  },
      { q: 'Third-party files for 2028?',            pct: 29, delta: '+4%', src: 'POLYMARKET', spark: [20,22,24,22,24,26,28,26,28,30,32,34,36,34,36]  },
    ],
  },
  {
    id: 'crypto', label: 'Crypto / Bitcoin', tag: 'DIGITAL · ASSETS',
    desc: 'Digital asset market structure, regulatory developments, and institutional adoption of cryptocurrency instruments.',
    oi: '$2.3B', oiPct: 0.47, x: 0.70, y: 0.68, r: 46,
    signals: [
      { q: 'BTC exceeds $120k in 2025?',             pct: 58, delta: '+6%', src: 'POLYMARKET', spark: [44,42,38,34,30,26,22,18,14,12,10,8,6,4,2]     },
      { q: 'SEC approves ETH spot ETF by Q3?',       pct: 52, delta: '+4%', src: 'POLYMARKET', spark: [28,30,30,32,32,34,32,34,36,36,38,38,40,40,42]  },
      { q: 'Crypto market cap exceeds $5T?',         pct: 41, delta: '+9%', src: 'KALSHI',     spark: [24,26,26,28,30,30,32,32,34,36,38,40,42,44,46]  },
    ],
  },
];
