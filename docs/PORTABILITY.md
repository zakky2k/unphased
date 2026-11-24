# PORTABILITY — the verdict in plain language

Written 2026-11-24 so this can be picked up cold in the next session. It expands the
dense §5 of `docs/ARCHITECTURE.md` into something readable, and every claim below is
checked against real code (our repo at `86a91b3`, the NINA reference clone at
`..\NINA`, HEAD `db6b909`, version 3.3.0.1070). Session state lives in `HANDOFF.md`;
the chart rules in `docs/REQUIREMENTS.md` §4.1; the code map in `docs/ARCHITECTURE.md`.

## 0. The verdict in five sentences

1. The app is already portable in the way that matters: all astronomy lives in one
   Python file, and the browser UI is a plain client that asks one JSON endpoint for
   everything. Nothing else is entangled.
2. **Public web app: easy.** One line blocks it — the API address is baked in at build
   time (`web/app/lib/api.ts:7-8`), so a hosted build cannot point at its own API
   without a rebuild. Fix that, serve the UI and API from one origin, add caching.
3. **Desktop / mobile app: medium, and mostly already done** — the UI needs no server
   once it has a payload, so wrapping it in a WebView shell is a packaging job rather
   than a rewrite.
4. **NINA plugin: feasible, but as a bridge, not a port.** NINA already hosts web pages
   in its own embedded browser and already calculates the same night (its "night" also
   starts at 12:00). The right plugin shows *this* chart inside a NINA dockable panel
   fed by NINA's own numbers.
5. What must **not** happen is rewriting astropy in C#: it moves contact times by
   minutes, which silently invalidates the fixtures and golden baselines that all 23
   review rounds are pinned to.

## 1. Verdict table

| Target shape | Verdict | Real blocker | Effort (my estimate) |
|---|---|---|---|
| Hosted web app | Yes, straightforward | API base URL is build-time only; HTTP/1.0 dev server | ~1 session |
| PWA / offline | Yes, cheap | No manifest, no service worker, no static-export config | ~1 session after the above |
| Standalone desktop (Windows) | Yes, medium | Packaging + shipping Python alongside the app | 2–4 sessions |
| Standalone mobile | Yes, but different data story | Shipping CPython on a phone is the pain; needs precomputed packs | 3–5 sessions, after desktop |
| NINA plugin | Yes, as a bridge | Decisions below (§5.4) + WebView2 runtime on the target PC | spike ~1 session, solid 3–5 |

Nothing here requires changing what the user sees on the chart. If any step would,
that step needs their sign-off first.

## 2. What already travels (the portable core)

- **One contract, one owner.** `GET /api/night?date&lat&lon&tz` → the §6 JSON in
  `docs/REQUIREMENTS.md`. Python (`planner/night.py`) computes every number;
  TypeScript only draws and handles interaction. That seam is what every port reuses.
- **Astronomy is a single module.** `planner/night.py` + `planner/` package, with its
  own 20-check test suite (no pytest needed: `python -m planner.tests.test_night`).
- **The chart laws are pure functions now** (`web/app/lib/chart/*.ts`: frame, scales,
  scrub clamping, chips, bands, labels) with 160 unit checks and no React/DOM. Any
  future host can reuse them as-is.
- **Gates need no browser and no server**: parity, golden and units run from files.
  That is what makes risky porting steps safe to attempt.
- **The UI does not depend on a Next server.** `next.config.ts` is empty, there are no
  API routes, no middleware, no rewrites, no env features — the page fetches its
  payload client-side and renders the SVG in the browser. Static export is therefore a
  config decision, not a refactor.

## 3. Shape A — hosted web app (do this first)

**The one blocker.** `lib/api.ts:7-8` reads `process.env.NEXT_PUBLIC_API_BASE`, which
Next inlines at *build* time. A build you upload to any host has the API origin frozen
into it. Two ways out, both small:
- **Same-origin (recommended):** serve the UI and the API behind one host
  (`/api/night` → the Python service), and delete the environment variable from the
  runtime path. No CORS, no mixed origins, no per-deployment build.
- Runtime bootstrap (e.g. a `window.__ASTRO_API__` value in the HTML shell) if the API
  must live on a different origin.

**Also needs doing before it faces the internet** (`api/server.py`):
- It is a `ThreadingHTTPServer` on `127.0.0.1:8642`, HTTP/1.0 (no keep-alive),
  `Access-Control-Allow-Origin: *`, and no `do_OPTIONS` preflight. Fine for local dev
  and for a same-origin proxy; not fine as a public endpoint. Keep CORS `*` local-only.
- Add caching of `night?<date,lat,lon,tz>` responses. The answers are deterministic per
  site+date and astropy work costs a few hundred ms, so this is pure win.
- HTTPS comes from the host (reverse proxy), not from this file.

**Deliberately out of scope:** auth/accounts, multi-profile storage. The app is
single-user by design and location/date live in `localStorage` (`lib/settings.ts`).

## 4. Shape B — PWA and offline (small add-on to A)

The chart already needs **no server once a payload is in hand**, which is unusual and
valuable: cache the payload and the whole night is usable offline.
- Add a web manifest + icons (the `public/` folder is currently empty of both; note the
  leftover `public/scrub*` interaction drivers must never be committed).
- Add a service worker: cache the static shell, serve cached `night?...` responses,
  fall back to "last night you looked at".
- Turn on Next static export (`output: "export"` in the currently empty
  `next.config.ts`) for the read-only shell. Expected to work because there is no
  server-side data fetching — verify the golden gate is unaffected (it renders the
  component directly, so it should be).

## 5. Shape C (desktop / mobile) and Shape D (NINA)

### 5.1 Same web layer, different shell
Wrap the exported UI in a WebView (Tauri or Electron on Windows, Capacitor on phones).
No UI rewrite. The question is only *where the numbers come from*.

### 5.2 Two data strategies
- **(i) Python sidecar** — bundle the planner and talk to it locally. Keeps exactly one
  astronomy authority, so every fixture and golden baseline stays valid. Best for
  desktop. Needs two small changes in `api/server.py`: bind port `0` (let the OS pick)
  and expose a shutdown handle instead of `serve_forever()` with module constants.
- **(ii) Precomputed packs** — generate a compact per-observer JSON file and ship it.
  Best for phones, where bundling CPython is the pain. Costs a generator + freshness
  story, and the pack must be produced by the same `planner/night.py` output.

### 5.3 Why not a NINA plugin by *porting*
Re-deriving astropy in C# would shift rise/set/twilight contact times by minutes
(any astronomy library swap moves Prague sunset by ~2–3 minutes). Every committed
fixture, parity reference and golden token stream is pinned to astropy's exact numbers
(3/2/4/3/2 dp, compared as exact strings), so a port would break all of them at once
and quietly invalidate 23 rounds of visual review. Also: NINA's own astronomy is
P/Invoke wrappers over native NOVAS/SOFA DLLs in an **unchecked-out submodule**
(`git submodule status` shows `NINA/External` and `NINA.Docs` prefixed with `-`, i.e.
not initialized), so you cannot even build against them without pulling submodules.

### 5.4 The recommended NINA shape: a bridge
A NINA plugin is one DLL exporting `[Export(typeof(IPluginManifest))]`
(`NINA.Plugin/PluginLoader.cs:820-821`, and the "does not export IPluginManifest"
rejection at `:362`), dropped under `%LOCALAPPDATA%\NINA\Plugins\3.3.0\`, loaded in its
own `PluginAssemblyLoadContext`. NINA imports whatever MEF parts it recognises:
`IDockableVM` (`PluginLoader.cs:847-848`), sequence items/conditions/triggers,
`DataTemplate` resources, `IPluggableBehavior`, equipment/plate-solver providers, with
DI through `[ImportingConstructor]`.

The bridge itself:
- **A dockable panel hosting WebView2.** NINA already ships WebView2
  (`NINA.WPF.Base/NINA.WPF.Base.csproj:58` → `Microsoft.Web.WebView2 1.0.4078.44`) and
  already has the working pattern (`NINA.WPF.Base/View/Browser.xaml.cs:37-54`, cache
  folder under `CoreUtil.APPLICATIONTEMPPATH`). So the existing React chart can render
  *inside* NINA unchanged.
- **Numbers from NINA, not from our API.** A payload adapter maps NINA's own services
  into the §6 JSON. NINA's night is already noon-anchored — `NighttimeCalculator.cs:88`
  (`GetReferenceDate` clamps to 12:00 of the previous day) — and `Calculate()`
  (`:60-86`) gathers astronomical/civil/nautical twilight, sunrise/sunset, moonrise/set
  and moon phase/illumination, cached by site+timezone. Moon altitude is sampled over
  24 h in **0.1 h steps** (`MoonInfo.cs:110-113` = 10 minutes), which is exactly our
  moon-arc grid idea.
- **One frame-law mismatch for the adapter to handle (round 6).** The chart frame is
  pinned to UTC — `12:00 UTC → 00:00 UTC → 12:00 UTC +1 day` — while NINA's night is
  anchored to 12:00 of the observer's local day. That is fine as long as the adapter
  keeps supplying a `frameNoon` (it only selects WHICH night to render, the clock
  scale is UTC), but NINA's samples and transition lists cover the local night, and
  our own payload window is likewise local noon → +2 d, so a UTC-pinned frame at a
  site far from UTC reaches past the data (REQUIREMENTS §11.7). The renderer bridges
  the gap by interpolating band edges from the payload's own altitude samples, and
  deliberately prints no clocks for those edges; an adapter should either widen its
  window to cover the frame or expect unlabelled interpolated edges.
- **Sequence integration later, and cheaply:** register symbols via
  `ISymbolBroker.RegisterSymbolProvider("Planner")`
  (`NINA.Sequencer/Logic/ISymbolBroker.cs:28`, `SymbolBroker.cs:837`) so a sequence can
  read planner values; NINA already has `WaitForSunAltitude` / `SunAltitudeCondition`
  that use the same reference date.
- **Settings** through `PluginOptionsAccessor`
  (`NINA.Profile/PluginSettingsTemplate.cs:50`, `:711-715` — needs an assembly `[Guid]`).
- **Build against the NuGet `NINA.Plugin` package**, not this clone, and expect to
  rebuild per NINA minor (`PluginCompatibility.IsCompatible`, `PluginCompatibility.cs:49`).
- **Licence is fine**: NINA is MPL-2.0 (`LICENSE.txt`/`COPYING` in the clone root), so an
  MIT-licensed plugin coexists; MPL only asks that changes to *its* files stay open.

**What the bridge does NOT mean:** no C# rewrite of the chart, no Python inside NINA,
no dependency of NINA on our server, no astropy-in-.NET.

**Consequence to accept and say out loud:** inside NINA, the numbers are NINA's, so they
will differ from the web app by seconds-to-minutes. That is acceptable for planning
(both are ~1-minute-accurate), but it means the NINA panel must say which calculator it
used, and the golden/parity fixtures stay the web app's private truth.

### 5.5 Open decisions for you (the human), before any NINA work
1. Should the NINA panel show **NINA's numbers** (recommended, zero drift risk with
   NINA, differs slightly from the web app) or **our Python payload** (identical to the
   web app, but needs a local/remote API and Python on the observatory PC)?
2. Does the target observatory PC have the **Evergreen WebView2 runtime**? NINA assumes
   it, but confirm before the spike — it is the one hard external prerequisite.
3. How close to NINA's release cadence must the plugin track? Rebuilding per minor is
   the safe answer; a bare-minimum-supported-version line in the manifest is the cheap one.
4. Where does the plugin's source live — same repo (`nina/` folder) or a separate repo?
   Separate keeps our repo free of a .NET toolchain.

## 6. Recommended order (each step independently useful)
1. **Runtime/same-origin API base + response caching + CORS tightening** → a real
   deployable web app. (No visible change; gates stay green.)
2. **PWA shell**: manifest, service worker, static export, offline "last night".
3. **Contract tidy-up** (document the five payload keys that only `lib/types.ts`
   describes; fix the moon sample-grid off-by-one; settle DST grid semantics). Each of
   these re-baselines fixtures → **one commit each**, with approval.
4. **Desktop shell spike** (WebView + Python sidecar, port-0/shutdown changes in
   `api/server.py`).
5. **NINA bridge spike**: manifest + dockable WebView2 panel + read-only payload
   adapter fed by `INighttimeCalculator`. No astronomy port, no sequence symbols yet.
6. Sequence-symbol provider and settings, once the panel proves stable.

## 7. Blockers and risks, in one place
- **Focus-axis offset — FIXED (24 Nov, round 5)** (`HANDOFF.md` "FIXED (round 5, 24
  Nov)"): the scrub marker/readout used to sit one timezone-offset off the axis because
  the focus was carried as wall-fields-as-UTC. Every focus now lives on the payload's
  real-epoch number line (`epochAtWall`), and `web/app/scripts/units.ts` pins it in both
  Prague (+1 h = 37.5 px) and Sydney (+11 h = 412 px). Nothing blocks Shape A here.
- **Fixture fragility is a feature**: any change to `planner/night.py`'s numbers means
  deliberate re-baselining, never a quiet edit.
- **Day-switch cost**: solved in round 5 (24 Nov) — `Planner.tsx` caches every night it
  has drawn (bounded) and prefetches ±1/±2 days at idle, so leafing through nights is
  instant after the first visit to a date. A cold night is still one ~54 KB fetch.
- **No licence file in this repo yet** (only the NINA clone has one). Decide whether the
  app stays MIT and whether the plugin lives in a separate repo.

## 8. Corrections to ARCHITECTURE.md §5 found while verifying
- NINA's moon curve samples 24 h at **0.1 h (10-minute)** steps, not 6-minute
  (`NINA.Astrometry/MoonInfo.cs:110-113`).
- `LiveNightChart.tsx` is **376** lines, not 399 (docs drifted by one later edit).
- Everything else in §5 verified as written: build-time `NEXT_PUBLIC_API_BASE`
  (`lib/api.ts:7-8`), `IPluginManifest` export contract, `IDockableVM` import,
  WebView2 in `NINA.WPF.Base`, `GetReferenceDate` 12:00 clamp, `PluginOptionsAccessor`
  + `PluginGuid`, `RegisterSymbolProvider`, unchecked-out submodules, MPL-2.0.

## 9. If you only do one thing next session
Make the API base runtime-configurable and serve the app and API from one origin. That
single change turns the whole plan from "theoretical" into "deployable", costs a few
lines, changes nothing on screen, and is the gate every later shape (PWA, WebView
shell, NINA panel pointing at a local API) walks through.
