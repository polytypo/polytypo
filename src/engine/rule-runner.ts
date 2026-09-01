import { PolytypoError } from "../errors.js";
import { isRuleId, RULES, RULE_DEFAULTS, RULE_ORDER } from "../rules/registry.js";
import type { LocaleData, Mode, Options, RuleId } from "../types.js";
import { applyEdits } from "./edits.js";

/**
 * The rules that will run, in spec order. An explicit `false` always disables a rule and an
 * absent key always means "use that rule's own default" (RULE_DEFAULTS in registry.ts) —
 * unchanged since spec 0.4.1. Spec 0.5.0 adds the other half: an explicit `true` on a
 * default-off rule (`ranges`, the first one) turns it on. This is not a "one option is now
 * opt-in, opt-out for the rest" special case — it is the same single rule applied uniformly:
 * `override ?? RULE_DEFAULTS[id]`. For every rule but `ranges`, `RULE_DEFAULTS[id]` is already
 * `true`, so an explicit `true` there was always a no-op (tests/engine/pipeline.test.ts still
 * asserts that), and the only thing that changes is which rules *can* have a meaningful `true`.
 * Disabling a rule removes it from the sequence and never reorders the rest (ARCHITECTURE.md
 * 4.5).
 */
export function planRules(rules: Options["rules"]): RuleId[] {
  const overrides = new Map<RuleId, boolean>();
  if (rules !== undefined) {
    for (const [key, value] of Object.entries(rules)) {
      if (!isRuleId(key)) {
        throw new PolytypoError(
          "POLYTYPO_UNKNOWN_RULE",
          `Unknown rule "${key}". Known rules: ${RULE_ORDER.join(", ")}.`,
        );
      }
      overrides.set(key, value);
    }
  }
  return RULE_ORDER.filter((id) => overrides.get(id) ?? RULE_DEFAULTS[id]);
}

/**
 * Rules report edits and the pipeline applies them; no rule ever touches a string
 * (ARCHITECTURE.md 7.1). Each rule sees the output of the previous one.
 */
export function runRules(
  cp: readonly number[],
  planned: readonly RuleId[],
  locale: LocaleData,
  mode: Mode,
): readonly number[] {
  let current = cp;
  for (const id of planned) {
    const rule = RULES[id];
    if (rule === undefined) continue;
    current = applyEdits(current, rule.apply({ cp: current, locale, mode }), id);
  }
  return current;
}
