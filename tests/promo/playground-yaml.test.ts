// yaml mode in the playground: the Keys control's wiring and the call block every language shows
// for it. The harness (and the limits of what a mock DOM can prove) is documented in
// load-playground.ts; sample documents are covered by playground-samples.test.ts.
import { describe, expect, it } from "vitest";

import { loadPlayground } from "./load-playground.js";

const YAML_INPUT = 'description: He said "hi" to us\nrun: echo "hi"\n';

describe("playground yaml mode — the controls", () => {
  it("offers yaml as a fourth mode, with the Keys field hidden until it is chosen", async () => {
    const pg = loadPlayground();
    // render() runs once at startup and sets both wrappers from the initial mode ("text").
    expect(pg.el("pg-keys-wrap").hidden).toBe(true);
    expect(pg.el("pg-dialect-wrap").hidden).toBe(true);

    await pg.set({ locale: "en-US", input: YAML_INPUT, mode: "yaml" });
    expect(pg.el("pg-keys-wrap").hidden).toBe(false);
    expect(pg.el("pg-dialect-wrap").hidden, "dialect is markdown-only").toBe(true);
  });

  it("hides the Keys field again when the mode moves away from yaml", async () => {
    const pg = loadPlayground();
    await pg.set({ locale: "en-US", input: YAML_INPUT, mode: "yaml" });
    expect(pg.el("pg-keys-wrap").hidden).toBe(false);
    await pg.set({ mode: "markdown" });
    expect(pg.el("pg-keys-wrap").hidden).toBe(true);
    expect(pg.el("pg-dialect-wrap").hidden).toBe(false);
  });
});

describe("playground yaml mode — the call block it shows", () => {
  it("names keys in all five languages, each in that language's own syntax", async () => {
    const pg = loadPlayground();
    await pg.set({
      locale: "en-US",
      input: YAML_INPUT,
      mode: "yaml",
      keys: "description, title",
    });
    const c = pg.calls();
    expect(c.js).toContain('keys: ["description", "title"]');
    expect(c.py).toContain('keys=["description", "title"]');
    expect(c.go).toContain('[]string{"description", "title"}');
    expect(c.rb).toContain('keys: ["description", "title"]');
    expect(c.php).toContain("'keys' => ['description', 'title']");
  });

  it("shows keys only in yaml mode, and dialect only in markdown", async () => {
    const pg = loadPlayground();
    await pg.set({ locale: "en-US", input: "plain text", mode: "text" });
    for (const [lang, code] of Object.entries(pg.calls())) {
      expect(code, `${lang} names keys in text mode`).not.toMatch(/\bkeys\b/);
      expect(code, `${lang} names dialect in text mode`).not.toMatch(/\bdialect\b/i);
    }

    await pg.set({ mode: "markdown" });
    for (const [lang, code] of Object.entries(pg.calls())) {
      expect(code, `${lang} names keys in markdown mode`).not.toMatch(/\bkeys\b/);
      expect(code, `${lang} omits dialect in markdown mode`).toMatch(/dialect/i);
    }
  });

  it("drops blank entries rather than passing an empty key that matches nothing", async () => {
    // "description, title," parses to two keys, not three: an empty string is a legal key that
    // matches no line, so leaving it in would narrow the result silently.
    const pg = loadPlayground();
    await pg.set({
      locale: "en-US",
      input: YAML_INPUT,
      mode: "yaml",
      keys: "description, title,",
    });
    expect(pg.calls().js).toContain('keys: ["description", "title"]');

    await pg.set({ keys: " , , " });
    await pg.set({ input: YAML_INPUT + " " }); // re-render; keys has no change event of its own here
    expect(pg.calls().js, "an all-separator field is an empty list").toContain("keys: []");
  });

  it("escapes a typed key rather than injecting it into the snippet", async () => {
    // Keys are the one free-text control in the bar. A quote or backslash typed there must come
    // back as a string literal in every language, never as syntax.
    const pg = loadPlayground();
    await pg.set({
      locale: "en-US",
      input: YAML_INPUT,
      mode: "yaml",
      keys: 'a"b, c\\d',
    });
    const c = pg.calls();
    // JSON.stringify escapes both for the JS/Python/Go/Ruby literals.
    expect(c.js).toContain('"a\\"b"');
    expect(c.js).toContain('"c\\\\d"');
    // PHP single-quoted literals escape the backslash; a double quote needs no escaping there.
    expect(c.php).toContain("'a\"b'");
    expect(c.php).toContain("'c\\\\d'");
  });
});
