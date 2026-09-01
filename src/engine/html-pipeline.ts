import { htmlSpans } from "../modes/html.js";
import type { Options } from "../types.js";
import { getLocaleData } from "./locale.js";
import { planRules } from "./rule-runner.js";
import { runOverSpans } from "./span-runner.js";

/**
 * `html` mode only. Imports `parse5` (via `../modes/html.js`) and nothing from
 * `../modes/markdown.js` or the Micromark/MDX stack — this is what makes `polytypo/html`'s
 * module graph exclude the Markdown parser (AUDIT_REMEDIATION_AND_RELEASE_PLAN.md 5.1).
 *
 * Validation order — `planRules` before `getLocaleData` before parsing — mirrors the pre-Stage-5
 * aggregate `runPipeline` exactly (an unknown-rule error must win over an unknown-locale error,
 * and both must win over a parse failure, since that is public, tested behaviour).
 */
export function runHtmlPipeline(input: string, options: Partial<Options>): string {
  const planned = planRules(options.rules);
  const locale = getLocaleData(options.locale);
  const spans = htmlSpans(input);
  return runOverSpans(input, spans, planned, locale, "html");
}
