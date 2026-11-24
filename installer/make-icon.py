"""Generate installer/unphased.ico: a night-sky disc with the Sun's arc and the Moon.

    python installer/make-icon.py

The colours are the app's own (web/app/lib/palette.ts): night #0A0E18 at the top
of the disc, deepening to civil-blue #2B4C74 at the horizon; the daylight-band
blue #9FC3EA for the Sun's arc; the Moon-curve ivory #EFE0B7 for the Moon.

Written by hand rather than with Pillow so the repo keeps no image dependency.
An .ico member is a BITMAPINFOHEADER whose height is twice the image height
(colour pixels + AND mask) followed by bottom-up BGRA rows. The grid below is
indexed with y growing DOWNWARD like a screen, so row 0 is the top of the image
and the DIB's first row must be the BOTTOM — hence the reversed loop at the end.
"""

import struct
from pathlib import Path

OUT = Path(__file__).resolve().parent / "unphased.ico"
SIZES = [16, 24, 32, 48, 64, 128, 256]


def rgb(hex_str: str) -> tuple[int, int, int]:
    h = hex_str.lstrip("#")
    return int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16)


NIGHT = rgb("#0A0E18")   # the app's night band — the top of the disc
SEA = rgb("#2B4C74")     # civil twilight, the horizon end of the gradient
ARC = rgb("#9FC3EA")     # daylight band: the Sun's path across the sky
MOON = rgb("#EFE0B7")    # the Moon curve colour
CLEAR = (0, 0, 0)


def mix(a, b, t):
    return tuple(round(a[i] + (b[i] - a[i]) * t) for i in range(3))


def render(n: int) -> list[list[tuple[int, int, int, int]]]:
    """A grid indexed [y][x], y growing DOWNWARD (screen order).

    Cells hold plain (R, G, B, A). The channel swap happens exactly once, in
    bmp_entry(), which is the only place that knows about DIB byte order.
    """
    g = [[(*CLEAR, 0)] * n for _ in range(n)]
    r = n / 2 - 0.5
    cx = cy = n / 2 - 0.5
    arc_r = r * 0.62

    for y in range(n):
        for x in range(n):
            dx, dy = x - cx, y - cy          # dy grows downward: up is negative
            d = (dx * dx + dy * dy) ** 0.5
            if d > r:
                continue

            # Sky: night at the TOP of the disc (small y), deepening to civil blue
            # toward the horizon at the bottom.
            t = (y - (cy - r)) / (2 * r)
            col = mix(NIGHT, SEA, max(0.0, min(1.0, (t - 0.45) / 0.55)))

            # The Sun's arc: an arch over the upper half of the disc. Its centre is
            # BELOW the crown (dy positive = down), so what we draw is the top of a
            # circle — that is what makes it arch upward rather than sag.
            if dy < 0.10 * r:
                ad = abs((dx * dx + (dy - arc_r * 0.55) ** 2) ** 0.5 - arc_r)
                w = max(1.0, n / 22)
                if ad <= w:
                    col = mix(col, ARC, 1.0 - ad / w)

            # The Moon, on the crown of that arc, upper right (negative dy = up).
            mx, my = cx + arc_r * 0.55, cy - arc_r * 0.62
            if ((x - mx) ** 2 + (y - my) ** 2) <= (n / 13) ** 2:
                col = (*MOON, 255)

            edge = r - d
            a = 255 if edge >= 0.75 else int(255 * max(0.0, edge + 0.25))
            g[y][x] = (col[0], col[1], col[2], a)   # plain RGBA

    return g


def bmp_entry(n: int) -> bytes:
    """BITMAPINFOHEADER + bottom-up BGRA pixels + AND mask, as one .ico member."""
    g = render(n)
    rows = []
    for y in range(n - 1, -1, -1):          # grid row n-1 is the image BOTTOM,
        row = bytearray()                   # which is DIB row 0
        for r_, gr, b_, a_ in g[y]:
            row += bytes((b_, gr, r_, a_))  # RGBA -> BGRA: the one channel swap
        rows.append(bytes(row))
    px = b"".join(rows)

    mask_stride = ((n + 31) // 32) * 4
    mask = b"\x00" * mask_stride * n        # 0 bits: the colour channel decides

    header = struct.pack("<IiiHHIIiiII", 40, n, n * 2, 1, 32, 0, len(px), 0, 0, 0, 0)
    return header + px + mask


def main() -> None:
    entries = [(n, bmp_entry(n)) for n in SIZES]
    out = bytearray(struct.pack("<HHH", 0, 1, len(entries)))
    offset = 6 + 16 * len(entries)
    for n, blob in entries:
        dim = 0 if n >= 256 else n          # 0 means 256 in the directory entry
        out += struct.pack("<BBBBHHII", dim, dim, 0, 0, 1, 32, len(blob), offset)
        offset += len(blob)
    for _, blob in entries:
        out += blob
    OUT.write_bytes(bytes(out))
    print(f"{OUT}  ({OUT.stat().st_size / 1024:.1f} KB, sizes {', '.join(map(str, SIZES))})")


if __name__ == "__main__":
    main()
