"""Assemble the three rendered charts into one review page, with the design
system around them: band ramp, the illumination ramp at glyph sizes that
matter (chart marker, list row, watch complication), and a scroll preview that
animates the fixed-scale decision — night by night, only the bands and the
moon curve move."""

import argparse
import json
import re
from datetime import timedelta

from palette import CURVE, DAY_CYCLE, colour_of
from render import M_LEFT, M_TOP, PLOT_H, PLOT_W, W as STAGE_W, Scale, band_of, parse, phase_name, render, terminator

SIZES = [("chart marker", 9.0), ("list row", 14.0), ("watch complication", 11.0)]
RAMP = [0.02, 0.12, 0.25, 0.37, 0.50, 0.63, 0.75, 0.88, 0.98]

BAND_ROWS = [
    ("Civil", "sun 0 to \u22126\u00b0", colour_of("civil"), "setup, still no usable sky"),
    ("Nautical", "sun \u22126 to \u221212\u00b0", colour_of("nautical"), "horizon landmarks gone, bright stars only"),
    ("Astronomical", "sun \u221212 to \u221218\u00b0", colour_of("astronomical"), "faint targets, widefield work"),
    ("True darkness", "sun below \u221218\u00b0", colour_of("night"), "imaging window"),
]


def strip(k_values, limb, r, label):
    cells = []
    for k in k_values:
        d = terminator(k, r, limb)
        cells.append(
            '<div>'
            f'<svg viewBox="-{r + 4} -{r + 4} {2 * r + 8} {2 * r + 8}" width="{2 * r + 8}" '
            f'height="{2 * r + 8}"><circle r="{r}" fill="#161D2E" stroke="{CURVE}" '
            f'stroke-opacity="0.3"/>'
            + (f'<path d="{d}" fill="{CURVE}"/>' if d else "")
            + "</svg>"
            + f'<div class="cap">{int(k * 100)}%</div></div>')
    return (f'<div class="strip"><div class="striplabel">{label}</div>'
            f'<div class="cells">{"".join(cells)}</div></div>')


def scroll_svg(payloads, now=None):
    """One wide SVG: consecutive two-day frames laid side by side inside a
    viewport that is exactly one frame wide. The CSS animation pans it, which
    is precisely the fixed-scale behaviour: gridlines, labels and the plot
    frame never move; only bands, bars and the moon curve pass beneath them."""
    from render import W

    n = len(payloads)
    total_w = W * n
    parts = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} 470" '
             f'width="{W}" height="470" class="scrollstage" '
             f'font-family="Inter, Segoe UI, sans-serif">']
    parts.append('<rect width="980" height="470" fill="#0A0E18"/>')
    parts.append('<g class="panner">')
    for idx, p in enumerate(payloads):
        svg = render(p, now, ns=f"-{idx}").split("<svg", 1)[1].split(">", 1)[1]
        svg = svg.rsplit("</svg>", 1)[0]
        # Drop the per-frame page background; the stage supplies one.
        svg = re.sub(r'<rect width="\d+" height="\d+" fill="#0A0E18"/>', "", svg)
        # The viewBox is already one frame wide, so CSS scaling to the page
        # would shrink all n frames into it. Pin user units to pixels and let
        # the .stage div clip instead. SVG presentation attributes do not
        # carry px, so both forms are given.
        parts.append(f'<g transform="translate({W * idx},0)" '
                     f'style="transform: translate({W * idx}px,0)">{svg}</g>')
    parts.append('</g></svg>')
    return "".join(parts), total_w


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--scroll-days", type=int, default=0,
                    help="Render a fixed-scale scroll preview over N consecutive "
                         "nights at Prague (needs the matching night-*.json files).")
    opts = ap.parse_args()

    charts = [
        ("output/night-prague.json", "output/chart-prague.svg", "Tonight, Prague \u2014 near full moon. Fixed noon\u2192noon+2 scale: "
                             "the whole frame is identical every night; only bands and the curve move."),
        ("output/night-summer.json", "output/chart-summer.svg", "Prague, 21 June \u2014 the honest no-darkness case on the same fixed scale."),
        ("output/night-sydney.json", "output/chart-sydney.svg", "Sydney, 23 November \u2014 southern hemisphere, limb mirrored to the left."),
    ]
    inlined = []
    for idx, (json_path, path, caption) in enumerate(charts):
        payload = json.load(open(json_path, encoding="utf-8"))
        now = None
        if "prague" in path:
            now = parse("2026-11-23T22:30:00+01:00")
        svg = render(payload, now, ns=f"-f{idx}")
        inlined.append(f'<figure>{svg}<figcaption>{caption}</figcaption></figure>')

    bands = "".join(
        f'<div class="bandrow"><span class="swatch" style="background:{hex_}"></span>'
        f'<b>{name}</b><span class="def">{deg}</span><span class="use">{use}</span>'
        f'<code>{hex_}</code></div>'
        for name, deg, hex_, use in BAND_ROWS)

    scroll_block = ""
    if opts.scroll_days > 1:
        payloads = []
        for d in range(opts.scroll_days):
            p = json.load(open(f"output/night-scroll-{d}.json", encoding="utf-8"))
            payloads.append(p)
        stage, total_w = scroll_svg(payloads)
        dur = opts.scroll_days * 2
        scroll_block = f"""
<h2>Scroll preview \u2014 the fixed scale in motion</h2>
<div class="stage">{stage}</div>
<p class="lede">Consecutive nights on one stage. Watch the gridlines, the HORIZON
rule and the midnight marker: they never move. Only the twilight bands, the
sunset/sunrise bars and the moon curve flick past — exactly what the date
scrubber will do. The animation pans {opts.scroll_days} frames over {dur}s.</p>
<style>
  .stage {{ overflow:hidden; border:1px solid #1B2233; border-radius:8px; }}
  .scrollstage {{ display:block; width:{total_w}px; max-width:none; }}
  .panner {{ animation: pan {dur}s linear infinite; }}
  @keyframes pan {{ from {{ transform: translate(0,0); }}
                    to   {{ transform: translate(-{STAGE_W}px,0); }} }}
</style>"""

    html = f"""<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<title>Night planner \u2014 visual design review</title>
<style>
  body {{ background:#0A0E18; color:#E2E8F0; margin:0 auto; max-width:1060px;
         padding:36px 22px 80px; font:15px/1.6 Inter,'Segoe UI',sans-serif; }}
  h1 {{ font-size:22px; letter-spacing:-0.01em; }}
  h2 {{ font-size:14px; text-transform:uppercase; letter-spacing:0.14em;
        color:#8C9BB4; margin:44px 0 14px; font-weight:600; }}
  p.lede {{ color:#8C9BB4; max-width:70ch; }}
  figure {{ margin:0 0 34px; }}
  figure svg {{ width:100%; height:auto; border:1px solid #1B2233; border-radius:8px; }}
  figcaption {{ color:#8C9BB4; font-size:13px; margin-top:8px; }}
  .bandrow {{ display:flex; align-items:center; gap:14px; padding:9px 0;
              border-bottom:1px solid #161D2E; }}
  .swatch {{ width:46px; height:22px; border-radius:4px; border:1px solid #2A3550; }}
  .bandrow b {{ width:130px; }}
  .def {{ color:#8C9BB4; width:150px; }}
  .use {{ color:#8C9BB4; flex:1; }}
  code {{ color:{CURVE}; font-size:12px; }}
  .strip {{ margin-bottom:18px; }}
  .striplabel {{ font-size:12px; color:#8C9BB4; margin-bottom:6px; }}
  .cells {{ display:flex; align-items:flex-end; gap:12px; }}
  .cap {{ font-size:10px; color:#8C9BB4; text-align:center; margin-top:4px; }}
  .cells > div {{ display:flex; flex-direction:column; }}
  .note {{ background:#101725; border-left:3px solid #F87171; padding:12px 16px;
           border-radius:0 6px 6px 0; color:#C7D2E3; font-size:14px; }}
  ul {{ color:#8C9BB4; }} li {{ margin-bottom:6px; }}
  li b {{ color:#E2E8F0; }}
</style></head><body>
<h1>Night planner \u2014 visual design review (round 2)</h1>
<p class="lede">Every chart is drawn from real astropy output for a real place
and date. Round 2 applies the four decisions of 23 November: fixed noon\u2192noon+2
x scale, altitude truncated at 0&#176;, near-black night with progressively
lighter blues toward daylight, and the yellow-ivory moon kept.</p>

<h2>The three cases that decide the design</h2>
{"".join(inlined)}
{scroll_block}
<h2>Band palette \u2014 decided 23 Nov</h2>
{bands}
<div class="note">Night is near-black and each step toward daylight is a
clearly lighter blue. The steps are chosen to be roughly equal in perceptual
lightness, because an eyeballed ramp tends to bunch at one end and the bands
stop reading as four zones. The standalone <code>band-palette.svg</code> shows
the continuous dusk\u2192night\u2192dawn strip with its gradient blends.</div>

<h2>The illumination ramp, at the sizes that matter</h2>
{strip(RAMP, "right", 9.0, "Northern hemisphere \u2014 waxing lit on the right, terminator is a half-ellipse of semi-minor axis r&#183;|2k\u22121|")}
{strip(RAMP, "left", 9.0, "Southern hemisphere \u2014 the same moments, mirrored")}
{strip([0.02, 0.25, 0.50, 0.75, 0.98], "right", 14.0, "List rows and the planner header")}
{strip([0.02, 0.25, 0.50, 0.75, 0.98], "right", 11.0, "Watch complication \u2014 11 px radius survives the tiny sizes because the terminator stays an ellipse")}

<h2>Decisions applied (round 2)</h2>
<ul>
  <li><b>Fixed x scale: noon \u2192 midnight (plot centre) \u2192 next noon.</b>
      Every night renders at identical pixel geometry, so date scrolling is a
      pure translation of bands and curve. Sunset/sunrise get amber vertical
      bars; daylight hours outside the window are painted faint civil blue.</li>
  <li><b>Altitude truncated at 0&#176;.</b> Below-horizon geometry no longer
      exists on this chart. The moon curve is clipped to alt &gt; 0 and
      rise/set markers sit exactly on the horizon line, labelled.</li>
  <li><b>Palette: near-black night, progressively lighter blues</b> through
      astronomical, nautical and civil twilight toward daylight.</li>
  <li><b>Yellow ivory moon kept,</b> warm against the cool ramp so the curve
      never disappears into a twilight band. Zoom for altitude and %illumination
      is a desktop/phone interaction; the watch keeps only the icon.</li>
</ul>
<h2>Still open</h2>
<ul>
  <li><b>x-scale prototypes.</b> Sunset-anchored and dark-window-only variants
      remain worth prototyping against this fixed frame before M1 locks it.</li>
</ul>
</body></html>"""
    open("output/mockup.html", "w", encoding="utf-8").write(html)
    print("wrote output/mockup.html")


if __name__ == "__main__":
    main()
