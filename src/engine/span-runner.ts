import {
  concatenateSpans,
  filterBoundaryEdits,
  normalizeSpans,
  spanRangesOf,
  splitOnMarker,
  type Span,
} from "../modes/spans.js";
import { RULES } from "../rules/registry.js";
import type { LocaleData, Mode, RuleId } from "../types.js";
import { applyEdits } from "./edits.js";
import { fromCodePoints } from "./codepoints.js";

/**
 * The same sequence as `runRules` (`./rule-runner.js`), with the two boundary filters of
 * modes.md 3.4 interposed. The span extents are recomputed after every rule, because applying
 * an edit shifts every index after it; the markers themselves always survive, since no edit may
 * contain one.
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
export function runOverSpans(
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
