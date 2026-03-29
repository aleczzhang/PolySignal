import { useState, useEffect, useRef } from 'react'
import { Sidebar, type TabId } from './components/Sidebar'
import { usePipeline } from './hooks/usePipeline'
import type { DomainId } from './types'
import { SignalField } from './components/SignalField'

// ── App ───────────────────────────────────────────────────────────────────────

export default function App() {
  const [tab, setTab]       = useState<TabId>(1)
  const [domain, setDomain] = useState<DomainId | null>(null)
  const [role, setRole]     = useState('')
  const [org,  setOrg]      = useState('')

  const { state, run, reset } = usePipeline()
  const [retryCount, setRetryCount] = useState(0)

  const running  = state.running
  const done     = state.finalStatus === 'confirmed'
  const finished = !state.running && state.finalStatus !== null

  // Reset retry count when domain changes or pipeline is restarted manually
  function handleDomainChange(id: DomainId) {
    setDomain(id)
    setRetryCount(0)
    reset()
  }

  // Auto-navigate to Tab 2 when pipeline starts
  useEffect(() => {
    if (running) setTab(2)
  }, [running])

  // Auto-retry on low_confidence (up to 2 times), then navigate to Tab 3
  useEffect(() => {
    if (!finished) return
    if (state.finalStatus === 'low_confidence' && retryCount < 2 && domain) {
      const t = setTimeout(() => {
        setRetryCount(c => c + 1)
        run(domain, false, role, org)
      }, 2000)
      return () => clearTimeout(t)
    }
    const t = setTimeout(() => setTab(3), 700)
    return () => clearTimeout(t)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [finished, state.finalStatus])

  return (
    <div className="app-layout" style={{ display: 'flex', flexDirection: 'column', width: '100%', minHeight: '100vh' }}>
      <Sidebar
        activeTab={tab}
        onTabChange={setTab}
        running={running}
        done={done}
        finished={finished}
      />

      <main className="app-main">
        {/* ── Tab 1: Setup ──────────────────────────────────────────────── */}
        <div className={`tab-panel${tab === 1 ? ' active' : ''}`} style={{ overflow: 'hidden' }}>
          <SignalField
            role={role}
            org={org}
            onRoleChange={setRole}
            onOrgChange={setOrg}
            onDomainChange={handleDomainChange}
            markets={domain ? mockMarkets(domain) : []}
            running={running}
            done={done}
            result={state.fullResult}
            onRun={() => domain && run(domain, false, role, org)}
          />
        </div>

        {/* ── Tab 2: Analysis ───────────────────────────────────────────── */}
        <div className={`tab-panel${tab === 2 ? ' active' : ''}`}>
          <Tab2Analysis
            state={state}
            done={done}
            finished={finished}
            retryCount={retryCount}
          />
        </div>

        {/* ── Tab 3: Results ────────────────────────────────────────────── */}
        <div className={`tab-panel${tab === 3 ? ' active' : ''}`}>
          <Tab3Results
            domain={domain ?? 'iran-oil'}
            role={role}
            org={org}
            result={state.fullResult}
            finalStatus={state.finalStatus}
            rejectedMarkets={(state.fullResult?.rejectedClusters ?? state.rejectedClusters).flatMap((c: { markets: ScreenedMarket[] }) => c.markets)}
            confirmedMarkets={state.fullResult?.cluster ?? []}
          />
        </div>
      </main>
    </div>
  )
}

// ── Inline tab components ─────────────────────────────────────────────────────
import { AgentPill, type PillConfig } from './components/AgentPill'
import { ProgressRing }     from './components/ProgressRing'
import { CorrelationChart } from './components/CorrelationChart'
import { DirectiveCard }    from './components/DirectiveCard'
import type { PipelineState, PipelineFullResult, ScreenedMarket } from './types'

// ── Tab 2 ─────────────────────────────────────────────────────────────────────

// Parallel fetch row (Polymarket + Kalshi start simultaneously)
const FETCH_PILLS: (PillConfig & { agentKey: string })[] = [
  { label: 'Polymarket fetch', sub: 'Events + price history', badge: 'code', maxRetries: null, agentKey: 'PolymarketFetchAgent' },
  { label: 'Kalshi fetch',     sub: 'Series + candlesticks',  badge: 'code', maxRetries: null, agentKey: 'KalshiFetchAgent'     },
]

// Sequential enrichment stages
const SEQUENTIAL_PILLS: (PillConfig & { agentKey: string })[] = [
  { label: 'Market selection',     sub: 'Signal-strength based filter',    badge: 'math', maxRetries: null, agentKey: 'MarketSelectorAgent'     },
  { label: 'Statistical screener', sub: 'Trend, spread + signal strength', badge: 'math', maxRetries: null, agentKey: 'StatisticalScreenerAgent' },
]

// K2 pipeline — first row runs in parallel, second row is sequential
const K2_PARALLEL_PILLS: (PillConfig & { agentKey: string })[] = [
  { label: 'Historical precedents', sub: 'Ground truth + pattern',  badge: 'k2', maxRetries: null, agentKey: 'HistoricalPrecedentAgent'   },
  { label: 'K2 — causal',           sub: 'Mechanism + confounding', badge: 'k2', maxRetries: 2,   agentKey: 'K2ThinkV2-CausalReasoning'  },
]
const K2_SEQUENTIAL_PILLS: (PillConfig & { agentKey: string })[] = [
  { label: 'K2 — directive', sub: 'Action directive',       badge: 'k2', maxRetries: null, agentKey: 'K2ThinkV2-ActionDirective' },
  { label: 'K2 — report',    sub: 'Intelligence synthesis', badge: 'k2', maxRetries: null, agentKey: 'K2ThinkV2-ReportWriter'    },
]

// All agent keys for progress calculation
const ALL_PILL_KEYS = [
  ...FETCH_PILLS,
  ...SEQUENTIAL_PILLS,
  ...K2_PARALLEL_PILLS,
  ...K2_SEQUENTIAL_PILLS,
].map(p => p.agentKey)

function Tab2Analysis({ state, done, finished, retryCount }: { state: PipelineState; done: boolean; finished: boolean; retryCount: number }) {
  const agents = state.agents
  const streamEndRef = useRef<HTMLDivElement>(null)

  // Progress: count completed agents out of total unique keys
  const uniqueKeys = [...new Set(ALL_PILL_KEYS)]
  const completedCount = uniqueKeys.filter(k => agents[k]?.status === 'complete').length
  const percent = finished ? 100 : Math.round((completedCount / uniqueKeys.length) * 95)

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
            done={finished}
            running={state.running}
            stepName={stepName || undefined}
            size={240}
          />

          {/* Pipeline flow */}
          <div className="ps-flow">
            {/* Parallel fetch row */}
            <div className="ps-parallel-label">
              <div className="ps-parallel-dot" />
              Parallel market fetch
              <div className="ps-parallel-line" />
            </div>
            <div className="ps-parallel-cards">
              {FETCH_PILLS.map(cfg => (
                <AgentPill key={cfg.agentKey} config={cfg} agentState={agents[cfg.agentKey]} />
              ))}
            </div>
            <div className="ps-connector" />

            {/* Sequential enrichment stages */}
            {SEQUENTIAL_PILLS.map((cfg) => (
              <div key={cfg.agentKey} className="ps-stage-wrap">
                <AgentPill config={cfg} agentState={agents[cfg.agentKey]} />
                <div className="ps-connector" />
              </div>
            ))}

            {/* K2 Think V2 reasoning pipeline */}
            <div className="ps-parallel-label">
              <div className="ps-parallel-dot" />
              K2 Think V2 pipeline
              <div className="ps-parallel-line" />
            </div>
            {/* Row 1: historical precedents + causal run in parallel */}
            <div className="ps-parallel-cards">
              {K2_PARALLEL_PILLS.map(cfg => (
                <AgentPill key={cfg.agentKey} config={cfg} agentState={agents[cfg.agentKey]} />
              ))}
            </div>
            <div className="ps-connector" />
            {/* Row 2: directive → report run sequentially after row 1 */}
            <div className="ps-parallel-cards">
              {K2_SEQUENTIAL_PILLS.map(cfg => (
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

          {/* Terminal state / retry state */}
          {finished && (() => {
            const isRetrying = state.finalStatus === 'low_confidence' && retryCount < 2
            return (
              <div style={{
                width: '100%',
                background: 'var(--accent-bg)',
                border: '1px solid var(--accent-border)',
                borderLeft: done ? '3px solid var(--accent)' : isRetrying ? '3px solid var(--accent)' : '3px solid #888888',
                borderRadius: 8,
                padding: '16px 18px',
                animation: 'fadeSlide 0.4s ease',
              }}>
                <div style={{ fontFamily: 'var(--mono)', fontSize: 9, color: done || isRetrying ? 'var(--accent)' : 'var(--dim)', letterSpacing: '0.14em', textTransform: 'uppercase', marginBottom: 8 }}>
                  {isRetrying ? `Retrying — attempt ${retryCount + 1} of 2` : `Pipeline complete — ${state.finalStatus?.replace(/_/g, ' ')}`}
                </div>
                <div style={{ fontFamily: 'var(--sans)', fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>
                  {done
                    ? 'Signal confirmed — switching to Results'
                    : isRetrying
                    ? 'Low confidence — expanding market search…'
                    : state.finalStatus === 'low_confidence'
                    ? 'Low confidence — signal too weak to act on'
                    : state.finalStatus === 'no_signal'
                    ? 'No actionable signal found'
                    : 'Causal ambiguity — pipeline complete'}
                </div>
                {!done && !isRetrying && (
                  <div style={{ fontFamily: 'var(--sans)', fontSize: 11, color: 'var(--dim)', marginTop: 4 }}>
                    Results tab will show what the pipeline found.
                  </div>
                )}
              </div>
            )
          })()}

        </div>
      </div>
    </>
  )
}

// ── Tab 3 ─────────────────────────────────────────────────────────────────────

const STATUS_BANNERS: Partial<Record<string, string>> = {
  low_confidence:     'Low confidence — live signal identified but below action threshold. Directive uses baseline estimates.',
  no_signal:          'No live signal found — displaying illustrative baseline directive.',
  causally_ambiguous: 'Causal chain unclear — directive uses domain baseline.',
}

function Tab3Results({
  domain, role, org, result, finalStatus, confirmedMarkets, rejectedMarkets,
}: {
  domain: DomainId
  role: string; org: string
  result: PipelineFullResult | null
  finalStatus: PipelineState['finalStatus']
  confirmedMarkets: ScreenedMarket[]
  rejectedMarkets:  ScreenedMarket[]
}) {
  const statusBanner = finalStatus && finalStatus !== 'confirmed' ? STATUS_BANNERS[finalStatus] : null

  return (
    <>
      <div className="panel-header">
        <div>
          <div className="panel-title"><span className="bw">🗂️</span> Your Intelligence Report</div>
          <div className="panel-sub">Signal correlation analysis and action directive</div>
        </div>
      </div>

      <div style={{ padding: '28px 30px', display: 'flex', flexDirection: 'column', gap: 22 }}>

        {/* Non-confirmed status banner */}
        {statusBanner && (
          <div style={{
            background: 'var(--bg3)', border: '1px solid var(--border)',
            borderLeft: '3px solid #888888', borderRadius: 8, padding: '12px 16px',
          }}>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 9, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--dim)', marginBottom: 4 }}>
              {finalStatus?.replace(/_/g, ' ')}
            </div>
            <div style={{ fontFamily: 'var(--sans)', fontSize: 12, color: 'var(--muted)', lineHeight: 1.6 }}>
              {statusBanner}
            </div>
          </div>
        )}

        {/* Correlation chart — CorrelationChart self-fallbacks when arrays are empty */}
        <section>
          <div className="section-label">Signal correlation — 60-day history</div>
          <div style={{ background: 'var(--bg3)', borderRadius: 8, padding: 18, boxShadow: 'var(--shadow-card)' }}>
            <CorrelationChart
              confirmedMarkets={confirmedMarkets}
              rejectedMarkets={rejectedMarkets}
              domain={domain}
            />
          </div>
        </section>

        {/* Directive card — DirectiveCard self-fallbacks to DIRECTIVES table when result is null */}
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
