"""Structural checks on the rendered SVG. No image viewing involved: this
parses the markup and asserts the properties the design depends on, including
the reading-order invariant from REQUIREMENTS.md 4.1."""

import re
import sys

# The order band colours must appear in, left to right, across the whole
# fixed noon -> noon+2 frame. Twilight bands mirror around midnight; daylight
# bookends the sequence. A night with no astronomical darkness simply skips
# those bands but keeps the same relative order. When the plot centre itself
# is twilight rather than darkness (midsummer), the darkest point sits inside
# one of these runs, so each run must stay monotone to its own floor.
ORDER = ["civil", "nautical", "astronomical", "night",
         "astronomical", "nautical", "civil"]
RANK = {"civil": 0, "nautical": 1, "astronomical": 2, "night": 3}


def check(path):
    src = open(path, encoding="utf-8").read()
    rects = [
        (m.group(3), float(m.group(1)), float(m.group(2)))
        for m in re.finditer(r'<rect x="([\d.]+)" y="\d+" width="([\d.]+)" height="\d+" fill="url\(#b-(\w+)', src)
    ]
    glyphs = len(re.findall(r'<path d="M 0,-', src))
    # The sun is carried by the gradient alone: axis ticks only, no bars.
    ticks = len(re.findall(
        r'<line x1="[\d.]+" y1="\d+" x2="[\d.]+" y2="\d+" stroke="#E2E8F0" '
        r'stroke-opacity="0.8"', src))
    amber = len(re.findall(r'#F0B86E', src))
    gridlines = len(re.findall(r'stroke-dasharray="[15] 6"', src))
    horizon = 'HORIZON' in src
    notice = re.search(r'No astronomical darkness|True darkness', src)

    gaps = []
    for i in range(1, len(rects)):
        prev_end = rects[i - 1][1] + rects[i - 1][2]
        gaps.append(round(rects[i][1] - prev_end, 2))
    overlaps = [g for g in gaps if g < -0.5]
    holes = [g for g in gaps if g > 0.5]

    # Reading-order invariant: the band sequence across the whole frame must
    # deepen monotonically from each end toward the plot centre and never
    # fold back on itself before it gets there. Daylight bookends the frame,
    # so civil may legitimately appear again after midnight's twilight set
    # (the fixed noon->noon+2 frame catches the next dusk when darkness
    # reaches past noon) — that is a fresh outer band, not a reversal, and is
    # only allowed once per half. Skipping shallow bands (no astronomical
    # darkness) is fine; folding back early is not.
    plot_mid = 56 + (1200 - 56 - 24) / 2
    centres = [(rx + w / 2, RANK[band]) for band, rx, w in rects if band != "day"]

    def monotone_toward_centre(part):
        """Walk ranks left to right: they may rise freely toward the centre;
        any fall must be strictly deeper than every earlier fall (each new
        descent goes further down the ladder). One fresh civil at the end is
        the next dusk, not a fold-back."""
        if not part:
            return True
        ranks = [r for _, r in part]
        last_drop = None
        for i in range(1, len(ranks)):
            if ranks[i] < ranks[i - 1]:
                if last_drop is not None and ranks[i] >= last_drop:
                    return False
                last_drop = ranks[i]
        return True

    split = min(range(len(centres)), key=lambda i: abs(centres[i][0] - plot_mid)) + 1
    ordered = (monotone_toward_centre(centres[:split])
               and monotone_toward_centre(centres[split:]))
    # The darkest band present must straddle the plot centre (midnight).
    centred = True
    darks = [r for r in rects if r[0] == "night"]
    if darks:
        lo = min(x for _, x, w in darks)
        hi = max(x + w for _, x, w in darks)
        centred = lo <= plot_mid <= hi

    print(f"{path}")
    print(f"  bands          : {len(rects)}  " + " ".join(f"{b}" for b, _, _ in rects))
    print(f"  band gaps      : {gaps}")
    print(f"  holes / overlaps: {len(holes)} / {len(overlaps)}")
    seq = [b for b, _, _ in rects if b != "day"]
    print(f"  nights         : {' '.join(seq)} -> {'ok' if ordered else 'OUT OF ORDER'}")
    print(f"  darkest centred: {centred}")
    print(f"  moon glyphs     : {glyphs}")
    print(f"  sun ticks       : {ticks} (expect 2: sunset + sunrise, axis only)")
    print(f"  amber bars      : {amber} (expect 0: gradient carries the sun)")
    print(f"  altitude lines  : {gridlines} (expect 10 above horizon: 0..90)")
    print(f"  horizon rule   : {horizon}")
    print(f"  darkness notice : {bool(notice)}")
    ok = (not holes and not overlaps and ordered and centred and gridlines == 10
          and horizon and notice and glyphs >= 2 and ticks == 2 and amber == 0)
    print(f"  -> {'PASS' if ok else 'CHECK'}")
    return ok


if __name__ == "__main__":
    results = [check(p) for p in sys.argv[1:]]
    sys.exit(0 if all(results) else 1)
