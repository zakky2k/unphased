"""Mock swatch strip for the band palette (decision 4, 23 Nov).

Standalone SVG: no astronomy needed. Renders each band as a flat swatch with
its hex and solar-altitude range, then a continuous dusk->night->dawn strip
with gradient blends at the boundaries — the same ramps render.py paints, so
what you approve here is exactly what the chart uses.

    python palette.py [out.svg]
"""

import os
import sys

from palette import BANDS, CURVE, DAY_CYCLE, colour_of

W, H = 980, 420
M = 36
INK = "#E2E8F0"
SUB = "#8C9BB4"

BAND_H = 52
GAP = 10
STRIP_Y = M + len(BANDS) * (BAND_H + GAP) + 46
STRIP_H = 74


def main(out_path):
    o = []
    a = o.append
    a(f'<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" '
      f'viewBox="0 0 {W} {H}" font-family="Inter, Segoe UI, sans-serif">')
    a(f'<rect width="{W}" height="{H}" fill="#0A0E18"/>')
    a(f'<text x="{M}" y="26" font-size="14" font-weight="600" fill="{INK}">'
      f'Twilight band palette — night near-black, progressively lighter blues toward daylight</text>')

    # ---- flat swatches ----
    y = M + 8
    for name, floor, colour in BANDS:
        top = {n: f2 for (n, f2, _) in BANDS}
        idx = [b[0] for b in BANDS].index(name)
        ceiling = BANDS[idx - 1][1] if idx else 0.0
        a(f'<rect x="{M}" y="{y}" width="150" height="{BAND_H}" rx="6" fill="{colour}"/>')
        a(f'<text x="{M + 168}" y="{y + 21}" font-size="13" font-weight="600" fill="{INK}">'
          f'{name}</text>')
        rng = f'sun {ceiling:.0f}&#176; to {floor:.0f}&#176;' if floor > -90 else 'sun below &#8722;18&#176;'
        a(f'<text x="{M + 168}" y="{y + 40}" font-size="11" fill="{SUB}">'
          f'{rng}  ·  {colour}</text>')
        if name == "night":
            a(f'<text x="{M + 320}" y="{y + 21}" font-size="11" fill="{CURVE}">'
              f'the imaging window</text>')
        y += BAND_H + GAP

    # ---- continuous strip with blends ----
    a(f'<text x="{M}" y="{STRIP_Y - 14}" font-size="12" fill="{SUB}">'
      f'Continuous ramp as painted across a day: dusk &#8594; true night &#8594; dawn, '
      f'with gradient blends at each boundary</text>')
    strip_w = W - 2 * M
    seg = strip_w / len(DAY_CYCLE)
    for i, name in enumerate(DAY_CYCLE):
        c = colour_of(name)
        x0 = M + i * seg
        # Blend toward the neighbour inside each segment's outer third.
        left = DAY_CYCLE[i - 1] if i else None
        right = DAY_CYCLE[i + 1] if i + 1 < len(DAY_CYCLE) else None
        lc = colour_of(left) if left else c
        rc = colour_of(right) if right else c
        a(f'<defs><linearGradient id="s{i}" x1="0" x2="1" y1="0" y2="0">'
          f'<stop offset="0" stop-color="{lc}"/>'
          f'<stop offset="0.35" stop-color="{c}"/>'
          f'<stop offset="0.65" stop-color="{c}"/>'
          f'<stop offset="1" stop-color="{rc}"/></linearGradient></defs>')
        a(f'<rect x="{x0:.1f}" y="{STRIP_Y}" width="{seg:.1f}" height="{STRIP_H}" fill="url(#s{i})"/>')
    # boundary rules at the -6/-12/-18 crossings
    for i in range(1, len(DAY_CYCLE)):
        x = M + i * seg
        a(f'<line x1="{x:.1f}" y1="{STRIP_Y}" x2="{x:.1f}" y2="{STRIP_Y + STRIP_H}" '
          f'stroke="#CBD5E1" stroke-opacity="0.18"/>')
    for label, frac in (("civil", 0.5 / 7), ("naut", 1.5 / 7), ("astro", 2.5 / 7),
                        ("night", 3.5 / 7), ("astro", 4.5 / 7), ("naut", 5.5 / 7),
                        ("civil", 6.5 / 7)):
        a(f'<text x="{M + strip_w * frac:.1f}" y="{STRIP_Y + STRIP_H + 18}" '
          f'text-anchor="middle" font-size="10" fill="{SUB}">{label}</text>')

    # ---- the moon ivory against every band ----
    row_y = STRIP_Y + STRIP_H + 44
    a(f'<text x="{M}" y="{row_y - 10}" font-size="12" fill="{SUB}">'
      f'Moon path colour {CURVE} checked against each band for contrast</text>')
    x = M
    for name, _, colour in BANDS:
        a(f'<rect x="{x}" y="{row_y}" width="200" height="46" rx="6" fill="{colour}"/>')
        a(f'<polyline points="{x + 12},{row_y + 34} {x + 60},{row_y + 12} {x + 110},{row_y + 22} '
          f'{x + 188},{row_y + 30}" fill="none" stroke="{CURVE}" stroke-width="2"/>')
        a(f'<circle cx="{x + 150}" cy="{row_y + 16}" r="9" fill="#161D2E" '
          f'stroke="{CURVE}" stroke-opacity="0.4"/>')
        x += 214

    a("</svg>")
    with open(out_path, "w", encoding="utf-8") as fh:
        fh.write("\n".join(o))
    print("wrote", os.path.abspath(out_path))


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else "band-palette.svg")
