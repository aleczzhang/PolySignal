import { useEffect, useRef, useState } from 'react';
import type { AgentState } from '../types';

export type BadgeKind = 'code' | 'math' | 'k2';

export interface PillConfig {
  label: string;
  sub: string;
  badge: BadgeKind;
  maxRetries: number | null;
}

interface Props {
  config: PillConfig;
  agentState?: AgentState;
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

export function AgentPill({ config, agentState }: Props) {
  const status = agentState?.status ?? 'idle';

  const isDone    = status === 'complete';
  const isRunning = status === 'running' || status === 'streaming';
  const isRetry   = status === 'retry';

  const pillClass = isDone ? 'pill pdone' : isRunning || isRetry ? 'pill prun' : 'pill';
  const dotClass  = isDone ? 'pill-dot done' : isRunning ? 'pill-dot running' : 'pill-dot idle';

  const elapsed = useElapsed(agentState?.startedAt, agentState?.completedAt);
  const retry   = agentState?.retryCount ?? 0;

  return (
    <div className={pillClass}>
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
    </div>
  );
}
