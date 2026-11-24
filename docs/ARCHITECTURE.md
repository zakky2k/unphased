# ARCHITECTURE — codebase map, complexity notes, portability plan

Written 2026-11-24 after the gates-first refactor (`LiveNightChart` 738 → 399 lines,
`lib/chart/*` extracted, golden + unit gates added). Behaviour was not changed:
parity, golden and planner tokens are byte-identical to before the move.
Chart laws live in `docs/REQUIREMENTS.md` §4.1; session state in `HANDOFF.md`.

## 1. What is where

```
planner/            astronomy authority (Python, astropy/numpy/pytz)
  night.py          compute_night() + night_payload() → the §6 JSON contract
  tests/test_night.py  20 hand-rolled checks (pytest is NOT installed)
api/server.py       stdlib http.server, 127.0.0.1:8642, GET /api/night, CORS *
design/             the reviewed static design probes + output/*.svg + *.json fixtures
web/app/            Next.js 16 (Turbopack) + React 19 + TS, hand-composed SVG
  components/night-chart/
    Planner.tsx         location/date controls, dispatches planner:* window events
    LiveNightChart.tsx  the live chart: state + events + JSX only (376 ln)
    NightChart.tsx      static design probe, FROZEN reference for the parity gate
  lib/chart/            pure modules, the chart laws (no React, no DOM)
    geom.ts       frame (12:00 UTC → 00:00 UTC → 12:00 UTC+1) + x/y scales + interp
    clock.ts      wall parts via Intl, HH:MM clocks, focus record, day stamps
    scrub.ts      clamp/snap/±1 h/typed/live/focus-epoch laws
    sunbands.ts   boundaries (official events + sampled threshold crossings) + paint order
    labels.ts     transition leaders, axis corner/centre clocks, header titles, tip width
    moonchips.ts  rise/set chips: 30-min gap, outside-first, flip inside on collision
    moontrack.ts  moon series, glyph hidden below the horizon, arc, readout rise
  lib/{types,api,palette,settings}.ts   payload type, fetch, blue/red schemes, localStorage
  scripts/        build-time gates only, never imported by the app
    tokens.ts (shared tokenizer) parity.ts golden.ts units.ts fix-aliases.mjs
  tests/golden/<case>.tokens.txt   committed SSR baselines for the live chart
docs/REQUIREMENTS.md  §4.1 chart laws, §6 JSON contract, §9 milestones
docs/PORTABILITY.md   the three target shapes (web / app shell / NINA) in plain language
```

Root-level `moon_calendar.py`, `pi_swap_to_xisf.py`, `PyUpdateExp.py`,
`wbpp_exposure_report.py`, `tally_astro.py`, `checkExposure.py`,
`PI_Swap_recover.js`, `PI_updateexistMasterExposure.js` are **unrelated legacy
tools**: zero coupling to the app (the only edge is `checkExposure.py` importing
`PyUpdateExp`). Moving them to a `legacy/` folder is proposed but not done — it
would move README sections and REQUIREMENTS M3 wording, so it waits for approval.
`requirements.txt` stays put either way.

## 2. The only coupling: §6

`GET /api/night?date&lat&lon&tz` → JSON (frame, night start/end, sun
sunset/sunrise/events/trueDarkness/series, moon samples/moonrise/moonset/limb).
Python decides every number; TypeScript only draws and interacts. Five keys are
in the payloads but undocumented in §6 (`frameNoon`, `sun.series`,
`sun.deepestSunAltitude`, `moon.waxing`, moon `illumFraction`) — the type in
`lib/types.ts` is the de-facto documentation. Worth folding into §6 next time the
contract is touched. One asymmetry to settle then (REQUIREMENTS §11.7): the chart
frame is pinned to UTC (round 6) while the payload's sample window and transition
list are anchored to the site's local noon, so `sunbands.ts` interpolates any
threshold crossing inside the frame that `sun.events` does not cover.

Bit stability is what the gates depend on: astropy applies no atmospheric
refraction, rounding widths are fixed (3/2/4/3/2 dp) and compared as exact
strings. Anchors: Prague 2026-11-24 night → sunset `2026-11-23T16:02:58.800119+01:00`,
sunrise `2026-11-24T07:35:29.424916+01:00`, `deepestSunAltitude −60.61`. Any
astronomical library swap (NOVAS/SOFA/SPA) moves Prague sunset by ~2–3 minutes
and forces a fixture re-baseline — so `planner/night.py` stays the single
astronomical authority for all portability shapes.

## 3. Complexity: what got cheaper, what is still hard

Cheaper after this round:
- The chart laws are now functions with names, so they can be argued about and
  tested without a browser (`lib/chart/scrub.ts` is the whole "scrubbing never
  changes the night" rule in 66 lines).
- One tokenizer instead of two near-copies; the parity gate shrank and the golden
  gate became possible.
- Component is state + JSX; the risk of the old failure mode (hook-order churn,
  "Maximum update depth exceeded") is structurally lower.

Fixed in the 24 Nov round-5 commit (was "still hard"):
- **Focus axis vs frame axis — FIXED.** Focus/live/typed/step values are now real
  epoch seconds, the same number line the frame and payload samples use
  (`clock.epochAtWall` is the only wall→instant conversion, iterating to a fixed
  point for DST). Marker, thumb and readout sit exactly on the axis they are drawn
  on at any zone (+1 h = 37.5 px Prague, +11 h = 412 px Sydney), and
  `scripts/units.ts` pins it. The old `KNOWN (awaiting review)` check was replaced
  by positive assertions in the same commit that fixed it.
- **Header weekday quirk — gone as a side effect.** `dayOfWeek` derives the weekday
  from the calendar-date fields of the payload's own ISO stamp, so Sydney's
  "Tue 24 Nov" sunrise prints "Tue 24" instead of "Mon 24".
- **Day-switch cost — fixed.** `Planner.tsx` now keeps a bounded cache of every
  night it has drawn and prefetches ±1/±2 days at idle, with a generation guard so
  a late payload cannot paint over the current night; day-stepping feels like
  leafing frames. The §6 contract is untouched.

Still hard, deliberately not touched this round:
- **Planner-side payload quirks** (would change committed fixtures, need approval):
  the frame request is effectively 48 h while §6 describes 24 h, the moon sample
  grid has an off-by-one at the frame edge (290 samples, the last one 10 minutes
  past the edge, where the sun series has 289), and grid construction is duplicated
  four times with two different semantics; pytz + `timedelta` keeps the
  pre-transition offset on DST nights (last sun sample of the 2026-03-30 night
  reads `13:00+02:00`).

## 4. Test strategy and what each gate can actually see

| gate | command | sees | blind to |
|---|---|---|---|
| app types | `npx.cmd tsc --noEmit` | the whole app graph | anything runtime |
| parity | `…\scripts\parity.js` | static `NightChart` vs committed design SVGs (136/120/132 tokens) | live interaction |
| golden | `…\scripts\golden.js` | `LiveNightChart` SSR token stream (126/116/126) | hover, marker, slider, anything needing a tick |
| units | `…\scripts\units.js` | 160 law checks on the pure modules | layout collisions that need pixels, real browser quirks |
| planner | `python -m planner.tests.test_night` | 20 astronomy/contract checks | rendering |

Re-baseline deliberately: `node .gates-build\scripts\golden.js --update` after an
approved behaviour change, never to make a failure go away.

## 5. Portability

Full plain-language version, with verified code references and the open decisions:
**`docs/PORTABILITY.md`**. This section is the short form.

### 5a. Hosted web app + PWA (first step, smallest change)
The app is already a plain client hitting one JSON endpoint, so hosting is mostly
deployment: `NEXT_PUBLIC_API_BASE` is **build-time only** (`lib/api.ts`), which is
the one real blocker — a hosted build cannot bake in the API origin per deployment.
Plan: read the base at runtime (a `window.__ASTRO_API__` bootstrap or a same-origin
`/api/night` reverse-proxied by the host), keep CORS `*` for local dev only, and
add per-IP caching of `night?<date,lat,lon,tz>` responses (astropy work is a few
hundred ms and the answers are deterministic per day). PWA = manifest + service
worker + static export of the read-only shell; the chart already needs no server
once a payload is in cache, so an offline "last night" mode is cheap.
Caveat: the current API is HTTP/1.0 with no keep-alive and no OPTIONS preflight —
fine for a proxied same-origin setup, worth fixing before it faces the internet.

### 5b. Standalone desktop / mobile
Same web layer, different shell: package the exported UI in a WebView
(Tauri/Electron/Capacitor) and either (i) bundle the Python planner as a local
sidecar, or (ii) precompute a compact per-observer JSON pack. Prefer (i) for
correctness (one astronomy authority) and (ii) for phones, where shipping CPython
is the pain. `api/server.py` needs two small changes for (i): bind port 0 and
expose a shutdown handle instead of `serve_forever()` with module constants.

### 5c. NINA plugin (last, feasible)
NINA (reference clone at `..\NINA`, HEAD `db6b909`, v3.3.0.1070) is
`net10.0-windows` + WPF, MPL 2.0 — an MIT plugin is compatible. A plugin is one
DLL exporting `[Export(typeof(IPluginManifest))]`, dropped under
`%LOCALAPPDATA%\NINA\Plugins\3.3.0\`, loaded in its own `PluginAssemblyLoadContext`;
extension points are whatever `PartsImport` accepts (`ISequenceItem/Condition/
Trigger/Container`, `ResourceDictionary` DataTemplates, `IDockableVM`,
`IPluggableBehavior`, `IEquipmentProvider`, `IPlateSolverProvider`) with DI via
`[ImportingConstructor]` (`PluginLoader.cs:824-855`, `:581-623`). The old names
(`PluginContainer`, `MenuAdd`, `IAstronomicalPlugin`, `IPersistenceService`, the T4
template) no longer exist — do not code against them.
The realistic shape is a **bridge, not a port**: NINA already ships WebView2
(`NINA.WPF.Base.csproj:58`, `View/Browser.xaml.cs`), and it already computes this
same noon→noon+1 night through `INighttimeCalculator.Calculate()` (`GetReferenceDate`
clamps to 12:00, `NighttimeCalculator.cs:67-97`) plus twilight/moon services
(`MoonInfo.cs:102-121` samples 24 h at 0.1 h = 10-minute steps — the same idea as our arc),
and it has a ready-made `AltitudeChart` control plus `WaitForSunAltitude` sequence
items. So: dockable view (`IDockableVM` + DataTemplate hosting WebView2) that
renders the existing web chart against a payload adapter fed by NINA's own
calculators, settings through `PluginOptionsAccessor` (needs an assembly `[Guid]`),
symbols through `ISymbolBroker.RegisterSymbolProvider("Planner")` so sequences can
consume them. Build against NuGet `NINA.Plugin` (newest published, e.g.
`3.3.0.1069-nightly`) and rebuild per NINA minor. Re-deriving astropy in .NET is
the wrong move: NOVAS/SOFA in NINA are P/Invoke wrappers over native DLLs in an
unchecked-out submodule, and a port shifts contact times by minutes, breaking every
committed fixture. Prerequisite to confirm on the target machine: Evergreen WebView2
runtime.

## 6. Suggested order
1. ~~Fix the focus-axis defect~~ — **done 24 Nov (round 5)**, with the `units.ts`
   assertions and §4.1 wording updated in the same round.
2. Runtime API base + same-origin `/api` proxy + payload caching → deployable web app.
3. PWA shell (manifest, service worker, static export of the read-only view).
4. Planner contract clean-ups (§6 documenting the five extra keys, sample-grid
   off-by-one, DST grid semantics) — each re-baselines fixtures, so one commit each.
5. Native shell experiment (sidecar planner) once the web layer is portable.
6. NINA bridge spike: manifest + dockable WebView2 view + read-only payload adapter,
   no astronomy port.
