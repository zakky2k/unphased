// How far ahead of the night on screen the app buys payloads (review 24 Nov,
// round 10). A night is ~54 KB of astropy output and costs the API 1–2 s to
// compute, while DRAWING it from a payload costs about a millisecond — so
// "pre-render ±10 nights" in practice means pre-COMPUTING the twenty neighbours
// while the browser is idle and letting the stepper paint them from memory.
//
// The window is walked NEAREST FIRST and ONE JOB AT A TIME. Nearest first,
// because the next press is overwhelmingly one night away. One at a time, because
// the API computes under the GIL: measured against it, a single night costs about
// 1.1 s while two in parallel each take about 2.1 s — no throughput gained, and a
// reader who presses the stepper in the middle of the window would have queued
// behind two running jobs instead of one. When a new night is shown the walk
// restarts from THAT night, so the window follows the reader through the calendar
// instead of being paid for once at boot — which is also what makes a long flick
// cheap: the nights you land on were already fetched. Filling the whole 20-night
// window costs about 30 s of background time here (measured: 1.0–2.4 s a night,
// the first few slower while the machine is still busy); the ±1 neighbours land
// within a few seconds of the night they hang off.

export const PREFETCH_RADIUS = 10;

/** Payload cache ceiling: the whole window (2·radius + 1) with room for a jump
 *  or a second site's window, so a window is never evicted by its own prefetch. */
export const CACHE_LIMIT = 2 * PREFETCH_RADIUS + 28;

/** Offsets from the shown night, nearest first: +1, −1, +2, −2, … ±radius.
 *  The shown night itself (0) is never in the list. */
export function prefetchOffsets(radius: number = PREFETCH_RADIUS): number[] {
  return Array.from({ length: Math.max(0, radius) }, (_, i) => i + 1).flatMap((d) => [d, -d]);
}
