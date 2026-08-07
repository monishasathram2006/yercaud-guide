import { useEffect, useRef, useState } from "react";

/**
 * Counts up from 0 to `value` once triggered — `requestAnimationFrame`-driven
 * rather than an interval, so it stays smooth regardless of frame rate.
 * Passing `0` as `value` (see AnimatedNumber below) holds the display at 0
 * without starting the animation.
 */
function useCountUp(value: number, durationMs = 900): number {
  const [display, setDisplay] = useState(0);
  const frame = useRef<number>(0);

  useEffect(() => {
    const start = performance.now();
    function tick(now: number) {
      const progress = Math.min((now - start) / durationMs, 1);
      setDisplay(progress * value);
      if (progress < 1) frame.current = requestAnimationFrame(tick);
    }
    frame.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame.current);
  }, [value, durationMs]);

  return display;
}

/**
 * Counts up from 0 to `value` the moment this element scrolls into view,
 * not on mount — the stat tiles sit near the bottom of the home page, so
 * animating on mount finishes long before a visitor scrolls down far enough
 * to actually see it, which just looks like a static number. Animates once;
 * scrolling it out and back in doesn't replay it.
 */
export function AnimatedNumber({
  value,
  decimals = 0,
  suffix = "",
}: {
  value: number;
  decimals?: number;
  suffix?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setInView(true);
          observer.disconnect();
        }
      },
      { threshold: 0.3 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const display = useCountUp(inView ? value : 0);
  return (
    <span ref={ref}>
      {display.toFixed(decimals)}
      {suffix}
    </span>
  );
}
