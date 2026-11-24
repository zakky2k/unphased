# Unphased

**Is the sky usable tonight, and for how long?**

Unphased draws one night as a single chart: the Sun's altitude band across the
whole night (daylight through full dark), the Moon's arc and phase, moonrise and
moonset, and a red marker you can park on any minute of the night and hold there
while you leaf through the nights around it. Everything is computed on your own
machine — no account, no network lookup, nothing leaves the computer.

Version **0.1** — the first published release.

![the chart](design/output/preview-prague.png)

---

## Install (Windows)

Most people want the setup file. Grab it from the
[latest release](../../releases/latest):

| File | What it is |
| --- | --- |
| `Unphased-Setup-0.1.0.exe` | Installer. Installs, adds a Start Menu entry and an optional desktop shortcut, and runs with no further setup. |
| `Unphased-0.1.0-win-x64.zip` | Same thing, unzipped — for people who would rather not install anything. Unpack anywhere and double-click `Unphased.cmd`. |

Both are self-contained: they carry their own Python (with the astronomy
libraries) and their own copy of the web app. Nothing needs to be installed
first, and nothing is downloaded after that. Node.js is bundled too, so a fresh
PC is enough.

**After installing:** start Unphased from the Start Menu. A console window opens,
the browser opens at `http://127.0.0.1:4101/`, and closing the console stops
everything. The two ports it uses — **4101** for the page, **8642** for the
computation service — are both bound to `127.0.0.1` only, so they are not
reachable from other machines on your network.

Windows SmartScreen may warn about an unsigned download the first time: choose
*More info → Run anyway*. The installer is not code-signed; signing costs money
and this project has no publisher certificate.

## Using it

- **Lat / Lon** — where you are. Defaults to Prague.
- **Zone** — a dropdown of real time zones, each showing the offset it uses *on
  the night you are looking at*, so summer/winter switching takes care of itself.
  Committing a latitude and longitude picks the nearest zone for you; choosing
  one by hand afterwards sticks. The list is built into the app — no geocoding
  service, no network.
- **◀ / ▶** — step nights. The red marker *and the Moon on it* stay exactly where
  they are on screen, so you can hold one time and watch the Moon drift through
  the fortnight. **⏱ live** hands control back to the ticking clock.
- **The slider** — scrub within the night. It never changes which night is shown.
- **DARK** — retints everything into the warm-red family (sky, boxes, the Moon's
  own colour and the text), not just the background.
- Stepping to a night near the one you are on is instant: after a night paints,
  Unphased quietly computes the ten nights either side of it in the background,
  nearest first, and restarts that walk wherever you step.

## Building from source

For people who want to read or change the code. You need **Node.js 20+** and
**Python 3.13** (pinned in `.python-version`: `zstandard` and `lz4` have no
prebuilt wheels for newer releases and would otherwise need a C++ compiler).

```powershell
# 1. the computation service, on 127.0.0.1:8642
python -m venv .venv
.venv\Scripts\python.exe -m pip install -r requirements.txt
.venv\Scripts\python.exe -m api.server

# 2. the web app, on localhost:4101
cd web\app
npm install
npm run dev
```

Open http://localhost:4101. If the service is somewhere else, build the front
end with `NEXT_PUBLIC_API_BASE` set to its URL.

### Making your own installer

```powershell
node web\app\scripts\build-release.mjs
```

Produces `dist/Unphased-<version>-win-x64/` (a standalone web server, the Python
packages, and a throwaway virtual environment with the pinned requirements
copied in) plus its zip. Add `--python-home <dir>` to bundle a specific
interpreter instead of whatever `python` resolves to. Then, with [Inno Setup 6](https://jrsoftware.org/isinfo.php) installed:

```powershell
iscc installer\unphased.iss
```

which writes `dist/Unphased-Setup-<version>.exe`.

### Tests

Every one of these exits 0 on a good tree. They are the same gates this project
was developed against for twenty-seven review rounds.

```powershell
# astronomy + payload contract
.venv\Scripts\python.exe -m planner.tests.test_night

# web: types, then three checks over one build
cd web\app
npx tsc --noEmit
npx tsc -p tsconfig.gates.json
node scripts\fix-aliases.mjs .gates-build
node .gates-build\scripts\parity.js   # the chart against the reviewed design SVGs
node .gates-build\scripts\golden.js   # server-rendered chart vs tests/golden/*.tokens.txt
node .gates-build\scripts\units.js    # the §4.1 chart laws, as pure-function checks
```

## Layout

| Path | What lives there |
| --- | --- |
| `planner/` | the astronomy: one night in, one payload out (astropy). Pure, no HTTP. |
| `api/server.py` | one endpoint, `GET /api/night`, standard library only. |
| `web/app/` | Next.js 16 + TypeScript. The chart is hand-composed SVG — no chart library. |
| `web/app/lib/chart/` | the chart laws: geometry, clocks, labels, bands, scrubbing, zones. |
| `docs/REQUIREMENTS.md` | what it must do; §6 is the JSON contract between the two halves. |
| `docs/ARCHITECTURE.md`, `docs/PORTABILITY.md` | how it is put together, and what moving it costs. |
| `design/` | the SVG reference the chart is checked against, and its probes. |
| `run.py` | starts both processes, waits for them, opens the page. |
| `installer/` | Inno Setup script for the Windows installer. |

## Privacy

Unphased computes everything locally with astropy and the browser's own IANA
time-zone data. It makes no request to any third party, asks for no account, and
stores only your lat/lon/zone in that browser's local storage. The two servers it
runs are bound to `127.0.0.1`.

## Licence

MIT — see [LICENSE](LICENSE).

## Relationship to AstroScripts

Unphased 0.1 is a clean-room copy of the night planner from
[AstroScripts](https://github.com/zakky2k/AstroScripts), starting at its `3336987`
commit, reset to version 0.1.0 with fresh documentation. AstroScripts remains the
workbench where new features and architectures get tried out; anything proven
there lands here as a release. The PixInsight and exposure utilities in that
repository are not part of Unphased.
