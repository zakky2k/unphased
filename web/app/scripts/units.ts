// Unit gate for the pure chart-law modules under lib/chart. This is where the
// §4.1 chart laws become executable: the frame is anchored to UTC (12:00 UTC →
// 00:00 UTC → 12:00 UTC +1 day, so the printed scale never moves), scrubbing
// NEVER changes the night, the scrub axis is a REAL epoch (round 5), every clock
// has minute resolution, no clock printed on the chart carries a "UTC" suffix —
// the scale is named once, in the header's LOCAL TIME label — the corner clocks
// hang below the axis at the corners (round 7), open on three sides and reading
// their TIME first, "12:00 Tue 24" (round 9), moon chips keep their 30-minute gap,
// their 10° baseline and their outside-the-curve side, the moon glyph is hidden
// while the moon is below the horizon, and the local clock follows
// daylight-saving time on its own because the ±1 h nudge is gone — a law the
// offline ZONE dropdown (round 7 item 4) exists to protect — and changing the
// night carries the focus marker to the same pixel instead of resetting it
// (round 7 item 5), the DARK scheme is red all the way down — box surfaces, the
// Moon's own colour and the inks included (round 8), the corner cells are open and
// read their time first (round 9), and a ±10-night payload window is prefetched
// around whatever night is on screen, nearest first (round 10).
//
// The two render gates cover appearance (parity: NightChart vs the design SVGs;
// golden: LiveNightChart vs its committed token stream). Neither can cover
// wall-clock-dependent behaviour — the live focus and the chip placement both
// depend on the observer zone — so those laws are asserted here.
//
// Run (from web/app):
//   npx.cmd tsc -p tsconfig.gates.json
//   node.exe scripts\fix-aliases.mjs .gates-build
//   node.exe .gates-build\scripts\units.js
// Style follows planner/tests/test_night.py: hand-rolled check(), no runner.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  ALT_AT, DAY_SEC, FLOOR_Y, H, M_LEFT, M_TOP, PLOT_H, PLOT_W, W, Y_TOP,
  altOfY, frameOf, gridAlts, interp, isMajorGrid, secOfX, shiftIsoDay, xOf, yOf,
  type Frame,
} from "../lib/chart/geom.js";
import {
  dayOfWeek, epochAtWall, fmtClock, focusAt, focusSec, hhmm, hhmmUtc, monthOf, parseClock, utcDayStamp,
} from "../lib/chart/clock.js";
import {
  AXIS_BOX_PAD, AXIS_BOX_TOP, AXIS_CORNER_Y, AXIS_TICK_DOWN, TRANSITION_Y,
  axisBoxWidth, axisLabelsOf, headerTitle, transitionLabelsOf,
} from "../lib/chart/labels.js";
import {
  clampFrame, carryFocus, focusEpoch, inFrameOf, liveSec, scrubFocus, snapMinute, stepHoursFocus, typedFocus,
} from "../lib/chart/scrub.js";
import { CACHE_LIMIT, PREFETCH_RADIUS, prefetchOffsets } from "../lib/chart/prefetch.js";
import { shiftDate } from "../lib/settings.js";
import { BANDS, BANDS_RED, CURVE, CURVE_RED, DAY_FILL, DAY_FILL_RED, INK, INK_BRIGHT, INK_BRIGHT_RED, INK_RED, PAGE_BG, PAGE_BG_RED, bandOf, curveOf } from "../lib/palette.js";
import { bandItemsOf, boundariesOf } from "../lib/chart/sunbands.js";
import { CHIP_ALT, moonChipsOf } from "../lib/chart/moonchips.js";
import { arcPointsOf, glyphSecOf, moonSeriesOf, riseForFocusOf } from "../lib/chart/moontrack.js";
import {
  ZONE_TABLE, formatZoneOffset, isKnownZone, nearestZone, zoneOffsetMinutes, zoneOptions,
} from "../lib/chart/timezones.js";
import type { NightPayload } from "../lib/types.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..");
const load = (name: string): NightPayload =>
  JSON.parse(readFileSync(join(root, "design", "output", `night-${name}.json`), "utf8")) as NightPayload;
const payloads = ["prague", "summer", "sydney"].map(load);

let pass = 0;
const fails: string[] = [];
const check = (name: string, ok: boolean) => { if (ok) pass++; else fails.push(name); };
const near = (a: number, b: number, eps = 1e-6) => Math.abs(a - b) <= eps;
const wall = (sec: number, tz: string) => { const f = focusAt(sec, tz); return `${f.y}/${f.mo}/${f.d} ${f.h}:${f.mi}`; };
const sunTimes = (p: NightPayload) => p.sun.series.map((s) => Date.parse(s.time) / 1000);
const sunAlts = (p: NightPayload) => p.sun.series.map((s) => s.altitude);
const altAtOf = (p: NightPayload) => (sec: number) => interp(sunTimes(p), sunAlts(p), sec) ?? -90;
const crossings = (p: NightPayload, f: Frame) => [
  ...p.moon.moonrise.map((s) => ({ sec: Date.parse(s) / 1000, kind: "rise" })),
  ...p.moon.moonset.map((s) => ({ sec: Date.parse(s) / 1000, kind: "set" })),
].filter((e) => e.sec >= f.noonW && e.sec <= f.noonEndW).sort((a, b) => a.sec - b.sec);

// ---- geometry constants (§4.1): 980x600, plot 900x410 at (56,40) ---------
check("plot box is 900x410 at (56,40)", PLOT_W === 900 && PLOT_H === 410 && M_LEFT === 56 && M_TOP === 40 && W === 980 && H === 600);
check("one hour spans exactly 37.5 px", near((PLOT_W * 3600) / DAY_SEC, 37.5));
check("the horizon sits at the bottom of the plot (FLOOR_Y = M_TOP + PLOT_H = 450)", FLOOR_Y === M_TOP + PLOT_H && FLOOR_Y === 450 && near(yOf(0), FLOOR_Y));
check("the scale tops out at M_TOP", near(yOf(Y_TOP), M_TOP));
check("everything below the horizon shares the floor", near(yOf(-20), FLOOR_Y) && near(yOf(-90), FLOOR_Y));
check("altOfY inverts yOf at and above the horizon", near(altOfY(yOf(45)), 45) && near(altOfY(FLOOR_Y), 0));
check("gridlines every 10 degrees, 0 to 90", gridAlts().join() === "0,10,20,30,40,50,60,70,80,90");
check("every third gridline is major", [0, 30, 60, 90].every(isMajorGrid) && ![10, 20, 40].some(isMajorGrid));
check("interp is null outside the samples", interp([0, 10], [1, 3], -1) === null && interp([0, 10], [1, 3], 11) === null);
check("interp is exact at a node, linear between", interp([0, 10], [1, 3], 10) === 3 && interp([0, 10], [1, 3], 5) === 2);
check("twilight thresholds are -6 / -12 / -18", ALT_AT.civil === -6 && ALT_AT.nautical === -12 && ALT_AT.astronomical === -18);

// ---- the frame: 12:00 UTC → 00:00 UTC → 12:00 UTC +1 day, fixed -------------
// Round 6 anchored the printed scale to UTC instead of to the observer's clock:
// payload.frameNoon (local noon) picks WHICH night, and the centre is the UTC
// midnight nearest that night's local midnight. The reviewer's reason: the corner
// and centre clocks then never move from one night to the next, so nights can be
// compared and flicked through side by side.
for (const p of payloads) {
  const tz = p.location.tz, f = frameOf(p);
  check(`${tz}: the left edge is 12:00 UTC and the right edge is 12:00 UTC +1 day`,
    hhmmUtc(f.noonW) === "12:00" && hhmmUtc(f.noonEndW) === "12:00" && f.noonEndW - f.noonW === DAY_SEC);
  check(`${tz}: the centre is exactly 00:00 UTC — a real UTC day boundary`,
    f.midSec % DAY_SEC === 0 && hhmmUtc(f.midSec) === "00:00" && focusAt(f.midSec, "UTC").h === 0);
  check(`${tz}: centre is half a day from each edge`, near(f.midSec - f.noonW, DAY_SEC / 2) && near(f.noonEndW - f.midSec, DAY_SEC / 2));
  check(`${tz}: the centre is the UTC midnight nearest this night's LOCAL midnight`,
    Math.abs(f.midSec - (Date.parse(p.frameNoon) / 1000 + DAY_SEC / 2)) <= DAY_SEC / 2);
  check(`${tz}: the edges map to the plot box`, near(xOf(f, f.noonW), M_LEFT) && near(xOf(f, f.noonEndW), M_LEFT + PLOT_W));
  check(`${tz}: secOfX inverts xOf`, near(secOfX(f, xOf(f, f.midSec + 4321)), f.midSec + 4321, 1e-9));
  check(`${tz}: the centre is the plot centre`, near(xOf(f, f.midSec), M_LEFT + PLOT_W / 2));
  check(`${tz}: shiftIsoDay still keeps the local clock (DST-safe day shift)`, focusAt(shiftIsoDay(p.frameNoon, 1), tz).h === 12);
}
check("the axis clocks are identical from night to night at one site", (() => {
  const clocks = (p: NightPayload) => axisLabelsOf(frameOf(p)).map((l) => /(\d\d:\d\d)/.exec(l.label)?.[1]);
  const a = clocks(load("prague")), b = clocks(load("summer"));   // same zone, five months apart
  return JSON.stringify(a) === JSON.stringify(["12:00", "12:00", "00:00"]) && JSON.stringify(a) === JSON.stringify(b);
})());

// ---- the axis labels the reviewer asked for (round 5 item A1, round 6 layout)
for (const p of payloads) {
  const f = frameOf(p), ax = axisLabelsOf(f);
  const b0 = ax[0].box, b1 = ax[1].box;
  check(`${p.location.tz}: three axis labels — two corners and the centre`, ax.length === 3);
  check(`${p.location.tz}: both corner clocks have a box, the centre one does not`,
    b0 !== undefined && b1 !== undefined && ax[2].box === undefined);
  check(`${p.location.tz}: the early time is left justified in a cell at the left corner`,
    ax[0].anchor === "start" && /^(12:00 \w{3} \d\d)$/.test(ax[0].label)
    && b0 !== undefined && b0.x === M_LEFT
    && ax[0].x === M_LEFT + AXIS_BOX_PAD && b0.w === axisBoxWidth(ax[0].label));
  check(`${p.location.tz}: the later time is right justified in a cell at the right corner`,
    ax[1].anchor === "end" && /^(12:00 \w{3} \d\d)$/.test(ax[1].label)
    && b1 !== undefined && b1.x + b1.w === M_LEFT + PLOT_W
    && ax[1].x === M_LEFT + PLOT_W - AXIS_BOX_PAD);
  check(`${p.location.tz}: every fixed-scale clock reads its TIME first, then day and date (round 9)`,
    ax[0].label.startsWith(`${hhmmUtc(f.noonW)} `) && ax[1].label.startsWith(`${hhmmUtc(f.noonEndW)} `)
    && ax[2].label.startsWith(`${hhmmUtc(f.midSec)} `) && !ax[2].label.includes(" · ")
    && ax[2].label.endsWith(monthOf(utcDayStamp(f.midSec))));
  check(`${p.location.tz}: the corner dates are the UTC dates of the edges they sit on`,
    ax[0].label.endsWith(`${dayOfWeek(utcDayStamp(f.noonW))} ${utcDayStamp(f.noonW).slice(8, 10)}`)
      && ax[1].label.endsWith(`${dayOfWeek(utcDayStamp(f.noonEndW))} ${utcDayStamp(f.noonEndW).slice(8, 10)}`));
  check(`${p.location.tz}: the corner labels hang BELOW the axis, inside their boxes`,
    ax[0].y === ax[1].y && ax[0].y === AXIS_CORNER_Y && ax[0].y > FLOOR_Y
    && b0 !== undefined && b0.y === AXIS_BOX_TOP && b0.y === FLOOR_Y + 1
    && b0.h === AXIS_TICK_DOWN && ax[0].y < b0.y + b0.h
    && b0.y + b0.h < H);
  check(`${p.location.tz}: the boxes open upward onto the x axis, so the axis is their top side`,
    AXIS_BOX_TOP === FLOOR_Y + 1 && AXIS_TICK_DOWN > 0);
  check(`${p.location.tz}: the 45° transition strip starts below the boxes, so the two can never collide`,
    TRANSITION_Y === AXIS_BOX_TOP + AXIS_TICK_DOWN + 13
    && TRANSITION_Y - (AXIS_BOX_TOP + AXIS_TICK_DOWN) >= 12
    && transitionLabelsOf(p, f, p.location.tz).every((t) => t.anchorY === TRANSITION_Y));
  check(`${p.location.tz}: the centre label is the plot centre and reads 00:00 first`,
    ax[2].anchor === "middle" && ax[2].x === M_LEFT + PLOT_W / 2 && ax[2].label.startsWith("00:00 "));
  check(`${p.location.tz}: no clock printed on the chart carries a UTC suffix (round 7)`,
    axisLabelsOf(f).every((l) => !l.label.includes("UTC"))
    && transitionLabelsOf(p, f, p.location.tz).every((t) => !t.label.includes("UTC"))
    && !headerTitle(p).includes("UTC"));
}

// ---- the corner cells are OPEN, not boxes (round 9) -----------------------
// A corner clock is the axis corner extended downwards, so it keeps exactly two
// daylight lines: the piece of x axis it hangs from and the y axis running down
// its outer side. The inner wall, the bottom wall and the tinted background were
// removed on review, and this asserts the drawing code has nothing else in it.
check("the corner cells draw two lines and nothing else — no walls, no background", (() => {
  const src = readFileSync(join(root, "web", "app", "components", "night-chart", "LiveNightChart.tsx"), "utf8");
  const open = src.indexOf("{axis.map((a) => (");
  const cell = src.slice(open, src.indexOf("<text", open));
  return open > 0 && cell.length > 0
    && !/<rect/.test(cell) && !/fillOpacity/.test(cell) && !/fill=/.test(cell)
    && (cell.match(/<line /g) ?? []).length === 2
    && /strokeWidth=\{2\}/.test(cell) && /strokeWidth=\{1\}/.test(cell);
})());

// ---- clocks: minute resolution everywhere (review 24 Nov, round 4) -------
for (const p of payloads) {
  const tz = p.location.tz;
  const sec = Date.parse(p.sun.sunset) / 1000;
  check(`${tz}: 24 h clock is HH:MM, no seconds`, /^\d{2}:\d{2}$/.test(fmtClock(sec, tz, false)) && fmtClock(sec, tz, false) === hhmm(sec, tz));
  check(`${tz}: 12 h clock is HH:MM AM/PM, no seconds`, /^\d{2}:\d{2} (AM|PM)$/.test(fmtClock(sec, tz, true)));
  check(`${tz}: 12 h clock stays on the 12-hour face`, /^(0[1-9]|1[0-2]):/.test(fmtClock(sec, tz, true)));
}
check("a real instant round-trips focusAt/focusSec exactly", (() => {
  const s = 1795431600;
  return ["UTC", "Europe/Prague", "Australia/Sydney"].every((tz) => focusSec(focusAt(s, tz), tz) === s);
})());
check("epochAtWall names the instant a wall clock reads (zone + DST)", (() => {
  // 13:00 in Prague on a CET day is 12:00 UTC; the same wall time in Sydney on an
  // AEDT day is 02:00 UTC — eleven hours, the offset the old axis got wrong.
  return epochAtWall(2026, 11, 24, 13, 0, 0, "Europe/Prague") === Date.UTC(2026, 10, 24, 12, 0) / 1000
    && epochAtWall(2026, 11, 24, 13, 0, 0, "Australia/Sydney") === Date.UTC(2026, 10, 24, 2, 0) / 1000;
})());
check("parseClock accepts HH:MM", JSON.stringify(parseClock("16:02")) === JSON.stringify({ h: 16, m: 2, s: 0 }));
check("parseClock accepts h:mm PM", JSON.stringify(parseClock("4:02 PM")) === JSON.stringify({ h: 16, m: 2, s: 0 }));
check("parseClock reads 12:00 AM as midnight and 12:30 PM as noon", parseClock("12:00 AM")?.h === 0 && parseClock("12:30 PM")?.h === 12);
check("parseClock rejects nonsense", [parseClock("25:00"), parseClock("7:5"), parseClock("0:00 PM"), parseClock("")].every((v) => v === null));
check("the LOCAL clock follows summer/winter time by itself (round 7 removed the ±1H nudge)", (() => {
  // Round 5 had a "+/-1H" button in the ZONE box that nudged the Local Time
  // display by whole hours. Round 7 deleted it, the event it fired, the ?tz=±h
  // hook and shiftClock itself — which leaves one law to pin down: the local
  // display is fmtClock(instant, tz, h12) read straight off the IANA zone, so
  // the ZONE owns the daylight-saving switch and the user never has to. The
  // same UTC instant must therefore read one hour LATER on a summer clock than
  // on a winter clock, at both ends of the planet.
  const pragueWinter = Date.UTC(2026, 10, 24, 0, 0) / 1000;   // 24 Nov: CET  = UTC+1
  const pragueSummer = Date.UTC(2026, 5, 24, 0, 0) / 1000;    // 24 Jun: CEST = UTC+2
  const sydneyWinter = Date.UTC(2026, 5, 24, 0, 0) / 1000;    // 24 Jun down under: AEST = UTC+10
  const sydneySummer = Date.UTC(2026, 11, 24, 0, 0) / 1000;   // 24 Dec down under: AEDT = UTC+11
  return hhmm(pragueWinter, "Europe/Prague") === "01:00" && hhmm(pragueSummer, "Europe/Prague") === "02:00"
    && hhmm(sydneyWinter, "Australia/Sydney") === "10:00" && hhmm(sydneySummer, "Australia/Sydney") === "11:00"
    // …while the scale the chart prints stays exactly 00:00 at the centre.
    && hhmmUtc(pragueWinter) === "00:00" && hhmmUtc(pragueSummer) === "00:00"
    && hhmmUtc(sydneyWinter) === "00:00" && hhmmUtc(sydneySummer) === "00:00";
})());

// ---- the ZONE dropdown: offline, named zones, linked to lat/lon -----------
// Round 7 item 4 swapped the free-text ZONE box for a dropdown of real IANA
// zones ordered by the offset each one is USING on the night on screen, with
// the entry picked automatically from the typed lat/lon. Two laws matter here:
// the list must be built from static data plus Intl only (the reviewer asked
// for no external calls), and it must carry NAMED zones, because a bare number
// cannot follow the summer/winter switch item 3 just handed back to the zone.
const zoneSrc = readFileSync(join(root, "web", "app", "lib", "chart", "timezones.ts"), "utf8");
check("the zone catalogue makes no external call (round 7 item 4: offline)", !/\bfetch\s*\(|XMLHttpRequest|https?:\/\//.test(zoneSrc));
check("every ZONE_TABLE entry is a real IANA zone with a sane offset", ZONE_TABLE.length >= 60
  && new Set(ZONE_TABLE.map((z) => z.zone)).size === ZONE_TABLE.length
  && ZONE_TABLE.every((z) => {
    try {
      const m = zoneOffsetMinutes(z.zone, Date.UTC(2026, 5, 21, 12, 0));
      return m >= -12 * 60 && m <= 14 * 60;
    } catch {
      return false;   // Intl rejects anything pytz would reject too
    }
  }));
check("zone options read `Name · UTC±h` and run west→east by live offset", (() => {
  const opts = zoneOptions(Date.UTC(2026, 10, 24, 12, 0));
  const labelOk = opts.every((o) => /^[A-Za-z_/.+-]+ · UTC[+-]\d{1,2}(:\d\d)?$/.test(o.label));
  const sorted = opts.every((o, i) => i === 0 || opts[i - 1].offsetMin <= o.offsetMin);
  const i = opts.findIndex((o) => o.value === "UTC");
  // "Centred on UTC" in practice: UTC is in the list and the list straddles it.
  const centred = i > 0 && i < opts.length - 1 && opts[i].offsetMin === 0
    && opts[0].offsetMin < 0 && opts[opts.length - 1].offsetMin > 0;
  return labelOk && sorted && centred;
})());
check("the dropdown shows the offset the NIGHT uses, not a fixed one", (() => {
  const nov = zoneOptions(Date.UTC(2026, 10, 24, 12, 0));
  const jun = zoneOptions(Date.UTC(2026, 5, 24, 12, 0));
  const of = (opts: ReturnType<typeof zoneOptions>, zone: string) =>
    opts.find((o) => o.value === zone)?.label;
  return of(nov, "Europe/Prague") === "Europe/Prague · UTC+1"
    && of(jun, "Europe/Prague") === "Europe/Prague · UTC+2"
    && of(nov, "Australia/Sydney") === "Australia/Sydney · UTC+11"
    && of(jun, "Australia/Sydney") === "Australia/Sydney · UTC+10";
})());
check("half- and three-quarter-hour zones survive the offset maths", (() => {
  const at = Date.UTC(2026, 10, 24, 12, 0);
  return formatZoneOffset(zoneOffsetMinutes("Asia/Kolkata", at)) === "UTC+5:30"
    && formatZoneOffset(zoneOffsetMinutes("Asia/Kathmandu", at)) === "UTC+5:45"
    && formatZoneOffset(zoneOffsetMinutes("Pacific/Chatham", at)) === "UTC+13:45"
    && formatZoneOffset(zoneOffsetMinutes("Pacific/Marquesas", at)) === "UTC-9:30"
    && formatZoneOffset(0) === "UTC+0" && formatZoneOffset(-330) === "UTC-5:30";
})());
check("the typed location picks the zone over it (round 7 item 4)", (() => {
  // The nearest ANCHOR wins, so a city that is not in the table still resolves
  // to the zone that covers it — the trade-off documented in timezones.ts is
  // that a point right on a border may land on the neighbouring zone.
  const probes: Array<[number, number, string]> = [
    [50.0875, 14.4213, "Europe/Prague"],        // the default site
    [49.19, 16.61, "Europe/Vienna"],            // Brno: nearer Vienna than Prague
    [52.2297, 21.0122, "Europe/Warsaw"],
    [-33.8688, 151.2093, "Australia/Sydney"],
    [40.7128, -74.006, "America/New_York"],
    [-33.4489, -70.6693, "America/Santiago"],
    [27.7172, 85.324, "Asia/Kathmandu"],        // the 45-minute zone
    [64.1836, -51.7214, "America/Nuuk"],        // a zone with only one anchor
    [-77.85, 166.6667, "Antarctica/McMurdo"],   // southern observing sites count
  ];
  return probes.every(([lat, lon, want]) => nearestZone(lat, lon) === want && isKnownZone(want));
})());
check("a junk or open-ocean position never throws and always names a listed zone", nearestZone(NaN, 0) === "UTC"
  && isKnownZone(nearestZone(999, -999)) && isKnownZone(nearestZone(-30, -140))
  // longitude wraps the short way, so a date-line site picks a Pacific zone
  && isKnownZone(nearestZone(1.9, 202.6)) && nearestZone(-90, 0) === nearestZone(-90, 180));
check("a malformed night still yields a full dropdown instead of an empty one", (() => {
  const opts = zoneOptions(Number.NaN);
  return opts.length === ZONE_TABLE.length && opts.every((o) => Number.isFinite(o.offsetMin));
})());

check("a zone saved by an older build keeps its place in the dropdown", (() => {
  const opts = zoneOptions(Date.UTC(2026, 10, 24, 12, 0), "Asia/Tbilisi");
  return opts.some((o) => o.value === "Asia/Tbilisi")
    && opts.every((o, i) => i === 0 || opts[i - 1].offsetMin <= o.offsetMin);
})());

// ---- scrubbing never changes the night, and the axis is the instant -------
// Round 5 rewrote this block: every value the scrubber carries is a real epoch,
// so the thumb, the marker, the readout and the payload samples all live on one
// number line. The checks below are the reviewer's own probes from round 4 —
// "hard left parks at 14:00", "−1 h steps forward", "typed 22:00 shows 01:00".
for (const p of payloads) {
  const tz = p.location.tz, f = frameOf(p);
  const firstDay = utcDayStamp(f.noonW);
  const lastDay = utcDayStamp(f.noonEndW);
  check(`${tz}: clamp holds both edges`, near(clampFrame(f.noonW - 99999, f), f.noonW) && near(clampFrame(f.noonEndW + 99999, f), f.noonEndW));
  const lo = scrubFocus(f.noonW - 7200, f);
  const hi = scrubFocus(f.noonEndW + 7200, f);
  check(`${tz}: scrubbing past the left edge parks at 12:00 UTC of the same night`, near(lo, f.noonW) && hhmmUtc(lo) === "12:00" && utcDayStamp(lo) === firstDay);
  check(`${tz}: scrubbing past the right edge parks at 12:00 UTC of the same night`, near(hi, f.noonEndW) && hhmmUtc(hi) === "12:00" && utcDayStamp(hi) === lastDay);
  check(`${tz}: the thumb reaches the very left edge and stays inside`, inFrameOf(scrubFocus(f.noonW, f), f) && inFrameOf(scrubFocus(f.noonEndW, f), f));
  check(`${tz}: snapMinute lands on the minute grid`, near(snapMinute(f.noonW + 40007.9) % 60, 0) && snapMinute(f.noonW) === f.noonW);
  const mid = scrubFocus(f.noonW + 40007, f);
  check(`${tz}: a scrub has no seconds and matches its clock`, mid % 60 === 0 && fmtClock(mid, tz, false) === hhmm(mid, tz));
  // −1 h / +1 h at the edges: they stop, they never flip the night.
  const back = stepHoursFocus(f.noonW, -1, f);
  const fwd = stepHoursFocus(f.noonEndW, +1, f);
  check(`${tz}: −1 h at the left edge stays parked on 12:00 UTC`, near(back, f.noonW) && hhmmUtc(back) === "12:00" && utcDayStamp(back) === firstDay);
  check(`${tz}: +1 h at the right edge stays parked on 12:00 UTC +1 day`, near(fwd, f.noonEndW) && hhmmUtc(fwd) === "12:00" && utcDayStamp(fwd) === lastDay);
  const from = f.noonW + 40000;
  const one = stepHoursFocus(from, -1, f), two = stepHoursFocus(from, +1, f);
  check(`${tz}: a mid-frame step moves the clock exactly one hour, minutes intact`, hhmm(one, tz) === hhmm(from - 3600, tz) && hhmm(two, tz) === hhmm(from + 3600, tz));
  check(`${tz}: that same step moves the marker exactly 37.5 px, never the other way`, near(xOf(f, one), xOf(f, from) - 37.5) && near(xOf(f, two), xOf(f, from) + 37.5));
  check(`${tz}: a step that would leave the frame still stops at the edge`, near(stepHoursFocus(f.noonW - 60, -1, f), f.noonW) && near(stepHoursFocus(f.noonEndW + 60, +1, f), f.noonEndW));
  // A typed time: it lands where its own clock says it does, and it never
  // leaves the displayed night.
  const typed = typedFocus({ h: 3, m: 30, s: 0 }, f.midSec + 3600, f, tz);
  check(`${tz}: a typed 03:30 reads 03:30 on the observer's clock`, hhmm(typed, tz) === "03:30" && typed % 60 === 0);
  // Round 6: the centre is 00:00 UTC, not local midnight, so the typed time is
  // pinned to what it is on the observer's own clock — 3.5 h after THAT day's
  // local midnight — whatever the zone (the reviewer's "typed 22:00 showed 01:00").
  const tp = focusAt(typed, tz);
  check(`${tz}: a typed 03:30 sits exactly 3.5 h right of the local midnight of its own day`,
    near(typed - epochAtWall(tp.y, tp.mo, tp.d, 0, 0, 0, tz), 3.5 * 3600, 1e-6));
  check(`${tz}: a typed time never leaves the displayed night`, inFrameOf(typed, f));
  check(`${tz}: the frame edges count as inside, NaN does not`, inFrameOf(f.noonW, f) && inFrameOf(f.noonEndW, f) && !inFrameOf(f.noonW - 1, f) && !inFrameOf(NaN, f));
}

// ---- the focus axis is a real epoch (round-5 fix) -------------------------
// This block replaces the check that used to PIN the defect ("KNOWN (awaiting
// review): the focus axis is wall-fields-as-UTC"). The defect made Prague sit
// 37.5 px right of its own scale and Sydney 412 px (11 h) right of it.
for (const p of payloads) {
  const tz = p.location.tz, f = frameOf(p);
  check(`${tz}: the frame's own left edge round-trips through the focus helpers exactly`, focusSec(focusAt(f.noonW, tz), tz) === f.noonW);
  // Round 6: the left edge is 12:00 UTC, so 13:00 UTC — read on the chart's own
  // scale — lands exactly one hour (37.5 px) right of it, at any site.
  const u = focusAt(f.noonW, "UTC");
  const onePmUtc = epochAtWall(u.y, u.mo, u.d, 13, 0, 0, "UTC");
  check(`${tz}: 13:00 UTC lands exactly one hour right of the left edge, at any site`,
    near(xOf(f, onePmUtc) - xOf(f, f.noonW), 37.5) && hhmmUtc(onePmUtc) === "13:00");
  check(`${tz}: one hour on the axis is exactly 37.5 px, whatever the zone`, near(xOf(f, f.noonW + 3600) - xOf(f, f.noonW), 37.5));
  // And the observer's own wall clock re-names that same instant exactly — the
  // round-5 anti-drift law, still zone-sensitive on purpose.
  const w = focusAt(f.noonW + 3600, tz);
  check(`${tz}: the observer's wall clock names the same instant, with no drift`,
    epochAtWall(w.y, w.mo, w.d, w.h, w.mi, 0, tz) === f.noonW + 3600);
}
check("the live tick is the real instant of a wall minute, not the naive epoch of its fields", (() => {
  const utc = Date.UTC(2026, 10, 24, 23, 0, 37);   // = 10:00:37 AEDT on 25 Nov in Sydney
  const s = liveSec(utc, "Australia/Sydney");
  return s === Date.UTC(2026, 10, 24, 23, 0) / 1000 && wall(s, "Australia/Sydney") === "2026/11/25 10:0";
})());

// ---- live focus: nothing is shown before the first tick lands ------------
check("the live clock is NaN before the first tick", Number.isNaN(liveSec(null, "Europe/Prague")));
const tick = liveSec(Date.UTC(2026, 10, 24, 12, 2, 57), "UTC");
check("the live clock snaps to the minute", tick % 60 === 0 && hhmm(tick, "UTC") === "12:02");
const pr = payloads[0], prf = frameOf(pr);
check("no focus while live is NaN and nothing is scrubbed", Number.isNaN(focusEpoch(null, liveSec(null, "UTC"), prf)));
check("a scrubbed focus wins over the live clock", focusEpoch(123456, tick, prf) === 123456);
check("the live clock is clamped into the displayed night", near(focusEpoch(null, prf.noonW - 5000, prf), prf.noonW) && near(focusEpoch(null, prf.noonEndW + 5000, prf), prf.noonEndW));

// ---- a night change CARRIES the marker, it does not reset it (round 7 item 5)
// The reviewer's probe: pressing ▶ / ◀ snapped the red dashed line back to the
// middle of the frame (the live clock), so nights could not be flicked through
// while holding the Moon still and watching it walk along the arc. The frames are
// UTC-anchored (round 6) and exactly DAY_SEC apart, so the fix is arithmetic:
// carry the focus by the number of days the frame moved. No extra fetch — the
// neighbours are already cached/prefetched — and nothing else on screen moves.
const fakeNight = (frameNoon: string): NightPayload => ({ frameNoon } as unknown as NightPayload);
const noonStamp = (zone: string, day: string): string => {
  const off = zoneOffsetMinutes(zone, Date.parse(`${day}T12:00:00Z`));
  const a = Math.abs(off), sign = off < 0 ? "-" : "+";
  return `${day}T12:00:00${sign}${String(Math.floor(a / 60)).padStart(2, "0")}:${String(a % 60).padStart(2, "0")}`;
};
check("one night's frame is exactly DAY_SEC from the next, DST weekends included", (() => {
  const weekends: Array<[string, string[]]> = [
    ["Europe/Prague", ["2026-10-23", "2026-10-24", "2026-10-25", "2026-10-26"]],   // clocks back 25 Oct
    ["America/New_York", ["2026-10-31", "2026-11-01", "2026-11-02"]],              // clocks back 1 Nov
    ["Australia/Sydney", ["2026-10-03", "2026-10-04", "2026-10-05"]],              // clocks forward 4 Oct
  ];
  return weekends.every(([zone, days]) => days.slice(1).every((d, i) => {
    const a = frameOf(fakeNight(noonStamp(zone, days[i])));
    const b = frameOf(fakeNight(noonStamp(zone, d)));
    return b.noonW - a.noonW === DAY_SEC && b.midSec - a.midSec === DAY_SEC && b.noonEndW - a.noonEndW === DAY_SEC;
  }));
})());
check("stepping a night carries the scrubbed marker to the identical pixel", (() => {
  const prev = frameOf(fakeNight(noonStamp("Europe/Prague", "2026-11-23")));
  const next = frameOf(fakeNight(noonStamp("Europe/Prague", "2026-11-24")));
  const bases = [prev.noonW, prev.midSec - 3600, prev.midSec, prev.noonW + 40_020, prev.noonEndW];
  return bases.every((b) => {
    const up = carryFocus(prev, next, b, Number.NaN);
    const back = up === null ? null : carryFocus(next, prev, up, Number.NaN);
    return up !== null && back !== null && near(xOf(next, up), xOf(prev, b))
      && back === b && hhmmUtc(up) === hhmmUtc(b) && up % 60 === 0 && inFrameOf(up, next);
  });
})());
check("stepping a night carries a LIVE marker too, handing it over as a scrub", (() => {
  const prev = frameOf(fakeNight(noonStamp("Europe/Prague", "2026-11-23")));
  const next = frameOf(fakeNight(noonStamp("Europe/Prague", "2026-11-24")));
  const live = prev.midSec + 6000;
  const up = carryFocus(prev, next, null, live);
  const outside = carryFocus(prev, next, null, prev.noonW - 40000);  // live clock not in this night
  return up !== null && near(xOf(next, up), xOf(prev, live)) && up === live + DAY_SEC
    && outside !== null && inFrameOf(outside, next) && near(outside, next.noonW);
})());
check("a big jump (a typed date) keeps the marker's place as well", (() => {
  const prev = frameOf(fakeNight(noonStamp("Europe/Prague", "2026-11-23")));
  const far = frameOf(fakeNight(noonStamp("Europe/Prague", "2026-12-23")));
  const b = prev.midSec - 9000;
  const up = carryFocus(prev, far, b, Number.NaN);
  return up !== null && near(xOf(far, up), xOf(prev, b)) && up - b === 30 * DAY_SEC;
})());
check("an edit that keeps the same night (a zone change) keeps the same instant, and a live marker live", (() => {
  const prev = frameOf(fakeNight(noonStamp("Europe/Prague", "2026-11-23")));
  const shifted: Frame = { noonW: prev.noonW + 3600, noonEndW: prev.noonEndW + 3600, midSec: prev.midSec + 3600 };
  const b = prev.midSec + 600;
  const kept = carryFocus(prev, shifted, b, Number.NaN);
  return kept !== null && near(kept, b) && carryFocus(prev, shifted, null, b) === null
    && carryFocus(prev, shifted, null, Number.NaN) === null;
})());
check("nothing is invented for a night change with no clock and no scrub", (() => {
  const prev = frameOf(fakeNight(noonStamp("Europe/Prague", "2026-11-23")));
  const next = frameOf(fakeNight(noonStamp("Europe/Prague", "2026-11-24")));
  return carryFocus(prev, next, null, Number.NaN) === null;
})());

// ---- moon chips: 30-minute gap, outside first, flip inside on collision --
// Round 5 (review 24 Nov, C1): a chip never sits inside the moon's path if it
// can help it. It keeps its outside side, clamping to the plot edge when the
// gap no longer fits, and only moves to the inside when the drawn arc actually
// cuts through the box. Its bottom edge now sits at 10° altitude, and its clock
// is UTC like every other printed chart time.
const GAP_PX = (30 * 60 * PLOT_W) / DAY_SEC;
for (const p of payloads) {
  const tz = p.location.tz, f = frameOf(p);
  const ev = crossings(p, f);
  const chips = moonChipsOf(p, f);
  check(`${tz}: one chip per in-frame crossing`, chips.length === ev.length && ev.length > 0);
  for (const c of chips) {
    const kind = c.label.split(" ")[0];
    const match = ev.filter((e) => e.kind === kind);
    const ex = match.length ? match.reduce((a, b) => Math.abs(xOf(f, b.sec) - c.x) < Math.abs(xOf(f, a.sec) - c.x) ? b : a) : null;
    check(`${tz}: "${c.label}" prints the crossing time on the UTC scale, zone named`, ex !== null && c.label === `${kind} ${hhmmUtc(ex.sec)}` && near(c.x, xOf(f, ex.sec)));
    check(`${tz}: "${c.label}" stays inside the plot`, c.bx >= M_LEFT + 4 - 1e-6 && c.bx + c.w <= M_LEFT + PLOT_W - 4 + 1e-6);
    check(`${tz}: "${c.label}" bottom edge sits at 10° altitude`, near(c.by + c.h, yOf(CHIP_ALT)) && CHIP_ALT === 10);
    check(`${tz}: "${c.label}" box width fits its text`, c.w > c.label.length * 6 && c.w < c.label.length * 9 + 12);
    check(`${tz}: "${c.label}" leader anchor lies between box and crossing`, c.lx >= Math.min(c.bx, c.x) - 1e-6 && c.lx <= Math.max(c.bx + c.w, c.x) + 1e-6);
    if (ex && kind === "rise") {
      const outside = c.bx + c.w <= c.x + 1e-6;
      check(`${tz}: rise chip is outside-left, clamped to the plot edge, or a clean flip`, (outside && c.x - (c.bx + c.w) >= GAP_PX - 1e-6) || near(c.bx, M_LEFT + 4) || c.bx >= c.x - 1e-6);
    }
    if (ex && kind === "set") {
      const outside = c.bx >= c.x - 1e-6;
      check(`${tz}: set chip is outside-right, clamped to the plot edge, or a clean flip`, (outside && c.bx - c.x >= GAP_PX - 1e-6) || near(c.bx + c.w, M_LEFT + PLOT_W - 4) || c.bx + c.w <= c.x + 1e-6);
    }
  }
  const sorted = [...chips].sort((a, b) => a.x - b.x);
  for (let i = 1; i < sorted.length; i++) {
    const a = sorted[i - 1], b = sorted[i];
    check(`${tz}: chips do not stack on top of each other`, a.bx + a.w < b.bx + a.w && (b.bx >= a.bx + a.w || a.bx >= b.bx + b.w || Math.abs(a.x - b.x) < 2 * GAP_PX));
  }
}

// All three design nights have a moonset and no in-frame moonrise (the round-4
// Prague chart the reviewer was pointing at is a LIVE night, not a fixture), so
// the rise side of the placement law gets synthetic nights: the payload's own
// moonset moved to the far side of midnight, and one placed right at the frame's
// left edge where the plot runs out of room.
const nightWith = (base: NightPayload, moonrise: number[], moonset: number[]): NightPayload => ({
  ...base,
  moon: {
    ...base.moon,
    moonrise: moonrise.map((s) => new Date(s * 1000).toISOString()),
    moonset: moonset.map((s) => new Date(s * 1000).toISOString()),
  },
});
{
  const p = payloads[0], f = frameOf(p);
  const roomy = moonChipsOf(nightWith(p, [f.midSec], []), f);
  check("synthetic rise at midnight: chip sits LEFT of its crossing with the full 30 min gap",
    roomy.length === 1 && roomy[0].label === `rise ${hhmmUtc(f.midSec)}`
    && roomy[0].bx + roomy[0].w <= roomy[0].x - GAP_PX + 1e-6);
  const edge = moonChipsOf(nightWith(p, [f.noonW + 15 * 60], []), f);
  check("synthetic rise 15 min into the frame: clamped to the plot edge, still on its outside side",
    edge.length === 1 && near(edge[0].bx, M_LEFT + 4) && edge[0].bx < edge[0].x && edge[0].x - edge[0].bx < GAP_PX);
  const pair = moonChipsOf(nightWith(p, [f.midSec], [f.midSec + 40 * 60]), f);
  check("synthetic rise/set pair 40 min apart: both keep their outside sides and clear each other",
    pair.length === 2 && pair.every((c) => c.by + c.h === yOf(CHIP_ALT))
    && (pair[0].bx + pair[0].w <= pair[1].bx || pair[1].bx + pair[1].w <= pair[0].bx));
}

// ---- moon glyph: hidden while the moon is down, tracks the focus while up --
// Round 5 replaced the round-4 law ("park the glyph on the rise/set it last
// crossed") with the reviewer's simpler one: below the horizon there is no Moon
// on the sky, so there is no glyph on the chart.
for (const p of payloads) {
  const tz = p.location.tz, f = frameOf(p);
  const ms = moonSeriesOf(p, f);
  const ev = crossings(p, f);
  check(`${tz}: the glyph is hidden outside the frame`, glyphSecOf(ms, f.midSec, false) === null);
  check(`${tz}: trackEvents are exactly the in-frame crossings`, ms.trackEvents.length === ev.length && ms.trackEvents.every((s) => s >= f.noonW && s <= f.noonEndW));
  const upIdx = ms.alts.findIndex((alt) => alt > 5);
  const downIdx = ms.alts.findIndex((alt) => alt < -5);
  if (upIdx >= 0) {
    check(`${tz}: the glyph follows the focus while the moon is up`, glyphSecOf(ms, ms.times[upIdx], true) === ms.times[upIdx]);
  }
  if (downIdx >= 0) {
    check(`${tz}: the glyph is hidden while the moon is below the horizon`, glyphSecOf(ms, ms.times[downIdx], true) === null);
  }
  check(`${tz}: the glyph hides at the crossing, not after it`, (() => {
    if (!ev.length) return true;
    const just = glyphSecOf(ms, ev[0].sec + 1, true);
    const at = glyphSecOf(ms, ev[0].sec - 1, true);
    return ev[0].kind === "rise" ? (at === null && just === ev[0].sec + 1) : (at === ev[0].sec - 1 && just === null);
  })());
  const pts = arcPointsOf(ms, f).trim().split(" ").filter(Boolean);
  const upCount = ms.times.filter((s, i) => ms.alts[i] >= 0 && s >= f.noonW && s <= f.noonEndW).length;
  check(`${tz}: the arc is drawn only above the horizon, inside the plot`, pts.length === upCount && pts.length > 0 && pts.every((pt) => {
    const [px, py] = pt.split(",").map(Number);
    return px >= M_LEFT - 1e-6 && px <= M_LEFT + PLOT_W + 1e-6 && py <= FLOOR_Y + 1e-6 && py >= M_TOP - 1e-6;
  }));
  if (ev.some((e) => e.kind === "rise")) {
    const r = ev.find((e) => e.kind === "rise")!.sec;
    check(`${tz}: the readout names the next rise before it happens`, riseForFocusOf(p, f, r - 600, true) === r);
    check(`${tz}: the readout keeps the last rise once it has passed`, (() => { const g = riseForFocusOf(p, f, r + 600, true); return g === null || (g <= r && g >= f.noonW); })());
  }
  check(`${tz}: no rise is reported outside the frame`, riseForFocusOf(p, f, f.midSec, false) === null);
}

// ---- twilight bands: edges at the band thresholds, painted in order ------
for (const p of payloads) {
  const f = frameOf(p);
  const altAt = altAtOf(p);
  const bounds = boundariesOf(p, f, altAt);
  check(`${p.location.tz}: the boundary list spans the frame`, bounds.length >= 2 && bounds[0].sec === f.noonW && bounds[bounds.length - 1].sec === f.noonEndW);
  check(`${p.location.tz}: boundaries are in time order`, bounds.every((b, i) => i === 0 || b.sec >= bounds[i - 1].sec));
  const officialInFrame = [p.sun.sunset, p.sun.sunrise, ...p.sun.events.map((e) => e.time)]
    .map((t) => Date.parse(t) / 1000)
    .filter((s) => s > f.noonW && s < f.noonEndW);
  check(`${p.location.tz}: every official in-frame transition is a boundary`,
    officialInFrame.every((s) => bounds.some((b) => near(b.sec, s, 1))));
  // Round 6: the payload only lists the transitions of the night it is anchored
  // to, while the frame now runs 12:00 UTC → 12:00 UTC +1 day. Every threshold
  // the sun crosses inside the frame needs a boundary, official event or not.
  const crossings: number[] = [];
  {
    const ts = sunTimes(p), alts = sunAlts(p);
    for (const thr of [0, ALT_AT.civil, ALT_AT.nautical, ALT_AT.astronomical]) {
      for (let i = 1; i < ts.length; i++) {
        if (ts[i] <= f.noonW || ts[i - 1] >= f.noonEndW) continue;
        const a = alts[i - 1] - thr, b = alts[i] - thr;
        if (a === 0 || (a > 0) === (b > 0)) continue;
        const span = alts[i] - alts[i - 1];
        const sec = span === 0 ? ts[i] : ts[i - 1] + ((ts[i] - ts[i - 1]) * -a) / span;
        if (sec > f.noonW && sec < f.noonEndW) crossings.push(sec);
      }
    }
  }
  check(`${p.location.tz}: every altitude threshold the sun crosses in the frame is a boundary`,
    crossings.length > 0 && crossings.every((s) => bounds.some((b) => near(b.sec, s, 180))));
  check(`${p.location.tz}: no boundary is doubled up`, bounds.every((b, i) => i === 0 || b.sec - bounds[i - 1].sec > 60));
  const evs = p.sun.events.filter((e) => { const s = Date.parse(e.time) / 1000; return s > f.noonW && s < f.noonEndW; });
  check(`${p.location.tz}: a boundary nudges to the side the sun is heading`, evs.every((e) => {
    const th = ALT_AT[e.band], s = Date.parse(e.time) / 1000;
    const b = bounds.find((x) => near(x.sec, s));
    return b !== undefined && (e.edge === "start" ? b.alt > th : b.alt < th);
  }));
  const items = bandItemsOf(p, f, altAt);
  const days = items.filter((i) => i.kind === "day");
  const bands = items.filter((i) => i.kind === "band");
  const edges = items.filter((i) => i.kind === "edge");
  // Round 6 re-anchored the frame to UTC, so WHICH sky opens the stack is the
  // site's own business: Prague (UTC+1) opens and closes on daylight, Sydney
  // (UTC+11) opens and closes on night with the daylight in the middle. What
  // holds at every site is that the stack is the sky the sun is really showing
  // at each instant, in time order, turning over at most once.
  const edgeKind = (sec: number) => (altAt(sec) > 0 ? "day" : "band");
  const edgeBand = (sec: number) => bandOf(altAt(sec));
  // Hairlines close a band, so the painted stack's ends are bands or daylight.
  const painted = items.filter((i) => i.kind !== "edge");
  const endsOk = (item: (typeof painted)[number], sec: number) =>
    item.kind === edgeKind(sec) && (item.kind === "day" || item.band === edgeBand(sec));
  check(`${p.location.tz}: the stack opens and closes on the sky at 12:00 UTC / 12:00 UTC +1 day`,
    endsOk(painted[0], f.noonW + 60) && endsOk(painted[painted.length - 1], f.noonEndW - 60));
  check(`${p.location.tz}: daylight appears once or twice, never more`, days.length >= 1 && days.length <= 2);
  check(`${p.location.tz}: band gradients name a real band and edge`, bands.length > 0 && bands.every((i) => ["civil", "nautical", "astronomical", "night"].includes(i.band) && (i.grad === "dusk" || i.grad === "dawn")));
  check(`${p.location.tz}: the stack turns over at most once (one dusk run, one dawn run)`, (() => {
    const g = bands.map((i) => i.grad);
    return g.filter((v, i) => i > 0 && v !== g[i - 1]).length <= 1;
  })());
  check(`${p.location.tz}: each gradient fades from the day side, whichever way the day is`, (() => {
    // The sun's own altitude at the two ends of the band says where the light
    // comes from: a band whose brighter boundary is on the left runs dusk. (The
    // old check asked which half of the FRAME the band sat in, which the UTC
    // anchor made wrong at far-east sites.) A band where the sun turns over
    // inside it has no brighter end and is skipped.
    return bands.every((i) => {
      const left = altAt(secOfX(f, i.x));
      const right = altAt(secOfX(f, i.x + i.w));
      if (Math.abs(left - right) < 0.02) return true;
      return (i.grad === "dusk") === (left > right);
    });
  })());
  check(`${p.location.tz}: consecutive boundaries give exactly one fill each`, bands.length + days.length === bounds.length - 1);
  check(`${p.location.tz}: a hairline closes each twilight band`, edges.length === bands.length);
  check(`${p.location.tz}: every band item sits inside the plot`, items.every((i) => i.x >= M_LEFT - 1e-6 && (i.kind === "edge" ? i.x : i.x + i.w) <= M_LEFT + PLOT_W + 1e-6));
}

// ---- the prefetch window is ±10 nights, walked nearest first (round 10) ----
// The reviewer asked how many nights are pre-computed and wanted ±10 ready after
// the first paint, with the walk continuing from whatever night is shown next.
// A payload costs the API 1-2 s and the browser about a millisecond to draw, so
// the window is bought in idle time — but never as a flood, and a night the
// reader presses always wins the race.
check("the window is twenty neighbours: no zero, no duplicates, symmetric, nearest first", (() => {
  const offs = prefetchOffsets();
  return offs.length === 2 * PREFETCH_RADIUS && !offs.includes(0)
    && new Set(offs).size === offs.length
    && offs.every((d) => offs.includes(-d))
    && offs.every((d, i) => i === 0 || Math.abs(d) >= Math.abs(offs[i - 1]));
})());
check("the walk issues one job at a time, nearest first, and stops when superseded", (() => {
  const src = readFileSync(join(root, "web", "app", "components", "night-chart", "Planner.tsx"), "utf8");
  const open = src.indexOf("const walk = async () => {");
  const body = src.slice(open, src.indexOf("};", open));
  return open > 0 && body.length > 0
    && /for \(const off of prefetchOffsets\(\)\)/.test(body)
    && /if \(!alive\(\)\) return;/.test(body)
    && /await ensureNight\(loc, d\)/.test(body)
    && !/Promise\.all/.test(body);
})());
check("the payload cache can hold the whole window, so a prefetch cannot evict itself",
  CACHE_LIMIT >= 2 * PREFETCH_RADIUS + 1 && PREFETCH_RADIUS >= 10);
check("the window is 21 distinct calendar nights, month and leap-year boundaries included", (() => {
  const one = (base: string): boolean => {
    const w = [0, ...prefetchOffsets()].map((d) => shiftDate(base, d)).sort();
    const t0 = Date.parse(`${base}T00:00:00Z`);
    return new Set(w).size === 2 * PREFETCH_RADIUS + 1
      && w.every((d) => Number.isFinite(Date.parse(`${d}T00:00:00Z`)))
      && Date.parse(`${w[0]}T00:00:00Z`) === t0 - PREFETCH_RADIUS * 86_400_000
      && Date.parse(`${w[w.length - 1]}T00:00:00Z`) === t0 + PREFETCH_RADIUS * 86_400_000;
  };
  return one("2026-11-24") && one("2026-12-27")                     // month + year edge
    && shiftDate("2028-02-27", PREFETCH_RADIUS) === "2028-03-08"     // leap February
    && shiftDate("2026-01-04", -PREFETCH_RADIUS) === "2025-12-25";
})());

// ---- the DARK scheme is red ALL the way down (round 8, review 24 Nov) -----
// The toggle was praised but the page still wore blue: every control box was a
// hard #121826 and the Moon stayed a yellow sticker on a red sky. The laws now:
// the surface colours are variables that follow the scheme; the Moon's own colour
// moves into the warm-red family, dimmer than the ivory; the inks lose a few
// points; and the blue scheme — the one the design probes and the golden stream
// were made in — is untouched.
const rgb = (hex: string): number[] => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
const lum = (hex: string): number => { const [r, g, b] = rgb(hex); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
const reddish = (hex: string): boolean => { const [r, g, b] = rgb(hex); return r > g && g >= b; };
check("the red-scheme Moon is a dimmer warm red with the yellow pulled out", (() => {
  const [r, g, b] = rgb(CURVE_RED), [r0, g0, b0] = rgb(CURVE);
  return r > g && g > b && r < r0 && g < g0 - 20 && b < b0 && lum(CURVE_RED) < lum(CURVE);
})());
check("the red-scheme Moon is still the palest warm line, unlike daylight or the now marker",
  lum(CURVE_RED) > lum(DAY_FILL_RED) && lum(CURVE_RED) > lum("#F87171"));
check("the blue scheme's Moon is the design-probe ivory, byte for byte",
  CURVE === "#EFE0B7" && curveOf(false) === CURVE && curveOf(true) === CURVE_RED);
check("the red inks lost a few points, not a redesign, and stayed reddish", (() => {
  const prevBright = "#F0E2E2", prevInk = "#B48C8C";   // what round 7 shipped
  const drift = (a: string, b: string) => rgb(a).map((v, i) => v - rgb(b)[i]);
  return reddish(INK_BRIGHT_RED) && reddish(INK_RED)
    && lum(INK_BRIGHT_RED) < lum(prevBright) && lum(INK_RED) < lum(prevInk)
    && drift(prevBright, INK_BRIGHT_RED).every((d) => d > 0 && d <= 30)
    && drift(prevInk, INK_RED).every((d) => d > 0 && d <= 30);
})());
check("both red inks read no heavier than their blue twins",
  lum(INK_BRIGHT_RED) <= lum(INK_BRIGHT) && lum(INK_RED) <= lum(INK));
const css = readFileSync(join(root, "web", "app", "app", "globals.css"), "utf8");
const blockOf = (sel: string): string => {
  const open = css.indexOf("{", css.indexOf(sel));
  return open < 0 ? "" : css.slice(open + 1, css.indexOf("}", open));
};
const cssVar = (block: string, name: string): string => {
  const m = new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6})`).exec(block);
  return m ? m[1].toLowerCase() : "";
};
const blueBlock = blockOf(":root {"), redBlock = blockOf(':root[data-scheme="red"]');
check("no control box carries a hard-coded colour: every surface is a variable", (() => {
  const body = css.replace(/:root\[data-scheme="red"\]\s*\{[^}]*\}/g, "").replace(/:root\s*\{[^}]*\}/g, "");
  return !/background:\s*#/.test(body) && !/border-color:\s*#/.test(body)
    && /--field:/.test(blueBlock) && /--field:/.test(redBlock);
})());
check("the chrome's red surfaces follow the scheme rule (R,G,B) → (B,R,R)", (() => {
  const swap = (hex: string) => { const [r, , b] = rgb(hex); return `#${[b, r, r].map((v) => v.toString(16).padStart(2, "0")).join("")}`; };
  return ["bg", "edge", "field", "field-hi", "field-hi-hover", "cell"].every(
    (n) => cssVar(redBlock, n) === swap(cssVar(blueBlock, n)));
})());
check("the page chrome and the chart agree, in both schemes", (() => {
  const eq = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();
  return eq(cssVar(blueBlock, "bg"), PAGE_BG) && eq(cssVar(blueBlock, "ink"), INK)
    && eq(cssVar(blueBlock, "ink-bright"), INK_BRIGHT)
    && !eq(cssVar(redBlock, "bg"), PAGE_BG) && eq(cssVar(redBlock, "ink"), INK_RED)
    && eq(cssVar(redBlock, "ink-bright"), INK_BRIGHT_RED);
})());
check("the blue scheme's box colours are exactly what they were before round 8",
  cssVar(blueBlock, "field") === "#121826" && cssVar(blueBlock, "cell") === "#101625"
  && cssVar(blueBlock, "edge") === "#1d2637" && cssVar(blueBlock, "edge-hi") === "#33415c");

check("the round-8 Moon/ink change left the sky ladder exactly as it was", (() => {
  const light = (hex: string) => { const c = rgb(hex); return (Math.max(...c) + Math.min(...c)) / 2; };
  const ladder = [DAY_FILL, ...BANDS.map((b) => b.colour)], redLadder = [DAY_FILL_RED, ...BANDS_RED.map((b) => b.colour)];
  return BANDS.every((b, i) => light(b.colour) === light(redLadder[i + 1]))
    && light(PAGE_BG) === light(PAGE_BG_RED)
    && redLadder.every((c, i) => i === 0 || light(c) < light(redLadder[i - 1]));
})());

console.log(`${pass} checks passed, ${fails.length} failed`);
for (const f of fails) console.log(`FAIL  ${f}`);
process.exit(fails.length ? 1 : 0);
