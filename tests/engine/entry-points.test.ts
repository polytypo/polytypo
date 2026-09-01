import { describe, expect, it } from "vitest";
import { transform as transformAggregate, PolytypoError } from "../../src/index";
import { transform as transformHtml, type HtmlOptions } from "../../src/index.html";
import { transform as transformMarkdown, type MarkdownOptions } from "../../src/index.markdown";
import { transform as transformText, type TextOptions } from "../../src/index.text";
import { LOCALES } from "../../src/generated/locales";

const availableLocale = Object.keys(LOCALES)[0];
const hasLocale = availableLocale !== undefined;
const locale = availableLocale ?? "fi";

function codeOf(run: () => unknown): string {
  try {
    run();
  } catch (error) {
    expect(error).toBeInstanceOf(PolytypoError);
    return (error as PolytypoError).code;
  }
  throw new Error("expected a PolytypoError");
}

describe.skipIf(!hasLocale)("polytypo/text", () => {
  it("matches the aggregate entry's text-mode output", () => {
    const input = 'He said "hi" -- and left...';
    expect(transformText(input, { locale })).toBe(
      transformAggregate(input, { locale, mode: "text" }),
    );
  });

  it("rejects an explicit conflicting mode rather than silently ignoring it", () => {
    // `mode` is not in TextOptions; a JS (or type-widened) caller can still send it.
    const options = { locale, mode: "html" } as unknown as TextOptions;
    expect(codeOf(() => transformText("x", options))).toBe("POLYTYPO_INVALID_MODE");
  });

  it("accepts an explicit mode that matches its own fixed mode", () => {
    const options = { locale, mode: "text" } as unknown as TextOptions;
    expect(transformText("x...y", options)).toBe("x…y");
  });
});

describe.skipIf(!hasLocale)("polytypo/html", () => {
  it("matches the aggregate entry's html-mode output", () => {
    const input = "<p>x...y</p>";
    expect(transformHtml(input, { locale })).toBe(
      transformAggregate(input, { locale, mode: "html" }),
    );
  });

  it("never transforms inside a skipped element, same contract as the aggregate entry", () => {
    const input = "<code>x...y</code>";
    expect(transformHtml(input, { locale })).toBe(input);
  });

  it("rejects an explicit conflicting mode rather than silently ignoring it", () => {
    const options = { locale, mode: "markdown" } as unknown as HtmlOptions;
    expect(codeOf(() => transformHtml("x", options))).toBe("POLYTYPO_INVALID_MODE");
  });
});

describe.skipIf(!hasLocale)("polytypo/markdown", () => {
  it("matches the aggregate entry's markdown-mode output for both dialects", () => {
    const input = "x...y";
    expect(transformMarkdown(input, { locale, dialect: "commonmark" })).toBe(
      transformAggregate(input, { locale, mode: "markdown", dialect: "commonmark" }),
    );
    expect(transformMarkdown(input, { locale, dialect: "mdx" })).toBe(
      transformAggregate(input, { locale, mode: "markdown", dialect: "mdx" }),
    );
  });

  it("still requires a dialect at runtime, same as the aggregate entry", () => {
    const options = { locale } as unknown as MarkdownOptions;
    expect(codeOf(() => transformMarkdown("x", options))).toBe("POLYTYPO_INVALID_DIALECT");
  });

  it("rejects an explicit conflicting mode rather than silently ignoring it", () => {
    const options = { locale, dialect: "commonmark", mode: "text" } as unknown as MarkdownOptions;
    expect(codeOf(() => transformMarkdown("x", options))).toBe("POLYTYPO_INVALID_MODE");
  });
});
