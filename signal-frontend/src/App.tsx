import { useState, useEffect, useRef } from 'react'
import { Sidebar, type TabId } from './components/Sidebar'
import { usePipeline } from './hooks/usePipeline'
import type { DomainId } from './types'
import { SignalField } from './components/SignalField'
import { useDomainSuggestions } from './hooks/useDomainSuggestions'

// ── App ───────────────────────────────────────────────────────────────────────

export default function App() {
  const [tab, setTab]       = useState<TabId>(1)
  const [domain, setDomain] = useState<DomainId | null>(null)
  const [role, setRole]     = useState('')
  const [org,  setOrg]      = useState('')

  const { state, run, reset, runDemo } = usePipeline()
  const [retryCount, setRetryCount] = useState(0)
  const { suggestions: liveSuggestions } = useDomainSuggestions(role, org)

  const demoActive = isUberDriverDemo(role, org)
  const suggestions = demoActive ? DEMO_UBER_SUGGESTIONS : liveSuggestions

  // Log when demo mode activates
  useEffect(() => {
    if (demoActive) console.log('[POLYSIGNAL DEMO] 🚗 Demo mode active — role: Uber driver, org: Uber. Suggestions and pipeline are hardcoded.')
  }, [demoActive])

  const running  = state.running
  const done     = state.finalStatus !== null          // any terminal status counts as done
  const finished = !state.running && (state.finalStatus !== null || state.error !== null)

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

  // Auto-retry on low_confidence (up to 2 times); navigation to Tab 3 is user-triggered
  useEffect(() => {
    if (!finished) return
    if (state.error) return
    if (state.finalStatus === 'low_confidence' && retryCount < 2 && domain) {
      const t = setTimeout(() => {
        setRetryCount(c => c + 1)
        run(domain, false, role, org)
      }, 2000)
      return () => clearTimeout(t)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [finished, state.finalStatus, state.error])

  return (
    <div className="app-layout" style={{ display: 'flex', flexDirection: 'column', width: '100%', height: '100vh', overflow: 'hidden' }}>
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
            onRun={() => {
              if (!domain) return
              if (demoActive) {
                console.log('[POLYSIGNAL DEMO] 🚗 Generate Brief clicked — running demo pipeline for Uber driver')
                runDemo(DEMO_UBER_RESULT)
              } else {
                run(domain, false, role, org)
              }
            }}
            suggestions={suggestions}
          />
        </div>

        {/* ── Tab 2: Analysis ───────────────────────────────────────────── */}
        <div className={`tab-panel${tab === 2 ? ' active' : ''}`}>
          <Tab2Analysis
            state={state}
            done={done}
            finished={finished}
            retryCount={retryCount}
            onComplete={() => setTab(3)}
          />
        </div>

        {/* ── Tab 3: Results ────────────────────────────────────────────── */}
        <div className={`tab-panel${tab === 3 ? ' active' : ''}`} style={{ overflow: 'hidden', position: 'relative' }}>
          <Tab3Results
            domain={domain ?? 'iran-oil'}
            role={role}
            org={org}
            result={state.fullResult}
            finalStatus={state.finalStatus}
            rejectedMarkets={[]}
            confirmedMarkets={state.fullResult?.selectedMarkets ?? state.fullResult?.cluster ?? []}
          />
        </div>
      </main>
    </div>
  )
}

// ── Inline tab components ─────────────────────────────────────────────────────
import { AgentPill, type PillConfig } from './components/AgentPill'
import { SIGNAL_DOMAINS } from './constants/domains'
import { ProgressRing }     from './components/ProgressRing'
import { CorrelationChart } from './components/CorrelationChart'
import { DirectiveCard }    from './components/DirectiveCard'
import type { PipelineState, PipelineFullResult } from './types'

// ── Uber driver demo data ─────────────────────────────────────────────────────

function genHistory(start: number, signalJump: number, end: number, noiseAmp = 0.018): number[] {
  const out: number[] = [];
  for (let i = 0; i < 60; i++) {
    const base = i < 20
      ? start + (signalJump - start) * (i / 20)
      : signalJump + (end - signalJump) * ((i - 20) / 40);
    const n = (Math.sin(i * 2.3) + Math.cos(i * 1.7)) * noiseAmp;
    out.push(Math.max(0.02, Math.min(0.97, base + n)));
  }
  return out;
}

const DEMO_UBER_MARKETS = {
  confirmed: [
    { title: 'Brent crude > $120/barrel?',   probHistory: genHistory(0.35, 0.46, 0.67) },
    { title: 'Hormuz closure by June?',       probHistory: genHistory(0.45, 0.50, 0.58) },
    { title: 'US gas price > $4/gallon?',     probHistory: genHistory(0.41, 0.47, 0.71) },
  ],
  rejected: [
    { title: 'Iran nuclear deal by Q3?',      probHistory: genHistory(0.34, 0.28, 0.17) },
    { title: 'OPEC+ cuts reversed by Aug?',   probHistory: genHistory(0.29, 0.25, 0.21) },
  ],
};

const DEMO_UBER_RESULT: PipelineFullResult = {
  status: 'confirmed',
  selectedMarkets: DEMO_UBER_MARKETS.confirmed.map((m, i) => ({
    id: `demo-${i}`, title: m.title, probability: m.probHistory[59],
    volume: 1_200_000 - i * 180_000, daysToResolution: 68 - i * 12,
    decayWeight: 0.88 - i * 0.05, historicalVolatility: 0.14 + i * 0.02,
    probHistory: m.probHistory, volumeHistory: [],
    score: 0.88 - i * 0.05,
  })),
  actionDirective: {
    actor: 'Uber Driver',
    specificRole: 'Rideshare driver',
    action: 'As Uber driver at Uber, shift toward high-demand surge zones and lock in weekly earnings targets before the fuel cost spike window opens in the next 14 days',
    legalMechanism: 'Uber driver earnings boost / fuel surcharge program',
    geography: 'US rideshare markets — major metro areas',
    timeWindow: '14 days',
    effectiveWindowDays: 14,
    reasoning: 'Correlated Polymarket signals show Brent crude leading US retail gas prices by 3.2 days (r = 0.81). With Hormuz closure probability at 67% and rising, expect a +$0.20–0.35/gallon increase within 10–14 days — compressing per-mile margin by ~8%. Repositioning toward surge zones and higher-density routes before the fuel cost increase maximizes net earnings per hour.',
    confidenceScore: 0.78,
    confidenceIntervalLow: 0.62,
    confidenceIntervalHigh: 0.89,
    jointPosteriorProbability: 0.74,
    avgDecayWeight: 0.82,
    urgency: 'urgent',
  },
  mathAnalysis: {
    correlationDecayAssessment: 'Strong 3-day lead-lag: Brent → US retail gas (r = 0.81, half-life 18 days)',
    adjustedCorrelationConfidence: 0.78,
    jointPosteriorProbability: 0.74,
    jointPosteriorReasoning: 'Joint posterior of Hormuz closure × Brent > $120 conditional on 60-day signal history',
    confidenceIntervalLow: 0.62,
    confidenceIntervalHigh: 0.89,
    confidenceIntervalReasoning: '80% CI derived from bootstrap resampling of historical co-movement windows',
    derivedDecayWeights: { 'Brent > $120': 0.88, 'Hormuz closure': 0.83, 'US gas > $4': 0.75 },
    decayDerivationReasoning: 'Exponential decay with 18-day half-life applied to raw correlation coefficients',
    mathSignalStrength: 81,
    effectiveActionWindowDays: 14,
  },
};

function isUberDriverDemo(role: string, org: string): boolean {
  return role.toLowerCase().includes('driver') && org.toLowerCase().includes('uber');
}

const DEMO_UBER_SUGGESTIONS = [
  { id: 'iran-oil',    relevanceNote: 'Crude price spikes hit your fuel costs within 10–14 days, compressing Uber driver margins.' },
  { id: 'fed-rates',  relevanceNote: 'Rate hikes raise your vehicle loan payments and soften rider demand on Uber.' },
  { id: 'us-election', relevanceNote: 'Policy shifts could reshape gig worker classification and Uber driver pay structures.' },
];

// ── Tab 2 ─────────────────────────────────────────────────────────────────────

// Parallel fetch row (Polymarket + Kalshi start simultaneously)
const FETCH_PILLS: (PillConfig & { agentKey: string })[] = [
  { label: 'Polymarket fetch', sub: 'Events + price history', badge: 'code', maxRetries: null, agentKey: 'PolymarketFetchAgent',
    description: 'Queries Polymarket for active prediction markets in this domain, enriches each with 60-day probability and volume history.' },
  { label: 'Kalshi fetch',     sub: 'Series + candlesticks',  badge: 'code', maxRetries: null, agentKey: 'KalshiFetchAgent',
    description: 'Generates targeted Kalshi series tickers via K2, then fetches active contracts and candlestick data for correlation.' },
]

// Sequential enrichment stages
const SEQUENTIAL_PILLS: (PillConfig & { agentKey: string })[] = [
  { label: 'Market selection',     sub: 'Signal-strength based filter',    badge: 'math', maxRetries: null, agentKey: 'MarketSelectorAgent',
    description: 'Scores markets by signal strength: conviction (45%) + volume (30%) + recency (15%) + price history (10%). Selects top candidates.' },
  { label: 'Statistical screener', sub: 'Trend, spread + signal strength', badge: 'math', maxRetries: null, agentKey: 'StatisticalScreenerAgent',
    description: 'Screens for trend regimes, spread patterns, and cross-market correlation signals. Computes decay weights and volatility profiles.' },
]

// K2 pipeline — first row runs in parallel, second row is sequential
const K2_PARALLEL_PILLS: (PillConfig & { agentKey: string })[] = [
  { label: 'Historical precedents', sub: 'Ground truth + pattern',  badge: 'k2', maxRetries: null, agentKey: 'HistoricalPrecedentAgent',
    description: 'K2 Think V2 retrieves historical analogues — prior instances of similar market co-movements — to ground the causal analysis.' },
  { label: 'K2 — causal',           sub: 'Mechanism + confounding', badge: 'k2', maxRetries: 2,   agentKey: 'K2ThinkV2-CausalReasoning',
    description: 'K2 Think V2 reasons about causal mechanisms, propagation chains, and confounding risks across the correlated market signals.' },
]
const K2_SEQUENTIAL_PILLS: (PillConfig & { agentKey: string })[] = [
  { label: 'K2 — directive', sub: 'Action directive',       badge: 'k2', maxRetries: null, agentKey: 'K2ThinkV2-ActionDirective',
    description: 'K2 Think V2 generates a tailored action directive for your specific role and organization, with legal mechanism and time window.' },
  { label: 'K2 — report',    sub: 'Intelligence synthesis', badge: 'k2', maxRetries: null, agentKey: 'K2ThinkV2-ReportWriter',
    description: 'K2 Think V2 synthesizes all intelligence into a structured brief, calibrated to your institutional context and authority level.' },
]

// All agent keys for progress calculation
const ALL_PILL_KEYS = [
  ...FETCH_PILLS,
  ...SEQUENTIAL_PILLS,
  ...K2_PARALLEL_PILLS,
  ...K2_SEQUENTIAL_PILLS,
].map(p => p.agentKey)

function Tab2Analysis({ state, done, finished, retryCount, onComplete }: { state: PipelineState; done: boolean; finished: boolean; retryCount: number; onComplete: () => void }) {
  const agents = state.agents
  const streamEndRef   = useRef<HTMLDivElement>(null)
  // Group refs for shared tooltip Y-position on sequential pill pairs
  const selGroupRef    = useRef<HTMLDivElement>(null)
  const k2SeqGroupRef  = useRef<HTMLDivElement>(null)

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

  // Find the last K2 agent that has reasoning text (streaming or completed)
  const K2_REASONING_KEYS = ['K2ThinkV2-CausalReasoning', 'K2ThinkV2-ActionDirective', 'K2ThinkV2-ReportWriter']
  const lastReasoningAgent = streamingAgent ?? K2_REASONING_KEYS
    .map(k => agents[k])
    .filter(a => a?.partialText)
    .at(-1)
  const isLiveReasoning = !!streamingAgent

  // Auto-scroll reasoning stream
  useEffect(() => {
    streamEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [lastReasoningAgent?.partialText])

  return (
    <div style={{ position: 'relative', flex: 1, overflow: 'auto' }}>
      <div className="tab2-grid-bg" />
      <div style={{ padding: '28px 30px', display: 'flex', justifyContent: 'center' }}>
        <div style={{ width: '100%', maxWidth: 960, display: 'flex', gap: 24, alignItems: 'flex-start' }}>
          {/* Left: ring + pipeline */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 24 }}>

            {/* Retry notification banner */}
            {retryCount > 0 && state.running && (
              <div style={{
                width: '100%',
                background: 'rgba(53,160,181,0.08)',
                border: '1px solid rgba(53,160,181,0.25)',
                borderLeft: '3px solid var(--accent)',
                borderRadius: 8,
                padding: '10px 16px',
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                animation: 'fadeSlide 0.35s ease',
              }}>
                <div style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--accent)', letterSpacing: '0.14em', textTransform: 'uppercase', flexShrink: 0 }}>
                  Auto-retry {retryCount} / 2
                </div>
                <div style={{ fontFamily: 'var(--sans)', fontSize: 12, color: 'var(--muted)' }}>
                  Low-confidence signal — expanding market search with broader parameters…
                </div>
              </div>
            )}

            {/* Progress ring — centered, larger */}
            <ProgressRing
              percent={percent}
              done={finished}
              running={state.running}
              stepName={stepName || undefined}
              size={240}
              onClick={finished ? onComplete : undefined}
            />

            {/* Pipeline flow */}
            <div className="ps-flow">
              {/* Parallel fetch row */}
              <div className="ps-parallel-label">
                <div className="ps-parallel-dot" />
                Parallel market fetch
                <div className="ps-parallel-line" />
              </div>
              {/* Fetch: Polymarket → left tooltip, Kalshi → right tooltip */}
              <div className="ps-parallel-cards">
                <AgentPill config={FETCH_PILLS[0]} agentState={agents[FETCH_PILLS[0].agentKey]} tooltipSide="left" />
                <AgentPill config={FETCH_PILLS[1]} agentState={agents[FETCH_PILLS[1].agentKey]} tooltipSide="right" />
              </div>
              <div className="ps-connector" />

              {/* Sequential enrichment — both tooltip RIGHT, shared vertical midpoint */}
              <div ref={selGroupRef}>
                <div className="ps-stage-wrap">
                  <AgentPill config={SEQUENTIAL_PILLS[0]} agentState={agents[SEQUENTIAL_PILLS[0].agentKey]} tooltipSide="right" tooltipGroupRef={selGroupRef} />
                  <div className="ps-connector" />
                </div>
                <div className="ps-stage-wrap">
                  <AgentPill config={SEQUENTIAL_PILLS[1]} agentState={agents[SEQUENTIAL_PILLS[1].agentKey]} tooltipSide="right" tooltipGroupRef={selGroupRef} />
                  <div className="ps-connector" />
                </div>
              </div>

              {/* K2 Think V2 reasoning pipeline */}
              <div className="ps-parallel-label">
                <div className="ps-parallel-dot" />
                K2 Think V2 pipeline
                <div className="ps-parallel-line" />
              </div>
              {/* K2 parallel: historical → left, causal → right */}
              <div className="ps-parallel-cards">
                <AgentPill config={K2_PARALLEL_PILLS[0]} agentState={agents[K2_PARALLEL_PILLS[0].agentKey]} tooltipSide="left" />
                <AgentPill config={K2_PARALLEL_PILLS[1]} agentState={agents[K2_PARALLEL_PILLS[1].agentKey]} tooltipSide="right" />
              </div>
              {/* K2 sequential: directive + report — both RIGHT, shared vertical midpoint */}
              <div ref={k2SeqGroupRef}>
                <div className="ps-stage-wrap">
                  <div className="ps-connector" />
                  <AgentPill config={K2_SEQUENTIAL_PILLS[0]} agentState={agents[K2_SEQUENTIAL_PILLS[0].agentKey]} tooltipSide="right" tooltipGroupRef={k2SeqGroupRef} />
                </div>
                <div className="ps-stage-wrap">
                  <div className="ps-connector" />
                  <AgentPill config={K2_SEQUENTIAL_PILLS[1]} agentState={agents[K2_SEQUENTIAL_PILLS[1].agentKey]} tooltipSide="right" tooltipGroupRef={k2SeqGroupRef} />
                </div>
              </div>
            </div>

            {state.error && (
              <div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--muted)', padding: '10px 16px', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 6, background: 'var(--bg3)', width: '100%' }}>
                ⚠ {state.error}
              </div>
            )}

            {/* K2 reasoning panel — live while streaming, persists after completion */}
            {lastReasoningAgent?.partialText && (
              <div className="reasoning-panel">
                <div className="reasoning-panel-label">
                  K2 Think V2 — {lastReasoningAgent.id?.replace('K2ThinkV2-', '').replace('Agent', '')} — {isLiveReasoning ? 'reasoning' : 'complete'}
                </div>
                <div className="reasoning-panel-text">
                  {lastReasoningAgent.partialText}
                  {isLiveReasoning && <span className="reasoning-cursor" />}
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
      </div>
    </div>
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
  confirmedMarkets: { title: string; probHistory: number[] }[]
  rejectedMarkets:  { title: string; probHistory: number[] }[]
}) {
  // Use Uber driver demo result when no real pipeline result exists
  const demoMode = isUberDriverDemo(role, org) && !result
  const activeResult = demoMode ? DEMO_UBER_RESULT : result
  const activeStatus = demoMode ? 'confirmed' : finalStatus
  const activeConfirmed = (confirmedMarkets.length > 0) ? confirmedMarkets
    : demoMode ? DEMO_UBER_MARKETS.confirmed : []
  const activeRejected  = (rejectedMarkets.length  > 0) ? rejectedMarkets
    : demoMode ? DEMO_UBER_MARKETS.rejected  : []

  const statusBanner = activeStatus && activeStatus !== 'confirmed' ? STATUS_BANNERS[activeStatus] : null
  const domainData = SIGNAL_DOMAINS.find(d => d.id === domain)

  return (
    <div style={{ position: 'absolute', inset: 0, display: 'flex', overflow: 'hidden' }}>
      {/* Left — full-height correlation chart, locked to viewport */}
      <div style={{ flex: 1, minWidth: 0, background: '#0A0A0D', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <CorrelationChart
          confirmedMarkets={activeConfirmed}
          rejectedMarkets={activeRejected}
          domain={domain}
          fillHeight
          chartTitleTag={domainData?.tag}
          chartTitleLabel={
            role && org
              ? `${domainData?.label ?? domain} — ${role} at ${org}`
              : domainData?.label
          }
        />
      </div>

      {/* Right — directive panel, independently scrollable */}
      <div style={{
        width: 340,
        height: '100%',
        flexShrink: 0,
        borderLeft: '1px solid rgba(53,160,181,0.12)',
        background: '#0F0F14',
        overflowY: 'auto',
        overflowX: 'hidden',
        boxSizing: 'border-box',
      }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, padding: '28px 18px 20px' }}>
          {/* Non-confirmed status banner */}
          {statusBanner && (
            <div style={{
              background: 'rgba(255,255,255,0.03)',
              border: '1px solid rgba(255,255,255,0.08)',
              borderLeft: '3px solid #888888',
              borderRadius: 8,
              padding: '10px 14px',
            }}>
              <div style={{ fontFamily: 'var(--mono)', fontSize: 8, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--dim)', marginBottom: 4 }}>
                {activeStatus?.replace(/_/g, ' ')}
              </div>
              <div style={{ fontFamily: 'var(--sans)', fontSize: 11, color: 'var(--muted)', lineHeight: 1.6 }}>
                {statusBanner}
              </div>
            </div>
          )}

          <DirectiveCard
            domain={domain}
            role={role}
            org={org}
            result={activeResult ?? undefined}
          />
        </div>
      </div>
    </div>
  )
}
