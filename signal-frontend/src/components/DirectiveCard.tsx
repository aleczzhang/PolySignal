import type { DomainId, OrgGroup, DirectiveVariant, PipelineFullResult } from '../types';

// ── Org group inference ───────────────────────────────────────────────────────

const GOV_KEYWORDS = ['agency','federal','government','dept','doe','dod','cia','nsa','congress','senate','intelligence','diplomatic','state department','defense','energy department'];
const FIN_KEYWORDS = ['fund','bank','trading','asset','investment','capital','financial','insurance','commodity','hedge','equity','portfolio','securities'];
const IND_KEYWORDS = ['company','corp','energy','oil','manufacturing','logistics','shipping','producer','refinery','industrial','operations','supply chain'];
const RES_KEYWORDS = ['university','research','think','ngo','institute','consulting','media','journal','academic','lab','faculty','foundation'];

export function inferOrgGroup(org: string): OrgGroup {
  const lower = org.toLowerCase();
  if (GOV_KEYWORDS.some(k => lower.includes(k))) return 'gov';
  if (FIN_KEYWORDS.some(k => lower.includes(k))) return 'fin';
  if (IND_KEYWORDS.some(k => lower.includes(k))) return 'ind';
  if (RES_KEYWORDS.some(k => lower.includes(k))) return 'res';
  return 'default';
}

// ── 20 directives (4 domains × 5 org groups) ─────────────────────────────────

type DirectiveTable = Record<DomainId, Record<OrgGroup, DirectiveVariant>>;

const DIRECTIVES: DirectiveTable = {
  'iran-oil': {
    gov: {
      actor: 'DOE Deputy Secretary',
      action: 'As {role}, brief the Secretary on SPR release triggers and Hormuz contingency options',
      mechanism: 'SPR Emergency Release Authority (42 U.S.C. § 6241)',
      geography: 'OECD + Gulf Corridor',
      window: '72 hours',
      urgency: 'immediate',
      reasoning: 'Correlated Polymarket signals show Hormuz closure probability leading crude price spikes by ~3 days at r=0.78. The window for preemptive SPR positioning closes before tanker diversion decisions solidify.',
    },
    fin: {
      actor: 'Energy Commodities Desk',
      action: 'As {role}, initiate a long Brent / short WTI spread ahead of the correlated Hormuz disruption window',
      mechanism: 'Futures spread position on CME/ICE',
      geography: 'Brent + WTI spot markets',
      window: '5 trading days',
      urgency: 'immediate',
      reasoning: 'Lead-lag structure shows Hormuz closure markets leading crude prices by 2.7 days (r=0.78). The spread window is profitable only while the prediction market signal remains unresolved.',
    },
    ind: {
      actor: 'Refinery Supply Chain',
      action: 'As {role}, accelerate crude inventory build before the correlated supply disruption window opens',
      mechanism: 'Emergency inventory procurement',
      geography: 'Gulf Coast refineries',
      window: '21 days',
      urgency: 'urgent',
      reasoning: 'Statistical screening shows Iran-related markets entering stressed regime with synchronized transitions. Procurement windows ahead of Hormuz closure are historically 18-25 days.',
    },
    res: {
      actor: 'Energy Policy Team',
      action: 'As {role}, publish a briefing on the correlated Hormuz-crude signal propagation chain',
      mechanism: 'Policy brief + policymaker outreach',
      geography: 'OECD energy policy community',
      window: '30 days',
      urgency: 'planned',
      reasoning: 'The correlation structure provides a novel illustration of real-time prediction market intelligence for energy policy. Signal strength (r=0.78) exceeds publication thresholds.',
    },
    default: {
      actor: 'Signal Watch Team',
      action: 'As {role}, flag the correlated Iran oil signal for immediate executive review',
      mechanism: 'Executive briefing memo',
      geography: 'Global energy markets',
      window: '14 days',
      urgency: 'urgent',
      reasoning: 'The joint posterior probability indicates a high-confidence causal chain from Hormuz disruption through crude to downstream markets. The propagation timeline suggests a 3-7 day action window.',
    },
  },

  'us-election': {
    gov: {
      actor: 'Congressional Liaison',
      action: 'As {role}, brief leadership on the correlated electoral shift signal across swing states',
      mechanism: 'SSCI/HPSCI intelligence briefing',
      geography: 'Key swing states',
      window: '21 days',
      urgency: 'urgent',
      reasoning: 'Prediction market correlations show synchronized movement across Senate/House/presidential outcomes in three correlated swing states — consistent with a cascade event, not a polling artifact.',
    },
    fin: {
      actor: 'Macro Strategies Desk',
      action: 'As {role}, reposition sector allocations ahead of the correlated electoral outcome shift',
      mechanism: 'Sector rotation strategy',
      geography: 'US equity + bond markets',
      window: '30 days',
      urgency: 'urgent',
      reasoning: 'Correlated prediction market signals across electoral outcomes historically price in sector rotation 3-6 weeks ahead of election day. Current correlation cluster suggests a high-conviction directional signal.',
    },
    ind: {
      actor: 'Government Affairs Team',
      action: 'As {role}, update policy risk scenarios based on the correlated electoral probability shifts',
      mechanism: 'Policy risk assessment update',
      geography: 'Washington D.C. + state capitals',
      window: '45 days',
      urgency: 'planned',
      reasoning: 'Regulatory exposure analysis should incorporate the prediction market consensus. The correlated cluster suggests high-probability electoral outcomes with direct policy implications in 2-3 jurisdictions.',
    },
    res: {
      actor: 'Political Science Group',
      action: 'As {role}, publish on correlated prediction market signals and electoral cascade dynamics',
      mechanism: 'Academic / think tank publication',
      geography: 'Academic + policy community',
      window: '30 days',
      urgency: 'planned',
      reasoning: 'The inter-market correlation structure reveals a cascade dynamic — prediction markets processing new information simultaneously across correlated electoral questions. Publishable as a methods contribution.',
    },
    default: {
      actor: 'Political Risk Team',
      action: 'As {role}, circulate the correlated electoral signal summary to stakeholders',
      mechanism: 'Stakeholder briefing',
      geography: 'US political landscape',
      window: '21 days',
      urgency: 'urgent',
      reasoning: 'The joint posterior probability across correlated electoral markets suggests a directional signal that warrants immediate stakeholder communication. The action window closes as markets reprice.',
    },
  },

  'fed-rates': {
    gov: {
      actor: 'Treasury Policy Desk',
      action: 'As {role}, prepare rate sensitivity analysis for the Deputy Secretary ahead of the correlated FOMC window',
      mechanism: 'Treasury policy memorandum',
      geography: 'US fixed income + credit markets',
      window: '14 days',
      urgency: 'urgent',
      reasoning: 'Prediction markets show a tightly correlated cluster of inflation-to-FOMC-to-yield signals. The lead-lag structure indicates the CPI market is pricing in the FOMC decision 10-12 days in advance.',
    },
    fin: {
      actor: 'Fixed Income Desk',
      action: 'As {role}, extend duration in anticipation of the correlated rate pivot signal',
      mechanism: 'Duration extension + curve positioning',
      geography: 'US Treasury + credit markets',
      window: '10 days',
      urgency: 'immediate',
      reasoning: 'The prediction market cluster shows high-confidence correlated pricing of a rate pivot. Duration extension in anticipation has historically delivered alpha in the 8-12 day window preceding FOMC announcements.',
    },
    ind: {
      actor: 'Corporate Treasury',
      action: 'As {role}, lock in fixed-rate financing ahead of the correlated rate change window',
      mechanism: 'Debt refinancing execution',
      geography: 'US credit markets',
      window: '30 days',
      urgency: 'urgent',
      reasoning: 'The correlated prediction market signal suggests rate movement within the action window. Locking fixed rates before the FOMC window preserves the cost-of-capital advantage.',
    },
    res: {
      actor: 'Macro Research Team',
      action: 'As {role}, model the correlated CPI-to-FOMC signal propagation for a policy brief',
      mechanism: 'Econometric modeling + publication',
      geography: 'US monetary policy',
      window: '45 days',
      urgency: 'planned',
      reasoning: 'The correlation structure provides an empirical test of prediction market informational efficiency in monetary policy. The lead-lag pattern (CPI → FOMC, r=0.81) is statistically significant.',
    },
    default: {
      actor: 'Risk Committee',
      action: 'As {role}, flag the correlated Fed rate signal for portfolio risk review',
      mechanism: 'Risk committee memo',
      geography: 'US interest rate markets',
      window: '21 days',
      urgency: 'urgent',
      reasoning: 'The joint posterior probability indicates a high-confidence directional rate signal. The correlation structure implies a propagation window of 8-14 days, consistent with the FOMC meeting calendar.',
    },
  },

  'crypto': {
    gov: {
      actor: 'Regulatory Affairs Counsel',
      action: 'As {role}, brief the Commissioner on the correlated crypto signal ahead of the enforcement window',
      mechanism: 'SEC/CFTC regulatory briefing',
      geography: 'US digital asset markets',
      window: '21 days',
      urgency: 'urgent',
      reasoning: 'Prediction market correlations show synchronized BTC price and regulatory approval probabilities. The signal implies markets anticipate a near-term regulatory decision not yet priced into spot markets.',
    },
    fin: {
      actor: 'Digital Assets Desk',
      action: 'As {role}, build a long BTC position ahead of the correlated institutional adoption signal',
      mechanism: 'Spot + perpetual derivatives position',
      geography: 'Crypto spot + derivatives markets',
      window: '7 days',
      urgency: 'immediate',
      reasoning: 'The prediction market cluster shows BTC ETF approval correlated with spot price at r=0.85, with a 2.1-day lead. The pre-positioning window is narrow.',
    },
    ind: {
      actor: 'Treasury Strategy',
      action: 'As {role}, accelerate the Bitcoin treasury allocation ahead of the correlated adoption signal',
      mechanism: 'Corporate treasury allocation',
      geography: 'Crypto custody markets',
      window: '30 days',
      urgency: 'urgent',
      reasoning: 'Prediction markets show synchronized ETF approval and price signals. Corporate Bitcoin exposure ahead of institutional adoption waves has historically delivered first-mover advantage in the 2-4 week pre-signal window.',
    },
    res: {
      actor: 'Blockchain Research Group',
      action: 'As {role}, publish a microstructure note on the correlated on-chain and prediction market signal',
      mechanism: 'Research publication + conference submission',
      geography: 'Global crypto markets',
      window: '30 days',
      urgency: 'planned',
      reasoning: 'The correlation between prediction markets and on-chain flows provides a novel contribution. The lead-lag pattern (prediction market → price, r=0.85) challenges efficient market assumptions in crypto.',
    },
    default: {
      actor: 'Investment Committee',
      action: 'As {role}, circulate the correlated crypto market signal alert for investment review',
      mechanism: 'Investment committee memo',
      geography: 'Digital asset markets',
      window: '14 days',
      urgency: 'urgent',
      reasoning: 'The joint posterior probability across correlated crypto prediction markets suggests a high-confidence directional signal. The 2.1-day lead structure implies a short action window before spot markets reprice.',
    },
  },
};

// ── Component ─────────────────────────────────────────────────────────────────

interface Props {
  domain:   DomainId;
  role:     string;
  org:      string;
  result?:  PipelineFullResult;
}

export function DirectiveCard({ domain, role, org, result }: Props) {
  const orgGroup = inferOrgGroup(org);
  const variant  = DIRECTIVES[domain]?.[orgGroup] ?? DIRECTIVES[domain]?.default;

  if (!variant) return null;

  // Use backend data where available, fall back to static
  const ad = result?.actionDirective;
  const ma = result?.mathAnalysis;

  const urgency    = ad?.urgency   ?? variant.urgency;
  const action     = (ad?.action   ?? variant.action).replace(/\{role\}/g, role || 'analyst');
  const actor      = ad?.actor     ?? variant.actor;
  const mechanism  = ad?.legalMechanism ?? variant.mechanism;
  const geography  = ad?.geography ?? variant.geography;
  const window_    = ad?.timeWindow ?? variant.window;
  const reasoning  = ad?.reasoning ?? variant.reasoning;

  const jointPost  = ad?.jointPosteriorProbability ?? ma?.jointPosteriorProbability;
  const ciLow      = ad?.confidenceIntervalLow     ?? ma?.confidenceIntervalLow;
  const ciHigh     = ad?.confidenceIntervalHigh    ?? ma?.confidenceIntervalHigh;
  const actionDays = ad?.effectiveWindowDays       ?? ma?.effectiveActionWindowDays;
  const signalScore = ma?.mathSignalStrength ?? (ad?.confidenceScore ? ad.confidenceScore * 100 : null);

  const scoreColor = signalScore == null
    ? 'var(--muted)'
    : signalScore >= 70 ? '#111111'
    : signalScore >= 50 ? '#555555'
    : '#888888';

  const hasProfile = role.trim() && org.trim();

  return (
    <div className="dir-card">
      {/* Header */}
      <div className="dir-header">
        <div className="dir-title"><span className="bw">🗂️</span> Action Directive</div>
        <div className={`urgency-chip ${urgency}`}>{urgency}</div>
      </div>

      {/* Tailored-for banner — Rule 4: text in a box */}
      {hasProfile && (
        <div className="tailored-banner">
          <span className="bw">✨</span>
          <span>Tailored for: <strong>{role}</strong> · {org}</span>
        </div>
      )}

      {/* Body */}
      <div className="dir-body">

        {/* Action box */}
        <div className="dir-action-box">
          <span className="dir-rec-label">Recommended Action</span>
          <p className="dir-action-text">{action}</p>
        </div>

        {/* Field grid */}
        <div className="dir-fields">
          <div className="dir-field">
            <span className="dir-field-label">Actor</span>
            <span className="dir-field-value actor-val">{actor}</span>
          </div>
          <div className="dir-field">
            <span className="dir-field-label">Legal Mechanism</span>
            <span className="dir-field-value">{mechanism}</span>
          </div>
          <div className="dir-field">
            <span className="dir-field-label">Geography</span>
            <span className="dir-field-value">{geography}</span>
          </div>
          <div className="dir-field">
            <span className="dir-field-label">Time Window</span>
            <span className="dir-field-value window-val">{window_}</span>
          </div>
        </div>

        {/* Reasoning */}
        <p className="dir-reasoning">{reasoning}</p>

        {/* Posterior strip */}
        <div className="post-strip">
          <div className="post-cell">
            <div className="post-cell-label">Joint Posterior</div>
            <div className="post-cell-value" style={{ color: 'var(--text)' }}>
              {jointPost != null ? `${Math.round(jointPost * 100)}%` : '—'}
            </div>
          </div>
          <div className="post-cell">
            <div className="post-cell-label">80% CI</div>
            <div className="post-cell-value" style={{ color: 'var(--muted)', fontSize: 14 }}>
              {ciLow != null && ciHigh != null
                ? `${Math.round(ciLow * 100)}–${Math.round(ciHigh * 100)}%`
                : '—'}
            </div>
          </div>
          <div className="post-cell">
            <div className="post-cell-label">Action Window</div>
            <div className="post-cell-value" style={{ color: 'var(--light)' }}>
              {actionDays != null ? `${actionDays}d` : window_}
            </div>
          </div>
          <div className="post-cell">
            <div className="post-cell-label">Signal Score</div>
            <div className="post-cell-value" style={{ color: scoreColor }}>
              {signalScore != null ? `${Math.round(signalScore)}` : '—'}
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
