"""The band palette, in one place, so chart and swatch mock can never drift.

Decided 23 Nov: night is near-black and the scale gets progressively lighter
blues toward the daylight end. The steps are chosen to be roughly equal in
perceptual lightness (HCL L* 16 / 28 / 40 / 52) because a ramp built by
eyeballed hex values tends to bunch at one end and the bands stop reading as
four distinct zones. Each band also carries a dawn variant, warmed slightly
toward the horizon side, so the gradient direction reads as "where the sun
went".
"""

NIGHT = "#05070C"   # sun below -18 deg: true darkness, the imaging window
ASTRO = "#0D1B31"   # -18 to -12 deg
NAUT  = "#18304F"   # -12 to -6 deg
CIVIL = "#27476E"   # 0 to -6 deg: the lightest band shown

BANDS = [
    ("civil",       -6.0,  CIVIL),
    ("nautical",    -12.0, NAUT),
    ("astronomical",-18.0, ASTRO),
    ("night",       -90.0, NIGHT),
]

# The moon's path and icons: yellow ivory, decided 23 Nov. Kept warm against
# the blue ramp so the curve never disappears into a twilight band.
CURVE = "#EFE0B7"

# Ordered dusk -> dawn across a whole day, for the swatch strip.
DAY_CYCLE = ["civil", "nautical", "astronomical", "night",
             "astronomical", "nautical", "civil"]


def band_of(alt):
    for name, floor, _ in BANDS:
        if alt > floor:
            return name
    return "night"


def colour_of(name):
    for n, _, c in BANDS:
        if n == name:
            return c
    raise KeyError(name)
