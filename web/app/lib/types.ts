// The §6 API contract (docs/REQUIREMENTS.md section 6), plus the extra fields
// the design probe emits (frameNoon, sun.series, waxing) that the fixed-scale
// renderer needs. Times are ISO 8601 with an explicit observer offset; the
// client parses them into Date objects and never re-derives astronomy.

export type Band = "civil" | "nautical" | "astronomical" | "night";

export interface TwilightEvent {
  band: Exclude<Band, "night">;
  edge: "start" | "end";
  time: string;
}

export interface MoonSample {
  time: string;
  altitude: number;
  azimuth: number;
  illumFraction: number;
  phaseAngle: number;
}

export interface NightPayload {
  location: { lat: number; lon: number; tz: string };
  frameNoon: string; // local noon anchoring the fixed two-day x frame
  nightStart: string; // sunset
  nightEnd: string; // sunrise
  sun: {
    sunset: string;
    sunrise: string;
    events: TwilightEvent[];
    trueDarkness: boolean;
    deepestSunAltitude?: number;
    series: { time: string; altitude: number }[];
  };
  moon: {
    samples: MoonSample[];
    moonrise: string[];
    moonset: string[];
    limb: "left" | "right";
    waxing: boolean;
    midnight: { time: string; illumFraction: number; altitude: number; azimuth: number };
  };
  summary: { darkMinutes: number; moonUpDuringDark: boolean | null };
}

export interface ApiError {
  error: { code: string; message: string };
}
