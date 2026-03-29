import { useEffect, useRef, useState } from 'react';
import type { AgentState } from '../types';

export type BadgeKind = 'code' | 'math' | 'k2';

export interface PillConfig {
  label: string;
  sub: string;
  badge: BadgeKind;
  maxRetries: number | null;
  description?: string;
}

interface Props {
  config: PillConfig;
  agentState?: AgentState;
  onClick?: () => void;
  active?: boolean;
}

const BADGE_LABELS: Record<BadgeKind, string> = {
  code: 'Code Agent',
  math: 'Math Agent',
  k2:   'K2 Think V2',
};

function useElapsed(startedAt?: number, completedAt?: number): string | null {
  const [now, setNow] = useState(() => Date.now());
  const rafRef = useRef<number>(0);

  useEffect(() => {
    if (!startedAt || completedAt) {
      cancelAnimationFrame(rafRef.current);
      return;
    }
    function tick() {
      setNow(Date.now());
      rafRef.current = requestAnimationFrame(tick);
    }
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [startedAt, completedAt]);

  if (!startedAt) return null;
  const ms = (completedAt ?? now) - startedAt;
  return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`;
}

export function AgentPill({ config, agentState, onClick, active }: Props) {
  const status = agentState?.status ?? 'idle';
  const [hovered, setHovered] = useState(false);

  const isDone    = status === 'complete';
  const isRunning = status === 'running' || status === 'streaming';
  const isRetry   = status === 'retry';

  const pillClass = [
    isDone ? 'pill pdone' : isRunning || isRetry ? 'pill prun' : 'pill',
    active ? 'pill-active' : '',
  ].join(' ').trim();

  const dotClass  = isDone ? 'pill-dot done' : isRunning ? 'pill-dot running' : 'pill-dot idle';

  const elapsed = useElapsed(agentState?.startedAt, agentState?.completedAt);
  const retry   = agentState?.retryCount ?? 0;

  return (
    <div
      className={pillClass}
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{ outline: active ? '1px solid rgba(53,160,181,0.5)' : undefined }}
    >
      {/* Status dot */}
      <div className={dotClass} />

      {/* Badge */}
      <span className={`pill-badge ${config.badge}`}>
        {BADGE_LABELS[config.badge]}
      </span>

      {/* Name + sub */}
      <div className="pill-main">
        <div className="pill-name">{config.label}</div>
        <div className="pill-sub">{config.sub}</div>
      </div>

      {/* Right: elapsed + retry */}
      <div className="pill-right">
        {elapsed && (
          <span className="pill-elapsed">{elapsed}</span>
        )}
        {config.maxRetries && (
          <span className="pill-retry">
            {retry > 0 ? `retry ${retry}/${config.maxRetries}` : `max ${config.maxRetries}×`}
          </span>
        )}
      </div>

      {/* Hover tooltip */}
      {hovered && config.description && (
        <div style={{
          position: 'absolute',
          bottom: 'calc(100% + 8px)',
          left: '50%',
          transform: 'translateX(-50%)',
          background: '#1E1E26',
          border: '1px solid rgba(53,160,181,0.3)',
          borderRadius: 6,
          padding: '8px 12px',
          fontFamily: 'var(--mono)',
          fontSize: 10,
          color: 'var(--muted)',
          lineHeight: 1.55,
          zIndex: 200,
          pointerEvents: 'none',
          animation: 'fadeIn 0.15s ease',
          boxShadow: '0 4px 16px rgba(0,0,0,0.5)',
          whiteSpace: 'normal',
          maxWidth: 260,
          width: 'max-content',
        }}>
          {config.description}
        </div>
      )}
    </div>
  );
}
