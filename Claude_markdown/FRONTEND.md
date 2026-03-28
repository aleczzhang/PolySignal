# Signal — Frontend Spec
## Claude Code Implementation Reference

---

## What the frontend does

Displays the prediction market signal pipeline running live. The user selects a domain, hits run, and watches each pipeline step appear in sequence — market fetch, K2 Think V2 discovery, correlation validation, **mathematical reasoning**, causal reasoning, action recommendation — with real data streaming in via SSE from the backend. Built to be a compelling hackathon demo.

The mathematical reasoning step is the visual centrepiece: it displays the joint posterior probability derivation, the 80% confidence interval, and the derived decay weights that K2 Think V2 computed. This is what separates the demo from "an LLM reading some numbers" into something that looks like genuine quantitative analysis.

---

## Tech stack

- **Framework**: React 18 + Vite
- **Language**: TypeScript
- **Styling**: plain CSS with CSS variables — no Tailwind, no component library
- **State**: React `useState` / `useReducer` — no Redux, no Zustand needed
- **Backend communication**: SSE (`EventSource`) for live pipeline streaming
- **Fonts**: Space Mono (monospace labels) + Syne (headings/UI) from Google Fonts

---

## Project setup

```bash
npm create vite@latest signal-frontend -- --template react-ts
cd signal-frontend
npm install
```

No additional dependencies needed beyond Vite's defaults.

```typescript
// vite.config.ts — proxy API calls to backend during dev
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:3001',
    },
  },
})
```

---

## File structure

```
signal-frontend/
├── src/
│   ├── main.tsx               # React entry point
│   ├── App.tsx                # root component, layout
│   ├── types.ts               # shared types (mirror backend types.ts)
│   ├── hooks/
│   │   └── usePipeline.ts     # SSE connection, pipeline state management
│   ├── components/
│   │   ├── DomainSelector.tsx # domain pill buttons
│   │   ├── RunButton.tsx      # animated run/running button
│   │   ├── Pipeline.tsx       # full pipeline visualization container
│   │   ├── PipelineStep.tsx   # individual step with dot + line + card
│   │   ├── MarketList.tsx     # animated market rows with decay badges
│   │   ├── CorrChart.tsx      # correlation bar chart per market pair
│   │   ├── MathBlock.tsx      # joint posterior, CI gauge, derived decay weights
│   │   ├── CausalBlock.tsx    # K2 Think causal reasoning display
│   │   └── ActionCard.tsx     # final recommendation card with meters
│   └── styles/
│       └── globals.css        # CSS variables + base styles
├── index.html
├── vite.config.ts
├── tsconfig.json
└── package.json
```

---

## Types (`src/types.ts`)

Mirror the backend types exactly so SSE event payloads type-check correctly.

```typescript
export interface EnrichedMarket {
  id: string;
  title: string;
  probability: number;
  volume: number;
  daysToResolution: number;
  decayWeight: number;
  probHistory?: number[];
}

export interface PairCorrelation {
  ids: [string, string];
  r: number;
}

export interface ValidationResult {
  pairs: PairCorrelation[];
  avgR: number;
  passed: boolean;
}

export interface MathAnalysis {
  correlationDecayAssessment: string;
  adjustedCorrelationConfidence: number;
  jointPosteriorProbability: number;
  jointPosteriorReasoning: string;
  confidenceIntervalLow: number;
  confidenceIntervalHigh: number;
  confidenceIntervalReasoning: string;
  derivedDecayWeights: Record<string, number>;
  decayDerivationReasoning: string;
  mathSignalStrength: number;
  mathSignalReasoning: string;
}

export interface CausalAnalysis {
  causalMechanism: string;
  confoundingRisk: 'none' | 'low' | 'medium' | 'high';
  confoundingExplanation: string;
  timeDecayNote: string;
  signalConfirmed: boolean;
  confidenceScore: number;
  confidenceReasoning: string;
}

export interface ActionRecommendation {
  actor: string;
  action: string;
  geography: string;
  timeWindow: string;
  reasoning: string;
  confidenceScore: number;
  confidenceIntervalLow: number;
  confidenceIntervalHigh: number;
  avgDecayWeight: number;
  jointPosteriorProbability: number;
}

export type StepId = 'fetch' | 'discovery' | 'validation' | 'math' | 'causal' | 'action';
export type StepStatus = 'idle' | 'running' | 'complete' | 'failed' | 'retry';

export interface PipelineStep {
  id: StepId;
  status: StepStatus;
  data?: unknown;
  retryCount?: number;
}

export interface PipelineState {
  running: boolean;
  steps: Record<StepId, PipelineStep>;
  finalStatus: 'confirmed' | 'low_confidence' | 'no_signal' | null;
}
```

---

## CSS variables + base styles (`src/styles/globals.css`)

```css
@import url('https://fonts.googleapis.com/css2?family=Space+Mono:wght@400;700&family=Syne:wght@400;600;700;800&display=swap');

:root {
  --bg:      #0a0a0f;
  --bg2:     #111118;
  --bg3:     #1a1a24;
  --border:  rgba(255,255,255,0.07);
  --border-bright: rgba(255,255,255,0.15);
  --text:    #e8e8f0;
  --muted:   #6b6b80;
  --accent:  #7c6dfa;
  --accent2: #fa6d8a;
  --green:   #4dffa0;
  --amber:   #ffb84d;
  --red:     #ff5a5a;
  --mono:    'Space Mono', monospace;
  --sans:    'Syne', sans-serif;
}

* { margin: 0; padding: 0; box-sizing: border-box; }

body {
  background: var(--bg);
  color: var(--text);
  font-family: var(--sans);
  min-height: 100vh;
}

/* grid background */
body::before {
  content: '';
  position: fixed;
  inset: 0;
  background-image:
    linear-gradient(rgba(124,109,250,0.03) 1px, transparent 1px),
    linear-gradient(90deg, rgba(124,109,250,0.03) 1px, transparent 1px);
  background-size: 40px 40px;
  pointer-events: none;
  z-index: 0;
}
```

---

## SSE hook (`src/hooks/usePipeline.ts`)

Central piece — manages the EventSource connection and maps incoming events to pipeline state.

```typescript
import { useState, useCallback, useRef } from 'react';
import type { PipelineState, StepId } from '../types';

const INITIAL_STATE: PipelineState = {
  running: false,
  steps: {
    fetch:      { id: 'fetch',      status: 'idle' },
    discovery:  { id: 'discovery',  status: 'idle' },
    validation: { id: 'validation', status: 'idle' },
    causal:     { id: 'causal',     status: 'idle' },
    action:     { id: 'action',     status: 'idle' },
  },
  finalStatus: null,
};

export function usePipeline() {
  const [state, setState] = useState<PipelineState>(INITIAL_STATE);
  const esRef = useRef<EventSource | null>(null);

  const run = useCallback((domain: string, useCached = false) => {
    // Close any existing connection
    esRef.current?.close();

    setState({ ...INITIAL_STATE, running: true });

    const url = `/api/run/${domain}${useCached ? '?cached=true' : ''}`;
    const es = new EventSource(url);
    esRef.current = es;

    es.onmessage = (e) => {
      const event = JSON.parse(e.data);

      setState((prev) => {
        if (event.step === 'done' || event.step === 'error') {
          es.close();
          return {
            ...prev,
            running: false,
            finalStatus: event.data?.status ?? (event.step === 'error' ? 'no_signal' : null),
          };
        }

        const stepId = event.step as StepId;
        if (!stepId || !(stepId in prev.steps)) return prev;

        return {
          ...prev,
          steps: {
            ...prev.steps,
            [stepId]: {
              id: stepId,
              status: event.status,
              data: event.data,
              retryCount: event.retryCount,
            },
          },
        };
      });
    };

    es.onerror = () => {
      es.close();
      setState((prev) => ({ ...prev, running: false }));
    };
  }, []);

  const reset = useCallback(() => {
    esRef.current?.close();
    setState(INITIAL_STATE);
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
import { Pipeline } from './components/Pipeline';

const DOMAINS = ['food', 'energy', 'housing', 'labor'] as const;
type Domain = typeof DOMAINS[number];

export default function App() {
  const [domain, setDomain] = useState<Domain>('food');
  const { state, run, reset } = usePipeline();

  const handleRun = () => {
    if (state.running) return;
    run(domain);
  };

  const handleDomainChange = (d: Domain) => {
    if (state.running) return;
    setDomain(d);
    reset();
  };

  return (
    <div style={{ maxWidth: 920, margin: '0 auto', padding: '48px 24px 80px', position: 'relative', zIndex: 1 }}>
      <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 56 }}>
        <div style={{ fontFamily: 'var(--sans)', fontWeight: 800, fontSize: 22 }}>
          sig<span style={{ color: 'var(--accent)' }}>nal</span>
        </div>
        <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--accent)', border: '1px solid rgba(124,109,250,0.3)', padding: '4px 10px', borderRadius: 20 }}>
          K2 THINK V2 · POLYMARKET
        </div>
      </header>

      <DomainSelector
        domains={DOMAINS}
        active={domain}
        disabled={state.running}
        onChange={handleDomainChange}
      />

      <RunButton running={state.running} onClick={handleRun} />

      {(state.running || state.finalStatus) && (
        <Pipeline state={state} />
      )}
    </div>
  );
}
```

### DomainSelector (`src/components/DomainSelector.tsx`)

```tsx
interface Props {
  domains: readonly string[];
  active: string;
  disabled: boolean;
  onChange: (d: any) => void;
}

export function DomainSelector({ domains, active, disabled, onChange }: Props) {
  return (
    <div>
      <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--muted)', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 14 }}>
        Select domain
      </div>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 40 }}>
        {domains.map((d) => (
          <button
            key={d}
            onClick={() => !disabled && onChange(d)}
            style={{
              fontFamily: 'var(--mono)',
              fontSize: 12,
              padding: '8px 18px',
              borderRadius: 6,
              border: `1px solid ${d === active ? 'var(--accent)' : 'var(--border-bright)'}`,
              background: d === active ? 'rgba(124,109,250,0.12)' : 'var(--bg2)',
              color: d === active ? 'var(--accent)' : 'var(--muted)',
              cursor: disabled ? 'not-allowed' : 'pointer',
              opacity: disabled && d !== active ? 0.5 : 1,
            }}
          >
            {d === 'food' ? 'Food security' : d === 'energy' ? 'Energy grid' : d === 'housing' ? 'Housing' : 'Labor market'}
          </button>
        ))}
      </div>
    </div>
  );
}
```

### RunButton (`src/components/RunButton.tsx`)

```tsx
interface Props { running: boolean; onClick: () => void; }

export function RunButton({ running, onClick }: Props) {
  return (
    <button
      onClick={onClick}
      disabled={running}
      style={{
        display: 'flex', alignItems: 'center', gap: 10,
        fontFamily: 'var(--sans)', fontWeight: 700, fontSize: 15,
        padding: '14px 32px', borderRadius: 8, border: 'none',
        background: 'var(--accent)', color: '#fff',
        cursor: running ? 'not-allowed' : 'pointer',
        opacity: running ? 0.7 : 1,
        marginBottom: 48,
        transition: 'all 0.2s',
      }}
    >
      <span style={{
        width: 8, height: 8, borderRadius: '50%',
        background: 'rgba(255,255,255,0.6)',
        animation: running ? 'pulse 0.8s ease-in-out infinite' : 'none',
      }} />
      {running ? 'Analyzing...' : 'Run signal analysis'}
      <style>{`@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.2} }`}</style>
    </button>
  );
}
```

### Pipeline container (`src/components/Pipeline.tsx`)

Renders each step in order. Steps only appear once their SSE event arrives.

```tsx
import type { PipelineState, StepId } from '../types';
import { PipelineStep } from './PipelineStep';

const STEPS: { id: StepId; label: string; number: string }[] = [
  { id: 'fetch',      label: 'Polymarket fetch + enrichment',         number: '01' },
  { id: 'discovery',  label: 'K2 Think V2: market discovery',          number: '02' },
  { id: 'validation', label: 'Correlation validation',                  number: '03' },
  { id: 'math',       label: 'K2 Think V2: mathematical reasoning',    number: '04' },
  { id: 'causal',     label: 'K2 Think V2: causal reasoning',          number: '05' },
  { id: 'action',     label: 'K2 Think V2: action recommendation',     number: '06' },
];

export function Pipeline({ state }: { state: PipelineState }) {
  // Only show steps that have been touched (not idle)
  const visibleSteps = STEPS.filter((s) => state.steps[s.id].status !== 'idle');

  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      {visibleSteps.map((s, i) => (
        <PipelineStep
          key={s.id}
          step={state.steps[s.id]}
          label={s.label}
          number={s.number}
          isLast={i === visibleSteps.length - 1}
        />
      ))}
    </div>
  );
}
```

### PipelineStep (`src/components/PipelineStep.tsx`)

```tsx
import type { PipelineStep as StepType } from '../types';
import { MarketList } from './MarketList';
import { CorrChart } from './CorrChart';
import { CausalBlock } from './CausalBlock';
import { ActionCard } from './ActionCard';

interface Props {
  step: StepType;
  label: string;
  number: string;
  isLast: boolean;
}

export function PipelineStep({ step, label, number, isLast }: Props) {
  const dotColor = step.status === 'complete' ? 'var(--green)'
    : step.status === 'running' ? 'var(--accent)'
    : step.status === 'retry'   ? 'var(--amber)'
    : step.status === 'failed'  ? 'var(--red)'
    : 'var(--muted)';

  const labelColor = step.status === 'complete' ? 'var(--green)'
    : step.status === 'running' || step.status === 'retry' ? 'var(--accent)'
    : 'var(--muted)';

  const borderColor = step.status === 'complete' ? 'rgba(77,255,160,0.2)'
    : step.status === 'running' ? 'rgba(124,109,250,0.3)'
    : step.status === 'retry'   ? 'rgba(255,184,77,0.3)'
    : 'rgba(255,255,255,0.07)';

  return (
    <div style={{ display: 'flex', gap: 20, animation: 'fadeSlide 0.4s ease forwards' }}>
      <style>{`@keyframes fadeSlide { from { opacity:0; transform:translateY(8px) } to { opacity:1; transform:translateY(0) } }`}</style>

      {/* Left column: dot + line */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: 32, flexShrink: 0 }}>
        <div style={{
          width: 12, height: 12, borderRadius: '50%', marginTop: 4,
          background: step.status === 'idle' ? 'var(--bg)' : dotColor,
          border: `2px solid ${dotColor}`,
          boxShadow: step.status === 'running' ? `0 0 12px ${dotColor}` : 'none',
          transition: 'all 0.3s',
          flexShrink: 0,
        }} />
        {!isLast && (
          <div style={{
            width: 1, flex: 1, minHeight: 24, margin: '4px 0',
            background: step.status === 'complete' ? 'var(--green)' : 'var(--border)',
            transition: 'background 0.3s',
          }} />
        )}
      </div>

      {/* Right column: content */}
      <div style={{ flex: 1, paddingBottom: 32 }}>
        <div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: labelColor, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 10 }}>
          {number} · {label}
          {step.status === 'retry' && step.retryCount && ` — retry ${step.retryCount}/3`}
        </div>

        <div style={{
          background: 'var(--bg2)',
          border: `1px solid ${borderColor}`,
          borderRadius: 10,
          padding: '18px 20px',
          transition: 'border-color 0.3s',
        }}>
          <StepContent step={step} />
        </div>
      </div>
    </div>
  );
}

function StepContent({ step }: { step: StepType }) {
  if (step.status === 'running') {
    return <div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--muted)' }}>Reasoning...</div>;
  }

  const data = step.data as any;
  if (!data) return null;

  if (step.id === 'fetch' && data.count !== undefined) {
    return <div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--green)' }}>{data.count} markets fetched and enriched with time-decay weights.</div>;
  }

  if (step.id === 'discovery') {
    return (
      <div>
        <MarketList markets={data.cluster ?? []} />
        {data.reasoning && (
          <div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--muted)', borderLeft: '2px solid rgba(124,109,250,0.3)', paddingLeft: 14, marginTop: 12, lineHeight: 1.8 }}>
            {data.reasoning}
          </div>
        )}
      </div>
    );
  }

  if (step.id === 'validation') return <CorrChart validation={data} />;
  if (step.id === 'math')       return <MathBlock analysis={data} />;
  if (step.id === 'causal')    return <CausalBlock analysis={data} />;
  if (step.id === 'action')    return <ActionCard recommendation={data} />;

  return null;
}
```

### MarketList (`src/components/MarketList.tsx`)

```tsx
import type { EnrichedMarket } from '../types';

export function MarketList({ markets }: { markets: EnrichedMarket[] }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {markets.map((m) => (
        <div key={m.id} style={{
          display: 'grid', gridTemplateColumns: '1fr auto auto auto',
          alignItems: 'center', gap: 12,
          padding: '10px 12px', background: 'var(--bg3)',
          borderRadius: 6, border: '1px solid rgba(124,109,250,0.3)',
          animation: 'fadeSlide 0.3s ease forwards',
        }}>
          <span style={{ fontSize: 12, lineHeight: 1.4 }}>{m.title}</span>
          <DecayBadge weight={m.decayWeight} days={m.daysToResolution} />
          <span style={{ fontFamily: 'var(--mono)', fontSize: 13, fontWeight: 700, color: m.probability > 0.6 ? 'var(--accent2)' : 'var(--accent)', minWidth: 36, textAlign: 'right' }}>
            {Math.round(m.probability * 100)}%
          </span>
          <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--muted)', minWidth: 48, textAlign: 'right' }}>
            ${(m.volume / 1000).toFixed(0)}k
          </span>
        </div>
      ))}
    </div>
  );
}

function DecayBadge({ weight, days }: { weight: number; days: number }) {
  const [bg, border, color, label] =
    weight >= 0.65 ? ['rgba(77,255,160,0.1)',  'rgba(77,255,160,0.25)',  'var(--green)', `${days}d · high`]
    : weight >= 0.3 ? ['rgba(255,184,77,0.1)',  'rgba(255,184,77,0.25)',  'var(--amber)', `${days}d · med`]
    :                 ['rgba(255,90,90,0.1)',   'rgba(255,90,90,0.25)',   'var(--red)',   `${days}d · low`];

  return (
    <span style={{ fontFamily: 'var(--mono)', fontSize: 9, padding: '2px 7px', borderRadius: 10, background: bg, border: `1px solid ${border}`, color, whiteSpace: 'nowrap' }}>
      {label}
    </span>
  );
}
```

### CorrChart (`src/components/CorrChart.tsx`)

```tsx
import { useEffect, useRef } from 'react';
import type { ValidationResult } from '../types';

export function CorrChart({ validation }: { validation: ValidationResult }) {
  return (
    <div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {validation.pairs.map((pair) => (
          <CorrRow key={pair.ids.join('-')} pair={pair} />
        ))}
      </div>
      <div style={{ marginTop: 12, fontFamily: 'var(--mono)', fontSize: 11, color: validation.passed ? 'var(--green)' : 'var(--red)' }}>
        {validation.passed
          ? `All pairs pass r ≥ 0.50 threshold. Signal advancing.`
          : `Correlation threshold not met (avg r = ${validation.avgR.toFixed(2)}). Retrying discovery.`}
      </div>
    </div>
  );
}

function CorrRow({ pair }: { pair: { ids: [string, string]; r: number } }) {
  const barRef = useRef<HTMLDivElement>(null);
  const pass = pair.r >= 0.5;

  useEffect(() => {
    const el = barRef.current;
    if (!el) return;
    setTimeout(() => { el.style.width = `${pair.r * 100}%`; }, 50);
  }, [pair.r]);

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, fontFamily: 'var(--mono)', fontSize: 11 }}>
      <span style={{ color: 'var(--muted)', width: 160, flexShrink: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {pair.ids[0].slice(0, 20)}… ↔ {pair.ids[1].slice(0, 20)}…
      </span>
      <div style={{ flex: 1, height: 6, background: 'var(--bg3)', borderRadius: 3, overflow: 'hidden' }}>
        <div ref={barRef} style={{ height: '100%', borderRadius: 3, width: 0, transition: 'width 1s ease', background: pass ? 'var(--green)' : 'var(--red)' }} />
      </div>
      <span style={{ fontFamily: 'var(--mono)', fontSize: 11, fontWeight: 700, color: pass ? 'var(--green)' : 'var(--red)', width: 52, textAlign: 'right' }}>
        r={pair.r.toFixed(2)}
      </span>
    </div>
  );
}
```

### MathBlock (`src/components/MathBlock.tsx`)

The visual centrepiece of the demo. Displays three things judges will remember: the joint posterior probability with its confidence interval shown as a gauge, the correlation decay assessment, and the derived decay weights per market.

```tsx
import { useEffect, useRef } from 'react';
import type { MathAnalysis } from '../types';

export function MathBlock({ analysis: a }: { analysis: MathAnalysis }) {
  const jointPct   = Math.round(a.jointPosteriorProbability * 100);
  const ciLow      = Math.round(a.confidenceIntervalLow     * 100);
  const ciHigh     = Math.round(a.confidenceIntervalHigh    * 100);
  const adjConfPct = Math.round(a.adjustedCorrelationConfidence * 100);

  const gaugeRef = useRef<SVGCircleElement>(null);

  useEffect(() => {
    const el = gaugeRef.current;
    if (!el) return;
    const r = 36;
    const circ = 2 * Math.PI * r;
    setTimeout(() => {
      el.style.strokeDashoffset = String(circ - (circ * jointPct) / 100);
    }, 100);
  }, [jointPct]);

  const r = 36;
  const circ = 2 * Math.PI * r;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

      {/* Top row: gauge + key numbers */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>

        {/* Circular gauge for joint posterior */}
        <div style={{ flexShrink: 0, position: 'relative', width: 96, height: 96 }}>
          <svg width="96" height="96" viewBox="0 0 96 96">
            {/* Track */}
            <circle cx="48" cy="48" r={r} fill="none" stroke="var(--bg3)" strokeWidth="8"/>
            {/* Fill */}
            <circle
              ref={gaugeRef}
              cx="48" cy="48" r={r}
              fill="none"
              stroke="var(--accent)"
              strokeWidth="8"
              strokeLinecap="round"
              strokeDasharray={circ}
              strokeDashoffset={circ}
              transform="rotate(-90 48 48)"
              style={{ transition: 'stroke-dashoffset 1.4s ease' }}
            />
          </svg>
          <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
            <span style={{ fontFamily: 'var(--mono)', fontSize: 18, fontWeight: 700, color: 'var(--accent)', lineHeight: 1 }}>{jointPct}%</span>
            <span style={{ fontFamily: 'var(--mono)', fontSize: 8, color: 'var(--muted)', marginTop: 2 }}>joint P</span>
          </div>
        </div>

        {/* Key numbers */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, flex: 1 }}>
          <div>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--muted)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 4 }}>80% confidence interval</div>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 14, fontWeight: 700, color: 'var(--green)' }}>
              {ciLow}% – {ciHigh}%
            </div>
          </div>
          <div>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--muted)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 4 }}>Adjusted correlation confidence</div>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 14, fontWeight: 700, color: 'var(--amber)' }}>
              {adjConfPct}%
            </div>
          </div>
        </div>

        {/* Math signal strength */}
        <div style={{ flexShrink: 0, textAlign: 'center' }}>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--muted)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 6 }}>Math signal</div>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 28, fontWeight: 700, color: a.mathSignalStrength >= 70 ? 'var(--green)' : a.mathSignalStrength >= 50 ? 'var(--amber)' : 'var(--red)' }}>
            {a.mathSignalStrength}
          </div>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--muted)' }}>/100</div>
        </div>
      </div>

      {/* Joint posterior reasoning */}
      <div style={{ padding: '14px 16px', background: 'var(--bg3)', borderRadius: 8, borderLeft: '3px solid var(--accent)' }}>
        <div style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--accent)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 8 }}>
          Bayesian joint posterior derivation
        </div>
        <div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--muted)', lineHeight: 1.8, whiteSpace: 'pre-wrap' }}>
          {a.jointPosteriorReasoning}
        </div>
      </div>

      {/* Derived decay weights */}
      <div>
        <div style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--muted)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 10 }}>
          Derived decay weights (volatility-adjusted)
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {Object.entries(a.derivedDecayWeights).map(([id, weight]) => (
            <DecayWeightRow key={id} marketId={id} weight={weight} />
          ))}
        </div>
        <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--muted)', marginTop: 10, lineHeight: 1.6 }}>
          {a.decayDerivationReasoning}
        </div>
      </div>

      {/* Correlation decay assessment */}
      <div style={{ padding: '10px 14px', background: 'var(--bg3)', borderRadius: 6, fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--muted)', lineHeight: 1.7 }}>
        <span style={{ color: 'var(--text)' }}>Correlation decay: </span>
        {a.correlationDecayAssessment}
      </div>
    </div>
  );
}

function DecayWeightRow({ marketId, weight }: { marketId: string; weight: number }) {
  const barRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = barRef.current;
    if (!el) return;
    setTimeout(() => { el.style.width = `${weight * 100}%`; }, 80);
  }, [weight]);

  const color = weight >= 0.65 ? 'var(--green)' : weight >= 0.3 ? 'var(--amber)' : 'var(--red)';

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, fontFamily: 'var(--mono)', fontSize: 11 }}>
      <span style={{ color: 'var(--muted)', width: 120, flexShrink: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {marketId.slice(0, 16)}…
      </span>
      <div style={{ flex: 1, height: 6, background: 'var(--bg3)', borderRadius: 3, overflow: 'hidden', border: '1px solid var(--border)' }}>
        <div ref={barRef} style={{ height: '100%', borderRadius: 3, width: 0, transition: 'width 1s ease', background: color }} />
      </div>
      <span style={{ fontFamily: 'var(--mono)', fontSize: 11, fontWeight: 700, color, width: 40, textAlign: 'right' }}>
        {weight.toFixed(2)}
      </span>
    </div>
  );
}
```

### CausalBlock (`src/components/CausalBlock.tsx`)

```tsx
import type { CausalAnalysis } from '../types';

export function CausalBlock({ analysis }: { analysis: CausalAnalysis }) {
  const riskColor = analysis.confoundingRisk === 'none' ? 'var(--green)'
    : analysis.confoundingRisk === 'low'    ? 'var(--green)'
    : analysis.confoundingRisk === 'medium' ? 'var(--amber)'
    : 'var(--red)';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ padding: '14px 16px', background: 'var(--bg3)', borderRadius: 8, borderLeft: '3px solid var(--accent)' }}>
        <div style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--accent)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 8 }}>
          Causal mechanism
        </div>
        <div style={{ fontSize: 12, lineHeight: 1.7 }}>{analysis.causalMechanism}</div>
      </div>

      {analysis.confoundingRisk !== 'none' && (
        <div style={{ padding: '10px 14px', background: 'rgba(255,184,77,0.06)', border: '1px solid rgba(255,184,77,0.2)', borderRadius: 6, fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--amber)', lineHeight: 1.6 }}>
          ⚠ Confounding risk ({analysis.confoundingRisk}): {analysis.confoundingExplanation}
        </div>
      )}

      <div style={{ display: 'flex', gap: 16 }}>
        <div style={{ flex: 1, fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--muted)' }}>
          <span style={{ color: 'var(--text)', display: 'block', marginBottom: 4 }}>Confounding risk</span>
          <span style={{ color: riskColor, fontWeight: 700 }}>{analysis.confoundingRisk.toUpperCase()}</span>
        </div>
        <div style={{ flex: 1, fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--muted)' }}>
          <span style={{ color: 'var(--text)', display: 'block', marginBottom: 4 }}>Signal confirmed</span>
          <span style={{ color: analysis.signalConfirmed ? 'var(--green)' : 'var(--red)', fontWeight: 700 }}>
            {analysis.signalConfirmed ? 'YES' : 'NO'}
          </span>
        </div>
        <div style={{ flex: 1, fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--muted)' }}>
          <span style={{ color: 'var(--text)', display: 'block', marginBottom: 4 }}>Confidence</span>
          <span style={{ color: 'var(--green)', fontWeight: 700 }}>{analysis.confidenceScore}%</span>
        </div>
      </div>
    </div>
  );
}
```

### ActionCard (`src/components/ActionCard.tsx`)

```tsx
import { useEffect, useRef } from 'react';
import type { ActionRecommendation } from '../types';

export function ActionCard({ recommendation: r }: { recommendation: ActionRecommendation }) {
  const confRef = useRef<HTMLDivElement>(null);
  const decayRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setTimeout(() => {
      if (confRef.current)  confRef.current.style.width  = `${r.confidenceScore}%`;
      if (decayRef.current) decayRef.current.style.width = `${r.avgDecayWeight * 100}%`;
    }, 100);
  }, [r]);

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <span style={{ fontSize: 15, fontWeight: 700 }}>Signal confirmed</span>
        <span style={{ fontFamily: 'var(--mono)', fontSize: 10, padding: '4px 12px', borderRadius: 20, background: 'rgba(77,255,160,0.1)', border: '1px solid rgba(77,255,160,0.3)', color: 'var(--green)' }}>
          CONFIRMED SIGNAL
        </span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 20 }}>
        {[
          { label: 'Actor',        val: r.actor,      accent: true  },
          { label: 'Action',       val: r.action,     accent: false },
          { label: 'Geography',    val: r.geography,  accent: false },
          { label: 'Time window',  val: r.timeWindow, green: true   },
        ].map(({ label, val, accent, green }) => (
          <div key={label}>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--muted)', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 5 }}>{label}</div>
            <div style={{ fontSize: 13, lineHeight: 1.5, color: accent ? 'var(--accent)' : green ? 'var(--green)' : 'var(--text)', fontWeight: accent || green ? 600 : 400 }}>{val}</div>
          </div>
        ))}
      </div>

      <div style={{ fontSize: 13, color: 'var(--muted)', lineHeight: 1.75, paddingTop: 16, borderTop: '1px solid var(--border)', marginBottom: 16 }}>
        {r.reasoning}
      </div>

      <div style={{ display: 'flex', gap: 24, paddingTop: 16, borderTop: '1px solid var(--border)' }}>
        <Meter label="Causal confidence" valueRef={confRef} pct={r.confidenceScore} color="var(--green)" />
        <Meter label="Avg time-decay weight" valueRef={decayRef} pct={Math.round(r.avgDecayWeight * 100)} color="var(--amber)" />
      </div>

      {/* Joint posterior + CI — from math analysis */}
      <div style={{ marginTop: 16, padding: '14px 16px', background: 'var(--bg3)', borderRadius: 8, borderLeft: '3px solid var(--green)' }}>
        <div style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--green)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 10 }}>
          Mathematical signal summary
        </div>
        <div style={{ display: 'flex', gap: 24 }}>
          <div>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--muted)', marginBottom: 4 }}>Joint posterior</div>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 20, fontWeight: 700, color: 'var(--accent)' }}>
              {Math.round(r.jointPosteriorProbability * 100)}%
            </div>
          </div>
          <div>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--muted)', marginBottom: 4 }}>80% CI</div>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 20, fontWeight: 700, color: 'var(--green)' }}>
              {Math.round(r.confidenceIntervalLow * 100)}%–{Math.round(r.confidenceIntervalHigh * 100)}%
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Meter({ label, valueRef, pct, color }: { label: string; valueRef: React.RefObject<HTMLDivElement>; pct: number; color: string }) {
  return (
    <div style={{ flex: 1 }}>
      <div style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--muted)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 6 }}>{label}</div>
      <div style={{ height: 4, background: 'var(--bg3)', borderRadius: 2, overflow: 'hidden' }}>
        <div ref={valueRef} style={{ height: '100%', borderRadius: 2, width: 0, transition: 'width 1.2s ease', background: `linear-gradient(90deg, var(--accent), ${color})` }} />
      </div>
      <div style={{ fontFamily: 'var(--mono)', fontSize: 11, color, marginTop: 5 }}>{pct}%</div>
    </div>
  );
}
```

---

## How SSE wiring works end to end

```
User clicks Run
  → App calls run(domain)
  → usePipeline opens EventSource to GET /api/run/food
  → Backend starts pipeline, emits events as each step runs
  → onmessage updates React state per step
  → Pipeline renders only steps that have been touched
  → PipelineStep fades in with CSS animation as it appears
  → Each step's card renders appropriate component based on step.id
  → When 'done' event arrives, ES closes, running = false
```

---

## Quick start prompt for Claude Code

> "Build the Signal frontend using this spec. Start with `src/types.ts` (include MathAnalysis type), then `src/styles/globals.css`, then `src/hooks/usePipeline.ts` with the EventSource SSE hook. Then build components bottom-up: MarketList, CorrChart, MathBlock (this is the most important one — circular gauge for joint posterior, CI display, derived decay weight bars), CausalBlock, ActionCard (include joint posterior + CI block at bottom), PipelineStep (route math step to MathBlock), Pipeline (6 steps now including math at position 04), DomainSelector, RunButton, App. Wire everything in App.tsx. The backend SSE endpoint is `/api/run/:domain`. Use React 18 + Vite + TypeScript. No component libraries, no Tailwind — plain CSS with the CSS variables defined in globals.css."

---

## Report page (`src/components/ReportView.tsx`)

When the pipeline completes, the UI transitions from the pipeline view to the full intelligence report. The report is the primary deliverable — the thing a government official could actually use.

### Structure

The report has seven sections rendered in order:

1. **Header** — domain, date, signal status badges, overall confidence
2. **Executive summary** — K2 Think V2-written prose in serif font, readable by a non-technical audience. This is the only section a busy official needs to read.
3. **Signal statistics** — three-cell stat bar: joint posterior %, 80% CI range, math signal strength. Large numbers, immediately scannable.
4. **Market evidence** — table of all markets with probability, days to resolution, decay weight, correlation r, and selected/excluded status. Excluded markets shown at 40% opacity.
5. **Mathematical analysis** — three blocks: (a) joint posterior with animated CI range bar showing the interval visually, (b) volatility-adjusted vs lookup-table decay weights shown as side-by-side bar charts, (c) correlation decay assessment. Each block shows the derivation text so it's auditable.
6. **Causal reasoning** — three sub-blocks: causal mechanism (bordered left accent), confounding check (amber warning styling), reasoning prose. Plus a collapsible raw K2 Think V2 trace.
7. **Action directive** — formal directive card with actor/action/geography/window in a 2×2 grid, reasoning paragraph, and math summary row (joint posterior, CI, signal strength). Collapsible raw trace at bottom.
8. **Appendix** — four collapsible trace blocks with the complete K2 Think V2 reasoning for each pipeline step. For technical reviewers and auditors.

### Key design decisions

**Serif font for prose** — executive summary and causal reasoning prose use `Libre Baskerville`. This signals "document" rather than "dashboard" and makes the report feel like something that belongs in a policy briefing folder, not a SaaS product.

**Collapsible reasoning traces** — the raw K2 Think V2 chain-of-thought is always available but hidden by default. Non-technical readers see clean prose; technical reviewers and auditors can expand the traces to verify the reasoning. This is the transparency layer that makes the output trustworthy.

**Animated CI bar** — the confidence interval is shown as an animated range on a 0–100% track with a point marker at the joint posterior. This makes the mathematical output immediately legible without reading the derivation text.

**Print / PDF export** — a `@media print` stylesheet hides the export bar, reveals all trace blocks, and formats the report for A4/Letter paper. Judges can print it. That's a strong physical demo moment.

**`SignalReport.jsx`** — a standalone React component with all styles inlined (no external CSS dependency). Drop it directly into the Vite project. Wire it to receive the `ReportContent` + full `PipelineResult` as props and replace the synthetic data constants with the live pipeline output.

### Wiring into App.tsx

```tsx
// App.tsx additions
const [report, setReport] = useState<ReportContent | null>(null);
const [showReport, setShowReport] = useState(false);

// In usePipeline onmessage handler, add:
if (event.step === 'report' && event.status === 'complete') {
  setReport(event.data as ReportContent);
}

// After pipeline completes, show report button
{state.finalStatus === 'confirmed' && report && (
  <button onClick={() => setShowReport(true)} style={{...}}>
    View Full Report
  </button>
)}

// Full-screen report overlay
{showReport && (
  <div style={{ position:'fixed', inset:0, background:'var(--bg)', overflowY:'auto', zIndex:100 }}>
    <button onClick={() => setShowReport(false)} style={{...}}>← Back to pipeline</button>
    <SignalReport reportContent={report} pipelineResult={fullResult} />
  </div>
)}
```

### Quick start prompt for Claude Code (report component)

> "The `SignalReport.jsx` file is the complete report component with synthetic data. Wire it into the Vite frontend: replace the synthetic `REPORT` constant with props (`reportContent: ReportContent`, `pipelineResult: PipelineResult`). Add a 'View Full Report' button to `App.tsx` that appears when `finalStatus === 'confirmed'` and renders the report in a full-screen overlay. The report should be printable — verify the `@media print` styles hide navigation and reveal all trace blocks."

---

## Feature 1: Live reasoning stream

Instead of showing "Reasoning..." as a placeholder while K2 Think V2 thinks, stream the actual token-by-token output into the UI during the math and causal steps. This makes it viscerally clear that the model is genuinely reasoning, not just waiting.

### Backend change

Switch the K2 Think V2 calls for `math` and `causal` steps to streaming mode:

```typescript
// In src/k2think.ts — add streaming variant
export async function callK2ThinkStream(
  prompt: string,
  effort: ReasoningEffort,
  onToken: (token: string) => void
): Promise<string> {
  const stream = await client.chat.completions.create({
    model: 'LLM360/K2-Think-V2',
    messages: [
      { role: 'system', content: 'You are K2-Think...' },
      { role: 'user', content: prompt },
    ],
    stream: true,
    extra_body: { chat_template_kwargs: { reasoning_effort: effort } },
  } as any);

  let full = '';
  for await (const chunk of stream) {
    const token = chunk.choices[0]?.delta?.content ?? '';
    if (token) { full += token; onToken(token); }
  }
  return full;
}
```

In the orchestrator, for math and causal steps, emit partial SSE events as tokens arrive:

```typescript
// In orchestrator — math step with streaming
emit({ step: 'math', status: 'running' });
let mathRaw = '';
await callK2ThinkStream(mathPrompt, 'high', (token) => {
  mathRaw += token;
  emit({ step: 'math', status: 'streaming', data: { partial: mathRaw } });
});
const math = parseK2Json<MathAnalysis>(mathRaw);
emit({ step: 'math', status: 'complete', data: math });
```

### Frontend change — `ReasoningStream` component

```tsx
// src/components/ReasoningStream.tsx
import { useEffect, useRef } from 'react';

interface Props {
  text: string;       // accumulating token stream
  complete: boolean;  // true once the step finishes
}

export function ReasoningStream({ text, complete }: Props) {
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [text]);

  return (
    <div style={{
      fontFamily: 'var(--mono)',
      fontSize: 11,
      color: 'var(--muted)',
      lineHeight: 1.9,
      borderLeft: '2px solid rgba(124,109,250,0.3)',
      paddingLeft: 14,
      maxHeight: 220,
      overflowY: 'auto',
      whiteSpace: 'pre-wrap',
      wordBreak: 'break-word',
    }}>
      {text}
      {!complete && (
        <span style={{
          display: 'inline-block',
          width: 8, height: 14,
          background: 'var(--accent)',
          marginLeft: 2,
          verticalAlign: 'text-bottom',
          animation: 'blink 0.7s step-end infinite',
        }} />
      )}
      <div ref={endRef} />
      <style>{`@keyframes blink { 0%,100%{opacity:1} 50%{opacity:0} }`}</style>
    </div>
  );
}
```

### usePipeline hook change

Add `streaming` status and `partial` data to pipeline state:

```typescript
// In usePipeline.ts — handle streaming events
if (event.status === 'streaming') {
  setState(prev => ({
    ...prev,
    steps: {
      ...prev.steps,
      [event.step]: {
        ...prev.steps[event.step],
        status: 'streaming',
        partialText: event.data?.partial ?? '',
      },
    },
  }));
  return; // don't overwrite with complete status yet
}
```

In `PipelineStep`, render `ReasoningStream` when `step.status === 'streaming'` for the math and causal steps. Once `status === 'complete'`, replace with the full structured component (`MathBlock` or `CausalBlock`). This gives the "watching it think" experience and then snaps to the final formatted output.

---

## Feature 2: Signal divergence panel

When the validation step emits divergence alerts alongside the correlation results, render them in a dedicated panel below the correlation chart.

### `DivergencePanel` component

```tsx
// src/components/DivergencePanel.tsx
import type { DivergenceResult } from '../types';

export function DivergencePanel({ divergence }: { divergence: DivergenceResult }) {
  if (divergence.alerts.length === 0) return null;

  return (
    <div style={{ marginTop: 20 }}>
      <div style={{
        fontFamily: 'var(--mono)', fontSize: 9,
        color: divergence.hasCriticalDivergence ? 'var(--red)' : 'var(--amber)',
        letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 12,
        display: 'flex', alignItems: 'center', gap: 8,
      }}>
        <span style={{
          width: 8, height: 8, borderRadius: '50%',
          background: divergence.hasCriticalDivergence ? 'var(--red)' : 'var(--amber)',
          flexShrink: 0,
          animation: divergence.hasCriticalDivergence ? 'pulse 1s ease-in-out infinite' : 'none',
        }} />
        Divergence anomalies detected — {divergence.alerts.length} pair{divergence.alerts.length > 1 ? 's' : ''}
      </div>

      {divergence.alerts.map((alert, i) => (
        <DivergenceAlert key={i} alert={alert} />
      ))}

      <div style={{
        marginTop: 12, fontFamily: 'var(--mono)', fontSize: 10,
        color: 'var(--muted)', lineHeight: 1.7,
        padding: '10px 14px', background: 'var(--bg3)',
        borderRadius: 6, borderLeft: '2px solid var(--amber)',
      }}>
        {divergence.summaryNote}
      </div>
    </div>
  );
}

function DivergenceAlert({ alert }) {
  const severityColor = alert.severity === 'high' ? 'var(--red)'
    : alert.severity === 'medium' ? 'var(--amber)' : 'var(--muted)';

  return (
    <div style={{
      marginBottom: 12, padding: '12px 16px',
      background: 'var(--bg3)', borderRadius: 8,
      border: `1px solid ${severityColor}33`,
      borderLeft: `3px solid ${severityColor}`,
    }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 8 }}>
        <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text)', lineHeight: 1.5 }}>
          <span style={{ color: 'var(--accent2)' }}>{Math.round(alert.probA * 100)}%</span>
          {' '}↑ {alert.titleA.slice(0, 40)}…
          <br />
          <span style={{ color: 'var(--accent)' }}>{Math.round(alert.probB * 100)}%</span>
          {' '}↓ {alert.titleB.slice(0, 40)}…
        </div>
        <span style={{
          fontFamily: 'var(--mono)', fontSize: 9,
          padding: '2px 8px', borderRadius: 10,
          background: `${severityColor}18`,
          border: `1px solid ${severityColor}44`,
          color: severityColor, flexShrink: 0, marginLeft: 12,
        }}>
          {alert.severity}
        </span>
      </div>

      {alert.possibleExplanations.length > 0 && (
        <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--muted)', lineHeight: 1.7 }}>
          <span style={{ color: 'var(--text)' }}>Possible explanations: </span>
          {alert.possibleExplanations.join(' · ')}
        </div>
      )}
    </div>
  );
}
```

Add `<DivergencePanel>` inside the `CorrChart` component, below the correlation bars, receiving `divergence` from the step's data payload.

---

## Feature 3: Counterfactual interrogation panel

Appears in the report view after the pipeline completes. A text input where the user types an assumption, hits submit, and watches K2 Think V2 recompute the joint posterior and recommendation in real time.

### `CounterfactualPanel` component

```tsx
// src/components/CounterfactualPanel.tsx
import { useState } from 'react';
import type { CounterfactualResult, MathAnalysis, CausalAnalysis, EnrichedMarket } from '../types';

interface Props {
  domain: string;
  cluster: EnrichedMarket[];
  math: MathAnalysis;
  causal: CausalAnalysis;
}

const SUGGESTIONS = [
  "What if the SNAP market probability drops to 30%?",
  "What if drought conditions don't materialize this season?",
  "What if the Fed cuts rates before the CPI market resolves?",
  "What if a new USDA subsidy program is announced?",
];

export function CounterfactualPanel({ domain, cluster, math, causal }: Props) {
  const [assumption, setAssumption] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<CounterfactualResult | null>(null);

  const run = async (text: string) => {
    if (!text.trim() || loading) return;
    setLoading(true);
    setResult(null);
    try {
      const res = await fetch('/api/counterfactual', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ domain, cluster, math, causal, assumption: text }),
      });
      const data = await res.json();
      setResult(data);
    } finally {
      setLoading(false);
    }
  };

  const deltaColor = result
    ? result.posteriorDelta > 0 ? 'var(--green)'
    : result.posteriorDelta < -0.1 ? 'var(--red)' : 'var(--amber)'
    : 'var(--muted)';

  return (
    <div style={{ marginTop: 48 }}>
      {/* Header */}
      <div style={{
        fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--accent)',
        letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 16,
        display: 'flex', alignItems: 'center', gap: 10,
      }}>
        <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--accent)', display: 'inline-block' }} />
        Counterfactual stress test — K2 Think V2
      </div>

      <div style={{
        background: 'var(--bg2)', border: '1px solid var(--border-lit)',
        borderRadius: 10, padding: 20,
      }}>
        {/* Suggestion chips */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
          {SUGGESTIONS.map((s, i) => (
            <button key={i} onClick={() => { setAssumption(s); run(s); }}
              style={{
                fontFamily: 'var(--mono)', fontSize: 10,
                padding: '5px 12px', borderRadius: 20, cursor: 'pointer',
                border: '1px solid var(--border-lit)', background: 'var(--bg3)',
                color: 'var(--muted)', transition: 'all 0.2s',
              }}
              onMouseEnter={e => { (e.target as HTMLElement).style.borderColor = 'var(--accent)'; (e.target as HTMLElement).style.color = 'var(--accent)'; }}
              onMouseLeave={e => { (e.target as HTMLElement).style.borderColor = ''; (e.target as HTMLElement).style.color = ''; }}
            >
              {s}
            </button>
          ))}
        </div>

        {/* Input */}
        <div style={{ display: 'flex', gap: 10 }}>
          <input
            value={assumption}
            onChange={e => setAssumption(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && run(assumption)}
            placeholder="Type a counterfactual assumption..."
            style={{
              flex: 1, fontFamily: 'var(--mono)', fontSize: 12,
              padding: '10px 14px', borderRadius: 6,
              border: '1px solid var(--border-lit)', background: 'var(--bg3)',
              color: 'var(--text)', outline: 'none',
            }}
          />
          <button onClick={() => run(assumption)} disabled={loading || !assumption.trim()}
            style={{
              fontFamily: 'var(--mono)', fontSize: 11, padding: '10px 20px',
              borderRadius: 6, border: 'none', cursor: 'pointer',
              background: loading ? 'var(--bg3)' : 'var(--accent)',
              color: loading ? 'var(--muted)' : '#fff',
              transition: 'all 0.2s',
            }}>
            {loading ? 'Reasoning...' : 'Run'}
          </button>
        </div>

        {/* Result */}
        {result && (
          <div style={{ marginTop: 20, display: 'flex', flexDirection: 'column', gap: 16, animation: 'fadeSlide 0.4s ease' }}>
            {/* Delta summary */}
            <div style={{ display: 'flex', gap: 24, padding: '16px 0', borderTop: '1px solid var(--border)', borderBottom: '1px solid var(--border)' }}>
              <div>
                <div style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--muted)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 6 }}>Original</div>
                <div style={{ fontFamily: 'var(--mono)', fontSize: 22, fontWeight: 700, color: 'var(--muted)' }}>
                  {Math.round(result.originalJointPosterior * 100)}%
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', color: 'var(--border-lit)', fontSize: 20 }}>→</div>
              <div>
                <div style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--muted)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 6 }}>Revised</div>
                <div style={{ fontFamily: 'var(--mono)', fontSize: 22, fontWeight: 700, color: deltaColor }}>
                  {Math.round(result.revisedJointPosterior * 100)}%
                </div>
              </div>
              <div>
                <div style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--muted)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 6 }}>Delta</div>
                <div style={{ fontFamily: 'var(--mono)', fontSize: 22, fontWeight: 700, color: deltaColor }}>
                  {result.posteriorDelta > 0 ? '+' : ''}{Math.round(result.posteriorDelta * 100)}pp
                </div>
              </div>
              <div>
                <div style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--muted)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 6 }}>New CI</div>
                <div style={{ fontFamily: 'var(--mono)', fontSize: 14, fontWeight: 700, color: 'var(--green)', marginTop: 4 }}>
                  {Math.round(result.revisedConfidenceIntervalLow * 100)}%–{Math.round(result.revisedConfidenceIntervalHigh * 100)}%
                </div>
              </div>
              <div style={{ marginLeft: 'auto', textAlign: 'right' }}>
                <div style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--muted)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 6 }}>Signal</div>
                <div style={{ fontFamily: 'var(--mono)', fontSize: 12, fontWeight: 700, color: result.signalStillConfirmed ? 'var(--green)' : 'var(--red)' }}>
                  {result.signalStillConfirmed ? 'CONFIRMED' : 'INVALIDATED'}
                </div>
              </div>
            </div>

            {/* Revised recommendation */}
            <div style={{ padding: '12px 16px', background: 'var(--bg3)', borderRadius: 8, borderLeft: `3px solid ${result.signalStillConfirmed ? 'var(--green)' : 'var(--red)'}` }}>
              <div style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--muted)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 8 }}>Revised recommendation</div>
              <div style={{ fontSize: 13, lineHeight: 1.7, color: 'var(--text)' }}>{result.revisedRecommendation}</div>
            </div>

            {/* Reasoning */}
            <div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--muted)', lineHeight: 1.8, whiteSpace: 'pre-wrap' }}>
              {result.reasoning}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
```

Add `<CounterfactualPanel>` at the bottom of the report view, passing `domain`, `cluster`, `math`, and `causal` from the full pipeline result.

---

## Feature 4: Document-style report redesign

The report shifts from dark dashboard to policy document aesthetic. Cream background, serif body, classified-document feel. Makes it immediately obvious this is for a government audience, not a SaaS product.

### CSS variable overrides for report page only

```tsx
// Wrap the entire report in a div with these inline styles applied via a class
// The report uses a SEPARATE light theme — not the dark pipeline UI

const REPORT_THEME = `
  .report-root {
    --bg:     #f5f0e8;       /* warm cream */
    --bg2:    #ede8de;
    --bg3:    #e3ddd2;
    --bg4:    #f9f5ef;
    --border: rgba(0,0,0,0.08);
    --border-lit: rgba(0,0,0,0.14);
    --text:   #1a1a14;
    --muted:  #6b6650;
    --dim:    #b0aa9c;
    --accent: #4a3fbf;       /* deep indigo — readable on cream */
    --accent2:#bf3f5a;
    --green:  #1a7a4a;
    --amber:  #8a6000;
    --red:    #9a2020;
  }
`;
```

### Classified stamp treatment

Add a "SIGNAL CONFIRMED" stamp in the header — rotated 12°, red border, serif font, slightly transparent. Pure CSS, no images:

```tsx
<div style={{
  position: 'absolute',
  top: 32, right: 32,
  border: '3px solid rgba(154,32,32,0.7)',
  borderRadius: 4,
  padding: '6px 14px',
  transform: 'rotate(-12deg)',
  fontFamily: 'var(--serif)',
  fontSize: 13,
  fontWeight: 700,
  letterSpacing: '0.15em',
  color: 'rgba(154,32,32,0.7)',
  textTransform: 'uppercase',
  pointerEvents: 'none',
  userSelect: 'none',
}}>
  Signal Confirmed
</div>
```

### Typography shift

All body prose switches to `Libre Baskerville` serif at 15–17px with generous line-height. Section headers use `Syne` uppercase at 11px with letter-spacing. Monospace for all data values. This three-font system creates clear hierarchy: headings → labels → values → prose.

### Print stylesheet additions

```css
@media print {
  .report-root {
    --bg: #ffffff;
    --bg2: #f8f8f8;
    --text: #000000;
    --muted: #444444;
  }
  /* Add a thin border around the printed page */
  .page::before {
    content: '';
    position: fixed;
    inset: 12px;
    border: 1px solid #cccccc;
    pointer-events: none;
  }
  /* Show "CONFIDENTIAL — FOR OFFICIAL USE ONLY" in footer */
  .page::after {
    content: 'Signal Intelligence System · K2 Think V2 · ' attr(data-date);
    position: fixed;
    bottom: 18px;
    left: 0; right: 0;
    text-align: center;
    font-family: monospace;
    font-size: 8px;
    color: #999999;
    letter-spacing: 0.1em;
  }
}
```

Set `data-date` on the `.page` div from `new Date().toLocaleDateString()`.


---

## Feature: Correlation overlay chart (`src/components/CorrelationChart.tsx`)

The visual centrepiece of the pipeline view. Shows 30-day probability curves for every market in the selected cluster overlaid on a single chart. When the lines move together the correlation is immediately obvious — no statistical literacy required. The iteration reveal makes the retry loop visual: the rejected cluster appears first with chaotic lines, the system flags it as uncorrelated, and the confirmed cluster draws in with lines that clearly track together.

### What it shows

**Pass 1 — rejected cluster**: K2 Think V2's initial market selection drawn in real time as lines animate left to right. Lines go in different directions. `avg r = 0.11` displayed top right in red. The chart fades to 55% opacity and a red rejection banner appears.

**Pass 2 — confirmed cluster**: After the retry, the confirmed markets draw in. Lines move together, imperfectly — which looks more real than perfect alignment. `avg r = 0.76` in green. A dashed vertical line appears at day 20 labelled "Signal confirmed." A green confirmation banner appears when animation completes showing joint posterior, CI, and next step.

**Real-world event markers**: Amber dots on the x-axis at days where notable events occurred (USDA drought update, CPI release, Fed statement). Hovering shows a tooltip with the event name. This anchors the probability movements to the real world.

**Hover tooltip**: Shows date, event if applicable, and current probability for each market line at that day. Makes the chart interactive for judges to explore.

### Integration into pipeline

The chart replaces the plain `MarketList` in the discovery and validation steps. Render it when the validation step completes and the cluster is confirmed:

```tsx
// In PipelineStep StepContent — update validation case
if (step.id === 'validation' && step.data) {
  const { validation, divergence, cluster } = step.data as any;
  return (
    <>
      <CorrelationChart
        rejectedClusters={step.data.rejectedClusters ?? []}
        confirmedCluster={cluster}
        retryCount={step.retryCount ?? 0}
        validationResult={validation}
      />
      {divergence && <DivergencePanel divergence={divergence} />}
      <CorrChart validation={validation} />
    </>
  );
}
```

### Backend change needed

The orchestrator needs to pass rejected clusters through to the frontend so the chart can show them. Add to the discovery SSE events:

```typescript
// Track rejected clusters across retries
const rejectedClusters: { markets: EnrichedMarket[]; avgR: number }[] = [];

// In retry loop, after validation fails:
rejectedClusters.push({ markets: cluster, avgR: validation.avgR });

// Include in validation emit:
emit({
  step: 'validation',
  status: 'complete',
  data: { validation, divergence, cluster, rejectedClusters },
});
```

### Props interface

```typescript
interface CorrelationChartProps {
  rejectedClusters: { markets: EnrichedMarket[]; avgR: number }[];
  confirmedCluster: EnrichedMarket[];
  retryCount: number;
  validationResult: ValidationResult;
}
```

### Key design decisions

**Lines animate left to right** — not all at once. This creates the feeling of watching the data arrive in real time, even though it's historical. Duration: ~2.4s for rejected cluster, ~3s for confirmed (slightly slower so viewers can register the convergence).

**Glow effect on lines** — each line has a thick, low-opacity stroke underneath the main 2px line. Gives a subtle luminous quality that reads as "live data" on the dark background.

**Endpoint dots** — a filled circle at the current end of each line as it animates. Moves smoothly as the line draws. Makes it easy to read current probabilities without hovering.

**Imperfect correlation is intentional** — the confirmed cluster lines are generated with the same underlying signal plus independent noise. They move together but not identically. This looks real. Perfect alignment would look fake.

**The `CorrelationChart.jsx` file** in the outputs is a fully standalone demo component with synthetic data. Drop it into the Vite project, remove the synthetic data constants, and wire the real `EnrichedMarket` arrays from the pipeline.

