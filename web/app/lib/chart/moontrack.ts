// The moon's track through the frame: the arc that gets drawn, where the
// glyph sits, and which moonrise the readout should name.
//
// The glyph law, changed in review 24 Nov round 5: the glyph is drawn ONLY
// while the moon is actually above the horizon. Earlier it parked at the
// nearest rise/set crossing whenever the moon was down, which read as the Moon
// "getting stuck at 0 altitude" after it had set (and asymmetrically on the
// morning side). Both sides now behave the same way: the Moon rises and sets
// along its path and simply is not in the sky — and therefore not on the chart
// — until it rises again. The rise/set dot + chip stay drawn, so the crossing
// itself is still marked, and the slider thumb still spans the whole day.
//
// (The old parking law is what §4.1 described until round 5; docs updated with
// this commit. scripts/units.ts pins the new one.)

import type { NightPayload } from "@/lib/types";
import { interp, xOf, yOf, type Frame } from "./geom";

/** Sample series, parsed once from the payload. */
export interface MoonSeries {
  times: number[];
  alts: number[];
  illum: number[];
  /** Rise/set crossings inside the frame — the ends of the drawn arc. */
  trackEvents: number[];
}

export function moonSeriesOf(payload: NightPayload, f: Frame): MoonSeries {
  const samples = payload.moon.samples;
  return {
    times: samples.map((s) => Date.parse(s.time) / 1000),
    alts: samples.map((s) => s.altitude),
    illum: samples.map((s) => s.illumFraction),
    trackEvents: [
      ...payload.moon.moonrise.map((s) => Date.parse(s) / 1000),
      ...payload.moon.moonset.map((s) => Date.parse(s) / 1000),
    ].filter((s) => s >= f.noonW && s <= f.noonEndW),
  };
}

/** The instant the glyph is drawn at: the focus while the moon is up, and
 *  NOTHING while it is down (round 5 — no parking at a rise/set). */
export function glyphSecOf(ms: MoonSeries, focusSec: number, inFrame: boolean): number | null {
  if (!inFrame) return null;
  const alt = interp(ms.times, ms.alts, focusSec);
  return alt !== null && alt > 0 ? focusSec : null;
}

/** The arc the glyph travels: drawn across the FULL frame including daylight
 *  hours (samples clipped only at altitude <= 0), so its rise point is always
 *  visible. Empty string when nothing is above the horizon. */
export function arcPointsOf(ms: MoonSeries, f: Frame): string {
  return ms.times
    .map((s, i) => (ms.alts[i] >= 0 && s >= f.noonW && s <= f.noonEndW ? `${xOf(f, s)},${yOf(ms.alts[i])}` : null))
    .filter(Boolean)
    .join(" ");
}

/** The corresponding moonrise for the readout: the next rise at/after the
 *  focus time within this frame, updated as you scrub; falls back to the last
 *  rise before it. */
export function riseForFocusOf(payload: NightPayload, f: Frame, focusSec: number, inFrame: boolean): number | null {
  if (!inFrame) return null;
  const rises = payload.moon.moonrise.map((s) => Date.parse(s) / 1000);
  const future = rises.filter((s) => s >= focusSec && s <= f.noonEndW);
  if (future.length) return future[0];
  const past = rises.filter((s) => s >= f.noonW && s < focusSec);
  return past.length ? past[past.length - 1] : null;
}
