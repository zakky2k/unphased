"use client";

// FR1: location with local persistence, defaulting to the repository's
// reference site (Prague). FR2: date selection defaulting to tonight.

export interface Location {
  lat: number;
  lon: number;
  tz: string;
}

export const DEFAULT_LOCATION: Location = { lat: 50.0875, lon: 14.4213, tz: "Europe/Prague" };

const KEY = "unphased/location";

export function loadLocation(): Location {
  if (typeof window === "undefined") return DEFAULT_LOCATION;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return DEFAULT_LOCATION;
    const v = JSON.parse(raw);
    if (typeof v.lat === "number" && typeof v.lon === "number" && typeof v.tz === "string") {
      return v as Location;
    }
  } catch {
    /* fall through to default */
  }
  return DEFAULT_LOCATION;
}

export function saveLocation(loc: Location): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(loc));
  } catch {
    /* storage unavailable (private mode); the session still works */
  }
}

/** Today's date at a named zone as YYYY-MM-DD, without trusting the browser
 *  zone: Intl gives us the observer's wall clock directly. */
export function todayInZone(tz: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(new Date());
  const get = (t: string) => parts.find((p) => p.type === t)!.value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}

/** Shift YYYY-MM-DD by whole calendar days. */
export function shiftDate(date: string, days: number): string {
  const [y, m, d] = date.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}-${String(dt.getUTCDate()).padStart(2, "0")}`;
}
