import { useState, type CSSProperties } from 'react';
import type { SignalDomain } from '../constants/domains';

interface Props {
  domain:         SignalDomain | null;
  role:           string;
  org:            string;
  onCardHover:    (i: number | null) => void;
  onRun:          () => void;
  relevanceNote?: string;
}

const MONO: CSSProperties = { fontFamily: '"Source Code Pro", monospace' };
const SANS: CSSProperties = { fontFamily: '"Figtree", sans-serif' };

export function RightPanel({ domain, role, org, onCardHover, onRun, relevanceNote }: Props) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  function enterCard(i: number) {
    setHoveredIndex(i);
    onCardHover(i);
  }
  function leaveCard() {
    setHoveredIndex(null);
    onCardHover(null);
  }

  if (!domain) return null;

  return (
    <div style={{
      width: '100%',
      height: '100%',
      background: '#0F0F14',
      borderLeft: '1px solid rgba(53,160,181,0.12)',
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden',
    }}>
      {/* Header */}
      <div style={{ padding: '28px 24px 18px', borderBottom: '1px solid rgba(255,255,255,0.06)', flexShrink: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <div style={{ ...MONO, fontSize: 9, color: '#35A0B5', letterSpacing: '0.15em' }}>
            {domain.tag}
          </div>
          {(role || org) && (
            <div style={{ ...MONO, fontSize: 10, fontWeight: 700, color: '#35A0B5', letterSpacing: '0.08em', textAlign: 'right' }}>
              {[role, org].filter(Boolean).join(' · ')}
            </div>
          )}
        </div>
        <div style={{ ...SANS, fontWeight: 700, fontSize: 23, color: '#E8EAF6', lineHeight: 1.2, marginBottom: 10 }}>
          {domain.label}
        </div>
        <div style={{ ...SANS, fontSize: 12, color: '#7A80A0', lineHeight: 1.6 }}>
          {domain.desc}
        </div>
        {relevanceNote && (
          <div style={{ ...SANS, fontSize: 11, color: 'rgba(53,160,181,0.75)', lineHeight: 1.55, marginTop: 8, fontStyle: 'italic' }}>
            {relevanceNote}
          </div>
        )}
      </div>

      {/* Signal cards — fill remaining space equally */}
      <div style={{ flex: 1, padding: '14px 14px 10px', display: 'flex', flexDirection: 'column', gap: 10, minHeight: 0 }}>
        {domain.signals.map((sig, i) => {
          const isHovered = hoveredIndex === i;
          return (
            <div
              key={i}
              onMouseEnter={() => enterCard(i)}
              onMouseLeave={leaveCard}
              style={{
                flex: 1,
                background: isHovered ? 'rgba(53,160,181,0.08)' : 'rgba(255,255,255,0.04)',
                border: `1px solid ${isHovered ? 'rgba(53,160,181,0.4)' : 'rgba(53,160,181,0.14)'}`,
                borderRadius: 10,
                overflow: 'hidden',
                cursor: 'default',
                transition: 'background 0.14s ease, border-color 0.14s ease',
                display: 'flex',
                flexDirection: 'column',
              }}
            >
              {/* Probability fill bar */}
              <div style={{ height: 3, background: 'rgba(53,160,181,0.12)', flexShrink: 0 }}>
                <div style={{
                  width: `${sig.pct}%`,
                  height: '100%',
                  background: isHovered ? '#246B78' : '#35A0B5',
                  transition: 'width 0.5s ease, background 0.14s ease',
                }} />
              </div>
              <div style={{ flex: 1, padding: '14px 18px 16px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                <div style={{ ...SANS, fontSize: 13, color: isHovered ? '#E8EAF6' : '#A8AECB', lineHeight: 1.5 }}>
                  {sig.q}
                </div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 10 }}>
                  <span style={{ ...MONO, fontSize: 28, fontWeight: 500, color: '#E8EAF6', lineHeight: 1 }}>
                    {sig.pct}%
                  </span>
                  <span style={{ ...MONO, fontSize: 11, color: sig.delta.startsWith('+') ? '#4CAF7A' : '#CF6E5A' }}>
                    {sig.delta}
                  </span>
                  <span style={{ ...MONO, fontSize: 10, color: 'rgba(53,160,181,0.45)', marginLeft: 'auto' }}>
                    {sig.src}
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Generate brief button */}
      <div style={{ padding: '0 14px 16px', flexShrink: 0 }}>
        <button
          onClick={onRun}
          style={{
            width: '100%',
            padding: '13px 0',
            ...MONO,
            fontSize: 12,
            fontWeight: 600,
            letterSpacing: '0.08em',
            background: '#35A0B5',
            color: '#ffffff',
            border: 'none',
            borderRadius: 8,
            cursor: 'pointer',
            transition: 'background 0.15s ease',
          }}
          onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = '#246B78'; }}
          onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = '#35A0B5'; }}
        >
          GENERATE BRIEF →
        </button>
      </div>
    </div>
  );
}
