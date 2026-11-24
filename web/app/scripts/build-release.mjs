// Build a self-contained Unphased release folder, then zip it.
//
//   node scripts/build-release.mjs            -> dist/Unphased-0.1.0-win-x64/  + .zip
//   node scripts/build-release.mjs --no-zip   -> folder only
//
// What lands in the release folder:
//   web-standalone/   Next.js standalone server (its own pruned node_modules,
//                     no dev dependencies, no source maps) plus public assets
//   api/ planner/     the Python computation package and its HTTP layer
//   python/           a full CPython with astropy installed, copied from
//                     --python-home, so the user installs nothing
//   Unphased.cmd      double-click: starts both processes and opens the page
//   run.py            the same thing, for people who prefer a terminal
//   README.md / LICENSE
//
// The web bundle is built with NEXT_PUBLIC_API_BASE pointing at the API port
// the launcher uses, so the two halves agree without any configuration.

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

// The script lives in web/app/scripts; the app is its parent and the repo root
// is one above that (web/..).
const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ROOT = path.join(APP, "..", "..");

const VERSION = JSON.parse(fs.readFileSync(path.join(APP, "package.json"), "utf8")).version;
const NAME = "Unphased";
const ARCH = process.arch === "arm64" ? "arm64" : "x64";
const FOLDER = `${NAME}-${VERSION}-win-${ARCH}`;
const DIST = path.join(ROOT, "dist");
const OUT = path.join(DIST, FOLDER);

const API_PORT = 8642;
const WEB_PORT = 4101;

const arg = (flag, fallback) => {
  const i = process.argv.indexOf(flag);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
};
const has = (flag) => process.argv.includes(flag);

// Where to take the bundled Python from: --python-home if given, otherwise
// UNPHASED_BASE_PYTHON, otherwise whatever `python` resolves to. The venv built
// on top of it carries the pinned requirements, so the base needs nothing extra.
// Where the bundled interpreter lives inside a runtime folder (a venv puts its
// exe in Scripts/ on Windows, not at the root).
const pyRel = () => process.platform === "win32" ? path.join("Scripts", "python.exe") : path.join("bin", "python");

function resolveBasePython() {
  const explicit = arg("--python-home", process.env.UNPHASED_BASE_PYTHON || null);
  if (explicit) {
    const p = path.resolve(explicit);
    return fs.existsSync(path.join(p, pyRel())) ? path.join(p, pyRel()) : p;
  }
  const finder = process.platform === "win32" ? ["where", "python"] : ["which", "python3"];
  const found = execFileSync(finder[0], finder.slice(1), { encoding: "utf8" }).split(/\r?\n/)[0].trim();
  if (!found) throw new Error("no python on PATH; pass --python-home <folder with python.exe>");
  return found;
}

// On Windows, Node (26+) refuses to spawn .cmd shims directly; run npm through
// cmd.exe explicitly instead.
const NPM = process.platform === "win32" ? { cmd: "cmd.exe", args0: ["/d", "/s", "/c"] } : { cmd: "npm", args0: [] };
function npm(args, opts) {
  execFileSync(NPM.cmd, [...NPM.args0, "npm", ...args], { stdio: "inherit", cwd: APP, ...opts });
}

function run(cmd, args, opts = {}) {
  console.log(`\n> ${cmd} ${args.join(" ")}`);
  execFileSync(cmd, args, { stdio: "inherit", cwd: APP, ...opts });
}

function copy(src, dst, filter = () => true) {
  if (!fs.existsSync(src)) throw new Error(`missing ${src}`);
  fs.cpSync(src, dst, { recursive: true, dereference: true, filter });
}

const skipJunk = (p) => !/[\\/](?:__pycache__|idle_test)[\\/]/.test(p + path.sep);

// site-packages tests are dead weight in a shipped runtime — EXCEPT astropy's:
// astropy/__init__.py imports astropy.tests, so pruning it breaks the import.
const skipPkgTests = (p) => {
  const m = /[\\/]site-packages[\\/]([^\\/]+)[\\/]/.exec(p + path.sep);
  return !(m && m[1] !== "astropy" && /[\\/](?:tests?|test)[\\/]/.test(p.slice(m.index + m[0].length) + path.sep));
};

function step(n, msg) {
  console.log(`\n=== [${n}/6] ${msg}`);
}

// ---------------------------------------------------------------- 1. web build
step(1, "build the Next.js app in standalone mode");
fs.mkdirSync(APP, { recursive: true });
if (!fs.existsSync(path.join(APP, "node_modules"))) {
  npm(["install"]);
}
npm(["run", "build"], {
  env: {
    ...process.env,
    UNPHASED_STANDALONE: "1",
    NEXT_PUBLIC_API_BASE: `http://127.0.0.1:${API_PORT}`,
  },
});

const standalone = path.join(APP, ".next", "standalone");
const staticDir = path.join(APP, ".next", "static");
const publicDir = path.join(APP, "public");
for (const p of [standalone, staticDir]) {
  if (!fs.existsSync(p)) throw new Error(`expected build output at ${p}`);
}

// ------------------------------------------------------------------- 2. layout
step(2, `assemble ${FOLDER}`);
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });

// Next's standalone folder mirrors the project root (web/app/server.js), so the
// nested path is flattened to keep the release folder shallow.
const flat = path.join(standalone, "web", "app");
copy(fs.existsSync(flat) ? flat : standalone, path.join(OUT, "web-standalone"));
copy(staticDir, path.join(OUT, "web-standalone", ".next", "static"));
if (fs.existsSync(publicDir)) copy(publicDir, path.join(OUT, "web-standalone", "public"));

for (const pkg of ["api", "planner"]) {
  copy(path.join(ROOT, pkg), path.join(OUT, pkg), (p) => !/[\\/](?:__pycache__)[\\/]/.test(p + path.sep));
}
copy(path.join(ROOT, "run.py"), path.join(OUT, "run.py"));
copy(path.join(ROOT, "requirements.txt"), path.join(OUT, "requirements.txt"));
copy(path.join(ROOT, "README.md"), path.join(OUT, "README.md"));
if (fs.existsSync(path.join(ROOT, "LICENSE"))) copy(path.join(ROOT, "LICENSE"), path.join(OUT, "LICENSE"));
// The installer refers to {app}\installer\unphased.ico, so the icon has to ship.
if (fs.existsSync(path.join(ROOT, "installer", "unphased.ico"))) {
  copy(path.join(ROOT, "installer", "unphased.ico"), path.join(OUT, "installer", "unphased.ico"));
}

// ------------------------------------------------------------------ 3. python
step(3, "bundle Python with the astronomy dependencies");
const py = process.platform === "win32" ? "python.exe" : "bin/python";
// Inside a venv the interpreter is Scripts/python.exe (Windows) or bin/python;
// that is where run.py and Unphased.cmd must look after copying.
const bundledPyRel = pyRel();
const pyExe = (home) => path.join(home, py);

if (has("--python-home")) {
  // Trust an explicitly supplied runtime (e.g. one already built for packaging).
  const home = path.resolve(arg("--python-home", ""));
  console.log(`  bundling ${home}`);
  copy(home, path.join(OUT, "python"), skipJunk);
} else {
  // Build a clean venv off the base interpreter, install the pinned requirements
  // into it, then copy it. Copying a venv is safe as long as we rewrite
  // pyvenv.cfg and strip the Scripts shims: run.py launches python/python.exe
  // directly, not through a shim with a baked-in path.
  const base = resolveBasePython();
  console.log(`  creating a throwaway venv from ${base}`);
  const tmp = path.join(DIST, ".build-venv");
  fs.rmSync(tmp, { recursive: true, force: true });
  execFileSync(base, ["-m", "venv", tmp], { stdio: "inherit" });
  const tmpPy = process.platform === "win32" ? path.join(tmp, "Scripts", "python.exe") : path.join(tmp, "bin", "python");
  execFileSync(tmpPy, ["-m", "pip", "install", "--quiet", "-r", path.join(ROOT, "requirements.txt")], { stdio: "inherit" });

  const pyOut = path.join(OUT, "python");
  copy(tmp, pyOut, (p) => skipJunk(p) && skipPkgTests(p));
  // Point the copied runtime at its new home.
  const cfg = path.join(pyOut, "pyvenv.cfg");
  if (fs.existsSync(cfg)) {
    fs.writeFileSync(cfg, fs.readFileSync(cfg, "utf8").split(/\r?\n/)
      .filter((l) => !/^home\s*=/i.test(l)).join("\n") + `\nhome = ${path.dirname(base)}\n`, "utf8");
  }
  // The venv's Scripts shims hard-code the throwaway path; python.exe itself is
  // real, so drop the shims and keep the interpreter (and its DLLs).
  const scripts = path.join(pyOut, process.platform === "win32" ? "Scripts" : "bin");
  for (const f of fs.readdirSync(scripts)) {
    if (!/^(python|pythonw|vcruntime)/i.test(f) && !/^lib(crypto|ssl)|^sqlite3/i.test(f)) {
      fs.rmSync(path.join(scripts, f), { recursive: true, force: true });
    }
  }
  fs.rmSync(tmp, { recursive: true, force: true });
}

// ------------------------------------------------------------------ 4. launch
step(4, "write the launchers");
fs.writeFileSync(
  path.join(OUT, "Unphased.cmd"),
  [
    "@echo off",
    "rem Unphased " + VERSION + " — starts the planner API and the web app, then opens the page.",
    'cd /d "%~dp0"',
    `python ${bundledPyRel} run.py %*`,
    "if errorlevel 1 pause",
    "",
  ].join("\r\n"),
  "utf8",
);

// -------------------------------------------------------------------- 5. check
step(5, "sanity-check the folder");
for (const need of [
  "web-standalone/server.js",
  "run.py",
  path.join("api", "server.py"),
  path.join("planner", "night.py"),
  path.join("python", bundledPyRel),
]) {
  if (!fs.existsSync(path.join(OUT, need))) throw new Error(`release folder is missing ${need}`);
}
const probe = execFileSync(
  path.join(OUT, "python", bundledPyRel),
  ["-c", "import astropy, sys; print(astropy.__version__, sys.version.split()[0])"],
  { encoding: "utf8" },
).trim();
console.log(`  bundled python: astropy ${probe}`);

// -------------------------------------------------------------------- 6. zip
if (!has("--no-zip")) {
  step(6, "zip it");
  // A single-file .exe installer is what most release users want; the folder and
  // its zip are for people who would rather not run a setup program.
  const iss = path.join(ROOT, "installer", "unphased.iss");
  const iscc = process.env.ISCC || "iscc";
  if (fs.existsSync(iss)) {
    try {
      execFileSync(iscc, ["/DAppVersion=" + VERSION, "/DBundleDir=" + OUT, iss], { stdio: "inherit" });
      const setup = path.join(DIST, `Unphased-Setup-${VERSION}.exe`);
      if (fs.existsSync(setup)) {
        console.log(`\n  ${setup}  (${(fs.statSync(setup).size / 1048576).toFixed(1)} MB)`);
      }
    } catch (err) {
      console.warn(`\n  Inno Setup (${iscc}) not available — skipped the installer. ` +
        `Install Inno Setup 6 or set ISCC=<path to iscc.exe>.`);
    }
  }

  const zip = path.join(DIST, `${FOLDER}.zip`);
  fs.rmSync(zip, { force: true });
  // tar is in every Windows 10+ and gives a far better ratio than Compress-Archive.
  execFileSync("tar", ["-a", "-c", "-f", zip, "-C", DIST, FOLDER], { stdio: "inherit" });
  const mb = (fs.statSync(zip).size / 1048576).toFixed(1);
  console.log(`\n  ${zip}  (${mb} MB)`);
} else {
  step(6, "skipped zip (--no-zip)");
}

console.log(`\nRelease ready: ${OUT}`);
console.log(`Run it with:   ${path.join(OUT, "Unphased.cmd")}`);
