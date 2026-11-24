// Parity gate: SSR the design-probe port (NightChart) against the design
// probe's committed JSON payloads and diff it against the reviewed reference
// SVGs. If the port is faithful, every element and attribute matches
// render.py's output (modulo React's attribute serialisation).
//
// Run (from web/app): see the gate recipe in HANDOFF.md —
//   npx.cmd tsc -p tsconfig.gates.json
//   node.exe scripts\fix-aliases.mjs .gates-build
//   node.exe .gates-build\scripts\parity.js

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join, dirname } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import React from "react";
// Extension kept explicit: the tsc build emits .js and node ESM needs it.
import { NightChart } from "../components/night-chart/NightChart.js";
import { tokenize, tokenDiff } from "./tokens.js";

const here = dirname(fileURLToPath(import.meta.url));
// .gates-build/scripts -> up to web/app, then repo root (web/app is two deep).
const root = join(here, "..", "..", "..", "..");

const CASES: [string, string][] = [
  ["prague", "chart-prague.svg"],
  ["summer", "chart-summer.svg"],
  ["sydney", "chart-sydney.svg"],
];

let failed = 0;
for (const [name, ref] of CASES) {
  const payload = JSON.parse(
    readFileSync(join(root, "design", "output", `night-${name}.json`), "utf8"),
  );
  // The reference SVGs carry no role/aria-label (accessibility was added in
  // the app port); strip them from my markup before diffing geometry.
  const mine = renderToStaticMarkup(React.createElement(NightChart as never, { payload }))
    .replace(/ role="img" aria-label="[^"]*"/, "");
  const theirs = readFileSync(join(root, "design", "output", ref), "utf8");
  const a = tokenize(mine);
  const b = tokenize(theirs);
  const diffs = tokenDiff(a, b);
  if (diffs.length === 0) {
    console.log(`PASS  ${name}: ${a.length} tokens identical`);
  } else {
    failed++;
    // Pair missing/extra by tag so each near-miss reads as one line.
    const miss = diffs.filter((d) => d.startsWith("missing")).map((d) => d.slice(10));
    const extr = diffs.filter((d) => d.startsWith("extra")).map((d) => d.slice(10));
    console.log(`FAIL  ${name}: ${miss.length} mismatched tokens`);
    const byTag = (arr: string[]) => {
      const m = new Map<string, string[]>();
      for (const t of arr) {
        const tag = /^<(\w+)/.exec(t)?.[1] ?? "text";
        const list = m.get(tag) ?? [];
        list.push(t);
        m.set(tag, list);
      }
      return m;
    };
    const bm = byTag(miss), be = byTag(extr);
    for (const tag of new Set([...bm.keys(), ...be.keys()])) {
      const L = bm.get(tag) ?? [], R = be.get(tag) ?? [];
      for (let i = 0; i < Math.max(L.length, R.length); i++) {
        console.log(`  ref : ${L[i] ?? ""}`);
        console.log(`  mine: ${R[i] ?? ""}`);
        if (i >= 5) { console.log("  ..."); break; }
      }
    }
  }
}
process.exit(failed ? 1 : 0);
