import type { Rule, RuleId } from "../types.js";
import { apostropheRule } from "./apostrophe.js";
import { dashesRule } from "./dashes.js";
import { ellipsisRule } from "./ellipsis.js";
import { hyphenRule } from "./hyphen.js";
import { nbspRule } from "./nbsp.js";
import { quotesRule } from "./quotes.js";
import { rangesRule } from "./ranges.js";
import { spacesRule } from "./spaces.js";
import { symbolsRule } from "./symbols.js";

/**
 * Mirrors spec/rules/order.json, ascending by `order`. The pipeline must not depend on
 * registration order or map iteration order — Go randomizes the latter (ARCHITECTURE.md 4.5).
 * tests/engine/pipeline.test.ts asserts this list against the spec file.
 *
 * `ranges` sits at order 25, between `ellipsis` (20) and `dashes` (30) — chosen from an observed
 * behavioural difference, not for convenience (dashes.md 7.11, ranges.md 4). A dedicated
 * adjacency stress battery (a parenthetical dash directly touching a range: `a - 5-10`) found
 * that the two orders genuinely disagree: `ranges`-before-`dashes` converts both tokens
 * (`a—5⁠–⁠10`), matching what the single unified pre-0.5.0 `dashes` rule produced (its one scan
 * evaluated every token's cross-token guards — G2 in particular — against the *original*,
 * unedited input, since all edits were collected before any were applied). `dashes`-before-`ranges`
 * instead has `dashes` remove the space between the parenthetical dash and the range's digit run
 * first, which then makes `ranges`' own G2 ("no chain") guard see a dash immediately adjacent to
 * the range and decline it (`a—5-10`) — a regression against the pre-split rule's own behaviour,
 * introduced purely by which rule happens to run first, not by anything in either rule's own
 * guards changing. `ranges`-before-`dashes` is the order that stays faithful to what one combined
 * pass already did; see tests/rules/ranges.test.ts's "adjacency order" cases for the reproduction.
 */
export const RULE_ORDER: readonly RuleId[] = [
  "spaces",
  "ellipsis",
  "ranges",
  "dashes",
  "hyphen",
  "quotes",
  "apostrophe",
  "symbols",
  "nbsp",
];

/**
 * From the `default` field of spec/rules/order.json. Every rule except `ranges` defaults on;
 * `ranges` (spec 0.5.0) is the first rule to default off — see `rule-runner.ts`'s `planRules`
 * for how `Options.rules` resolves a default-off rule's explicit `true`.
 */
export const RULE_DEFAULTS: Readonly<Record<RuleId, boolean>> = {
  spaces: true,
  ellipsis: true,
  ranges: false,
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
  ranges: rangesRule,
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
