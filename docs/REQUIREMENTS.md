# Unphased — Night Planner

Status: v0.1 (published) · Owner: zakky2k · Last updated: 2026-11-24

## 1. Vision

A phone-first web tool that answers one question at a glance: **is the sky
usable tonight, and for how long?** It answers visually — a single chart of the
dark window in which the Moon is drawn as a recognisable, physically accurate
icon travelling its real altitude path, sitting on top of shaded twilight
bands.

The same information later reaches an Apple Watch face complication, so a
user standing outside at 23:00 can see remaining dark time and current moon
illumination without unlocking a phone.

The existing repository is the calculation backbone. Its moon-calendar code
already computes phases, moon altitude on phase days and twilight bands; the
planner is the interactive, location-aware front end of that same math.

## 2. Goals

| # | Goal | Why it matters |
|---|---|---|
| G1 | One chart per night, sunset to sunrise, immediately legible | The whole product value is in a single glance |
| G2 | Moon icon whose illuminated fraction is accurate and progresses smoothly toward full, then wanes | Aesthetic hook and the actual decision input for astrophotography |
| G3 | Civil / nautical / astronomical twilight shaded distinctly at both dusk and dawn | Tells the user when the sky is genuinely dark, not just when the sun is down |
| G4 | Time on x, altitude on y, with the Moon's true path across the window | Matches the mental model already used by N.I.N.A. Sky Atlas and Framing Assistant |
| G5 | Correct for any observer location, not just Prague | Current scripts hardcode 50° N / Prague longitude |
| G6 | Astronomy computation isolated behind one contract | Lets deployment target change without touching the UI; enables the Watch later |
| G7 | Same chart reusable in the existing PDF calendar | One renderer, two outputs |

## 3. Non-goals for the first milestone

Explicitly out of scope, to keep the first release small and reviewable.

- Target catalogue, deep-sky object search, constellation figures.
- Mount, telescope, camera or filter management.
- Framing footprints, sensor overlays, rotator angles.
- Weather and cloud-forecast integration.
- Session logging, sub-frame tallying, WBPP reporting in the browser.
- User accounts, authentication, saved locations beyond local storage.
- Native iOS/watchOS application (the Watch deliverable is a later milestone).

## 4. Chart specification

### 4.1 Axes

- **x axis** — a **fixed single-night frame anchored to UTC: 12:00 UTC →
  00:00 UTC (plot centre) → 12:00 UTC of the following day**, re-pinned 24 Nov
  (round 6) after live review. The left edge is ALWAYS 12:00 UTC, the exact
  centre is always 00:00 UTC, the right edge is 12:00 UTC one day later, at
  every site on Earth and in every season. Round 5 had already made every
  printed clock UTC; round 6 moved the frame itself onto that same scale so a
  corner can no longer print a number that surprises the reader, and the
  centre becomes an immovable point to line nights up against when flicking
  through them (the reviewer's flipbook). (The frame used to be anchored to the
  observer's LOCAL noon and midnight, and before that to a two-day span; both
  are superseded.) Every night renders at identical pixel geometry, so
  scrolling date by date is a pure translation: the gridlines, labels and plot
  frame never move; only the twilight bands and the moon curve change.
  Daylight hours outside the night window are painted in the lightest band at
  low opacity, flat — never with a gradient that fakes a transition. The
  sun's position is expressed **entirely through the background gradient** —
  sunset and sunrise are where the gradient crosses the horizon colour, not
  separate graphical elements (amber bars removed after review, 23 Nov). The
  moon curve is the only thing drawn on top of the bands.
  - **Dates name the night, the chart runs on ONE scale, named once** — review
    24 Nov (round 5), carried through the round-6 anchor, relabeled by review
    24 Nov (round 7). Every clock PRINTED on the chart — the axis, the
    transition labels, the moon chips, the marker chip, the tooltip, the
    readout and the summary strip — is **UTC**, but round 7 deleted the "UTC"
    SUFFIX from every one of them: after three rounds the repetition read as
    clutter on an already busy plot. The scale is named once instead, in the
    header, whose time box now reads **LOCAL TIME (All chart elements UTC)** —
    and that box stays the only local clock on the page. One scale stated once
    still means a night at any site can be read and compared without zone
    maths, and a marker can never disagree with its own axis. With the frame
    itself pinned to UTC all three axis anchors are fixed clocks: `12:00`,
    `00:00`, `12:00`, night after night, site after site.
  - **The reading order is the site's, the honesty is ours** — consequence of
    the UTC anchor, accepted by the reviewer 24 Nov. A site a few hours from
    UTC still reads afternoon → dusk → dark → dawn → afternoon. Far from UTC
    the sky wraps inside the frame: at Sydney (UTC+11) the frame runs local
    23:00 → 23:00, so the chart opens and closes on dark sky with the whole
    daylight period in the middle of it. What the renderer must still enforce
    is the honest version of the invariant: the band stack is the sky the sun
    is actually showing, in time order, turning over at most once — never a
    band painted past a real transition. Because a payload only lists the
    transitions of the night it is anchored to, any threshold the sun crosses
    inside a far-from-UTC frame with no official event gets its band edge
    interpolated from the payload's own altitude samples
    (`sunbands.sampledCrossings`, round 6). Those interpolated edges are drawn
    but deliberately NOT printed as transition clocks, and the payload's
    sample window (local noon → +2 d) still has to be widened before sites
    WEST of UTC render completely — parked follow-up needing sign-off, see
    §6/portability.
  - **Axis time labels** — review 24 Nov (round 9 wording and cell, replacing
    round 7's; round 7's placement and its deleted "UTC" suffixes stand). Every
    fixed-scale clock prints its **TIME first, then the day and date**: bottom-left
    `12:00 Mon 23`, bottom-right `12:00 Tue 24`, top centre `00:00 Tue 24 Nov` —
    none of them carrying a "UTC" suffix. The clock is what the chart is read
    against, so it leads; the day and date only say which night that 12:00 belongs
    to. The two corner clocks sit BELOW the x axis and keep **only two daylight
    lines**: the short piece of x axis they hang from (1 px, the cell's top side)
    and the y axis extended 20 px below the horizon down their OUTER side (2 px, so
    it reads as the axis rather than as decoration). The inner wall, the bottom wall
    and the translucent page fill behind the text are GONE — a corner clock is the
    axis corner extended downwards, not a box floating under it (round 9; the closed
    boxes were round 7). Collision with the 45° transition text is ruled out
    structurally, not by luck: the whole transition strip starts below the cells
    (`labels.TRANSITION_Y`, 13 px under where they end), for any site and whatever
    transitions fall near an edge of the frame. All three labels use the SAME font
    size, colour and opacity as the transition labels, so they read as one family;
    the focus-marker chip rides well ABOVE the corner clocks so the two can never
    overlap.
- **Realtime behaviour** — added 23 Nov with the live app. The chart is a
  live view: the now line tracks the observer's clock continuously (minute
  ticks), and exactly ONE moon glyph sits at the moon's current position on
  its arc, advancing along the curve as time passes. The static multi-glyph
  phase trail from the design probe is not part of the app view. A **time
  control** (scrub slider + ±1 h steps, placed ABOVE the chart) moves that
  focus point — and with it the moon glyph — anywhere in the frame; "live"
  re-arms clock tracking. An editable **TIME field** beside the night
  stepper mirrors the focus time to the MINUTE and accepts typed HH:MM[:SS]
  or h:mm AM/PM (review 24 Nov round 4: **seconds removed from every clock
  display** — the live clock ticks once per wall-clock minute, so a seconds
  readout would only ever sit at :00 with no visual resolution or benefit;
  scrub positions snap to the minute grid; round 5: **typing a 24-hour time
  while the box is in 12-hour mode switches the whole display to 24 h**, so
  the number typed is the number read back); a small **"24" button inside the box** toggles every clock
  on screen between 12 h (AM/PM suffix) and 24 h display. The moon glyph is
  **pinned to a point on its arc**, and — review 24 Nov (round 5), replacing
  the round-4 park rule — it is **not drawn at all while the moon is below the
  horizon**: no moon in the sky, no moon on the chart. The old rule (park the
  glyph at the nearest rise/set ON the curve) made the Moon look stuck at 0°
  altitude for hours of dark sky, and it contradicted what a sky atlas shows.
  It stays pinned to the curve while up, so there is still no CSS tween cutting
  a chord across the sky during fast scrubbing. Scrub/step move the focus
  freely along the whole frame (round 3: the old focus *snap* to the nearest
  rise/set is gone); live clock ticks behave the same way.
  Scrubbing NEVER flips to another night (round 3 — see "Scrubbing NEVER
  changes the chart" below); the
  incoming payload **carries the focus to the same place on the new night**
  (round 7 — see "A night change CARRIES the marker" below; the earlier
  "park at that night's moonrise" pre-step ping-ponged the focus between two
  nights and tripped React's update-depth guard). Mouseover
  anywhere in the plot shows a tooltip with the coordinates under the cursor:
  UTC time on x, altitude in degrees on y. The control row is
  **static**: every item has a fixed width (only the slider flexes) and the
  "live" button is always present, merely dimmed while live — it never pops
  into or over the cursor's spot, because the intended interaction is
  *repeatedly* pressing "+1 h" to walk the moon across the frame. The step
  buttons are labelled **−1 h / +1 h** and styled with the app's standard
  palette (same look as the other buttons), not browser defaults — review 24
  Nov (round 5) extended that to the scrub row itself: −1 h / +1 h / ⏱ live and
  the slider all take the app's dark-blue control style, with the slider thumb
  in the now-red of the marker it moves. The row prints **no clock** (round 5):
  the time the marker sits at is printed **on the chart**, in a chip attached
  to the red line, built like the rise/set chips and bordered in now-red; the
  row's fixed slot only says "live clock" or "scrubbed".
  - **The scrub axis is a real instant** — review 24 Nov (round 5) fixed a
    defect the reviewer found by pushing the slider to both ends: focus was
    carried as wall-clock fields read as if they were UTC, while the frame and
    every payload sample are real instants. The marker, thumb and readout
    therefore sat one zone-offset right of the scale they were drawn on
    (1 h = 37.5 px in Prague, 11 h = 412 px in Sydney), the error compounded
    on every drag ("cannot scrub earlier than 14:00"), −1 h looked like it
    stepped forward, and typed 22:00 drew at midnight. Everything the
    scrubber reads and writes is now one number line: slider, marker,
    payload samples. One hour on the axis is always 37.5 px, and a typed or
    stepped time lands exactly where its own clock says it does.
  - **Scrubbing NEVER changes the chart** — review 23 Nov (round 3, replaces
    the earlier "moon movement ends at moonset" flip rule): the scrub bar and
    −1 h / +1 h buttons move time WITHIN the fixed frame only. The slider
    always spans exactly 12:00 → 12:00+1 (the full frame, never clamped to
    moonset). The moon rises and sets along its path and simply has no effect
    once below the horizon — scrubbing past moonset (or before moonrise) only
    hides the glyph (round 5). No day/chart flip may EVER be
    triggered by the scrub bar; only the explicit day controls (header ◀ / ▶
    day stepper, "tonight") switch nights. Pressing −1 h at the frame start
    must genuinely step (and clamp) — it previously did nothing visible.
  - **Zone DST nudge ("+/-1H" button) — RETIRED by review 24 Nov (round 7)**
    — introduced 23 Nov, its scope fixed in round 5: a small button at the
    right end of the ZONE box shifted the **LOCAL TIME display** by whole hours
    (+1 → +2 → +3 → −3 … → off) for zones whose daylight-saving state disagreed
    with the IANA zone. Round 7 deleted the button **and everything behind it**:
    the window event it fired, the `?tz=±h` headless hook, the chart's
    `tzOffsetH` state and `clock.shiftClock`. The reason is that the local
    display is `fmtClock(instant, tz, h12)` read straight off the IANA zone,
    and the zone owns the summer/winter switch by itself — the same instant
    reads **01:00** on a Prague clock in November and **02:00** in June,
    **10:00** on a Sydney clock in June and **11:00** in December. `units.ts`
    now pins that daylight-saving law down, so the nudge can never come back as
    a "fix" for a clock that was never wrong.
 - **The zone control is a dropdown of real zones, not a number** — review
   24 Nov (round 7, item 4): the ZONE box used to be a free-text field, and the
   reviewer asked whether a dropdown would be cheap and offline. It is, but it
   lists **IANA zones** (`lib/chart/timezones.ts`, ~100 entries) rather than
   bare "UTC Offset" numbers, because a fixed number cannot follow the
   summer/winter switch item 3 has just handed back to the zone, and the
   planner API takes a zone name in the first place. Entries are **ordered by
   the offset each zone is actually using on the night on screen** (west→east,
   so `UTC` sits mid-list) and labelled `Europe/Prague · UTC+1`; the offset
   therefore reads `UTC+1` on a November night and `UTC+2` on a June one.
   Committing a lat/lon (blur or Enter) auto-selects the nearest entry in the
   bundled table — static data plus Intl, no geo service, no network call, no
   change to the §6 contract. A zone saved by an older build keeps its entry
   instead of snapping, and `units.ts` pins the ordering, the labelling, the
   half/quarter-hour zones, the offline property and the auto-pick.

 - **Night flips are instant — a flipbook, not a fetch** — review 24 Nov
   (round 5, D2): stepping ◀ / ▶ day by day should feel like leafing through
   frames of the Moon's path changing night over night, but each night used to
   pay a full planner round-trip (1–2 s, and the ⏳/dimmed flicker made the
   wait feel worse). The page therefore **caches every night it has drawn**
   (bounded, oldest dropped — the ceiling is sized to hold the whole prefetch
   window) and **prefetches ±10 nights around the one on screen** (round 10, up
   from ±2), at idle, only once that night is on screen, nearest first
   (`+1, −1, +2, −2, …`) and **one request at a time**: the API computes under the
   GIL, so two in parallel buy no speed (measured ~1.1 s alone, ~2.1 s each as a
   pair) and would only make a press wait behind two running jobs. The walk
   **restarts from whatever night is shown next**, so the warm window follows the
   reader through the calendar; failures are ignored. Cached nights paint
   immediately with no busy state at all, and a late reply for a night the user
   already left never paints over the current one. The first visit to a night is
   still one round-trip; every return — and every step inside the warm window —
   is free.
 - **A night change CARRIES the marker, it never resets it** — review 24 Nov
   (round 7, item 5): pressing ◀ / ▶ used to snap the red dashed focus line back
   to the live clock — the middle of the frame — which made the flipbook the
   round-5 caching exists for useless: the Moon could not be held at one clock
   time while the nights changed underneath it. Because round 6 pinned every
   frame to UTC, one night's frame is **exactly `DAY_SEC`** from its neighbour's
   — daylight-saving weekends included, pinned in `units.ts` for the Prague,
   New York and Sydney transition weekends — so the carry is arithmetic:
   `carryFocus(prev, next, scrubbed, live)` in `lib/chart/scrub.ts` moves the
   focus by the number of days the frame MOVED and by nothing else. The marker,
   its chip and the moon glyph on it keep the same pixel; only the sky around
   them changes. A scrubbed focus stays scrubbed; a **live** marker is carried to
   the same place as a scrub (the real clock is not inside another night, and
   leaving it live would park the line on a frame edge), and **⏱ live** is the
   one explicit way back to the clock. An edit that does NOT change the night —
   a lat/lon or ZONE change — leaves live tracking untouched, and a big jump (a
   typed date) carries the position too. Cost: one comparison and an addition, no
   extra fetch, since the neighbours are already cached/prefetched.
 - **DARK scheme** — review 23 Nov: a **"DARK" button beside the TIME box**
   switches the sky palette from blue to red at *identical lightness*: every
   colour is its blue counterpart with the B channel moved into R (civil
   #27476E → #6E2727, page #0A0E18 → #180A0A, daylight #4E7FB5 → #B54E4E…),
   so band contrast and hierarchy are exactly preserved. Variants B (lighter
   ink/coral daylight) and C (darker bands) were reviewed 23 Nov; the user chose
   **A, the strict swap** as final, and the red now line stays as-is.
 - **The DARK scheme is red ALL THE WAY DOWN** — review 24 Nov (round 8): the
   toggle used to leave the page still wearing blue. Two complaints, both fixed.
   **(a) Chrome boxes** — inputs, the ZONE select, the ◀ / ▶ stepper, −1 h / +1 h
   / ⏱ live, the scrubber, the nested 12/24 button and the summary-strip cells
   all carried a hard-coded `#121826`, so they read as blue chips floating on the
   red page. Every chrome surface is now a CSS variable (`--bg`, `--ink`,
   `--ink-bright`, `--edge`, `--edge-hi`, `--field`, `--field-hi`,
   `--field-hi-hover`, `--cell`) and the red block derives each from the blue by
   the rule the sky already uses, **(R,G,B) → (B,R,R)**: #121826 → #261212,
   #1d2637 → #371d1d, #101625 → #251010, #33415c → #5c3333. A box can no longer
   be blue in red mode by accident, because nothing outside the two `:root`
   blocks names a colour at all (the now-red accent excepted, deliberately the
   same in both schemes). **(b) The Moon** — its arc, glyph, glyph-backdrop ring,
   crossing dots and tooltip frame take their own scheme colour `CURVE_RED`
   **#DCB0A0**: the ivory #EFE0B7 with its green (the yellow) pulled down hardest,
   blue down too, and a few points off overall, so the Moon sits *inside* the red
   sky instead of on top of it. It stays the palest warm line on the chart — well
   above daylight #C85E5E and the now line #F87171 — so "the pale warm thing is
   the Moon" still reads. **(c) Text** — every ink loses a few points in the red
   scheme (bright #F0E2E2 → **#E2D3D3**, secondary #B48C8C → **#A68181**), in the
   chart palette and the page chrome together, keeping a slightly reddish tint (R
   above G=B): red ink on a red page carries more apparent weight than blue on
   blue. The **blue** scheme — the one the design probes and the golden token
   stream were made in — is untouched byte for byte, and `units.ts` pins the
   band-ladder lightness identity, the surface derivation rule, the size of the
   ink drift and the no-hard-coded-box law.
- **Transition timestamps** — review 23 Nov (refined twice): every official
  stage (sunset, each twilight edge, sunrise) prints its exact HH:MM at 45°
  **strictly BELOW the chart** — in the below-0° strip, never inside the plot.
  Since round 5 (24 Nov) those HH:MM values are **UTC** like the rest of the
  chart; round 7 (24 Nov) took the "UTC" suffix off them AND off the summary
  strip labels, which now read simply "Sunset" / "Darkness begins" — the scale
  they are on is stated once, in the header. A short leader line runs from the
  middle of the label's last letter up to
  its transition line. Dusk-side labels sit left of their line sloping
  up-right into it; dawn-side labels mirror on the right. Stage words are
  abbreviated (naut., astro.) so the tight twilight sequence never collides.
  **Text colour** (review 23 Nov, 3rd round): ALL chart text uses one colour
  per scheme — the bright ink — in both palettes. The sunset/sunrise labels
  must match the civil/nautical/astronomical transition labels EXACTLY (the
  earlier band-tint exception was dropped because it read as a different
  colour). The axis corner clocks and the centre `00:00` label use that SAME
  size, colour and opacity too (round 5) — one text family on the chart. The
  header TIME box is labelled **LOCAL TIME (All chart elements UTC)** (round 7)
  and is the ONLY local clock on the page.
- **Daylight tone** — review 23 Nov, re-tuned 24 Nov (round 5): the daylight
  fill must be a paler, brighter blue than the lightest twilight band
  (sunset/sunrise edge); day must never read darker than dusk. Flat fill, no
  gradient. The old fill (#4E7FB5 at 0.42 over the page, ≈ #213D5A) composited
  *level with* civil twilight (#27476E) and read as darker; the daylight fill
  is now brighter still (#5E8FC8 / red #C85E5E) at 0.60 over the page, so the
  ladder reads cleanly: **daylight > civil > nautical > astronomical > night**.
- **Reading-order invariant** — added 23 Nov after review, restated 24 Nov
  (round 6) for the UTC-anchored frame. The frame's centre is **00:00 UTC**, a
  fixed clock, and the sky is placed wherever the site's longitude puts it: at
  Prague (UTC+1) the chart still runs Day 1 daylight → sunset → twilight
  (civil, nautical, astronomical) → darkest → **the darkest moment just left
  of centre** → twilight in reverse → sunrise → Day 2 daylight; at Sydney
  (UTC+11) it runs dark → dawn → daylight → dusk → dark. The invariant the
  renderer enforces is therefore about TRUTH, not about position: the band
  stack matches the sun's altitude band at every instant, boundaries sit on
  real threshold crossings (official event, or interpolated from the payload's
  altitude samples when the payload has none for that part of the frame), the
  gradient of every band fades from the brighter end, and the stack turns over
  at most once. This is a sanity check the renderer must enforce, not rely on.
- **Moon curves span their whole arc** — a moon rising at 20:00 and setting
  during the following day is drawn across that entire arc; nothing about the
  frame clips or truncates it (the only cut is altitude ≤ 0°). The arc stays
  visible through the DAYLIGHT hours of the frame too, so its rise point can
  be seen after sunrise (review 23 Nov: the API therefore samples the moon's
  track across the whole noon→noon+2 span, not just sunset→sunrise).
  Moonrise and moonset markers always appear if they fall inside the
  noon→noon+1 window. Their labels are **horizontal chips INSIDE the plot,
  just above the horizon** (review 23 Nov): dark background, light-but-not-
  white text, a thin ivory border matching the curve, drawn LAST so nothing
  covers them. **Height** (round 5, 24 Nov): a chip's BOTTOM edge sits on the
  **10° altitude line**, clear of the curve's start and of the transition
  labels below the plot — both chips, always, so they read as a pair. Slots
  are RELATIVE to the rise/set point (review 23 Nov, 2nd round — no more
  fixed corner slots; review 24 Nov round 4 — gap tightened to 30 minutes):
   the RISE chip prefers OUTSIDE the curve — its RIGHT edge sits 30 minutes
   BEFORE the rise time (≈19 px at this frame width) — and only flips inside
   the curve when that outside spot collides with the moon path itself, runs
   off the plot/gridline boundary, or overlaps another chip AND the inside
   spot is clear; the SET chip prefers OUTSIDE too — its LEFT edge starts 30
   minutes AFTER the set time — flipping inside only on genuine
   collision/overlap. Round 5 (24 Nov) made that preference survive a
   near-edge crossing: when the outside spot does not fit, the chip **clamps
   to the plot edge and stays on its outside side** (it shortens into the
   frame rather than jumping across the curve), and it only flips when the
   arc genuinely intrudes on the outside spot (more than ≈12 px), not on a
   graze. A chip never overlaps another chip: a final pass separates a rise/set
   pair that lands on top of each other. Labels name the zone the axis is
   printed on — **"rise 14:57" / "set 06:26"**, still the chart's UTC scale but
   WITHOUT the "UTC" suffix since round 7 (24 Nov): the scale is named once, in
   the header, not on every clock. The chip box sizes itself to the label, and
   the header readout shows the corresponding moonrise for the current focus.
- **y axis** — altitude in degrees above the geometric horizon, **truncated at
  0°**: below-horizon geometry does not exist on this chart. Major graduations
  every 10°, from 0° to 90°, with faint gridlines and a distinct horizon rule.
  The moon curve is clipped to altitude > 0; moonrise and moonset markers sit
  exactly on the horizon line, labelled. The plot's two vertical edges extend
  20 px BELOW the axis in the daylight strip's colour (`labels.AXIS_TICK_DOWN`),
  both sides, drawn 2 px thick so they read as the axis continuing rather than
  as decoration (round 7, 24 Nov; round 6 had a bare 10 px tick): each one is
  the OUTER side of that corner's day-time label box, so the clock hangs in a
  box built out of the axis itself and visibly belongs to the daylight at that
  end of the frame.
- **Zoom** — desktop and phone only: pinch/scroll zoom reveals per-moment
  altitude and illumination % tooltips. The watch keeps only the phase icon;
  no chart.
- Altitude reference: **standard astronomical altitude** (geometric horizon,
  no refraction correction) for the first milestone. Recorded as an open
  question in §11.

### 4.2 Twilight bands

Vertical bands spanning the full height of the plot, with a smooth gradient
between adjacent bands rather than hard edges. Two sets, mirrored around the
night's darkest moment — the frame centre only at a site near UTC (round 6).
Palette decided 23 Nov: near-black night, progressively
lighter blues toward daylight; steps chosen roughly equal in perceptual
lightness so all four read as distinct zones (see `design/palette.py`, the
single source of truth):

| Band | Solar altitude range | Colour (dark theme) |
|---|---|---|
| Day | sun > 0° | lightest band at low opacity, outside the night window only |
| Civil | 0° to −6° | `#27476E` |
| Nautical | −6° to −12° | `#18304F` |
| Astronomical | −12° to −18° | `#0D1B31` |
| Night | sun < −18° | `#05070C`, near-black — the usable imaging region |

A night with **no** astronomical twilight — common at high northern latitudes
in June and July, where the sun never reaches −18° — must render honestly as a
permanently lit window, with a visible notice and how low the sun actually
got, rather than pretending to be dark. This is a correctness requirement, not
a cosmetic one.

### 4.3 Moon path

- Plotted as a smooth curve of altitude against time over the whole night
  window, sampled at 10-minute intervals (approximately 150 points per night)
  so the characteristic sinusoidal shape is faithful and never visibly
  polylinear.
- The curve exists only where altitude > 0°; it is clipped at the horizon
  rather than drawn below it. Moonrise and moonset markers sit on the horizon
  line with `rise`/`set` labels.
- A **marker every two hours** while above the horizon, plus one at moonrise
  and moonset, each showing the moon icon at that instant; glyphs nudge apart
  when they would collide with each other or the sunset/sunrise bars.
- Azimuth is not an axis. It is exposed as a tooltip and in the marker's
  accessible text label. Zoom (desktop/phone) reveals altitude and
  illumination % at any moment.

### 4.4 Moon icon

The icon is the visual signature of the product, so it is specified precisely.

- Drawn procedurally as an SVG path: the illuminated limb is a semicircle of
  radius *r*; the terminator is a half-ellipse with semi-minor axis
  *r* · |cos β|, where β is the phase angle. This yields the correct crescent,
  quarter, gibbous and full shapes continuously, with no discontinuity at the
  quarter phase.
- Illuminated fraction *w* = (1 − cos β) / 2, cross-checked against astropy's
  `illum_fraction` to within 0.01.
- Waxing moon is illuminated on the **right** limb as seen by a northern-
  hemisphere observer; waning on the left. In the southern hemisphere the two
  are mirrored. The API returns a `limb` field so the client never guesses.
- The icon is tinted, not merely resized: full moon renders bright, new moon
  renders as a faint disc outline. Illumination drives fill luminance so the
  progression "brightens toward full and dims after" is visible as a glow,
  which was the stated intent.
- A crescent thinner than roughly 1% illuminated renders as an outline plus a
  label rather than a sliver too thin to see.

## 5. Functional requirements

Each requirement is verifiable as written.

- **FR1 Location.** The user sets latitude, longitude and IANA time zone; the
  zone is picked from a dropdown of real zones (each showing the offset it is
  using on the night on screen) and is auto-selected from the lat/lon the user
  typed — no external geo call. Values persist locally between visits. Default
  is the repository's existing reference site (50° N, Prague longitude,
  `Europe/Prague`) until the user changes it. Acceptance: setting latitude
  −33.0 renders southern-hemisphere limb orientation and correct June/December
  behaviour, and the zone entry follows to an Australian one.
- **FR2 Date selection.** The user chooses the night to start from, defaulting
  to the current date at the observer's location. Acceptance: selecting 2026-06-21
  at latitude 50° N shows no astronomical twilight and displays the honest
  "no true darkness" notice.
- **FR3 Night window.** Sunset, sunrise, and all six twilight transitions are
  computed for the chosen night and location, and match astropy's
  `altaz`-based altitudes to within 1 minute of time. Acceptance: automated
  comparison against the existing `moon_calendar.py` values for the same site.
- **FR4 Moon track.** Altitude and azimuth sampled every 10 minutes, plus exact
  moonrise and moonset times. Acceptance: the curve is smooth at 10× zoom;
  markers fall within 2 minutes of astropy-computed rise/set.
- **FR5 Moon phase.** Illuminated fraction and phase angle at every marker and
  at local midnight. Acceptance: agrees with astropy to within 0.01 fraction.
- **FR6 Summary strip.** Above the chart: sunset, sunrise, start and end of
  astronomical darkness, total dark minutes, moonrise, moonset, and Moon
  illumination at local midnight. Acceptance: all values present, in the
  observer's time zone, 24-hour clock.
- **FR7 Single endpoint.** All of the above is available from one API
  endpoint; the client performs no astronomy.
- **FR8 Responsive layout.** The chart is usable from a 320 px wide phone to a
  desktop window. Acceptance: at 320 px, hourly labels drop to every second
  hour without overlap; axis text never smaller than 11 px.
- **FR9 Chart export.** The rendered chart serialises to a standalone SVG that
  is embeddable in the existing PDF calendar. Acceptance: a unit test renders
  the chart to a file that opens in an SVG viewer.

## 6. API contract

`GET /api/night?date=YYYY-MM-DD&lat=<float>&lon=<float>&tz=<IANA>`

Response, all times ISO 8601 with explicit UTC offset for the observer's zone:

```json
{
  "location": { "lat": 50.0, "lon": 14.4, "tz": "Europe/Prague" },
  "nightStart": "2026-11-23T16:31:00+01:00",
  "nightEnd":   "2026-11-24T07:41:00+01:00",
  "sun": {
    "sunset":  "2026-11-23T16:31:00+01:00",
    "sunrise": "2026-11-24T07:41:00+01:00",
    "events": [
      { "band": "civil",       "time": "...", "edge": "start" },
      { "band": "nautical",    "time": "...", "edge": "start" },
      { "band": "astronomical","time": "...", "edge": "start" }
    ],
    "trueDarkness": false
  },
  "moon": {
    "samples": [
      { "time": "...", "altitude": 12.4, "azimuth": 118.0,
        "illumFraction": 0.42, "phaseAngle": 1.94 }
    ],
    "moonrise": ["...", "..."],
    "moonset":  ["..."],
    "limb": "right",
    "midnight": { "time": "...", "illumFraction": 0.44, "altitude": 31.2 }
  },
  "summary": { "darkMinutes": 412, "moonUpDuringDark": true }
}
```

Errors are returned as `{ "error": { "code": "...", "message": "..." } }` with
an appropriate HTTP status. Out-of-range latitude or longitude returns 422.

## 7. Architecture

- **Frontend:** Next.js + TypeScript. The chart is hand-composed SVG using
  `d3-scale` for scales and ticks and `d3-shape` for the curve path. No
  general-purpose charting library, because twilight gradients and a
  phase-accurate moon glyph are not series and do not fit a chart abstraction.
- **Astronomy:** Python with astropy, isolated in one package with no
  framework dependency, so it can run as a local API during development and be
  ported or reimplemented deliberately later.
- **Boundary:** the §6 contract is the only coupling. The UI must not
  reimplement any astronomy; the Python layer must not know about HTTP
  serialisation details beyond this shape.
- **Deployment:** undecided (§11). The contract is designed so the choice is
  reversible.

## 8. Non-functional requirements

- **NFR1 Accuracy.** Times within 1 minute and altitudes within 0.1° of
  astropy at the reference site for every year 2026–2035 (sampled nightly).
- **NFR2 Performance.** A full night response generated in under 300 ms warm;
  the chart paints within 100 ms of data arrival.
- **NFR3 Offline during development.** The ephemeris and any lookup tables are
  cached on disk so the app runs with no network, matching the existing
  `--ephemeris` offline behaviour.
- **NFR4 Accessibility.** Every chart element has a text equivalent; a
  screen-reader summary of the night is provided in words. Colour is never the
  sole encoding of a twilight band — band labels are drawn.
- **NFR5 Line endings and reproducibility.** Already enforced: `.gitattributes`
  normalises to LF, `.python-version` pins Python 3.13, `requirements.txt`
  pins exact versions.

## 9. Milestones

1. **M1 — Chart.** Contract implemented in Python; Next.js app renders the
   chart for any location and date; FR1–FR8 pass.
2. **M2 — Icon and polish.** Moon glyph tuned, summary strip, export (FR9),
   dark/light theme, accessibility pass.
3. **M3 — Calendar integration.** The same renderer feeds `moon_calendar.py`
   PDF output, replacing today's bespoke table layout for phase pages.
4. **M4 — Watch.** Data delivered for a watchOS complication: remaining dark
   minutes, current illumination, next twilight transition. Needs a decision
   on server-side versus on-device computation (§11).

## 10. Repository layout proposed for M1

```
unphased/
  web/
    app/                 Next.js + TypeScript
      components/night-chart/
    api/                 thin HTTP layer over planner
  planner/               pure Python astronomy package
    tests/
  installer/             Inno Setup script and icon generator
  docs/
```

This repository contains only the night planner. It was forked from the
AstroScripts workbench at its `3336987` commit; nothing outside the planner
lives here.

## 11. Open questions

1. **Deployment target.** GitHub Pages static (astronomy must move to
   JavaScript) versus Docker on a VPS or home server (Python stays
   authoritative). Not blocking M1, because the contract is the same.
2. **Refraction.** Should altitudes include atmospheric refraction, which
   lifts the Moon by roughly 0.6° at the horizon and changes rise/set times by
   a few minutes? Recommend: no for M1, add a toggle later.
3. **Watch computation.** If the Watch must work offline, the astronomy has to
   run on the watch, which argues for a JavaScript or Swift reimplementation
   and against the Python-only plan. Decide before M4.
4. **Generated artefacts in git.** `CalendarOutputs/` currently tracks one
   generated PDF, and `--with-images` caches downloaded photography. Decide
   whether build outputs and downloaded media belong in history or in a
   release asset / object store.
5. **Which night is "tonight" near a time-zone boundary**, and behaviour for
   polar day and polar night where sunset or sunrise does not occur at all.
6. **DARK (red) scheme contrast.** RESOLVED 23 Nov: the user picked variant
   A — the strict B→R channel swap at identical lightness — over lighter-ink
   (B) and darker-band (C) alternatives, and the red now line stays as-is.
7. **Payload coverage vs the UTC frame** — raised 24 Nov with round 6. The
   chart frame is now `12:00 UTC → 12:00 UTC +1 day`, but the planner still
   samples from the site's LOCAL noon for two days and lists twilight
   transitions only for the night it is anchored to. Consequences today: at
   sites well EAST of UTC the frame reaches into the next night, whose
   transitions are not in the payload, so the chart draws those band edges by
   interpolating the payload's own altitude samples (`sunbands.sampledCrossings`)
   and deliberately does not print clocks for them; at sites WEST of UTC the
   frame starts before the first altitude sample. The clean fix is a planner
   change — start the sample window 12 h earlier and emit the following night's
   transitions as well — which touches §6 and the portability story, so it is
   parked until signed off.

## 12. Definition of done for M1

A chart renders in a browser for Prague, for a high-latitude summer night with
no astronomical darkness, and for a southern-hemisphere site, with moonrise and
moonrise and moonset markers, hourly graduations, 10° altitude gridlines, and
phase-accurate moon icons, and the §6 contract is covered by automated tests
that compare against astropy directly.
