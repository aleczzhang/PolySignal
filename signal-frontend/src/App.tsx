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
        <div className={`tab-panel${tab === 1 ? ' active' : ''}`} style={{ overflow: 'hidden' }}>
          <SignalField
            role={role}
            org={org}
            onRoleChange={setRole}
            onOrgChange={setOrg}
            onDomainChange={handleDomainChange}
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

// ── Inline tab components ─────────────────────────────────────────────────────
import { AgentPill, type PillConfig } from './components/AgentPill'
import { ProgressRing }     from './components/ProgressRing'
import { CorrelationChart } from './components/CorrelationChart'
import { DirectiveCard }    from './components/DirectiveCard'
import type { PipelineState, PipelineFullResult, ScreenedMarket } from './types'

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
