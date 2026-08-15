import { PolytypoError } from "../errors.js";
import type { Edit, RuleId } from "../types.js";
import { isValidCodePoint } from "./codepoints.js";

function reject(message: string): never {
  throw new PolytypoError("POLYTYPO_RULE_CONTRACT", message);
}

/**
 * Rules are community-contributed, so the contract is enforced rather than trusted: edits must
 * be in bounds, ascending, non-overlapping, and made of real code points.
 */
export function validateEdits(edits: readonly Edit[], length: number, ruleId?: RuleId): void {
  let previousEnd = 0;
  let i = -1;
  for (const edit of edits) {
    i += 1;
    const where = ruleId === undefined ? `edit ${i}` : `rule "${ruleId}" edit ${i}`;

    if (!Number.isInteger(edit.start) || !Number.isInteger(edit.end)) {
      reject(`${where} has non-integer bounds (${edit.start}, ${edit.end})`);
    }
    if (edit.start < 0 || edit.end > length) {
      reject(`${where} is out of bounds (${edit.start}, ${edit.end}) for length ${length}`);
    }
    if (edit.end < edit.start) {
      reject(`${where} has end ${edit.end} before start ${edit.start}`);
    }
    if (edit.start < previousEnd) {
      reject(`${where} starts at ${edit.start}, which overlaps or precedes the previous edit`);
    }
    if (ruleId !== undefined && edit.ruleId !== ruleId) {
      reject(`${where} is tagged "${edit.ruleId}" but was produced by rule "${ruleId}"`);
    }
    for (const value of edit.replacement) {
      if (!isValidCodePoint(value)) {
        reject(`${where} contains an invalid code point (${value})`);
      }
    }
    previousEnd = edit.end;
  }
}

/** Applies validated edits left to right, producing a new code-point array. */
export function applyEdits(
  cp: readonly number[],
  edits: readonly Edit[],
  ruleId?: RuleId,
): number[] {
  validateEdits(edits, cp.length, ruleId);
  if (edits.length === 0) return cp.slice();

  const out: number[] = [];
  let cursor = 0;
  for (const edit of edits) {
    for (const value of cp.slice(cursor, edit.start)) out.push(value);
    for (const value of edit.replacement) out.push(value);
    cursor = edit.end;
  }
  for (const value of cp.slice(cursor)) out.push(value);
  return out;
}
