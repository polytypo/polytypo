// Automated guards over spec/fixtures/*.json, added in the spec 0.5.0 correction passes:
//
// 1. No canonical fixture id or note may declare its asserted `out` a known-incorrect output
//    ("known-wrong", "PINNED AS KNOWN", etc.) — canonical fixtures specify correct portable
//    behaviour; a documented semantic limitation belongs in a focused implementation test
//    (tests/rules/*.test.ts), not a canonical conformance fixture. There is no allowlist: a
//    fixture that once shipped an incorrect `out` and was fixed must describe that history
//    without using either forbidden phrase (see en-us-quotes-elision-inside-quotation for the
//    pattern — "a previous implementation defect", not "known-wrong").
//
// 2. Every `rule: "ranges"` fixture's note must cite `ranges.md` — the current normative owner
//    of range-detection behaviour — and must not rely solely on a retired `dashes.md` range
//    section (§3.3, §3.3.1, §6 range rows) without also citing `ranges.md`.
//
// 3. Ownership, not just prose (second correction pass). `dashes` unconditionally declines every
//    digit-flanked token (dashes.md §1, §3.3) — it does not evaluate G1-G5, `dash.range`, or
//    range binding. A fixture tagged `rule: "dashes"` whose note attributes its result to any of
//    those is vacuous: a port with no range algorithm at all would still pass it.
//    - Every `rule: "ranges"` fixture must explicitly set `rules: { ranges: true }` — `ranges`
//      defaults off, so a case without the opt-in is not exercising the rule it claims to.
//    - No `rule: "dashes"` fixture's note may attribute its result to G1-G5 or `dash.range`,
//      except the four reviewed compound-label-safe-default cases, which exist specifically to
//      prove `dashes`' unconditional decline of digit-flanked input, not any range guard.
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it, expect } from "vitest";

const FIXTURES_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "spec",
  "fixtures",
);

interface FixtureCase {
  readonly id: string;
  readonly rule?: string;
  readonly note?: string;
  readonly rules?: Readonly<Record<string, unknown>>;
}

function loadFixtureFiles(): { name: string; cases: FixtureCase[] }[] {
  return readdirSync(FIXTURES_DIR, { withFileTypes: true })
    .filter((e) => e.isFile() && e.name.endsWith(".json") && e.name !== "locale-resolution.json")
    .map((e) => e.name)
    .sort()
    .map((name) => {
      const data = JSON.parse(readFileSync(path.join(FIXTURES_DIR, name), "utf8")) as {
        cases: FixtureCase[];
      };
      return { name, cases: data.cases };
    });
}

const KNOWN_WRONG_PATTERNS = [/known-wrong/i, /pinned as known/i];

describe("fixture-citation-guard: canonical fixtures never assert a known-incorrect output", () => {
  for (const { name, cases } of loadFixtureFiles()) {
    it(`${name}: no case id or note declares a known-incorrect \`out\` as successful`, () => {
      const offenders: string[] = [];
      for (const c of cases) {
        const haystack = `${c.id} ${c.note ?? ""}`;
        for (const pattern of KNOWN_WRONG_PATTERNS) {
          if (pattern.test(haystack)) {
            offenders.push(`${c.id} (matched ${pattern})`);
            break;
          }
        }
      }
      expect(offenders).toEqual([]);
    });
  }
});

describe("fixture-citation-guard: every rule:\"ranges\" fixture cites the current ranges.md owner", () => {
  const RETIRED_DASHES_RANGE_SECTIONS = [
    /dashes\.md §3\.3(?!\.\d)(?!'s split)/, // §3.3 itself (not §3.3x subsections named elsewhere)
    /dashes\.md §3\.3\.1/,
    /dashes\.md §6 case/,
  ];

  for (const { name, cases } of loadFixtureFiles()) {
    const rangesCases = cases.filter((c) => c.rule === "ranges");
    if (rangesCases.length === 0) continue;

    it(`${name}: every rule:"ranges" case note cites ranges.md`, () => {
      const missing = rangesCases.filter((c) => !(c.note ?? "").includes("ranges.md")).map((c) => c.id);
      expect(missing).toEqual([]);
    });

    it(`${name}: no rule:"ranges" case note relies solely on a retired dashes.md range section`, () => {
      const offenders: string[] = [];
      for (const c of rangesCases) {
        const note = c.note ?? "";
        const citesRetiredDashesSection = RETIRED_DASHES_RANGE_SECTIONS.some((p) => p.test(note));
        const citesRangesMd = note.includes("ranges.md");
        if (citesRetiredDashesSection && !citesRangesMd) offenders.push(c.id);
      }
      expect(offenders).toEqual([]);
    });
  }
});

describe("fixture-citation-guard: rule:\"ranges\" ownership is real, not a stale tag", () => {
  for (const { name, cases } of loadFixtureFiles()) {
    const rangesCases = cases.filter((c) => c.rule === "ranges");
    if (rangesCases.length === 0) continue;

    it(`${name}: every rule:"ranges" case explicitly sets rules.ranges === true`, () => {
      const offenders = rangesCases
        .filter((c) => !(c.rules && c.rules.ranges === true))
        .map((c) => c.id);
      expect(offenders).toEqual([]);
    });
  }
});

describe('fixture-citation-guard: rule:"dashes" fixtures never claim G1-G5 or dash.range decided their result', () => {
  // The unconditional-decline proof for digit-flanked input: `dashes` never evaluates a range
  // guard for these, by construction (dashes.md §1, §3.3), so their notes are allowed to name
  // `range`/`dash.range` while explaining that `dashes` does not consult it. Reviewed exception,
  // not a general allowlist — see the module comment.
  const COMPOUND_LABEL_SAFE_DEFAULT_EXCEPTION: ReadonlySet<string> = new Set([
    "en-us-dashes-range-compound-label-safe-default",
    "en-gb-dashes-range-compound-label-safe-default",
    "sv-dashes-range-compound-label-safe-default",
    "fi-dashes-range-compound-label-safe-default",
  ]);

  // Decision-attribution shapes only — phrasing that says a guard evaluated and produced a
  // verdict for THIS token. Deliberately narrower than a bare "G1"/"dash.range" mention, so a
  // note that disclaims range-guard involvement (e.g. "not because any range guard evaluated
  // it") is not a false positive; only an affirmative claim trips it.
  const OWNERSHIP_CLAIM_PATTERNS = [
    /\bG[1-5]\b\s*(rejects?|fails?|admits?|,\s*chain)/i,
    /rejected by G[1-5]\b/i,
    /\bG[1-5]\b\s+(passes?|rejected|admitted)/i,
    /dash\.range["']?\s*(is|:)\s*["']?(em|en)-(tight|spaced|none)/i,
    /this rule (reads|owns|evaluates)[^.]{0,40}dash\.range/i,
  ];

  for (const { name, cases } of loadFixtureFiles()) {
    const dashesCases = cases.filter((c) => c.rule === "dashes");
    if (dashesCases.length === 0) continue;

    it(`${name}: no rule:"dashes" case note attributes its result to a range guard, outside the reviewed exception`, () => {
      const offenders: string[] = [];
      for (const c of dashesCases) {
        if (COMPOUND_LABEL_SAFE_DEFAULT_EXCEPTION.has(c.id)) continue;
        const note = c.note ?? "";
        for (const pattern of OWNERSHIP_CLAIM_PATTERNS) {
          if (pattern.test(note)) {
            offenders.push(`${c.id} (matched ${pattern})`);
            break;
          }
        }
      }
      expect(offenders).toEqual([]);
    });
  }
});
