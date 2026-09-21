// The /changelog page renders brand/tools/changelog.json through build_promo.py's `_md_code`,
// which understands exactly one piece of Markdown: `…` spans. Its own docstring says so —
// "Everything else in those strings is prose and is escaped as prose". So a `**bold**` written
// into an entry does not become bold on the page; it is escaped and the reader sees the four
// asterisks. That happened to the 1.3.0 entry and was caught by eye on the published site, which
// is exactly the kind of check CI should be doing instead.
//
// CHANGELOG.md, rendered from the same file by gen_readmes.py, *is* Markdown and would render
// such a span — so the two outputs disagree, and the JSON is the wrong place to resolve that.
// Entries stay backticks-and-prose, the style every released version already uses.
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = path.resolve(import.meta.dirname, "..", "..");

type Item = { rule?: string; text: string };
type Release = { version: string; headline: string; items: Item[] };
type Changelog = { releases: Release[]; patchNote: string };

const changelog: Changelog = JSON.parse(
  readFileSync(path.join(ROOT, "brand", "tools", "changelog.json"), "utf8"),
);

/**
 * Every string in the file that reaches `_md_code` or is escaped as a whole, paired with a label
 * naming where it came from, so a failure points at the entry rather than at an index.
 */
function renderedStrings(): { where: string; text: string }[] {
  const out: { where: string; text: string }[] = [];
  for (const rel of changelog.releases) {
    out.push({ where: `${rel.version} headline`, text: rel.headline });
    rel.items.forEach((item, i) => {
      out.push({
        where: `${rel.version} item ${i}${item.rule ? ` (${item.rule})` : ""}`,
        text: item.text,
      });
    });
  }
  out.push({ where: "patchNote", text: changelog.patchNote });
  return out;
}

describe("changelog entries only use the markup the page can render", () => {
  it("has at least one entry per released version, so this file is actually checking something", () => {
    expect(changelog.releases.length).toBeGreaterThan(0);
    for (const rel of changelog.releases) {
      expect(rel.items.length, `${rel.version} has no items`).toBeGreaterThan(0);
    }
  });

  it("uses no bold or italic markup, which the page escapes rather than renders", () => {
    const offenders = renderedStrings()
      // `**` is the whole failure mode: two asterisks anywhere mean someone reached for bold.
      // Single `*` and `_` are left alone deliberately — they appear inside backticked example
      // strings as real characters the engine operates on.
      .filter(({ text }) => text.includes("**"))
      .map(({ where }) => where);
    expect(offenders).toEqual([]);
  });

  it("closes every backtick span, since an odd count silently swaps code and prose", () => {
    // _md_code splits on "`" and treats odd-indexed parts as code. An unbalanced backtick
    // therefore does not fail loudly — it renders the rest of the entry as one long <code>.
    const offenders = renderedStrings()
      .filter(({ text }) => (text.match(/`/g) ?? []).length % 2 !== 0)
      .map(({ where }) => where);
    expect(offenders).toEqual([]);
  });

  it("writes no raw HTML tag outside a backtick span", () => {
    // Example strings legitimately contain markup (`a<em>---</em>b`), but only inside backticks
    // where _md_code escapes them into a <code>. Outside one, an author has either typed HTML
    // expecting it to render — it will not — or lost a backtick.
    const offenders = renderedStrings()
      .filter(({ text }) =>
        text
          .split("`")
          .filter((_, i) => i % 2 === 0)
          .some((prose) => /<[a-zA-Z/]/.test(prose)),
      )
      .map(({ where }) => where);
    expect(offenders).toEqual([]);
  });
});
