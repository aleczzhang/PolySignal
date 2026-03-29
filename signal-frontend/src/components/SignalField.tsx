import { useState, useRef, useEffect, type CSSProperties } from 'react';
import type { DomainId } from '../types';
import { SIGNAL_DOMAINS } from '../constants/domains';
import type { SignalDomain } from '../constants/domains';
import type { DomainSuggestion } from '../hooks/useDomainSuggestions';
import { useCanvas } from '../hooks/useCanvas';
import { RightPanel } from './RightPanel';

// ── Easing ────────────────────────────────────────────────────────────────────

function easeInOut(t: number): number {
  return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
}

// ── Domain relevance keywords ─────────────────────────────────────────────────

const DOMAIN_KEYWORDS: Record<string, string[]> = {
  'iran-oil':    ['energy', 'oil', 'gas', 'petroleum', 'commodity', 'geopolit', 'defense', 'military', 'opec', 'gulf', 'iran', 'state department', 'diplomat'],
  'fed-rates':   ['fed', 'bank', 'finance', 'econom', 'macro', 'hedge', 'invest', 'treasury', 'monetary', 'capital', 'fund', 'rate', 'credit'],
  'us-election': ['government', 'policy', 'politic', 'congress', 'senate', 'election', 'campaign', 'lobbyi', 'think tank', 'ngo', 'diplomat', 'public sector'],
  'crypto':      ['crypto', 'bitcoin', 'blockchain', 'web3', 'defi', 'digital asset', 'tech', 'venture', 'startup', 'protocol', 'fintech'],
}

// ── Teal color keyed to node radius (larger = darker) ────────────────────────

function domainTeal(r: number, hovered: boolean): string {
  const t = Math.max(0, Math.min(1, (r - 50) / 30));
  const lr = Math.round(0x46 + (0x12 - 0x46) * t);
  const lg = Math.round(0x82 + (0x44 - 0x82) * t);
  const lb = Math.round(0x91 + (0x52 - 0x91) * t);
  const dim = hovered ? 22 : 0;
  return `rgb(${Math.max(0, lr - dim)},${Math.max(0, lg - dim)},${Math.max(0, lb - dim)})`;
}

// ── Ambient circles for empty state (no text, just shapes) ───────────────────

const AMBIENT = [
  { x: 0.28, y: 0.34, r: 28 },
  { x: 0.68, y: 0.26, r: 18 },
  { x: 0.75, y: 0.65, r: 36 },
  { x: 0.38, y: 0.68, r: 22 },
  { x: 0.53, y: 0.47, r: 13 },
];

function drawAmbientCircles(ctx: CanvasRenderingContext2D, w: number, h: number, phase: number) {
  for (let i = 0; i < AMBIENT.length; i++) {
    const c = AMBIENT[i];
    const cx = c.x * w, cy = c.y * h;
    ctx.save();

    // Pulsing rings — very dim
    for (let j = 0; j < 2; j++) {
      const rr = c.r * (1 + (j + 1) * 0.5) + Math.sin(phase + i * 0.9 + j * 1.1) * 2.5;
      ctx.beginPath();
      ctx.arc(cx, cy, rr, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(36,107,120,${0.07 - j * 0.02})`;
      ctx.lineWidth = 0.8;
      ctx.stroke();
    }

    // Body — very dim
    ctx.globalAlpha = 0.05;
    ctx.beginPath();
    ctx.arc(cx, cy, c.r, 0, Math.PI * 2);
    ctx.fillStyle = `rgb(${Math.round(0x46 - i * 3)},${Math.round(0x82 - i * 5)},${Math.round(0x91 - i * 5)})`;
    ctx.fill();

    // Center dot
    ctx.globalAlpha = 0.12;
    ctx.beginPath();
    ctx.arc(cx, cy, 3, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.fill();

    ctx.restore();
  }
}

// ── Canvas drawing helpers ────────────────────────────────────────────────────

function drawGrid(ctx: CanvasRenderingContext2D, w: number, h: number) {
  ctx.strokeStyle = 'rgba(255,255,255,0.028)';
  ctx.lineWidth = 0.5;
  const S = 36;
  for (let x = 0; x <= w + S; x += S) {
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
  }
  for (let y = 0; y <= h + S; y += S) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
  }
}

function drawConnections(ctx: CanvasRenderingContext2D, w: number, h: number, alpha: number) {
  const ds = SIGNAL_DOMAINS;
  ctx.save();
  ctx.setLineDash([4, 8]);
  ctx.lineWidth = 0.8;
  const maxD = Math.hypot(w, h) * 0.65;
  for (let i = 0; i < ds.length; i++) {
    for (let j = i + 1; j < ds.length; j++) {
      const a = ds[i], b = ds[j];
      const ax = a.x * w, ay = a.y * h;
      const bx = b.x * w, by = b.y * h;
      const dist = Math.hypot(bx - ax, by - ay);
      if (dist > maxD) continue;
      const la = (1 - dist / maxD) * 0.2 * alpha;
      ctx.strokeStyle = `rgba(36,107,120,${la})`;
      ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke();
    }
  }
  ctx.setLineDash([]);
  ctx.restore();
}

function wrapText(ctx: CanvasRenderingContext2D, text: string, cx: number, y: number, maxW: number, lineH: number) {
  const words = text.split(' ');
  let line = '';
  for (const word of words) {
    const test = line ? line + ' ' + word : word;
    if (ctx.measureText(test).width > maxW && line) {
      ctx.fillText(line, cx, y);
      line = word;
      y += lineH;
    } else {
      line = test;
    }
  }
  if (line) ctx.fillText(line, cx, y);
}

function drawNode(
  ctx: CanvasRenderingContext2D, w: number, h: number,
  d: SignalDomain, phase: number,
  hovered: boolean, unlocked: boolean, alpha: number, relevance: number,
  relevanceNote?: string,
) {
  const cx = d.x * w, cy = d.y * h, r = d.r;
  const teal = domainTeal(r, hovered);
  ctx.save();
  ctx.globalAlpha = alpha * (unlocked ? 1 : 0.06) * relevance;

  // Pulsing rings
  for (let i = 0; i < 3; i++) {
    const rr = r * (1 + (i + 1) * 0.48) + Math.sin(phase + i * 1.1) * 3;
    const ra = (0.09 - i * 0.022) * (hovered ? 2.8 : 1);
    ctx.beginPath();
    ctx.arc(cx, cy, rr, 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(36,107,120,${ra})`;
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  // Body
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = teal;
  ctx.fill();
  ctx.strokeStyle = hovered ? 'rgba(255,255,255,0.7)' : 'rgba(255,255,255,0.4)';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // Center dot
  ctx.beginPath();
  ctx.arc(cx, cy, 5, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(255,255,255,0.9)';
  ctx.fill();

  // OI (above label)
  ctx.font = '400 11px "Source Code Pro", monospace';
  ctx.fillStyle = 'rgba(53,160,181,0.35)';
  ctx.textAlign = 'center';
  ctx.fillText(d.oi, cx, cy - r - 32);

  // Label
  ctx.font = `${hovered ? 600 : 500} 14px "Source Code Pro", monospace`;
  ctx.fillStyle = hovered ? '#5ABECF' : '#35A0B5';
  ctx.fillText(d.label, cx, cy - r - 16);


  ctx.restore();
}

// Sparkline — takes explicit chart bounds so axes align
function drawSparkSquiggle(
  ctx: CanvasRenderingContext2D,
  spark: number[],
  xMin: number, xMax: number, yMin: number, yMax: number,
  opacity: number, strokeW: number
) {
  const pts = spark.map((v, i) => ({
    x: xMin + (i / (spark.length - 1)) * (xMax - xMin),
    y: yMin + (1 - v / 50) * (yMax - yMin),
  }));
  ctx.save();
  ctx.strokeStyle = `rgba(36,107,120,${opacity})`;
  ctx.lineWidth = strokeW;
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) {
    const mx = (pts[i - 1].x + pts[i].x) / 2;
    ctx.bezierCurveTo(mx, pts[i - 1].y, mx, pts[i].y, pts[i].x, pts[i].y);
  }
  ctx.stroke();
  ctx.restore();
}

function drawZoomedView(
  ctx: CanvasRenderingContext2D, w: number, h: number,
  domain: SignalDomain, _phase: number, fade: number,
  hoveredCard: number | null
) {
  ctx.save();
  ctx.globalAlpha = fade;

  // Chart bounds
  const xMin = 62, xMax = w - 22;
  const yMin = 106, yMax = h - 72;

  // Subtle grid
  ctx.strokeStyle = 'rgba(255,255,255,0.028)';
  ctx.lineWidth = 0.4;
  const S = 36;
  for (let x = 0; x <= w + S; x += S) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke(); }
  for (let y = 0; y <= h + S; y += S) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); }

  // ── Y-axis: tick marks + labels only (no axis lines, no gridlines)
  const yTicks = [0, 25, 50]; // v values → 0%, 50%, 100%
  ctx.strokeStyle = 'rgba(36,107,120,0.35)';
  ctx.lineWidth = 1.5;
  for (const v of yTicks) {
    const ty = yMin + (1 - v / 50) * (yMax - yMin);
    // Short tick mark
    ctx.beginPath(); ctx.moveTo(xMin - 6, ty); ctx.lineTo(xMin, ty); ctx.stroke();
    // Label
    ctx.font = 'bold 12px "Source Code Pro", monospace';
    ctx.fillStyle = 'rgba(36,107,120,0.65)';
    ctx.textAlign = 'right';
    ctx.fillText(`${v * 2}%`, xMin - 10, ty + 4.5);
  }

  // Y-axis title (rotated)
  ctx.save();
  ctx.translate(xMin - 44, (yMin + yMax) / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.font = 'bold 10px "Source Code Pro", monospace';
  ctx.fillStyle = 'rgba(36,107,120,0.45)';
  ctx.textAlign = 'center';
  ctx.fillText('PROBABILITY', 0, 0);
  ctx.restore();

  // ── X-axis: tick marks + labels only
  const xTicks = [
    { pos: 0,   label: '14d ago', align: 'left'   as CanvasTextAlign },
    { pos: 0.5, label: '7d ago',  align: 'center' as CanvasTextAlign },
    { pos: 1,   label: 'Today',   align: 'right'  as CanvasTextAlign },
  ];
  ctx.strokeStyle = 'rgba(36,107,120,0.35)';
  ctx.lineWidth = 1.5;
  for (const { pos, label, align } of xTicks) {
    const tx = xMin + pos * (xMax - xMin);
    // Short tick mark
    ctx.beginPath(); ctx.moveTo(tx, yMax); ctx.lineTo(tx, yMax + 6); ctx.stroke();
    // Label
    ctx.font = 'bold 12px "Source Code Pro", monospace';
    ctx.fillStyle = 'rgba(36,107,120,0.65)';
    ctx.textAlign = align;
    ctx.fillText(label, tx, yMax + 20);
  }

  // ── Sparklines
  for (let i = 0; i < 3; i++) {
    const highlighted = hoveredCard === i;
    const anyHovered  = hoveredCard !== null;
    const opacity = highlighted ? 0.62 : anyHovered ? 0.03 : [0.16, 0.08, 0.04][i];
    const strokeW = highlighted ? 3.2 : anyHovered ? 0.8 : [3.0, 1.6, 1.0][i];
    drawSparkSquiggle(ctx, domain.signals[i].spark, xMin, xMax, yMin, yMax, opacity, strokeW);
  }

  // Domain tag (top-left)
  ctx.font = '600 9px "Source Code Pro", monospace';
  ctx.fillStyle = '#35A0B5';
  ctx.textAlign = 'left';
  ctx.fillText(domain.tag, 32, 44);

  // Domain name — Figtree bold
  ctx.font = 'bold 28px "Figtree", sans-serif';
  ctx.fillStyle = '#5ABECF';
  ctx.fillText(domain.label, 32, 82);

  // Exit hint — centered, bottom, larger
  ctx.font = '500 13px "Source Code Pro", monospace';
  ctx.fillStyle = 'rgba(53,160,181,0.45)';
  ctx.textAlign = 'center';
  ctx.fillText('CLICK OUTSIDE TO EXIT', w / 2, h - 22);

  ctx.restore();
}

// ── Component ─────────────────────────────────────────────────────────────────

interface Props {
  role:           string;
  org:            string;
  onRoleChange:   (v: string) => void;
  onOrgChange:    (v: string) => void;
  onDomainChange: (id: DomainId) => void;
  onRun:          () => void;
  suggestions?:   DomainSuggestion[] | null;
}

interface Anim {
  phase:        number;
  zoomedId:     string | null;
  zoomT:        number;
  hoverId:      string | null;
  hoveredCard:  number | null;
  hintOpacity:  number;
  hintTimer:    number;
}

export function SignalField({ role, org, onRoleChange, onOrgChange, onDomainChange, onRun, suggestions }: Props) {
  const [activeId, setActiveId]   = useState<string | null>(null);
  const [isZoomed, setIsZoomed]   = useState(false);
  const [panelOpen, setPanelOpen] = useState(false);

  const anim           = useRef<Anim>({ phase: 0, zoomedId: null, zoomT: 0, hoverId: null, hoveredCard: null, hintOpacity: 0, hintTimer: 0 });
  const roleRef        = useRef(role);        roleRef.current        = role;
  const orgRef         = useRef(org);         orgRef.current         = org;
  const suggestionsRef = useRef(suggestions); suggestionsRef.current = suggestions;
  const prevZoomed     = useRef(false);

  const unlocked = role.trim().length >= 2 && org.trim().length >= 2;
  const unlockedRef = useRef(unlocked); unlockedRef.current = unlocked;

  // Trigger hint on first unlock
  const prevUnlocked = useRef(false);
  useEffect(() => {
    if (unlocked && !prevUnlocked.current) {
      anim.current.hintOpacity = 1;
      anim.current.hintTimer   = 3.5;
    }
    prevUnlocked.current = unlocked;
  }, [unlocked]);

  // Draw function
  function draw(ctx: CanvasRenderingContext2D, w: number, h: number, dt: number) {
    const a = anim.current;
    a.phase += 0.04;

    if (a.zoomedId) a.zoomT = Math.min(1, a.zoomT + dt * 1.9);
    else             a.zoomT = Math.max(0, a.zoomT - dt * 2.4);

    if (a.hintTimer > 0) {
      a.hintTimer -= dt;
      if (a.hintTimer <= 0) a.hintOpacity = 0;
      else if (a.hintTimer < 0.6) a.hintOpacity = a.hintTimer / 0.6;
    }

    const nowZoomed = a.zoomT > 0.15;
    if (nowZoomed !== prevZoomed.current) {
      prevZoomed.current = nowZoomed;
      setIsZoomed(nowZoomed);
    }

    const e     = easeInOut(a.zoomT);
    const uLock = unlockedRef.current;

    ctx.fillStyle = '#0A0A0D';
    ctx.fillRect(0, 0, w, h);
    drawGrid(ctx, w, h);

    const fieldA = 1 - e;
    if (fieldA > 0.01) {
      if (!uLock) {
        // Empty state — just ambient shapes, no domain nodes, no text
        drawAmbientCircles(ctx, w, h, a.phase);
      } else {
        // Filled state — show K2-suggested domain nodes
        const suggs = suggestionsRef.current;
        let relevanceMap: Record<string, number>;
        let noteMap: Record<string, string | undefined>;

        if (suggs && suggs.length > 0) {
          // K2 suggestions available — use them to drive relevance
          const suggSet = new Map(suggs.map(s => [s.id, s.relevanceNote]));
          relevanceMap = Object.fromEntries(
            SIGNAL_DOMAINS.map(d => [d.id, suggSet.has(d.id) ? 1 : 0.15])
          );
          noteMap = Object.fromEntries(
            SIGNAL_DOMAINS.map(d => [d.id, suggSet.get(d.id)])
          );
        } else {
          // K2 still loading — show all domains equally while waiting
          relevanceMap = Object.fromEntries(SIGNAL_DOMAINS.map(d => [d.id, 1]));
          noteMap = {};
        }

        drawConnections(ctx, w, h, fieldA);
        for (const d of SIGNAL_DOMAINS) {
          drawNode(ctx, w, h, d, a.phase, a.hoverId === d.id, true, fieldA, relevanceMap[d.id], noteMap[d.id]);
        }
      }
    }

    // Expanding teal-tinted circle
    if (a.zoomedId) {
      const nd = SIGNAL_DOMAINS.find(d => d.id === a.zoomedId);
      if (nd) {
        const cx = nd.x * w, cy = nd.y * h;
        const maxR = Math.hypot(w, h);
        const r    = nd.r + (maxR - nd.r) * e;
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.fillStyle = '#0C0C11';
        ctx.fill();
      }
    }

    // Zoomed view content
    if (a.zoomedId && a.zoomT > 0.85) {
      const nd = SIGNAL_DOMAINS.find(d => d.id === a.zoomedId);
      if (nd) {
        const fade = Math.min(1, (a.zoomT - 0.85) / 0.15);
        drawZoomedView(ctx, w, h, nd, a.phase, fade, a.hoveredCard);
      }
    }

    // Hint — only show briefly after first unlock, now that ambient→nodes is the visual cue
    if (a.hintOpacity > 0 && uLock && !a.zoomedId && a.zoomT < 0.1) {
      ctx.save();
      ctx.globalAlpha = a.hintOpacity * 0.45;
      ctx.font = '500 10px "Source Code Pro", monospace';
      ctx.fillStyle = '#35A0B5';
      ctx.textAlign = 'center';
      ctx.fillText('CLICK A DOMAIN TO EXPLORE', w / 2, h - 58);
      ctx.restore();
    }
  }

  const canvasRef = useCanvas(draw);

  // ── Mouse handlers ────────────────────────────────────────────────────────

  function hitNode(x: number, y: number, w: number, h: number): SignalDomain | null {
    for (const d of SIGNAL_DOMAINS) {
      if (Math.hypot(x - d.x * w, y - d.y * h) <= d.r + 14) return d;
    }
    return null;
  }

  function handleMouseMove(e: React.MouseEvent<HTMLCanvasElement>) {
    const a = anim.current;
    if (a.zoomT > 0.05 || !unlockedRef.current) return;
    const r = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - r.left, y = e.clientY - r.top;
    const hit = hitNode(x, y, r.width, r.height);
    a.hoverId = hit?.id ?? null;
    e.currentTarget.style.cursor = hit ? 'pointer' : 'default';
  }

  function handleMouseLeave() {
    anim.current.hoverId = null;
  }

  function handleClick(e: React.MouseEvent<HTMLCanvasElement>) {
    const a = anim.current;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left, y = e.clientY - rect.top;

    if (a.zoomedId && a.zoomT > 0.85) {
      const nd = SIGNAL_DOMAINS.find(d => d.id === a.zoomedId);
      if (nd) {
        const minDim = Math.min(rect.width, rect.height);
        if (Math.hypot(x - nd.x * rect.width, y - nd.y * rect.height) > minDim * 0.46) {
          a.zoomedId = null;
          a.hoveredCard = null;
          setActiveId(null);
          setPanelOpen(false);
          setTimeout(() => setIsZoomed(false), 460);
        }
      }
      return;
    }

    if (!unlockedRef.current || a.zoomT > 0) return;
    const hit = hitNode(x, y, rect.width, rect.height);
    if (hit) {
      a.zoomedId = hit.id;
      setActiveId(hit.id);
      setPanelOpen(true);
      onDomainChange(hit.id as DomainId);
    }
  }

  function handleCardHover(i: number | null) {
    anim.current.hoveredCard = i;
  }

  // ── Styles ────────────────────────────────────────────────────────────────

  const SANS: CSSProperties = { fontFamily: '"Figtree", sans-serif' };
  const MONO: CSSProperties = { fontFamily: '"Source Code Pro", monospace' };

  const inputStyle: CSSProperties = {
    ...SANS,
    fontSize: 14,
    color: '#E8EAF6',
    background: 'rgba(255,255,255,0.05)',
    border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: 6,
    padding: '11px 16px',
    outline: 'none',
    flex: 1,
    minWidth: 0,
  };

  return (
    <div style={{ display: 'flex', flex: 1, height: '100%', background: '#0A0A0D', position: 'relative', overflow: 'hidden' }}>

      {/* Canvas field — grows to fill all space left of panel */}
      <div style={{ flex: 1, position: 'relative', height: '100%', minWidth: 0 }}>
        <canvas
          ref={canvasRef}
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}
          onMouseMove={handleMouseMove}
          onMouseLeave={handleMouseLeave}
          onClick={handleClick}
        />

        {/* Bottom bar — inside canvas div so it tracks canvas width */}
        <div style={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          zIndex: 20,
          transform: isZoomed ? 'translateY(110%)' : 'translateY(0)',
          transition: 'transform 0.26s ease',
          background: 'rgba(10,10,13,0.97)',
          backdropFilter: 'blur(12px)',
          borderTop: '1px solid rgba(53,160,181,0.15)',
          padding: '12px 32px 14px',
          display: 'flex',
          alignItems: 'flex-end',
          gap: 12,
        }}>
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 5 }}>
            <label style={{ ...MONO, fontSize: 10, color: 'rgba(36,107,120,0.55)', letterSpacing: '0.12em', textTransform: 'uppercase' }}>
              Role / Occupation
            </label>
            <input
              value={role}
              onChange={e => onRoleChange(e.target.value)}
              placeholder="e.g. Analyst, Diplomat, Fund Manager"
              style={inputStyle}
            />
          </div>
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 5 }}>
            <label style={{ ...MONO, fontSize: 10, color: 'rgba(36,107,120,0.55)', letterSpacing: '0.12em', textTransform: 'uppercase' }}>
              Organization
            </label>
            <input
              value={org}
              onChange={e => onOrgChange(e.target.value)}
              placeholder="e.g. Goldman Sachs, State Dept, CIA"
              style={inputStyle}
            />
          </div>
        </div>
      </div>

      {/* Right panel — slides in from right on domain select */}
      <div style={{
        width: panelOpen ? '340px' : '0',
        transition: 'width 0.38s cubic-bezier(0.22, 1, 0.36, 1)',
        overflow: 'hidden',
        flexShrink: 0,
        height: '100%',
      }}>
        <div style={{ width: '340px', height: '100%' }}>
          <RightPanel
            domain={SIGNAL_DOMAINS.find(d => d.id === activeId) ?? null}
            role={role}
            org={org}
            onCardHover={handleCardHover}
            onRun={onRun}
            relevanceNote={suggestions?.find(s => s.id === activeId)?.relevanceNote}
          />
        </div>
      </div>

    </div>
  );
}
