import { useRef, useEffect } from 'react';
import type { ScreenedMarket } from '../types';
import type { DomainId } from '../types';

interface MarketLine {
  title: string;
  probHistory: number[];
  color: string;
  isConfirmed: boolean;
}

interface Props {
  confirmedMarkets: ScreenedMarket[];
  rejectedMarkets:  ScreenedMarket[];
  domain?: DomainId;
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

function drawChart(canvas: HTMLCanvasElement, lines: MarketLine[], frame: number) {
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

  const PAD = { top: 22, right: 24, bottom: 32, left: 46 };
  const chartW = w - PAD.left - PAD.right;
  const chartH = h - PAD.top  - PAD.bottom;
  const daysToShow = Math.max(1, Math.round((frame / TOTAL_FRAMES) * DAYS));
  const Y_MIN = 0.20, Y_MAX = 1.00;

  const toX = (d: number) => PAD.left + (d / (DAYS - 1)) * chartW;
  const toY = (v: number) => PAD.top  + (1 - (v - Y_MIN) / (Y_MAX - Y_MIN)) * chartH;

  // Background
  ctx.fillStyle = '#F8FAFB';
  ctx.fillRect(0, 0, w, h);

  // Grid lines
  const gridVals = [0.25, 0.50, 0.75, 1.00];
  gridVals.forEach(v => {
    const y = toY(v);
    ctx.beginPath();
    ctx.moveTo(PAD.left, y);
    ctx.lineTo(w - PAD.right, y);
    ctx.strokeStyle = v === 0.50 ? 'rgba(36,107,120,0.12)' : 'rgba(0,0,0,0.06)';
    ctx.lineWidth = v === 0.50 ? 1 : 0.5;
    ctx.stroke();
  });

  // Y labels
  ctx.fillStyle = '#8B92A5';
  ctx.font = `500 9px "Source Code Pro", monospace`;
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  gridVals.forEach(v => ctx.fillText(`${Math.round(v * 100)}%`, PAD.left - 8, toY(v)));

  // X labels
  ctx.fillStyle = '#8B92A5';
  ctx.font = `500 9px "Source Code Pro", monospace`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  [0, 15, 30, 45, 59].forEach(d => ctx.fillText(`d${d}`, toX(d), h - PAD.bottom + 8));

  // CONFIRMED vertical line
  if (daysToShow > CONFIRMED_DAY) {
    const cx = toX(CONFIRMED_DAY);
    ctx.save();
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(cx, PAD.top);
    ctx.lineTo(cx, h - PAD.bottom);
    ctx.strokeStyle = 'rgba(36,107,120,0.35)';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.fillStyle = '#246B78';
    ctx.font = `600 8px "Source Code Pro", monospace`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText('SIGNAL', cx + 5, PAD.top + 2);
    ctx.restore();
  }

  // Series — draw rejected first (behind), then confirmed on top
  const rejected  = lines.filter(l => !l.isConfirmed);
  const confirmed = lines.filter(l => l.isConfirmed);

  for (const line of [...rejected, ...confirmed]) {
    const hist = line.probHistory.slice(0, daysToShow);
    if (hist.length < 2) continue;
    const pts = hist.map((v, i) => ({ x: toX(i), y: toY(v) }));

    // Gradient fill
    const grad = ctx.createLinearGradient(0, PAD.top, 0, h - PAD.bottom);
    grad.addColorStop(0, line.color + (line.isConfirmed ? '30' : '18'));
    grad.addColorStop(1, line.color + '00');

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
    ctx.lineWidth   = line.isConfirmed ? 2 : 1.2;
    ctx.globalAlpha = line.isConfirmed ? 1 : 0.55;
    ctx.stroke();
    ctx.globalAlpha = 1;

    // Endpoint dot for confirmed lines
    if (line.isConfirmed && pts.length > 0) {
      const last = pts[pts.length - 1];
      ctx.beginPath();
      ctx.arc(last.x, last.y, 3, 0, Math.PI * 2);
      ctx.fillStyle = line.color;
      ctx.fill();
    }
  }
}

export function CorrelationChart({ confirmedMarkets, rejectedMarkets, domain }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const frameRef  = useRef(0);
  const rafRef    = useRef<number>(0);

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
      if (canvasRef.current) drawChart(canvasRef.current, linesSnapshot.current, frameRef.current);
      if (frameRef.current < TOTAL_FRAMES) rafRef.current = requestAnimationFrame(animate);
    }

    rafRef.current = requestAnimationFrame(() =>
      requestAnimationFrame(() => { rafRef.current = requestAnimationFrame(animate); })
    );
    return () => cancelAnimationFrame(rafRef.current);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [confirmedMarkets, rejectedMarkets, domain]);

  const displayLines = linesSnapshot.current.length > 0 ? linesSnapshot.current : buildLines();
  const confirmed = displayLines.filter(l => l.isConfirmed);
  const rejected  = displayLines.filter(l => !l.isConfirmed);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{
        position: 'relative', height: 260,
        background: '#F8FAFB',
        border: '1px solid rgba(36,107,120,0.12)',
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

function LegendItem({ color, label, confirmed }: { color: string; label: string; confirmed?: boolean }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <div style={{
        width: confirmed ? 10 : 8,
        height: confirmed ? 3 : 2,
        borderRadius: 2,
        background: color,
        opacity: confirmed ? 1 : 0.5,
        flexShrink: 0,
      }} />
      <span style={{
        fontFamily: 'var(--mono)',
        fontSize: 9,
        fontWeight: confirmed ? 500 : 400,
        color: confirmed ? 'var(--muted)' : 'var(--dim)',
        letterSpacing: confirmed ? '0.02em' : undefined,
      }}>
        {label}
      </span>
    </div>
  );
}

function trunc(s: string, n: number) { return s.length > n ? s.slice(0, n) + '…' : s; }
