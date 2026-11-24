// Twilight band layout for the live chart (docs/REQUIREMENTS.md §4.1): the
// vertical gradient bands carry the sun entirely — no extra bars. Boundaries
// come from the payload's official transition times; between two boundaries
// the band is whichever altitude band the sun sits in at the midpoint.
//
// Emission order is preserved (rect, then its left edge line) because that is
// the order the reviewed reference renders in.

import type { NightPayload } from "@/lib/types";
import { bandOf } from "@/lib/palette";
import { ALT_AT, xOf, type Frame } from "./geom";

/** Sun altitude at each transition, nudged to the side the sun is heading so
 *  the boundary sits on the correct side of the threshold.
 *
 *  The payload's official transition times are the authority, but they only
 *  cover the night the payload is anchored to. Round 6 anchored the FRAME to
 *  UTC, so at sites far from UTC the frame also contains the head of the next
 *  night (or the tail of the previous one) and its transitions were never
 *  emitted. Any threshold the sun crosses inside the frame without an official
 *  event therefore gets its boundary from the payload's own altitude samples,
 *  interpolated between the two samples that straddle it — the same instant,
 *  just read off the series instead of the almanac. */
export function boundariesOf(payload: NightPayload, f: Frame, altAt: (sec: number) => number) {
  const boundaries: { sec: number; alt: number }[] = [{ sec: f.noonW, alt: altAt(f.noonW) }];
  const dusk = Date.parse(payload.sun.sunset) / 1000;
  if (dusk > f.noonW && dusk < f.noonEndW) boundaries.push({ sec: dusk, alt: -0.01 });
  for (const e of payload.sun.events) {
    const s = Date.parse(e.time) / 1000;
    if (s <= f.noonW || s >= f.noonEndW) continue;
    const thr = ALT_AT[e.band];
    boundaries.push({ sec: s, alt: e.edge === "start" ? thr + 0.01 : thr - 0.01 });
  }
  const dawn = Date.parse(payload.sun.sunrise) / 1000;
  if (dawn > f.noonW && dawn < f.noonEndW) boundaries.push({ sec: dawn, alt: 0.01 });
  for (const b of sampledCrossings(payload, f)) boundaries.push(b);
  boundaries.push({ sec: f.noonEndW, alt: altAt(f.noonEndW) });
  boundaries.sort((p, q) => p.sec - q.sec);
  return boundaries;
}

/** Threshold crossings of the sun's altitude inside the frame that the payload
 *  has no official event for, found in the altitude samples themselves. */
function sampledCrossings(payload: NightPayload, f: Frame): { sec: number; alt: number }[] {
  const times = payload.sun.series.map((s) => Date.parse(s.time) / 1000);
  const alts = payload.sun.series.map((s) => s.altitude);
  if (times.length < 2) return [];
  const official = [Date.parse(payload.sun.sunset) / 1000, Date.parse(payload.sun.sunrise) / 1000];
  for (const e of payload.sun.events) official.push(Date.parse(e.time) / 1000);
  const thresholds: { name: string; alt: number }[] = [
    { name: "horizon", alt: 0 },
    { name: "civil", alt: ALT_AT.civil },
    { name: "nautical", alt: ALT_AT.nautical },
    { name: "astronomical", alt: ALT_AT.astronomical },
  ];
  const found: { sec: number; alt: number }[] = [];
  for (const t of thresholds) {
    for (let i = 1; i < times.length; i++) {
      if (times[i] <= f.noonW || times[i - 1] >= f.noonEndW) continue;
      const a = alts[i - 1] - t.alt, b = alts[i] - t.alt;
      if (a === 0 || (a > 0) === (b > 0)) continue;
      const span = alts[i] - alts[i - 1];
      const sec = span === 0 ? times[i] : times[i - 1] + ((times[i] - times[i - 1]) * -a) / span;
      if (sec <= f.noonW || sec >= f.noonEndW) continue;
      // The payload's own events win; the samples only fill the gaps they leave.
      if (official.some((s) => Math.abs(s - sec) < 120)) continue;
      // Nudge toward the side the sun is heading, exactly as an official event does.
      found.push({ sec, alt: span > 0 ? t.alt + 0.01 : t.alt - 0.01 });
    }
  }
  return found;
}

/** Paintable items between consecutive boundaries: a flat pale fill above the
 *  horizon, a directional twilight gradient below it, plus the hairline that
 *  separates one twilight band from the next. */
export type BandItem =
  | { kind: "day"; key: string; x: number; w: number }
  | { kind: "band"; key: string; x: number; w: number; band: string; grad: "dusk" | "dawn" }
  | { kind: "edge"; key: string; x: number };

export function bandItemsOf(payload: NightPayload, f: Frame, altAt: (sec: number) => number): BandItem[] {
  const boundaries = boundariesOf(payload, f, altAt);
  const items: BandItem[] = [];
  for (let i = 0; i < boundaries.length - 1; i++) {
    const a = boundaries[i], b = boundaries[i + 1];
    if (b.sec <= a.sec) continue;
    const midB = (a.sec + b.sec) / 2;
    const band = bandOf(altAt(midB));
    // Which way the gradient runs: the SUN's own motion across this segment, not
    // which half of the frame it falls in. Round 6 anchored the frame to UTC, so
    // at far-east sites the night can straddle the frame's centre and a dusk
    // segment can sit right of it — asking the frame would flip the gradient.
    const rising = altAt(Math.min(midB + 900, b.sec)) > altAt(Math.max(midB - 900, a.sec));
    const grad: "dusk" | "dawn" = rising ? "dawn" : "dusk";
    const x = xOf(f, a.sec);
    const w = Math.max(xOf(f, b.sec) - x, 0.5);
    if (band === "civil" && altAt(midB) > 0) {
      // Daylight: paler/brighter than the lightest twilight band, flat fill.
      items.push({ kind: "day", key: `band${i}`, x, w });
    } else {
      items.push({ kind: "band", key: `band${i}`, x, w, band, grad });
      items.push({ kind: "edge", key: `edge${i}`, x });
    }
  }
  return items;
}
