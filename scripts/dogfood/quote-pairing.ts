// Best-effort structural linkage between opening and closing quote-mark `ReviewChange`s, for
// REVIEW.md navigation only -- never fed back into transform() or any rule, and never a
// substitute for reading the preview.
//
// The real quotes-rule nesting/nesting-depth algorithm lives in src/rules/quotes.ts and is not
// part of the public API (`transform()` returns only the final string). Re-implementing that
// algorithm here to "recover" true pairing would duplicate normative logic this tool has no
// authority over and no way to keep in sync -- exactly what the task instructions forbid. What
// this module does instead is a narrow, honestly-scoped heuristic that never claims more than it
// can prove without that algorithm: on a single physical line, if quote-attributed review changes
// contain *exactly one* opening-shaped mark and *exactly one* closing-shaped mark of the matching
// bracket family, they are linked as a pair. Any other shape on that line (zero of one side, two
// or more of either, mixed families) is left `unknown` -- not guessed.
import type { ReviewChange } from "./diff.js";
import type { ReviewChangeAttribution } from "./attribution.js";

export type QuotePairing =
  | { status: "paired"; role: "opening" | "closing"; pairedReviewChangeId: string }
  | { status: "unpaired" }
  | { status: "unknown" };

const OPENING_MARKS: ReadonlyMap<string, string> = new Map([
  ["“", "double-curly"],
  ["‘", "single-curly"],
  ["«", "guillemet"],
  ["‹", "guillemet-single"],
]);
const CLOSING_MARKS: ReadonlyMap<string, string> = new Map([
  ["”", "double-curly"],
  ["’", "single-curly"],
  ["»", "guillemet"],
  ["›", "guillemet-single"],
]);

function markRole(text: string): { role: "opening" | "closing"; family: string } | null {
  const chars = [...text];
  const openingFamilies = new Set(chars.filter((c) => OPENING_MARKS.has(c)).map((c) => OPENING_MARKS.get(c) as string));
  const closingFamilies = new Set(chars.filter((c) => CLOSING_MARKS.has(c)).map((c) => CLOSING_MARKS.get(c) as string));
  if (openingFamilies.size === 1 && closingFamilies.size === 0) return { role: "opening", family: [...openingFamilies][0] as string };
  if (closingFamilies.size === 1 && openingFamilies.size === 0) return { role: "closing", family: [...closingFamilies][0] as string };
  return null; // both, neither, or more than one family in the same change -- not safely classifiable
}

/** Computes `QuotePairing` for every `ReviewChange` in `reviewChanges` whose attribution
 * genuinely involves the `quotes` rule (`single-rule: quotes`, or a `multi-rule-composition`
 * that includes it) -- every other review change gets no entry (the caller should treat a
 * missing entry the same as `null`: quote pairing was never attempted because the rule was
 * never involved). */
export function computeQuotePairing(
  oldText: string,
  reviewChanges: readonly ReviewChange[],
  attribution: ReadonlyMap<string, ReviewChangeAttribution>,
): Map<string, QuotePairing> {
  const result = new Map<string, QuotePairing>();

  const isQuoteAttributed = (id: string): boolean => {
    const a = attribution.get(id);
    if (!a) return false;
    if (a.category === "single-rule") return a.singleRule === "quotes";
    if (a.category === "multi-rule-composition") return (a.composingRules ?? []).includes("quotes");
    return false;
  };

  const candidates = reviewChanges
    .filter((rc) => isQuoteAttributed(rc.id))
    .map((rc) => ({ rc, mark: markRole(rc.after) || markRole(rc.before) }))
    .filter((c): c is { rc: ReviewChange; mark: { role: "opening" | "closing"; family: string } } => c.mark !== null);

  if (candidates.length === 0) return result;

  const byLine = new Map<number, typeof candidates>();
  for (const c of candidates) {
    const line = c.rc.oldLineCol.start.line;
    const bucket = byLine.get(line) ?? [];
    bucket.push(c);
    byLine.set(line, bucket);
  }

  for (const bucket of byLine.values()) {
    const byFamily = new Map<string, typeof candidates>();
    for (const c of bucket) {
      const fam = byFamily.get(c.mark.family) ?? [];
      fam.push(c);
      byFamily.set(c.mark.family, fam);
    }
    for (const famBucket of byFamily.values()) {
      const openings = famBucket.filter((c) => c.mark.role === "opening");
      const closings = famBucket.filter((c) => c.mark.role === "closing");
      if (openings.length === 1 && closings.length === 1) {
        const o = openings[0] as (typeof famBucket)[number];
        const cl = closings[0] as (typeof famBucket)[number];
        result.set(o.rc.id, { status: "paired", role: "opening", pairedReviewChangeId: cl.rc.id });
        result.set(cl.rc.id, { status: "paired", role: "closing", pairedReviewChangeId: o.rc.id });
      } else if (openings.length + closings.length === 1) {
        for (const c of famBucket) result.set(c.rc.id, { status: "unpaired" });
      } else {
        for (const c of famBucket) result.set(c.rc.id, { status: "unknown" });
      }
    }
  }

  void oldText; // reserved: a future stricter heuristic may re-slice source text; not needed yet
  return result;
}
