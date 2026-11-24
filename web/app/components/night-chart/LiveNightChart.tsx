"use client";

// Live night chart — the realtime view of the fixed single-night frame
// (docs/REQUIREMENTS.md §4.1): the frame is anchored to UTC, so the left edge is
// ALWAYS 12:00 UTC, the centre ALWAYS 00:00 UTC, the right edge ALWAYS 12:00 UTC
// the next day. One afternoon, one sunset, one twilight descent, one dark period,
// one sunrise, one morning — for every date.
//
// - The vertical band gradient carries the sun entirely (no extra bars);
//   daylight halves are a pale flat blue, brighter than any twilight band.
// - Official transition times (sunset, each twilight edge, darkness, sunrise)
//   are printed vertically INSIDE the chart at their exact x positions.
// - Mouseover shows a tooltip with the time (x) and altitude (y) under the
//   cursor, plus crosshair guides.
// - A focus time drives the moon glyph; in "live" mode it tracks the clock.
//   Scrubbing and ±1 h steps NEVER change the night — they move within the
//   fixed noon→noon+1 frame only (review 23 Nov, round 3).
//
// This file is the composition layer only. The laws it renders are kept as
// pure, separately testable functions:
//   lib/chart/geom       frame + pixel scales        lib/chart/sunbands   bands
//   lib/chart/clock      wall-clock text + focus     lib/chart/moonchips  rise/set chips
//   lib/chart/scrub      the scrubbing laws          lib/chart/moontrack  arc + glyph pinning
//   lib/chart/labels     transition + header text
// Gates: scripts/golden.ts pins this markup token-for-token, scripts/units.ts
// pins the laws those modules implement.

import { useEffect, useRef, useState } from "react";
import { terminator } from "@/components/night-chart/NightChart";
import { NOW, bandsOf, chipBgOf, curveOf, dayFillOf, edgeLineOf, glyphBgOf, gridOf, inkBrightOf, pageBgOf } from "@/lib/palette";
import type { Band, NightPayload } from "@/lib/types";
import {
  FLOOR_Y, H, M_LEFT, M_TOP, PLOT_H, PLOT_W, W, altOfY, frameOf, gridAlts, interp,
  isMajorGrid, secOfX, xOf, yOf, type Frame,
} from "@/lib/chart/geom";
import { fmtClock, hhmmUtc, parseClock } from "@/lib/chart/clock";
import { carryFocus, clampFrame, focusEpoch, inFrameOf, liveSec, scrubFocus, stepHoursFocus, typedFocus } from "@/lib/chart/scrub";
import { bandItemsOf } from "@/lib/chart/sunbands";
import { AXIS_NOW_Y, LABEL_CH, LABEL_FS, TIP_FS, axisLabelsOf, headerTitle, tipWidth, transitionLabelsOf } from "@/lib/chart/labels";
import { CHIP_H, crossingDotY, moonChipsOf, type MoonChip } from "@/lib/chart/moonchips";
import { arcPointsOf, glyphSecOf, moonSeriesOf, riseForFocusOf } from "@/lib/chart/moontrack";

export function LiveNightChart({ payload, tz }: { payload: NightPayload; tz: string }) {
  // ---- time state -------------------------------------------------------
  // ALL hooks are declared up front, before any computation: a hook that
  // ends up behind an early return or conditional block breaks React's
  // hook-order rule ("Should have a queue" / update-depth churn).
  // "live": focus tracks the clock (minute ticks). Scrub/step switches to a
  // scrubbed focus until "tonight" re-arms live mode.
  const [tickMs, setTickMs] = useState<number | null>(null);
  // Mouse tooltip state.
  const [hover, setHover] = useState<{ x: number; y: number; sec: number; alt: number } | null>(null);
  // 12 h / 24 h display mode for the header TIME field (lives in Planner;
  // the chart formats its readouts to match).
  const [h12, setH12] = useState(false);
  // "DARK" scheme toggle (lives in Planner): sky blues -> reds at the same
  // lightness (B channel swapped into R). Moon ivory stays put.
  const [dark, setDark] = useState(false);
  // Scrubbed position as an EPOCH instant (null = live mode). Because it is a
  // number on the same scale as the frame, hour steps and slider drags can step
  // and clamp it directly — and event handlers must read the CURRENT value, not
  // the one captured at render time (the planner:set-time listener and the
  // night-flip effect once ping-ponged the focus between two nights, which is
  // what React's "Maximum update depth" error was).
  const scrubSecRef = useRef<number | null>(null);
  const [scrubSec, setScrubSec] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  // The frame currently on screen, so an incoming night can be compared with it
  // and the marker carried across (round 7, item 5) instead of re-arming live.
  const prevFrameRef = useRef<Frame | null>(null);
  const [timeDraft, setTimeDraft] = useState("");

  // Minute-tick: re-sample the wall clock just after each minute boundary, so
  // the readout and the now line advance once per minute (no seconds shown).
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const schedule = () => {
      const d = new Date();
      const delay = (60 - d.getSeconds()) * 1000 - d.getMilliseconds() + 50;
      timer = setTimeout(() => { setTickMs(Date.now()); schedule(); }, delay);
    };
    setTickMs(Date.now());
    schedule();
    return () => clearTimeout(timer);
  }, []);
  // Header controls live in Planner and talk to the chart over window events.
  useEffect(() => {
    const on = () => setH12((v) => !v);
    const onDark = (e: Event) => setDark(Boolean((e as CustomEvent<boolean>).detail));
    window.addEventListener("planner:toggle-h", on);
    window.addEventListener("planner:toggle-dark", onDark);
    return () => {
      window.removeEventListener("planner:toggle-h", on);
      window.removeEventListener("planner:toggle-dark", onDark);
    };
  }, []);

  // One writer for the scrub, so the ref and the state never disagree.
  const setScrubAt = (sec: number | null) => { scrubSecRef.current = sec; setScrubSec(sec); };

  // Frame edges in float seconds (see §4.1): the frame is anchored to UTC —
  // left edge 12:00 UTC, centre exactly 00:00 UTC, right edge 12:00 UTC +1 day.
  // payload.frameNoon only says WHICH night: the centre is the UTC midnight
  // nearest that night's local midnight. So the printed scale is identical for
  // every night at a site, and the centre label is a real clock, not a word.
  // All three are REAL instants — the same number line the slider, the marker
  // and every payload sample live on.
  const frame: Frame = frameOf(payload);
  const { noonW, noonEndW, midSec } = frame;

  // A NEW night keeps the marker exactly where it was (review 24 Nov, round 7,
  // item 5): the focus is carried by the number of days the frame moved, so the
  // red dashed line — and the moon on it — never jumps back to 00:00 / the live
  // clock when the day stepper is pressed. Keyed on the frame literal (a stable
  // string) rather than the payload object, so no re-render can re-trigger it —
  // an object dependency churned and hit React's "Maximum update depth exceeded"
  // guard during night flips. ⏱ live (or a drag) is how the clock is re-armed.
  useEffect(() => {
    const prev = prevFrameRef.current;
    prevFrameRef.current = frame;
    setScrubAt(prev === null ? null : carryFocus(prev, frame, scrubSecRef.current, liveSec(tickMs, tz)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [payload.frameNoon]);

  const live = liveSec(tickMs, tz);
  // The instant the moon glyph + marker follow (scrubbed, or the clamped clock).
  const focusSecV = focusEpoch(scrubSec, live, frame);
  const inFrame = inFrameOf(focusSecV, frame);
  const isLive = scrubSec === null;

  // Which night is on screen is the PARENT's business only: the header ◀ / ▶
  // stepper and the "Night of" date box set the date, the parent swaps the
  // payload in, and the effect above carries the marker across (round 7, item 5).
  // Review 23 Nov (round 3) still holds: scrubbing and hour steps must NEVER
  // change the night on their own. The chart used to grow its own day stepper
  // here (`shiftNight` + a flip latch); nothing ever called it, so it went away
  // with the round-7 dead-code sweep — the flip latch was redundant anyway,
  // because the parent's generation counter already drops a stale payload.

  // The −1 h / +1 h buttons. Review 23 Nov round 3: these move time within the
  // FIXED frame only — no day change, ever; at a frame edge the step stops.
  // Review 24 Nov round 5 fixed what looked like "−1 h jumps FORWARD": the step
  // now reads and writes real epoch seconds, so it moves the marker exactly one
  // hour along the axis it is drawn on, instead of one hour plus a zone offset.
  function stepHours(delta: number) {
    // Read the CURRENT scrub position from the ref, never from this render's
    // state: two presses in one click sequence (or a press right after a
    // slider drag) would otherwise both start from the same stale value. From
    // LIVE the base is the clock itself, so −1 h lands a full hour back.
    const base = scrubSecRef.current ?? (Number.isNaN(live) ? noonW : live);
    setScrubAt(stepHoursFocus(base, delta, frame));
  }

  // Slider drag: hard-clamped to the frame (noon → noon+1). It NEVER flips the
  // night, never parks at moonset, and — round 5 — the thumb can reach BOTH
  // edges: the value it produces is the very number the marker and the readout
  // use, so there is no drift to compound on the next drag. The position snaps
  // to the MINUTE grid so it always matches the clock.
  const setScrubRaw = (rawSec: number) => setScrubAt(scrubFocus(rawSec, frame));

  // Editable time field (HH:MM[:SS], 12 h AM/PM or 24 h): jumps the focus
  // within this night. Reports the focus to the header field and accepts
  // edits from it. The field shows the observer's LOCAL clock — the one control
  // on screen that is not on the chart's UTC scale — straight off the IANA zone,
  // so it follows summer/winter time by itself (round 7 removed the ZONE box's
  // ±1 h nudge: the zone, not the user, owns the daylight-saving switch).
  useEffect(() => {
    if (inFrame) setTimeDraft(fmtClock(focusSecV, tz, h12));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusSecV, inFrame, tz, h12]);
  useEffect(() => {
    window.dispatchEvent(new CustomEvent("planner:focus", { detail: timeDraft }));
  }, [timeDraft]);
  useEffect(() => {
    const on = (e: Event) => {
      const text = (e as CustomEvent<string>).detail.trim();
      const c = parseClock(text);
      if (!c) return;
      // Review 24 Nov round 5: typing a 24-hour time (14:00, 22:00) while the
      // field is in 12-hour mode switches the DISPLAY to 24-hour, so the number
      // typed is the number read back. Flipping through the shared event keeps
      // the header button and the chart's formatter in step.
      if (h12 && c.h > 12 && !/(am|pm)/i.test(text)) window.dispatchEvent(new Event("planner:toggle-h"));
      // Wall-clock time on whichever calendar day the focus currently sits on;
      // typedFocus folds it into this night — a typed time never flips nights.
      setScrubAt(typedFocus(c, inFrame ? focusSecV : noonW, frame, tz));
    };
    window.addEventListener("planner:set-time", on);
    return () => window.removeEventListener("planner:set-time", on);
  }, [focusSecV, inFrame, noonW, noonEndW, tz, h12]);

  // ---- palette ----------------------------------------------------------
  // Review 23 Nov: ALL chart text uses ONE colour per scheme — the bright ink.
  const INK = inkBrightOf(dark);
  const GRID = gridOf(dark);
  const BANDS = bandsOf(dark), DAY_FILL = dayFillOf(dark), PAGE_BG = pageBgOf(dark);
  const CHIP_BG = chipBgOf(dark), EDGE_LINE = edgeLineOf(dark), GLYPH_BG = glyphBgOf(dark);
  // Review 24 Nov (round 8): in the red scheme the Moon leaves ivory for a
  // dimmer warm red (CURVE_RED) so it sits inside the scheme instead of reading
  // as a yellow sticker over it. Blue scheme keeps the ivory of the design
  // probes untouched. The shadowed name keeps every drawing call as it was.
  const CURVE = curveOf(dark);

  // ---- sun --------------------------------------------------------------
  const sunSeries = payload.sun.series;
  const sunTimes = sunSeries.map((s) => Date.parse(s.time) / 1000);
  const sunAlt = sunSeries.map((s) => s.altitude);
  const altAt = (sec: number) => interp(sunTimes, sunAlt, sec) ?? 0;

  // ---- moon -------------------------------------------------------------
  const moon = moonSeriesOf(payload, frame);
  // Moon state at the focus instant.
  const altF = inFrame ? interp(moon.times, moon.alts, focusSecV) : null;
  const illumF = inFrame ? interp(moon.times, moon.illum, focusSecV) : null;
  // The glyph is PINNED to the arc, and it only exists while the Moon is above
  // the horizon: below it there is no Moon in the sky, so there is no glyph on
  // the chart either (review 24 Nov, round 5 — this replaces the round-4 law
  // that parked the glyph at the last rise/set, which made the moon look stuck
  // at 0° altitude while the scrub ran through the dark hours).
  const glyphSec = glyphSecOf(moon, focusSecV, inFrame);
  const glyphAlt = glyphSec !== null ? interp(moon.times, moon.alts, glyphSec) : null;
  const moonUp = glyphAlt !== null && glyphAlt > 0;

  // ---- derived layout ---------------------------------------------------
  const bandItems = bandItemsOf(payload, frame, altAt);
  const transLabels = transitionLabelsOf(payload, frame, tz);
  const chips: MoonChip[] = moonChipsOf(payload, frame);
  const above = arcPointsOf(moon, frame);
  const axis = axisLabelsOf(frame);
  const title = headerTitle(payload);

  // Everything printed INSIDE the chart reads on the chart's own UTC scale
  // (round 5); the observer's local clock is the header's Local Time box only.
  const focusUtc = inFrame ? hhmmUtc(focusSecV) : "";
  // The focus marker's own time chip (round 5, item C3): the scrub row no
  // longer prints a second copy of the clock — the time the red line sits at is
  // printed ON the chart, in a box built like the rise/set chips and bordered in
  // the now-red so it reads as the marker's, not another legend.
  const nowLabel = isLive ? `now ${focusUtc}` : `${focusUtc}`;
  const nowW = nowLabel.length * LABEL_CH + 10;
  const nowY = AXIS_NOW_Y;
  const nowX = (() => {
    const x = xOf(frame, focusSecV);
    if (x + 6 + nowW <= M_LEFT + PLOT_W - 2) return x + 6;
    return Math.max(M_LEFT + 2, x - 6 - nowW);
  })();
  const riseForFocus = riseForFocusOf(payload, frame, focusSecV, inFrame);
  const liveReadout = inFrame && illumF !== null
    ? `${focusUtc} · ${(illumF * 100).toFixed(0)}% lit` +
      (moonUp ? ` · alt ${glyphAlt!.toFixed(1)}°` : " · below horizon") +
      (riseForFocus !== null ? ` · moonrise ${hhmmUtc(riseForFocus)}` : "")
    : "";

  function onMove(e: React.MouseEvent<SVGSVGElement>) {
    const svg = svgRef.current;
    if (!svg) return;
    const r = svg.getBoundingClientRect();
    const sx = ((e.clientX - r.left) * W) / r.width;
    const sy = ((e.clientY - r.top) * H) / r.height;
    if (sx < M_LEFT || sx > M_LEFT + PLOT_W || sy < M_TOP || sy > M_TOP + PLOT_H) { setHover(null); return; }
    setHover({ x: sx, y: sy, sec: secOfX(frame, sx), alt: Math.max(0, altOfY(sy)) });
  }

  const tip = (() => {
    if (!hover) return null;
    const label = `${hhmmUtc(hover.sec)}  ·  ${hover.alt.toFixed(1)}°`;
    const wTip = tipWidth(label);
    let tx = hover.x + 12;
    if (tx + wTip > M_LEFT + PLOT_W) tx = hover.x - 12 - wTip;
    const ty = Math.max(M_TOP + 6, hover.y - 30);
    return (
      <g pointerEvents="none">
        <line x1={hover.x} y1={M_TOP} x2={hover.x} y2={M_TOP + PLOT_H} stroke={INK} strokeOpacity={0.35} strokeDasharray="2 4" />
        <line x1={M_LEFT} y1={hover.y} x2={M_LEFT + PLOT_W} y2={hover.y} stroke={INK} strokeOpacity={0.35} strokeDasharray="2 4" />
        <rect x={tx} y={ty} width={wTip} height={22} rx={4} fill={GLYPH_BG} stroke={CURVE} strokeOpacity={0.35} />
        <text x={tx + 7} y={ty + 15} fontSize={TIP_FS} fill={INK}>{label}</text>
      </g>
    );
  })();

  return (
    <div>
      {/* time control ABOVE the chart: scrub the focus. The slider spans the
          FULL fixed frame — 12:00 on the left to 12:00+1 on the right — and
          scrubbing NEVER changes the night (review 23 Nov, round 3); only
          the header day stepper does. Hour steps are plain −1 h / +1 h time
          moves, clamped at the frame edges. Every row item has a FIXED width
          (buttons + status text) and the slider flexes, so nothing under the
          cursor ever moves — repeated "+1 h" clicking keeps the pointer
          exactly where it belongs. Buttons use the app's standard palette
          (globals.css), not custom inline colours. */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8, color: INK, fontSize: 12 }}>
        <button className="btn" onClick={() => stepHours(-1)} aria-label="back one hour" style={{ width: 62, flexShrink: 0 }}>−1 h</button>
        <input className="scrub" type="range" min={noonW} max={noonEndW} step={1}
          value={Number.isNaN(focusSecV) ? noonW : clampFrame(focusSecV, frame)}
          onChange={(e) => setScrubRaw(Number(e.target.value))}
          style={{ flex: 1 }} aria-label="time of night" />
        <button className="btn" onClick={() => stepHours(1)} aria-label="forward one hour" style={{ width: 62, flexShrink: 0 }}>+1 h</button>
        {/* live button is ALWAYS present (disabled while live) so the hour
            buttons never move under the cursor during repeated clicking */}
        <button className="btn" onClick={() => setScrubAt(null)} disabled={isLive}
          style={{ width: 78, flexShrink: 0, opacity: isLive ? 0.45 : 1 }}>⏱ live</button>
        {/* No clock here (round 5): the time the marker is at is printed on the
            chart itself, in a chip on the line. This slot keeps its fixed width
            and only says which mode the marker is in, so nothing shifts. */}
        <span style={{ width: 96, flexShrink: 0, opacity: 0.75 }}>{isLive ? "live clock" : "scrubbed"}</span>
      </div>

      <svg ref={svgRef} xmlns="http://www.w3.org/2000/svg" width={W} height={H} viewBox={`0 0 ${W} ${H}`}
        fontFamily="Inter, Segoe UI, sans-serif" role="img" style={{ width: "100%", height: "auto" }}
        onMouseMove={onMove} onMouseLeave={() => setHover(null)}>
        <defs>
          {BANDS.flatMap(({ name, colour }) => {
            const n = name as Band;
            return [
              <linearGradient key={`${n}-dusk`} id={`b-${n}-dusk-live`} x1="0" x2="1" y1="0" y2="0">
                <stop offset="0" stopColor={colour} />
                <stop offset="1" stopColor={colour} stopOpacity={0.72} />
              </linearGradient>,
              <linearGradient key={`${n}-dawn`} id={`b-${n}-dawn-live`} x1="0" x2="1" y1="0" y2="0">
                <stop offset="0" stopColor={colour} stopOpacity={0.72} />
                <stop offset="1" stopColor={colour} />
              </linearGradient>,
            ];
          })}
          <clipPath id="plot-live"><rect x={M_LEFT} y={M_TOP} width={PLOT_W} height={PLOT_H} /></clipPath>
          <filter id="glow-live" x="-60%" y="-60%" width="220%" height="220%">
            <feGaussianBlur stdDeviation="2.6" result="b" />
            <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
        </defs>
        <rect width={W} height={H} fill={PAGE_BG} />
        <g clipPath="url(#plot-live)">
          {bandItems.map((it) =>
            it.kind === "day" ? (
              // Daylight is the BRIGHTEST thing on the chart (round 5): the old
              // flat blue at 0.42 over the page composited to about #213D5A,
              // which sat level with the civil-twilight band (#27476E) and read
              // as darker than it should. Same hue, more light, 0.60 over the
              // page → about #3E5E85, a clear step above civil. The ladder is
              // daylight > civil > nautical > astronomical > night.
              <rect key={it.key} x={it.x} y={M_TOP} width={it.w} height={PLOT_H} fill={DAY_FILL} opacity={0.6} />
            ) : it.kind === "band" ? (
              <rect key={it.key} x={it.x} y={M_TOP} width={it.w} height={PLOT_H} fill={`url(#b-${it.band}-${it.grad}-live)`} />
            ) : (
              <line key={it.key} x1={it.x} y1={M_TOP} x2={it.x} y2={FLOOR_Y} stroke={EDGE_LINE} strokeOpacity={0.13} />
            ),
          )}
        </g>
        <g>
          {gridAlts().map((alt) => (
            <g key={`g${alt}`}>
              <line x1={M_LEFT} y1={yOf(alt)} x2={M_LEFT + PLOT_W} y2={yOf(alt)}
                stroke={GRID} strokeOpacity={isMajorGrid(alt) ? 0.3 : 0.16} strokeDasharray={isMajorGrid(alt) ? "5 6" : "1 6"} />
              <text x={M_LEFT - 10} y={yOf(alt) + 4} textAnchor="end" fontSize={11} fill={INK}>{alt}°</text>
            </g>
          ))}
        </g>
        <g>
          {transLabels.map((t) => (
            <g key={t.key}>
              <text x={t.ax} y={t.anchorY} fontSize={LABEL_FS} fill={INK} opacity={0.9}
                transform={`rotate(${t.rot} ${t.ax} ${t.anchorY})`} textAnchor={t.textAnchor}>{t.label}</text>
              {/* leader: middle of last letter → up along the transition line */}
              <line x1={t.ax} y1={t.anchorY - 2} x2={t.x} y2={FLOOR_Y - 6}
                stroke={INK} strokeOpacity={0.5} strokeWidth={0.8} />
            </g>
          ))}
          <line x1={xOf(frame, midSec)} y1={M_TOP} x2={xOf(frame, midSec)} y2={M_TOP + PLOT_H}
            stroke={GRID} strokeOpacity={0.3} strokeDasharray="4 5" />
        </g>
        <g clipPath="url(#plot-live)">
          {above && <polyline points={above} fill="none" stroke={CURVE} strokeWidth={1.8}
            strokeOpacity={0.55} strokeLinejoin="round" />}
          {moonUp && glyphSec !== null && (
            <g transform={`translate(${xOf(frame, glyphSec)},${yOf(glyphAlt!)})`}>
              <circle r={13} fill={GLYPH_BG} stroke={CURVE} strokeOpacity={0.4} />
              <path d={terminator(illumF ?? interp(moon.times, moon.illum, glyphSec) ?? 1, "13.0", payload.moon.limb)}
                fill={CURVE} filter="url(#glow-live)" />
            </g>
          )}
        </g>
        {/* moonrise / moonset chips: drawn after the arc so they stay legible
            where they overlap it, and NOT plot-clipped so a chip can never be
            cut in half by the frame edge. Their box bottoms sit at 10° altitude
            and each keeps its outside-the-curve side (moonchips.ts). */}
        <g>
          {chips.map((c) => (
            <g key={c.key}>
              <line x1={c.lx} y1={c.by + c.h} x2={c.x} y2={FLOOR_Y - 3}
                stroke={CURVE} strokeOpacity={0.75} strokeWidth={0.9} />
              {/* exact crossing dot: where the moon path reaches zero */}
              <circle cx={c.x} cy={crossingDotY()} r={2.6} fill={CURVE} fillOpacity={0.9} />
              <rect x={c.bx} y={c.by} width={c.w} height={c.h} rx={3} fill={CHIP_BG} fillOpacity={0.92}
                stroke={CURVE} strokeOpacity={0.45} strokeWidth={0.7} />
              <text x={c.bx + c.w / 2} y={c.by + c.h - 4.5} fontSize={LABEL_FS} fill={INK} textAnchor="middle">{c.label}</text>
            </g>
          ))}
        </g>
        {/* Fixed-scale time labels on the axis (round 5 wording, round 6 anchor,
            round 7 placement, round 9 wording + open cells). Because the frame is
            anchored to UTC, all three are immovable clocks, identical for every
            night at this site: the corners print 12:00 and 12:00 +1 day, the
            centre prints exactly 00:00 — with no "UTC" suffix anywhere (the scale
            is named once, in the header's LOCAL TIME label). Each clock prints its
            TIME first and then the day and date, because the clock is what the
            chart is read against. Each corner clock hangs BELOW the axis and keeps
            only TWO lines (round 9): the short piece of x axis it hangs from, and
            the extension of the y axis down its outer side — both in the daylight
            strip's colour, so the label belongs to the daylight at that end of the
            chart. The inner wall, the bottom wall and the tinted background that
            used to close the cell are gone: it is the axis corner extended
            downwards, not a box floating under it. The 45° transition text starts
            below the cells (labels.TRANSITION_Y), so the two never collide. Drawn
            after the chips and the arc; same size, colour and opacity as the
            transition text. */}
        <g>
          {axis.map((a) => (
            <g key={a.key}>
              {a.box && (
                <>
                  {/* the y axis itself, extended down the full height of the cell */}
                  <line x1={a.box.x + (a.anchor === "start" ? 0 : a.box.w)} y1={FLOOR_Y}
                    x2={a.box.x + (a.anchor === "start" ? 0 : a.box.w)} y2={a.box.y + a.box.h}
                    stroke={DAY_FILL} strokeWidth={2} />
                  {/* the cell's top side: the piece of x axis it hangs from */}
                  <line x1={a.box.x} y1={a.box.y - 1} x2={a.box.x + a.box.w} y2={a.box.y - 1}
                    stroke={DAY_FILL} strokeWidth={1} />
                </>
              )}
              <text x={a.x} y={a.y} textAnchor={a.anchor} fontSize={LABEL_FS}
                fill={INK} opacity={0.9}>{a.label}</text>
            </g>
          ))}
        </g>
        {/* focus marker: the live now line, or the scrubbed-time handle. Its
            clock sits in a chip beside the line (same box construction as the
            rise/set chips), flipped to the left near the right edge. It rides one
            band above the axis corner labels so the two can never overlap. */}
        {inFrame && (
          <g clipPath="url(#plot-live)">
            <line x1={xOf(frame, focusSecV)} y1={M_TOP} x2={xOf(frame, focusSecV)} y2={M_TOP + PLOT_H}
              stroke={NOW} strokeWidth={1.3} strokeDasharray="4 4" />
            <rect x={nowX} y={nowY} width={nowW} height={CHIP_H} rx={3} fill={CHIP_BG} fillOpacity={0.92}
              stroke={NOW} strokeOpacity={0.6} strokeWidth={0.8} />
            <text x={nowX + nowW / 2} y={nowY + CHIP_H - 4.5} fontSize={LABEL_FS} fill={INK}
              textAnchor="middle">{nowLabel}</text>
          </g>
        )}
        {tip}
        <text x={M_LEFT} y={24} fontSize={13} fontWeight={600} fill={INK}>{title}</text>
        {liveReadout && (
          <text x={M_LEFT + PLOT_W - 34} y={24} textAnchor="end" fontSize={12} fill={INK}>{liveReadout}</text>
        )}
      </svg>
    </div>
  );
}
