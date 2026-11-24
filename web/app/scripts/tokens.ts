// Shared SVG-markup tokenizer for the chart gates (parity + golden).
//
// Both gates need to compare two markups structurally rather than as text:
// React and render.py serialise attributes in different orders and with
// different numeric precision, and React inserts semantically empty <g>
// wrappers. Normalise first, then compare as a multiset of tokens.

/** Normalise a numeric attribute value so React and render.py serialisation
 *  agree. Geometry attrs are "%.2f" in render.py; opacities/widths are bare
 *  floats; JSON-sourced values (3+ decimals) must match exactly. */
export function normAttr(name: string, v: string): string {
  const num = /^-?\d+(\.\d+)?$/.test(v);
  if (!num) return v;
  const n = parseFloat(v);
  if (/^-?\d+\.\d{3}$/.test(v)) return v; // JSON-sourced values: exact match
  if (["x", "y", "x1", "x2", "y1", "y2", "width", "height"].includes(name)) {
    // "%.2f" of the reference string: strip to 2 dp with Python's half-even
    // rule. The token is render.py's own decimal, so only trailing digits
    // need dropping (a ".xx5" there rounded even when written).
    const m = /^(-?)(\d+)(?:\.(\d+))?$/.exec(v)!;
    let frac = m[3] ?? "";
    if (frac.length > 2) {
      const rest = frac.slice(2);
      if (/^50*$/.test(rest) && +frac[1] % 2 === 1) frac = String(+frac.slice(0, 2) + 1).padStart(2, "0");
      else frac = frac.slice(0, 2);
    }
    return `${m[1]}${m[2]}.${frac.padEnd(2, "0")}`;
  }
  return String(n);
}

/** Flatten markup to sorted, comparable tokens (elements + text runs). */
export function tokenize(markup: string): string[] {
  const out: string[] = [];
  // Values may contain spaces ("1 6", "M 0,-9 ..."), so match to the closing quote.
  const tagRe = /<(\w+)((?:[^>"']|"[^"]*")*?)(\/?)>/g;
  let m: RegExpExecArray | null;
  while ((m = tagRe.exec(markup))) {
    const [, tag, attrsRaw] = m;
    if (tag === "g") continue; // React's grouping wrappers carry no semantics
    const attrs: string[] = [];
    const attrRe = /(\w[\w-]*)="([^"]*)"/g;
    let a: RegExpExecArray | null;
    while ((a = attrRe.exec(attrsRaw))) {
      attrs.push(`${a[1]}=${normAttr(a[1], a[2])}`);
    }
    attrs.sort();
    out.push(`<${tag} ${attrs.join(" ")}/>`);
  }
  // text content matters too (labels); Python writes degrees as &#176;
  const textRe = />([^<>]+)</g;
  while ((m = textRe.exec(markup))) {
    const t = m[1].replace(/&#176;/g, "°").trim();
    if (t) out.push(`text:${t}`);
  }
  return out.sort();
}

/** Multiset diff of two token lists: [] means identical content. */
export function tokenDiff(a: string[], b: string[]): string[] {
  const count = (arr: string[]) => {
    const map = new Map<string, number>();
    for (const t of arr) map.set(t, (map.get(t) ?? 0) + 1);
    return map;
  };
  const ca = count(a), cb = count(b);
  const diffs: string[] = [];
  for (const k of new Set([...ca.keys(), ...cb.keys()])) {
    const d = (cb.get(k) ?? 0) - (ca.get(k) ?? 0);
    if (d > 0) diffs.push(`missing ${d}x ${k}`);
    if (d < 0) diffs.push(`extra   ${-d}x ${k}`);
  }
  return diffs;
}
