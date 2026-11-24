"""Scratch visual-design probe: tonight's night window and moon track.

Not part of the planner package. Generates the data used to judge the visual
design of the altitude/time chart before any framework is scaffolded.
"""
import json
from datetime import datetime, timedelta

from astropy.coordinates import EarthLocation, get_body, get_body_barycentric, get_sun, AltAz
from astropy.time import Time
import astropy.units as u
import numpy as np
import pytz

LAT, LON, ELEV = 50.0875, 14.4213, 270.0          # Prague
TZ_NAME = "Europe/Prague"

LOC = EarthLocation(lat=LAT * u.deg, lon=LON * u.deg, height=ELEV * u.m)
TZ = pytz.timezone(TZ_NAME)
SUN = lambda t: get_sun(t)
# Topocentric for the Moon: astropy's geocentric position would put the Moon
# up to about a degree low, which shifts moonrise and moonset by minutes.
MOON = lambda t: get_body("moon", t, location=LOC)


def to_time(times):
    return Time([x.astimezone(pytz.utc).strftime("%Y-%m-%d %H:%M:%S.%f") for x in times],
                format="iso", scale="utc")


def altaz(func, times):
    """Altitude and azimuth in degrees for a list of aware datetimes."""
    t = to_time(times)
    frame = func(t).transform_to(AltAz(obstime=t, location=LOC)).frame
    return frame.alt.deg, frame.az.deg


def crossing(func, threshold, t0, t1):
    """Bisect for the time a body's altitude crosses threshold within [t0, t1]."""
    for _ in range(40):
        mid = t0 + (t1 - t0) / 2
        a0 = altaz(func, [t0])[0][0]
        am = altaz(func, [mid])[0][0]
        if (a0 - threshold) * (am - threshold) <= 0:
            t1 = mid
        else:
            t0 = mid
    return t0 + (t1 - t0) / 2


def sun_crossings(threshold, start, end, step=timedelta(minutes=5)):
    """Every time the sun's altitude crosses threshold, with its direction."""
    grid = []
    cur = start
    while cur <= end:
        grid.append(cur)
        cur += step
    alts = altaz(SUN, grid)[0]
    out = []
    for i in range(1, len(grid)):
        if (alts[i - 1] - threshold) * (alts[i] - threshold) <= 0 and alts[i - 1] != alts[i]:
            out.append((crossing(SUN, threshold, grid[i - 1], grid[i]), alts[i] > alts[i - 1]))
    return out


def phase_angle_deg(t):
    """Sun-Moon-Earth angle in degrees for one Time value."""
    def vec(name):
        return np.array(get_body_barycentric(name, t).xyz.to("au").value)

    earth, moon, sun = vec("earth"), vec("moon"), vec("sun")
    to_moon, to_sun = moon - earth, moon - sun
    cosine = to_moon @ to_sun / (np.linalg.norm(to_moon) * np.linalg.norm(to_sun))
    return float(np.degrees(np.arccos(np.clip(cosine, -1.0, 1.0))))


def zero_crossings(alts, times):
    """Interpolated altitude-zero crossings, labelled rise or set."""
    events = []
    for i in range(1, len(alts)):
        a0, a1 = alts[i - 1], alts[i]
        if (a0 < 0 <= a1) or (a0 >= 0 > a1):
            frac = a0 / (a0 - a1)
            t = times[i - 1] + (times[i] - times[i - 1]) * frac
            events.append((t, "rise" if a1 > a0 else "set"))
    return events


def main(argv=None):
    global LOC, TZ, LAT, LON
    import argparse
    ap = argparse.ArgumentParser(description="Night window and moon track for a design probe.")
    ap.add_argument("--date", help="Night starting date, YYYY-MM-DD. Defaults to the current night.")
    ap.add_argument("--lat", type=float, default=LAT)
    ap.add_argument("--lon", type=float, default=LON)
    ap.add_argument("--tz", default=TZ_NAME)
    ap.add_argument("--out", default="night.json")
    opts = ap.parse_args(argv)

    LAT, LON = opts.lat, opts.lon
    LOC = EarthLocation(lat=opts.lat * u.deg, lon=opts.lon * u.deg, height=ELEV * u.m)
    TZ = pytz.timezone(opts.tz)

    # A night is anchored to the most recent local noon, the convention
    # N.I.N.A. uses: any clock time at or after 12:00 belongs to the night
    # starting that calendar day, and 00:00-11:59 belongs to the night that
    # began the previous day. This is what disambiguates 03:00 on a chart
    # whose x axis crosses midnight.
    if opts.date:
        pivot = TZ.localize(datetime.strptime(opts.date, "%Y-%m-%d")).replace(hour=12)
    else:
        now_local = datetime.now(TZ)
        pivot = now_local.replace(hour=12, minute=0, second=0, microsecond=0)
        if now_local.hour < 12:
            pivot = pivot - timedelta(days=1)
    search = pivot

    # Coarse sun scan to find sunset, then the sunrise that follows it.
    grid = []
    cur = search
    while cur <= search + timedelta(days=3):
        grid.append(cur)
        cur += timedelta(minutes=5)
    sun_alt = altaz(SUN, grid)[0]

    sunset = sunrise = None
    for i in range(1, len(grid)):
        if sunset is None and sun_alt[i - 1] >= 0 > sun_alt[i]:
            sunset = crossing(SUN, 0.0, grid[i - 1], grid[i])
        elif sunset is not None and sun_alt[i - 1] < 0 <= sun_alt[i]:
            sunrise = crossing(SUN, 0.0, grid[i - 1], grid[i])
            break

    # Twilight transitions inside the night window. Descending through a
    # threshold opens that band; ascending back out of it closes it.
    events = []
    for threshold, band in ((-6.0, "civil"), (-12.0, "nautical"), (-18.0, "astronomical")):
        for t, rising in sun_crossings(threshold, sunset, sunrise):
            events.append({"band": band, "time": t, "edge": "end" if rising else "start"})
    events.sort(key=lambda e: e["time"])

    # Moon track across the window at 10-minute sampling.
    n = int((sunrise - sunset).total_seconds() // 600) + 1
    moon_times = [sunset + timedelta(minutes=10 * i) for i in range(n + 1)]
    moon_alt, moon_az = altaz(MOON, moon_times)

    # The chart's x scale is FIXED at local noon -> noon+2 (decision 23 Nov),
    # so the sun series must cover the whole two-day frame, daylight included;
    # the renderer paints day hours as civil band and truncates them itself.
    frame_grid = []
    cur = pivot
    while cur <= pivot + timedelta(days=2):
        frame_grid.append(cur)
        cur += timedelta(minutes=10)
    sun_alt_frame = altaz(SUN, frame_grid)[0]

    # Illumination fraction from the phase angle, the Sun-Moon-Earth angle.
    # It is taken from barycentric vectors against the geocentre: using LOC
    # would add up to about a degree of topocentric parallax to the Moon and
    # skew the phase.
    t_moon = to_time(moon_times)
    phase_angle = np.array([phase_angle_deg(t) for t in t_moon])
    illum = (1 + np.cos(np.radians(phase_angle))) / 2

    samples = [{
        "time": moon_times[i].astimezone(TZ).isoformat(),
        "altitude": round(float(moon_alt[i]), 3),
        "azimuth": round(float(moon_az[i]), 2),
        "illumFraction": round(float(illum[i]), 4),
        "phaseAngle": round(float(phase_angle[i]), 3),
    } for i in range(len(moon_times))]

    moon_events = zero_crossings(list(moon_alt), moon_times)

    mid = sunset + (sunrise - sunset) / 2
    mid_i = min(int((mid - sunset).total_seconds() // 600), len(illum) - 1)
    # Waxing or waning comes from the elongation sign: the Moon's eastward
    # angular distance from the Sun runs 0->360 through a whole lunation, so
    # anything under 180 is waxing. Robust near full moon, where the
    # illumination fraction is flat and a trend test would guess.
    t_mid = to_time([mid])
    elongation = (
        (get_body("moon", t_mid, location=LOC).ra.deg - get_sun(t_mid).ra.deg) % 360.0
    )
    waxing = bool(float(np.atleast_1d(elongation)[0]) < 180.0)
    # A waxing moon is lit on the eastern limb, which is the right side for a
    # northern observer and the left side for a southern one. The client must
    # not have to infer this.
    limb = "right" if waxing else "left"
    if opts.lat < 0:
        limb = "left" if limb == "right" else "right"

    astro = [e for e in events if e["band"] == "astronomical"]
    dark_start = next((e["time"] for e in astro if e["edge"] == "start"), None)
    dark_end = next((e["time"] for e in astro if e["edge"] == "end"), None)
    up_during_dark = None
    if dark_start and dark_end:
        up = [a for a, t in zip(moon_alt, moon_times) if dark_start <= t <= dark_end]
        up_during_dark = any(a > 0 for a in up)

    def local(dt):
        return dt.astimezone(TZ).isoformat()

    payload = {
        "location": {"lat": LAT, "lon": LON, "tz": opts.tz},
        "frameNoon": local(pivot),
        "nightStart": local(sunset),
        "nightEnd": local(sunrise),
        "sun": {
            "sunset": local(sunset),
            "sunrise": local(sunrise),
            "events": [{"band": e["band"], "edge": e["edge"], "time": local(e["time"])}
                       for e in events],
            "trueDarkness": bool(dark_start and dark_end),
            # The sun's altitude on a 10 minute grid across the fixed two-day
            # frame. The client classifies bands from this rather than
            # re-deriving them from the event list, so bands and readouts
            # cannot disagree.
            "series": [{"time": frame_grid[i].astimezone(TZ).isoformat(),
                        "altitude": round(float(sun_alt_frame[i]), 3)}
                       for i in range(len(frame_grid))],
        },
        "moon": {
            "samples": samples,
            "moonrise": [local(t) for t, kind in moon_events if kind == "rise"],
            "moonset": [local(t) for t, kind in moon_events if kind == "set"],
            "limb": limb,
            "waxing": waxing,
            "midnight": {
                "time": local(mid),
                "illumFraction": round(float(illum[mid_i]), 4),
                "altitude": round(float(moon_alt[mid_i]), 2),
                "azimuth": round(float(moon_az[mid_i]), 2),
            },
        },
        "summary": {
            "darkMinutes": int((dark_end - dark_start).total_seconds() // 60)
            if dark_start and dark_end else 0,
            "moonUpDuringDark": up_during_dark,
        },
    }

    with open(opts.out, "w", encoding="utf-8") as fh:
        json.dump(payload, fh, indent=2)

    print("sunset      ", payload["nightStart"])
    print("sunrise     ", payload["nightEnd"])
    print("twilight    ", [(e["band"], e["edge"], e["time"][11:16]) for e in payload["sun"]["events"]])
    print("moonrise    ", payload["moon"]["moonrise"])
    print("moonset     ", payload["moon"]["moonset"])
    print("midnight    ", payload["moon"]["midnight"], "| limb", payload["moon"]["limb"])
    print("dark minutes", payload["summary"]["darkMinutes"],
          "| moon up during dark:", payload["summary"]["moonUpDuringDark"])
    print("samples     ", len(samples))


if __name__ == "__main__":
    main()
