// What the engine declined to convert on a real corpus, by class.
//
// Every accepted miss in spec/rules/modes.md §7.11 (and §7.13's frontmatter entries) is pinned by a
// fixture, so "the refusal works as specified" is tested. What no fixture can report is how often
// each refusal fires on text people actually wrote — a fixture asserts behaviour on one input, and
// a rate is a property of a corpus. That gap is how spec 1.7.0 shipped with a number nobody had:
// a single-quoted scalar containing '' yields no spans, which is how an apostrophe is written
// inside single quotes, and on the author's own site that class alone would have cost 130 of 247
// convertible values. The behaviour was specified, fixture-covered and correct; the cost was
// discovered by accident while measuring something else.
//
// This is the deliberate version of that accident. It takes a corpus, runs every prose scalar
// through the mode that would see it and again through `text` mode, and reports every value the
// mode declined that `text` would have converted — grouped by the §7.11 class that declined it.
//
//   node scripts/miss-census.mjs <dir> [--keys title,summary,...] [--locale en-GB,...]
//
// Scope: `yaml` mode's scalars, and the same scan reading a Markdown document's frontmatter
// (§3.7.4). The other modes' accepted misses are not covered here — their skip lists are closed
// and structural, so what they decline is a construct rather than a value, and a rate over a
// corpus is not the question to ask of them.
//
// It is a measurement tool, not a CI gate: CI has no corpus, and a rate over a synthetic one would
// be a number about the fixture author rather than about the language. Run it before a spec release
// that touches span selection, and put what it prints where a reader will look for it.
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { transform } = require("polytypo");
const YAML = require("yaml");

const DEFAULT_KEYS = ["title", "summary", "description", "subtitle", "quote"];
const DEFAULT_LOCALES = ["en-GB", "en-US", "de-DE", "fr", "ru", "es", "sv", "tr"];

const args = process.argv.slice(2);
const dir = args.find((a) => !a.startsWith("--"));
const flag = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? fallback : (args[i + 1] ?? "").split(",").filter(Boolean);
};
if (!dir) {
  console.error("usage: node scripts/miss-census.mjs <dir> [--keys a,b] [--locale en-GB,de-DE]");
  process.exit(1);
}
const keys = flag("keys", DEFAULT_KEYS);
const locales = flag("locale", DEFAULT_LOCALES);

/** Every file under `dir` whose extension names a format one of the four modes reads. */
function walk(root) {
  const out = [];
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    if (entry.name.startsWith(".") || entry.name === "node_modules") continue;
    const full = path.join(root, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else if (/\.(md|mdx|ya?ml|html?)$/i.test(entry.name)) out.push(full);
  }
  return out;
}

/**
 * The class that declined a scalar, named as §7.11 names it. Read off the source text of the
 * scalar, which is what the scan reads — not guessed from the value.
 */
function declinedBecause(source) {
  if (/^"/.test(source)) return source.includes("\\") ? "double-quoted containing an escape" : null;
  if (/^'/.test(source)) return source.includes("''") ? "single-quoted containing ''" : null;
  if (/^[[{]/.test(source)) return "flow collection";
  if (/^[&*!]/.test(source)) return "anchor, alias or tag";
  if (source.includes("\n")) return "multi-line plain scalar";
  return null;
}

/** A listed key's scalar in a YAML document: its source text, and where it starts. */
function* scalarsOf(yaml) {
  const lines = yaml.split("\n");
  let offset = 0;
  for (const line of lines) {
    const m = /^ *([A-Za-z0-9_-]+): +(.+)$/.exec(line);
    if (m && keys.includes(m[1])) {
      yield { key: m[1], source: m[2], offset: offset + line.indexOf(m[2]) };
    }
    offset += line.length + 1;
  }
}

/** The YAML frontmatter block of a Markdown document, or null. */
function frontmatterOf(doc) {
  const m = /^(---\r?\n)([\s\S]*?)(^---[ \t]*\r?\n?)/m.exec(doc);
  return m && m.index === 0 ? m[2] : null;
}

const census = new Map();
const hit = new Map();
let files = 0;
let scalars = 0;
const samples = new Map();

for (const file of walk(dir)) {
  const doc = readFileSync(file, "utf8");
  const isMarkdown = /\.mdx?$/i.test(file);
  const yaml = isMarkdown ? frontmatterOf(doc) : /\.ya?ml$/i.test(file) ? doc : null;
  if (yaml === null) continue;
  files += 1;
  for (const { key, source } of scalarsOf(yaml)) {
    scalars += 1;
    // What the value is, as content: the source minus its own quoting, which is what `text` mode
    // would be handed if the scan claimed it.
    const content = /^["']/.test(source) ? source.slice(1, source.lastIndexOf(source[0])) : source;
    for (const locale of locales) {
      const wouldConvert = transform(content, { locale }) !== content;
      if (!wouldConvert) continue;
      const line = `${key}: ${source}\n`;
      const declined = transform(line, { locale, mode: "yaml", keys }) === line;
      const label =
        declinedBecause(source) ?? (declined ? "declined, class unaccounted for" : null);
      if (!declined) {
        hit.set(locale, (hit.get(locale) ?? 0) + 1);
        continue;
      }
      census.set(label, (census.get(label) ?? 0) + 1);
      if (!samples.has(label))
        samples.set(label, `${file.split("/").pop()}  ${line.trim().slice(0, 72)}`);
    }
  }
}

const converted = [...hit.values()].reduce((a, b) => a + b, 0);
const missed = [...census.values()].reduce((a, b) => a + b, 0);
console.log(
  `corpus: ${files} file(s) with a YAML block, ${scalars} scalar(s) under ${keys.length} listed key(s)`,
);
console.log(`locales: ${locales.join(" ")}`);
console.log(
  `values a locale would convert: ${converted + missed} — converted ${converted}, declined ${missed}`,
);
if (missed === 0) {
  console.log("no accepted miss fired on this corpus.");
} else {
  console.log("\ndeclined, by the class that declined it (modes.md §7.11):");
  for (const [label, n] of [...census.entries()].sort((a, b) => b[1] - a[1])) {
    const share = ((n / (converted + missed)) * 100).toFixed(1);
    console.log(`  ${String(n).padStart(5)}  ${share.padStart(5)}%  ${label}`);
    console.log(`         ${samples.get(label)}`);
  }
}
// The second half, and the one that earns the tool: a rate over found text answers "what did this
// corpus lose", and the author's quoting style is not a property of the language — it is a free
// choice, the same value written several legal ways. A bail keyed on quoting is invisible until the
// style is varied, which is why 1.7.0's single-quote cost was a surprise: this corpus is entirely
// double-quoted, so its own rate is zero.
//
// Two disciplines make the numbers mean anything. Every re-emission is **parsed back** and rejected
// unless it round-trips to the same value — a value containing ": " simply cannot be written as a
// plain scalar (YAML calls it a nested mapping in a compact mapping and refuses the document), so
// counting it as a cost would invent a loss no author can incur. And the corpus is run twice: as
// authored, and de-typeset, because content that is already typeset has nothing for most rules to
// convert and reports zero for reasons that have nothing to do with the mode.
const STYLES = {
  "double-quoted": (v) => `"${v.replace(/[\\"]/g, "\\$&")}"`,
  "single-quoted": (v) => `'${v.replaceAll("'", "''")}'`,
  plain: (v) => v,
  "block scalar": (v) => `|-\n  ${v}`,
};

/** The characters polytypo inserts, folded back, so an already-typeset corpus has something to do. */
const detypeset = (s) =>
  s
    .replace(/\u2014/g, "--")
    .replace(/\u2013/g, "-")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201c\u201d\u201e\u00ab\u00bb\u201a]/g, '"')
    .replace(/\u2026/g, "...")
    .replace(/[\u00a0\u202f]/g, " ");

for (const variant of ["as authored", "de-typeset"]) {
  const sensitivity = new Map();
  const styleSamples = new Map();
  for (const file of walk(dir)) {
    const raw = readFileSync(file, "utf8");
    const doc = variant === "de-typeset" ? detypeset(raw) : raw;
    const yaml = /\.mdx?$/i.test(file) ? frontmatterOf(doc) : /\.ya?ml$/i.test(file) ? doc : null;
    if (yaml === null) continue;
    for (const { key, source } of scalarsOf(yaml)) {
      const content = /^["']/.test(source)
        ? source.slice(1, source.lastIndexOf(source[0]))
        : source;
      if (content.includes("\n")) continue;
      for (const locale of locales) {
        if (transform(content, { locale }) === content) continue;
        for (const [style, emit] of Object.entries(STYLES)) {
          const line = `${key}: ${emit(content)}\n`;
          const bucket = sensitivity.get(style) ?? { converted: 0, declined: 0, illegal: 0 };
          sensitivity.set(style, bucket);
          // A re-emission that does not parse back to the same value is not a document anyone could
          // have written, and a cost counted there is invented.
          let parsed;
          try {
            parsed = YAML.parse(line);
          } catch {
            bucket.illegal += 1;
            continue;
          }
          if (parsed?.[key] !== content) {
            bucket.illegal += 1;
            continue;
          }
          if (transform(line, { locale, mode: "yaml", keys }) === line) {
            bucket.declined += 1;
            if (!styleSamples.has(style)) styleSamples.set(style, line.trim().slice(0, 72));
          } else bucket.converted += 1;
        }
      }
    }
  }

  console.log(`\nthe same values re-emitted in each legal quoting style — corpus ${variant}:`);
  for (const [style, { converted: ok, declined: no, illegal }] of sensitivity) {
    const total = no + ok;
    const share = total === 0 ? "—" : `${((no / total) * 100).toFixed(1)}%`;
    const note = illegal > 0 ? `  (${illegal} value(s) cannot be written this way)` : "";
    console.log(
      `  ${String(no).padStart(5)} of ${String(total).padEnd(5)} ${share.padStart(6)} declined  ${style}${note}`,
    );
    if (no > 0) console.log(`         ${styleSamples.get(style)}`);
  }
}

if (census.has("declined, class unaccounted for")) {
  console.log("\nA class §7.11 does not list declined a value. That is either a missing entry in");
  console.log(
    "that list or a bail nobody wrote down — either way it is a spec question, not a tuning one.",
  );
  process.exitCode = 2;
}
