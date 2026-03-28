import { callK2Think, parseK2Json } from '../k2think.js';
import type { StakeholderResult } from '../types.js';
import type { DomainConfig } from '../domains.js';

// ── Hardcoded Iran/oil fallback ───────────────────────────────────────────────

const IRAN_OIL_STAKEHOLDERS: StakeholderResult = {
  primaryActor: {
    name:              'US Department of Energy — Office of Petroleum Reserves',
    role:              'Strategic Petroleum Reserve authorization and release',
    authority:         'Emergency SPR drawdown authority',
    legalMechanism:    'Energy Policy and Conservation Act (EPCA) — 42 USC 6241. ' +
                       'President can authorize SPR drawdown upon finding "severe energy supply interruption." ' +
                       'DOE Secretary executes within 48 hours of presidential authorization.',
    deploymentLeadTime:'48 hours for presidential authorization, 13–15 days for first barrels to reach market after drawdown order',
  },
  secondaryActors: [
    { name: 'International Energy Agency (IEA)',          role: 'Coordinated strategic reserve release across member nations' },
    { name: 'Federal Energy Regulatory Commission (FERC)', role: 'Emergency orders for pipeline capacity and gas supply rerouting' },
    { name: 'Department of State',                         role: 'Diplomatic pressure on OPEC+ for emergency production increase' },
    { name: 'US Navy 5th Fleet (Bahrain)',                 role: 'Strait of Hormuz naval escort and freedom of navigation operations' },
  ],
  institutionalContext:
    'The SPR holds ~350 million barrels — roughly 18 days of US consumption. ' +
    'A full emergency drawdown of 1M barrels/day for 30 days would release 30M barrels. ' +
    'This is most effective when coordinated with IEA allies (total IEA reserve ~1.5B barrels). ' +
    'The 13–15 day pipeline from drawdown order to market delivery means authorization ' +
    'must happen before prices peak — not after. This is exactly the lead-time problem ' +
    'that prediction markets solve. ' +
    'Key constraint: SPR releases dampen price spikes by ~$3–8/barrel depending on ' +
    'coordination. They do not replace lost Hormuz throughput (15M bbl/day) — ' +
    'they buy time for diplomatic resolution or supply rerouting.',
};

// ── Main export ───────────────────────────────────────────────────────────────

export async function getStakeholders(
  domain: DomainConfig,
  causalMechanism: string,
): Promise<StakeholderResult> {
  try {
    const raw = await callK2Think(`
You are identifying the key institutional actors who must respond to a confirmed prediction market signal.

DOMAIN: ${domain.name}
CAUSAL MECHANISM: ${causalMechanism}
CAUSAL CHAIN: ${domain.causalChainDescription}
CONTEXT: ${domain.context}

Identify:
1. PRIMARY ACTOR — the single institution with the authority and mandate to act on this signal. Include their specific legal mechanism and how long it takes to deploy.
2. SECONDARY ACTORS — supporting institutions (2–5) who play a role in the response chain.
3. INSTITUTIONAL CONTEXT — key constraints, lead times, or coordination requirements that affect when authorization must happen.

Be specific. Name the exact office, bureau, or role — not just the department.
Reference the actual legal authority (statute, executive order, regulation).
Include realistic deployment lead times.

Return ONLY valid JSON:
{
  "primaryActor": {
    "name": "...",
    "role": "...",
    "authority": "...",
    "legalMechanism": "...",
    "deploymentLeadTime": "..."
  },
  "secondaryActors": [
    { "name": "...", "role": "..." }
  ],
  "institutionalContext": "..."
}
`.trim(), 'medium');

    return parseK2Json<StakeholderResult>(raw);
  } catch {
    // Fall back to hardcoded data if K2 fails or domain is iran-oil
    if (domain.id === 'iran-oil') return IRAN_OIL_STAKEHOLDERS;

    // Generic fallback for unknown domains
    return {
      primaryActor: {
        name:              'Relevant Government Agency',
        role:              'Primary response authority for this domain',
        authority:         'To be determined based on domain',
        legalMechanism:    'Statutory authority pending domain analysis',
        deploymentLeadTime:'Unknown — domain-specific',
      },
      secondaryActors: [],
      institutionalContext: 'Stakeholder analysis unavailable — K2 Think V2 call failed.',
    };
  }
}
