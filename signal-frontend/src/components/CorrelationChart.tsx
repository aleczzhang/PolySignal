import { useRef, useEffect, useState } from 'react';
import type { DomainId } from '../types';

// Minimal market shape — accepts both ScoredMarket and ScreenedMarket
interface MarketSlim {
  title: string;
  probHistory: number[];
}

interface MarketLine {
  title: string;
  probHistory: number[];
  color: string;
  isConfirmed: boolean;
}

interface Props {
  confirmedMarkets: MarketSlim[];
  rejectedMarkets?: MarketSlim[];
  domain?: DomainId;
  fillHeight?: boolean;
  chartTitleTag?:   string;   // e.g. "ENERGY · FUTURES"
  chartTitleLabel?: string;   // e.g. "Iran · Oil Crisis — Uber Driver at Uber"
}

// Teal palette for confirmed lines, muted grey for rejected
const CONFIRMED_COLORS = ['#246B78', '#35899A', '#5AABB8'];
const REJECTED_COLORS  = ['#AAAAAA', '#C8C8C8'];

const DAYS = 60;
const CONFIRMED_DAY = 20;
const TOTAL_FRAMES  = 80;

// Realistic fallback market names per domain
const FALLBACK_MARKETS: Record<DomainId, { confirmed: string[]; rejected: string[] }> = {
  'iran-oil': {
    confirmed: ['Hormuz closure by June?', 'Brent > $120/barrel?', 'SPR release > 50M bbl?'],
    rejected:  ['Iran nuclear deal by Q3?', 'US Iran sanctions eased?'],
  },
  'us-election': {
    confirmed: ['Republican wins presidency?', 'Democrats win Senate?', 'Democrats win House?'],
    rejected:  ['3rd party > 5% popular vote?', 'Incumbent wins popular vote?'],
  },
  'fed-rates': {
    confirmed: ['Fed cuts at June FOMC?', 'CPI below 3% by Q3?', 'Recession in 2025?'],
    rejected:  ['Fed cuts > 75bps in 2025?', '10yr yield below 3.5%?'],
  },
  'crypto': {
    confirmed: ['BTC > $100k by EOY?', 'ETH ETF approved?', 'SEC drops BTC enforcement?'],
    rejected:  ['Crypto total cap > $5T?', 'BTC ETF inflows > $10B?'],
  },
}

function ensureHistory(hist: number[], isConfirmed: boolean, seed: number): number[] {
  if (hist.length >= DAYS) return hist.slice(0, DAYS);
  const out: number[] = [];
  const base  = 0.3 + (seed % 5) * 0.07;
  let   val   = base;
  const drift = isConfirmed ? 0.003 : -0.001 + (seed % 3) * 0.001;
  for (let d = 0; d < DAYS; d++) {
    const noise = (Math.sin(d * 2.3 + seed) + Math.cos(d * 1.7 + seed * 0.4)) * 0.018;
    if (d === CONFIRMED_DAY && isConfirmed)  val += 0.06;
    if (d === CONFIRMED_DAY && !isConfirmed) val += (seed % 2 === 0 ? -0.06 : 0.04);
    val += drift + noise;
    val = Math.max(0.12, Math.min(0.98, val));
    out.push(val);
  }
  return out;
}

function drawChart(
  canvas: HTMLCanvasElement,
  lines: MarketLine[],
  frame: number,
  activeTitle: string | null = null,
  titleTag?: string,
  titleLabel?: string,
) {
  const parent = canvas.parentElement;
  if (!parent) return;
  const dpr = window.devicePixelRatio || 1;
  const w = parent.offsetWidth;
  const h = parent.offsetHeight;
  canvas.width  = w * dpr;
  canvas.height = h * dpr;
  canvas.style.width  = `${w}px`;
  canvas.style.height = `${h}px`;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.scale(dpr, dpr);

  // Top padding grows when we have a title drawn in canvas
  const hasTitle = !!(titleTag || titleLabel);
  const PAD = { top: hasTitle ? 106 : 36, right: 28, bottom: 56, left: 64 };
  const daysToShow = Math.max(1, Math.round((frame / TOTAL_FRAMES) * DAYS));
  const Y_MIN = 0.00, Y_MAX = 1.00;

  const xMin = PAD.left, xMax = w - PAD.right;
  const yMin = PAD.top,  yMax = h - PAD.bottom;

  const toX = (d: number) => xMin + (d / (DAYS - 1)) * (xMax - xMin);
  const toY = (v: number) => yMin + (1 - (v - Y_MIN) / (Y_MAX - Y_MIN)) * (yMax - yMin);

  // Background
  ctx.fillStyle = '#0A0A0D';
  ctx.fillRect(0, 0, w, h);

  // Subtle dot grid (matches zoomed view)
  ctx.strokeStyle = 'rgba(255,255,255,0.028)';
  ctx.lineWidth = 0.4;
  const S = 36;
  for (let x = 0; x <= w + S; x += S) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke(); }
  for (let y = 0; y <= h + S; y += S) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); }

  // ── Title in canvas (matches zoomed-view style)
  if (titleTag) {
    ctx.font = '600 9px "Source Code Pro", monospace';
    ctx.fillStyle = '#35A0B5';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(titleTag, xMin, 44);
  }
  if (titleLabel) {
    ctx.font = 'bold 26px "Figtree", sans-serif';
    ctx.fillStyle = '#5ABECF';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(titleLabel, xMin, 82);
  }

  // ── Y-axis (zoomed-view style: tick marks + labels, no axis line)
  const yTicks = [{ v: 1.0, label: '100%' }, { v: 0.5, label: '50%' }, { v: 0.0, label: '0%' }];
  ctx.strokeStyle = 'rgba(36,107,120,0.35)';
  ctx.lineWidth = 1.5;
  for (const { v, label } of yTicks) {
    const ty = toY(v);
    ctx.beginPath(); ctx.moveTo(xMin - 6, ty); ctx.lineTo(xMin, ty); ctx.stroke();
    ctx.font = 'bold 11px "Source Code Pro", monospace';
    ctx.fillStyle = 'rgba(36,107,120,0.65)';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, xMin - 10, ty);
  }

  // Y-axis "PROBABILITY" rotated label
  ctx.save();
  ctx.translate(xMin - 44, (yMin + yMax) / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.font = 'bold 9px "Source Code Pro", monospace';
  ctx.fillStyle = 'rgba(36,107,120,0.45)';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('PROBABILITY', 0, 0);
  ctx.restore();

  // ── X-axis (zoomed-view style: "Xd ago" + "Today")
  const xLabels = [
    { pos: 0,   label: `${DAYS}d ago`, align: 'left'   as CanvasTextAlign },
    { pos: 0.5, label: `${DAYS / 2}d ago`, align: 'center' as CanvasTextAlign },
    { pos: 1,   label: 'Today',        align: 'right'  as CanvasTextAlign },
  ];
  ctx.strokeStyle = 'rgba(36,107,120,0.35)';
  ctx.lineWidth = 1.5;
  for (const { pos, label, align } of xLabels) {
    const tx = xMin + pos * (xMax - xMin);
    ctx.beginPath(); ctx.moveTo(tx, yMax); ctx.lineTo(tx, yMax + 6); ctx.stroke();
    ctx.font = 'bold 11px "Source Code Pro", monospace';
    ctx.fillStyle = 'rgba(36,107,120,0.65)';
    ctx.textAlign = align;
    ctx.textBaseline = 'top';
    ctx.fillText(label, tx, yMax + 12);
  }

  // ── SIGNAL marker at day 20
  if (daysToShow > CONFIRMED_DAY) {
    const cx = toX(CONFIRMED_DAY);
    ctx.save();
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(cx, yMin);
    ctx.lineTo(cx, yMax);
    ctx.strokeStyle = 'rgba(36,107,120,0.28)';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = 'rgba(36,107,120,0.55)';
    ctx.font = '600 8px "Source Code Pro", monospace';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText('SIGNAL', cx + 5, yMin + 2);
    ctx.restore();
  }

  // Series — draw rejected first (behind), then confirmed on top
  const rejected  = lines.filter(l => !l.isConfirmed);
  const confirmed = lines.filter(l => l.isConfirmed);

  for (const line of [...rejected, ...confirmed]) {
    const hist = line.probHistory.slice(0, daysToShow);
    if (hist.length < 2) continue;
    const pts = hist.map((v, i) => ({ x: toX(i), y: toY(v) }));

    const isActive = !activeTitle || line.title === activeTitle;
    const dimAlpha = isActive ? 1 : 0.08;

    // Gradient fill
    const grad = ctx.createLinearGradient(0, PAD.top, 0, h - PAD.bottom);
    grad.addColorStop(0, line.color + (line.isConfirmed ? '30' : '18'));
    grad.addColorStop(1, line.color + '00');

    ctx.globalAlpha = dimAlpha;
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) {
      const cx = (pts[i-1].x + pts[i].x) / 2;
      ctx.bezierCurveTo(cx, pts[i-1].y, cx, pts[i].y, pts[i].x, pts[i].y);
    }
    ctx.lineTo(pts[pts.length-1].x, h - PAD.bottom);
    ctx.lineTo(pts[0].x, h - PAD.bottom);
    ctx.closePath();
    ctx.fillStyle = grad;
    ctx.fill();

    // Line stroke
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) {
      const cx = (pts[i-1].x + pts[i].x) / 2;
      ctx.bezierCurveTo(cx, pts[i-1].y, cx, pts[i].y, pts[i].x, pts[i].y);
    }
    ctx.strokeStyle = line.color;
    ctx.lineWidth   = isActive && line.isConfirmed ? 2.5 : line.isConfirmed ? 2 : 1.2;
    ctx.globalAlpha = isActive ? (line.isConfirmed ? 1 : 0.55) : 0.08;
    ctx.stroke();
    ctx.globalAlpha = 1;

    // Endpoint dot for confirmed lines
    if (line.isConfirmed && pts.length > 0) {
      const last = pts[pts.length - 1];
      ctx.globalAlpha = dimAlpha;
      ctx.beginPath();
      ctx.arc(last.x, last.y, isActive ? 4 : 3, 0, Math.PI * 2);
      ctx.fillStyle = line.color;
      ctx.fill();
      ctx.globalAlpha = 1;
    }
  }
}

export function CorrelationChart({ confirmedMarkets, rejectedMarkets = [], domain, fillHeight, chartTitleTag, chartTitleLabel }: Props) {
  const canvasRef      = useRef<HTMLCanvasElement>(null);
  const frameRef       = useRef(0);
  const rafRef         = useRef<number>(0);
  const [activeTitle, setActiveTitle] = useState<string | null>(null);
  const activeTitleRef  = useRef<string | null>(null);
  const titleTagRef     = useRef<string | undefined>(undefined);
  const titleLabelRef   = useRef<string | undefined>(undefined);
  activeTitleRef.current = activeTitle;
  titleTagRef.current    = chartTitleTag;
  titleLabelRef.current  = chartTitleLabel;

  const buildLines = (): MarketLine[] => {
    const fb = domain ? FALLBACK_MARKETS[domain] : null;

    const conf = confirmedMarkets.slice(0, 3).map((m, i) => ({
      title: m.title, isConfirmed: true,
      probHistory: ensureHistory(m.probHistory ?? [], true, i),
      color: CONFIRMED_COLORS[i] ?? CONFIRMED_COLORS[0],
    }));
    const rej = rejectedMarkets.slice(0, 2).map((m, i) => ({
      title: m.title, isConfirmed: false,
      probHistory: ensureHistory(m.probHistory ?? [], false, i + 10),
      color: REJECTED_COLORS[i] ?? REJECTED_COLORS[0],
    }));

    if (conf.length > 0 || rej.length > 0) return [...rej, ...conf];

    // Domain-aware fallback
    return [
      { title: fb?.rejected[0] ?? 'Screened out — low r-score',  color: REJECTED_COLORS[0], isConfirmed: false, probHistory: ensureHistory([], false, 10) },
      { title: fb?.rejected[1] ?? 'Screened out — weak signal',  color: REJECTED_COLORS[1], isConfirmed: false, probHistory: ensureHistory([], false, 11) },
      { title: fb?.confirmed[0] ?? 'Lead signal market',         color: CONFIRMED_COLORS[0], isConfirmed: true,  probHistory: ensureHistory([], true,  0)  },
      { title: fb?.confirmed[1] ?? 'Correlated lag market',      color: CONFIRMED_COLORS[1], isConfirmed: true,  probHistory: ensureHistory([], true,  1)  },
      { title: fb?.confirmed[2] ?? 'Secondary lag market',       color: CONFIRMED_COLORS[2], isConfirmed: true,  probHistory: ensureHistory([], true,  2)  },
    ];
  };

  const linesSnapshot = useRef<MarketLine[]>([]);

  useEffect(() => {
    linesSnapshot.current = buildLines();
    frameRef.current = 0;
    cancelAnimationFrame(rafRef.current);

    function animate() {
      frameRef.current = Math.min(frameRef.current + 1, TOTAL_FRAMES);
      if (canvasRef.current) drawChart(canvasRef.current, linesSnapshot.current, frameRef.current, activeTitleRef.current, titleTagRef.current, titleLabelRef.current);
      if (frameRef.current < TOTAL_FRAMES) rafRef.current = requestAnimationFrame(animate);
    }

    rafRef.current = requestAnimationFrame(() =>
      requestAnimationFrame(() => { rafRef.current = requestAnimationFrame(animate); })
    );
    return () => cancelAnimationFrame(rafRef.current);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [confirmedMarkets, rejectedMarkets, domain]);

  // Redraw static frame when active line selection changes
  useEffect(() => {
    if (canvasRef.current && frameRef.current >= TOTAL_FRAMES) {
      drawChart(canvasRef.current, linesSnapshot.current, frameRef.current, activeTitle, chartTitleTag, chartTitleLabel);
    }
  }, [activeTitle, chartTitleTag, chartTitleLabel]);

  const displayLines = linesSnapshot.current.length > 0 ? linesSnapshot.current : buildLines();
  const confirmed = displayLines.filter(l => l.isConfirmed);
  const rejected  = displayLines.filter(l => !l.isConfirmed);

  if (fillHeight) {
    return (
      <div style={{ flex: 1, position: 'relative', minHeight: 0, background: '#0A0A0D', overflow: 'hidden' }}>
        <canvas ref={canvasRef} style={{ position: 'absolute', inset: 0 }} />

        {/* Interactive legend — top right, larger items */}
        <div style={{ position: 'absolute', top: 16, right: 16, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
          {confirmed.map((l, i) => (
            <LegendItem
              key={`c${i}`} color={l.color} label={trunc(l.title, 28)} confirmed
              active={activeTitle === l.title}
              onClick={() => setActiveTitle(prev => prev === l.title ? null : l.title)}
            />
          ))}
          {rejected.map((l, i) => (
            <LegendItem
              key={`r${i}`} color={l.color} label={trunc(l.title, 28)}
              active={activeTitle === l.title}
              onClick={() => setActiveTitle(prev => prev === l.title ? null : l.title)}
            />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{
        position: 'relative', height: 260,
        background: '#0A0A0D',
        border: '1px solid rgba(53,160,181,0.12)',
        borderRadius: 8,
        overflow: 'hidden',
      }}>
        <canvas ref={canvasRef} style={{ position: 'absolute', inset: 0 }} />
      </div>

      {/* Legend */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 20px', paddingLeft: 2 }}>
        {confirmed.map((l, i) => <LegendItem key={`c${i}`} color={l.color} label={trunc(l.title, 32)} confirmed />)}
        {rejected.map( (l, i) => <LegendItem key={`r${i}`} color={l.color} label={trunc(l.title, 32)} />)}
      </div>
    </div>
  );
}

function LegendItem({ color, label, confirmed, active, onClick }: { color: string; label: string; confirmed?: boolean; active?: boolean; onClick?: () => void }) {
  return (
    <div
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', gap: 8,
        cursor: onClick ? 'pointer' : undefined,
        opacity: active === false ? 0.35 : 1,
        transition: 'opacity 0.15s ease',
        background: active ? 'rgba(53,160,181,0.08)' : 'rgba(10,10,13,0.6)',
        border: `1px solid ${active ? 'rgba(53,160,181,0.3)' : 'rgba(255,255,255,0.07)'}`,
        borderRadius: 5,
        padding: '5px 10px',
        backdropFilter: 'blur(4px)',
      }}
    >
      <div style={{
        width: confirmed ? 16 : 12,
        height: confirmed ? 3 : 2,
        borderRadius: 2,
        background: color,
        opacity: confirmed ? 1 : 0.6,
        flexShrink: 0,
        boxShadow: active ? `0 0 6px ${color}` : undefined,
      }} />
      <span style={{
        fontFamily: 'var(--mono)',
        fontSize: 10,
        fontWeight: active ? 600 : confirmed ? 500 : 400,
        color: active ? '#E8EAF6' : confirmed ? 'var(--muted)' : 'var(--dim)',
        letterSpacing: '0.02em',
        whiteSpace: 'nowrap',
      }}>
        {label}
      </span>
    </div>
  );
}

function trunc(s: string, n: number) { return s.length > n ? s.slice(0, n) + '…' : s; }
