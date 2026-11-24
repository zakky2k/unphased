// Offline IANA zone catalogue for the ZONE control (review 24 Nov, round 7,
// item 4: "replace the zone text input with a dropdown... link the entered
// location to automatically choose the relevant UTC offset").
//
// Why NAMED zones and not a plain "UTC Offset" list: a fixed offset cannot
// follow the summer/winter switch the reviewer asked to keep working (item 3),
// and `planner/night.py` only accepts an IANA name (`pytz.timezone`). A named
// zone carries its own DST rules, so the dropdown is DST-correct for free and
// the §6 API contract does not move.
//
// Everything here is static data plus Intl — no network call, no geo service,
// no bundle fetch. The table is a curated list of ~70 representative sites per
// zone; the nearest entry to the typed lat/lon wins, which is a good enough
// proxy for "the zone that covers this point" for an observing-site planner.

export interface ZoneSite {
  /** IANA name, exactly what the planner's pytz.timezone() expects. */
  zone: string;
  /** Representative coordinates for the nearest-zone lookup. */
  lat: number;
  lon: number;
}

/** Sorted for display by zone name; the dropdown re-sorts by live offset. */
export const ZONE_TABLE: readonly ZoneSite[] = [
  // — prime meridian / ocean fallback —
  { zone: "UTC", lat: 0, lon: 0 },

  // — Europe —
  { zone: "Europe/London", lat: 51.5074, lon: -0.1278 },
  { zone: "Europe/Dublin", lat: 53.3498, lon: -6.2603 },
  { zone: "Europe/Lisbon", lat: 38.7223, lon: -9.1393 },
  { zone: "Europe/Madrid", lat: 40.4168, lon: -3.7038 },
  { zone: "Europe/Paris", lat: 48.8566, lon: 2.3522 },
  { zone: "Europe/Brussels", lat: 50.8503, lon: 4.3517 },
  { zone: "Europe/Amsterdam", lat: 52.3676, lon: 4.9041 },
  { zone: "Europe/Oslo", lat: 59.9139, lon: 10.7522 },
  { zone: "Europe/Stockholm", lat: 59.3293, lon: 18.0686 },
  { zone: "Europe/Berlin", lat: 52.52, lon: 13.405 },
  { zone: "Europe/Copenhagen", lat: 55.6761, lon: 12.5683 },
  { zone: "Europe/Prague", lat: 50.0875, lon: 14.4213 },
  { zone: "Europe/Vienna", lat: 48.2082, lon: 16.3738 },
  { zone: "Europe/Warsaw", lat: 52.2297, lon: 21.0122 },
  { zone: "Europe/Budapest", lat: 47.4979, lon: 19.0402 },
  { zone: "Europe/Rome", lat: 41.9028, lon: 12.4964 },
  { zone: "Europe/Athens", lat: 37.9838, lon: 23.7275 },
  { zone: "Europe/Helsinki", lat: 60.1699, lon: 24.9384 },
  { zone: "Europe/Kyiv", lat: 50.4501, lon: 30.5234 },
  { zone: "Europe/Bucharest", lat: 44.4268, lon: 26.1025 },
  { zone: "Europe/Sofia", lat: 42.6977, lon: 23.3219 },
  { zone: "Europe/Belgrade", lat: 44.7866, lon: 20.4489 },
  { zone: "Europe/Zagreb", lat: 45.815, lon: 15.9819 },
  { zone: "Europe/Sarajevo", lat: 43.8563, lon: 18.4131 },
  { zone: "Europe/Vilnius", lat: 54.6872, lon: 23.286 },
  { zone: "Europe/Riga", lat: 56.9496, lon: 24.1052 },
  { zone: "Europe/Minsk", lat: 53.9006, lon: 27.559 },
  { zone: "Europe/Moscow", lat: 55.7558, lon: 37.6173 },
  { zone: "Europe/Istanbul", lat: 41.0082, lon: 28.9784 },

  // — Africa —
  { zone: "Africa/Casablanca", lat: 33.5731, lon: -7.5898 },
  { zone: "Africa/Nouakchott", lat: 18.0735, lon: -15.9582 },
  { zone: "Africa/Algiers", lat: 36.7538, lon: 3.0588 },
  { zone: "Africa/Tunis", lat: 36.8065, lon: 10.1815 },
  { zone: "Africa/Tripoli", lat: 32.8872, lon: 13.1913 },
  { zone: "Africa/Cairo", lat: 30.0444, lon: 31.2357 },
  { zone: "Africa/Lagos", lat: 6.5244, lon: 3.3792 },
  { zone: "Africa/Kinshasa", lat: -4.4419, lon: 15.2663 },
  { zone: "Africa/Nairobi", lat: -1.2864, lon: 36.8172 },
  { zone: "Africa/Addis_Ababa", lat: 9.032, lon: 38.7469 },
  { zone: "Africa/Johannesburg", lat: -26.2041, lon: 28.0473 },
  { zone: "Africa/Windhoek", lat: -22.57, lon: 17.0832 },

  // — Asia —
  { zone: "Asia/Jerusalem", lat: 31.7683, lon: 35.2137 },
  { zone: "Asia/Amman", lat: 31.9539, lon: 35.9106 },
  { zone: "Asia/Beirut", lat: 33.8938, lon: 35.5018 },
  { zone: "Asia/Tehran", lat: 35.6892, lon: 51.389 },
  { zone: "Asia/Dubai", lat: 25.2048, lon: 55.2708 },
  { zone: "Asia/Karachi", lat: 24.8607, lon: 67.0011 },
  { zone: "Asia/Kolkata", lat: 28.6139, lon: 77.209 },
  { zone: "Asia/Kathmandu", lat: 27.7172, lon: 85.324 },
  { zone: "Asia/Dhaka", lat: 23.8103, lon: 90.4125 },
  { zone: "Asia/Almaty", lat: 43.222, lon: 76.8512 },
  { zone: "Asia/Yekaterinburg", lat: 56.8389, lon: 60.6057 },
  { zone: "Asia/Bangkok", lat: 13.7563, lon: 100.5018 },
  { zone: "Asia/Jakarta", lat: -6.2088, lon: 106.8456 },
  { zone: "Asia/Singapore", lat: 1.3521, lon: 103.8198 },
  { zone: "Asia/Shanghai", lat: 31.2304, lon: 121.4737 },
  { zone: "Asia/Hong_Kong", lat: 22.3193, lon: 114.1694 },
  { zone: "Asia/Taipei", lat: 25.033, lon: 121.5654 },
  { zone: "Asia/Manila", lat: 14.5995, lon: 120.9842 },
  { zone: "Asia/Seoul", lat: 37.5665, lon: 126.978 },
  { zone: "Asia/Tokyo", lat: 35.6762, lon: 139.6503 },
  { zone: "Asia/Novosibirsk", lat: 55.0084, lon: 82.9357 },
  { zone: "Asia/Irkutsk", lat: 52.287, lon: 104.305 },
  { zone: "Asia/Vladivostok", lat: 43.1155, lon: 131.8855 },
  { zone: "Asia/Kamchatka", lat: 53.0106, lon: 158.651 },

  // — Oceania —
  { zone: "Australia/Perth", lat: -31.9505, lon: 115.8605 },
  { zone: "Australia/Darwin", lat: -12.4634, lon: 130.8456 },
  { zone: "Australia/Adelaide", lat: -34.9285, lon: 138.6007 },
  { zone: "Australia/Brisbane", lat: -27.4698, lon: 153.0251 },
  { zone: "Australia/Sydney", lat: -33.8688, lon: 151.2093 },
  { zone: "Australia/Melbourne", lat: -37.8136, lon: 144.9631 },
  { zone: "Pacific/Auckland", lat: -36.8485, lon: 174.7633 },
  { zone: "Pacific/Fiji", lat: -18.1248, lon: 178.4501 },
  { zone: "Pacific/Chatham", lat: -43.9535, lon: -176.5596 },
  { zone: "Pacific/Tongatapu", lat: -21.139, lon: -175.2 },
  { zone: "Pacific/Apia", lat: -13.85, lon: -171.7524 },
  { zone: "Pacific/Kiritimati", lat: 1.872, lon: -157.4077 },
  { zone: "Pacific/Marquesas", lat: -9.0, lon: -140.5 },
  { zone: "Pacific/Tahiti", lat: -17.535, lon: -149.5695 },
  { zone: "Pacific/Honolulu", lat: 21.3069, lon: -157.8583 },

  // — Americas —
  { zone: "America/St_Johns", lat: 47.5615, lon: -52.7122 },
  { zone: "America/Nuuk", lat: 64.1836, lon: -51.7214 },
  { zone: "America/New_York", lat: 40.7128, lon: -74.006 },
  { zone: "America/Toronto", lat: 43.6532, lon: -79.3832 },
  { zone: "America/Chicago", lat: 41.8781, lon: -87.6298 },
  { zone: "America/Mexico_City", lat: 19.4326, lon: -99.1332 },
  { zone: "America/Denver", lat: 39.7392, lon: -104.9903 },
  { zone: "America/Phoenix", lat: 33.4484, lon: -112.074 },
  { zone: "America/Los_Angeles", lat: 34.0522, lon: -118.2437 },
  { zone: "America/Anchorage", lat: 61.2181, lon: -149.9003 },
  { zone: "America/Bogota", lat: 4.711, lon: -74.0721 },
  { zone: "America/Lima", lat: -12.0464, lon: -77.0428 },
  { zone: "America/Caracas", lat: 10.4806, lon: -66.9036 },
  { zone: "America/Sao_Paulo", lat: -23.5505, lon: -46.6333 },
  { zone: "America/Argentina/Buenos_Aires", lat: -34.6037, lon: -58.3816 },
  { zone: "America/Santiago", lat: -33.4489, lon: -70.6693 },

  // — Antarctica (observing sites are the whole point of this app) —
  { zone: "Antarctica/Rothera", lat: -67.525, lon: -68.156 },
  { zone: "Antarctica/Troll", lat: -72.012, lon: 2.535 },
  { zone: "Antarctica/Vostok", lat: -78.4583, lon: 106.8539 },
  { zone: "Antarctica/McMurdo", lat: -77.85, lon: 166.6667 },
  { zone: "Antarctica/Palmer", lat: -64.7791, lon: -64.0505 },
];

/** Whole/quarter-hour zone offsets are enough; everything is in minutes. */
const offsetMinutesCache = new Map<string, number>();

/** UTC offset of `zone` at the instant `atMs`, in minutes (Intl owns DST). */
export function zoneOffsetMinutes(zone: string, atMs: number): number {
  const key = `${zone}@${Math.floor(atMs / 3.6e6)}`;   // 1 h resolution
  const hit = offsetMinutesCache.get(key);
  if (hit !== undefined) return hit;
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: zone,
    hourCycle: "h23",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  });
  const parts: Record<string, string> = {};
  for (const p of fmt.formatToParts(new Date(atMs))) parts[p.type] = p.value;
  const asUtc = Date.UTC(
    Number(parts.year), Number(parts.month) - 1, Number(parts.day),
    Number(parts.hour) % 24, Number(parts.minute), Number(parts.second),
  );
  // The wall clock of the zone read as if it were UTC, minus the real instant.
  const minutes = Math.round((asUtc - atMs) / 60000);
  offsetMinutesCache.set(key, minutes);
  return minutes;
}

/** "UTC+1", "UTC+5:30", "UTC-9:30", "UTC+0" — compact, no design ambiguity. */
export function formatZoneOffset(minutes: number): string {
  const sign = minutes < 0 ? "-" : "+";
  const abs = Math.abs(minutes);
  const h = Math.floor(abs / 60);
  const m = abs % 60;
  return `UTC${sign}${h}${m ? `:${String(m).padStart(2, "0")}` : ""}`;
}

export interface ZoneOption {
  value: string;
  /** `Europe/Prague · UTC+1` — the name and the offset the reviewer asked for. */
  label: string;
  offsetMin: number;
}

/**
 * The dropdown's option list, ordered by the offset in force on `atMs`
 * (ascending), which is what "centred on UTC" means in practice: the list
 * runs west-to-east and `UTC` sits in the middle of it. Recomputed when the
 * selected NIGHT changes, so the offset shown is the one that night actually
 * uses — a June list reads `Europe/Prague · UTC+2`, a November one `UTC+1`.
 */
export function zoneOptions(atMs: number, extraZone?: string): ZoneOption[] {
  // The date input can be empty or half-typed; a malformed night must not
  // take the control down, so fall back to the offset in force right now.
  const at = Number.isFinite(atMs) ? atMs : Date.now();
  const zones = new Set<string>(ZONE_TABLE.map((z) => z.zone));
  // A zone saved by an older build (or typed by hand) must survive the switch
  // to a dropdown instead of silently snapping to the first option.
  if (extraZone && !zones.has(extraZone)) zones.add(extraZone);
  const options: ZoneOption[] = [];
  for (const zone of zones) {
    const offsetMin = zoneOffsetMinutes(zone, at);
    options.push({ value: zone, label: `${zone} · ${formatZoneOffset(offsetMin)}`, offsetMin });
  }
  return options.sort((a, b) => a.offsetMin - b.offsetMin || (a.value < b.value ? -1 : 1));
}

/** True when `zone` is one of the dropdown's entries. */
export const isKnownZone = (zone: string): boolean =>
  ZONE_TABLE.some((z) => z.zone === zone);

/**
 * Nearest table entry to a point — plain angular distance with the longitude
 * squashed by cos(lat), which is all this needs to pick a civil zone. Always
 * returns a listed zone; a position that is not a number falls back to `UTC`.
 */
const wrap180 = (deg: number): number => ((((deg + 180) % 360) + 360) % 360) - 180;

export function nearestZone(lat: number, lon: number): string {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return "UTC";
  const clampedLat = Math.min(90, Math.max(-90, lat));
  const k = Math.cos((clampedLat * Math.PI) / 180);
  let best = "UTC";
  let bestScore = Number.POSITIVE_INFINITY;
  for (const site of ZONE_TABLE) {
    const dLat = clampedLat - site.lat;
    const dLon = wrap180(lon - site.lon);   // shortest way round the globe
    const score = dLat * dLat + (dLon * k) * (dLon * k);
    if (score < bestScore) {
      bestScore = score;
      best = site.zone;
    }
  }
  return best;
}
