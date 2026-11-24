// Golden gate for the LIVE chart (LiveNightChart) — the view the reviewer
// actually looks at, and the one the parity gate does NOT cover (parity pins
// the frozen design-probe port, NightChart).
//
// Determinism: renderToStaticMarkup runs no effects, so the clock effect never
// fires and the focus stays undefined. Every pixel that is independent of the
// wall clock — frame, bands, grid, transition labels, moonrise/moonset chips,
// moon arc, headers — is therefore stable across runs. Focus-dependent pieces
// (glyph, now line, tooltip, readout) are pinned by scripts/units.ts instead.
//
// Run (from web/app):
//   npx.cmd tsc -p tsconfig.gates.json
//   node.exe scripts\fix-aliases.mjs .gates-build
//   node.exe .gates-build\scripts\golden.js            # compare
//   node.exe .gates-build\scripts\golden.js --update   # re-record
// Goldens live in tests/golden/<case>.tokens.txt.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import React from "react";
import { LiveNightChart } from "../components/night-chart/LiveNightChart.js";
import { tokenize } from "./tokens.js";
import type { NightPayload } from "../lib/types.js";

const here = dirname(fileURLToPath(import.meta.url));
// .gates-build/scripts -> up to web/app, then repo root (web/app is two deep).
const app = join(here, "..", "..");
const root = join(app, "..", "..");
const goldenDir = join(app, "tests", "golden");

const CASES = ["prague", "summer", "sydney"];
const update = process.argv.includes("--update");

let failed = 0;
for (const name of CASES) {
  const payload = JSON.parse(
    readFileSync(join(root, "design", "output", `night-${name}.json`), "utf8"),
  ) as NightPayload;
  const markup = renderToStaticMarkup(
    React.createElement(LiveNightChart as never, { payload, tz: payload.location.tz }),
  );
  const tokens = tokenize(markup);
  const file = join(goldenDir, `${name}.tokens.txt`);
  const body = `${tokens.length} tokens\n${tokens.join("\n")}\n`;

  if (update || !existsSync(file)) {
    mkdirSync(goldenDir, { recursive: true });
    writeFileSync(file, body, "utf8");
    console.log(`${update ? "WROTE" : "CREATED"}  ${name}: ${tokens.length} tokens`);
    continue;
  }
  const want = readFileSync(file, "utf8");
  if (want === body) {
    console.log(`PASS  ${name}: ${tokens.length} tokens identical to golden`);
  } else {
    failed++;
    const a = want.split("\n").slice(1).filter(Boolean);
    const b = tokens;
    // Show a bounded, readable diff instead of the whole token stream.
    const seen = new Map<string, number>();
    for (const t of a) seen.set(t, (seen.get(t) ?? 0) + 1);
    const lines: string[] = [];
    for (const t of b) {
      const n = seen.get(t) ?? 0;
      if (n > 0) seen.set(t, n - 1);
      else lines.push(`  extra   ${t}`);
    }
    for (const [t, n] of seen) if (n > 0) lines.push(`  missing ${n}x ${t}`);
    console.log(`FAIL  ${name}: golden differs (${lines.length} tokens)`);
    console.log(lines.slice(0, 12).join("\n"));
    if (lines.length > 12) console.log(`  ... ${lines.length - 12} more`);
  }
}
process.exit(failed ? 1 : 0);
