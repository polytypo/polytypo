import type { Options } from "../types.js";
import { fromCodePoints, toCodePoints } from "./codepoints.js";
import { getLocaleData } from "./locale.js";
import { planRules, runRules } from "./rule-runner.js";

/**
 * `text` mode only. Deliberately imports nothing from `../modes/html.js` or
 * `../modes/markdown.js` (or their parser dependencies) — this is what makes `polytypo/text`'s
 * module graph exclude `parse5` and the Micromark stack (AUDIT_REMEDIATION_AND_RELEASE_PLAN.md
 * 5.1).
 *
 * Validation order — `planRules` before `getLocaleData` — mirrors the pre-Stage-5 aggregate
 * `runPipeline` exactly (an unknown-rule error must win over an unknown-locale error when both
 * are present, since that is public, tested behaviour, not an implementation detail this
 * refactor was authorised to change).
 */
export function runTextPipeline(input: string, options: Partial<Options>): string {
  const planned = planRules(options.rules);
  const locale = getLocaleData(options.locale);
  return fromCodePoints(runRules(toCodePoints(input), planned, locale, "text"));
}
