// Pins the validation/error-precedence order of the aggregate pipeline and each mode-specific
// pipeline it dispatches to. Pre-Stage-5, `runPipeline` ran: resolve mode → planRules → resolve
// locale → (markdown only) resolve dialect → parse. Stage 5 split that single function into
// per-mode pipelines and briefly reordered locale resolution before planRules, which silently
// changed which error code a caller with two simultaneous problems (e.g. an unknown rule *and*
// an unknown locale) gets back — a public-behaviour regression this file exists to prevent from
// recurring. See docs/AUDIT_REMEDIATION_AND_RELEASE_PLAN.md 5.1.
import { describe, expect, it } from "vitest";
import { transform as transformAggregate } from "../../src/index";
import { transform as transformHtml } from "../../src/index.html";
import { transform as transformMarkdown } from "../../src/index.markdown";
import { transform as transformText } from "../../src/index.text";
import { PolytypoError } from "../../src/errors";
import { LOCALES } from "../../src/generated/locales";

const availableLocale = Object.keys(LOCALES)[0];
const hasLocale = availableLocale !== undefined;
const locale = availableLocale ?? "fi";
const UNKNOWN_LOCALE = "xx";
const UNKNOWN_RULE_OPTIONS = { bogus: false } as unknown as Record<string, boolean>;

function codeOf(run: () => unknown): string {
  try {
    run();
  } catch (error) {
    expect(error).toBeInstanceOf(PolytypoError);
    return (error as PolytypoError).code;
  }
  throw new Error("expected a PolytypoError");
}

describe.skipIf(!hasLocale)("aggregate entry — validation order", () => {
  it("an invalid mode wins over an unknown rule and an unknown locale", () => {
    const options = {
      locale: UNKNOWN_LOCALE,
      mode: "latex",
      rules: UNKNOWN_RULE_OPTIONS,
    } as unknown as Parameters<typeof transformAggregate>[1];
    expect(codeOf(() => transformAggregate("x", options))).toBe("POLYTYPO_INVALID_MODE");
  });

  it("an unknown rule wins over an unknown locale, in text mode", () => {
    const options = {
      locale: UNKNOWN_LOCALE,
      rules: UNKNOWN_RULE_OPTIONS,
    } as unknown as Parameters<typeof transformAggregate>[1];
    expect(codeOf(() => transformAggregate("x", options))).toBe("POLYTYPO_UNKNOWN_RULE");
  });

  it("an unknown rule wins over an unknown locale, in html mode", () => {
    const options = {
      locale: UNKNOWN_LOCALE,
      mode: "html",
      rules: UNKNOWN_RULE_OPTIONS,
    } as unknown as Parameters<typeof transformAggregate>[1];
    expect(codeOf(() => transformAggregate("<p>x</p>", options))).toBe("POLYTYPO_UNKNOWN_RULE");
  });

  it("an unknown rule wins over an unknown locale and a missing dialect, in markdown mode", () => {
    const options = {
      locale: UNKNOWN_LOCALE,
      mode: "markdown",
      rules: UNKNOWN_RULE_OPTIONS,
    } as unknown as Parameters<typeof transformAggregate>[1];
    expect(codeOf(() => transformAggregate("x", options))).toBe("POLYTYPO_UNKNOWN_RULE");
  });

  it("an unknown locale wins over a missing markdown dialect", () => {
    const options = { locale: UNKNOWN_LOCALE, mode: "markdown" } as unknown as Parameters<
      typeof transformAggregate
    >[1];
    expect(codeOf(() => transformAggregate("x", options))).toBe("POLYTYPO_UNKNOWN_LOCALE");
  });

  it("an unknown locale wins over an invalid markdown dialect", () => {
    const options = {
      locale: UNKNOWN_LOCALE,
      mode: "markdown",
      dialect: "latex",
    } as unknown as Parameters<typeof transformAggregate>[1];
    expect(codeOf(() => transformAggregate("x", options))).toBe("POLYTYPO_UNKNOWN_LOCALE");
  });

  it("a missing markdown dialect is reported once rules and locale are valid", () => {
    const options = { locale, mode: "markdown" } as unknown as Parameters<
      typeof transformAggregate
    >[1];
    expect(codeOf(() => transformAggregate("x", options))).toBe("POLYTYPO_INVALID_DIALECT");
  });

  it("an invalid markdown dialect is reported once rules and locale are valid", () => {
    const options = { locale, mode: "markdown", dialect: "latex" } as unknown as Parameters<
      typeof transformAggregate
    >[1];
    expect(codeOf(() => transformAggregate("x", options))).toBe("POLYTYPO_INVALID_DIALECT");
  });

  it("matches the pre-Stage-5 documented example exactly: unknown rule, not unknown locale", () => {
    const options = { locale: "xx", rules: { bogus: false } } as unknown as Parameters<
      typeof transformAggregate
    >[1];
    expect(codeOf(() => transformAggregate("x", options))).toBe("POLYTYPO_UNKNOWN_RULE");
  });
});

describe.skipIf(!hasLocale)("polytypo/text — validation order", () => {
  it("an unknown rule wins over an unknown locale", () => {
    const options = {
      locale: UNKNOWN_LOCALE,
      rules: UNKNOWN_RULE_OPTIONS,
    } as unknown as Parameters<typeof transformText>[1];
    expect(codeOf(() => transformText("x", options))).toBe("POLYTYPO_UNKNOWN_RULE");
  });
});

describe.skipIf(!hasLocale)("polytypo/html — validation order", () => {
  it("an unknown rule wins over an unknown locale", () => {
    const options = {
      locale: UNKNOWN_LOCALE,
      rules: UNKNOWN_RULE_OPTIONS,
    } as unknown as Parameters<typeof transformHtml>[1];
    expect(codeOf(() => transformHtml("<p>x</p>", options))).toBe("POLYTYPO_UNKNOWN_RULE");
  });
});

describe.skipIf(!hasLocale)("polytypo/markdown — validation order", () => {
  it("an unknown rule wins over an unknown locale and a missing dialect", () => {
    const options = {
      locale: UNKNOWN_LOCALE,
      rules: UNKNOWN_RULE_OPTIONS,
    } as unknown as Parameters<typeof transformMarkdown>[1];
    expect(codeOf(() => transformMarkdown("x", options))).toBe("POLYTYPO_UNKNOWN_RULE");
  });

  it("an unknown locale wins over a missing dialect", () => {
    const options = { locale: UNKNOWN_LOCALE } as unknown as Parameters<
      typeof transformMarkdown
    >[1];
    expect(codeOf(() => transformMarkdown("x", options))).toBe("POLYTYPO_UNKNOWN_LOCALE");
  });

  it("a missing dialect is reported once rules and locale are valid", () => {
    const options = { locale } as unknown as Parameters<typeof transformMarkdown>[1];
    expect(codeOf(() => transformMarkdown("x", options))).toBe("POLYTYPO_INVALID_DIALECT");
  });
});
