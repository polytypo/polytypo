import { markdownSpans, resolveDialect } from "../modes/markdown.js";
import type { Options } from "../types.js";
import { getLocaleData } from "./locale.js";
import { planRules } from "./rule-runner.js";
import { runOverSpans } from "./span-runner.js";

/**
 * `markdown` mode only. Imports the Micromark/MDX stack and `parse5` (via `../modes/markdown.js`
 * importing `../modes/html.js` for normative embedded-HTML handling, modes.md 3.7) — both are
 * legitimately reachable from `polytypo/markdown` (AUDIT_REMEDIATION_AND_RELEASE_PLAN.md 5.1).
 *
 * Validation order — `planRules`, then `getLocaleData`, then `resolveDialect`/parsing — mirrors
 * the pre-Stage-5 aggregate `runPipeline` exactly: an unknown-rule error wins over an
 * unknown-locale error, which wins over a missing/invalid dialect, which wins over a parse
 * failure. All four are public, tested behaviour this refactor was not authorised to change.
 */
export function runMarkdownPipeline(input: string, options: Partial<Options>): string {
  const planned = planRules(options.rules);
  const locale = getLocaleData(options.locale);
  const dialect = resolveDialect(options.dialect);
  const spans = markdownSpans(input, dialect);
  return runOverSpans(input, spans, planned, locale, "markdown");
}
