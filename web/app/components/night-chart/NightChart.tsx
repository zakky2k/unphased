"use client";

// Port of design/render.py — the geometry reference from the design review.
// Emits React elements instead of an SVG string, but every number, band rule,
// anti-crowd nudge and honesty notice matches the probe one-for-one.
//
// Scale decisions (unchanged):
// - x axis FIXED at local noon -> midnight (centre) -> noon+2. Scrolling date
//   translates bands and moon curve; grid, ticks and frame never move.
// - y truncated at 0°: nothing below the horizon exists on this chart.
// - The sun is expressed entirely through the band gradient; sunset/sunrise
//   are axis ticks + labels only, never bars.

import type { NightPayload, Band } from "@/lib/types";
import { BANDS, CURVE, INK, INK_BRIGHT, GRID, NOW, PAGE_BG, bandOf } from "@/lib/palette";

const W = 980;
const H = 470;
const M_LEFT = 56, M_RIGHT = 24, M_TOP = 40, M_BOTTOM = 48;
const PLOT_W = W - M_LEFT - M_RIGHT;
const PLOT_H = H - M_TOP - M_BOTTOM;
const Y_TOP = 90.0;

/** Format like Python's f"{v:.2f}". CPython formats the TRUE decimal value of
 *  the binary double (146.625 is exact, a half tie -> round-half-even ->
 *  "146.62"), but ECMAScript ToFixed works from the shortest repr, so
 *  toFixed(2) returns "146.63" for that same double. A double < 2^31 is an
 *  exact multiple of 2^-52, so BigInt arithmetic reproduces Python's rule
 *  exactly at our magnitudes. */
function f2(v: number): string {
  const neg = v < 0;
  const a = Math.abs(v);
  const SCALE = 2n ** 52n;
  const num = BigInt(Math.round(a * 2 ** 52)); // exact for |v| < 2^31
  const n100 = num * 100n;
  let whole = n100 / SCALE;
  const twiceRem = (n100 - whole * SCALE) * 2n;
  if (twiceRem > SCALE || (twiceRem === SCALE && whole % 2n === 1n)) whole += 1n;
  const s = whole.toString().padStart(3, "0");
  return (neg ? "-" : "") + s.slice(0, -2) + "." + s.slice(-2);
}

class Scale {
  constructor(readonly t0: number, readonly t1: number) {}
  x(t: number): number {
    return M_LEFT + (PLOT_W * (t - this.t0)) / (this.t1 - this.t0);
  }
  y(alt: number): number {
    return M_TOP + PLOT_H * (1.0 - Math.max(alt, 0.0) / Y_TOP);
  }
}

/** Lit part of the disc: limb semicircle closed by a half-ellipse with
 *  semi-minor axis r·|2k−1|. Ported from render.py terminator(); Python's
 *  bare f-string prints the caller's literal as-is, so callers pass radii
 *  in matching form (legend: 9 int -> "9"; glyphs: 11.0/9.0 -> "11.0"/"9.0"). */
export function terminator(
  k: number,
  r: number | string,
  limb: "left" | "right",
): string {
  if (k <= 0.004) return "";
  // render.py interpolates the radius with a bare f-string, so the printed
  // form IS the caller's literal: int 9 -> "9", float 11.0/9.0 -> "11.0".
  // In JS those literals are 9 and "11.0"/"9.0" — pass r as a number for the
  // arithmetic (legend) or pre-formatted string (glyphs).
  const rs = typeof r === "string" ? r : String(r);
  const rf = typeof r === "string" ? parseFloat(r) : r;
  if (k >= 0.996)
    return `M 0,-${rs} A ${rs},${rs} 0 1 1 0,${rs} A ${rs},${rs} 0 1 1 0,-${rs} Z`;
  const rx = rf * Math.abs(2.0 * k - 1.0);
  let limbSweep: number, termSweep: number;
  if (limb === "right") {
    limbSweep = 1;
    termSweep = k > 0.5 ? 1 : 0;
  } else {
    limbSweep = 0;
    termSweep = k > 0.5 ? 0 : 1;
  }
  const d = `M 0,-${rs} A ${rs},${rs} 0 0 ${limbSweep} 0,${rs}`;
  return rx < 0.05 ? d + ` L 0,-${rs} Z` : d + ` A ${f2(rx)},${rs} 0 0 ${termSweep} 0,-${rs} Z`;
}

function seriesValue(times: number[], values: number[], t: number): number {
  for (let i = 1; i < times.length; i++) {
    if (times[i - 1] <= t && t <= times[i]) {
      const f = (t - times[i - 1]) / (times[i] - times[i - 1]);
      return values[i - 1] + f * (values[i] - values[i - 1]);
    }
  }
  return values[values.length - 1];
}

const pad2 = (n: number) => String(n).padStart(2, "0");

/** Offset in minutes baked into an ISO string's zone designator. */
function isoOffsetMin(iso: string): number {
  const m = /(?:Z|[+-]\d{2}:?\d{2})$/.exec(iso);
  if (!m || m[0] === "Z") return 0;
  const sign = m[0][0] === "+" ? 1 : -1;
  const digits = m[0].slice(1).replace(":", "");
  return sign * (+digits.slice(0, 2) * 60 + +digits.slice(2));
}

/** Parse an observer-local ISO string into (a) the true epoch instant for
 *  maths and (b) its literal wall-clock parts — all the fixed-frame chart
 *  ever displays. The browser's zone never touches these values, which is
 *  what keeps a UTC-built server and a phone in another zone agreeing. */
export interface LocalTime {
  ms: number; // true epoch instant
  h: number; m: number;
  y: number; mo: number; d: number; // literal calendar date
}
export function parseLocal(iso: string): LocalTime {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?(?:\.\d+)?(Z|[+-]\d{2}:?\d{2})?$/.exec(iso);
  if (!m) throw new Error(`bad ISO time: ${iso}`);
  const [, Y, Mo, D, hh, mm, ss] = m;
  return {
    ms: Date.UTC(+Y, +Mo - 1, +D, +hh, +mm, +(ss || 0)) - isoOffsetMin(iso) * 60_000,
    h: +hh,
    m: +mm,
    y: +Y, mo: +Mo, d: +D,
  };
}

function hhmmIso(iso: string): string {
  const m = /T(\d{2}):(\d{2})/.exec(iso);
  return m ? `${m[1]}:${m[2]}` : "";
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
function fmtIso(iso: string, f: "%a %d %b" | "%d %b"): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso)!;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  const dd = pad2(d.getUTCDate());
  const mon = MONTHS[d.getUTCMonth()];
  if (f === "%d %b") return `${dd} ${mon}`;
  return `${DAYS[d.getUTCDay()]} ${dd} ${mon}`;
}

function phaseName(k: number, waxing: boolean): string {
  if (k < 0.02) return "New moon";
  if (k > 0.98) return "Full moon";
  const word = waxing ? "Waxing" : "Waning";
  if (Math.abs(k - 0.5) < 0.04) return `${word} quarter`;
  return `${word}${k < 0.5 ? " crescent" : " gibbous"}`;
}

export interface RenderOptions {
  /** Observer-local "now", for the now line; omit to leave it out. */
  now?: LocalTime | null;
  /** Suffix on defs ids so several charts can share one document. */
  ns?: string;
}

interface Mark { ms: number; alt: number; illum: number; big: boolean; kind?: "rise" | "set"; }

export function NightChart({ payload, now = null, ns = "" }: { payload: NightPayload } & RenderOptions) {
  // Ruler in FLOAT SECONDS, mirroring render.py's arithmetic on offset-aware
  // datetimes: Date.parse is what datetime.fromisoformat does (true instant),
  // and x = M_LEFT + PLOT_W * (t - t0)/span then runs with identical float
  // operands — so we land on the same side of every %.2f boundary as Python
  // (a .xx5 tie like 146.625 prints .62 there; ms-space printed .63).
  const fn = /^(\d{4})-(\d{2})-(\d{2})T12:00/.exec(payload.frameNoon)!;
  const wallSec = (iso: string) => Date.parse(iso) / 1000;
  const tW = wallSec(payload.nightStart);
  const tW1 = wallSec(payload.nightEnd);
  const noonW = wallSec(payload.frameNoon);
  // Frame edges: pivot noon and noon+2 whole days (render.py's
  // Scale(noon0, noon0 + timedelta(days=2))), so plot centre is always the
  // midnight after the pivot night. Whole-day offsets on the parsed instant
  // reproduce timedelta maths exactly, DST transitions included.
  const DAY_SEC = 86_400;
  const wallNoon = (dayOffset: number) => noonW + dayOffset * DAY_SEC;
  // The frame spans a fixed 48 wall-clock hours (render.py: Scale(noon0,
  // noon0 + timedelta(days=2))), so plot centre is always midnight of the
  // pivot+1 calendar day.
  const frame = new Scale(wallNoon(0), wallNoon(2));
  const sc = new Scale(tW, tW1);
  // Event anchors for the drawing code (night window bounds) in wall time.
  const t0 = { ms: tW, h: +(payload.nightStart.slice(11, 13)), m: +(payload.nightStart.slice(14, 16)) };
  const t1 = { ms: tW1, h: +(payload.nightEnd.slice(11, 13)), m: +(payload.nightEnd.slice(14, 16)) };

  const samples = payload.moon.samples;
  const times = samples.map((s) => wallSec(s.time));
  const moonAlt = samples.map((s) => s.altitude);
  const illum = samples.map((s) => s.illumFraction);
  const sunSeries = payload.sun.series;
  const sunAlt = sunSeries.map((s) => s.altitude);
  const sunTimes = sunSeries.map((s) => wallSec(s.time));

  const limb = payload.moon.limb;
  const hasDark = payload.sun.trueDarkness;
  // Wall-clock midnight between the frame's noon days — always at plot centre.
  // render.py: mid_day = noon0 + timedelta(days=1), i.e. NOON of pivot+1,
  // the exact midpoint of the two-day frame (506px). Not 00:00.
  const midDayMs = wallNoon(1);
  // The centre label names the calendar day that begins at midnight, which is
  // the frameNoon date + 1 — not nightEnd's date (that would be wrong for
  // nights whose sunrise falls two days after the pivot noon).
  const midDay = new Date(Date.UTC(+fn[1], +fn[2] - 1, +fn[3] + 1));
  const midIso = `${DAYS[midDay.getUTCDay()]} ${pad2(midDay.getUTCDate())} ${MONTHS[midDay.getUTCMonth()]} 00:00`;

  // ---- defs: band gradients, clip, glow ----
  // (render.py emits these bare inside <defs>; no wrapper element.)
  const grads = BANDS.flatMap(({ name, colour }) => {
    const n = name as Band;
    return [
      // Dusk warms toward the horizon, dawn warms away from it.
      <linearGradient key={`${n}-dusk`} id={`b-${n}-dusk${ns}`} x1="0" x2="1" y1="0" y2="0">
        <stop offset="0" stopColor={colour} />
        <stop offset="1" stopColor={colour} stopOpacity={0.72} />
      </linearGradient>,
      <linearGradient key={`${n}-dawn`} id={`b-${n}-dawn${ns}`} x1="0" x2="1" y1="0" y2="0">
        <stop offset="0" stopColor={colour} stopOpacity={0.72} />
        <stop offset="1" stopColor={colour} />
      </linearGradient>,
    ];
  });

  // ---- bands: classify the sun series, merge runs of equal band ----
  const bandRects: React.ReactNode[] = [];
  let bi = 0;
  while (bi < sunSeries.length) {
    const band = bandOf(sunAlt[bi]);
    let j = bi;
    while (j + 1 < sunSeries.length && bandOf(sunAlt[j + 1]) === band) j++;
    const aMs = bi === 0 ? t0.ms : sunTimes[bi];
    // Run's last sample is inside the band, so the right edge is the NEXT
    // sample; stopping at j leaves a one-sample gap.
    const bMs = j + 1 < sunSeries.length ? sunTimes[j + 1] : t1.ms;
    const x0 = frame.x(aMs), x1 = frame.x(bMs);
    const grad = aMs + (bMs - aMs) / 2 < midDayMs ? "dusk" : "dawn";
    bandRects.push(
      <rect key={`band${bi}`} x={f2(x0)} y={M_TOP} width={f2(Math.max(x1 - x0, 0.5))}
        height={PLOT_H} fill={`url(#b-${band}-${grad}${ns})`} />
    );
    if (band !== "civil" && bi > 0) {
      bandRects.push(
        <line key={`edge${bi}`} x1={f2(x0)} y1={M_TOP} x2={f2(x0)} y2={M_TOP + PLOT_H}
          stroke="#CBD5E1" strokeOpacity={0.13} strokeWidth={1} />
      );
    }
    bi = j + 1;
  }

  // ---- grid: 10° intervals, fixed for every night ----
  const gridEls: React.ReactNode[] = [];
  for (let alt = 0; alt <= Y_TOP; alt += 10) {
    const yy = sc.y(alt);
    const major = alt % 30 === 0;
    gridEls.push(
      <line key={`g${alt}`} x1={M_LEFT} y1={f2(yy)} x2={M_LEFT + PLOT_W} y2={f2(yy)}
        stroke={GRID} strokeOpacity={major ? 0.3 : 0.16} strokeWidth={1} strokeDasharray={major ? "5 6" : "1 6"} />,
      <text key={`t${alt}`} x={M_LEFT - 10} y={f2(yy + 4)} textAnchor="end" fontSize={11} fill={INK}>{alt}°</text>
    );
  }
  const yHorizon = sc.y(0);
  gridEls.push(
    <line key="horizon" x1={M_LEFT} y1={f2(yHorizon)} x2={M_LEFT + PLOT_W} y2={f2(yHorizon)}
      stroke="#CBD5E1" strokeOpacity={0.55} strokeWidth={1.4} />,
    <text key="hlabel" x={M_LEFT + PLOT_W - 4} y={f2(yHorizon - 7)} textAnchor="end"
      fontSize={9} fill={INK} letterSpacing="0.12em">HORIZON</text>
  );

  // ---- day-hour painting, broken at the night window ----
  const day: number[] = [];
  for (let i = 0; i < sunTimes.length; i++) if (sunAlt[i] > 0) day.push(sunTimes[i]);
  const dayRects: React.ReactNode[] = [];
  let k0 = 0;
  while (k0 < day.length) {
    let j = k0;
    while (j + 1 < day.length && day[j + 1] - day[j] <= 11 * 60 && !(day[j] < t1.ms && day[j + 1] > t0.ms)) j++;
    const x0 = frame.x(day[k0]), x1 = frame.x(day[j]);
    dayRects.push(
      <rect key={`day${k0}`} x={f2(x0)} y={M_TOP} width={f2(Math.max(x1 - x0, 0.5))}
        height={PLOT_H} fill="#27476E" opacity={0.28} />
    );
    k0 = j + 1;
  }

  // ---- sunset / sunrise: tick + label only, never a bar ----
  const sunTicks = ([
    [t0.ms, payload.sun.sunset, "sunset"],
    [t1.ms, payload.sun.sunrise, "sunrise"],
  ] as const).map(([ms, iso, kind]) => {
    const xx = frame.x(ms);
    return (
      <g key={kind}>
        <line x1={f2(xx)} y1={M_TOP + PLOT_H} x2={f2(xx)} y2={M_TOP + PLOT_H + 5}
          stroke={INK_BRIGHT} strokeOpacity={0.8} strokeWidth={1} />
        <text x={f2(xx)} y={M_TOP + PLOT_H + 18} textAnchor="middle" fontSize={10}
          fill={INK_BRIGHT} opacity={0.9}>{hhmmIso(iso)} {kind}</text>
      </g>
    );
  });

  // midnight of the fixed frame: always at plot centre
  const xMid = frame.x(midDayMs);
  const midnightEl = (
    <g>
      <line x1={f2(xMid)} y1={M_TOP} x2={f2(xMid)} y2={M_TOP + PLOT_H}
        stroke={GRID} strokeOpacity={0.3} strokeDasharray="4 5" />
      <text x={f2(xMid)} y={M_TOP - 6} textAnchor="middle" fontSize={10} fill={INK_BRIGHT}>{midIso}</text>
    </g>
  );

  // ---- moon path, truncated at the horizon ----
  const above = times
    .map((ms, i) => (moonAlt[i] >= 0 ? `${f2(frame.x(ms))},${f2(sc.y(moonAlt[i]))}` : null))
    .filter(Boolean)
    .join(" ");

  // ---- glyphs every two hours while above 0°, plus rise/set on horizon ----
  const marks: Mark[] = [];
  {
    // First whole wall-clock hour after sunset, then hourly; even hours mark.
    // render.py: (t0 + 1h).replace(minute=0,...) — i.e. the next hour boundary
    // in the payload's OWN offset space, where epoch ≡ wall + offSec.
    const offSec = isoOffsetMin(payload.nightStart) * 60;
    let hSec = (Math.floor((t0.ms + offSec) / 3600) + 1) * 3600 - offSec;
    while (hSec <= t1.ms) {
      const wallHour = Math.round((hSec + offSec) / 3600) % 24;
      if (wallHour % 2 === 0) {
        let best = 0, bestD = Infinity;
        for (let i = 0; i < times.length; i++) {
          const dd = Math.abs(times[i] - hSec);
          if (dd < bestD) { bestD = dd; best = i; }
        }
        if (samples[best].altitude > 0.0) {
          marks.push({ ms: times[best], alt: samples[best].altitude, illum: illum[best], big: false });
        }
      }
      hSec += 3600;
    }
  }
  for (const [key2, kind] of [["moonrise", "rise"], ["moonset", "set"]] as const) {
    for (const iso of payload.moon[key2]) {
      const tt = wallSec(iso);
      marks.push({ ms: tt, alt: 0.0, kind, big: true, illum: seriesValue(times, illum, tt) });
    }
  }
  // anti-crowd: nudge glyphs apart and clear of the sunset/sunrise labels.
  const placed: { cx: number; m: Mark }[] = [];
  for (const m of [...marks].sort((a, b) => frame.x(a.ms) - frame.x(b.ms))) {
    let cx = frame.x(m.ms);
    for (const p of placed) {
      if (Math.abs(cx - p.cx) < 24) cx += 24 - Math.abs(cx - p.cx);
    }
    for (const bx of [frame.x(t0.ms), frame.x(t1.ms)]) {
      if (Math.abs(cx - bx) < 30) cx = cx >= bx ? bx + 30 : bx - 30;
    }
    placed.push({ cx, m });
  }
  const glyphEls = placed.map(({ cx, m }, i) => {
    // Literal radius as render.py writes it: floats print "11.0"/"9.0".
    const rLit = m.big ? "11.0" : "9.0";
    const rNum = parseFloat(rLit);
    const cy = sc.y(m.alt);
    const d = terminator(m.illum, rLit, limb);
    return (
      <g key={`glyph${i}`} transform={`translate(${f2(cx)},${f2(cy)})`}>
        <circle r={rNum} fill="#161D2E" stroke={CURVE} strokeOpacity={0.3} />
        {d && <path d={d} fill={CURVE} filter={`url(#glow${ns})`} />}
        {m.kind ? (
          <text y={( -(rNum + 7)).toFixed(1)} textAnchor="middle" fontSize={9} fill={INK}>{m.kind}</text>
        ) : null}
      </g>
    );
  });

  // peak callout
  let peakEl: React.ReactNode = null;
  if (moonAlt.length && Math.max(...moonAlt) > 0) {
    let pi = 0;
    for (let i = 1; i < moonAlt.length; i++) if (moonAlt[i] > moonAlt[pi]) pi = i;
    const px = frame.x(times[pi]), peakY = sc.y(moonAlt[pi]);
    const labelY = Math.max(peakY - (11 + 9), M_TOP + 12);
    peakEl = (
      <g>
        <line x1={f2(px)} y1={f2(peakY)} x2={f2(px)} y2={f2(sc.y(Y_TOP))}
          stroke={GRID} strokeOpacity={0.28} strokeDasharray="2 4" />
        <text x={f2(px)} y={f2(labelY)} textAnchor="middle" fontSize={11} fill={INK_BRIGHT}>
          {moonAlt[pi].toFixed(1)}° at {hhmmIso(samples[pi].time)}
        </text>
      </g>
    );
  }

  // day labels on the footer's bottom line; dropped when crowded.
  const dayLabels: React.ReactNode[] = [];
  for (const [label, tMs] of [
    [`Day 1 · ${fmtIso(payload.frameNoon, "%d %b")}`, noonW + 12 * 3600],
    [`Day 2 · ${fmtIso(payload.nightEnd, "%d %b")}`, t1.ms + 12 * 3600],
  ] as const) {
    const xx = frame.x(tMs);
    const taken = [frame.x(t0.ms), frame.x(t1.ms), ...placed.map((p) => p.cx)];
    if (taken.some((u) => Math.abs(xx - u) < 60)) continue;
    dayLabels.push(
      <text key={label} x={f2(xx)} y={M_TOP + PLOT_H + 34} textAnchor="middle"
        fontSize={10} fill={INK} opacity={0.75}>{label}</text>
    );
  }

  // ---- header ----
  const title = `${payload.location.lat.toFixed(2)}, ${payload.location.lon.toFixed(2)}  ·  ` +
    `${fmtIso(payload.nightStart, "%a %d %b")} ${hhmmIso(payload.sun.sunset)} → ` +
    `${fmtIso(payload.nightEnd, "%a %d %b")} ${hhmmIso(payload.sun.sunrise)}`;
  const kMid = payload.moon.midnight.illumFraction;
  const right = M_LEFT + PLOT_W;

  // ---- footer: honest darkness notice ----
  let footer: React.ReactNode;
  if (hasDark) {
    const astro = payload.sun.events.filter((e) => e.band === "astronomical");
    const ds = astro.find((e) => e.edge === "start")!;
    const de = astro.find((e) => e.edge === "end")!;
    const hours = ((wallSec(de.time) - wallSec(ds.time)) / 3600).toFixed(1);
    footer = (
      <g>
        <text x={M_LEFT} y={H - 12} fontSize={11} fill={INK}>
          True darkness {hhmmIso(ds.time)} – {hhmmIso(de.time)}  ·  {hours} h
        </text>
        <text x={M_LEFT + PLOT_W} y={H - 12} textAnchor="end" fontSize={11} fill={INK}>
          moon {payload.summary.moonUpDuringDark ? "above" : "below"} the horizon during darkness
        </text>
      </g>
    );
  } else {
    let deepest = Infinity;
    for (let i = 0; i < sunTimes.length; i++) {
      if (sunTimes[i] >= t0.ms && sunTimes[i] <= t1.ms) deepest = Math.min(deepest, sunAlt[i]);
    }
    if (!isFinite(deepest)) deepest = payload.sun.deepestSunAltitude ?? 0;
    footer = (
      <g>
        <text x={M_LEFT} y={H - 24} fontSize={12} fontWeight={600} fill={NOW}>
          No astronomical darkness tonight (sun stays above −18°)
        </text>
        <text x={M_LEFT} y={H - 9} fontSize={11} fill={INK}>
          Lowest the sun reaches: {deepest.toFixed(1)}° · only {deepest > -18 ? "nautical" : "astronomical"} twilight at best
        </text>
        <text x={M_LEFT + PLOT_W} y={H - 9} textAnchor="end" fontSize={11} fill={INK}>
          planning for this night needs the brightest available sky window
        </text>
      </g>
    );
  }

  // now line — `now` arrives as wall-clock parts; place it on the same ruler.
  let nowEl: React.ReactNode = null;
  const nowW = now ? Date.UTC(now.y, now.mo - 1, now.d, now.h, now.m) / 1000 : NaN;
  if (now && !Number.isNaN(nowW) && nowW >= t0.ms && nowW <= t1.ms) {
    const nx = frame.x(nowW);
    nowEl = (
      <g>
        <line x1={f2(nx)} y1={M_TOP} x2={f2(nx)} y2={M_TOP + PLOT_H} clipPath={`url(#plot${ns})`}
          stroke={NOW} strokeWidth={1.3} strokeDasharray="4 4" />
        <text x={f2(nx + 5)} y={M_TOP + PLOT_H - 16} fontSize={10} fill={NOW}>
          now {pad2(now.h)}:{pad2(now.m)}
        </text>
      </g>
    );
  }

  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={W} height={H} viewBox={`0 0 ${W} ${H}`}
      fontFamily="Inter, Segoe UI, sans-serif" role="img"
      aria-label={ariaSummary(payload)}>
      <defs>
        {grads}
        <clipPath id={`plot${ns}`}><rect x={M_LEFT} y={M_TOP} width={PLOT_W} height={PLOT_H} /></clipPath>
        <filter id={`glow${ns}`} x="-60%" y="-60%" width="220%" height="220%">
          <feGaussianBlur stdDeviation="2.6" result="b" />
          <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
      </defs>
      <rect width={W} height={H} fill={PAGE_BG} />
      <g clipPath={`url(#plot${ns})`}>{bandRects}</g>
      <g>{gridEls}</g>
      <g>{dayRects}{sunTicks}{midnightEl}</g>
      <g clipPath={`url(#plot${ns})`}>
        {above && <polyline points={above} fill="none" stroke={CURVE} strokeWidth={1.8}
          strokeOpacity={0.92} strokeLinejoin="round" />}
      </g>
      <g>{glyphEls}</g>
      {peakEl}
      <g>{dayLabels}</g>
      <text x={M_LEFT} y={24} fontSize={13} fontWeight={600} fill={INK_BRIGHT}>{title}</text>
      <text x={right - 130} y={24} textAnchor="end" fontSize={12} fill={INK}>
        {phaseName(kMid, payload.moon.waxing)} · {(kMid * 100).toFixed(0)}% lit · limb {limb}
      </text>
      <g transform={`translate(${right - 18},20)`}>
        <circle r={9} fill="#161D2E" stroke={CURVE} strokeOpacity={0.3} />
        <path d={terminator(kMid, 9, limb)} fill={CURVE} />
      </g>
      {footer}
      {nowEl}
    </svg>
  );
}

/** NFR4: a screen-reader summary of the night in words. */
function ariaSummary(p: NightPayload): string {
  return [
    `Night of ${fmtIso(p.nightStart, "%a %d %b")}: sunset ${hhmmIso(p.sun.sunset)}, sunrise ${hhmmIso(p.sun.sunrise)}.`,
    p.sun.trueDarkness
      ? `Astronomical darkness for ${p.summary.darkMinutes} minutes.`
      : "No astronomical darkness tonight.",
    `Moon ${(p.moon.midnight.illumFraction * 100).toFixed(0)} percent illuminated at midnight, lit on the ${p.moon.limb} limb.`,
  ].join(" ");
}
