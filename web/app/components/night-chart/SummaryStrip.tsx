"use client";

// FR6 summary strip: sunset, sunrise, darkness start/end, total dark minutes,
// moonrise, moonset, Moon illumination at local midnight.
//
// Round 5 (review 24 Nov): every clock here is on the chart's UTC scale, so the
// strip, the chart axis and the chart's own timestamps all read one scale — and a
// night at any site can be compared without doing zone maths. Round 7 (24 Nov)
// took the "UTC" wording out of the labels: the scale is named once, in the
// header's LOCAL TIME label. The one local-time control in the app is that box.
// Every value comes from the payload; nothing is recomputed.

import type { NightPayload } from "@/lib/types";

/** HH:MM of an ISO instant, on the UTC scale (the payload stamps carry their own
 *  zone offset, so Date.parse + toISOString is the whole conversion). */
function hhmmUtc(iso: string): string {
  const s = Date.parse(iso);
  return Number.isNaN(s) ? "—" : new Date(s).toISOString().slice(11, 16);
}

export function SummaryStrip({ payload }: { payload: NightPayload }) {
  const astro = payload.sun.events.filter((e) => e.band === "astronomical");
  const darkStart = astro.find((e) => e.edge === "start")?.time;
  const darkEnd = astro.find((e) => e.edge === "end")?.time;
  // The moonrise/set that belong to THIS night's frame (noon -> noon+1): the
  // API series spans noon -> noon+2, so pick events inside the displayed
  // window instead of blindly taking [0].
  const inFrame = (iso?: string) => {
    if (!iso) return false;
    const s = Date.parse(iso) / 1000;
    const a = Date.parse(payload.frameNoon) / 1000;
    return s >= a && s <= a + 86_400;
  };
  const rise = payload.moon.moonrise.find(inFrame);
  const set = payload.moon.moonset.find(inFrame);

  const cells: { label: string; value: string }[] = [
    { label: "Sunset", value: hhmmUtc(payload.sun.sunset) },
    { label: "Sunrise", value: hhmmUtc(payload.sun.sunrise) },
    { label: "Darkness begins", value: darkStart ? hhmmUtc(darkStart) : "none" },
    { label: "Darkness ends", value: darkEnd ? hhmmUtc(darkEnd) : "none" },
    { label: "Dark minutes", value: String(payload.summary.darkMinutes) },
    { label: "Moonrise", value: rise ? hhmmUtc(rise) : "—" },
    { label: "Moonset", value: set ? hhmmUtc(set) : "—" },
    { label: "Moon at midnight", value: `${(payload.moon.midnight.illumFraction * 100).toFixed(0)}%` },
  ];

  return (
    <div className="strip" role="group" aria-label="Tonight at a glance">
      {cells.map((c) => (
        <div key={c.label} className="cell">
          <span className="cell-label">{c.label}</span>
          <span className="cell-value">{c.value}</span>
        </div>
      ))}
    </div>
  );
}
