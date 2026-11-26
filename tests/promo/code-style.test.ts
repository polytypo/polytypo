// Every HTML entity, code point, option name and snippet in prose, a table or a heading is code:
// wrapped in <code> (backticks in the docs sources) and set on the grey inline-code fill. Source
// level, so it needs no generated site.
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const TOOLS = path.join(ROOT, "brand/tools");

function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)],
  );
}

// `U+00A0`, `&nbsp;`, `&#160;`, `&#xA0;`
const BARE = /U\+[0-9A-Fa-f]{4,6}|&#?[A-Za-z0-9]+;/g;

/** Lines of a docs page body that hold a bare code point or entity. Front matter (title, SEO
 * title and description are plain text by nature) and fenced blocks are code already. */
function bareInMarkdown(source: string): string[] {
  const lines = source.split("\n");
  let i = 0;
  if (lines[0] === "---") i = lines.indexOf("---", 1) + 1;
  const bad: string[] = [];
  let fenced = false;
  for (; i < lines.length; i++) {
    const line = lines[i]!;
    if (line.trimStart().startsWith("```")) {
      fenced = !fenced;
      continue;
    }
    if (fenced) continue;
    const outside = line.replace(/`[^`]*`/g, "");
    if (BARE.test(outside)) bad.push(`${i + 1}: ${line.trim().slice(0, 100)}`);
    BARE.lastIndex = 0;
  }
  return bad;
}

describe("docs pages: no bare code point or entity in prose, tables or headings", () => {
  const pages = walk(path.join(TOOLS, "docs")).filter((f) => f.endsWith(".md"));
  it("finds the docs pages", () => expect(pages.length).toBeGreaterThan(20));
  it.each(pages.map((p) => [path.relative(TOOLS, p), p]))("%s", (_name, file) => {
    expect(bareInMarkdown(readFileSync(file!, "utf8"))).toEqual([]);
  });
});

describe("page bodies: no bare code point in prose", () => {
  // Entities are real markup in these files (&amp;, &middot;), so only code points are checked.
  const bodies = readdirSync(path.join(TOOLS, "promo")).filter((f) => f.endsWith(".body.html"));
  it.each(bodies)("%s", (name) => {
    const html = readFileSync(path.join(TOOLS, "promo", name), "utf8")
      .replace(/<!--[\s\S]*?-->/g, "")
      .replace(/<(code|pre|title)\b[\s\S]*?<\/\1>/g, "")
      .replace(/<[^>]*>/g, "");
    expect(html.match(/U\+[0-9A-Fa-f]{4,6}/g) ?? []).toEqual([]);
  });
});

describe("style.css — inline code sits on the grey fill", () => {
  const css = readFileSync(path.join(TOOLS, "promo/style.css"), "utf8");
  it("fills :not(pre) > code from the surface scale", () => {
    const body = css.match(/:not\(pre\) > code\s*\{([^}]*)\}/)?.[1] ?? "";
    expect(body).toMatch(/background:\s*var\(--surface-strong\)/);
    expect(body).toMatch(/border-radius:\s*var\(--radius-xs\)/);
  });
});
