import { PolytypoError } from "../errors.js";
import type { Mode, Options } from "../types.js";
import { runHtmlPipeline } from "./html-pipeline.js";
import { runMarkdownPipeline } from "./markdown-pipeline.js";
import { runTextPipeline } from "./text-pipeline.js";

export { planRules } from "./rule-runner.js";

function resolveMode(mode: Mode | undefined): Mode {
  if (mode === undefined || mode === "text") return "text";
  if (mode === "html" || mode === "markdown") return mode;
  throw new PolytypoError(
    "POLYTYPO_INVALID_MODE",
    `Unknown mode "${String(mode)}". Expected "text", "html" or "markdown".`,
  );
}

/**
 * The aggregate entry's dispatcher: every mode is reachable, so it is the only pipeline module
 * that imports all three mode-specific ones (and therefore the only one whose module graph
 * includes both `parse5` and the Micromark/MDX stack). `polytypo/text`, `polytypo/html` and
 * `polytypo/markdown` each call their own mode-specific pipeline directly and never import this
 * module (AUDIT_REMEDIATION_AND_RELEASE_PLAN.md 5.1).
 */
export function runPipeline(input: string, options: Options): string {
  // A plain-JS caller can omit the options object entirely. Reading through a null here would
  // raise a native TypeError, which is outside the error taxonomy; an absent `locale` is an
  // unknown locale and must say so with a code (locale-resolution.md 3.1).
  const given: Partial<Options> = options ?? {};
  const mode = resolveMode(given.mode);
  if (mode === "text") return runTextPipeline(input, given);
  if (mode === "html") return runHtmlPipeline(input, given);
  return runMarkdownPipeline(input, given);
}
