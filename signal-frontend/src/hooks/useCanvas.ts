import { useRef, useEffect } from 'react';

type DrawFn = (ctx: CanvasRenderingContext2D, w: number, h: number, dt: number) => void;

/**
 * Sets up a DPR-aware canvas with a 60fps rAF loop.
 * The draw function is called via ref so it can update without restarting the loop.
 */
export function useCanvas(draw: DrawFn) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawRef   = useRef<DrawFn>(draw);
  drawRef.current = draw;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const dpr = window.devicePixelRatio || 1;

    function resize() {
      const c = canvasRef.current;
      if (!c) return;
      c.width  = c.clientWidth  * dpr;
      c.height = c.clientHeight * dpr;
    }
    resize();

    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    let last = 0;
    let raf: number;

    function frame(now: number) {
      const c = canvasRef.current;
      if (!c) { raf = requestAnimationFrame(frame); return; }
      const w = c.clientWidth;
      const h = c.clientHeight;
      if (w === 0 || h === 0) { raf = requestAnimationFrame(frame); return; }

      const dt  = last === 0 ? 0 : Math.min((now - last) / 1000, 0.05);
      last = now;

      const ctx = c.getContext('2d');
      if (!ctx) { raf = requestAnimationFrame(frame); return; }

      ctx.save();
      ctx.scale(dpr, dpr);
      drawRef.current(ctx, w, h, dt);
      ctx.restore();

      raf = requestAnimationFrame(frame);
    }

    raf = requestAnimationFrame(frame);

    return () => {
      ro.disconnect();
      cancelAnimationFrame(raf);
    };
  }, []);

  return canvasRef;
}
