import { useRef, useEffect } from 'react';
import type { ScreenedMarket } from '../types';

interface MarketLine {
  title: string;
  probHistory: number[];
  color: string;
  isConfirmed: boolean;
}

interface Props {
  confirmedMarkets: ScreenedMarket[];
  rejectedMarkets:  ScreenedMarket[];
}

const SPARK_COLORS = ['#111111', '#555555', '#888888', '#BBBBBB', '#CCCCCC', '#DDDDDD'];
const DAYS = 60;
const CONFIRMED_DAY = 20;
const TOTAL_FRAMES  = 80;

function ensureHistory(hist: number[], isConfirmed: boolean, seed: number): number[] {
  if (hist.length >= DAYS) return hist.slice(0, DAYS);
  const out: number[] = [];
  const base  = 0.3 + (seed % 5) * 0.07;
  let   val   = base;
  const drift = isConfirmed ? 0.002 : -0.001 + (seed % 3) * 0.001;
  for (let d = 0; d < DAYS; d++) {
    const noise = (Math.sin(d * 2.3 + seed) + Math.cos(d * 1.7 + seed * 0.4)) * 0.018;
    if (d === CONFIRMED_DAY && isConfirmed)  val += 0.04;
    if (d === CONFIRMED_DAY && !isConfirmed) val += (seed % 2 === 0 ? -0.05 : 0.05);
    val += drift + noise;
    val = Math.max(0.12, Math.min(0.98, val));
    out.push(val);
  }
  return out;
}

function drawChart(canvas: HTMLCanvasElement, lines: MarketLine[], frame: number) {
  const parent = canvas.parentElement;
  if (!parent) return;
  const w = parent.offsetWidth;
  const h = parent.offsetHeight;
  canvas.width  = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const PAD = { top: 18, right: 20, bottom: 28, left: 42 };
  const chartW = w - PAD.left - PAD.right;
  const chartH = h - PAD.top  - PAD.bottom;
  const daysToShow = Math.max(1, Math.round((frame / TOTAL_FRAMES) * DAYS));
  const Y_MIN = 0.25, Y_MAX = 1.00;

  const toX = (d: number) => PAD.left + (d / (DAYS - 1)) * chartW;
  const toY = (v: number) => PAD.top  + (1 - (v - Y_MIN) / (Y_MAX - Y_MIN)) * chartH;

  // Grid lines
  ctx.strokeStyle = 'rgba(0,0,0,0.07)';
  ctx.lineWidth   = 0.5;
  [0.25, 0.5, 0.75, 1.0].forEach(v => {
    ctx.beginPath(); ctx.moveTo(PAD.left, toY(v)); ctx.lineTo(w - PAD.right, toY(v)); ctx.stroke();
  });

  // Y labels
  ctx.fillStyle = 'rgba(0,0,0,0.4)';
  ctx.font      = '9px "Source Code Pro", monospace';
  ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
  [0.25, 0.5, 0.75, 1.0].forEach(v => ctx.fillText(`${Math.round(v * 100)}%`, PAD.left - 6, toY(v)));

  // X labels
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.textAlign = 'center'; ctx.textBaseline = 'top';
  [0, 15, 30, 45, 59].forEach(d => ctx.fillText(`d${d}`, toX(d), h - PAD.bottom + 6));

  // Series
  for (const line of lines) {
    const hist = line.probHistory.slice(0, daysToShow);
    if (hist.length < 2) continue;
    const pts = hist.map((v, i) => ({ x: toX(i), y: toY(v) }));

    const grad = ctx.createLinearGradient(0, PAD.top, 0, h - PAD.bottom);
    grad.addColorStop(0, line.color + '28');
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

    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) {
      const cx = (pts[i-1].x + pts[i].x) / 2;
      ctx.bezierCurveTo(cx, pts[i-1].y, cx, pts[i].y, pts[i].x, pts[i].y);
    }
    ctx.strokeStyle = line.color;
    ctx.lineWidth   = 1.5;
    ctx.stroke();
  }

  // CONFIRMED vertical
  if (daysToShow > CONFIRMED_DAY) {
    const cx = toX(CONFIRMED_DAY);
    ctx.setLineDash([5, 4]);
    ctx.beginPath(); ctx.moveTo(cx, PAD.top); ctx.lineTo(cx, h - PAD.bottom);
    ctx.strokeStyle = 'rgba(0,0,0,0.25)';
    ctx.lineWidth   = 1;
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.shadowBlur  = 0;
    ctx.fillStyle   = 'rgba(0,0,0,0.5)';
    ctx.font        = '8px "Source Code Pro", monospace';
    ctx.textAlign   = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText('CONFIRMED', cx + 4, PAD.top + 2);
  }
}

export function CorrelationChart({ confirmedMarkets, rejectedMarkets }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const frameRef  = useRef(0);
  const rafRef    = useRef<number>(0);

  const buildLines = (): MarketLine[] => {
    const conf = confirmedMarkets.slice(0, 3).map((m, i) => ({
      title: m.title, isConfirmed: true,
      probHistory: ensureHistory(m.probHistory ?? [], true, i),
      color: SPARK_COLORS[i],
    }));
    const rej = rejectedMarkets.slice(0, 2).map((m, i) => ({
      title: m.title, isConfirmed: false,
      probHistory: ensureHistory(m.probHistory ?? [], false, i + 10),
      color: SPARK_COLORS[i + 3],
    }));
    if (conf.length > 0 || rej.length > 0) return [...rej, ...conf];
    // Fallback mock data
    return [
      { title: 'Rejected market A', color: '#BBBBBB', isConfirmed: false, probHistory: ensureHistory([], false, 10) },
      { title: 'Rejected market B', color: '#CCCCCC', isConfirmed: false, probHistory: ensureHistory([], false, 11) },
      { title: 'Lead market',       color: '#111111', isConfirmed: true,  probHistory: ensureHistory([], true,  0)  },
      { title: 'Lag market A',      color: '#555555', isConfirmed: true,  probHistory: ensureHistory([], true,  1)  },
      { title: 'Lag market B',      color: '#888888', isConfirmed: true,  probHistory: ensureHistory([], true,  2)  },
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

    // Double rAF — guarantees layout before measuring
    rafRef.current = requestAnimationFrame(() =>
      requestAnimationFrame(() => { rafRef.current = requestAnimationFrame(animate); })
    );
    return () => cancelAnimationFrame(rafRef.current);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [confirmedMarkets, rejectedMarkets]);

  const displayLines = linesSnapshot.current.length > 0 ? linesSnapshot.current : buildLines();
  const confirmed = displayLines.filter(l => l.isConfirmed);
  const rejected  = displayLines.filter(l => !l.isConfirmed);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{
        position: 'relative', height: 220,
        background: 'var(--dark1)', borderRadius: 6,
        overflow: 'hidden', boxShadow: 'var(--shadow-inset)',
      }}>
        <canvas ref={canvasRef} style={{ position: 'absolute', inset: 0 }} />
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 16px', paddingLeft: 2 }}>
        {confirmed.map((l, i) => <LegendItem key={`c${i}`} color={l.color} label={trunc(l.title, 30)} confirmed />)}
        {rejected.map( (l, i) => <LegendItem key={`r${i}`} color={l.color} label={trunc(l.title, 30)} />)}
      </div>
    </div>
  );
}

function LegendItem({ color, label, confirmed }: { color: string; label: string; confirmed?: boolean }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
      <div style={{ width: 6, height: 6, borderRadius: '50%', background: color, opacity: confirmed ? 1 : 0.5, flexShrink: 0 }} />
      <span style={{ fontFamily: 'var(--mono)', fontSize: 9, fontWeight: confirmed ? 500 : 400, color: confirmed ? 'var(--muted)' : 'var(--dim)' }}>
        {label}
      </span>
    </div>
  );
}

function trunc(s: string, n: number) { return s.length > n ? s.slice(0, n) + '…' : s; }
