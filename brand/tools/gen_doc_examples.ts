/**
 * Generates promo/doc-examples.json: the measured output of every ```example block in
 * brand/tools/docs/**\/*.md, produced by the real engine. build_promo.py looks each block up by
 * the same key (sha256 of the block's raw text, first 16 hex digits) and refuses to build a
 * block that has no entry, so a documentation example cannot be typed by hand.
 *
 *   npx tsx brand/tools/gen_doc_examples.ts
 *
 * Block format: `key: value` header lines, a line holding only `---`, then the input verbatim.
 * Keys: locale (required), mode, dialect, keys, frontmatterKeys, rules (comma list; `name` turns a
 * rule on, `-name` off), narrowNbsp. With `expect: error` the block records the thrown code.
 */
import { createHash } from "node:crypto";
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { transform, type Options } from "polytypo";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const DOCS = process.env.DOCS_DIR ?? path.join(ROOT, "brand/tools/docs");
const OUT = process.env.DOCS_OUT ?? path.join(ROOT, "promo/doc-examples.json");

function mdFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory()
      ? mdFiles(path.join(dir, e.name))
      : e.name.endsWith(".md")
        ? [path.join(dir, e.name)]
        : [],
  );
}

function blocks(text: string): string[] {
  const out: string[] = [];
  const lines = text.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const open = /^(`{3,})example$/.exec(lines[i]!);
    if (!open) continue;
    const ticks = open[1]!;
    const body: string[] = [];
    for (i++; i < lines.length && lines[i]!.trim() !== ticks; i++) body.push(lines[i]!);
    out.push(body.join("\n"));
  }
  return out;
}

export function parseBlock(raw: string): { header: Record<string, string>; input: string } {
  const lines = raw.split("\n");
  const sep = lines.indexOf("---");
  if (sep < 0) throw new Error(`example block has no '---' separator:\n${raw}`);
  const header: Record<string, string> = {};
  for (const line of lines.slice(0, sep)) {
    const m = /^(\w+):\s*(.*)$/.exec(line);
    if (!m) throw new Error(`bad example header line ${JSON.stringify(line)}`);
    header[m[1]!] = m[2]!;
  }
  return { header, input: lines.slice(sep + 1).join("\n") };
}

const list = (s: string) =>
  s
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);

export function toOptions(header: Record<string, string>): Options {
  const known = new Set([
    "locale",
    "mode",
    "dialect",
    "keys",
    "frontmatterKeys",
    "rules",
    "narrowNbsp",
    "expect",
  ]);
  for (const k of Object.keys(header)) if (!known.has(k)) throw new Error(`unknown key ${k}`);
  const o: Record<string, unknown> = { locale: header.locale };
  if (header.mode) o.mode = header.mode;
  if (header.dialect) o.dialect = header.dialect;
  if ("keys" in header) o.keys = list(header.keys!);
  if ("frontmatterKeys" in header) o.frontmatterKeys = list(header.frontmatterKeys!);
  if (header.narrowNbsp) o.narrowNbsp = header.narrowNbsp;
  if (header.rules) {
    o.rules = Object.fromEntries(
      list(header.rules).map((r) => (r.startsWith("-") ? [r.slice(1), false] : [r, true])),
    );
  }
  return o as unknown as Options;
}

const result: Record<string, { out?: string; error?: string }> = {};
for (const file of mdFiles(DOCS).sort()) {
  for (const raw of blocks(readFileSync(file, "utf8"))) {
    const key = createHash("sha256").update(raw, "utf8").digest("hex").slice(0, 16);
    const { header, input } = parseBlock(raw);
    try {
      const out = transform(input, toOptions(header));
      if (header.expect === "error") {
        throw new Error(`${path.relative(ROOT, file)}: expected an error, got output:\n${raw}`);
      }
      result[key] = { out };
    } catch (e) {
      const code = (e as { code?: string }).code;
      if (header.expect === "error" && code) result[key] = { error: code };
      else throw e;
    }
  }
}

writeFileSync(OUT, JSON.stringify(result, null, 2) + "\n");
console.log(`${path.relative(ROOT, OUT)}: ${Object.keys(result).length} examples`);
