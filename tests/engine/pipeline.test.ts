import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, it, expect } from "vitest";
import { transform } from "../../src/index";
import { PolytypoError } from "../../src/errors";
import { LOCALES } from "../../src/generated/locales";
import { planRules } from "../../src/engine/pipeline";
import { RULES, RULE_DEFAULTS, RULE_ORDER } from "../../src/rules/registry";
import type { Options, RuleId } from "../../src/types";

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

const allRulesOff = Object.fromEntries(RULE_ORDER.map((id) => [id, false])) as Record<
  RuleId,
  boolean
>;

describe("rule registry", () => {
  it("matches spec/rules/order.json", () => {
    const specPath = fileURLToPath(new URL("../../spec/rules/order.json", import.meta.url));
    const spec = JSON.parse(readFileSync(specPath, "utf8")) as {
      rules: Array<{ id: RuleId; order: number; default: "on" | "off" }>;
    };
    const expectedOrder = [...spec.rules].sort((a, b) => a.order - b.order).map((rule) => rule.id);
    expect(RULE_ORDER).toEqual(expectedOrder);
    for (const rule of spec.rules) {
      expect(RULE_DEFAULTS[rule.id]).toBe(rule.default === "on");
    }
  });

  it("registers every implementation under its own id, and only known ids", () => {
    for (const [key, rule] of Object.entries(RULES)) {
      expect(RULE_ORDER).toContain(key);
      expect(rule?.id).toBe(key);
    }
  });
});

describe("pipeline sequence", () => {
  it("runs every default-on rule in spec order", () => {
    expect(planRules(undefined)).toEqual([...RULE_ORDER].filter((id) => RULE_DEFAULTS[id]));
  });

  it("disabling a rule removes it without reordering the rest", () => {
    for (const id of RULE_ORDER) {
      const planned = planRules({ [id]: false });
      expect(planned).not.toContain(id);
      expect(planned).toEqual(planRules(undefined).filter((other) => other !== id));
    }
  });

  it("plans nothing when every rule is opted out", () => {
    expect(planRules(allRulesOff)).toEqual([]);
  });

  it("treats `true` as a no-op, since `rules` is opt-out only", () => {
    expect(planRules({ spaces: true })).toEqual(planRules(undefined));
  });
});

describe("options validation", () => {
  it("throws POLYTYPO_UNKNOWN_LOCALE for an unknown locale", () => {
    expect(codeOf(() => transform("x", { locale: "xx" }))).toBe("POLYTYPO_UNKNOWN_LOCALE");
  });

  it("accepts html and markdown now that the adapters have landed", () => {
    expect(transform("x...y", { locale, mode: "html" })).toBe("x…y");
    expect(transform("x...y", { locale, mode: "markdown", dialect: "commonmark" })).toBe("x…y");
    expect(transform("x...y", { locale, mode: "markdown", dialect: "mdx" })).toBe("x…y");
  });

  it("throws POLYTYPO_INVALID_DIALECT when markdown mode has no dialect", () => {
    const options = { locale, mode: "markdown" } as Options;
    expect(codeOf(() => transform("x", options))).toBe("POLYTYPO_INVALID_DIALECT");
  });

  it("throws POLYTYPO_INVALID_MODE for a mode outside the enum", () => {
    const options = { locale, mode: "latex" } as unknown as Options;
    expect(codeOf(() => transform("x", options))).toBe("POLYTYPO_INVALID_MODE");
  });

  it("throws POLYTYPO_UNKNOWN_RULE for an unknown rule key", () => {
    const options = { locale, rules: { smartquotes: false } } as unknown as Options;
    expect(codeOf(() => transform("x", options))).toBe("POLYTYPO_UNKNOWN_RULE");
  });
});

describe.skipIf(!hasLocale)("no-op guarantee", () => {
  const samples = [
    "",
    "Plain ASCII text.",
    'He said "hi" -- and left...',
    "a\u{1F600}b \uD800 lone surrogate",
    "Ligne : « déjà » !",
    "line one\nline two\r\n\ttab",
  ];

  for (const sample of samples) {
    // An empty rule selection must round-trip through the code-point conversion untouched,
    // whatever the registry happens to contain.
    it(`is byte-identical with every rule off for ${JSON.stringify(sample)}`, () => {
      expect(transform(sample, { locale, rules: allRulesOff })).toBe(sample);
    });
  }

  it("defaults to text mode", () => {
    expect(transform("abc", { locale })).toBe(transform("abc", { locale, mode: "text" }));
  });
});
