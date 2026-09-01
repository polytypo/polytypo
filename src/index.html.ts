import { assertFixedMode } from "./engine/assert-fixed-mode.js";
import { runHtmlPipeline } from "./engine/html-pipeline.js";
import type { Options } from "./types.js";

/**
 * `polytypo/html` — HTML-only entry point. Its module graph includes `parse5` but excludes the
 * Micromark/MDX stack (AUDIT_REMEDIATION_AND_RELEASE_PLAN.md 5.1): it imports
 * `./engine/html-pipeline.js` directly and never `./engine/pipeline.js` or `./modes/markdown.js`.
 *
 * `mode` is absent from `HtmlOptions`, since this entry only ever runs `html` mode. `dialect` is
 * likewise absent — it has no effect in `html` mode even in the aggregate entry (types.ts), so
 * there is nothing for it to conflict with here.
 */
export type HtmlOptions = Omit<Options, "mode" | "dialect">;

export function transform(input: string, options: HtmlOptions): string {
  const given = (options ?? {}) as Partial<Options>;
  assertFixedMode(given.mode, "html", "polytypo/html");
  return runHtmlPipeline(input, given);
}

export { PolytypoError } from "./errors.js";
export type { PolytypoErrorCode } from "./errors.js";
export type { LocaleData, LocaleSource, QuotePair, Rule, RuleContext, RuleId } from "./types.js";
