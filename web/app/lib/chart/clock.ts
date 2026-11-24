// Wall-clock helpers for the live chart: everything that turns an epoch
// instant into observer-local text, plus the focus record the scrubber keeps.
// Pure (Intl only), so the clock-law behaviour — minute resolution, 12/24 h,
// tolerant parsing — is unit-testable (scripts/units.ts).

import { parseLocal, type LocalTime } from "@/components/night-chart/NightChart";

export const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** Wall-clock parts (observer zone) of an epoch instant, via Intl. The LocalTime
 *  type carries no seconds, so read them straight from the sv-SE ISO string. */
export function wallParts(ms: number, tz: string): LocalTime & { s: number } {
  const iso = new Intl.DateTimeFormat("sv-SE", {
    timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
  }).format(new Date(ms));
  const sec = +iso.slice(19, 21);
  return { ...parseLocal(`${iso.replace(" ", "T")}+00:00`), s: sec };
}

export const hhmm = (sec: number, tz: string) => {
  const p = wallParts(sec * 1000, tz);
  return `${String(p.h).padStart(2, "0")}:${String(p.m).padStart(2, "0")}`;
};

/** Full clock for the TIME field: HH:MM in 24 h mode, h:mm AM/PM in 12 h
 *  mode. Review 24 Nov round 4: seconds REMOVED everywhere — the live clock
 *  ticks once per wall-clock minute, so a seconds readout would just sit at
 *  :00 with no visual resolution or benefit. */
export function fmtClock(sec: number, tz: string, h12: boolean): string {
  const p = wallParts(sec * 1000, tz);
  if (!h12) return `${String(p.h).padStart(2, "0")}:${String(p.m).padStart(2, "0")}`;
  const suf = p.h >= 12 ? "PM" : "AM";
  const h = p.h % 12 === 0 ? 12 : p.h % 12;
  return `${String(h).padStart(2, "0")}:${String(p.m).padStart(2, "0")} ${suf}`;
}

/** UTC clock for everything DRAWN ON THE CHART (review 24 Nov, round 5): the
 *  plot's timescale is UTC so a chart is readable without knowing the site's
 *  zone. The chart's DATES stay the observer's local night, so the rule printed
 *  on screen is: dates name the night (local), clocks are UTC. */
export const hhmmUtc = (sec: number) => {
  const p = wallParts(sec * 1000, "UTC");
  return `${String(p.h).padStart(2, "0")}:${String(p.m).padStart(2, "0")}`;
};

/** Parse HH:MM[:SS] or h:mm[:SS] AM/PM into wall-clock fields. */
export function parseClock(v: string): { h: number; m: number; s: number } | null {
  const m = /^(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)?$/i.exec(v.trim());
  if (!m) return null;
  let h = +m[1];
  const mi = +m[2], s = m[3] ? +m[3] : 0;
  const suf = m[4]?.toUpperCase();
  if (suf) {
    if (h < 1 || h > 12 || mi > 59 || s > 59) return null;
    if (suf === "PM" && h !== 12) h += 12;
    if (suf === "AM" && h === 12) h = 0;
  } else if (h > 23 || mi > 59 || s > 59) return null;
  return { h, m: mi, s };
}

/** Focus time in observer wall-clock fields + fractional seconds. */
export interface Focus { y: number; mo: number; d: number; h: number; mi: number; s: number }

/** Wall-clock fields + seconds in `tz` → the REAL instant they name.
 *  Fixed-point: guess the instant as if the fields were UTC, measure how far its
 *  own wall reading sits from the target, step back by exactly that, repeat. Two
 *  passes handle a plain zone offset, the third covers landing on a DST edge.
 *  This is what keeps the scrub axis honest — see the round-5 fix in HANDOFF. */
export function epochAtWall(
  y: number, mo: number, d: number, h: number, mi: number, s: number, tz: string,
): number {
  const target = Date.UTC(y, mo - 1, d, h, mi, 0);
  let e = target;
  for (let i = 0; i < 3; i++) {
    const w = wallParts(e, tz);
    const drift = Date.UTC(w.y, w.mo - 1, w.d, w.h, w.m, 0) - target;
    if (drift === 0) break;
    e -= drift;
  }
  return e / 1000 + s;
}

/** The scrubbed focus → the REAL instant it names (zone-aware, so it lands on
 *  the same axis the frame and every payload sample live on). */
export const focusSec = (f: Focus, tz: string) => epochAtWall(f.y, f.mo, f.d, f.h, f.mi, f.s, tz);

/** Epoch seconds → the focus record the scrubber stores. */
export const focusAt = (sec: number, tz: string): Focus => {
  const p = wallParts(sec * 1000, tz);
  return { y: p.y, mo: p.mo, d: p.d, h: p.h, mi: p.m, s: sec % 60 };
};

/** ISO calendar-day stamp of an epoch second, read as UTC — the dates the frame
 *  itself prints (its edges and centre are UTC instants, round 6). */
export const utcDayStamp = (sec: number): string =>
  new Date(Math.floor(sec) * 1000).toISOString().slice(0, 10);

/** UTC calendar day (0-6 weekday, day-of-month, month) of a stamp, for the
 *  header labels — the payload's own designators decide the wording, so no
 *  zone conversion happens here. */
export const dayOfWeek = (stamp: string) =>
  DAYS[new Date(Date.UTC(+stamp.slice(0, 4), +stamp.slice(5, 7) - 1, +stamp.slice(8, 10))).getUTCDay()];
export const monthOf = (stamp: string) => MONTHS[+stamp.slice(5, 7) - 1];
