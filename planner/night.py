"""Night model: the fixed noon-anchored frame, twilight windows, moon track.

Conventions pinned by design review (docs/REQUIREMENTS.md 4.1):

- A night is anchored to local **noon**: any time at or after 12:00 belongs
  to the night starting that calendar day; 00:00-11:59 belongs to the night
  that began the previous day. The chart's x axis spans noon -> midnight ->
  noon+2, so scrolling date by date is a pure translation.
- The sun's position is expressed entirely through the twilight gradient;
  this module therefore returns the sun's altitude on a 10-minute grid across
  the whole two-day frame, and clients classify bands from that series rather
  than re-deriving them from the event list. Bands and readouts cannot then
  disagree — which is also what guarantees the reading-order invariant: one
  smooth curve with its minimum at the centre can never fold back.
"""

import json
from datetime import datetime, timedelta

from astropy.coordinates import EarthLocation, get_body, get_body_barycentric, get_sun, AltAz
from astropy.time import Time
import astropy.units as u
import numpy as np
import pytz

ELEV = 0.0
SUN_GRID_MIN = 10      # sun series step across the fixed frame
MOON_GRID_MIN = 10     # moon sample step across the night window


class NightError(ValueError):
    """Bad request: out-of-range coordinates or unknown time zone."""

    def __init__(self, code, message):
        super().__init__(message)
        self.code = code


def _to_time(times):
    return Time([x.astimezone(pytz.utc).strftime("%Y-%m-%d %H:%M:%S.%f")
                 for x in times], format="iso", scale="utc")


class Site:
    """One observer location: astropy EarthLocation plus the local zone."""

    def __init__(self, lat, lon, tz_name, elev=ELEV):
        if not -90.0 <= lat <= 90.0:
            raise NightError("lat_out_of_range", "latitude must be within [-90, 90]")
        if not -180.0 <= lon <= 180.0:
            raise NightError("lon_out_of_range", "longitude must be within [-180, 180]")
        try:
            self.tz = pytz.timezone(tz_name)
        except pytz.exceptions.UnknownTimeZoneError:
            raise NightError("unknown_tz", f"unknown IANA time zone {tz_name!r}") from None
        self.lat, self.lon = float(lat), float(lon)
        self.loc = EarthLocation(lat=lat * u.deg, lon=lon * u.deg, height=elev * u.m)

    def localize_noon(self, date_str):
        """The noon anchor for a night starting on YYYY-MM-DD."""
        try:
            naive = datetime.strptime(date_str, "%Y-%m-%d")
        except ValueError:
            raise NightError("bad_date", "date must be YYYY-MM-DD") from None
        return self.tz.localize(naive.replace(hour=12))

    def today_noon(self):
        now = datetime.now(self.tz)
        pivot = now.replace(hour=12, minute=0, second=0, microsecond=0)
        if now.hour < 12:
            pivot -= timedelta(days=1)
        return pivot

    # -- astropy plumbing -------------------------------------------------

    def altaz(self, func, times):
        t = _to_time(times)
        frame = func(t).transform_to(AltAz(obstime=t, location=self.loc)).frame
        return np.atleast_1d(frame.alt.deg), np.atleast_1d(frame.az.deg)

    def sun_alt(self, times):
        return self.altaz(get_sun, times)[0]

    def moon_icrs(self, t):
        # Topocentric for the Moon: astropy's geocentric position would put
        # the Moon up to about a degree low, shifting rise/set by minutes.
        return get_body("moon", t, location=self.loc)


def _crossing(site, threshold, t0, t1):
    """Bisect for the time the sun's altitude crosses threshold in [t0, t1]."""
    for _ in range(40):
        mid = t0 + (t1 - t0) / 2
        a0, am = site.sun_alt([t0, mid])
        if (a0 - threshold) * (am - threshold) <= 0:
            t1 = mid
        else:
            t0 = mid
    return t0 + (t1 - t0) / 2


def _sun_crossings(site, threshold, start, end, step=timedelta(minutes=5)):
    """Every crossing of the sun's altitude through threshold, with direction."""
    grid = []
    cur = start
    while cur <= end:
        grid.append(cur)
        cur += step
    alts = site.sun_alt(grid)
    out = []
    for i in range(1, len(grid)):
        if (alts[i - 1] - threshold) * (alts[i] - threshold) <= 0 and alts[i - 1] != alts[i]:
            out.append((_crossing(site, threshold, grid[i - 1], grid[i]), alts[i] > alts[i - 1]))
    return out


def _zero_crossings(alts, times):
    """Interpolated altitude-zero crossings, labelled rise or set."""
    events = []
    for i in range(1, len(alts)):
        a0, a1 = alts[i - 1], alts[i]
        if (a0 < 0 <= a1) or (a0 >= 0 > a1):
            frac = a0 / (a0 - a1)
            t = times[i - 1] + (times[i] - times[i - 1]) * frac
            events.append((t, "rise" if a1 > a0 else "set"))
    return events


def phase_angle_deg(t):
    """Sun-Moon-Earth angle in degrees for one astropy Time.

    Taken from barycentric vectors against the geocentre: using the observer
    would add up to about a degree of topocentric parallax and skew the phase.
    (astropy 8 removed the illum helpers, so this is computed directly.)
    """
    def vec(name):
        # .reshape(3) keeps a single Time scalar-shaped (1,3) rather than (3,),
        # so the dot product below works for one epoch as well as many.
        return np.array(get_body_barycentric(name, t).xyz.to("au").value).reshape(-1, 3)[0]

    earth, moon, sun = vec("earth"), vec("moon"), vec("sun")
    to_moon, to_sun = moon - earth, moon - sun
    cosine = to_moon @ to_sun / (np.linalg.norm(to_moon) * np.linalg.norm(to_sun))
    return float(np.degrees(np.arccos(np.clip(cosine, -1.0, 1.0))))


def compute_night(site: Site, pivot):
    """Everything about the night anchored at `pivot` (a local noon).

    Returns a dict in the §6 shape with all datetimes still objects;
    night_payload() serialises it. Polar day and polar night raise
    NightError for now — open question 5 in REQUIREMENTS.md.
    """
    t0_frame, t1_frame = pivot, pivot + timedelta(days=2)

    # Coarse sun scan to find sunset after noon, then the sunrise that follows.
    grid = []
    cur = pivot
    while cur <= pivot + timedelta(days=3):
        grid.append(cur)
        cur += timedelta(minutes=5)
    sun_alt = site.sun_alt(grid)

    sunset = sunrise = None
    for i in range(1, len(grid)):
        if sunset is None and sun_alt[i - 1] >= 0 > sun_alt[i]:
            sunset = _crossing(site, 0.0, grid[i - 1], grid[i])
        elif sunset is not None and sun_alt[i - 1] < 0 <= sun_alt[i]:
            sunrise = _crossing(site, 0.0, grid[i - 1], grid[i])
            break
    if sunset is None or sunrise is None:
        raise NightError("polar", "no sunset/sunrise in this frame (polar day or night); "
                                  "not yet supported")

    # Twilight transitions inside the night window. Descending through a
    # threshold opens that band; ascending back out of it closes it.
    events = []
    for threshold, band in ((-6.0, "civil"), (-12.0, "nautical"), (-18.0, "astronomical")):
        for t, rising in _sun_crossings(site, threshold, sunset, sunrise):
            events.append({"band": band, "time": t, "edge": "end" if rising else "start"})
    events.sort(key=lambda e: e["time"])

    # Sun altitude on a 10-minute grid across the whole fixed frame: the
    # client paints bands from this single series.
    frame_grid = []
    cur = pivot
    while cur <= t1_frame:
        frame_grid.append(cur)
        cur += timedelta(minutes=SUN_GRID_MIN)
    sun_alt_frame = site.sun_alt(frame_grid)

    # Moon track across the FULL fixed frame (noon -> noon+2), 10-minute
    # sampling: the single-night chart must still draw the moon's arc through
    # the daylight hours and show its rise point even when that rise happens
    # after sunrise. Altitudes are computed for the whole grid; below-horizon
    # samples stay in the payload (the client clips at 0°) so crossings can be
    # refined from them.
    n = int((t1_frame - pivot).total_seconds() // (MOON_GRID_MIN * 60)) + 1
    moon_times = [pivot + timedelta(minutes=MOON_GRID_MIN * i) for i in range(n + 1)]
    moon_alt, moon_az = site.altaz(site.moon_icrs, moon_times)

    t_moon = _to_time(moon_times)
    phase_angle = np.array([phase_angle_deg(t) for t in t_moon])
    illum = (1 + np.cos(np.radians(phase_angle))) / 2

    mid = sunset + (sunrise - sunset) / 2
    mid_i = min(int((mid - sunset).total_seconds() // (MOON_GRID_MIN * 60)), len(illum) - 1)
    # Waxing or waning from the elongation sign: the Moon's eastward angular
    # distance from the Sun runs 0->360 through a lunation, so under 180 is
    # waxing. Robust near full moon where illum fraction is flat.
    t_mid = _to_time([mid])
    elongation = float(np.atleast_1d(
        site.moon_icrs(t_mid).ra.deg - get_sun(t_mid).ra.deg)[0]) % 360.0
    waxing = elongation < 180.0
    # A waxing moon is lit on the eastern limb: right side for a northern
    # observer, left for a southern one. The client must not infer this.
    limb = "right" if waxing else "left"
    if site.lat < 0:
        limb = "left" if limb == "right" else "right"

    astro = [e for e in events if e["band"] == "astronomical"]
    dark_start = next((e["time"] for e in astro if e["edge"] == "start"), None)
    dark_end = next((e["time"] for e in astro if e["edge"] == "end"), None)
    up_during_dark = None
    if dark_start and dark_end:
        up = [a for a, t in zip(moon_alt, moon_times) if dark_start <= t <= dark_end]
        up_during_dark = any(a > 0 for a in up)

    return {
        "site": site,
        "pivot": pivot,
        "sunset": sunset,
        "sunrise": sunrise,
        "events": events,
        "frame_grid": frame_grid,
        "sun_alt_frame": sun_alt_frame,
        "moon_times": moon_times,
        "moon_alt": moon_alt,
        "moon_az": moon_az,
        "illum": illum,
        "phase_angle": phase_angle,
        "mid_i": mid_i,
        "mid": mid,
        "waxing": waxing,
        "limb": limb,
        "dark_start": dark_start,
        "dark_end": dark_end,
        "up_during_dark": up_during_dark,
    }


def night_payload(model):
    """Serialise a compute_night result into the §6 contract shape."""
    site = model["site"]

    def local(dt):
        return dt.astimezone(site.tz).isoformat()

    moon_events = _zero_crossings(list(model["moon_alt"]), model["moon_times"])
    illum, mid_i = model["illum"], model["mid_i"]
    samples = [{
        "time": model["moon_times"][i].astimezone(site.tz).isoformat(),
        "altitude": round(float(model["moon_alt"][i]), 3),
        "azimuth": round(float(model["moon_az"][i]), 2),
        "illumFraction": round(float(illum[i]), 4),
        "phaseAngle": round(float(model["phase_angle"][i]), 3),
    } for i in range(len(model["moon_times"]))]

    return {
        "location": {"lat": site.lat, "lon": site.lon, "tz": getattr(site.tz, "zone", str(site.tz))},
        "frameNoon": local(model["pivot"]),
        "nightStart": local(model["sunset"]),
        "nightEnd": local(model["sunrise"]),
        "sun": {
            "sunset": local(model["sunset"]),
            "sunrise": local(model["sunrise"]),
            "events": [{"band": e["band"], "edge": e["edge"], "time": local(e["time"])}
                       for e in model["events"]],
            "trueDarkness": bool(model["dark_start"] and model["dark_end"]),
            "deepestSunAltitude": round(float(min(model["sun_alt_frame"])), 2),
            "series": [{"time": model["frame_grid"][i].astimezone(site.tz).isoformat(),
                        "altitude": round(float(model["sun_alt_frame"][i]), 3)}
                       for i in range(len(model["frame_grid"]))],
        },
        "moon": {
            "samples": samples,
            "moonrise": [local(t) for t, kind in moon_events if kind == "rise"],
            "moonset": [local(t) for t, kind in moon_events if kind == "set"],
            "limb": model["limb"],
            "waxing": model["waxing"],
            "midnight": {
                "time": local(model["mid"]),
                "illumFraction": round(float(illum[mid_i]), 4),
                "altitude": round(float(model["moon_alt"][mid_i]), 2),
                "azimuth": round(float(model["moon_az"][mid_i]), 2),
            },
        },
        "summary": {
            "darkMinutes": int((model["dark_end"] - model["dark_start"]).total_seconds() // 60)
            if model["dark_start"] and model["dark_end"] else 0,
            "moonUpDuringDark": model["up_during_dark"],
        },
    }
