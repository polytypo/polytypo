// Per-review-change rule attribution, using only the real public transform() API. transform()
// never exposes which rule produced a given character of output, so attribution here is
// *inferred* by re-running transform() with all rules but a chosen set disabled (`Options.rules`
// is opt-out only) and comparing the isolated run's `AtomicEdit`s against the review change's own.
//
// Stage 10 Pass A correction: the previous version's "combined rules reproduce this grouped
// output, while no single rule reproduces the whole group" test proved only that the union of
// several rules' edits, applied together, matches the observed result -- which is exactly as true
// for several genuinely *independent* edits that happen to land in the same grouped region as it
// is for a real interaction. That is not evidence of interaction. It also could not survive at
// the atomic-edit level: several unrelated apostrophe/dashes/quotes edits sitting on adjacent
// lines of one multi-line block satisfied the old test and were wrongly labelled
// `confirmed-interaction`.
//
// The replacement below runs the honest experiment: build the union of every overlapping rule's
// *isolated* edits that fall inside the target review change's own span, and check whether that
// union -- unmodified, each edit exactly as it appeared running alone -- reproduces the observed
// text. If it does, the edits are independent and simply happened to co-occur:
// `multi-rule-composition`, not an interaction. If the isolated edits overlap each other, or their
// union does not reproduce the observed text, something about running the rules *together*
// changed the outcome -- but that alone does not prove which rule depends on which, or in what
// direction, so it is reported as `interaction-candidate`, not asserted as confirmed.
//
// A genuinely *confirmed* interaction requires a counterfactual: showing that rule A's output
// changes specifically because rule B ran (an order/conditioning experiment). `transform()`'s
// public surface has no way to reorder rules relative to each other -- `Options.rules` only
// enables/disables, and pipeline order is fixed by spec/rules/order.json, not caller-controlled --
// so this tool cannot reliably produce that proof. Per the task's own instruction, it therefore
// never emits `confirmed-interaction`: `interaction-candidate` is the ceiling of what can be
// claimed from this API.
import { computeFileDiff, type AtomicEdit } from "./diff.js";
import type { Options, RuleId } from "../../src/types.js";
import { transform } from "../../src/index.js";

export const RULE_IDS: readonly RuleId[] = [
  "spaces",
  "ellipsis",
  "dashes",
  "hyphen",
  "quotes",
  "apostrophe",
  "symbols",
  "nbsp",
];

export type AttributionCategory = "single-rule" | "multi-rule-composition" | "interaction-candidate" | "ambiguous" | "unknown";

export interface ReviewChangeAttribution {
  /** Rule ids whose isolated run (that rule alone, the other seven disabled) produced *some*
   * `AtomicEdit` overlapping this review change's exact code-point range. Overlap alone is not
   * evidence of anything beyond "worth checking" -- see `category`. */
  overlappingIsolatedRules: RuleId[];
  category: AttributionCategory;
  /** Set only when `category === "single-rule"`: that one rule. */
  singleRule: RuleId | null;
  /** Set only when `category === "multi-rule-composition"`: the exact rule subset whose isolated
   * edits, applied together unmodified, were verified to reproduce this review change's observed
   * text -- i.e. these rules acted independently and simply co-occurred here. */
  composingRules: RuleId[] | null;
  inferred: true;
}

function rangesOverlap(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
  return aStart < bEnd && bStart < aEnd;
}

/** Checks whether `candidateEdits` (assumed all to fall within `[start, end)` of `oldText`),
 * applied left-to-right with no gaps unaccounted for, reproduce `expectedAfter` exactly over that
 * span. Returns `false` immediately if any two candidates overlap each other (rules touched the
 * same position -- cannot be a clean independent union by definition). */
function sliceReproduces(oldText: string, start: number, end: number, expectedAfter: string, candidateEdits: readonly AtomicEdit[]): boolean {
  const sorted = [...candidateEdits].sort((a, b) => a.oldOffset.codePointStart - b.oldOffset.codePointStart);
  for (let i = 1; i < sorted.length; i += 1) {
    const prev = sorted[i - 1] as AtomicEdit;
    const cur = sorted[i] as AtomicEdit;
    if (cur.oldOffset.codePointStart < prev.oldOffset.codePointEnd) return false;
  }
  const oldCps = [...oldText];
  let result = "";
  let cursor = start;
  for (const e of sorted) {
    if (e.oldOffset.codePointStart < start || e.oldOffset.codePointEnd > end) continue; // defensive: caller should have already filtered
    result += oldCps.slice(cursor, e.oldOffset.codePointStart).join("");
    result += e.after;
    cursor = e.oldOffset.codePointEnd;
  }
  result += oldCps.slice(cursor, end).join("");
  return result === expectedAfter;
}

export interface ReviewChangeForAttribution {
  id: string;
  oldOffset: { codePointStart: number; codePointEnd: number };
  after: string;
}

/**
 * For every entry in `reviewChanges` (already computed from `original` vs. the real full-pipeline
 * output), determines an `AttributionCategory`. Runs exactly 8 single-rule `transform()` calls
 * (one per rule id, cached), never a per-review-change or combinatorial number of calls -- the
 * union-reproduction test below is pure text slicing over those 8 cached isolated `AtomicEdit`
 * sets, not additional `transform()` calls.
 */
export function attributeReviewChanges(
  original: string,
  baseOptions: Options,
  reviewChanges: readonly ReviewChangeForAttribution[],
): Map<string, ReviewChangeAttribution> {
  const attribution = new Map<string, ReviewChangeAttribution>();
  if (reviewChanges.length === 0) return attribution;

  function isolatedTransform(ruleId: RuleId): string | null {
    const rulesOption = Object.fromEntries(RULE_IDS.filter((id) => id !== ruleId).map((id) => [id, false])) as Partial<
      Record<RuleId, boolean>
    >;
    try {
      return transform(original, { ...baseOptions, rules: rulesOption });
    } catch {
      return null; // best-effort: a rule that throws in isolation contributes no attribution evidence
    }
  }

  const isolatedEditsByRule = new Map<RuleId, AtomicEdit[]>();
  for (const ruleId of RULE_IDS) {
    const output = isolatedTransform(ruleId);
    isolatedEditsByRule.set(ruleId, output === null || output === original ? [] : computeFileDiff("isolated", original, output).atomicEdits);
  }

  for (const target of reviewChanges) {
    const { codePointStart: start, codePointEnd: end } = target.oldOffset;
    const overlapping: RuleId[] = [];
    for (const ruleId of RULE_IDS) {
      const isolated = isolatedEditsByRule.get(ruleId) ?? [];
      if (isolated.some((e) => rangesOverlap(e.oldOffset.codePointStart, e.oldOffset.codePointEnd, start, end))) {
        overlapping.push(ruleId);
      }
    }

    let category: AttributionCategory;
    let singleRule: RuleId | null = null;
    let composingRules: RuleId[] | null = null;

    if (overlapping.length === 0) {
      category = "unknown";
    } else {
      const exactSingleMatches = overlapping.filter((ruleId) => {
        const edits = (isolatedEditsByRule.get(ruleId) ?? []).filter(
          (e) => e.oldOffset.codePointStart >= start && e.oldOffset.codePointEnd <= end,
        );
        return sliceReproduces(original, start, end, target.after, edits);
      });

      if (exactSingleMatches.length === 1) {
        category = "single-rule";
        singleRule = exactSingleMatches[0] as RuleId;
      } else if (exactSingleMatches.length > 1) {
        // Two or more rules each, alone, exactly reproduce the same observed text -- cannot be
        // disambiguated from the output alone.
        category = "ambiguous";
      } else {
        const unionEdits = overlapping.flatMap((ruleId) =>
          (isolatedEditsByRule.get(ruleId) ?? []).filter((e) => e.oldOffset.codePointStart >= start && e.oldOffset.codePointEnd <= end),
        );
        if (sliceReproduces(original, start, end, target.after, unionEdits)) {
          category = "multi-rule-composition";
          composingRules = [...overlapping].sort();
        } else {
          category = "interaction-candidate";
        }
      }
    }

    attribution.set(target.id, {
      overlappingIsolatedRules: [...overlapping].sort(),
      category,
      singleRule,
      composingRules,
      inferred: true,
    });
  }

  return attribution;
}
