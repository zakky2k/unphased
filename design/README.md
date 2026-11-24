# Design probe — night chart visual design

Standalone scripts that compute real astronomy (astropy) and render the night
chart as SVG, so the visual design is judged on verifiable numbers rather than
decoration. The geometry here is the reference the TypeScript front end will
be ported from; `docs/REQUIREMENTS.md` §4 is the contract.

Run everything from this folder with the repo venv:

```powershell
cd design
$py = ..\.venv\Scripts\python.exe
```

## Scripts

### probe.py — data source (astropy)

Computes one night's window and moon track as JSON: noon-pivot night
definition, twilight crossing times, topocentric moon altitude/azimuth on a
10-minute grid, illumination fraction, rise/set events, and the sun's altitude
across the full fixed two-day frame (noon → noon+2).

```powershell
# Tonight at Prague (default location)
& $py probe.py --out output\night-prague.json

# Midsummer night, the no-astronomical-darkness case
& $py probe.py --date 2026-06-21 --out output\night-summer.json

# Southern hemisphere (limb mirroring check)
& $py probe.py --date 2026-11-23 --lat -33.8688 --lon 151.2093 `
    --tz Australia/Sydney --out output\night-sydney.json
```

Prints a summary (sunset, sunrise, twilight edges, moonrise/set, darkness
minutes) and writes the JSON that every other script consumes.

### palette.py — the band palette, single source of truth

Not run directly: imported by `render.py` and `palette_mock.py` so the chart
and the swatch mock can never drift apart. Near-black night (#05070C), then
progressively lighter blues toward daylight; steps roughly equal in
perceptual lightness. Yellow-ivory moon curve #EFE0B7.

### palette_mock.py — the band palette as a reviewable mock SVG

Flat swatches with hex + solar-altitude range, the continuous dusk→night→dawn
strip with its gradient blends, and the ivory moon curve checked against each
band for contrast. No astronomy needed.

```powershell
& $py palette_mock.py output\band-palette.svg
```

### render.py — chart renderer (JSON → standalone SVG)

Implements §4: fixed noon→noon+2 x scale, altitude truncated at 0°, merged
twilight band runs with dusk/dawn gradient blends, horizon rule, moon curve
clipped above the horizon, two-hour phase glyphs plus labelled rise/set on
the horizon line, peak callout, darkness (or no-darkness) footer. `ns=`
suffixes defs ids so several charts can be inlined in one HTML document.

```powershell
& $py render.py output\night-prague.json output\chart-prague.svg
# with a "now" marker:
& $py render.py output\night-prague.json output\chart-prague-now.svg `
    --now 2026-11-23T22:30:00+01:00
```

### mockup.py — the review page

Assembles the three scenario charts (rendered live through the same code, not
from saved files), the band ramp, the illumination ramp at real sizes (chart
marker, list row, watch complication), and — with `--scroll-days N` — an
animated fixed-scale scroll preview: consecutive nights on one panning stage
so you can see that gridlines/labels never move while bands and curve flick
past.

```powershell
# first generate the scroll nights (N consecutive dates):
foreach ($d in 23..26) { & $py probe.py --date "2026-11-$d" --out "output\night-scroll-$($d-23).json" }
& $py mockup.py --scroll-days 4   # writes output\mockup.html
```

### mooncheck.py — glyph maths validator

Rasterises the terminator path at many illumination fractions, measures the
lit area and centroid, and asserts they match (1 − cos β)/2 and sit on the
correct limb. Run after any change to `terminator()` in render.py.

```powershell
& $py mooncheck.py    # exits non-zero on failure
```

### svgcheck.py — structural chart validator

Parses rendered SVGs and asserts what the design depends on: band runs cover
the plot with no gaps/overlaps, 10 altitude gridlines, horizon rule present,
darkness/no-darkness notice present, exactly 2 sunset/sunrise bars, ≥2 phase
glyphs. Run after any change to render.py.

```powershell
& $py svgcheck.py output\chart-prague.svg output\chart-summer.svg output\chart-sydney.svg
```

## Regenerating everything (the current committed set)

```powershell
& $py probe.py --out output\night-prague.json
& $py probe.py --date 2026-06-21 --out output\night-summer.json
& $py probe.py --date 2026-11-23 --lat -33.8688 --lon 151.2093 --tz Australia/Sydney --out output\night-sydney.json
& $py palette_mock.py output\band-palette.svg
foreach ($n in "prague","summer","sydney") { & $py render.py "output\night-$n.json" "output\chart-$n.svg" }
& $py render.py output\night-prague.json output\chart-prague-now.svg --now <today>T22:30:00+01:00
& $py mooncheck.py
& $py svgcheck.py output\chart-prague.svg output\chart-summer.svg output\chart-sydney.svg
```

`output/` is gitignored except the committed SVGs; probe JSON and PNG previews
are reproducible scratch. To rasterise an SVG for quick viewing:
`winget install linebender.resvg`, then `resvg -z 1.2 in.svg out.png`.
