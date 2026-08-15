/**
 * The three non-code-point values a rule can meet in the array it scans. **They live in the
 * engine, together, and must stay pairwise disjoint.**
 *
 * Disjointness is not tidiness. Each value answers a different question, and a rule that
 * cannot tell them apart answers the wrong one:
 *
 * - `NONE` — there is nothing at that index; the array ends here.
 * - `MARKER` — a span boundary whose skipped region has no line terminator. Per modes.md 3.3
 *   it is opaque content everywhere except `OPENISH`/`CLOSEISH`, where it is a member of both.
 *   It is explicitly **not** `NONE` and **not** `SPACELIKE`.
 * - `LINE_MARKER` — a span boundary whose skipped region contains a line terminator. A member
 *   of `BREAK` for every rule, everywhere, so a mode's output on hard-wrapped prose is
 *   identical to `text` mode's on the same characters (modes.md 3.2, 7.4).
 *
 * Two of these were previously equal by accident, in two different pairings, and both cost a
 * defect: rules whose `NONE` was `-1` could not distinguish "end of array" from an inline
 * boundary, and `quotes`/`apostrophe` moved their `NONE` to `-2` and collided with the line
 * marker instead. The collisions were invisible only because the two verdicts happened to
 * coincide in the branches those rules had — a coincidence, not a property.
 *
 * **A new sentinel goes here and nowhere else**, takes the next free negative integer, and is
 * classified in modes.md before any rule reads it.
 *
 * These are L1 values: the rules (L1) read them, the mode adapters (L2) write them. Defining
 * them here keeps the dependency pointing downward (ARCHITECTURE.md 2).
 */
export const MARKER = -1;
export const LINE_MARKER = -2;
export const NONE = -3;

/** True for either span boundary. `NONE` is deliberately not a marker: it is not in the array. */
export function isMarker(value: number): boolean {
  return value === MARKER || value === LINE_MARKER;
}
