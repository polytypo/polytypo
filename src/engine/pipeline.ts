import { PolytypoError } from "../errors.js";
import { htmlSpans } from "../modes/html.js";
import { markdownSpans, resolveDialect } from "../modes/markdown.js";
import {
  concatenateSpans,
  filterBoundaryEdits,
  normalizeSpans,
  spanRangesOf,
  splitOnMarker,
  type Span,
} from "../modes/spans.js";
import { isRuleId, RULES, RULE_DEFAULTS, RULE_ORDER } from "../rules/registry.js";
import type { LocaleData, Mode, Options, RuleId } from "../types.js";
import { fromCodePoints, toCodePoints } from "./codepoints.js";
import { applyEdits } from "./edits.js";
import { getLocaleData } from "./locale.js";

function resolveMode(mode: Mode | undefined): Mode {
  if (mode === undefined || mode === "text") return "text";
  if (mode === "html" || mode === "markdown") return mode;
  throw new PolytypoError(
    "POLYTYPO_INVALID_MODE",
    `Unknown mode "${String(mode)}". Expected "text", "html" or "markdown".`,
  );
}

/**
 * The rules that will run, in spec order. Disabling a rule removes it from the sequence and
 * never reorders the rest (ARCHITECTURE.md 4.5).
 */
export function planRules(rules: Options["rules"]): RuleId[] {
  const disabled = new Set<RuleId>();
  if (rules !== undefined) {
    for (const [key, value] of Object.entries(rules)) {
      if (!isRuleId(key)) {
        throw new PolytypoError(
          "POLYTYPO_UNKNOWN_RULE",
          `Unknown rule "${key}". Known rules: ${RULE_ORDER.join(", ")}.`,
        );
      }
      if (value === false) disabled.add(key);
    }
  }
  return RULE_ORDER.filter((id) => RULE_DEFAULTS[id] && !disabled.has(id));
}

/**
 * Rules report edits and the pipeline applies them; no rule ever touches a string
 * (ARCHITECTURE.md 7.1). Each rule sees the output of the previous one.
 */
function runRules(
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

/**
 * The same sequence with the two boundary filters of modes.md 3.4 interposed. The span extents
 * are recomputed after every rule, because applying an edit shifts every index after it; the
 * markers themselves always survive, since no edit may contain one.
 */
function runRulesOverSpans(
  cp: readonly number[],
  planned: readonly RuleId[],
  locale: LocaleData,
  mode: Mode,
): readonly number[] {
  let current = cp;
  for (const id of planned) {
    const rule = RULES[id];
    if (rule === undefined) continue;
    const edits = rule.apply({ cp: current, locale, mode });
    current = applyEdits(current, filterBoundaryEdits(current, edits, spanRangesOf(current)), id);
  }
  return current;
}

/**
 * modes.md 3.5. The pipeline runs **once**, over the marker-separated concatenation of every
 * processable span — not per span, which would pair quotation marks in isolation, and not over a
 * naive concatenation, which would manufacture adjacencies the document does not have.
 *
 * The output is the input with a set of disjoint substring replacements applied and nothing else
 * (modes.md 4). A span whose content the rules did not change contributes no replacement, so a
 * document needing no changes comes back byte-identical; the parser located the spans and was
 * then discarded, and the document is never serialised.
 */
function runOverSpans(
  source: string,
  spans: readonly Span[],
  planned: readonly RuleId[],
  locale: LocaleData,
  mode: Mode,
): string {
  const normalized = normalizeSpans(spans);
  if (normalized.length === 0) return source;

  const transformed = runRulesOverSpans(
    concatenateSpans(source, normalized),
    planned,
    locale,
    mode,
  );
  const pieces = splitOnMarker(transformed, normalized.length);

  let out = "";
  let cursor = 0;
  for (let i = 0; i < normalized.length; i += 1) {
    const span = normalized[i] as Span;
    const replacement = fromCodePoints(pieces[i] as number[]);
    const original = source.slice(span.start, span.end);
    out += source.slice(cursor, span.start);
    out += replacement === original ? original : replacement;
    cursor = span.end;
  }
  return out + source.slice(cursor);
}

export function runPipeline(input: string, options: Options): string {
  // A plain-JS caller can omit the options object entirely. Reading through a null here would
  // raise a native TypeError, which is outside the error taxonomy; an absent `locale` is an
  // unknown locale and must say so with a code (locale-resolution.md 3.1).
  const given: Partial<Options> = options ?? {};
  const mode = resolveMode(given.mode);
  const planned = planRules(given.rules);
  const locale = getLocaleData(given.locale);

  if (mode === "text") {
    return fromCodePoints(runRules(toCodePoints(input), planned, locale, mode));
  }
  const spans =
    mode === "html" ? htmlSpans(input) : markdownSpans(input, resolveDialect(given.dialect));
  return runOverSpans(input, spans, planned, locale, mode);
}
