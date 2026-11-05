/**
 * The guided tour's logic, free of the page so it can be tested (components/dashboard/GuidedTour.tsx draws it).
 * Each step points at one element marked data-tour="<step>". A step whose element is missing or hidden is skipped, so
 * a redesign or a phone layout can drop a step but never leave the tour stuck or pointing at nothing.
 */

export const TOUR_STEPS = ["certs", "courses", "lectures", "ring", "date", "tabs", "upload"] as const;
export type TourStep = (typeof TOUR_STEPS)[number];

export const tourSelector = (step: TourStep) => `[data-tour="${step}"]`;

/** The link in the footer: opens the dashboard with the tour running */
export const TOUR_REOPEN_HREF = "/dashboard?tour=1";

/**
 * Starts by itself once: for an account that has not seen it and has no certificates yet, so people already using
 * Medserti when this ships are left alone. The shared demo account cannot save that it saw it, so it never starts alone.
 */
export const shouldAutoStart = (a: { seenAt?: string | null; certificates: number; demo: boolean }) =>
  !a.demo && !a.seenAt && a.certificates === 0;

/** Laid out and painted: what the tour can point at */
export function isShown(box: { width: number; height: number }, style: { display: string; visibility: string; opacity?: string }) {
  if (box.width <= 0 || box.height <= 0) return false;
  if (style.display === "none" || style.visibility === "hidden" || style.visibility === "collapse") return false;
  return style.opacity !== "0";
}

/** The steps that can run now, in order. Empty: nothing to show, the tour does not open. */
export const availableSteps = (steps: readonly TourStep[], shown: (s: TourStep) => boolean) => steps.filter(shown);

/** The nearest step in that direction whose element is still there; null when there is none (forward: the tour ends) */
export function nextIndex(list: readonly TourStep[], from: number, dir: 1 | -1, shown: (s: TourStep) => boolean): number | null {
  for (let i = from + dir; i >= 0 && i < list.length; i += dir) if (shown(list[i])) return i;
  return null;
}

export type Box = { top: number; left: number; width: number; height: number };
export type Placement = { top: number; left: number; side: "left" | "right" | "above" | "below"; arrowAt: number };

const GAP = 18;
const EDGE = 12;
/** Taller than this it is a tile: the bubble goes beside it, not over the part it explains */
const TALL = 200;

/** Where the bubble sits next to the element: always fully inside the screen */
export function placeBubble(t: Box, size: { w: number; h: number }, view: { w: number; h: number }): Placement {
  const fitsRight = t.left + t.width + GAP + size.w <= view.w - EDGE;
  const fitsLeft = t.left - GAP - size.w >= EDGE;
  const fitsBelow = t.top + t.height + GAP + size.h <= view.h - EDGE;
  const fitsAbove = t.top - GAP - size.h >= EDGE;
  const inY = (y: number) => Math.max(EDGE, Math.min(y, view.h - size.h - EDGE));
  const inX = (x: number) => Math.max(EDGE, Math.min(x, view.w - size.w - EDGE));
  const beside = (side: "left" | "right"): Placement => {
    const top = inY(t.top + 28);
    return { side, top, left: inX(side === "right" ? t.left + t.width + GAP : t.left - GAP - size.w), arrowAt: Math.max(24, Math.min(t.top + 56 - top, size.h - 24)) };
  };
  const stacked = (side: "above" | "below"): Placement => {
    const left = inX(t.left + t.width / 2 - size.w / 2);
    return { side, left, top: inY(side === "below" ? t.top + t.height + GAP : t.top - GAP - size.h), arrowAt: Math.max(24, Math.min(t.left + t.width / 2 - left, size.w - 24)) };
  };
  if (t.height > TALL) return fitsRight ? beside("right") : fitsLeft ? beside("left") : fitsBelow ? stacked("below") : stacked("above");
  return fitsBelow ? stacked("below") : fitsAbove ? stacked("above") : fitsRight ? beside("right") : beside("left");
}

/** How far the page should scroll so the element sits in the free part of the screen (a phone's bubble takes the bottom) */
export function scrollTopFor(t: Box, scrollY: number, viewH: number, reservedBottom: number): number {
  const free = viewH - reservedBottom;
  const offset = t.height + 2 * EDGE >= free ? t.top - 2 * EDGE : t.top - (free - t.height) / 2;
  return Math.max(0, scrollY + offset);
}
