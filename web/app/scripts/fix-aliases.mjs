// tsc leaves "@/..." path-alias imports as-is (Next resolves them itself, but
// the plain-Node parity runner cannot). Rewrite them to relative specifiers in
// the emitted .parity-build tree: components/night-chart/X.js -> ../../lib/Y.
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join, relative, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

// The emitted tree defaults to .parity-build; pass the outDir as argv[2] when
// another gate config emitted elsewhere (e.g. .golden-build).
const build = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  process.argv[2] ?? ".parity-build",
);

function walk(dir) {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) walk(p);
    else if (p.endsWith(".js")) rewrite(p);
  }
}
function rewrite(file) {
  let src = readFileSync(file, "utf8");
  const from = dirname(file);
  src = src.replace(/(from\s+")(@\/[^"]+)(")/g, (_m, a, spec, c) => {
    // "@/lib/palette" -> file under .parity-build/lib/palette.js
    let rel = relative(from, resolve(build, spec.slice(2) + ".js")).replace(/\\/g, "/");
    if (!rel.startsWith(".")) rel = "./" + rel;
    return a + rel + c;
  });
  // Source uses extensionless relative imports, because Turbopack cannot map
  // "./clock.js" back to clock.ts. Plain Node ESM is the opposite: it needs the
  // extension. Add it here, in the emitted tree only.
  src = src.replace(/(from\s+")((?:\.|\.\.\/)[^"]*?)(")/g, (m, a, spec, c) => {
    if (spec.endsWith(".js")) return m;
    if (!existsSync(resolve(from, spec + ".js"))) return m;
    return a + spec + ".js" + c;
  });
  writeFileSync(file, src);
}
walk(build);
// Plain node ESM needs the build tree marked as a module, and react-dom/server
// resolution needs a package.json boundary here. Used to be a manual step in
// the gate recipe; doing it here keeps the recipe three commands, not four.
if (!existsSync(join(build, "package.json"))) {
  writeFileSync(join(build, "package.json"), '{ "type": "module" }\n');
}
console.log(`alias rewrite done (${build})`);
