"""Automated checks of the planner package against astropy itself.

Run:  .venv\\Scripts\\python.exe -m planner.tests.test_night

Covers the M1 definition of done: Prague reference night, a high-latitude
summer night with no astronomical darkness (honest rendering path), a
southern-hemisphere site (limb mirroring), and the §6 contract shape.
"""

import math
import sys
from datetime import timedelta

from planner import NightError, Site, compute_night, night_payload
from planner.night import phase_angle_deg, _to_time

PRAGUE = (50.0875, 14.4213, "Europe/Prague")
SYDNEY = (-33.8688, 151.2093, "Australia/Sydney")

failures = []


def check(name, ok, detail=""):
    print(f"{'PASS' if ok else 'FAIL'}  {name}  {detail}")
    if not ok:
        failures.append(name)


def test_prague_2026_11_23():
    site = Site(*PRAGUE)
    m = compute_night(site, site.localize_noon("2026-11-23"))
    p = night_payload(m)

    # Reference values established by the design probe on 23 Nov.
    sunset = p["sun"]["sunset"][11:16]
    sunrise = p["sun"]["sunrise"][11:16]
    check("prague sunset ~16:02", sunset in ("16:01", "16:02", "16:03"), sunset)
    check("prague sunrise ~07:35", sunrise in ("07:34", "07:35", "07:36"), sunrise)

    astro = [e for e in p["sun"]["events"] if e["band"] == "astronomical"]
    check("prague true darkness present", p["sun"]["trueDarkness"])
    d0 = next(e["time"][11:16] for e in astro if e["edge"] == "start")
    d1 = next(e["time"][11:16] for e in astro if e["edge"] == "end")
    check("darkness 18:04-05:33", (d0, d1) == ("18:04", "05:33"), f"{d0}-{d1}")
    check("dark minutes ~689", abs(p["summary"]["darkMinutes"] - 689) <= 2,
          str(p["summary"]["darkMinutes"]))

    # FR5: illum fraction vs (1-cos phase)/2 identity and sample sanity.
    fr = p["moon"]["midnight"]["illumFraction"]
    check("prague moon near full at midnight", fr > 0.97, f"{fr:.3f}")
    check("prague limb right (waxing, N)", p["moon"]["limb"] == "right")

    # FR3 vs raw astropy: the sun's altitude at the reported sunset instant
    # must be within a few arcminutes of zero.
    alt = site.sun_alt([m["sunset"]])[0]
    check("sunset altitude ~0", abs(alt) < 0.05, f"{alt:+.3f} deg")

    # Reading-order invariant on the series itself: the deepest sun altitude
    # (the darkest moment of the whole frame) must sit in the central half,
    # so the gradient can only deepen toward the middle and mirror outward.
    alts = [s["altitude"] for s in p["sun"]["series"]]
    mid = len(alts) // 2
    deepest = min(alts)
    at = alts.index(deepest)
    check("deepest sun near frame centre", abs(at - mid) <= len(alts) // 4,
          f"idx {at}/{len(alts)}")

    # Moon samples: FR4 count and smoothness proxy. The series now spans the
    # whole fixed frame (noon -> noon+2) so the arc survives into daylight.
    n = len(p["moon"]["samples"])
    expect = int((m["pivot"] + timedelta(days=2) - m["pivot"]).total_seconds() // 600) + 1
    check("moon sample count matches 10-min grid", abs(n - expect) <= 1, f"{n} vs {expect}")


def test_summer_no_darkness():
    site = Site(*PRAGUE)
    m = compute_night(site, site.localize_noon("2026-06-21"))
    p = night_payload(m)
    check("summer: no true darkness", not p["sun"]["trueDarkness"])
    check("summer: honest floor reported",
          -18 < p["sun"]["deepestSunAltitude"] < -15,
          f"{p['sun']['deepestSunAltitude']:+.2f}")
    check("summer: dark minutes 0", p["summary"]["darkMinutes"] == 0)


def test_southern_limb():
    site = Site(*SYDNEY)
    m = compute_night(site, site.localize_noon("2026-11-23"))
    p = night_payload(m)
    # Same lunation as Prague: waxing there means lit-left for a southern observer.
    check("sydney limb mirrored", p["moon"]["limb"] == "left",
          f"waxing={p['moon']['waxing']}")
    check("sydney moon near full", p["moon"]["midnight"]["illumFraction"] > 0.95,
          f"{p['moon']['midnight']['illumFraction']:.3f}")


def test_errors():
    for bad, code in (((95.0, 14.4, "Europe/Prague"), "lat_out_of_range"),
                      ((50.0, 200.0, "Europe/Prague"), "lon_out_of_range"),
                      ((50.0, 14.4, "Mars/Olympus"), "unknown_tz")):
        try:
            Site(*bad)
            check(f"reject {code}", False, "no error raised")
        except NightError as exc:
            check(f"reject {code}", exc.code == code, exc.code)


def test_phase_angle_identity():
    # illum = (1+cos phase)/2 must stay in [0,1] and match the fraction used
    # downstream; spot-check one epoch for internal consistency.
    site = Site(*PRAGUE)
    m = compute_night(site, site.localize_noon("2026-11-23"))
    t = _to_time([m["mid"]])
    pa = phase_angle_deg(t)
    frac = (1 + math.cos(math.radians(pa))) / 2
    check("phase angle sane", 0 <= pa <= 180, f"{pa:.2f} deg")
    check("illum identity", abs(frac - float(m["illum"][m["mid_i"]])) < 0.01,
          f"{frac:.4f}")


def main():
    test_prague_2026_11_23()
    test_summer_no_darkness()
    test_southern_limb()
    test_errors()
    test_phase_angle_identity()
    print("FAILURES:", failures if failures else "none")
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
