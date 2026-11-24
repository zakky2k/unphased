# HANDOFF — Unphased v0.1

Everything a new contributor (or future you) needs to pick this project up
cold. Written 2026-11-24 at the v0.1 release.

## 1. What this is

Unphased is a phone-first night planner: one screen, one chart. It answers
"is the sky usable tonight, and for how long?" by drawing the dark window of
the night with twilight bands, and the Moon as a physically accurate icon
travelling its real altitude path.

Two halves, one localhost pair:

- **planner/** — pure Python astronomy (astropy). No web code in it.
- **web/app/** — Next.js 16 (Turbopack) + React 19 + TypeScript, hand-composed
  SVG chart, no chart library. Talks to **api/server.py**, a stdlib
  `http.server` exposing exactly one endpoint: `GET /api/night`.

Ports: web **4101**, API **8642**. Both bind 127.0.0.1 only. Port 3000 is
spoken for on the development machine — do not move to it.

## 2. Lineage

Forked from the [AstroScripts](https://github.com/zakky2k/AstroScripts)
workbench at its `3336987` commit (after ten review rounds there), keeping
only the planner scope: `planner/`, `api/`, `web/`, `design/`, `docs/`.
Renamed to Unphased, reset to version **0.1.0**, fresh README/LICENSE/requirements.

AstroScripts remains the place where new features and architectures are
tried out; Unphased is the published line. Changes do not flow back
automatically — cherry-pick deliberately.

## 3. Running it

- **Installed (end user):** run `Unphased.cmd` from the Start menu or desktop.
  It launches both halves via `run.py` and opens the browser.
- **From source:** `.venv\Scripts\python.exe run.py` from the repo root
  (creates nothing; see §4 for setup). Flags: `--web`, `--api-port`,
  `--web-port`, `--no-open`.

## 4. Setting up a dev environment

```
python -m venv .venv                       # Python pinned by .python-version (3.13)
.venv\Scripts\pip install -r requirements.txt
cd web\app && npm install
```

`requirements.txt` is planner-only: astropy 8.0.2 + its deps, plus pytz/tzdata
(`planner/night.py` imports `pytz`). The AstroScripts extras (skyfield,
reportlab, …) are not needed here and were dropped deliberately.

## 5. The gates — run them all before committing

From the repo root:

```
.venv\Scripts\python.exe -m planner.tests.test_night     # astronomy vs astropy truth
```

From `web\app` (unified web gate, one tsc build shared by three scripts):

```
npx.cmd tsc --noEmit                          # the app itself
npx.cmd tsc -p tsconfig.gates.json            # emits .gates-build/ (gitignored)
node.exe scripts\fix-aliases.mjs .gates-build # rewrites @/ aliases + adds .js in the EMITTED tree only
node.exe .gates-build\scripts\parity.js       # static NightChart vs design SVGs: 136/120/132 tokens
node.exe .gates-build\scripts\golden.js       # LiveNightChart SSR vs tests/golden/*.tokens.txt: 134/124/123
node.exe .gates-build\scripts\units.js        # §4.1 laws as pure checks: 264 at v0.1
```

Notes learned the hard way, do not relearn them:

- The app's own import graph must stay **extensionless** — Turbopack 500s
  otherwise. `fix-aliases.mjs` adds `.js` only inside `.gates-build`.
- Golden counts may legitimately change when rendering changes; re-baseline
  deliberately with `node .gates-build\scripts\golden.js --update`, never to
  make a failure go away.
- Parity compares against the frozen probes in `design/`; if you change chart
  geometry, both must move together.

## 6. Packaging & release

`web/app/scripts/build-release.mjs` builds everything (run from `web/app`):

1. `npm run build` with `UNPHASED_STANDALONE=1` → Next standalone output, and
   `NEXT_PUBLIC_API_BASE=http://127.0.0.1:8642` baked into the bundle. **If you
   change ports, rebuild both halves together** — the API base is compile-time.
2. Flattens `.next/standalone/web/app` → `dist/…/web-standalone/`, copies
   `.next/static` and `public`.
3. Copies `api/`, `planner/`, `run.py`, requirements, README, LICENSE, icon.
4. Builds a throwaway venv, installs requirements, ships it as bundled
   `python/` (site-packages copied; Scripts shims stripped except
   python/pythonw/vcruntime/libcrypto/libssl/sqlite3 — `run.py` launches
   `python/python.exe` directly so the shims are not needed).
5. Sanity-checks the bundle and probes astropy inside it.
6. Compiles `installer/unphased.iss` with Inno Setup (`ISCC` env var to point
   at iscc.exe) → `Unphased-Setup-0.1.0.exe`, and zips the folder with
   `tar -a -c -f`.

Outputs land in `web/app/dist/`. Flags: `--no-zip`, `--python-home`.

The installer is **unsigned** — Windows SmartScreen will warn; README says so.

`installer/make-icon.py` regenerates `unphased.ico` from the app palette
(no image dependencies). The .ico members are bottom-up 32-bit BGRA DIBs:
grid row 0 is the TOP of the image, DIB row 0 is the BOTTOM, and channels are
written B,G,R,A. Verify any icon change by decoding the bytes that way —
image-preview tooling on the dev machine has cached stale renders before.

## 7. Layout

```
planner/            pure astronomy package (night.py + payload contract)
planner/tests/      self-contained check module (no pytest needed)
api/server.py       one endpoint; --host/--port flags, default 127.0.0.1:8642
run.py              dev + installed launcher (starts both halves, supervises)
web/app/            Next.js app; lib/chart/* holds the chart math and laws
design/             frozen reference SVGs + probes for the parity gate
installer/          unphased.iss, make-icon.py, unphased.ico
docs/               REQUIREMENTS.md (product), ARCHITECTURE.md (code map),
                    PORTABILITY.md (platform verdicts)
```

## 8. Known constraints / gotchas

- The web bundle bakes in the API base at build time (§6 step 1).
- Golden/parity token counts are exact-match gates; expect to re-baseline on
  intentional visual changes and say why in the commit message.
- `.ico` encoding rules as in §6.
- Bundled Python is a copied venv with `pyvenv.cfg home=` rewritten; if Python
  upgrades, rebuild rather than patch.

## 9. Release state at v0.1

- Gates: all green (python 20/20 checks, parity 136/120/132, golden 134/124/123,
  units 264).
- Tag `v0.1.0`; remote `github.com/zakky2k/unphased`.
- Assets: `Unphased-Setup-0.1.0.exe` (Inno Setup), `Unphased-0.1.0-win-x64.zip`,
  and the source is cloneable as usual.
