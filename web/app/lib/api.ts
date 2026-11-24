// Client-side access to the planner API (the §6 contract is the only coupling).
// The Python server runs separately; its base URL is configurable so the
// deployment decision (REQUIREMENTS.md open question 1) stays reversible.

import type { ApiError, NightPayload } from "./types";

export const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE ?? "http://127.0.0.1:8642";

export interface NightQuery {
  date?: string; // YYYY-MM-DD; omit for tonight at the observer's location
  lat: number;
  lon: number;
  tz: string;
}

export class ApiFailure extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
  }
}

export async function fetchNight(q: NightQuery): Promise<NightPayload> {
  const params = new URLSearchParams({ lat: String(q.lat), lon: String(q.lon), tz: q.tz });
  if (q.date) params.set("date", q.date);
  const res = await fetch(`${API_BASE}/api/night?${params}`);
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    const err = (body as ApiError | null)?.error;
    throw new ApiFailure(err?.code ?? "http_" + res.status, err?.message ?? `request failed (${res.status})`);
  }
  return body as NightPayload;
}
