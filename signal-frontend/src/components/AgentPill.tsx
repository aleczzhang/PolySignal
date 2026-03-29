import { useEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';
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
  tooltipSide?: 'left' | 'right';
  tooltipGroupRef?: RefObject<HTMLElement>;
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

export function AgentPill({ config, agentState, onClick, active, tooltipSide, tooltipGroupRef }: Props) {
  const status = agentState?.status ?? 'idle';
  const pillRef = useRef<HTMLDivElement>(null);
  const [tipPos, setTipPos] = useState<{ top: number; left: number } | null>(null);

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

  // Close tooltip on outside click
  useEffect(() => {
    if (!tipPos) return;
    function handleOutside(e: MouseEvent) {
      if (pillRef.current && !pillRef.current.contains(e.target as Node)) {
        setTipPos(null);
      }
    }
    document.addEventListener('mousedown', handleOutside, true);
    return () => document.removeEventListener('mousedown', handleOutside, true);
  }, [tipPos]);

  function handleClick() {
    onClick?.();
    if (!config.description) return;
    if (tipPos) { setTipPos(null); return; }
    const rect = pillRef.current?.getBoundingClientRect();
    if (!rect) return;

    const TOOLTIP_W = 270;

    // Horizontal: explicit side, or auto (default left, flip right if off-screen)
    let finalLeft: number;
    if (tooltipSide === 'right') {
      finalLeft = rect.right + 12;
    } else if (tooltipSide === 'left') {
      finalLeft = rect.left - TOOLTIP_W - 12;
    } else {
      const leftOfPill = rect.left - TOOLTIP_W - 12;
      finalLeft = leftOfPill < 8 ? rect.right + 12 : leftOfPill;
    }

    // Vertical: midpoint of group container if provided, else pill's own top
    let finalTop: number;
    if (tooltipGroupRef?.current) {
      const groupRect = tooltipGroupRef.current.getBoundingClientRect();
      finalTop = (groupRect.top + groupRect.bottom) / 2 - 20; // slight upward bias
    } else {
      finalTop = rect.top;
    }

    setTipPos({ top: finalTop, left: finalLeft });
  }

  return (
    <>
      <div
        ref={pillRef}
        className={pillClass}
        onClick={handleClick}
        style={{ outline: active ? '1px solid rgba(53,160,181,0.5)' : undefined, cursor: config.description ? 'pointer' : undefined }}
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
          {retry > 0 && config.maxRetries && (
            <span className="pill-retry">retry {retry}/{config.maxRetries}</span>
          )}
        </div>
      </div>

      {/* Tooltip — position: fixed bypasses any overflow:hidden on ancestors */}
      {tipPos && config.description && (
        <div
          style={{
            position: 'fixed',
            top: tipPos.top,
            left: tipPos.left,
            background: '#1E1E26',
            border: '1px solid rgba(53,160,181,0.3)',
            borderRadius: 6,
            padding: '8px 12px',
            fontFamily: 'var(--mono)',
            fontSize: 10,
            color: 'var(--muted)',
            lineHeight: 1.55,
            zIndex: 9999,
            pointerEvents: 'none',
            animation: 'fadeIn 0.15s ease',
            boxShadow: '0 4px 16px rgba(0,0,0,0.5)',
            whiteSpace: 'normal',
            maxWidth: 260,
            width: 'max-content',
          }}
        >
          {config.description}
        </div>
      )}
    </>
  );
}
