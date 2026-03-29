import type { CSSProperties } from 'react';
import { useCountUp } from '../hooks/useCountUp';

interface Props {
  percent: number;           // 0-100
  done: boolean;
  stepName?: string;
  running: boolean;
  size?: number;             // rendered px size, default 200
}

const BASE   = 200;
const CX     = 100;
const CY     = 100;
const RADIUS = 78;
const CIRC   = 2 * Math.PI * RADIUS;
const STROKE = 10;

export function ProgressRing({ percent, done, stepName, running, size = BASE }: Props) {
  const clamp      = Math.max(0, Math.min(100, percent));
  const displayPct = useCountUp(clamp, 800);
  const offset  = CIRC * (1 - clamp / 100);
  const arcColor  = done ? '#333333' : '#111111';
  const glowColor = done
    ? 'drop-shadow(0 0 3px rgba(0,0,0,0.2))'
    : 'drop-shadow(0 0 3px rgba(0,0,0,0.35))';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 20 }}>
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${BASE} ${BASE}`}
        style={{ overflow: 'visible' }}
        role="img"
        aria-label={`${clamp}% complete`}
      >
        {/* Track */}
        <circle
          cx={CX} cy={CY}
          r={RADIUS}
          fill="none"
          stroke="rgba(0,0,0,0.1)"
          strokeWidth={STROKE}
        />

        {/* Arc */}
        <circle
          cx={CX} cy={CY}
          r={RADIUS}
          fill="none"
          stroke={arcColor}
          strokeWidth={STROKE}
          strokeLinecap="round"
          strokeDasharray={CIRC}
          strokeDashoffset={offset}
          style={{
            transform:       'rotate(-90deg)',
            transformOrigin: `${CX}px ${CY}px`,
            transition:      'stroke-dashoffset 0.5s ease, stroke 0.5s ease',
            filter:           running || done ? glowColor : 'none',
          }}
        />

        {/* Center content */}
        <text
          x={CX} y={CY - 10}
          textAnchor="middle"
          dominantBaseline="middle"
          style={{
            fontFamily: 'var(--sans)',
            fontSize:   36,
            fontWeight: 700,
            fill:       'var(--text)',
            letterSpacing: '-0.02em',
          }}
        >
          {displayPct}%
        </text>

        <text
          x={CX} y={CY + 18}
          textAnchor="middle"
          dominantBaseline="middle"
          style={{
            fontFamily:    'var(--mono)',
            fontSize:      8,
            fontWeight:    500,
            fill:          done ? '#111111' : 'var(--muted)',
            letterSpacing: '0.15em',
            textTransform: 'uppercase',
          } as CSSProperties}
        >
          {done ? 'COMPLETE' : running ? 'RUNNING' : 'READY'}
        </text>

        {stepName && (
          <text
            x={CX} y={CY + 32}
            textAnchor="middle"
            dominantBaseline="middle"
            style={{
              fontFamily: 'var(--sans)',
              fontSize:   10,
              fontWeight: 500,
              fill:       'var(--muted)',
            }}
          >
            {stepName.length > 22 ? stepName.slice(0, 22) + '…' : stepName}
          </text>
        )}
      </svg>
    </div>
  );
}

