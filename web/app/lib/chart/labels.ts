// Text layout for the live chart: the 45° transition timestamps below the
// horizon, the fixed-scale time labels at the corners of the plot, the
// moonrise/moonset chips, and the header line. All of it is pure
// string/number work so the labelling laws stay testable:
//   • every transition reads "HH:MM word" at its exact x, angled under the
//     plot and never inside it;
//   • dusk-side labels run up-right into their line, dawn-side mirror;
//   • one colour for all chart text (the bright ink) — sunset/sunrise match
//     the civil/nautical labels (review 23 Nov round 3, 24 Nov round 4);
//   • review 24 Nov round 5: every CLOCK printed on the chart is on the UTC
//     scale; review 24 Nov round 7 removed the "UTC" SUFFIX from every printed
//     clock (it cluttered the chart) and names the scale once instead, in the
//     header's LOCAL TIME label: "LOCAL TIME (All chart elements UTC)". One
//     scale everywhere, stated once, still dates naming the observer's night;
//   • review 24 Nov round 9: a fixed-scale clock reads its TIME first, then the
//     day and date — "12:00 Tue 24" — and the corner cells keep only the two
//     daylight lines that tie them to the axis: no inner wall, no bottom wall, no
//     background behind the text.

import type { NightPayload } from "@/lib/types";
import { hhmmUtc, dayOfWeek, monthOf, utcDayStamp } from "./clock";
import { FLOOR_Y, M_LEFT, M_TOP, PLOT_W, xOf, type Frame } from "./geom";

export const LABEL_FS = 12; // transition + chip + axis font size (was 9)
export const LABEL_CH = 7.4; // average glyph advance at LABEL_FS (Inter/Segoe UI)
export const TIP_FS = 11;    // tooltip font size
/** Tooltip box: average glyph advance at TIP_FS plus padding. */
export const tipWidth = (label: string) => label.length * 7 + 14;

/** Official transition times inside this night, with the word the reviewer
 *  asked for. Shortened band words keep the tight twilight sequence
 *  collision-free at the 45° angle. */
export interface TransitionLabel {
  key: string;
  /** x of the transition itself (the leader's far end). */
  x: number;
  /** x of the text anchor: middle of the LAST letter (dusk) or FIRST letter
   *  (dawn), which is where the leader meets the text. */
  ax: number;
  anchorY: number;
  label: string;
  rot: number;
  textAnchor: "end" | "start";
}

const BAND_WORD: Record<string, string> = { civil: "civil", nautical: "naut.", astronomical: "astro." };

/** Corner day-time labels hang BELOW the axis, at the axis corners (review 24 Nov,
 *  round 7; refined round 9): the x axis itself is the cell's top side and the
 *  y-axis extension is its OUTER side — those two are drawn, and nothing else.
 *  The inner wall, the bottom wall and the tinted background inside the cell were
 *  removed on review: the clock is not a boxed widget, it is the axis corner
 *  extended downwards, so only the two daylight lines that tie it to the axis and
 *  to the daylight at that end of the frame are drawn. AXIS_TICK_DOWN is both how
 *  far the axis extends below the horizon and the height of the cell. */
export const AXIS_TICK_DOWN = 20;
export const AXIS_BOX_TOP = FLOOR_Y + 1;
export const AXIS_BOX_PAD = 6;
/** Text baseline inside the corner box. */
export const AXIS_CORNER_Y = AXIS_BOX_TOP + 15;
/** The focus marker's own chip rides above the horizon, inside the plot. */
export const AXIS_NOW_Y = FLOOR_Y - 36;

/** The 45° transition strip starts BELOW the corner label boxes (round 7), so a
 *  corner clock and a transition clock can never touch at any site, whatever
 *  transitions happen to fall near an edge of the frame. */
export const TRANSITION_Y = AXIS_BOX_TOP + AXIS_TICK_DOWN + 13;

export function transitionLabelsOf(payload: NightPayload, f: Frame, tz: string): TransitionLabel[] {
  // The leader tracks the transition's own timestamp; the printed clock reads
  // the night's start/end, exactly as reviewed. Round 5: the printed clocks are
  // on the chart's UTC scale; round 7 dropped the "UTC" suffix.
  const items: { sec: number; label: string; side: "dusk" | "dawn" }[] = [
    {
      sec: Date.parse(payload.sun.sunset) / 1000,
      label: `${hhmmUtc(Date.parse(payload.nightStart) / 1000)} sunset`,
      side: "dusk",
    },
  ];
  for (const e of payload.sun.events) {
    const s = Date.parse(e.time) / 1000;
    if (s <= f.noonW || s >= f.noonEndW) continue;
    items.push({ sec: s, label: `${hhmmUtc(s)} ${e.band}`, side: e.edge === "start" ? "dusk" : "dawn" });
  }
  items.push({
    sec: Date.parse(payload.sun.sunrise) / 1000,
    label: `${hhmmUtc(Date.parse(payload.nightEnd) / 1000)} sunrise`,
    side: "dawn",
  });

  const anchorY = TRANSITION_Y; // below the corner label boxes, under the horizon strip
  return items
    .filter((t) => t.sec > f.noonW && t.sec < f.noonEndW)
    .map((t, i) => {
      let label = t.label;
      for (const [full, short] of Object.entries(BAND_WORD)) label = label.replace(full, short);
      const x = xOf(f, t.sec);
      // Dusk: text runs up-right and ENDS at its line — first letter low-left,
      // last letter's middle at (x - CH/2, anchorY).
      // Dawn: mirrored — text starts at its line running down-right, so the
      // FIRST letter hugs the transition, its middle at (x + CH/2, anchorY).
      return t.side === "dusk"
        ? { key: `tr${i}`, x, ax: x - LABEL_CH / 2, anchorY, label, rot: -45, textAnchor: "end" as const }
        : { key: `tr${i}`, x, ax: x + LABEL_CH / 2, anchorY, label, rot: 45, textAnchor: "start" as const };
    });
}

/** Fixed-scale time labels on the x axis (review 24 Nov round 5 wording, round 6
 *  anchor; round 7 moved the corners BELOW the axis and dropped every "UTC"
 *  suffix; round 9 put the TIME first, then the day and date, and stripped the
 *  corner cells back to their two daylight lines). Since the frame is anchored to
 *  UTC, all three anchors are exact, immovable clocks:
 *    • left  = 12:00 UTC    "12:00 Mon 23"  (left justified at the left corner)
 *    • right = 12:00 UTC+1  "12:00 Tue 24"  (right justified at the right corner)
 *    • top centre = 00:00   "00:00 Tue 24 Nov"
 *  Time first, everywhere, because the clock — not the date — is what the chart
 *  is read against; the day/date only says which night that 12:00 belongs to. The
 *  caller draws each corner cell with TWO lines only: its top side IS the x axis,
 *  its outer side IS the extension of the y axis, both in the daylight strip's
 *  colour, so the label is visibly tied to the daylight at that end of the chart.
 *  Dates come from the frame instants themselves, so a night spanning a month or
 *  year boundary prints the right day. All three render in the same style as the
 *  transition text. */
export interface AxisLabel {
  key: string;
  x: number;
  y: number;
  label: string;
  anchor: "start" | "middle" | "end";
  /** Corner labels only: the cell they sit in, hanging below the axis. The x axis
   *  is its top edge, the plot edge is its outer side — and those are the ONLY two
   *  sides drawn (round 9): no inner wall, no bottom wall, no background. */
  box?: { x: number; y: number; w: number; h: number };
}

/** A box is as wide as its text plus AXIS_BOX_PAD on each side; it starts at the
 *  plot edge so the axis corner is one of its sides. */
export const axisBoxWidth = (label: string): number => label.length * LABEL_CH + 2 * AXIS_BOX_PAD;

export function axisLabelsOf(f: Frame): AxisLabel[] {
  const start = utcDayStamp(f.noonW);
  const end = utcDayStamp(f.noonEndW);
  const mid = utcDayStamp(f.midSec);
  const early = `${hhmmUtc(f.noonW)} ${dayOfWeek(start)} ${start.slice(8, 10)}`;
  const late = `${hhmmUtc(f.noonEndW)} ${dayOfWeek(end)} ${end.slice(8, 10)}`;
  const earlyW = axisBoxWidth(early);
  const lateW = axisBoxWidth(late);
  return [
    {
      key: "ax0",
      x: M_LEFT + AXIS_BOX_PAD,
      y: AXIS_CORNER_Y,
      label: early,
      anchor: "start",
      box: { x: M_LEFT, y: AXIS_BOX_TOP, w: earlyW, h: AXIS_TICK_DOWN },
    },
    {
      key: "ax1",
      x: M_LEFT + PLOT_W - AXIS_BOX_PAD,
      y: AXIS_CORNER_Y,
      label: late,
      anchor: "end",
      box: { x: M_LEFT + PLOT_W - lateW, y: AXIS_BOX_TOP, w: lateW, h: AXIS_TICK_DOWN },
    },
    {
      key: "ax2",
      x: M_LEFT + PLOT_W / 2,
      y: M_TOP - 10,
      label: `${hhmmUtc(f.midSec)} ${dayOfWeek(mid)} ${mid.slice(8, 10)} ${monthOf(mid)}`,
      anchor: "middle",
    },
  ];
}

/** Header line: the local night, with its sun times printed on the chart's UTC
 *  scale so a header number and the axis under it never disagree — with no "UTC"
 *  suffix (round 7: the scale is named once, in the header's LOCAL TIME label).
 *  The weekday + date stay the observer's local calendar day (round 5 also
 *  dropped the old UTC-weekday quirk that made Sydney print "Mon 24 Nov" beside
 *  a Tuesday). */
export function headerTitle(payload: NightPayload): string {
  const sunsetSec = Date.parse(payload.sun.sunset) / 1000;
  const riseSec = Date.parse(payload.sun.sunrise) / 1000;
  return (
    `${payload.location.lat.toFixed(2)}, ${payload.location.lon.toFixed(2)}  ·  ` +
    `${dayOfWeek(payload.nightStart)} ${payload.nightStart.slice(8, 10)} ${monthOf(payload.nightStart)}  ` +
    `${hhmmUtc(sunsetSec)} → ` +
    `${dayOfWeek(payload.nightEnd)} ${payload.nightEnd.slice(8, 10)} ${monthOf(payload.nightEnd)}  ` +
    `${hhmmUtc(riseSec)}`
  );
}
