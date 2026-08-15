import { describe, expect, it } from "vitest";
import { htmlSpans, splitCharacterReferences } from "../../src/modes/html";
import { transform } from "../../src/index";

const html = (input: string, locale = "en-US"): string =>
  transform(input, { locale, mode: "html" });

function spanText(source: string): string[] {
  return htmlSpans(source).map((span) => source.slice(span.start, span.end));
}

describe("html skip list (spec/rules/modes.md 3.6)", () => {
  it("skips the entire subtree of every listed element, nested content included", () => {
    for (const tag of ["code", "pre", "kbd", "samp", "var", "script", "style", "textarea"]) {
      const source = `<p>a...b</p><${tag}><em>c...d</em></${tag}>`;
      expect(html(source), tag).toBe(`<p>a…b</p><${tag}><em>c...d</em></${tag}>`);
    }
  });

  it("skips svg and math, at the accepted cost of svg text and title", () => {
    const source = "<p>a...b</p><svg><text>c...d</text><title>e...f</title></svg>";
    expect(html(source)).toBe("<p>a…b</p><svg><text>c...d</text><title>e...f</title></svg>");
    expect(html("<math><mi>x</mi><mo>-</mo><mi>y</mi></math>")).toBe(
      "<math><mi>x</mi><mo>-</mo><mi>y</mi></math>",
    );
  });

  it("matches skipped tag names case-insensitively, as HTML does", () => {
    expect(html("<CODE>a...b</CODE>")).toBe("<CODE>a...b</CODE>");
    expect(html("<PrE>a...b</PrE>")).toBe("<PrE>a...b</PrE>");
  });

  it("skips every attribute, name and value", () => {
    const source = `<a title="a...b" data-x='c...d' alt=e...f>g...h</a>`;
    expect(html(source)).toBe(`<a title="a...b" data-x='c...d' alt=e...f>g…h</a>`);
  });

  it("skips comments, doctype, CDATA-ish content and processing instructions", () => {
    const source = "<!doctype html><!-- a...b --><![CDATA[c...d]]><?pi e...f?><p>g...h</p>";
    expect(html(source)).toBe(
      "<!doctype html><!-- a...b --><![CDATA[c...d]]><?pi e...f?><p>g…h</p>",
    );
  });

  it("processes unknown and custom elements", () => {
    expect(html("<my-callout>a...b</my-callout>")).toBe("<my-callout>a…b</my-callout>");
    expect(html("<Foo>a...b</Foo>")).toBe("<Foo>a…b</Foo>");
  });

  it("processes template content, which is not on the skip list", () => {
    expect(html("<template><p>a...b</p></template>")).toBe("<template><p>a…b</p></template>");
  });
});

describe("character references are opaque units (modes.md 3.6)", () => {
  it("preserves the spelling of every form", () => {
    const source = "<p>&nbsp;&amp;&#8212;&#x2014;&NotARealEntity;</p>";
    expect(html(source)).toBe(source);
  });

  it("splits a text node into spans around a reference", () => {
    expect(spanText("<p>a&nbsp;b</p>")).toEqual(["a", "b"]);
  });

  it("leaves a bare ampersand inside the span rather than manufacturing a boundary", () => {
    expect(spanText("<p>a & b</p>")).toEqual(["a & b"]);
    expect(html("<p>a &amp b...c</p>")).toBe("<p>a &amp b…c</p>");
  });

  it("splitCharacterReferences recognises named, decimal and hex forms only", () => {
    const source = "x&amp;y&#38;z&#x26;w&bogus q";
    expect(
      splitCharacterReferences(source, 0, source.length).map((s) => source.slice(s.start, s.end)),
    ).toEqual(["x", "y", "z", "w&bogus q"]);
  });
});

describe("the round-trip guarantee (modes.md 4)", () => {
  const document = [
    "<!DOCTYPE html>",
    "<html lang=en>",
    "<head><meta charset='utf-8'><title>Un titre</title>",
    "<style>.a::after { content: '...'; }</style>",
    "<script>const s = \"a\" + '...';</script></head>",
    "<body CLASS=main data-x data-x=dup >",
    "<!-- a comment with 'quotes' and -- dashes -->",
    "<p>Already &nbsp;typeset&#8212;nothing to do here.</p>",
    "<pre><code>if (a &lt; b) { return '...'; }</code></pre>",
    "<img src=a.png alt='a photo'>",
    "<br><br/><br />",
    "<my-widget data-config='{\"a\": 1}'>Custom element text.</my-widget>",
    "<svg viewBox='0 0 1 1'><text>x - y</text></svg>",
    "<p>Unclosed <em>emphasis",
    "<table><tr><td>cell</td></table>",
    "</body></html>",
    "   ",
  ].join("\n");

  it("returns a document that needs no changes byte for byte", () => {
    expect(html(document)).toBe(document);
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
    const dirty = document.replace("nothing to do here", 'nothing "to do"... here');
    expect(transform(dirty, { locale: "en-US", mode: "html", rules })).toBe(dirty);
  });

  it("does not repair malformed input", () => {
    for (const source of [
      "<p>a...b",
      "<p>a...b</em></p>",
      "<b><i>a...b</b></i>",
      "a...b < c",
      "<p a='1' a='2'>a...b</p>",
      "</p>a...b",
    ]) {
      const out = html(source);
      expect(out, source).toBe(source.split("...").join("…"));
    }
  });

  it("preserves attribute quoting, void-element form, tag case and attribute order", () => {
    const source = "<P CLASS=foo id='b' data-z=1 data-a=2>x...y<BR/><br ></P>";
    expect(html(source)).toBe("<P CLASS=foo id='b' data-z=1 data-a=2>x…y<BR/><br ></P>");
  });

  it("preserves astral characters and lone surrogates outside spans", () => {
    const source = "<p title='\u{1F600}'>\u{1F600} a...b \u{1F600}</p>";
    expect(html(source)).toBe("<p title='\u{1F600}'>\u{1F600} a…b \u{1F600}</p>");
  });
});
