import { useEffect, useRef, useState } from 'react';

/**
 * Animates a number from 0 to `target` over `duration` ms using ease-out cubic.
 * Restarts whenever `target` changes.
 */
export function useCountUp(target: number, duration = 700): number {
  const [val, setVal]    = useState(0);
  const startRef         = useRef<number | null>(null);
  const rafRef           = useRef<number>(0);
  const prevTargetRef    = useRef<number>(target);

  useEffect(() => {
    // Reset on target change
    if (prevTargetRef.current !== target) {
      prevTargetRef.current = target;
      startRef.current = null;
    }

    cancelAnimationFrame(rafRef.current);

    function animate(ts: number) {
      if (!startRef.current) startRef.current = ts;
      const progress = Math.min((ts - startRef.current) / duration, 1);
      const eased    = 1 - Math.pow(1 - progress, 3); // ease-out cubic
      setVal(Math.round(eased * target));
      if (progress < 1) {
        rafRef.current = requestAnimationFrame(animate);
      }
    }

    rafRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(rafRef.current);
  }, [target, duration]);

  return val;
}
