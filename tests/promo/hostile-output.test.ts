// Regression coverage for the promo playground's escaping boundary (docs/AUDIT_REMEDIATION_AND_
// RELEASE_PLAN.md 6.1: "keep output escaping and the current protection against executing pasted
// HTML"). brand/tools/promo/site.js is a plain browser script (assigns `window.Polytypo`); loaded
// here via Node's `vm` module with a bare `{ window: {} }` sandbox — no real DOM needed, since
// none of the functions under test touch `document` (only `bootTabs` does, and it is never
// called). This tests the actual shipped escaping code, not a reimplementation of it: any future
// change to site.js that weakens `esc()`, `mark()`, or `paint()` fails this file.
//
// Two output paths exist in the playground (brand/tools/build_promo.py's
// build_playground_script): character-diff-highlighted (`paint(diff(...))`, used up to
// DIFF_CAP=4000 characters) and diff-skipped (`mark(out)` alone, used above that length). Both
// are exercised below with the exact hostile examples named in the plan.
import { parseFragment } from "parse5";
import type { DefaultTreeAdapterMap } from "parse5";
import { describe, expect, it } from "vitest";
import { loadPolytypoSiteJs } from "./load-site-js.js";

type Node = DefaultTreeAdapterMap["node"];

const Polytypo = loadPolytypoSiteJs();

// The only elements mark()/paint() are ever allowed to emit — everything else in a parsed
// fragment is either plain text (the hostile input verbatim, inert) or a defect.
const ALLOWED_TAGS = new Set(["span"]);
const ALLOWED_CLASSES = new Set(["chg", "nb", "bound"]);
// mark()/paint() only ever set `class` and `title` on their own wrapper <span>s — anything else
// (an event handler, a URL-bearing attribute the hostile input smuggled in) is a defect.
const ALLOWED_ATTRS = new Set(["class", "title"]);

/**
 * Recursively walks a parse5 fragment and throws (via the returned violations array) on any
 * node shape the two known-safe rendering functions should never produce: an element outside
 * the allow-list, an unexpected attribute (in particular any `on*` handler or URL-bearing
 * attribute), or a wrapper class outside the fixed set mark()/paint() use.
 */
function findStructuralViolations(node: Node, violations: string[] = []): string[] {
  if ("tagName" in node) {
    if (!ALLOWED_TAGS.has(node.tagName)) {
      violations.push(`disallowed element <${node.tagName}>`);
    }
    for (const attr of node.attrs) {
      if (!ALLOWED_ATTRS.has(attr.name)) {
        violations.push(`disallowed attribute "${attr.name}" on <${node.tagName}>`);
      }
      if (attr.name.startsWith("on")) {
        violations.push(`event-handler attribute "${attr.name}" on <${node.tagName}>`);
      }
    }
    const classAttr = node.attrs.find((a) => a.name === "class");
    if (classAttr) {
      for (const cls of classAttr.value.split(/\s+/).filter(Boolean)) {
        if (!ALLOWED_CLASSES.has(cls)) {
          violations.push(`disallowed class "${cls}" on <${node.tagName}>`);
        }
      }
    }
  }
  if ("childNodes" in node) {
    for (const child of node.childNodes) findStructuralViolations(child, violations);
  }
  return violations;
}

/** Concatenates every text node's value, so we can prove the original hostile text still reads
 * as visible content rather than having been silently dropped. */
function extractText(node: Node): string {
  if (node.nodeName === "#text" && "value" in node) return node.value;
  if ("childNodes" in node) return node.childNodes.map(extractText).join("");
  return "";
}

// Every hostile example named in the plan, plus a handful of related shapes that exercise
// entity-like input and attribute-breakout attempts specifically.
const HOSTILE_INPUTS = [
  '<img src=x onerror="alert(1)">',
  "<script>alert(document.cookie)</script>",
  "<svg/onload=alert(1)>",
  '"><img src=x onerror=alert(1)>',
  "javascript:alert(1)",
  "&lt;script&gt;alert(1)&lt;/script&gt;", // already-entity-encoded input must not double-decode
  '<a href="javascript:alert(1)">click</a>',
];

/** True only if `html` contains a literal, unescaped opening angle bracket that could be parsed
 * as the start of a real tag when assigned via innerHTML — i.e. escaping failed. A literal `<`
 * that is part of our own known-safe wrapper markup (e.g. `<span class="chg">`) is expected and
 * fine; this project's own wrapper tags never come from user-controlled text. */
function containsUnescapedTag(html: string, tagName: string): boolean {
  return new RegExp(`<\\s*${tagName}[\\s>/]`, "i").test(html);
}

describe("brand/tools/promo/site.js — esc() (the escaping boundary itself)", () => {
  for (const input of HOSTILE_INPUTS) {
    it(`neutralizes every '<' and '>' in: ${input}`, () => {
      const escaped = Polytypo.esc(input);
      expect(escaped).not.toContain("<");
      expect(escaped).not.toContain(">");
    });
  }

  it("escapes '&' first, so an entity-like decoy does not become a real entity after escaping", () => {
    // If '&' were escaped *after* '<'/'>', "&lt;" in the input would become "&amp;lt;" — still
    // safe, but the reverse bug (escaping '<' before '&') would turn "&lt;" into "&amp;lt;"
    // only by accident; the real risk is the opposite order producing a literal "&lt;" that a
    // browser decodes back into "<". This asserts the actual safe output shape.
    expect(Polytypo.esc("&lt;script&gt;")).toBe("&amp;lt;script&amp;gt;");
  });
});

describe("brand/tools/promo/site.js — mark() (the diff-skipped / large-input path)", () => {
  for (const input of HOSTILE_INPUTS) {
    it(`renders no real tag for: ${input}`, () => {
      const html = Polytypo.mark(input);
      expect(containsUnescapedTag(html, "script")).toBe(false);
      expect(containsUnescapedTag(html, "img")).toBe(false);
      expect(containsUnescapedTag(html, "svg")).toBe(false);
      expect(containsUnescapedTag(html, "a")).toBe(false);
    });
  }

  it("still renders no real tag when the hostile input is long enough to take the large-input path", () => {
    // brand/tools/build_promo.py calls mark(out) directly (skipping diff/paint) once input length
    // exceeds DIFF_CAP (4000 chars); mark() itself has no length-dependent branch, so a long
    // hostile payload is the faithful equivalent of exercising that code path.
    const longHostile = "<script>alert(1)</script>".repeat(200); // 5,200 chars, well over 4000
    const html = Polytypo.mark(longHostile);
    expect(containsUnescapedTag(html, "script")).toBe(false);
    expect(html).not.toContain("<script>alert(1)</script>");
  });

  it("preserves the exact escaped text so the original content is still legible, not stripped", () => {
    const html = Polytypo.mark("<script>alert(1)</script>");
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
  });
});

describe("brand/tools/promo/site.js — paint() (the diff-highlighted output path)", () => {
  for (const input of HOSTILE_INPUTS) {
    it(`renders no real tag for an unchanged (identity-diff) hostile input: ${input}`, () => {
      // Simulates the playground's actual call shape: diff(inputChars, outputChars) -> paint(...).
      // Text-mode transform() does not alter tag-shaped text (it has no notion of tags at all),
      // so an identity diff (input === output) is the realistic case for this input.
      const segments = Polytypo.diff([...input], [...input]);
      const html = Polytypo.paint(segments);
      expect(containsUnescapedTag(html, "script")).toBe(false);
      expect(containsUnescapedTag(html, "img")).toBe(false);
      expect(containsUnescapedTag(html, "svg")).toBe(false);
    });

    it(`renders no real tag when the hostile input is itself the CHANGED portion of a diff: ${input}`, () => {
      // A hostile string that the engine actually altered (e.g. a quote character inside it got
      // curled) exercises paint()'s `<span class="chg" title="...">` wrapper path specifically —
      // the wrapper's own title attribute must not become an escape hatch either.
      const before = `x ${input} y`;
      const after = `x ${input}Z y`; // pretend one character was inserted after the hostile text
      const segments = Polytypo.diff([...before], [...after]);
      const html = Polytypo.paint(segments);
      expect(containsUnescapedTag(html, "script")).toBe(false);
      expect(containsUnescapedTag(html, "img")).toBe(false);
    });
  }

  it("does not leak hostile text into a real title attribute value", () => {
    // paint()'s title comes only from the fixed CHAR_INFO lookup table (single known punctuation
    // characters), never from arbitrary user text — this proves that boundary holds even when a
    // hostile string is the "changed" segment.
    const segments = Polytypo.diff([...""], [...'"><script>alert(1)</script>']);
    const html = Polytypo.paint(segments);
    expect(html).not.toMatch(/title="[^"]*<script/i);
    expect(containsUnescapedTag(html, "script")).toBe(false);
  });
});

describe("brand/tools/promo/site.js — structural check via real HTML parsing (parse5)", () => {
  // The regex checks above prove specific tag names never appear unescaped; this proves something
  // stronger by actually parsing the generated fragment: every node is either text or one of
  // Polytypo's own known-safe wrapper <span>s, every attribute is one of the two mark()/paint()
  // ever set, no `on*` handler survives, and the original hostile text is still present as visible
  // text rather than having been dropped.
  for (const input of HOSTILE_INPUTS) {
    it(`mark(): only text and known-safe wrapper spans for: ${input}`, () => {
      const html = Polytypo.mark(input);
      const fragment = parseFragment(html);
      const violations = findStructuralViolations(fragment);
      expect(violations).toEqual([]);
      expect(extractText(fragment)).toBe(input);
    });

    it(`paint(): only text and known-safe wrapper spans for an unchanged diff: ${input}`, () => {
      const segments = Polytypo.diff([...input], [...input]);
      const html = Polytypo.paint(segments);
      const fragment = parseFragment(html);
      const violations = findStructuralViolations(fragment);
      expect(violations).toEqual([]);
      expect(extractText(fragment)).toBe(input);
    });

    it(`paint(): only text and known-safe wrapper spans when hostile text is the changed segment: ${input}`, () => {
      const before = `x ${input} y`;
      const after = `x ${input}Z y`;
      const segments = Polytypo.diff([...before], [...after]);
      const html = Polytypo.paint(segments);
      const fragment = parseFragment(html);
      const violations = findStructuralViolations(fragment);
      expect(violations).toEqual([]);
      expect(extractText(fragment)).toBe(after);
    });
  }

  it("mark(): no structural violation on the large-input (diff-skipped) path", () => {
    const longHostile = "<script>alert(1)</script>".repeat(200);
    const html = Polytypo.mark(longHostile);
    const fragment = parseFragment(html);
    expect(findStructuralViolations(fragment)).toEqual([]);
    expect(extractText(fragment)).toBe(longHostile);
  });

  it("paint(): a URL-bearing hostile attribute breakout survives only as inert text", () => {
    const input = '"><a href="javascript:alert(1)">click</a>';
    const segments = Polytypo.diff([...""], [...input]);
    const html = Polytypo.paint(segments);
    const fragment = parseFragment(html);
    expect(findStructuralViolations(fragment)).toEqual([]);
    expect(extractText(fragment)).toBe(input);
  });
});
