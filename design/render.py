"""Render a night chart from a probe JSON file to standalone SVG.

A design probe, but the geometry is the reference the TypeScript front end
will be ported from: the scales, band colours, terminator path and tick
rhythm all come from docs/REQUIREMENTS.md section 4.

Scale decisions (23 Nov):
- x axis is FIXED at local noon -> noon+1 -> noon+2 (two 24-hour days), so
  scrolling night by night only the bands and the moon curve move; the grid,
  labels and plot frame never do.
- y axis truncates at 0 degrees: anything below the horizon simply does not
  exist on this chart. The moon curve is clipped to alt > 0, and rise/set
  markers sit exactly on the horizon line.
"""

import argparse
import json
import os
from datetime import datetime, timedelta

from palette import BANDS, CURVE, band_of

W, H = 980, 470
M_LEFT, M_RIGHT, M_TOP, M_BOTTOM = 56, 24, 40, 48
PLOT_W = W - M_LEFT - M_RIGHT
PLOT_H = H - M_TOP - M_BOTTOM
Y_TOP = 90.0

GROUND = "#0D1220"
INK = "#8C9BB4"
INK_BRIGHT = "#E2E8F0"
GRID = "#94A3B8"
NOW = "#F87171"


def parse(iso):
    return datetime.fromisoformat(iso)


class Scale:
    """x is wall clock on a fixed two-day frame (noon -> noon+2); y is
    altitude, truncated at the horizon. Because the frame is fixed, every
    night renders at identical pixel geometry and date scrolling is a pure
    translation of the bands and the curve."""

    def __init__(self, t0, t1):
        self.t0, self.t1 = t0, t1
        self.span = (t1 - t0).total_seconds()

    def x(self, t):
        return M_LEFT + PLOT_W * (t - self.t0).total_seconds() / self.span

    def y(self, alt):
        return M_TOP + PLOT_H * (1.0 - max(alt, 0.0) / Y_TOP)


def terminator(k, r, limb):
    """Path for the lit part of the disc: the limb semicircle closed by a
    half-ellipse with semi-minor axis r * |2k - 1|. Verified by mooncheck.py."""
    if k <= 0.004:
        return ""
    if k >= 0.996:
        return f"M 0,{-r} A {r},{r} 0 1 1 0,{r} A {r},{r} 0 1 1 0,{-r} Z"
    rx = r * abs(2.0 * k - 1.0)
    if limb == "right":
        limb_sweep, term_sweep = 1, (1 if k > 0.5 else 0)
    else:
        limb_sweep, term_sweep = 0, (0 if k > 0.5 else 1)
    d = f"M 0,{-r} A {r},{r} 0 0 {limb_sweep} 0,{r}"
    return d + (f" L 0,{-r} Z" if rx < 0.05
                else f" A {rx:.2f},{r} 0 0 {term_sweep} 0,{-r} Z")


def series_value(times, values, t):
    for i in range(1, len(times)):
        if times[i - 1] <= t <= times[i]:
            f = ((t - times[i - 1]).total_seconds()
                 / (times[i] - times[i - 1]).total_seconds())
            return values[i - 1] + f * (values[i] - values[i - 1])
    return values[-1]


def hhmm(t):
    return t.strftime("%H:%M")


def phase_name(k, waxing):
    if k < 0.02:
        return "New moon"
    if k > 0.98:
        return "Full moon"
    word = "Waxing" if waxing else "Waning"
    if abs(k - 0.5) < 0.04:
        return word + " quarter"
    return word + (" crescent" if k < 0.5 else " gibbous")


def render(payload, now=None, ns=""):
    """ns suffixes the defs ids (gradients, clipPath, filter) so several
    rendered charts can be inlined in one HTML document without colliding."""
    t0, t1 = parse(payload["nightStart"]), parse(payload["nightEnd"])
    noon0 = parse(payload["frameNoon"])
    frame = Scale(noon0, noon0 + timedelta(days=2))
    sc = Scale(t0, t1)

    samples = payload["moon"]["samples"]
    times = [parse(s["time"]) for s in samples]
    moon_alt = [s["altitude"] for s in samples]
    illum = [s["illumFraction"] for s in samples]
    sun_series = payload["sun"]["series"]
    sun_times = [parse(s["time"]) for s in sun_series]
    sun_alt = [s["altitude"] for s in sun_series]

    limb = payload["moon"]["limb"]
    has_dark = payload["sun"]["trueDarkness"]

    out = []
    add = out.append
    add(f'<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" '
        f'viewBox="0 0 {W} {H}" font-family="Inter, Segoe UI, sans-serif">')
    add("<defs>")
    for name, _, colour in BANDS:
        # Dusk warms slightly toward the horizon, dawn warms away from it, so
        # the gradient direction reads as "where the sun went".
        add(f'<linearGradient id="b-{name}-dusk{ns}" x1="0" x2="1" y1="0" y2="0">'
            f'<stop offset="0" stop-color="{colour}"/>'
            f'<stop offset="1" stop-color="{colour}" stop-opacity="0.72"/></linearGradient>')
        add(f'<linearGradient id="b-{name}-dawn{ns}" x1="0" x2="1" y1="0" y2="0">'
            f'<stop offset="0" stop-color="{colour}" stop-opacity="0.72"/>'
            f'<stop offset="1" stop-color="{colour}"/></linearGradient>')
    add(f'<clipPath id="plot{ns}"><rect x="{M_LEFT}" y="{M_TOP}" width="{PLOT_W}" '
        f'height="{PLOT_H}"/></clipPath>')
    add(f'<filter id="glow{ns}" x="-60%" y="-60%" width="220%" height="220%">'
        '<feGaussianBlur stdDeviation="2.6" result="b"/><feMerge>'
        '<feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>')
    add("</defs>")
    add(f'<rect width="{W}" height="{H}" fill="#0A0E18"/>')

    # ---- bands: classify the sun series, then merge runs of equal band ----
    add(f'<g clip-path="url(#plot{ns})">')
    y_horizon = sc.y(0)
    mid_day = noon0 + timedelta(days=1)
    i = 0
    while i < len(sun_series):
        band = band_of(sun_alt[i])
        j = i
        while j + 1 < len(sun_series) and band_of(sun_alt[j + 1]) == band:
            j += 1
        a = sun_times[i] if i else t0
        # The run's last sample is still inside the band, so the band's right
        # edge is the NEXT sample; stopping at sample j leaves a one-sample gap
        # between adjacent bands.
        b = sun_times[j + 1] if j + 1 < len(sun_series) else t1
        x0, x1 = frame.x(a), frame.x(b)
        grad = "dusk" if a + (b - a) / 2 < mid_day else "dawn"
        add(f'<rect x="{x0:.2f}" y="{M_TOP}" width="{max(x1 - x0, 0.5):.2f}" '
            f'height="{PLOT_H}" fill="url(#b-{band}-{grad}{ns})"/>')
        if band != "civil" and i:
            # The edge where the sky crossed a depression threshold.
            add(f'<line x1="{x0:.2f}" y1="{M_TOP}" x2="{x0:.2f}" y2="{M_TOP + PLOT_H}" '
                f'stroke="#CBD5E1" stroke-opacity="0.13" stroke-width="1"/>')
        i = j + 1
    add("</g>")

    # ---- grid: 10 degree intervals up the y axis, fixed for every night ----
    add("<g>")
    for alt in range(0, int(Y_TOP) + 1, 10):
        yy = sc.y(alt)
        major = alt % 30 == 0
        add(f'<line x1="{M_LEFT}" y1="{yy:.2f}" x2="{M_LEFT + PLOT_W}" y2="{yy:.2f}" '
            f'stroke="{GRID}" stroke-opacity="{0.30 if major else 0.16}" stroke-width="1" '
            f'stroke-dasharray="{5 if major else 1} 6"/>')
        add(f'<text x="{M_LEFT - 10}" y="{yy + 4:.2f}" text-anchor="end" font-size="11" '
            f'fill="{INK}">{alt}&#176;</text>')
    add(f'<line x1="{M_LEFT}" y1="{y_horizon:.2f}" x2="{M_LEFT + PLOT_W}" '
        f'y2="{y_horizon:.2f}" stroke="#CBD5E1" stroke-opacity="0.55" stroke-width="1.4"/>')
    add(f'<text x="{M_LEFT + PLOT_W - 4}" y="{y_horizon - 7:.2f}" text-anchor="end" '
        f'font-size="9" fill="{INK}" letter-spacing="0.12em">HORIZON</text>')
    add("</g>")

    # ---- time axis: fixed frame, one day per half of the plot ----
    add("<g>")
    # Daylight hours (sun above 0 deg) outside the night window are painted
    # with the lightest band at low opacity so the two-day rhythm stays
    # readable while scrolling; sunset/sunrise ticks mark the edges.
    day = [(tt, a) for tt, a in zip(sun_times, sun_alt) if a > 0]
    k = 0
    while k < len(day):
        j = k
        # Break the run where it would overlap the night window itself;
        # otherwise daylight paint covers tonight's twilight bands.
        while (j + 1 < len(day)
               and (day[j + 1][0] - day[j][0]) <= timedelta(minutes=11)
               and not (day[j][0] < t1 and day[j + 1][0] > t0)):
            j += 1
        x0, x1 = frame.x(day[k][0]), frame.x(day[j][0])
        add(f'<rect x="{x0:.2f}" y="{M_TOP}" width="{max(x1 - x0, 0.5):.2f}" '
            f'height="{PLOT_H}" fill="#27476E" opacity="0.28"/>')
        k = j + 1
    for t, kind in ((t0, "sunset"), (t1, "sunrise")):
        # No bar: the sun's position is carried entirely by the background
        # gradient. Only a tick on the time axis and its label mark the edge.
        xx = frame.x(t)
        add(f'<line x1="{xx:.2f}" y1="{M_TOP + PLOT_H}" x2="{xx:.2f}" '
            f'y2="{M_TOP + PLOT_H + 5}" stroke="{INK_BRIGHT}" stroke-opacity="0.8" '
            f'stroke-width="1"/>')
        add(f'<text x="{xx:.2f}" y="{M_TOP + PLOT_H + 18}" text-anchor="middle" '
            f'font-size="10" fill="{INK_BRIGHT}" opacity="0.9">{hhmm(t)} {kind}</text>')
    # midnight of the fixed frame: the date rollover, always at plot centre
    x_mid = frame.x(mid_day)
    add(f'<line x1="{x_mid:.2f}" y1="{M_TOP}" x2="{x_mid:.2f}" y2="{M_TOP + PLOT_H}" '
        f'stroke="{GRID}" stroke-opacity="0.30" stroke-dasharray="4 5"/>')
    add(f'<text x="{x_mid:.2f}" y="{M_TOP - 6}" text-anchor="middle" font-size="10" '
        f'fill="{INK_BRIGHT}">{mid_day.strftime("%a %d %b")} 00:00</text>')
    add("</g>")

    # ---- the moon's path: truncated at the horizon (decision 2) ----
    above = " ".join(f"{frame.x(tt):.2f},{sc.y(a):.2f}"
                     for tt, a in zip(times, moon_alt) if a >= 0)
    add(f'<g clip-path="url(#plot{ns})">')
    if above:
        add(f'<polyline points="{above}" fill="none" stroke="{CURVE}" stroke-width="1.8" '
            f'stroke-opacity="0.92" stroke-linejoin="round"/>')

    # ---- glyphs every two hours while above 0 deg, plus rise/set on the horizon ----
    marks = []
    hour = (t0 + timedelta(hours=1)).replace(minute=0, second=0, microsecond=0)
    while hour <= t1:
        if int(hour.strftime("%H")) % 2 == 0:
            i = min(range(len(times)), key=lambda k: abs((times[k] - hour).total_seconds()))
            if samples[i]["altitude"] > 0.0:
                marks.append({"time": samples[i]["time"], "altitude": samples[i]["altitude"],
                              "illumFraction": samples[i]["illumFraction"], "big": False})
        hour += timedelta(hours=1)
    for key, kind in (("moonrise", "rise"), ("moonset", "set")):
        for iso in payload["moon"][key]:
            t = parse(iso)
            marks.append({"time": iso, "altitude": 0.0, "kind": kind, "big": True,
                          "illumFraction": series_value(times, illum, t)})
    # A glyph that would sit within a radius of another gets nudged sideways
    # so its disc and label stay readable (moonset lands right next to the
    # sunrise tick; two-hour marks crowd near the horizon).
    placed = []
    for s in sorted(marks, key=lambda m: frame.x(parse(m["time"]))):
        cx = frame.x(parse(s["time"]))
        for px, _ in placed:
            if abs(cx - px) < 24:
                cx += 24 - abs(cx - px)
        # Also push clear of the sunset/sunrise axis ticks and their labels.
        for bx in (frame.x(t0), frame.x(t1)):
            if abs(cx - bx) < 30:
                cx = bx + 30 if cx >= bx else bx - 30
        placed.append((cx, s))
    for cx, s in placed:
        t = parse(s["time"])
        k = s["illumFraction"]
        r = 11.0 if s["big"] else 9.0
        cy = sc.y(s["altitude"])
        d = terminator(k, r, limb)
        add(f'<g transform="translate({cx:.2f},{cy:.2f})">')
        add(f'<circle r="{r}" fill="#161D2E" stroke="{CURVE}" stroke-opacity="0.3"/>')
        if d:
            add(f'<path d="{d}" fill="{CURVE}" filter="url(#glow{ns})"/>')
        if s.get("kind"):
            # "set" lands on the horizon where the sunrise label sits, so it
            # reads above the glyph instead.
            add(f'<text y="{-(r + 7):.1f}" text-anchor="middle" font-size="9" fill="{INK}">'
                f'{s["kind"]}</text>')
        add("</g>")

    # peak callout
    if moon_alt and max(moon_alt) > 0:
        peak_alt, peak_t = max(zip(moon_alt, times), key=lambda p: p[0])
        add(f'<line x1="{frame.x(peak_t):.2f}" y1="{sc.y(peak_alt):.2f}" '
            f'x2="{frame.x(peak_t):.2f}" y2="{sc.y(Y_TOP):.2f}" stroke="{GRID}" '
            f'stroke-opacity="0.28" stroke-dasharray="2 4"/>')
        label_y = max(sc.y(peak_alt) - (11 + 9), M_TOP + 12)
        add(f'<text x="{frame.x(peak_t):.2f}" y="{label_y:.2f}" text-anchor="middle" '
            f'font-size="11" fill="{INK_BRIGHT}">{peak_alt:.1f}&#176; at {hhmm(peak_t)}</text>')

    # Day labels go on the footer's bottom line; sunset/sunrise labels own
    # the top line. Drop a day label when a glyph or sun label already sits
    # within its footprint (midsummer crowds both near the horizon).
    for label, t in ((noon0.strftime("Day 1 · %d %b"), noon0 + timedelta(hours=12)),
                     (t1.strftime("Day 2 · %d %b"), t1 + timedelta(hours=12))):
        # Day labels sit at the centre of each day half on the footer's
        # bottom line. They are deliberately faint: a fixed-scale frame is
        # defined by its noon edges, so if one collides with a glyph or sun
        # label (midsummer crowds them near the horizon) it simply drops out.
        xx = frame.x(t)
        taken = [frame.x(tt) for tt in (t0, t1)] + [cx for cx, _ in placed]
        if any(abs(xx - u) < 60 for u in taken):
            continue
        add(f'<text x="{xx:.2f}" y="{M_TOP + PLOT_H + 34}" text-anchor="middle" '
            f'font-size="10" fill="{INK}" opacity="0.75">{label}</text>')
    add("</g>")

    # ---- header ----
    title = (f'{payload["location"]["lat"]:.2f}, {payload["location"]["lon"]:.2f}'
             f'  ·  {t0.strftime("%a %d %b")} {hhmm(t0)} '
             f'\u2192 {t1.strftime("%a %d %b")} {hhmm(t1)}')
    add(f'<text x="{M_LEFT}" y="24" font-size="13" font-weight="600" '
        f'fill="{INK_BRIGHT}">{title}</text>')

    k_mid = payload["moon"]["midnight"]["illumFraction"]
    right = M_LEFT + PLOT_W
    # The midnight date marker sits at the plot centre, so the phase readout
    # has to stop short of it or the two collide.
    add(f'<text x="{right - 130}" y="24" text-anchor="end" font-size="12" fill="{INK}">'
        f'{phase_name(k_mid, payload["moon"]["waxing"])} · {k_mid * 100:.0f}% lit · '
        f'limb {limb}</text>')
    add(f'<g transform="translate({right - 18},20)">'
        f'<circle r="9" fill="#161D2E" stroke="{CURVE}" stroke-opacity="0.3"/>'
        f'<path d="{terminator(k_mid, 9, limb)}" fill="{CURVE}"/></g>')
    if has_dark:
        dark_events = [e for e in payload["sun"]["events"] if e["band"] == "astronomical"]
        ds = parse(next(e["time"] for e in dark_events if e["edge"] == "start"))
        de = parse(next(e["time"] for e in dark_events if e["edge"] == "end"))
        add(f'<text x="{M_LEFT}" y="{H - 12}" font-size="11" fill="{INK}">'
            f'True darkness {hhmm(ds)} \u2013 {hhmm(de)}'
            f'  ·  {(de - ds).total_seconds() / 3600:.1f} h</text>')
        add(f'<text x="{M_LEFT + PLOT_W}" y="{H - 12}" text-anchor="end" font-size="11" '
            f'fill="{INK}">moon {"above" if payload["summary"]["moonUpDuringDark"] else "below"} '
            f'the horizon during darkness</text>')
    else:
        add(f'<text x="{M_LEFT}" y="{H - 24}" font-size="12" font-weight="600" fill="{NOW}">'
            f'No astronomical darkness tonight '
            f'(sun stays above \u221218&#176;)</text>')
        deepest = min(a for tt, a in zip(sun_times, sun_alt) if t0 <= tt <= t1)
        add(f'<text x="{M_LEFT}" y="{H - 9}" font-size="11" fill="{INK}">'
            f'Lowest the sun reaches: {deepest:.1f}&#176; '
            f'· only {"nautical" if deepest > -18 else "astronomical"} twilight at best</text>')
        add(f'<text x="{M_LEFT + PLOT_W}" y="{H - 9}" text-anchor="end" font-size="11" '
            f'fill="{INK}">planning for this night needs the brightest available sky window</text>')

    if now is not None and t0 <= now <= t1:
        add(f'<g clip-path="url(#plot{ns})"><line x1="{frame.x(now):.2f}" y1="{M_TOP}" '
            f'x2="{frame.x(now):.2f}" y2="{M_TOP + PLOT_H}" stroke="{NOW}" stroke-width="1.3" '
            f'stroke-dasharray="4 4"/></g>')
        add(f'<text x="{frame.x(now) + 5:.2f}" y="{M_TOP + PLOT_H - 16}" font-size="10" '
            f'fill="{NOW}">now {hhmm(now)}</text>')

    add("</svg>")
    return "\n".join(out)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("json")
    ap.add_argument("svg")
    ap.add_argument("--now", help="ISO local time, for the now line")
    opts = ap.parse_args()
    payload = json.load(open(opts.json, encoding="utf-8"))
    open(opts.svg, "w", encoding="utf-8").write(
        render(payload, parse(opts.now) if opts.now else None))
    print("wrote", os.path.abspath(opts.svg))


if __name__ == "__main__":
    main()
