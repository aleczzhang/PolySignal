import { useRef, useEffect } from 'react';
import type { SparkMarket } from '../types';

interface Props {
  market: SparkMarket;
}

function drawSparkline(canvas: HTMLCanvasElement, data: number[], color: string) {
  const parent = canvas.parentElement;
  if (!parent) return;
  const w = parent.offsetWidth;
  const h = parent.offsetHeight;
  canvas.width  = w;
  canvas.height = h;

  const ctx = canvas.getContext('2d');
  if (!ctx || data.length < 2) return;

  const pad = { top: 2, bottom: 2, left: 0, right: 0 };
  const chartW = w - pad.left - pad.right;
  const chartH = h - pad.top - pad.bottom;

  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 0.01;

  const pts = data.map((v, i) => ({
    x: pad.left + (i / (data.length - 1)) * chartW,
    y: pad.top  + (1 - (v - min) / range) * chartH,
  }));

  // Gradient fill under line
  const grad = ctx.createLinearGradient(0, pad.top, 0, h);
  grad.addColorStop(0, color + '38');
  grad.addColorStop(1, color + '00');

  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) {
    const cx = (pts[i - 1].x + pts[i].x) / 2;
    ctx.bezierCurveTo(cx, pts[i - 1].y, cx, pts[i].y, pts[i].x, pts[i].y);
  }
  ctx.lineTo(pts[pts.length - 1].x, h);
  ctx.lineTo(pts[0].x, h);
  ctx.closePath();
  ctx.fillStyle = grad;
  ctx.fill();

  // Line
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) {
    const cx = (pts[i - 1].x + pts[i].x) / 2;
    ctx.bezierCurveTo(cx, pts[i - 1].y, cx, pts[i].y, pts[i].x, pts[i].y);
  }
  ctx.strokeStyle = color;
  ctx.lineWidth   = 1.5;
  ctx.stroke();
}

export function SparkCard({ market }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef    = useRef<number>(0);

  useEffect(() => {
    // Double rAF to guarantee layout before measuring
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = requestAnimationFrame(() => {
        if (canvasRef.current) {
          drawSparkline(canvasRef.current, market.probHistory, market.color);
        }
      });
    });
    return () => cancelAnimationFrame(rafRef.current);
  }, [market]);

  const isPositive = market.delta24h >= 0;
  const deltaColor = isPositive ? '#111111' : '#BBBBBB';
  const deltaArrow = isPositive ? '↑' : '↓';
  const deltaAbs   = Math.abs(market.delta24h * 100).toFixed(1);

  return (
    <div className="spark-card">
      {/* Top row */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
        <div style={{
          fontFamily: 'var(--sans)',
          fontSize: 11,
          fontWeight: 400,
          color: 'var(--muted)',
          lineHeight: 1.3,
          maxWidth: 130,
        }}>
          {market.name}
        </div>
        <span className="source-badge">{market.source}</span>
      </div>

      {/* Probability + delta */}
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 8 }}>
        <span style={{
          fontFamily: 'var(--mono)',
          fontSize: 22,
          fontWeight: 700,
          color: '#111111',
          lineHeight: 1,
        }}>
          {Math.round(market.probability * 100)}%
        </span>
        <span style={{
          fontFamily: 'var(--mono)',
          fontSize: 9,
          fontWeight: 500,
          color: deltaColor,
        }}>
          {deltaArrow}{deltaAbs}%
        </span>
      </div>

      {/* Sparkline canvas */}
      <div style={{ position: 'relative', height: 40 }}>
        <canvas
          ref={canvasRef}
          style={{ position: 'absolute', inset: 0 }}
        />
      </div>
    </div>
  );
}
