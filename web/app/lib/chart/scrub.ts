// The scrubbing laws of the live chart (docs/REQUIREMENTS.md §4.1, review
// 23 Nov round 3 / 24 Nov rounds 4–5). Kept as pure functions so the laws are
// unit-testable in isolation — they are the behaviour the reviewer keeps
// probing ("−1 h does nothing", "the day flipped"), and the only way to
// change the displayed night is the header day stepper, never time scrubbing.
//
// Round 5 fixed the focus AXIS: every value here is a real epoch instant, the
// same number line the frame and the payload samples live on. Before that the
// focus was carried as wall-fields-as-UTC, so the thumb, the marker and the
// readout sat one zone-offset right of the scale they were drawn on — and the
// error COMPOUNDED, because React wrote the drifted value back into the slider
// as the starting point of the next drag ("−1 h steps forward", "can't scrub
// left of 14:00"). Wall-clock text is produced at the edges, by clock.ts.

import type { Frame } from "./geom";
import { DAY_SEC } from "./geom";
import { epochAtWall, wallParts } from "./clock";

/** Hard clamp into the fixed noon → noon+1 frame. Scrubbing NEVER changes the
 *  night and NEVER parks at moonset: the thumb spans the whole day. */
export const clampFrame = (sec: number, f: Frame): number =>
  Math.min(Math.max(sec, f.noonW), f.noonEndW);

/** Snap to the MINUTE grid: the clock readout has no seconds, so a scrub
 *  position must always match what the clock shows (review 24 Nov round 4).
 *  Zone offsets are whole minutes, so an epoch minute IS a wall minute. */
export const snapMinute = (sec: number): number => Math.floor(sec / 60) * 60;

/** Slider drag / click on the track: raw slider seconds → the clamped, minute-
 *  snapped instant. Because the slider's min/max are the frame's own edges and
 *  the value stays a real epoch, thumb position and marker position are the
 *  same number — that mapping is what round 5 made exact. */
export const scrubFocus = (rawSec: number, f: Frame): number =>
  snapMinute(clampFrame(rawSec, f));

/** The −1 h / +1 h buttons: move time within the FIXED frame only. At a frame
 *  edge the step simply stops (clamped), it does not wrap and it does not
 *  change the night. Past moonset/rise the moon stays below the horizon and
 *  nothing else happens. */
export function stepHoursFocus(baseSec: number, delta: number, f: Frame): number {
  return clampFrame(Math.round(baseSec + delta * 3600), f);
}

/** A time typed into the header TIME box: wall-clock time on whichever
 *  calendar day the focus currently sits on, folded into this frame if it
 *  belongs to the other half of it — a typed time never flips nights either.
 *  Converted through epochAtWall, so the typed wall time lands exactly where
 *  its own clock says it does. */
export function typedFocus(c: { h: number; m: number; s: number }, focusSecV: number, f: Frame, tz: string): number {
  const day = wallParts(focusSecV * 1000, tz);
  let sec = epochAtWall(day.y, day.mo, day.d, c.h, c.m, c.s, tz);
  if (sec < f.noonW - DAY_SEC / 2) sec += DAY_SEC;
  if (sec > f.noonEndW + DAY_SEC / 2) sec -= DAY_SEC;
  return scrubFocus(sec, f);
}

/** Live focus candidate: observer wall clock at the sampled tick, floored to
 *  its own wall minute, as the REAL instant (NaN before the first tick lands).
 *  It is a genuine instant, so the observer's daylight-saving state is already
 *  inside it — the ZONE box's "+/-1H" nudge (round 5) is gone entirely (round 7). */
export function liveSec(tickMs: number | null, tz: string): number {
  if (tickMs === null) return NaN;
  const p = wallParts(tickMs, tz);
  return epochAtWall(p.y, p.mo, p.d, p.h, p.m, 0, tz);
}

/** The instant the moon glyph + marker follow: the scrubbed focus if any,
 *  otherwise the live clock clamped into the displayed night so the glyph is
 *  always shown. NaN until the first tick has landed and nothing is scrubbed. */
export function focusEpoch(scrubbedSec: number | null, live: number, f: Frame): number {
  if (scrubbedSec !== null) return scrubbedSec;
  if (!Number.isNaN(live)) return clampFrame(live, f);
  return NaN;
}

/** A night change must NOT move the marker (review 24 Nov, round 7, item 5).
 *  Frames are UTC-anchored (round 6) and one night's frame is exactly DAY_SEC
 *  from its neighbour's — across a daylight-saving weekend too — so carrying the
 *  focus by the number of days the frame MOVED leaves the red dashed line, and
 *  the moon sitting on it, at the identical pixel; only the sky around it
 *  changes. That is the flickbook the reviewer is driving at: press ▶ and watch
 *  the Moon walk along the arc at the same clock time, instead of the marker
 *  snapping back to the centre/live clock on every press.
 *
 *  Returns the focus for the incoming night, or `null` meaning "stay on the live
 *  clock": that is the case where the night did not actually change (a lat/lon
 *  or zone edit leaves the same UTC midnight in place) while the user was live.
 *  Otherwise ⏱ live re-arms the clock explicitly, and scrubbing re-arms it by
 *  dragging. Cost: two numbers and a clamp — no extra fetch, the neighbour
 *  payloads are already cached/prefetched (round 5). */
export function carryFocus(prev: Frame, next: Frame, scrubbedSec: number | null, live: number): number | null {
  const deltaDays = Math.round((next.midSec - prev.midSec) / DAY_SEC);
  if (scrubbedSec === null) {
    // Live: keep the SAME position, which means converting it to a scrubbed
    // instant on the new night — the real clock is not inside another night's
    // frame, so leaving it live would park the marker on a frame edge.
    if (deltaDays === 0 || Number.isNaN(live)) return null;
    return scrubFocus(clampFrame(live, prev) + deltaDays * DAY_SEC, next);
  }
  return scrubFocus(scrubbedSec + deltaDays * DAY_SEC, next);
}

export const inFrameOf = (sec: number, f: Frame) =>
  !Number.isNaN(sec) && sec >= f.noonW && sec <= f.noonEndW;
