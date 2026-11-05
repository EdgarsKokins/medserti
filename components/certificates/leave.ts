/**
 * Deleting a row of the certificate list: timing, where focus goes, and how the request and the animation meet.
 * The animation itself is CSS (certificates.module.css, "row delete").
 */

/** in-row delete: the row folds into a small card that drops into a bin where "Dzēst" was, then the gap closes */
export const LEAVE_MS = 560;
/** deleted from the review panel, where the row's bin is not visible: fade, then the gap closes */
export const FADE_MS = 300;
/** room kept above the bin while the row shrinks, for the card to fall from (px) */
export const CARD_ROOM = 40;

export type LeaveKind = "bin" | "fade";

/** one list on the page, in display order: its row ids and whether it is unfolded */
export type Section = { ids: string[]; open: boolean };

/**
 * The row that takes focus when `id` leaves: the next row in the list as it will look without it, else the one before.
 * `before` is the page now, `after` the page once the row is gone: deleting the last row waiting for review unfolds
 * the confirmed ones, so the next row may only become visible after the delete. null: no visible row is left.
 */
export function nextFocusId(before: Section[], after: Section[], id: string): string | null {
  const order = before.flatMap((s) => s.ids);
  const visible = new Set(after.filter((s) => s.open).flatMap((s) => s.ids));
  visible.delete(id);
  const i = order.indexOf(id);
  if (i < 0) return null;
  const next = order.slice(i + 1).find((x) => visible.has(x));
  if (next) return next;
  const prev = order.slice(0, i).reverse().find((x) => visible.has(x));
  return prev ?? null;
}

/**
 * The request and the animation run side by side; the animation never holds the request back.
 * A failure is reported as soon as the request answers, so the row can come back at once;
 * a success waits until the animation has played.
 */
export async function settle(request: Promise<boolean>, played: Promise<void>): Promise<"deleted" | "failed"> {
  if (!(await request)) return "failed";
  await played;
  return "deleted";
}

/** the height the row shrinks to first, so a tall row (phones, the question on its own line) does not leave a gap */
export function stripHeight(rowHeight: number, binCenterFromTop: number): number {
  return Math.min(rowHeight, Math.round(rowHeight - binCenterFromTop + CARD_ROOM));
}
