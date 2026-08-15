import { describe, expect, it } from "vitest";
import { PolytypoError, transform } from "../../src/index";
import { markdownSpans } from "../../src/modes/markdown";
import type { Dialect, Options } from "../../src/types";

const md = (input: string, locale = "en-US", dialect: Dialect = "commonmark"): string =>
  transform(input, { locale, mode: "markdown", dialect });

const mdx = (input: string, locale = "en-US"): string => md(input, locale, "mdx");

function spanText(source: string, dialect: Dialect = "commonmark"): string[] {
  return markdownSpans(source, dialect).map((span) => source.slice(span.start, span.end));
}

describe("markdown skip list (spec/rules/modes.md 3.7)", () => {
  it("skips fenced code blocks, fences and info string", () => {
    const source = "```js...x\nconst a = '...';\n```\n";
    expect(md(source)).toBe(source);
  });

  it("skips indented code blocks", () => {
    expect(md("para...graph\n\n    indented... code\n")).toBe(
      "para…graph\n\n    indented... code\n",
    );
  });

  it("skips inline code spans including the backticks", () => {
    expect(md("a...b `c...d` e...f\n")).toBe("a…b `c...d` e…f\n");
  });

  it("skips autolinks and bare URLs", () => {
    expect(md("<https://ex.com/a...b> and https://ex.com/c...d and e...f\n")).toBe(
      "<https://ex.com/a...b> and https://ex.com/c...d and e…f\n",
    );
  });

  it("skips link destinations and titles but processes the link text", () => {
    expect(md('[te...xt](http://a...b "ti...tle")\n')).toBe('[te…xt](http://a...b "ti...tle")\n');
    expect(md("![al...t](http://a...b)\n")).toBe("![al…t](http://a...b)\n");
  });

  it("skips the definition line of a reference link", () => {
    expect(md('[te...xt][re...f]\n\n[re...f]: /u...v "ti...tle"\n')).toBe(
      '[te…xt][re...f]\n\n[re...f]: /u...v "ti...tle"\n',
    );
  });

  it("leaves emphasis delimiters, list markers, headings and table padding outside every span", () => {
    expect(spanText("- *a...b* **c**\n")).toEqual(["a...b", " ", "c"]);
    expect(spanText("## He...ading\n")).toEqual(["He...ading"]);
    expect(spanText("| a  |  b |\n| --- | --- |\n")).toEqual(["a", "b"]);
  });

  it("does not reformat a table", () => {
    const source = "| a  |  b  |\n| :-- | ---: |\n| x...y  | z |\n";
    expect(md(source)).toBe("| a  |  b  |\n| :-- | ---: |\n| x…y  | z |\n");
  });

  it("keeps hard-break spaces and line endings outside every span", () => {
    const source = "a...b   \nc...d\n";
    expect(md(source)).toBe("a…b   \nc…d\n");
  });

  it("keeps character escapes opaque", () => {
    expect(md("a\\*b...c\\*d\n")).toBe("a\\*b…c\\*d\n");
  });
});

describe("raw HTML inside markdown is handed to the html skip list (modes.md 3.7)", () => {
  it("processes the text of an HTML block but not its markup", () => {
    expect(md("<div class=x>\n  a...b\n</div>\n")).toBe("<div class=x>\n  a…b\n</div>\n");
  });

  it("skips a skipped element opened with inline raw HTML", () => {
    expect(md("a...b <code>c...d</code> e...f\n")).toBe("a…b <code>c...d</code> e…f\n");
    expect(md("a...b <b>c...d</b> e...f\n")).toBe("a…b <b>c…d</b> e…f\n");
  });

  it("skips an HTML block whose subtree is skipped", () => {
    const source = "<pre>\n  a...b\n</pre>\n";
    expect(md(source)).toBe(source);
  });
});

describe("MDX (modes.md 3.7)", () => {
  it("skips expression containers in full and every JSX attribute", () => {
    const source = '<Callout title="a...b" n={1}>c...d {x ? "e...f" : g} h...i</Callout>\n';
    expect(mdx(source)).toBe('<Callout title="a...b" n={1}>c…d {x ? "e...f" : g} h…i</Callout>\n');
  });

  it("processes JSX element children", () => {
    expect(mdx("<Callout>\n\nSome text... here\n\n</Callout>\n")).toBe(
      "<Callout>\n\nSome text… here\n\n</Callout>\n",
    );
  });

  it("skips an ESM export block", () => {
    expect(mdx('export const meta = {t: "a..."}\n\n# Ti...tle\n')).toBe(
      'export const meta = {t: "a..."}\n\n# Ti…tle\n',
    );
  });

  it("distinguishes a JSX component from a skipped element by case", () => {
    expect(mdx("<Code>a...b</Code> <code>c...d</code>\n")).toBe(
      "<Code>a…b</Code> <code>c...d</code>\n",
    );
  });

  it("is the caller's choice, never detected (modes.md 3.7.1)", () => {
    // `a < b` is a JSX syntax error and an indented code block is not MDX; in `commonmark` both
    // are ordinary. A heuristic would silently reclassify the document, so there is none.
    expect(md("a < b and c...d\n\n    indented... code\n")).toBe(
      "a < b and c…d\n\n    indented... code\n",
    );
    // The same bytes in `mdx`: no indented code block, so the block is prose.
    expect(mdx("text\n\n    indented... code\n")).toBe("text\n\n    indented… code\n");
  });

  it("throws POLYTYPO_INVALID_DIALECT when the dialect is missing or unknown", () => {
    const codeOf = (run: () => unknown): string | undefined => {
      try {
        run();
      } catch (error) {
        return (error as { code?: string }).code;
      }
      return undefined;
    };
    const bare = { locale: "en-US", mode: "markdown" } as Options;
    expect(codeOf(() => transform("x", bare))).toBe("POLYTYPO_INVALID_DIALECT");
    const bogus = { locale: "en-US", mode: "markdown", dialect: "gfm" } as unknown as Options;
    expect(codeOf(() => transform("x", bogus))).toBe("POLYTYPO_INVALID_DIALECT");
  });

  /**
   * modes.md 3.7.2. `transform` throws `POLYTYPO_MALFORMED_INPUT` and the parser's own error
   * type never escapes — a `VFileMessage` on the public surface would put a dependency's type
   * into the contract, unreproducible in the other four runtimes. Only the code is contractual;
   * the message and the source position are useful and are not.
   *
   * This is the **only** way input can make `transform` throw, and it is reachable in exactly one
   * dialect: MDX embeds JavaScript, HTML parsing has total error recovery, and every byte
   * sequence is valid CommonMark.
   */
  it("throws POLYTYPO_MALFORMED_INPUT when the document is not the declared dialect", () => {
    const witnesses = [
      "an <!-- html comment --> is not MDX\n",
      "text with {an unterminated expression\n",
      "export const = broken\n",
      "<https://example.com/autolink> is not MDX\n",
      "<Callout {...bad syntax}>x</Callout>\n",
    ];
    for (const witness of witnesses) {
      let caught: unknown;
      try {
        mdx(witness);
      } catch (error) {
        caught = error;
      }
      expect(caught, witness).toBeInstanceOf(PolytypoError);
      expect((caught as PolytypoError).code, witness).toBe("POLYTYPO_MALFORMED_INPUT");
      // Actionable: the dialect that rejected it, the parser's reason, and where.
      expect((caught as PolytypoError).message, witness).toContain("mdx");
    }
  });

  it("carries a source position when the parser reports one", () => {
    try {
      mdx("ok\n\ntext with {an unterminated expression\n");
      expect.unreachable();
    } catch (error) {
      expect((error as Error).message).toMatch(/line \d+, column \d+/);
    }
  });

  it("is the only way input can make transform throw", () => {
    // Neither other language can reject a document, so the same witnesses pass through.
    for (const witness of ["an <!-- html comment -->\n", "export const = broken\n", "{x\n"]) {
      expect(() => md(witness)).not.toThrow();
      expect(() => transform(witness, { locale: "en-US", mode: "html" })).not.toThrow();
      expect(() => transform(witness, { locale: "en-US" })).not.toThrow();
    }
  });

  it("ignores dialect in text and html modes", () => {
    expect(transform("a...b", { locale: "en-US" })).toBe("a…b");
    expect(transform("<p>a...b</p>", { locale: "en-US", mode: "html" })).toBe("<p>a…b</p>");
  });
});

describe("the round-trip guarantee in markdown (modes.md 4)", () => {
  const article = [
    "---",
    "title: Une note",
    "---",
    "",
    'export const meta = {slug: "une-note"};',
    "",
    "# Un titre",
    "",
    "Un paragraphe déjà composé — rien à faire ici. Voir",
    '[le guide](https://example.com/g?x=1&y=2 "Le guide").',
    "",
    "> Une citation sur deux lignes,",
    "> avec `du code` dedans.",
    "",
    "- premier",
    "- deuxième avec **gras** et *italique*",
    "",
    "| Colonne  |  Autre |",
    "| :------- | -----: |",
    "| a        |      b |",
    "",
    "```ts",
    'const s = "...";  // not touched',
    "```",
    "",
    '<Callout kind="note" n={1 + 2}>',
    "  Du texte dans un composant.",
    "</Callout>",
    "",
    "Bare URL https://example.com/x-y_z and a\\*escape\\*.",
    "",
    "[le guide]: https://example.com/g",
    "",
  ].join("\n");

  it("returns an MDX article that needs no changes byte for byte", () => {
    expect(mdx(article, "fr")).toBe(article);
  });

  it("changes nothing at all when every rule is disabled", () => {
    const rules = {
      spaces: false,
      ellipsis: false,
      dashes: false,
      hyphen: false,
      quotes: false,
      apostrophe: false,
      symbols: false,
      nbsp: false,
    } as const;
    const dirty = article.replace("rien à faire", 'rien "à faire"...');
    expect(transform(dirty, { locale: "fr", mode: "markdown", dialect: "mdx", rules })).toBe(dirty);
  });

  // Autolinks and indented code blocks do not exist in MDX, so a CommonMark document exercises
  // constructs the MDX article cannot contain. Both dialects have to round-trip.
  const commonmark = [
    "Setext heading",
    "==============",
    "",
    "A paragraph with <https://example.com/a_b>, a bare https://example.com/c_d,",
    "some `inline code`, an ![image](/i.png 'Alt'), and &amp; an entity.",
    "",
    "    indented code block, '...' intact",
    "",
    "1. first",
    "2. second",
    "",
    "<div class=raw>",
    "  Raw HTML block prose.",
    "</div>",
    "",
    "Trailing hard break  ",
    "on the next line.",
    "",
  ].join("\n");

  it("returns a CommonMark article that needs no changes byte for byte", () => {
    expect(md(commonmark)).toBe(commonmark);
  });
});
