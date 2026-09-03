// Replaces tests/promo/copy-link-order.test.ts and tests/promo/permalink.test.ts, both of which
// existed solely to police the permalink/"Copy Link" feature that has now been removed. Deleting
// them without a replacement would leave nothing to stop the feature quietly coming back — so this
// file inverts them: it asserts the affordance is ABSENT from every generated page and that
// brand/tools/promo/site.js exports none of the helpers that implemented it.
//
// Both directions are checked, because either alone is weak:
//   - source-text absence catches a helper reintroduced but not yet wired to a button;
//   - a real parse5 walk over every generated page catches a button reintroduced under a different
//     id or label, which a string search for "pg-copy-link" would sail straight past.
//
// The positive controls at the bottom are what keep this from passing vacuously: Copy Output must
// still exist, must sit INSIDE the output pane (the point of the move, not merely "not deleted"),
// and copyStatusText — the one clipboard helper the removal keeps — must still be exported.
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "parse5";
import type { DefaultTreeAdapterMap } from "parse5";
import { describe, expect, it } from "vitest";
import { loadRawPolytypoSiteJs } from "./load-site-js.js";

type Node = DefaultTreeAdapterMap["node"];
type Element = DefaultTreeAdapterMap["element"];

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const PROMO_DIR = path.join(ROOT, "promo");

const PAGES = [
  "index.html",
  "manifesto/index.html",
  "docs/index.html",
  "playground/index.html",
  "locales/index.html",
];

/** Pages that embed the playground — the only ones that could plausibly regrow a share control. */
const PLAYGROUND_PAGES = ["index.html", "playground/index.html"];

/** Every identifier the removed feature used, in site.js and in the generated inline script. */
const REMOVED_IDENTIFIERS = [
  "encodePermalinkFragment",
  "decodePermalinkFragment",
  "permalinkStatusText",
  "shareStatusText",
  "buildPermalinkUrl",
  "stripPermalinkFragment",
  "validateRestoredState",
  "MAX_PERMALINK_LENGTH",
  "utf8ToBase64Url",
  "base64UrlToUtf8",
  "PERMALINK_VERSION",
];

/** DOM/browser surfaces only the permalink and share features ever touched here. */
const REMOVED_BEHAVIOUR_MARKERS = [
  "pg-copy-link",
  "pg-share",
  "pg-permalink-notice",
  "navigator.share",
  "history.replaceState",
  "location.hash",
  "clearStaleFragmentOnce",
];

function readPromoPage(name: string): string {
  const p = path.join(PROMO_DIR, ...name.split("/"));
  if (!existsSync(p)) {
    throw new Error(
      `${p} does not exist — run "npm run generate:all" before running this test file, which ` +
        "checks the actual generated output, not just its source template.",
    );
  }
  return readFileSync(p, "utf8");
}

function isElement(node: Node): node is Element {
  return "tagName" in node;
}

function attr(el: Element, name: string): string | undefined {
  return el.attrs.find((a) => a.name === name)?.value;
}

function hasClass(el: Element, cls: string): boolean {
  return (attr(el, "class") ?? "").split(/\s+/).includes(cls);
}

function extractText(node: Node): string {
  if (node.nodeName === "#text" && "value" in node) return node.value;
  if ("childNodes" in node) return node.childNodes.map(extractText).join("");
  return "";
}

function findAll(node: Node, predicate: (el: Element) => boolean, out: Element[] = []): Element[] {
  if (isElement(node) && predicate(node)) out.push(node);
  if ("childNodes" in node) for (const child of node.childNodes) findAll(child, predicate, out);
  return out;
}

/** Every clickable control on a page — buttons and links alike, since a "Share" affordance could
 * be either — as { tag, id, label }. */
function clickableControls(html: string): Array<{ tag: string; id: string; label: string }> {
  const document = parse(html);
  return findAll(document, (el) => el.tagName === "button" || el.tagName === "a").map((el) => ({
    tag: el.tagName,
    id: attr(el, "id") ?? "",
    label: extractText(el).replace(/\s+/g, " ").trim(),
  }));
}

describe("promo pages — no permalink or share affordance survives anywhere", () => {
  for (const page of PAGES) {
    it(`${page} contains none of the removed permalink/share identifiers`, () => {
      const html = readPromoPage(page);
      for (const marker of [...REMOVED_IDENTIFIERS, ...REMOVED_BEHAVIOUR_MARKERS]) {
        expect(html, `${page} still references "${marker}"`).not.toContain(marker);
      }
    });

    it(`${page} offers no control labelled Copy Link, Share, or Permalink`, () => {
      for (const control of clickableControls(readPromoPage(page))) {
        expect(
          control.label,
          `${page}: <${control.tag} id="${control.id}"> is labelled "${control.label}"`,
        ).not.toMatch(/^(copy link|share|permalink|copy permalink|share link)$/i);
      }
    });
  }

  it("no page explains a URL-fragment permalink in prose either", () => {
    for (const page of PAGES) {
      const html = readPromoPage(page).toLowerCase();
      expect(html, `${page} still documents a permalink`).not.toContain("permalink");
      expect(html, `${page} still promises link-restored state`).not.toContain(
        "opening a copied link restores",
      );
    }
  });
});

describe("brand/tools/promo/site.js — the permalink helpers are gone from the shared script", () => {
  const source = readFileSync(path.join(ROOT, "brand/tools/promo/site.js"), "utf8");
  const exported = loadRawPolytypoSiteJs();

  for (const name of REMOVED_IDENTIFIERS) {
    it(`does not define or export ${name}`, () => {
      expect(source, `site.js still contains "${name}"`).not.toContain(name);
      // Read through an untyped view: the typed PolytypoSiteJs interface no longer declares these
      // properties, so naming them directly would fail `tsc --noEmit` rather than the assertion.
      expect(exported[name], `window.Polytypo still exports ${name}`).toBeUndefined();
    });
  }

  it("exports exactly the surviving public surface, so a new helper cannot appear unnoticed", () => {
    expect(Object.keys(exported).sort()).toEqual(
      [
        "bootTabs",
        "copyStatusText",
        "describeChange",
        "diff",
        "esc",
        "highlight",
        "mark",
        "paint",
        "summarizeChange",
        "summarizeError",
      ].sort(),
    );
  });
});

describe("positive controls — Copy Output survives, and inside the output pane", () => {
  it("copyStatusText is still exported (the removal kept the clipboard helper Copy Output uses)", () => {
    const exported = loadRawPolytypoSiteJs();
    expect(typeof exported.copyStatusText).toBe("function");
  });

  for (const page of PLAYGROUND_PAGES) {
    it(`${page} still has a Copy Output button, and it sits inside the output pane`, () => {
      const document = parse(readPromoPage(page));
      // Located by walking down from .pane-r rather than by id from the document root: the point
      // of this chip's move is *where* the button is, so proving it is a descendant of the pane it
      // copies is the assertion, not merely that the id still exists somewhere on the page.
      const panes = findAll(document, (el) => hasClass(el, "pane-r"));
      expect(panes.length, `${page}: expected an output pane`).toBe(1);
      const buttons = findAll(panes[0]!, (el) => el.tagName === "button");
      expect(buttons.map((b) => attr(b, "id"))).toContain("pg-copy-output");
      expect(buttons.map((b) => extractText(b).trim())).toContain("Copy Output");
    });

    it(`${page} no longer renders the separate action bar the button used to live in`, () => {
      const document = parse(readPromoPage(page));
      expect(findAll(document, (el) => hasClass(el, "pg-actions"))).toEqual([]);
    });
  }
});
