"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Landing visuals render finished and animate from first paint (pure CSS, no JS needed).
 * This hook only holds a visual in its "before" state when it starts off screen, so the
 * animation is still there when the visitor scrolls to it. Anything already on screen
 * (desktop hero, arriving via #how) is never hidden.
 */
export function useWaitUntilSeen<T extends Element>(threshold: number) {
  const ref = useRef<T>(null);
  const [waiting, setWaiting] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let first = true;
    const io = new IntersectionObserver(
      ([e]) => {
        if (first) {
          first = false;
          if (e.isIntersecting) io.disconnect();
          else setWaiting(true);
          return;
        }
        if (e.isIntersecting && e.intersectionRatio >= threshold) {
          setWaiting(false);
          io.disconnect();
        }
      },
      { threshold: [0, threshold] },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [threshold]);
  return [ref, waiting] as const;
}
