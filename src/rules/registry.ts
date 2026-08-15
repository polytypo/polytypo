import type { Rule, RuleId } from "../types.js";
import { apostropheRule } from "./apostrophe.js";
import { dashesRule } from "./dashes.js";
import { ellipsisRule } from "./ellipsis.js";
import { hyphenRule } from "./hyphen.js";
import { nbspRule } from "./nbsp.js";
import { quotesRule } from "./quotes.js";
import { spacesRule } from "./spaces.js";
import { symbolsRule } from "./symbols.js";

/**
 * Mirrors spec/rules/order.json, ascending by `order`. The pipeline must not depend on
 * registration order or map iteration order — Go randomizes the latter (ARCHITECTURE.md 4.5).
 * tests/engine/pipeline.test.ts asserts this list against the spec file.
 */
export const RULE_ORDER: readonly RuleId[] = [
  "spaces",
  "ellipsis",
  "dashes",
  "hyphen",
  "quotes",
  "apostrophe",
  "symbols",
  "nbsp",
];

/** From the `default` field of spec/rules/order.json. `rules` in the options is opt-out only. */
export const RULE_DEFAULTS: Readonly<Record<RuleId, boolean>> = {
  spaces: true,
  ellipsis: true,
  dashes: true,
  hyphen: true,
  quotes: true,
  apostrophe: true,
  symbols: true,
  nbsp: true,
};

/** Rule implementations, keyed by id. Partial until every rule lands. */
export const RULES: Readonly<Partial<Record<RuleId, Rule>>> = {
  spaces: spacesRule,
  ellipsis: ellipsisRule,
  dashes: dashesRule,
  hyphen: hyphenRule,
  quotes: quotesRule,
  apostrophe: apostropheRule,
  symbols: symbolsRule,
  nbsp: nbspRule,
};

export function isRuleId(value: string): value is RuleId {
  return (RULE_ORDER as readonly string[]).includes(value);
}
