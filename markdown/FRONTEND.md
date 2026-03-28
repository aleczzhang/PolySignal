# Signal — Frontend Spec
## Claude Code Implementation Reference

---

## What the frontend does

Displays a **multi-agent command center** running live. The user selects a domain, hits run, and watches K2 Think V2 orchestrate a team of specialized agents in real time — dispatching them, receiving their outputs, making trust decisions, and deciding what to do next. The visual experience is a command center, not a chatbot. K2 Think V2 is visibly in charge of a system.

The demo climax is the correlation overlay chart — watching the rejected cluster's lines go in opposite directions, then the confirmed cluster's lines converge — making correlation viscerally obvious without explaining a single statistical concept.

The final output is a policy-grade intelligence report that a USDA director could hand to their deputy.

---

## Tech stack

- **Framework**: React 18 + Vite
- **Language**: TypeScript
- **Styling**: plain CSS with CSS variables — no Tailwind, no component library
- **State**: `useState` / `useReducer` — no Redux needed
- **Backend communication**: SSE (`EventSource`) for live streaming
- **Fonts**: Space Mono + Syne from Google Fonts

---

## Project setup

```bash
npm create vite@latest signal-frontend -- --template react-ts
cd signal-frontend
npm install
```

```typescript
// vite.config.ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: { '/api': 'http://localhost:3001' },
  },
})
```

---

## File structure

```
signal-frontend/
├── src/
│   ├── main.tsx
│   ├── App.tsx
│   ├── types.ts                    # mirrors backend types
│   ├── hooks/
│   │   └── usePipeline.ts          # SSE connection + state management
│   ├── components/
│   │   ├── DomainSelector.tsx
│   │   ├── RunButton.tsx
│   │   ├── AgentCommandCenter.tsx  # main pipeline visualization
│   │   ├── AgentNode.tsx           # individual agent with status + output
│   │   ├── K2OrchestratorPanel.tsx # K2 Think V2 reasoning stream
│   │   ├── CorrelationChart.tsx    # overlay chart with iteration reveal
│   │   ├── MathBlock.tsx           # joint posterior, CI gauge, decay weights
│   │   ├── CausalBlock.tsx         # causal mechanism + confounding check
│   │   ├── DirectiveCard.tsx       # final action directive
│   │   ├── AuditTrail.tsx          # K2 Think V2 meta-reasoning
│   │   ├── ReasoningStream.tsx     # live token stream display
│   │   ├── DivergencePanel.tsx     # anomaly alerts
│   │   ├── CounterfactualPanel.tsx # stress test input
│   │   └── ReportView.tsx          # full intelligence report
│   └── styles/
│       └── globals.css
├── index.html
├── vite.config.ts
└── package.json
```

---

## CSS variables (`src/styles/globals.css`)

```css
@import url('https://fonts.googleapis.com/css2?family=Space+Mono:ital,wght@0,400;0,700&family=Syne:wght@400;600;700;800&family=Libre+Baskerville:ital,wght@0,400;0,700;1,400&display=swap');

:root {
  --bg:     #0a0a0f;
  --bg2:    #111118;
  --bg3:    #1a1a24;
  --bg4:    #0f0f18;
  --border: rgba(255,255,255,0.07);
  --border-lit: rgba(255,255,255,0.14);
  --text:   #e8e8f0;
  --muted:  #6b6b80;
  --dim:    #3a3a4a;
  --accent: #7c6dfa;
  --accent2:#fa6d8a;
  --green:  #4dffa0;
  --amber:  #ffb84d;
  --red:    #ff5a5a;
  --mono:   'Space Mono', monospace;
  --serif:  'Libre Baskerville', serif;
  --sans:   'Syne', sans-serif;
}

* { margin: 0; padding: 0; box-sizing: border-box; }

body {
  background: var(--bg);
  color: var(--text);
  font-family: var(--sans);
  min-height: 100vh;
}

body::before {
  content: '';
  position: fixed; inset: 0;
  background-image:
    linear-gradient(rgba(124,109,250,0.025) 1px, transparent 1px),
    linear-gradient(90deg, rgba(124,109,250,0.025) 1px, transparent 1px);
  background-size: 48px 48px;
  pointer-events: none; z-index: 0;
}

@keyframes fadeSlide { from { opacity:0; transform:translateY(6px) } to { opacity:1; transform:translateY(0) } }
@keyframes pulse    { 0%,100%{opacity:1} 50%{opacity:0.2} }
@keyframes blink    { 0%,100%{opacity:1} 50%{opacity:0} }
@keyframes glow     { 0%,100%{box-shadow:0 0 8px rgba(77,255,160,0.3)} 50%{box-shadow:0 0 16px rgba(77,255,160,0.6)} }
```

---

## Types (`src/types.ts`)

```typescript
export interface EnrichedMarket {
  id: string; title: string; probability: number; volume: number;
  daysToResolution: number; decayWeight: number;
  historicalVolatility: number; probHistory: number[]; volumeHistory: number[];
}

export interface ScreenedMarket extends EnrichedMarket {
  vwScore: number;
  regime: 'stable' | 'transitioning' | 'stressed' | 'insufficient_data';
  transitionDay: number | null;
  stressedSince: number | null;
  passesScreening: boolean;
}

export interface LagResult {
  marketIdA: string; marketIdB: string;
  bestLag: number; bestR: number;
  lagProfile: { lag: number; r: number }[];
}

export interface LagMatrix {
  pairs: LagResult[];
  dominantLeader: string | null;
  avgBestR: number;
  propagationSummary: string;
}

export interface CausalAnalysis {
  causalMechanism: string; propagationChain: string;
  confoundingRisk: 'none' | 'low' | 'medium' | 'high';
  confoundingExplanation: string;
  rejectedMarketIds: string[]; rejectionReasons: Record<string, string>;
  timeDecayNote: string; signalConfirmed: boolean;
  confidenceScore: number; confidenceReasoning: string;
  precedentsIntegrated: string; domainKnowledgeIntegrated: string;
}

export interface MathAnalysis {
  correlationDecayAssessment: string;
  adjustedCorrelationConfidence: number;
  jointPosteriorProbability: number;
  jointPosteriorReasoning: string;
  confidenceIntervalLow: number; confidenceIntervalHigh: number;
  confidenceIntervalReasoning: string;
  derivedDecayWeights: Record<string, number>;
  decayDerivationReasoning: string;
  mathSignalStrength: number;
  effectiveActionWindowDays: number;
}

export interface ActionDirective {
  actor: string; specificRole: string; action: string;
  legalMechanism: string; geography: string;
  timeWindow: string; effectiveWindowDays: number;
  reasoning: string; confidenceScore: number;
  confidenceIntervalLow: number; confidenceIntervalHigh: number;
  jointPosteriorProbability: number; avgDecayWeight: number;
  urgency: 'immediate' | 'urgent' | 'planned';
}

export interface OrchestrationAudit {
  agentsCalledInOrder: string[];
  agentTrustDecisions: { agent: string; trusted: boolean; reasoning: string }[];
  unexpectedFindings: string[];
  gapsIdentified: string[]; gapsFilled: string[]; gapsUnfilled: string[];
  orchestrationConfidence: number; wouldChangeWith: string[];
}

export type AgentId =
  | 'MarketFetcherAgent'
  | 'StatisticalScreenerAgent'
  | 'K2ThinkV2-Orchestrator'
  | 'DomainKnowledgeAgent'
  | 'ContradictionDetectorAgent'
  | 'HistoricalPrecedentAgent'
  | 'StakeholderAgent'
  | 'K2ThinkV2-CausalReasoning'
  | 'K2ThinkV2-MathReasoning'
  | 'K2ThinkV2-ActionDirective'
  | 'K2ThinkV2-MetaReasoning'
  | 'K2ThinkV2-ReportWriter';

export type AgentStatus = 'idle' | 'running' | 'streaming' | 'complete' | 'failed'
                        | 'investigating' | 'retry' | 'ambiguous';

export interface AgentState {
  id: AgentId;
  status: AgentStatus;
  data?: unknown;
  partialText?: string;
  k2Decision?: string;
  retryCount?: number;
  message?: string;
}

export interface PipelineState {
  running: boolean;
  agents: Record<string, AgentState>;
  k2Decisions: { agent: string; decision: string; timestamp: number }[];
  rejectedClusters: { markets: ScreenedMarket[]; reason: string; avgR: number }[];
  finalStatus: 'confirmed' | 'low_confidence' | 'no_signal' | 'causally_ambiguous' | null;
  fullResult: any | null;
}

export interface ReportContent {
  title: string; executiveSummary: string;
  causalReasoningProse: string; generatedAt: string;
}

export interface CounterfactualResult {
  assumption: string;
  originalJointPosterior: number; revisedJointPosterior: number;
  posteriorDelta: number;
  revisedConfidenceIntervalLow: number; revisedConfidenceIntervalHigh: number;
  revisedMathSignalStrength: number;
  signalStillConfirmed: boolean; revisedRecommendation: string; reasoning: string;
}
```

---

## SSE hook (`src/hooks/usePipeline.ts`)

```typescript
import { useState, useCallback, useRef } from 'react';
import type { PipelineState, AgentId } from '../types';

const INITIAL: PipelineState = {
  running: false, agents: {}, k2Decisions: [],
  rejectedClusters: [], finalStatus: null, fullResult: null,
};

export function usePipeline() {
  const [state, setState] = useState<PipelineState>(INITIAL);
  const esRef = useRef<EventSource | null>(null);

  const run = useCallback((domain: string, useCached = false) => {
    esRef.current?.close();
    setState(INITIAL);
    setState(s => ({ ...s, running: true }));

    const es = new EventSource(`/api/run/${domain}${useCached ? '?cached=true' : ''}`);
    esRef.current = es;

    es.onmessage = (e) => {
      const event = JSON.parse(e.data);

      setState(prev => {
        // Terminal events
        if (event.step === 'done' || event.step === 'error') {
          es.close();
          return {
            ...prev, running: false,
            finalStatus: event.data?.status ?? (event.step === 'error' ? 'no_signal' : null),
            fullResult: event.data ?? null,
          };
        }

        // Agent status update
        const agentId = (event.agentName ?? event.step) as AgentId;
        const updatedAgents = {
          ...prev.agents,
          [agentId]: {
            id: agentId,
            status: event.status,
            data: event.status === 'streaming' ? prev.agents[agentId]?.data : event.data,
            partialText: event.status === 'streaming' ? event.data?.partial : undefined,
            k2Decision: event.k2Decision,
            retryCount: event.retryCount,
            message: event.message,
          },
        };

        // Track K2 decisions
        const k2Decisions = event.k2Decision
          ? [...prev.k2Decisions, { agent: agentId, decision: event.k2Decision, timestamp: Date.now() }]
          : prev.k2Decisions;

        // Track rejected clusters
        const rejectedClusters = event.data?.rejectedClusters
          ? event.data.rejectedClusters
          : prev.rejectedClusters;

        return { ...prev, agents: updatedAgents, k2Decisions, rejectedClusters };
      });
    };

    es.onerror = () => {
      es.close();
      setState(s => ({ ...s, running: false }));
    };
  }, []);

  const reset = useCallback(() => {
    esRef.current?.close();
    setState(INITIAL);
  }, []);

  return { state, run, reset };
}
```

---

## Components

### App (`src/App.tsx`)

```tsx
import { useState } from 'react';
import { usePipeline } from './hooks/usePipeline';
import { DomainSelector } from './components/DomainSelector';
import { RunButton } from './components/RunButton';
import { AgentCommandCenter } from './components/AgentCommandCenter';
import { ReportView } from './components/ReportView';

const DOMAINS = ['food', 'energy', 'housing', 'labor'] as const;
type Domain = typeof DOMAINS[number];

export default function App() {
  const [domain, setDomain] = useState<Domain>('food');
  const [showReport, setShowReport] = useState(false);
  const { state, run, reset } = usePipeline();

  return (
    <div style={{ maxWidth: 960, margin: '0 auto', padding: '48px 24px 80px', position: 'relative', zIndex: 1 }}>
      <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 56 }}>
        <div style={{ fontFamily: 'var(--sans)', fontWeight: 800, fontSize: 22 }}>
          sig<span style={{ color: 'var(--accent)' }}>nal</span>
        </div>
        <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--accent)', border: '1px solid rgba(124,109,250,0.3)', padding: '4px 10px', borderRadius: 20 }}>
          K2 THINK V2 · MULTI-AGENT · POLYMARKET
        </div>
      </header>

      <DomainSelector
        domains={DOMAINS} active={domain} disabled={state.running}
        onChange={(d) => { setDomain(d as Domain); reset(); setShowReport(false); }}
      />

      <RunButton running={state.running} onClick={() => run(domain)} />

      {(state.running || Object.keys(state.agents).length > 0) && (
        <AgentCommandCenter state={state} />
      )}

      {state.finalStatus === 'confirmed' && state.fullResult && !showReport && (
        <button
          onClick={() => setShowReport(true)}
          style={{
            marginTop: 32, fontFamily: 'var(--mono)', fontSize: 12,
            padding: '12px 28px', borderRadius: 8, border: '1px solid rgba(77,255,160,0.4)',
            background: 'rgba(77,255,160,0.08)', color: 'var(--green)',
            cursor: 'pointer', display: 'block',
          }}
        >
          View full intelligence report →
        </button>
      )}

      {showReport && state.fullResult && (
        <div style={{ position: 'fixed', inset: 0, background: 'var(--bg)', overflowY: 'auto', zIndex: 100 }}>
          <button
            onClick={() => setShowReport(false)}
            style={{ position: 'fixed', top: 20, left: 20, fontFamily: 'var(--mono)', fontSize: 11, padding: '8px 16px', border: '1px solid var(--border-lit)', borderRadius: 6, background: 'var(--bg2)', color: 'var(--muted)', cursor: 'pointer', zIndex: 101 }}
          >
            ← Back to pipeline
          </button>
          <ReportView result={state.fullResult} />
        </div>
      )}
    </div>
  );
}
```

### AgentCommandCenter (`src/components/AgentCommandCenter.tsx`)

The core visual. Shows K2 Think V2 at the center dispatching agents. Each agent appears as it's called.

```tsx
import type { PipelineState } from '../types';
import { AgentNode } from './AgentNode';
import { K2OrchestratorPanel } from './K2OrchestratorPanel';
import { CorrelationChart } from './CorrelationChart';

// Agent display order and metadata
const AGENT_SEQUENCE = [
  { id: 'MarketFetcherAgent',       label: 'Market fetcher',        type: 'code'  as const, step: '01' },
  { id: 'StatisticalScreenerAgent', label: 'Statistical screener',  type: 'math'  as const, step: '02' },
  { id: 'K2ThinkV2-Orchestrator',   label: 'K2 Think V2',           type: 'k2'    as const, step: '03' },
  { id: 'DomainKnowledgeAgent',     label: 'Domain knowledge',      type: 'llm'   as const, step: '04' },
  { id: 'ContradictionDetectorAgent',label:'Contradiction detector', type: 'code'  as const, step: '05' },
  { id: 'HistoricalPrecedentAgent', label: 'Historical precedents', type: 'db'    as const, step: '06' },
  { id: 'K2ThinkV2-CausalReasoning',label: 'K2 Think V2',           type: 'k2'    as const, step: '07' },
  { id: 'K2ThinkV2-MathReasoning',  label: 'K2 Think V2',           type: 'k2'    as const, step: '08' },
  { id: 'StakeholderAgent',         label: 'Stakeholder KB',        type: 'db'    as const, step: '09' },
  { id: 'K2ThinkV2-ActionDirective',label: 'K2 Think V2',           type: 'k2'    as const, step: '10' },
  { id: 'K2ThinkV2-MetaReasoning',  label: 'K2 Think V2',           type: 'k2'    as const, step: '11' },
  { id: 'K2ThinkV2-ReportWriter',   label: 'K2 Think V2',           type: 'k2'    as const, step: '12' },
];

export function AgentCommandCenter({ state }: { state: PipelineState }) {
  const activeAgents = AGENT_SEQUENCE.filter(a => state.agents[a.id]);
  const clusterData  = state.agents['K2ThinkV2-Orchestrator']?.data as any;
  const causalData   = state.agents['K2ThinkV2-CausalReasoning']?.data as any;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>

      {/* K2 decision log — top of page, shows orchestration decisions */}
      {state.k2Decisions.length > 0 && (
        <K2OrchestratorPanel decisions={state.k2Decisions} />
      )}

      {/* Agent nodes */}
      {activeAgents.map((agent, i) => (
        <AgentNode
          key={agent.id}
          agentMeta={agent}
          agentState={state.agents[agent.id]}
          isLast={i === activeAgents.length - 1}
        />
      ))}

      {/* Correlation chart — appears after cluster selection */}
      {(clusterData?.cluster || state.rejectedClusters.length > 0) && (
        <div style={{ marginTop: 32, animation: 'fadeSlide 0.5s ease' }}>
          <CorrelationChart
            rejectedClusters={state.rejectedClusters}
            confirmedCluster={clusterData?.cluster ?? []}
            lagMatrix={clusterData?.lagMatrix}
            causalAnalysis={causalData}
          />
        </div>
      )}
    </div>
  );
}
```

### AgentNode (`src/components/AgentNode.tsx`)

Individual agent row with type-colored indicator, status, and output.

```tsx
import type { AgentState } from '../types';
import { ReasoningStream } from './ReasoningStream';
import { MathBlock } from './MathBlock';
import { CausalBlock } from './CausalBlock';
import { DirectiveCard } from './DirectiveCard';
import { AuditTrail } from './AuditTrail';

const TYPE_COLORS = {
  k2:   'var(--accent)',
  math: 'var(--amber)',
  code: 'var(--muted)',
  llm:  'var(--accent2)',
  db:   'var(--green)',
};

const TYPE_LABELS = {
  k2:   'K2 Think V2',
  math: 'Math agent',
  code: 'Code agent',
  llm:  'LLM agent',
  db:   'KB agent',
};

interface Props {
  agentMeta: { id: string; label: string; type: 'k2'|'math'|'code'|'llm'|'db'; step: string };
  agentState: AgentState;
  isLast: boolean;
}

export function AgentNode({ agentMeta, agentState, isLast }: Props) {
  const color   = TYPE_COLORS[agentMeta.type];
  const isK2    = agentMeta.type === 'k2';
  const dotColor = agentState.status === 'complete' ? 'var(--green)'
    : agentState.status === 'running' || agentState.status === 'streaming' ? color
    : agentState.status === 'retry'   ? 'var(--amber)'
    : agentState.status === 'failed'  ? 'var(--red)'
    : color;

  return (
    <div style={{ display: 'flex', gap: 20, animation: 'fadeSlide 0.4s ease' }}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: 32, flexShrink: 0 }}>
        <div style={{
          width: 12, height: 12, borderRadius: '50%', marginTop: 4, flexShrink: 0,
          background: agentState.status === 'idle' ? 'var(--bg)' : dotColor,
          border: `2px solid ${dotColor}`,
          boxShadow: (agentState.status === 'running' || agentState.status === 'streaming')
            ? `0 0 10px ${dotColor}` : 'none',
          transition: 'all 0.3s',
        }} />
        {!isLast && (
          <div style={{
            width: 1, flex: 1, minHeight: 24, margin: '4px 0',
            background: agentState.status === 'complete' ? 'var(--green)' : 'var(--border)',
            transition: 'background 0.5s',
          }} />
        )}
      </div>

      <div style={{ flex: 1, paddingBottom: 28 }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
          <span style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--dim)' }}>
            {agentMeta.step}
          </span>
          <span style={{
            fontFamily: 'var(--mono)', fontSize: 9, padding: '2px 8px',
            borderRadius: 10, background: `${color}18`, border: `1px solid ${color}44`,
            color, letterSpacing: '0.06em',
          }}>
            {TYPE_LABELS[agentMeta.type]}
          </span>
          <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text)', fontWeight: 600 }}>
            {agentMeta.label}
          </span>
          {agentState.status === 'retry' && agentState.retryCount && (
            <span style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--amber)' }}>
              retry {agentState.retryCount}/3
            </span>
          )}
          {agentState.status === 'investigating' && (
            <span style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--accent)', animation: 'pulse 1s infinite' }}>
              investigating...
            </span>
          )}
        </div>

        {/* K2 decision badge */}
        {agentState.k2Decision && (
          <div style={{
            fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--accent)',
            padding: '6px 12px', marginBottom: 10,
            background: 'rgba(124,109,250,0.08)', borderRadius: 6,
            borderLeft: '2px solid var(--accent)',
          }}>
            K2 Think V2 decided: {agentState.k2Decision}
          </div>
        )}

        {/* Agent message */}
        {agentState.message && (
          <div style={{
            fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--muted)',
            padding: '6px 12px', marginBottom: 10,
            background: 'var(--bg3)', borderRadius: 6,
            fontStyle: 'italic',
          }}>
            {agentState.message}
          </div>
        )}

        {/* Content card */}
        <div style={{
          background: 'var(--bg2)',
          border: `1px solid ${agentState.status === 'complete' ? 'rgba(77,255,160,0.15)'
            : agentState.status === 'running' || agentState.status === 'streaming' ? `${color}33`
            : agentState.status === 'retry' ? 'rgba(255,184,77,0.2)'
            : 'var(--border)'}`,
          borderRadius: 10, padding: '16px 18px',
          transition: 'border-color 0.3s',
        }}>
          <AgentContent agentId={agentMeta.id} agentState={agentState} />
        </div>
      </div>
    </div>
  );
}

function AgentContent({ agentId, agentState }: { agentId: string; agentState: AgentState }) {
  const data = agentState.data as any;

  if (agentState.status === 'streaming') {
    return <ReasoningStream text={agentState.partialText ?? ''} complete={false} />;
  }
  if (agentState.status === 'running' || agentState.status === 'investigating') {
    return <div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--muted)', animation: 'pulse 1s infinite' }}>Working...</div>;
  }
  if (!data) return null;

  if (agentId === 'MarketFetcherAgent') {
    return <div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--green)' }}>
      {data.count} markets fetched and enriched.
    </div>;
  }
  if (agentId === 'StatisticalScreenerAgent') {
    return (
      <div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text)', lineHeight: 1.8 }}>
        <div>{data.passed} of {data.total} markets passed screening.</div>
        <div style={{ color: 'var(--muted)', marginTop: 4 }}>
          {data.regimeSummary?.stressed ?? 0} stressed ·{' '}
          {data.regimeSummary?.transitioning ?? 0} transitioning ·{' '}
          {data.regimeSummary?.stable ?? 0} stable
        </div>
        {data.lagMatrix?.propagationSummary && (
          <div style={{ color: 'var(--accent)', marginTop: 8, fontSize: 10 }}>
            {data.lagMatrix.propagationSummary}
          </div>
        )}
      </div>
    );
  }
  if (agentId === 'DomainKnowledgeAgent') {
    return (
      <div style={{ fontFamily: 'var(--mono)', fontSize: 11, lineHeight: 1.8 }}>
        <div style={{ color: 'var(--muted)', marginBottom: 4 }}>Q: {data.question}</div>
        <div style={{ color: 'var(--text)' }}>A: {data.answer}</div>
        <div style={{ color: data.confidence === 'high' ? 'var(--green)' : data.confidence === 'medium' ? 'var(--amber)' : 'var(--red)', marginTop: 4, fontSize: 9 }}>
          Confidence: {data.confidence}
        </div>
      </div>
    );
  }
  if (agentId === 'ContradictionDetectorAgent') {
    return (
      <div style={{ fontFamily: 'var(--mono)', fontSize: 11 }}>
        {data.hasContradiction ? (
          <div style={{ color: 'var(--amber)' }}>
            {data.contradictions.length} contradiction(s) found
            {data.contradictions.map((c: any, i: number) => (
              <div key={i} style={{ color: 'var(--muted)', marginTop: 6, fontSize: 10 }}>
                ⚠ {c.claimA.slice(0, 60)}… vs {c.claimB.slice(0, 60)}…
              </div>
            ))}
          </div>
        ) : (
          <div style={{ color: 'var(--green)' }}>No contradictions detected.</div>
        )}
      </div>
    );
  }
  if (agentId === 'HistoricalPrecedentAgent') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {(data.cases ?? []).map((c: any, i: number) => (
          <div key={i} style={{ padding: '8px 12px', background: 'var(--bg3)', borderRadius: 6, fontFamily: 'var(--mono)', fontSize: 10, lineHeight: 1.7 }}>
            <div style={{ color: 'var(--text)', marginBottom: 2 }}>{c.description}</div>
            <div style={{ color: 'var(--muted)' }}>{c.relevantLesson}</div>
            <div style={{ color: c.analogyStrength === 'strong' ? 'var(--green)' : c.analogyStrength === 'moderate' ? 'var(--amber)' : 'var(--muted)', marginTop: 2 }}>
              {c.analogyStrength} analogy
            </div>
          </div>
        ))}
      </div>
    );
  }
  if (agentId === 'StakeholderAgent') {
    return (
      <div style={{ fontFamily: 'var(--mono)', fontSize: 11, lineHeight: 1.8 }}>
        <div style={{ color: 'var(--accent)', fontWeight: 700, marginBottom: 4 }}>{data.primaryActor?.name}</div>
        <div style={{ color: 'var(--muted)', fontSize: 10 }}>{data.primaryActor?.legalMechanism}</div>
        <div style={{ color: 'var(--muted)', fontSize: 10 }}>Lead time: {data.primaryActor?.deploymentLeadTime}</div>
      </div>
    );
  }
  if (agentId === 'K2ThinkV2-CausalReasoning') return <CausalBlock analysis={data} />;
  if (agentId === 'K2ThinkV2-MathReasoning')    return <MathBlock   analysis={data} />;
  if (agentId === 'K2ThinkV2-ActionDirective')  return <DirectiveCard directive={data} />;
  if (agentId === 'K2ThinkV2-MetaReasoning')    return <AuditTrail  audit={data} />;
  if (agentId === 'K2ThinkV2-ReportWriter') {
    return <div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--green)' }}>
      Intelligence report generated. Click "View full report" below.
    </div>;
  }

  return null;
}
```

### K2OrchestratorPanel (`src/components/K2OrchestratorPanel.tsx`)

Running log of K2 Think V2's orchestration decisions — shown at the top of the pipeline.

```tsx
interface Decision { agent: string; decision: string; timestamp: number; }

export function K2OrchestratorPanel({ decisions }: { decisions: Decision[] }) {
  return (
    <div style={{
      marginBottom: 28, padding: '14px 18px',
      background: 'rgba(124,109,250,0.06)',
      border: '1px solid rgba(124,109,250,0.2)',
      borderRadius: 10,
    }}>
      <div style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--accent)', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 12 }}>
        K2 Think V2 — orchestration decisions
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {decisions.map((d, i) => (
          <div key={i} style={{ display: 'flex', gap: 12, alignItems: 'baseline', animation: 'fadeSlide 0.3s ease' }}>
            <span style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--dim)', flexShrink: 0 }}>
              {new Date(d.timestamp).toLocaleTimeString()}
            </span>
            <span style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--accent)', flexShrink: 0 }}>
              →{d.agent.replace('K2ThinkV2-','').replace('Agent','')}
            </span>
            <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text)', lineHeight: 1.5 }}>
              {d.decision}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
```

### ReasoningStream (`src/components/ReasoningStream.tsx`)

Live token stream for K2 Think V2 deep reasoning steps.

```tsx
import { useEffect, useRef } from 'react';

export function ReasoningStream({ text, complete }: { text: string; complete: boolean }) {
  const endRef = useRef<HTMLDivElement>(null);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [text]);

  return (
    <div style={{
      fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--muted)',
      lineHeight: 1.9, borderLeft: '2px solid rgba(124,109,250,0.3)',
      paddingLeft: 14, maxHeight: 240, overflowY: 'auto',
      whiteSpace: 'pre-wrap', wordBreak: 'break-word',
    }}>
      {text}
      {!complete && (
        <span style={{
          display: 'inline-block', width: 8, height: 14,
          background: 'var(--accent)', marginLeft: 2,
          verticalAlign: 'text-bottom', animation: 'blink 0.7s step-end infinite',
        }} />
      )}
      <div ref={endRef} />
    </div>
  );
}
```

### CorrelationChart (`src/components/CorrelationChart.tsx`)

The visual centrepiece. Rejected cluster lines first — chaotic, diverging. Then confirmed cluster lines — moving together. The iteration reveal makes correlation viscerally obvious.

See `CorrelationChart.jsx` in outputs for the complete standalone implementation. Wire it with these props:

```typescript
interface CorrelationChartProps {
  rejectedClusters: { markets: ScreenedMarket[]; reason: string; avgR: number }[];
  confirmedCluster: ScreenedMarket[];
  lagMatrix: LagMatrix | null;
  causalAnalysis: CausalAnalysis | null;
}
```

Key behaviors:
- Rejected clusters draw first, one by one, each fading to 55% opacity with a red rejection banner
- Confirmed cluster draws after all rejections are shown
- Lines animate left to right over ~3 seconds using `requestAnimationFrame`
- Real-world event markers (amber dots) on x-axis with hover tooltips
- Dashed vertical "Signal confirmed" line appears at day 20 on confirmed cluster
- Hover crosshair shows date, event, and probability per market

### MathBlock (`src/components/MathBlock.tsx`)

Joint posterior gauge, CI range bar, derived decay weights.

```tsx
import { useEffect, useRef } from 'react';
import type { MathAnalysis } from '../types';

export function MathBlock({ analysis: a }: { analysis: MathAnalysis }) {
  const gaugeRef = useRef<SVGCircleElement>(null);
  const ciRangeRef = useRef<HTMLDivElement>(null);
  const ciPointRef = useRef<HTMLDivElement>(null);

  const joint   = Math.round(a.jointPosteriorProbability * 100);
  const ciLow   = Math.round(a.confidenceIntervalLow    * 100);
  const ciHigh  = Math.round(a.confidenceIntervalHigh   * 100);
  const adjConf = Math.round(a.adjustedCorrelationConfidence * 100);
  const r       = 36;
  const circ    = 2 * Math.PI * r;

  useEffect(() => {
    setTimeout(() => {
      if (gaugeRef.current)
        gaugeRef.current.style.strokeDashoffset = String(circ - (circ * joint) / 100);
      if (ciRangeRef.current) {
        ciRangeRef.current.style.left  = `${ciLow}%`;
        ciRangeRef.current.style.width = `${ciHigh - ciLow}%`;
      }
      if (ciPointRef.current)
        ciPointRef.current.style.left = `calc(${joint}% - 1.5px)`;
    }, 100);
  }, [joint, ciLow, ciHigh, circ]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Top row: gauge + numbers */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
        {/* Circular gauge */}
        <div style={{ position: 'relative', width: 96, height: 96, flexShrink: 0 }}>
          <svg width="96" height="96" viewBox="0 0 96 96">
            <circle cx="48" cy="48" r={r} fill="none" stroke="var(--bg3)" strokeWidth="8"/>
            <circle ref={gaugeRef} cx="48" cy="48" r={r} fill="none"
              stroke="var(--accent)" strokeWidth="8" strokeLinecap="round"
              strokeDasharray={circ} strokeDashoffset={circ}
              transform="rotate(-90 48 48)"
              style={{ transition: 'stroke-dashoffset 1.4s ease' }}
            />
          </svg>
          <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
            <span style={{ fontFamily: 'var(--mono)', fontSize: 18, fontWeight: 700, color: 'var(--accent)', lineHeight: 1 }}>{joint}%</span>
            <span style={{ fontFamily: 'var(--mono)', fontSize: 8, color: 'var(--muted)', marginTop: 2 }}>joint P</span>
          </div>
        </div>

        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--muted)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 6 }}>80% confidence interval</div>
            <div style={{ position: 'relative', height: 8, background: 'var(--bg3)', borderRadius: 4 }}>
              <div ref={ciRangeRef} style={{ position: 'absolute', height: '100%', background: 'rgba(77,255,160,0.25)', border: '1px solid rgba(77,255,160,0.5)', borderRadius: 4, left: 0, width: 0, transition: 'all 1.2s ease' }} />
              <div ref={ciPointRef} style={{ position: 'absolute', width: 3, height: 16, top: -4, background: 'var(--accent)', borderRadius: 2, left: 0, transition: 'left 1.2s ease' }} />
            </div>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 12, fontWeight: 700, color: 'var(--green)', marginTop: 4 }}>
              {ciLow}% – {ciHigh}%
            </div>
          </div>
          <div>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--muted)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 4 }}>Adjusted correlation confidence</div>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 14, fontWeight: 700, color: 'var(--amber)' }}>{adjConf}%</div>
          </div>
        </div>

        <div style={{ textAlign: 'center', flexShrink: 0 }}>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--muted)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 6 }}>Math signal</div>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 28, fontWeight: 700, color: a.mathSignalStrength >= 70 ? 'var(--green)' : a.mathSignalStrength >= 50 ? 'var(--amber)' : 'var(--red)' }}>
            {a.mathSignalStrength}
          </div>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--muted)' }}>/100</div>
        </div>
      </div>

      {/* Posterior reasoning */}
      <div style={{ padding: '12px 16px', background: 'var(--bg3)', borderRadius: 8, borderLeft: '3px solid var(--accent)' }}>
        <div style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--accent)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 8 }}>Bayesian derivation</div>
        <div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--muted)', lineHeight: 1.9, whiteSpace: 'pre-wrap' }}>
          {a.jointPosteriorReasoning}
        </div>
      </div>

      {/* Action window */}
      <div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--amber)', padding: '8px 12px', background: 'rgba(255,184,77,0.06)', borderRadius: 6, border: '1px solid rgba(255,184,77,0.2)' }}>
        Effective action window: {a.effectiveActionWindowDays} days
      </div>
    </div>
  );
}
```

### CausalBlock (`src/components/CausalBlock.tsx`)

```tsx
import type { CausalAnalysis } from '../types';

export function CausalBlock({ analysis: a }: { analysis: CausalAnalysis }) {
  const riskColor = a.confoundingRisk === 'none' || a.confoundingRisk === 'low'
    ? 'var(--green)' : a.confoundingRisk === 'medium' ? 'var(--amber)' : 'var(--red)';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ padding: '12px 16px', background: 'var(--bg3)', borderRadius: 8, borderLeft: '3px solid var(--accent)' }}>
        <div style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--accent)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 8 }}>Causal mechanism</div>
        <div style={{ fontSize: 12, lineHeight: 1.7, color: 'var(--text)' }}>{a.causalMechanism}</div>
      </div>

      {a.propagationChain && (
        <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--accent)', lineHeight: 1.7, padding: '8px 12px', background: 'rgba(124,109,250,0.06)', borderRadius: 6 }}>
          {a.propagationChain}
        </div>
      )}

      {a.confoundingRisk !== 'none' && (
        <div style={{ padding: '10px 14px', background: 'rgba(255,184,77,0.06)', border: '1px solid rgba(255,184,77,0.2)', borderRadius: 6, fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--amber)', lineHeight: 1.6 }}>
          ⚠ Confounding ({a.confoundingRisk}): {a.confoundingExplanation}
        </div>
      )}

      <div style={{ display: 'flex', gap: 16 }}>
        {[
          { label: 'Confounding risk',  val: a.confoundingRisk.toUpperCase(), color: riskColor },
          { label: 'Signal confirmed',  val: a.signalConfirmed ? 'YES' : 'NO', color: a.signalConfirmed ? 'var(--green)' : 'var(--red)' },
          { label: 'Confidence',        val: `${a.confidenceScore}%`, color: 'var(--green)' },
        ].map(({ label, val, color }) => (
          <div key={label} style={{ flex: 1 }}>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--muted)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 5 }}>{label}</div>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 13, fontWeight: 700, color }}>{val}</div>
          </div>
        ))}
      </div>

      {a.precedentsIntegrated && (
        <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--muted)', lineHeight: 1.7 }}>
          Precedents: {a.precedentsIntegrated}
        </div>
      )}
    </div>
  );
}
```

### DirectiveCard (`src/components/DirectiveCard.tsx`)

```tsx
import { useEffect, useRef } from 'react';
import type { ActionDirective } from '../types';

export function DirectiveCard({ directive: d }: { directive: ActionDirective }) {
  const confRef  = useRef<HTMLDivElement>(null);
  const decayRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setTimeout(() => {
      if (confRef.current)  confRef.current.style.width  = `${d.confidenceScore}%`;
      if (decayRef.current) decayRef.current.style.width = `${d.avgDecayWeight * 100}%`;
    }, 100);
  }, [d]);

  const urgencyColor = d.urgency === 'immediate' ? 'var(--red)'
    : d.urgency === 'urgent' ? 'var(--amber)' : 'var(--green)';

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
        <span style={{ fontSize: 14, fontWeight: 700 }}>Action directive confirmed</span>
        <span style={{ fontFamily: 'var(--mono)', fontSize: 9, padding: '3px 10px', borderRadius: 20, background: `${urgencyColor}18`, border: `1px solid ${urgencyColor}44`, color: urgencyColor, letterSpacing: '0.08em' }}>
          {d.urgency.toUpperCase()}
        </span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 18 }}>
        {[
          { label: 'Actor',             val: d.actor,           accent: true  },
          { label: 'Legal mechanism',   val: d.legalMechanism,  accent: false },
          { label: 'Action',            val: d.action,          accent: false },
          { label: 'Geography',         val: d.geography,       accent: false },
          { label: 'Time window',       val: d.timeWindow,      green: true   },
          { label: 'Effective window',  val: `${d.effectiveWindowDays} days`, green: true },
        ].map(({ label, val, accent, green }) => (
          <div key={label}>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--muted)', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 5 }}>{label}</div>
            <div style={{ fontSize: 12, lineHeight: 1.5, fontWeight: 600, color: (accent as any) ? 'var(--accent)' : (green as any) ? 'var(--green)' : 'var(--text)' }}>{val}</div>
          </div>
        ))}
      </div>

      <div style={{ fontSize: 12, color: 'var(--muted)', lineHeight: 1.75, paddingTop: 14, borderTop: '1px solid var(--border)', marginBottom: 16 }}>
        {d.reasoning}
      </div>

      <div style={{ display: 'flex', gap: 24, paddingTop: 14, borderTop: '1px solid var(--border)', marginBottom: 14 }}>
        {[
          { label: 'Causal confidence',     ref: confRef,  pct: d.confidenceScore,          color: 'var(--green)' },
          { label: 'Avg time-decay weight', ref: decayRef, pct: Math.round(d.avgDecayWeight * 100), color: 'var(--amber)' },
        ].map(({ label, ref, pct, color }) => (
          <div key={label} style={{ flex: 1 }}>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--muted)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 6 }}>{label}</div>
            <div style={{ height: 4, background: 'var(--bg3)', borderRadius: 2, overflow: 'hidden' }}>
              <div ref={ref} style={{ height: '100%', borderRadius: 2, width: 0, transition: 'width 1.2s ease', background: `linear-gradient(90deg, var(--accent), ${color})` }} />
            </div>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 11, color, marginTop: 4 }}>{pct}%</div>
          </div>
        ))}
      </div>

      <div style={{ padding: '12px 16px', background: 'var(--bg3)', borderRadius: 8, borderLeft: '3px solid var(--green)' }}>
        <div style={{ display: 'flex', gap: 24 }}>
          <div>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--muted)', marginBottom: 4 }}>Joint posterior</div>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 20, fontWeight: 700, color: 'var(--accent)' }}>
              {Math.round(d.jointPosteriorProbability * 100)}%
            </div>
          </div>
          <div>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--muted)', marginBottom: 4 }}>80% CI</div>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 16, fontWeight: 700, color: 'var(--green)' }}>
              {Math.round(d.confidenceIntervalLow * 100)}%–{Math.round(d.confidenceIntervalHigh * 100)}%
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
```

### AuditTrail (`src/components/AuditTrail.tsx`)

Shows K2 Think V2's meta-reasoning about its own orchestration process.

```tsx
import { useState } from 'react';
import type { OrchestrationAudit } from '../types';

export function AuditTrail({ audit: a }: { audit: OrchestrationAudit }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div>
      <div style={{ display: 'flex', gap: 16, marginBottom: 16 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--muted)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 6 }}>Orchestration confidence</div>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 22, fontWeight: 700, color: a.orchestrationConfidence >= 70 ? 'var(--green)' : a.orchestrationConfidence >= 50 ? 'var(--amber)' : 'var(--red)' }}>
            {a.orchestrationConfidence}%
          </div>
        </div>
        <div style={{ flex: 2 }}>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--muted)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 6 }}>Agents called</div>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--dim)', lineHeight: 1.8 }}>
            {a.agentsCalledInOrder.join(' → ')}
          </div>
        </div>
      </div>

      {a.gapsUnfilled.length > 0 && (
        <div style={{ padding: '8px 12px', background: 'rgba(255,184,77,0.06)', border: '1px solid rgba(255,184,77,0.2)', borderRadius: 6, fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--amber)', lineHeight: 1.7, marginBottom: 12 }}>
          Gaps not filled: {a.gapsUnfilled.join('; ')}
        </div>
      )}

      {a.wouldChangeWith.length > 0 && (
        <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--muted)', lineHeight: 1.7, marginBottom: 12 }}>
          Would change with: {a.wouldChangeWith.join('; ')}
        </div>
      )}

      <button
        onClick={() => setExpanded(e => !e)}
        style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--muted)', background: 'none', border: 'none', cursor: 'pointer', letterSpacing: '0.1em', textTransform: 'uppercase' }}
      >
        {expanded ? '▲ Hide' : '▼ Show'} agent trust decisions
      </button>

      {expanded && (
        <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
          {a.agentTrustDecisions.map((d, i) => (
            <div key={i} style={{ display: 'flex', gap: 10, fontFamily: 'var(--mono)', fontSize: 10, lineHeight: 1.6 }}>
              <span style={{ color: d.trusted ? 'var(--green)' : 'var(--red)', flexShrink: 0 }}>
                {d.trusted ? '✓' : '✗'}
              </span>
              <span style={{ color: 'var(--muted)', flexShrink: 0 }}>{d.agent}</span>
              <span style={{ color: 'var(--dim)' }}>{d.reasoning}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
```

### CounterfactualPanel (`src/components/CounterfactualPanel.tsx`)

Stress-test input — appears in the report view. Full implementation as described in previous spec version. Calls `POST /api/counterfactual` with domain, cluster, math, causal, and assumption.

### ReportView (`src/components/ReportView.tsx`)

Full intelligence report in document style. Light cream theme, serif body text, classified stamp treatment. Sections: executive summary, signal statistics, market evidence table, mathematical analysis with CI bar, causal reasoning, action directive, appendix with collapsible K2 Think V2 traces, counterfactual panel.

Full implementation in `SignalReport.jsx` in outputs — wire it to receive live pipeline result as props.

---

## SSE step → agent mapping

| SSE `step` | `agentName` | Component |
|---|---|---|
| `fetch` | `MarketFetcherAgent` | Market count |
| `screen` | `StatisticalScreenerAgent` | Regime summary + lag structure |
| `cluster` | `K2ThinkV2-Orchestrator` | Selection + domain agent dispatches |
| `cluster` (investigating) | `DomainKnowledgeAgent` | Q&A display |
| `contradiction` | `ContradictionDetectorAgent` | Contradiction list |
| `precedent` | `HistoricalPrecedentAgent` | Case cards |
| `causal` (streaming) | `K2ThinkV2-CausalReasoning` | ReasoningStream |
| `causal` (complete) | `K2ThinkV2-CausalReasoning` | CausalBlock |
| `math` (streaming) | `K2ThinkV2-MathReasoning` | ReasoningStream |
| `math` (complete) | `K2ThinkV2-MathReasoning` | MathBlock |
| `action` | `StakeholderAgent` → `K2ThinkV2-ActionDirective` | DirectiveCard |
| `audit` | `K2ThinkV2-MetaReasoning` | AuditTrail |
| `report` | `K2ThinkV2-ReportWriter` | Report button |

---

## Quick start prompt for Claude Code

> "Build the Signal multi-agent frontend using this spec. Start with `src/types.ts`, then `src/styles/globals.css`, then `src/hooks/usePipeline.ts` with EventSource SSE. Build components bottom-up: ReasoningStream, MathBlock, CausalBlock, DirectiveCard, AuditTrail, DivergencePanel, AgentNode (routes to the right component based on agentId), K2OrchestratorPanel (decision log), AgentCommandCenter (shows agents in sequence + CorrelationChart), CounterfactualPanel, ReportView. Wire App.tsx with domain selector, run button, AgentCommandCenter, report button, and full-screen report overlay. Use React 18 + Vite + TypeScript. Plain CSS with CSS variables from globals.css — no Tailwind, no component libraries."
