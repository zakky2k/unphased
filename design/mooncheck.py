"""Check the moon terminator path before it goes anywhere near the UI.

The glyph is one closed path: a semicircle along the lit limb, closed by a
half-ellipse whose semi-minor axis is r * |2k - 1|. That shape is only right
if the SVG arc flags select the intended half of each ellipse, so this script
reproduces the path exactly -- endpoint form converted to centre form -- and
measures the region it encloses on a fine grid.

Two properties must hold for every illumination fraction k:
  * the enclosed area is k * pi * r^2
  * the lit side is the requested limb, and a gibbous moon reaches past the
    centre line onto the far side while a crescent never does.
"""

import math

DISC_R = 50.0
CX = CY = 0.0


def terminator_path(k, limb, r=DISC_R, cx=CX, cy=CY):
    """The d= string for the lit region, exactly as the front end will emit it.

    k is the illuminated fraction, limb is which side of the disc is lit.
    """
    if k <= 0.0:
        return ""
    rx = r * abs(2.0 * k - 1.0)
    top = (cx, cy - r)
    bottom = (cx, cy + r)
    if limb == "right":
        limb_sweep = 1          # top -> bottom through the right
        term_sweep = 1 if k > 0.5 else 0   # gibbous bulges left, crescent right
    else:
        limb_sweep = 0
        term_sweep = 0 if k > 0.5 else 1
    d = f"M {top[0]},{top[1]} A {r},{r} 0 0 {limb_sweep} {bottom[0]},{bottom[1]}"
    if rx < 1e-9:
        d += f" L {top[0]},{top[1]} Z"
    else:
        d += f" A {rx},{r} 0 0 {term_sweep} {top[0]},{top[1]} Z"
    return d


def arc_points(x0, y0, rx, ry, sweep, x1, y1, steps=240):
    """Sample an SVG endpoint-form elliptical arc, honouring large-arc/sweep.

    Standard endpoint-to-centre conversion from the SVG spec, F.6.4.
    """
    phi = 0.0
    cos_phi, sin_phi = 1.0, 0.0
    dx, dy = (x0 - x1) / 2.0, (y0 - y1) / 2.0
    x0p = cos_phi * dx + sin_phi * dy
    y0p = -sin_phi * dx + cos_phi * dy

    rad = (x0p / rx) ** 2 + (y0p / ry) ** 2
    if rad > 1.0:                       # radii too small: scale them up
        rad = math.sqrt(rad)
        rx, ry = rx * rad, ry * rad

    sign = 1.0 if sweep != 0 else -1.0
    num = rx**2 * ry**2 - rx**2 * y0p**2 - ry**2 * x0p**2
    den = rx**2 * y0p**2 + ry**2 * x0p**2
    coef = sign * math.sqrt(max(num, 0.0) / den) if den else 0.0
    cxp = coef * (rx * y0p / ry)
    cyp = coef * (-(ry * x0p) / rx)
    cx = cos_phi * cxp - sin_phi * cyp + (x0 + x1) / 2.0
    cy = sin_phi * cxp + cos_phi * cyp + (y0 + y1) / 2.0

    def angle(ux, uy):
        return math.atan2(uy / ry, ux / rx)

    theta1 = angle(x0p - cxp, y0p - cyp)
    dtheta = angle(-x0p - cxp, -y0p - cyp) - theta1
    if sweep != 0 and dtheta < 0:
        dtheta += 2.0 * math.pi
    elif sweep == 0 and dtheta > 0:
        dtheta -= 2.0 * math.pi

    return [
        (
            cx + rx * math.cos(theta1 + dtheta * i / steps),
            cy + ry * math.sin(theta1 + dtheta * i / steps),
        )
        for i in range(steps + 1)
    ]


def polygon_area(points):
    total = 0.0
    for i in range(len(points)):
        x0, y0 = points[i]
        x1, y1 = points[(i + 1) % len(points)]
        total += x0 * y1 - x1 * y0
    return total / 2.0


def point_in_polygon(px, py, poly):
    inside = False
    n = len(poly)
    for i in range(n):
        x0, y0 = poly[i]
        x1, y1 = poly[(i + 1) % n]
        if (y0 > py) != (y1 > py):
            x_hit = x0 + (py - y0) * (x1 - x0) / (y1 - y0)
            if px < x_hit:
                inside = not inside
    return inside


def measure(k, limb, r=DISC_R, rows=1200):
    """Return (lit fraction, mean x of lit area) for the path this k produces.

    Scan-line fill of the closed path: intersect each horizontal row with the
    polygon edges, pair the crossings, and accumulate the covered spans.
    """
    rx = r * abs(2.0 * k - 1.0)
    top, bottom = (CX, CY - r), (CX, CY + r)
    if limb == "right":
        limb_sweep, term_sweep = 1, (1 if k > 0.5 else 0)
    else:
        limb_sweep, term_sweep = 0, (0 if k > 0.5 else 1)
    poly = arc_points(*top, r, r, limb_sweep, *bottom)
    if rx > 1e-9:
        poly += arc_points(*bottom, rx, r, term_sweep, *top)
    poly.append(top)

    edges = list(zip(poly, poly[1:]))
    row_h = 2.0 * r / rows
    area = span_x = 0.0
    for i in range(rows):
        py = -r + (i + 0.5) * row_h
        crossings = []
        for (x0, y0), (x1, y1) in edges:
            if (y0 > py) != (y1 > py):
                crossings.append(x0 + (py - y0) * (x1 - x0) / (y1 - y0))
        crossings.sort()
        for a, b in zip(crossings[0::2], crossings[1::2]):
            area += (b - a) * row_h
            span_x += (b - a) * (a + b) / 2.0 * row_h
    mean_x = span_x / area if area else 0.0
    return area / (math.pi * r * r), mean_x


def main():
    print(f"{'k':>6} {'limb':>6} {'measured':>9} {'error':>8} {'lit centroid':>13}  verdict")
    failures = 0
    for limb in ("right", "left"):
        for k in (0.02, 0.15, 0.35, 0.50, 0.62, 0.85, 0.98):
            measured, centroid_x = measure(k, limb)
            err = abs(measured - k)
            # A crescent must hug the requested limb; a gibbous moon must
            # reach across the centre line, i.e. its centroid sits nearer the
            # middle. The sign of the centroid is the limb test.
            limb_side = 1.0 if limb == "right" else -1.0
            side_ok = math.copysign(1.0, centroid_x) == limb_side or abs(centroid_x) < 1e-6
            gibbous_reaches_far = (k > 0.5) == (abs(centroid_x) < DISC_R * 0.42)
            ok = err < 0.004 and side_ok
            if not ok:
                failures += 1
            print(
                f"{k:6.2f} {limb:>6} {measured:9.4f} {err:8.4f} {centroid_x:13.2f}"
                f"  {'ok' if ok else 'FAIL'}"
                f"{' (gibbous check off)' if not gibbous_reaches_far else ''}"
            )
    print()
    print("failures:", failures)
    print("NewMoon edge case, k=0 path:", repr(terminator_path(0.0, "right")))
    print("Half moon, k=0.5:", terminator_path(0.5, "right"))


if __name__ == "__main__":
    main()
