// Moonrise / moonset chips inside the plot (review 24 Nov rounds 4–5).
//
// Placement laws, in the order they are applied — each one exists because the
// reviewer hit the failure mode it prevents:
//   1. a chip hugs its crossing point with a ~30-minute gap from the closest
//      edge (30 min ≈ 19 px at this frame width; the old fixed 100 px ≈ 2.6 h
//      was far too loose for the set chip);
//   2. it sits OUTSIDE the moon curve by default — rise chip to the LEFT of
//      the rise, set chip to the RIGHT of the set, over the flat parts;
//   3. when that outside spot would spill past the plot it is CLAMPED to the
//      plot edge and keeps its outside side. Round 5: it no longer jumps
//      inside just because the edge squeezed it — the reviewer wants the rise
//      chip to the left of the curve even on a night whose moonrise is barely
//      an hour into the frame;
//   4. it flips inside only when the curve genuinely runs THROUGH the box —
//      measured geometrically against the drawn arc at the chip's own altitude,
//      and only once it is more than FLIP_DEPTH px inside, so grazing the
//      corner of the arc does not trigger a jump;
//   5. two chips must never sit on top of each other.
//
// Round 5 also lifted the chips: the BOTTOM of the box sits at CHIP_ALT degrees
// altitude, not on the horizon, which is what frees the horizontal room rule 3
// relies on (the arc has usually climbed past that height by the time it is
// under the box).
//
// Slots are FIXED by construction, so there is no measure-and-settle loop and
// nothing can jitter between renders.

import type { NightPayload } from "@/lib/types";
import { hhmmUtc } from "./clock";
import { DAY_SEC, M_LEFT, PLOT_W, xOf, yOf, type Frame } from "./geom";
import { LABEL_CH } from "./labels";

/** Chip height, and the label→width estimate used everywhere in the plot. */
export const CHIP_H = 16;
/** Altitude of the BOTTOM edge of a chip box (review 24 Nov round 5). */
export const CHIP_ALT = 10;
/** How deep the drawn arc may cut into a chip box before it flips sides. */
export const FLIP_DEPTH = 12;
export const chipWidth = (label: string) => label.length * LABEL_CH + 10;

export interface MoonChip {
  key: string;
  label: string;
  /** x of the crossing point (leader target, and the dot on the curve). */
  x: number;
  /** Chip box. */
  bx: number;
  by: number;
  w: number;
  h: number;
  /** Where the leader leaves the chip: the box edge nearest the crossing. */
  lx: number;
}

/** Points along the DRAWN arc (altitude > 0, inside the frame), densified so a
 *  straight run between two 10-minute samples cannot slip between the probes. */
function arcPointsOfChipTest(payload: NightPayload, f: Frame): { x: number; y: number }[] {
  const raw = payload.moon.samples
    .map((s) => ({ sec: Date.parse(s.time) / 1000, alt: s.altitude }))
    .filter((s) => s.alt > 0 && s.sec >= f.noonW && s.sec <= f.noonEndW);
  const out: { x: number; y: number }[] = [];
  for (let i = 0; i < raw.length; i++) {
    if (i > 0) {
      for (const t of [0.25, 0.5, 0.75]) {
        const a = raw[i - 1], b = raw[i];
        out.push({ x: xOf(f, a.sec + (b.sec - a.sec) * t), y: yOf(a.alt + (b.alt - a.alt) * t) });
      }
    }
    out.push({ x: xOf(f, raw[i].sec), y: yOf(raw[i].alt) });
  }
  return out;
}

export function moonChipsOf(payload: NightPayload, f: Frame): MoonChip[] {
  const events: { sec: number; kind: "rise" | "set" }[] = [];
  for (const key of ["moonrise", "moonset"] as const) {
    for (const iso of payload.moon[key]) {
      const s = Date.parse(iso) / 1000;
      if (s >= f.noonW && s <= f.noonEndW) events.push({ sec: s, kind: key === "moonrise" ? "rise" : "set" });
    }
  }
  events.sort((a, b) => a.sec - b.sec);

  const GAP_SEC = 30 * 60;                 // requested gap from the crossing point
  const GAP_PX = GAP_SEC * (PLOT_W / DAY_SEC);
  const arc = arcPointsOfChipTest(payload, f);
  const by = yOf(CHIP_ALT) - CHIP_H;       // box BOTTOM at CHIP_ALT degrees
  const h = CHIP_H;

  /** How far (px) the drawn arc cuts into a candidate box, 0 if it misses. */
  const intrusion = (bx: number, w: number): number => {
    let deep = 0;
    for (const p of arc) {
      if (p.y < by || p.y > by + h) continue;
      if (p.x < bx || p.x > bx + w) continue;
      deep = Math.max(deep, Math.min(p.x - bx, bx + w - p.x));
    }
    return deep;
  };

  const LMIN = M_LEFT + 4, LMAX = M_LEFT + PLOT_W - 4;
  const chips = events.map((e, i) => {
    // Round 6 put the zone on the chips; round 7 (24 Nov) took it back off —
    // the suffix cluttered the chart and the scale is named once in the header.
    const label = `${e.kind} ${hhmmUtc(e.sec)}`;
    const w = chipWidth(label);
    const x = xOf(f, e.sec);
    let bx: number;
    if (e.kind === "rise") {
      // Prefer OUTSIDE: chip's RIGHT edge sits GAP_SEC before the rise; a
      // squeezed box clamps to the plot edge and stays on the outside side.
      bx = Math.max(x - w - GAP_PX, LMIN);
      if (intrusion(bx, w) > FLIP_DEPTH) bx = x + GAP_PX; // arc truly through it → inside
    } else {
      // Prefer OUTSIDE: chip's LEFT edge starts GAP_SEC after the set.
      bx = Math.min(x + GAP_PX, LMAX - w);
      if (intrusion(bx, w) > FLIP_DEPTH) bx = x - w - GAP_PX;
    }
    // never spill outside the plot — clamp as a last resort
    bx = Math.min(Math.max(bx, LMIN), LMAX - w);
    return { key: `rs${i}`, label, x, bx, by, w, h, lx: 0 };
  });

  // Anti-overlap pass: if two chips ended up overlapping (both squeezed to the
  // same side), push the later event's chip rightwards past the earlier one;
  // if that spills out, push the earlier one left instead.
  for (let i = 1; i < chips.length; i++) {
    const a = chips[i - 1], c = chips[i];
    if (c.bx < a.bx + a.w + 6 && c.bx < a.bx + c.w) {
      const moved = a.bx + a.w + 6;
      if (moved + c.w <= LMAX) c.bx = moved;
      else a.bx = Math.max(LMIN, c.bx - c.w - 6);
    }
  }
  for (const c of chips) {
    c.lx = c.x < c.bx ? c.bx : c.x > c.bx + c.w ? c.bx + c.w : c.x;
  }
  return chips;
}

/** The dot marking where the moon path reaches the horizon. */
export const crossingDotY = () => yOf(0);
