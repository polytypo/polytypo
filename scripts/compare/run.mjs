// Reproduces the README comparison: how polytypo and other typography tools treat the parts of a
// document that must not change. Competitors are installed into a temporary directory at pinned
// versions; nothing is installed into this repository.
//
//   node scripts/compare/run.mjs [--details] [--keep]
//
// Needs network access, npm, python3 (with venv) and ruby/gem. A missing runtime is reported as
// not measured. Not part of CI.
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const args = new Set(process.argv.slice(2));
const cases = JSON.parse(fs.readFileSync(path.join(here, "cases.json"), "utf8"));
const byId = Object.fromEntries(cases.map((c) => [c.id, c]));

const NPM = {
  polytypo: "1.32.0",
  typograf: "7.9.1",
  smartquotes: "2.3.2",
  smartypants: "0.2.2",
  retext: "9.0.0",
  "retext-smartypants": "6.2.0",
  unified: "11.0.5",
  "remark-parse": "11.0.0",
  "remark-gfm": "4.0.1",
  "remark-smartypants": "3.0.3",
  "remark-stringify": "11.0.0",
  "markdown-it": "15.0.3",
};
const PIP = { polytypo: "1.32.0", smartypants: "2.0.2", typogrify: "2.1.0" };
const GEMS = { polytypo: "1.32.0", rubypants: "0.7.1" };

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "polytypo-compare-"));
const notMeasured = [];

function sh(cmd, argv, opts = {}) {
  const r = spawnSync(cmd, argv, { encoding: "utf8", maxBuffer: 64 << 20, ...opts });
  if (r.status !== 0)
    throw new Error(
      `${cmd} ${argv.slice(0, 3).join(" ")} failed: ${(r.stderr || r.error || "").toString().slice(0, 400)}`,
    );
  return r.stdout;
}
const have = (cmd) => spawnSync(cmd, ["--version"], { encoding: "utf8" }).status === 0;

function runtime(label, fn) {
  try {
    return fn();
  } catch (e) {
    notMeasured.push(`${label}: ${e.message}`);
    return null;
  }
}

fs.copyFileSync(path.join(here, "cases.json"), path.join(tmp, "cases.json"));

// --- JavaScript
const jsDir = path.join(tmp, "js");
fs.mkdirSync(jsDir);
const js = runtime("JavaScript", () => {
  fs.writeFileSync(
    path.join(jsDir, "package.json"),
    JSON.stringify({ name: "compare", private: true, type: "module" }),
  );
  const specs = Object.entries(NPM).map(([n, v]) => `${n}@${v}`);
  sh(
    "npm",
    [
      "install",
      "--save-exact",
      "--ignore-scripts",
      "--no-audit",
      "--no-fund",
      "--loglevel=error",
      ...specs,
    ],
    { cwd: jsDir },
  );
  for (const f of ["js.mjs", "render.mjs"])
    fs.copyFileSync(path.join(here, "adapters", f), path.join(jsDir, f));
  sh("node", ["js.mjs", path.join(tmp, "cases.json"), path.join(tmp, "js.json")], { cwd: jsDir });
  return JSON.parse(fs.readFileSync(path.join(tmp, "js.json"), "utf8"));
});

// --- Python
const py = runtime("Python", () => {
  if (!have("python3")) throw new Error("python3 not found");
  const venv = path.join(tmp, "venv");
  sh("python3", ["-m", "venv", venv]);
  const specs = Object.entries(PIP).map(([n, v]) => `${n}==${v}`);
  sh(path.join(venv, "bin", "python"), [
    "-I",
    "-m",
    "pip",
    "install",
    "--quiet",
    "--disable-pip-version-check",
    ...specs,
  ]);
  fs.copyFileSync(path.join(here, "adapters", "py.py"), path.join(tmp, "py.py"));
  sh(
    path.join(venv, "bin", "python"),
    ["-I", path.join(tmp, "py.py"), path.join(tmp, "cases.json"), path.join(tmp, "py.json")],
    { cwd: tmp },
  );
  return JSON.parse(fs.readFileSync(path.join(tmp, "py.json"), "utf8"));
});

// --- Ruby
const rb = runtime("Ruby", () => {
  if (!have("ruby") || !have("gem")) throw new Error("ruby or gem not found");
  const gemDir = path.join(tmp, "gems");
  const env = { ...process.env, GEM_HOME: gemDir, GEM_PATH: gemDir };
  sh(
    "gem",
    [
      "install",
      "--no-document",
      "--install-dir",
      gemDir,
      ...Object.entries(GEMS).map(([n, v]) => `${n}:${v}`),
    ],
    { env, cwd: tmp },
  );
  fs.copyFileSync(path.join(here, "adapters", "rb.rb"), path.join(tmp, "rb.rb"));
  sh("ruby", [path.join(tmp, "rb.rb"), path.join(tmp, "cases.json"), path.join(tmp, "rb.json")], {
    env,
    cwd: tmp,
  });
  return JSON.parse(fs.readFileSync(path.join(tmp, "rb.json"), "utf8"));
});

// Rows: one per tool per runtime.
const label = {
  polytypo: "polytypo",
  "smartypants.py": "smartypants (Python)",
  smartypants: "smartypants (JS)",
};
const rows = [];
for (const [data, runtimeName, versions] of [
  [js, "JS", NPM],
  [py, "Python", PIP],
  [rb, "Ruby", GEMS],
]) {
  if (!data) continue;
  for (const [tool, r] of Object.entries(data.results)) {
    const version = versions[tool === "smartypants.py" ? "smartypants" : tool] ?? "";
    const name = tool === "polytypo" ? `polytypo (${runtimeName})` : (label[tool] ?? tool);
    rows.push({ name: `${name} ${version}`.trim(), tool, r, runtimeName });
  }
}

// Markdown outputs are re-rendered once, so link and image survival is read from a parse, not a regex.
const toRender = {};
for (const [i, row] of rows.entries()) {
  const o = row.r.cases["md-title"];
  if (o && o.once != null && !row.r.html) toRender[i] = o.once;
}
const rendered = js
  ? (() => {
      fs.writeFileSync(path.join(tmp, "render-in.json"), JSON.stringify(toRender));
      sh(
        "node",
        ["render.mjs", path.join(tmp, "render-in.json"), path.join(tmp, "render-out.json")],
        { cwd: jsDir },
      );
      return JSON.parse(fs.readFileSync(path.join(tmp, "render-out.json"), "utf8"));
    })()
  : {};

const esc = (s) =>
  s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
const typeset = (c, out) => !(out.includes(c.typeset) || out.includes(esc(c.typeset)));

// verdict: "bad" | "ok" | "inert" (kept everything but did not typeset the prose either)
function protect(row, i, c, o) {
  let ok;
  if (c.id === "md-title") {
    const html = row.r.html ? o.once : rendered[i];
    ok =
      c.link.every(([, href]) => html.includes(`<a href="${href}"`)) &&
      c.image.every(([, src]) => html.includes(`<img src="${src}"`));
  } else {
    const keep = row.r.html && c.keepHtml ? c.keepHtml : c.keep;
    ok = keep.every((k) => o.once.includes(k) || (row.r.html && o.once.includes(esc(k))));
  }
  if (!ok) return "bad";
  return typeset(c, o.once) ? "ok" : "inert";
}

const CLASSES = [
  { key: "code", title: "Changes text inside code", ids: ["html-code", "md-code"], protect: true },
  { key: "url", title: "Changes URLs or attributes", ids: ["html-attr", "md-url"], protect: true },
  { key: "title", title: "Breaks Markdown link titles", ids: ["md-title"], protect: true },
  { key: "source", title: "Reformats Markdown source", ids: ["md-source"] },
  { key: "idem", title: "Not idempotent", ids: cases.map((c) => c.id) },
  { key: "inner", title: "Inner quotes left straight", ids: ["loc-de-CH", "loc-fr", "loc-ru"] },
];

const details = [];
function cell(row, i, cls) {
  const bad = [];
  let applicable = 0;
  let inert = false;
  for (const id of cls.ids) {
    const o = row.r.cases[id];
    if (!o) continue;
    if (cls.key === "idem" && row.r.html) continue;
    applicable++;
    if (o.error) return `error (${id})`;
    const c = byId[id];
    let failed = false;
    if (cls.protect) {
      const v = protect(row, i, c, o);
      failed = v === "bad";
      if (v === "inert") inert = true;
    } else if (cls.key === "source") {
      failed = row.r.html ? null : o.once !== c.input;
      if (failed === null) return "–";
    } else if (cls.key === "idem") failed = o.twice !== o.once;
    else if (cls.key === "inner") failed = o.once.includes(c.inner);
    if (failed) {
      bad.push(id);
      details.push(
        `${row.name} / ${cls.title} / ${id}\n  in : ${JSON.stringify(c.input)}\n  out: ${JSON.stringify(o.once)}${cls.key === "idem" ? `\n  2nd: ${JSON.stringify(o.twice)}` : ""}`,
      );
    }
  }
  if (applicable === 0) return "–";
  if (bad.length) return `yes (${bad.join(", ")})`;
  return inert ? "no†" : "no";
}

const header = ["Tool", ...CLASSES.map((c) => c.title)];
const lines = [
  `| ${header.join(" | ")} |`,
  `| ${header.map((_, k) => (k ? ":--" : "---")).join(" | ")} |`,
];
for (const [i, row] of rows.entries())
  lines.push(`| ${[row.name, ...CLASSES.map((c) => cell(row, i, c))].join(" | ")} |`);
console.log(lines.join("\n"));
console.log(
  "\n– = the tool does not handle that input (Markdown or non-English); † = no damage, but the tool also left the prose of that case unconverted.",
);

// Plain text has no notion of a URL; this is reported on its own line rather than as a table column.
const bare = byId["text-url"];
const changed = rows
  .filter(
    (r) =>
      r.r.cases["text-url"]?.once != null && !r.r.cases["text-url"].once.includes(bare.keep[0]),
  )
  .map((r) => r.name);
const tested = rows.filter((r) => r.r.cases["text-url"]?.once != null).length;
console.log(
  `Bare URL in plain text (text-url): changed by ${changed.length} of ${tested} tools: ${changed.join(", ")}`,
);

// polytypo must agree across runtimes, or the single "polytypo" claim is wrong
const poly = rows.filter((r) => r.tool === "polytypo");
const ref = poly[0];
if (ref) {
  for (const p of poly.slice(1)) {
    const diff = cases
      .filter((c) => p.r.cases[c.id]?.once !== ref.r.cases[c.id]?.once)
      .map((c) => c.id);
    console.log(
      `${p.name} vs ${ref.name}: ${diff.length ? `outputs differ on ${diff.join(", ")}` : "identical output on all cases"}`,
    );
  }
}
for (const m of notMeasured) console.log(`not measured — ${m}`);
if (args.has("--details")) console.log(`\n${details.join("\n")}`);
if (args.has("--keep")) console.log(`\nkept: ${tmp}`);
else fs.rmSync(tmp, { recursive: true, force: true });
