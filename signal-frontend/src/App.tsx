import { useState, useEffect, useRef } from 'react'
import { Sidebar, type TabId } from './components/Sidebar'
import { usePipeline } from './hooks/usePipeline'
import type { DomainId } from './types'

// ── Domain config ─────────────────────────────────────────────────────────────

const DOMAINS: { id: DomainId; name: string; iconCode: string; sub: string; volume: string; desc: string }[] = [
  { id: 'iran-oil',    name: 'Iran · Oil Crisis', iconCode: 'OIL', sub: 'ENERGY·FUTURES',  volume: '$4.2B', desc: 'Hormuz closure risk, crude supply shocks, and SPR drawdown signals.' },
  { id: 'us-election', name: 'US Election',        iconCode: 'GOV', sub: 'POLITICAL·POLLS', volume: '$890M', desc: 'Swing-state presidential, Senate, and House probability shifts.' },
  { id: 'fed-rates',   name: 'Fed Rates',           iconCode: 'FED', sub: 'MONETARY·MACRO',  volume: '$1.1B', desc: 'FOMC rate-cut probability, CPI trajectory, and recession signals.' },
  { id: 'crypto',      name: 'Crypto / Bitcoin',    iconCode: 'BTC', sub: 'DIGITAL·ASSETS', volume: '$2.3B', desc: 'BTC price outlook, ETF approval odds, and regulatory regime signals.' },
]

// ── Signal meta: question + why it matters per domain × market ────────────────

type SignalMeta = { question: string; whyItMatters: string }

const SIGNAL_META: Record<DomainId, [SignalMeta, SignalMeta, SignalMeta]> = {
  'iran-oil': [
    { question: 'Will the Strait of Hormuz close by June?',     whyItMatters: 'A closure would cut ~20% of global seaborne oil. Markets price this 2–3 days before tanker diversion decisions.' },
    { question: 'Will Brent crude exceed $120 per barrel?',      whyItMatters: 'Above $120, airline and logistics cost curves break. Energy stocks decouple from broader indices.' },
    { question: 'Will the US release >50M barrels from the SPR?',whyItMatters: 'SPR release is a leading indicator of White House threat assessment — not a price tool.' },
  ],
  'us-election': [
    { question: 'Will the Republican candidate win the presidency?', whyItMatters: 'Tax and trade policy diverge sharply. Energy, defense, and healthcare sectors rotate 3–6 weeks pre-election.' },
    { question: 'Will Democrats win the Senate?',                    whyItMatters: 'Senate control determines regulatory agency appointments and budget reconciliation paths.' },
    { question: 'Will Democrats win the House?',                     whyItMatters: 'A split Congress constrains executive priorities — fiscal bills stall, oversight intensifies.' },
  ],
  'fed-rates': [
    { question: 'Will the Fed cut rates at the June FOMC meeting?', whyItMatters: 'A cut triggers duration extension in fixed income and sector rotation into rate-sensitive equities.' },
    { question: 'Will CPI fall below 3% by Q3?',                   whyItMatters: "Sub-3% CPI removes the Fed's last hawkish justification. Bond markets price this in 10-12 days early." },
    { question: 'Will the US enter a recession in 2025?',          whyItMatters: 'Recession signals tighten credit spreads, depress commodity demand, and shift Fed rhetoric overnight.' },
  ],
  'crypto': [
    { question: 'Will Bitcoin exceed $100k by year-end?',  whyItMatters: 'Six-figure BTC unlocks corporate treasury allocations and retail FOMO loops not yet in spot prices.' },
    { question: 'Will an Ethereum ETF receive SEC approval?', whyItMatters: 'ETH ETF approval correlates with BTC spot at r=0.85 with a 2.1-day lead — institutional inflows follow.' },
    { question: 'Will the SEC drop its BTC enforcement case?',whyItMatters: 'Case resolution removes regulatory overhang. Historically precedes 15–25% spot rallies within 30 days.' },
  ],
}

// ── Mock spark markets per domain ─────────────────────────────────────────────

import type { SparkMarket } from './types'

function mockMarkets(domain: DomainId): SparkMarket[] {
  const seed = (n: number, offset = 0) =>
    Array.from({ length: 30 }, (_, i) =>
      Math.max(0.05, Math.min(0.98,
        0.3 + offset + Math.sin(i * 0.7 + n) * 0.12 + Math.cos(i * 1.3 + n * 2) * 0.08
      ))
    )

  const MAP: Record<DomainId, SparkMarket[]> = {
    'iran-oil': [
      { name: 'Hormuz closure by June?',   probability: 0.67, delta24h:  0.03, probHistory: seed(1, 0.35), source: 'Polymarket', color: '#246B78' },
      { name: 'Brent > $120 / barrel?',    probability: 0.54, delta24h:  0.07, probHistory: seed(2, 0.2),  source: 'Polymarket', color: '#35899A' },
      { name: 'SPR Release > 50M bbl?',    probability: 0.42, delta24h:  0.05, probHistory: seed(3, 0.1),  source: 'Kalshi',     color: '#5AABB8' },
    ],
    'us-election': [
      { name: 'Rep. wins presidency?',     probability: 0.58, delta24h: -0.02, probHistory: seed(4, 0.25), source: 'Polymarket', color: '#246B78' },
      { name: 'Dem. wins Senate?',         probability: 0.51, delta24h:  0.01, probHistory: seed(5, 0.18), source: 'Kalshi',     color: '#35899A' },
      { name: 'Dem. wins House?',          probability: 0.47, delta24h: -0.03, probHistory: seed(6, 0.14), source: 'Polymarket', color: '#5AABB8' },
    ],
    'fed-rates': [
      { name: 'Fed cuts June FOMC?',       probability: 0.73, delta24h:  0.05, probHistory: seed(7, 0.4),  source: 'Polymarket', color: '#246B78' },
      { name: 'CPI < 3% by Q3?',           probability: 0.61, delta24h:  0.04, probHistory: seed(8, 0.28), source: 'Kalshi',     color: '#35899A' },
      { name: 'Recession in 2025?',        probability: 0.38, delta24h: -0.02, probHistory: seed(9, 0.05), source: 'Polymarket', color: '#5AABB8' },
    ],
    'crypto': [
      { name: 'BTC > $100k by EOY?',       probability: 0.69, delta24h:  0.06, probHistory: seed(10, 0.36), source: 'Polymarket', color: '#246B78' },
      { name: 'ETH ETF approved?',         probability: 0.78, delta24h:  0.08, probHistory: seed(11, 0.45), source: 'Kalshi',     color: '#35899A' },
      { name: 'SEC drops BTC case?',       probability: 0.55, delta24h:  0.03, probHistory: seed(12, 0.22), source: 'Polymarket', color: '#5AABB8' },
    ],
  }
  return MAP[domain]
}

// ── App ───────────────────────────────────────────────────────────────────────

export default function App() {
  const [tab, setTab]       = useState<TabId>(1)
  const [domain, setDomain] = useState<DomainId | null>(null)
  const [role, setRole]     = useState('')
  const [org,  setOrg]      = useState('')

  const { state, run, reset } = usePipeline()

  const done    = state.finalStatus === 'confirmed'
  const running = state.running

  // Auto-navigate to Tab 2 when pipeline starts
  useEffect(() => {
    if (running) setTab(2)
  }, [running])

  // Auto-navigate to Tab 3 on confirmation (700ms delay)
  useEffect(() => {
    if (done) {
      const t = setTimeout(() => setTab(3), 700)
      return () => clearTimeout(t)
    }
  }, [done])

  function handleDomainChange(id: DomainId) {
    setDomain(id)
    reset()
  }

  return (
    <div className="app-layout" style={{ display: 'flex', flexDirection: 'column', width: '100%', minHeight: '100vh' }}>
      <Sidebar
        activeTab={tab}
        onTabChange={setTab}
        running={running}
        done={done}
      />

      <main className="app-main">
        {/* ── Tab 1: Setup ──────────────────────────────────────────────── */}
        <div className={`tab-panel${tab === 1 ? ' active' : ''}`}>
          <Tab1Setup
            domain={domain}
            onDomainChange={handleDomainChange}
            role={role}
            org={org}
            onRoleChange={setRole}
            onOrgChange={setOrg}
            markets={domain ? mockMarkets(domain) : []}
            running={running}
            done={done}
            result={state.fullResult}
            onRun={() => domain && run(domain)}
          />
        </div>

        {/* ── Tab 2: Analysis ───────────────────────────────────────────── */}
        <div className={`tab-panel${tab === 2 ? ' active' : ''}`}>
          <Tab2Analysis
            state={state}
            done={done}
          />
        </div>

        {/* ── Tab 3: Results ────────────────────────────────────────────── */}
        <div className={`tab-panel${tab === 3 ? ' active' : ''}`}>
          <Tab3Results
            domain={domain ?? 'iran-oil'}
            role={role}
            org={org}
            result={state.fullResult}
            rejectedMarkets={(state.fullResult?.rejectedClusters ?? state.rejectedClusters).flatMap((c: { markets: ScreenedMarket[] }) => c.markets)}
            confirmedMarkets={state.fullResult?.cluster ?? []}
          />
        </div>
      </main>
    </div>
  )
}

// ── Inline tab components (will be extracted to own files next) ───────────────

import { useRef as useCanvasRef, useEffect as useCanvasEffect } from 'react'
import { useCountUp } from './hooks/useCountUp'

// Animates a number from 0 to `n` on mount/change
function AnimatedNum({ n, suffix = '' }: { n: number; suffix?: string }) {
  const v = useCountUp(n, 650)
  return <>{v}{suffix}</>
}

// Bare sparkline canvas (no card chrome) — used inside signal-cards
function SparkLine({ data, color }: { data: number[]; color: string }) {
  const ref = useCanvasRef<HTMLCanvasElement>(null)
  useCanvasEffect(() => {
    let raf1: number, raf2: number
    raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => {
        const canvas = ref.current; if (!canvas) return
        const parent = canvas.parentElement; if (!parent) return
        const w = parent.offsetWidth, h = parent.offsetHeight
        canvas.width = w; canvas.height = h
        const ctx = canvas.getContext('2d'); if (!ctx || data.length < 2) return
        const pad = 2
        const min = Math.min(...data), max = Math.max(...data)
        const range = max - min || 0.01
        const pts = data.map((v, i) => ({
          x: (i / (data.length - 1)) * w,
          y: pad + (1 - (v - min) / range) * (h - pad * 2),
        }))
        const grad = ctx.createLinearGradient(0, 0, 0, h)
        grad.addColorStop(0, color + '30'); grad.addColorStop(1, color + '00')
        ctx.beginPath(); ctx.moveTo(pts[0].x, pts[0].y)
        for (let i = 1; i < pts.length; i++) {
          const cx = (pts[i-1].x + pts[i].x) / 2
          ctx.bezierCurveTo(cx, pts[i-1].y, cx, pts[i].y, pts[i].x, pts[i].y)
        }
        ctx.lineTo(pts[pts.length-1].x, h); ctx.lineTo(pts[0].x, h); ctx.closePath()
        ctx.fillStyle = grad; ctx.fill()
        ctx.beginPath(); ctx.moveTo(pts[0].x, pts[0].y)
        for (let i = 1; i < pts.length; i++) {
          const cx = (pts[i-1].x + pts[i].x) / 2
          ctx.bezierCurveTo(cx, pts[i-1].y, cx, pts[i].y, pts[i].x, pts[i].y)
        }
        ctx.strokeStyle = color; ctx.lineWidth = 1.5; ctx.stroke()
      })
    })
    return () => { cancelAnimationFrame(raf1); cancelAnimationFrame(raf2) }
  }, [data, color])
  return (
    <div style={{ position: 'relative', height: 36 }}>
      <canvas ref={ref} style={{ position: 'absolute', inset: 0 }} />
    </div>
  )
}
import { AgentPill, type PillConfig } from './components/AgentPill'
import { ProgressRing }     from './components/ProgressRing'
import { CorrelationChart } from './components/CorrelationChart'
import { DirectiveCard }    from './components/DirectiveCard'
import type { PipelineState, PipelineFullResult, ScreenedMarket } from './types'

// ── Tab 1 ─────────────────────────────────────────────────────────────────────

function Tab1Setup({
  domain, onDomainChange, role, org, onRoleChange, onOrgChange,
  markets, running, done, result, onRun,
}: {
  domain: DomainId | null
  onDomainChange: (id: DomainId) => void
  role: string; org: string
  onRoleChange: (v: string) => void
  onOrgChange:  (v: string) => void
  markets: SparkMarket[]
  running: boolean; done: boolean
  result: PipelineFullResult | null
  onRun: () => void
}) {
  const bothFilled    = role.trim() !== '' && org.trim() !== ''
  const [profileOpen, setProfileOpen] = useState(true)
  const step2Ref = useRef<HTMLDivElement>(null)
  const step3Ref = useRef<HTMLDivElement>(null)

  // Auto-scroll to Step 2 when domain selected
  useEffect(() => {
    if (domain) {
      setTimeout(() => step2Ref.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 80)
    }
  }, [domain])

  const initials = bothFilled
    ? role.trim().split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
    : ''

  const selectedDomain = DOMAINS.find(d => d.id === domain)
  const signalMeta     = domain ? SIGNAL_META[domain] : null

  return (
    <>
      <div style={{ padding: '28px 30px', display: 'flex', flexDirection: 'column', gap: 40 }}>

        {/* ── Profile (collapses to banner) ──────────────────────────────── */}
        {bothFilled && !profileOpen ? (
          <div className="profile-banner">
            <div className="profile-banner-avatar">{initials}</div>
            <div className="profile-banner-text">
              <div className="profile-banner-name">{role}</div>
              <div className="profile-banner-org">{org}</div>
            </div>
            <button className="profile-banner-edit" onClick={() => setProfileOpen(true)}>Edit</button>
          </div>
        ) : (
          <section className="flow-step">
            <div>
              <div className="flow-step-header">
                <span className="flow-step-num">Your profile</span>
                <span className="flow-step-title">Who should we brief?</span>
              </div>
              <p className="flow-step-desc">Your role and organization let us tailor the action directive to your exact decision-making context.</p>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div>
                <label style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--dim)', letterSpacing: '0.12em', textTransform: 'uppercase', display: 'block', marginBottom: 6 }}>
                  Your role
                </label>
                <input
                  className="field-input"
                  placeholder="e.g. Director of Policy"
                  value={role}
                  onChange={e => onRoleChange(e.target.value)}
                />
              </div>
              <div>
                <label style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--dim)', letterSpacing: '0.12em', textTransform: 'uppercase', display: 'block', marginBottom: 6 }}>
                  Organization
                </label>
                <input
                  className="field-input"
                  placeholder="e.g. USDA, Goldman Sachs"
                  value={org}
                  onChange={e => onOrgChange(e.target.value)}
                />
              </div>
            </div>
            {bothFilled && (
              <div className="confirm-badge" style={{ cursor: 'pointer' }} onClick={() => setProfileOpen(false)}>
                <span>✨</span>
                <span>Tailoring for <strong>{role}</strong> at <strong>{org}</strong> — <u>collapse</u></span>
              </div>
            )}
          </section>
        )}

        {/* ── Step 01: Choose domain ─────────────────────────────────────── */}
        <section className="flow-step">
          <div>
            <div className="flow-step-header">
              <span className="flow-step-num">Step 01</span>
              <span className="flow-step-title">Choose a domain</span>
            </div>
            <p className="flow-step-desc">Select the geopolitical or financial market you want to analyze. Each domain pulls live prediction market data from Polymarket and Kalshi.</p>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12 }}>
            {DOMAINS.map(d => (
              <button
                key={d.id}
                className={`domain-card-lg${domain === d.id ? ' active' : ''}`}
                onClick={() => onDomainChange(d.id)}
                disabled={running}
              >
                <div className="domain-card-lg-icon">{d.iconCode}</div>
                <div className="domain-card-lg-name">{d.name}</div>
                <div className="domain-card-lg-sub">{d.sub}</div>
                <div className="domain-card-lg-desc">{d.desc}</div>
                <div className="domain-card-lg-vol">{d.volume} open interest</div>
              </button>
            ))}
          </div>
        </section>

        {/* ── Step 02: Market preview (revealed on domain select) ───────── */}
        {domain && signalMeta && (
          <section key={domain} className="flow-step" ref={step2Ref} style={{ animation: 'fadeSlide 0.35s ease' }}>
            <div>
              <div className="flow-step-header">
                <span className="flow-step-num">Step 02</span>
                <span className="flow-step-title">Markets being analyzed</span>
              </div>
              <p className="flow-step-desc">
                Live prediction market probabilities for <strong>{selectedDomain?.name}</strong> from Polymarket and Kalshi.
                The pipeline will screen these, build a correlation lag matrix, and select the causal cluster.
              </p>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {markets.map((m, i) => {
                const meta = signalMeta[i as 0 | 1 | 2]
                return (
                  <div key={i} className="signal-card">
                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
                      <div className="signal-question">{meta.question}</div>
                      <span className="source-badge">{m.source}</span>
                    </div>

                    <div className="signal-prob-row">
                      <span className="signal-prob"><AnimatedNum n={Math.round(m.probability * 100)} suffix="%" /></span>
                      <span className={`signal-delta ${m.delta24h >= 0 ? 'pos' : 'neg'}`}>
                        {m.delta24h >= 0 ? '+' : ''}{Math.round(m.delta24h * 100)}% today
                      </span>
                    </div>

                    <div>
                      <div className="signal-trend-label">30-day probability trend</div>
                      <SparkLine data={m.probHistory} color={m.color} />
                    </div>
                  </div>
                )
              })}
            </div>
          </section>
        )}

        {/* ── Step 03: Generate insights ─────────────────────────────────── */}
        <section className="flow-step" ref={step3Ref}>
          <div>
            <div className="flow-step-header">
              <span className="flow-step-num">Step 03</span>
              <span className="flow-step-title">Generate your intelligence brief</span>
            </div>
            <p className="flow-step-desc">
              {domain
                ? `The K2 Think V2 pipeline will run a causal multi-agent analysis on ${selectedDomain?.name} — screening markets, validating correlations, and producing a tailored action directive.`
                : 'Select a domain above to unlock the analysis pipeline.'}
            </p>
          </div>

          <button
            className="run-btn-large"
            onClick={onRun}
            disabled={running || !domain}
          >
            {running ? (
              <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
                <span style={{ display: 'inline-block', animation: 'spin 1.2s linear infinite', fontSize: 18 }}>◌</span>
                Running K2 pipeline…
              </span>
            ) : domain
              ? `Generate Policy Insights — ${selectedDomain?.name}`
              : 'Select a domain to continue'}
          </button>

          {!domain && (
            <p style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--dim)', textAlign: 'center', letterSpacing: '0.06em' }}>
              ↑ Choose a domain in Step 01 to unlock
            </p>
          )}

          {done && result && (
            <div className="overview-card" style={{ marginTop: 4 }}>
              <div className="overview-card-body">
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                  <div style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--text)' }} />
                  <span style={{ fontFamily: 'var(--mono)', fontSize: 10, fontWeight: 500, color: 'var(--text)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
                    Signal confirmed — see Results tab
                  </span>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
                  {([
                    ['Domain',  selectedDomain?.name ?? domain],
                    ['Status',  result.status ?? 'confirmed'],
                    ['Cluster', `${(result.cluster?.length ?? 0)} markets`],
                  ] as [string, string][]).map(([label, val]) => (
                    <div key={label}>
                      <div style={{ fontFamily: 'var(--mono)', fontSize: 8, color: 'var(--dim)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 3 }}>{label}</div>
                      <div style={{ fontFamily: 'var(--sans)', fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{val}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </section>

      </div>
    </>
  )
}

// ── Tab 2 ─────────────────────────────────────────────────────────────────────

// Sequential stages (rendered top-to-bottom with connectors)
const SEQUENTIAL_PILLS: (PillConfig & { agentKey: string })[] = [
  { label: 'fetchMarkets()',      sub: 'Polymarket + Kalshi enrichment',               badge: 'code', maxRetries: null, agentKey: 'MarketFetcherAgent'      },
  { label: 'Statistical screener', sub: 'Lag matrix + regime classification',          badge: 'math', maxRetries: null, agentKey: 'StatisticalScreenerAgent' },
  { label: 'K2 — orchestration', sub: 'Correlation validation · cluster selection',    badge: 'k2',   maxRetries: 3,   agentKey: 'K2ThinkV2-Orchestrator'   },
]

// Parallel K2 agents (rendered side-by-side)
const PARALLEL_PILLS: (PillConfig & { agentKey: string })[] = [
  { label: 'K2 — causal reasoning', sub: 'Mechanism + confounding analysis',          badge: 'k2',   maxRetries: 2,   agentKey: 'K2ThinkV2-CausalReasoning' },
  { label: 'K2 — math analysis',    sub: 'Joint posterior + CI calculation',          badge: 'k2',   maxRetries: null, agentKey: 'K2ThinkV2-MathReasoning'  },
]

// All unique agent keys for progress calculation
const ALL_PILL_KEYS = [...SEQUENTIAL_PILLS, ...PARALLEL_PILLS].map(p => p.agentKey)

function Tab2Analysis({ state, done }: { state: PipelineState; done: boolean }) {
  const agents = state.agents
  const streamEndRef = useRef<HTMLDivElement>(null)

  // Progress: count completed agents out of total unique keys
  const uniqueKeys = [...new Set(ALL_PILL_KEYS)]
  const completedCount = uniqueKeys.filter(k => agents[k]?.status === 'complete').length
  const percent = done ? 100 : Math.round((completedCount / uniqueKeys.length) * 95)

  // Current step name + streaming text from first running agent
  const streamingAgent = Object.values(agents).find(a => a.status === 'streaming')
  const runningAgent   = Object.values(agents).find(a => a.status === 'running' || a.status === 'streaming')
  const stepName = runningAgent?.id?.replace('K2ThinkV2-', 'K2 ').replace('Agent', '') ?? ''

  // Last completed K2 decision
  const lastDecision = state.k2Decisions[state.k2Decisions.length - 1]

  // Auto-scroll reasoning stream
  useEffect(() => {
    streamEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [streamingAgent?.partialText])

  return (
    <>
      <div className="panel-header">
        <div>
          <div className="panel-title"><span className="bw">⚙️</span> Agents at work</div>
          <div className="panel-sub">Real-time K2 Think V2 multi-agent pipeline</div>
        </div>
      </div>

      <div style={{ padding: '28px 30px', display: 'flex', justifyContent: 'center' }}>
        <div style={{ width: '100%', maxWidth: 680, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 24 }}>

          {/* Progress ring — centered, larger */}
          <ProgressRing
            percent={percent}
            done={done}
            running={state.running}
            stepName={stepName || undefined}
            size={240}
          />

          {/* Pipeline — visual flow with connectors + parallel split */}
          <div className="ps-flow">
            {/* Sequential: fetch → screener → orchestrator */}
            {SEQUENTIAL_PILLS.map((cfg) => (
              <div key={cfg.agentKey} className="ps-stage-wrap">
                <AgentPill config={cfg} agentState={agents[cfg.agentKey]} />
                <div className="ps-connector" />
              </div>
            ))}

            {/* Parallel K2 analysis section */}
            <div className="ps-parallel-label">
              <div className="ps-parallel-dot" />
              K2 parallel analysis
              <div className="ps-parallel-line" />
            </div>
            <div className="ps-parallel-cards">
              {PARALLEL_PILLS.map((cfg) => (
                <AgentPill key={cfg.agentKey} config={cfg} agentState={agents[cfg.agentKey]} />
              ))}
            </div>
          </div>

          {state.error && (
            <div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--muted)', padding: '10px 16px', border: '1px solid rgba(0,0,0,0.12)', borderRadius: 6, background: 'var(--bg3)', width: '100%' }}>
              ⚠ {state.error}
            </div>
          )}

          {/* Live stream panel — below pipeline */}
          {streamingAgent && streamingAgent.partialText && (
            <div className="reasoning-panel">
              <div className="reasoning-panel-label">
                K2 Think V2 — {streamingAgent.id?.replace('K2ThinkV2-', '').replace('Agent', '')} — reasoning
              </div>
              <div className="reasoning-panel-text">
                {streamingAgent.partialText}
                <span className="reasoning-cursor" />
                <div ref={streamEndRef} />
              </div>
            </div>
          )}

          {/* Working indicator when running but no text yet */}
          {runningAgent && !streamingAgent && (
            <div className="reasoning-panel">
              <div className="reasoning-panel-label">
                {runningAgent.id?.replace('K2ThinkV2-', '').replace('Agent', '')} — processing
              </div>
              <div className="reasoning-panel-text" style={{ color: 'var(--dim)' }}>
                Fetching data and running analysis
                <span style={{ animation: 'pulseDot 1.2s ease-in-out infinite', display: 'inline-block', marginLeft: 4 }}>…</span>
              </div>
            </div>
          )}

          {/* Last K2 decision */}
          {lastDecision && (
            <div style={{
              width: '100%',
              background: 'var(--accent-bg)',
              border: '1px solid var(--accent-border)',
              borderRadius: 8,
              padding: '12px 16px',
              animation: 'fadeSlide 0.3s ease',
            }}>
              <div style={{ fontFamily: 'var(--mono)', fontSize: 8, color: 'var(--accent)', letterSpacing: '0.14em', textTransform: 'uppercase', marginBottom: 6 }}>
                Last K2 decision
              </div>
              <div style={{ fontFamily: 'var(--sans)', fontSize: 13, color: 'var(--text)', lineHeight: 1.6 }}>
                {lastDecision.decision}
              </div>
              <div style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--dim)', marginTop: 6 }}>
                → {lastDecision.agent.replace('K2ThinkV2-', '').replace('Agent', '')} · {new Date(lastDecision.timestamp).toLocaleTimeString()}
              </div>
            </div>
          )}

          {/* Done state */}
          {done && (
            <div style={{
              width: '100%',
              background: 'var(--accent-bg)',
              border: '1px solid var(--accent-border)',
              borderRadius: 8,
              padding: '16px 18px',
              animation: 'fadeSlide 0.4s ease',
            }}>
              <div style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--accent)', letterSpacing: '0.14em', textTransform: 'uppercase', marginBottom: 8 }}>
                Pipeline complete
              </div>
              <div style={{ fontFamily: 'var(--sans)', fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>
                Signal confirmed — switching to Results
              </div>
            </div>
          )}

        </div>
      </div>
    </>
  )
}

// ── Tab 3 ─────────────────────────────────────────────────────────────────────

function Tab3Results({
  domain, role, org, result, confirmedMarkets, rejectedMarkets,
}: {
  domain: DomainId
  role: string; org: string
  result: PipelineFullResult | null
  confirmedMarkets: ScreenedMarket[]
  rejectedMarkets:  ScreenedMarket[]
}) {
  return (
    <>
      <div className="panel-header">
        <div>
          <div className="panel-title"><span className="bw">🗂️</span> Your Intelligence Report</div>
          <div className="panel-sub">Signal correlation analysis and action directive</div>
        </div>
      </div>

      <div style={{ padding: '28px 30px', display: 'flex', flexDirection: 'column', gap: 22 }}>

        {/* Correlation chart */}
        <section>
          <div className="section-label">Signal correlation — 60-day history</div>
          <div style={{ background: 'var(--bg3)', borderRadius: 8, padding: 18, boxShadow: 'var(--shadow-card)' }}>
            <CorrelationChart
              confirmedMarkets={confirmedMarkets}
              rejectedMarkets={rejectedMarkets}
            />
          </div>
        </section>

        {/* Directive card */}
        <section>
          <div className="section-label">Action directive</div>
          <DirectiveCard
            domain={domain}
            role={role}
            org={org}
            result={result ?? undefined}
          />
        </section>

      </div>
    </>
  )
}
