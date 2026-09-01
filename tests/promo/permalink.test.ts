// Regression coverage for the playground's permalink mechanics (docs/AUDIT_REMEDIATION_AND_
// RELEASE_PLAN.md 6.2): encodePermalinkFragment/decodePermalinkFragment are pure helpers factored
// out of brand/tools/promo/site.js specifically so round-trip, malformed-input, and size-limit
// behaviour is testable without a browser, a clipboard, or generated page source.
import { describe, expect, it } from "vitest";
import { loadPolytypoSiteJs } from "./load-site-js.js";

const Polytypo = loadPolytypoSiteJs();

describe("brand/tools/promo/site.js — permalink round-trip", () => {
  it("round-trips ASCII input, preserving locale, mode, dialect and text exactly", () => {
    const state = { locale: "en-US", mode: "text", dialect: "", input: "Hello, world!" };
    const fragment = Polytypo.encodePermalinkFragment(state);
    const decoded = Polytypo.decodePermalinkFragment(fragment);
    expect(decoded.ok).toBe(true);
    expect(decoded.state).toEqual(state);
  });

  it("round-trips non-ASCII input — accents, CJK, RTL, astral emoji, combining marks", () => {
    const input =
      'Café — «très élégant» 日本語のテスト مرحبا بالعالم 🎉👨‍👩‍👧‍👦 é (combining) — "quoted"';
    const state = { locale: "fr", mode: "markdown", dialect: "mdx", input };
    const fragment = Polytypo.encodePermalinkFragment(state);
    const decoded = Polytypo.decodePermalinkFragment(fragment);
    expect(decoded.ok).toBe(true);
    expect(decoded.state).toEqual(state);
  });

  it("preserves mode=html with an empty dialect (dialect only applies to markdown)", () => {
    const state = { locale: "de-DE", mode: "html", dialect: "", input: "<p>Hallo</p>" };
    const fragment = Polytypo.encodePermalinkFragment(state);
    const decoded = Polytypo.decodePermalinkFragment(fragment);
    expect(decoded.ok).toBe(true);
    expect(decoded.state).toEqual(state);
  });

  it("preserves commonmark and mdx dialects distinctly", () => {
    for (const dialect of ["commonmark", "mdx"]) {
      const state = { locale: "ru", mode: "markdown", dialect, input: "# заголовок" };
      const decoded = Polytypo.decodePermalinkFragment(Polytypo.encodePermalinkFragment(state));
      expect(decoded.ok).toBe(true);
      expect(decoded.state?.dialect).toBe(dialect);
    }
  });

  it("the encoded fragment is URL-fragment-safe (no '#', '&', '?', '/', '+' characters)", () => {
    const fragment = Polytypo.encodePermalinkFragment({
      locale: "en-US",
      mode: "text",
      dialect: "",
      input: "a+b/c?d&e#f 日本語 🎉",
    });
    expect(fragment).not.toMatch(/[#&?/+]/);
  });
});

describe("brand/tools/promo/site.js — permalink failure paths fail safely", () => {
  it("rejects an empty fragment", () => {
    expect(Polytypo.decodePermalinkFragment("").ok).toBe(false);
  });

  it("rejects garbage that isn't valid base64/UTF-8/JSON", () => {
    const decoded = Polytypo.decodePermalinkFragment("!!!not-valid-base64-or-json!!!");
    expect(decoded.ok).toBe(false);
  });

  it("rejects valid base64 that decodes to non-JSON text", () => {
    const fragment = btoa("this is not json").replace(/\+/g, "-").replace(/\//g, "_");
    expect(Polytypo.decodePermalinkFragment(fragment).ok).toBe(false);
  });

  it("rejects a JSON payload that isn't a 5-element array", () => {
    const fragment = btoa(JSON.stringify({ not: "an array" }))
      .replace(/\+/g, "-")
      .replace(/\//g, "_");
    expect(Polytypo.decodePermalinkFragment(fragment).ok).toBe(false);
  });

  it("rejects an unsupported (future) permalink version", () => {
    const fragment = btoa(JSON.stringify([2, "en-US", "text", "", "hello"]))
      .replace(/\+/g, "-")
      .replace(/\//g, "_");
    const decoded = Polytypo.decodePermalinkFragment(fragment);
    expect(decoded.ok).toBe(false);
    expect(decoded.reason).toMatch(/version/);
  });

  it("rejects a payload with the right shape but wrong field types", () => {
    const fragment = btoa(JSON.stringify([1, "en-US", "text", "", 12345]))
      .replace(/\+/g, "-")
      .replace(/\//g, "_");
    expect(Polytypo.decodePermalinkFragment(fragment).ok).toBe(false);
  });

  it("rejects a fragment longer than MAX_PERMALINK_LENGTH instead of attempting to decode it", () => {
    const oversized = "A".repeat(Polytypo.MAX_PERMALINK_LENGTH + 1);
    const decoded = Polytypo.decodePermalinkFragment(oversized);
    expect(decoded.ok).toBe(false);
    expect(decoded.reason).toMatch(/large/);
  });

  it("accepts a fragment exactly at MAX_PERMALINK_LENGTH if it is otherwise valid", () => {
    // Build a real, valid, encoded fragment sized to land exactly on the limit so the boundary
    // check is proven to be inclusive (<=), not an off-by-one that rejects the limit itself.
    let input = "x";
    let fragment = Polytypo.encodePermalinkFragment({
      locale: "en-US",
      mode: "text",
      dialect: "",
      input,
    });
    while (fragment.length < Polytypo.MAX_PERMALINK_LENGTH) {
      input += "x".repeat(Polytypo.MAX_PERMALINK_LENGTH - fragment.length);
      fragment = Polytypo.encodePermalinkFragment({
        locale: "en-US",
        mode: "text",
        dialect: "",
        input,
      });
    }
    // Trim any overshoot from base64's 4-byte alignment back down to exactly the limit.
    while (fragment.length > Polytypo.MAX_PERMALINK_LENGTH) {
      input = input.slice(0, -1);
      fragment = Polytypo.encodePermalinkFragment({
        locale: "en-US",
        mode: "text",
        dialect: "",
        input,
      });
    }
    expect(fragment.length).toBeLessThanOrEqual(Polytypo.MAX_PERMALINK_LENGTH);
    const decoded = Polytypo.decodePermalinkFragment(fragment);
    expect(decoded.ok).toBe(true);
  });
});

describe("brand/tools/promo/site.js — copyStatusText()", () => {
  it("reports success concisely", () => {
    expect(Polytypo.copyStatusText("Output", true)).toBe("Output copied.");
  });

  it("reports failure visibly rather than silently, with a manual fallback instruction", () => {
    expect(Polytypo.copyStatusText("Link", false)).toBe(
      "Link could not be copied — copy it manually.",
    );
  });
});

describe("brand/tools/promo/site.js — permalinkStatusText()", () => {
  it("reports three mutually distinct, truthful outcomes", () => {
    const copied = Polytypo.permalinkStatusText("copied");
    const clipboardUnavailable = Polytypo.permalinkStatusText("clipboard-unavailable");
    const tooLong = Polytypo.permalinkStatusText("too-long");
    expect(new Set([copied, clipboardUnavailable, tooLong]).size).toBe(3);
  });

  it("tells the user the link is in the address bar when Clipboard is unavailable", () => {
    expect(Polytypo.permalinkStatusText("clipboard-unavailable")).toMatch(/address bar/);
  });

  it("reports the oversized-input case distinctly from a clipboard failure", () => {
    expect(Polytypo.permalinkStatusText("too-long")).toMatch(/too long/);
  });
});

describe("brand/tools/promo/site.js — shareStatusText()", () => {
  it("reports three mutually distinct outcomes", () => {
    const shared = Polytypo.shareStatusText("shared");
    const cancelled = Polytypo.shareStatusText("cancelled");
    const failed = Polytypo.shareStatusText("failed");
    expect(new Set([shared, cancelled, failed])).toHaveProperty("size", 3);
  });

  it("does not describe a real failure as a cancellation", () => {
    expect(Polytypo.shareStatusText("failed")).not.toBe(Polytypo.shareStatusText("cancelled"));
    expect(Polytypo.shareStatusText("failed").toLowerCase()).toContain("failed");
  });
});

describe("brand/tools/promo/site.js — buildPermalinkUrl()", () => {
  it("builds an https URL without relying on location.origin", () => {
    const url = Polytypo.buildPermalinkUrl(
      "https://polytypo.js.org/playground.html",
      "abc123",
    );
    expect(url).toBe("https://polytypo.js.org/playground.html#abc123");
  });

  it("builds a URL for localhost with a port", () => {
    const url = Polytypo.buildPermalinkUrl("http://127.0.0.1:8080/playground.html", "xyz");
    expect(url).toBe("http://127.0.0.1:8080/playground.html#xyz");
  });

  it("builds a correct URL for a file:// page, where location.origin would be the string 'null'", () => {
    const url = Polytypo.buildPermalinkUrl(
      "file:///home/iuriirogulia/Projects/polytypo/promo/playground.html",
      "deadbeef",
    );
    expect(url).toBe("file:///home/iuriirogulia/Projects/polytypo/promo/playground.html#deadbeef");
  });

  it("replaces an existing fragment rather than appending to it", () => {
    const url = Polytypo.buildPermalinkUrl(
      "https://polytypo.js.org/playground.html#oldfragment",
      "newfragment",
    );
    expect(url).toBe("https://polytypo.js.org/playground.html#newfragment");
  });

  it("preserves an existing query string", () => {
    const url = Polytypo.buildPermalinkUrl(
      "https://polytypo.js.org/playground.html?foo=bar",
      "frag",
    );
    expect(url).toBe("https://polytypo.js.org/playground.html?foo=bar#frag");
  });
});

describe("brand/tools/promo/site.js — stripPermalinkFragment()", () => {
  it("removes a fragment, preserving the rest of the URL", () => {
    const url = Polytypo.stripPermalinkFragment(
      "https://polytypo.js.org/playground.html?foo=bar#somefragment",
    );
    expect(url).toBe("https://polytypo.js.org/playground.html?foo=bar");
  });

  it("is a no-op (structurally) when there is no fragment to strip", () => {
    const url = Polytypo.stripPermalinkFragment("https://polytypo.js.org/playground.html");
    expect(url).toBe("https://polytypo.js.org/playground.html");
  });

  it("works for a file:// URL", () => {
    const url = Polytypo.stripPermalinkFragment(
      "file:///home/iuriirogulia/Projects/polytypo/promo/playground.html#stale",
    );
    expect(url).toBe("file:///home/iuriirogulia/Projects/polytypo/promo/playground.html");
  });
});

describe("brand/tools/promo/site.js — validateRestoredState()", () => {
  const OPTIONS = {
    locales: ["en-US", "de-DE", "fr"],
    modes: ["text", "html", "markdown"],
    dialects: ["commonmark", "mdx"],
  };

  it("accepts a non-markdown state with an empty dialect", () => {
    const state = { locale: "en-US", mode: "text", dialect: "", input: "hello" };
    expect(Polytypo.validateRestoredState(state, OPTIONS)).toBe(true);
  });

  it("rejects a non-markdown state carrying a non-empty dialect (hand-edited/malicious permalink)", () => {
    const state = { locale: "en-US", mode: "text", dialect: "mdx", input: "hello" };
    expect(Polytypo.validateRestoredState(state, OPTIONS)).toBe(false);
  });

  it("accepts a markdown state with a supported dialect", () => {
    const state = { locale: "en-US", mode: "markdown", dialect: "mdx", input: "# hi" };
    expect(Polytypo.validateRestoredState(state, OPTIONS)).toBe(true);
  });

  it("rejects a markdown state with an unsupported dialect", () => {
    const state = { locale: "en-US", mode: "markdown", dialect: "bogus", input: "# hi" };
    expect(Polytypo.validateRestoredState(state, OPTIONS)).toBe(false);
  });

  it("rejects an unknown locale", () => {
    const state = { locale: "xx", mode: "text", dialect: "", input: "hello" };
    expect(Polytypo.validateRestoredState(state, OPTIONS)).toBe(false);
  });

  it("rejects an unknown mode", () => {
    const state = { locale: "en-US", mode: "bogus", dialect: "", input: "hello" };
    expect(Polytypo.validateRestoredState(state, OPTIONS)).toBe(false);
  });

  it("accepts every state encodePermalinkFragment/decodePermalinkFragment round-trips for a non-markdown mode", () => {
    for (const mode of ["text", "html"]) {
      const state = { locale: "en-US", mode, dialect: "", input: "hello" };
      const decoded = Polytypo.decodePermalinkFragment(
        Polytypo.encodePermalinkFragment(state),
      );
      expect(decoded.ok).toBe(true);
      expect(Polytypo.validateRestoredState(decoded.state!, OPTIONS)).toBe(true);
    }
  });
});
