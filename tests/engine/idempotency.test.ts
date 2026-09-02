import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import fc from "fast-check";
import { describe, it, expect } from "vitest";
import { transform } from "../../src/index";
import { LOCALES } from "../../src/generated/locales";
import { RULE_ORDER } from "../../src/rules/registry";
import type { Options, RuleId } from "../../src/types";

// PLAN.md 3.4: transform(transform(x)) === transform(x) is a release blocker, not a bug report.
// It is also the claim most easily faked by a weak generator: uniform random strings over the
// whole of Unicode almost never produce two adjacent quote marks, which is the shape that
// actually breaks the pipeline. So the alphabet below is deliberately biased towards the
// characters the rules compete over, and the sweep further down enumerates instead of sampling.

const locales = Object.keys(LOCALES);
const hasLocales = locales.length > 0;

/** The characters every rule reads: quote marks, strokes, spacing, digits, brackets, stops. */
const HOT_ALPHABET = [
  '"',
  "'",
  "“",
  "”",
  "‘",
  "’",
  "„",
  "‚",
  "«",
  "»",
  "‹",
  "›",
  "-",
  "‐",
  "‑",
  "–",
  "—",
  " ",
  " ",
  " ",
  "\n",
  ".",
  ",",
  ":",
  ";",
  "!",
  "?",
  "…",
  "(",
  ")",
  "[",
  "]",
  "0",
  "1",
  "9",
  "a",
  "B",
  "x",
  "é",
  "и",
  "%",
  "§",
  "№",
  "km",
  // Greek. "σ" is the letter that carries elision (σ' αυτό), so it exercises the
  // apostrophe/quotes boundary. The last three are the pair spaces.md 3.5 turns on: a Greek
  // question mark and an ano teleia are U+003B and U+00B7 (already above and here), while
  // U+037E and U+0387 are the compatibility spellings that must round-trip untouched.
  "σ",
  ";",
  "·",
  "·",
];

function assertIdempotent(input: string, locale: string): void {
  const once = transform(input, { locale });
  const twice = transform(once, { locale });
  expect(twice, `not idempotent for locale ${locale}, input ${JSON.stringify(input)}`).toBe(once);
}

describe.skipIf(!hasLocales)("idempotency property", () => {
  it("holds over a biased alphabet, in every locale", () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...locales),
        fc.string({ unit: fc.constantFrom(...HOT_ALPHABET), maxLength: 24 }),
        (locale, input) => {
          assertIdempotent(input, locale);
        },
      ),
      { numRuns: 20_000 },
    );
  });

  it("holds over arbitrary Unicode, in every locale", () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...locales),
        fc.string({ unit: "binary", maxLength: 200 }),
        (locale, input) => {
          assertIdempotent(input, locale);
        },
      ),
      { numRuns: 5_000 },
    );
  });

  const allRulesOff = Object.fromEntries(RULE_ORDER.map((id) => [id, false])) as Record<
    RuleId,
    boolean
  >;

  it("with every rule disabled, output is byte-identical to input", () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...locales),
        fc.string({ unit: "binary", maxLength: 200 }),
        (locale, input) => {
          expect(transform(input, { locale, rules: allRulesOff })).toBe(input);
        },
      ),
      { numRuns: 2_000 },
    );
  });
});

/**
 * Enumeration, not sampling: every string up to length 4 over the alphabet the rules fight
 * over, in every locale; a defect that exists at this size cannot
 * hide from it, which is the difference between a guarantee and a coincidence.
 */
describe.skipIf(!hasLocales)("bounded exhaustive idempotency sweep", () => {
  // Both the input characters and the ones the rules *produce*: a pass over its own output is
  // what idempotency actually asserts, so curly marks, guillemets and the dash forms belong in
  // the alphabet as much as the straight ones do.
  const SWEEP_ALPHABET = ['"', "'", "-", " ", ".", "1", "a", "\u00AB", "\u2013", "\u201D"];
  const MAX_LENGTH = 4;

  function* strings(maxLength: number): Generator<string> {
    let frontier = [""];
    yield "";
    for (let length = 1; length <= maxLength; length += 1) {
      const next: string[] = [];
      for (const prefix of frontier) {
        for (const char of SWEEP_ALPHABET) {
          const candidate = prefix + char;
          next.push(candidate);
          yield candidate;
        }
      }
      frontier = next;
    }
  }

  for (const locale of locales) {
    it(`every string up to ${MAX_LENGTH} characters is idempotent in ${locale}`, () => {
      const broken: string[] = [];
      for (const input of strings(MAX_LENGTH)) {
        const once = transform(input, { locale });
        if (transform(once, { locale }) !== once) {
          broken.push(JSON.stringify(input));
          if (broken.length >= 10) break;
        }
      }
      expect(broken, `first non-idempotent inputs in ${locale}`).toEqual([]);
    });
  }
});

/**
 * The mixed-kind sweep. The general sweep above uses a ten-character alphabet at length 4,
 * which cannot reach the shape that broke `quotes`: a straight mark of one kind stranded
 * inside a span quoted with the other kind (`"a 'b" c'`, `"σ' αυτό"`). That defect —
 * quotes.md 5.5 — was damage rather than a miss, and the first repair attempted for it was
 * itself non-idempotent, so the class needs a sweep of its own rather than trust.
 *
 * Narrow alphabet, greater depth: every string over {" ' a SPACE .} up to length 6, in every
 * locale. This enumeration fails on the rejected single-stack-with-kind-guard repair (witness
 * `"'".'`) and passes on the per-kind stacks that shipped, so it discriminates rather than
 * merely passing.
 */
describe.skipIf(!hasLocales)("mixed-kind straight marks are idempotent", () => {
  const ALPHABET = ['"', "'", "a", " ", "."];
  const MAX_LENGTH = 6;

  function* strings(): Generator<string> {
    let frontier = [""];
    yield "";
    for (let length = 1; length <= MAX_LENGTH; length += 1) {
      const next: string[] = [];
      for (const prefix of frontier) {
        for (const char of ALPHABET) {
          next.push(prefix + char);
          yield prefix + char;
        }
      }
      frontier = next;
    }
  }

  for (const locale of locales) {
    it(`every string up to ${MAX_LENGTH} characters over the mixed-kind alphabet is idempotent in ${locale}`, () => {
      const broken: string[] = [];
      for (const input of strings()) {
        const once = transform(input, { locale });
        if (transform(once, { locale }) !== once) {
          broken.push(JSON.stringify(input));
          if (broken.length >= 10) break;
        }
      }
      expect(broken, `first non-idempotent mixed-kind inputs in ${locale}`).toEqual([]);
    });
  }
});

/**
 * The composition argument in spec/rules/pipeline-idempotency.md is made for the default rule
 * set, but `rules` is public API: 2^n configurations are reachable, and switching a rule off
 * exposes the rules after it to text the disabled one would have normalised (no `spaces` means
 * a later rule meets double spaces; no `dashes` means `nbsp` meets hyphens where the dash forms
 * were promised). This enumerates the configuration space rather than the string space, which
 * the sweep above already covers at the default configuration.
 *
 * Rule ids come from the spec, so a ninth rule joins the sweep without anyone remembering to.
 */
describe.skipIf(!hasLocales)("idempotency across every rule subset", () => {
  const specPath = fileURLToPath(new URL("../../spec/rules/order.json", import.meta.url));
  const spec = JSON.parse(readFileSync(specPath, "utf8")) as {
    rules: Array<{ id: RuleId; order: number }>;
  };
  const ids = [...spec.rules].sort((a, b) => a.order - b.order).map((rule) => rule.id);

  const SUBSET_ALPHABET = ['"', "'", "-", " ", ".", "1", "\u00AB", "\u2013"];
  const MAX_LENGTH = 3;

  function* subsetStrings(): Generator<string> {
    let frontier = [""];
    yield "";
    for (let length = 1; length <= MAX_LENGTH; length += 1) {
      const next: string[] = [];
      for (const prefix of frontier) {
        for (const char of SUBSET_ALPHABET) {
          next.push(prefix + char);
          yield prefix + char;
        }
      }
      frontier = next;
    }
  }

  /** Every subset of the rule set, as the opt-out map the public API takes. */
  function* subsets(): Generator<{ label: string; rules: Partial<Record<RuleId, boolean>> }> {
    for (let mask = 0; mask < 1 << ids.length; mask += 1) {
      const rules: Partial<Record<RuleId, boolean>> = {};
      const off: RuleId[] = [];
      ids.forEach((id, index) => {
        if (mask & (1 << index)) {
          rules[id] = false;
          off.push(id);
        }
      });
      yield { label: off.length === 0 ? "(default set)" : `off: ${off.join(", ")}`, rules };
    }
  }

  for (const locale of locales) {
    it(`holds for all ${1 << ids.length} rule subsets in ${locale}`, () => {
      const failures: Array<{ label: string; input: string }> = [];
      for (const { label, rules } of subsets()) {
        for (const input of subsetStrings()) {
          const once = transform(input, { locale, rules });
          if (transform(once, { locale, rules }) !== once) {
            failures.push({ label, input });
          }
        }
      }

      // Shortest witness per input, with the subsets that exhibit it — the same shape of
      // report the earlier rounds used, so a failure is actionable without a rerun.
      const families = new Map<string, string[]>();
      for (const failure of failures) {
        const key = JSON.stringify(failure.input);
        families.set(key, [...(families.get(key) ?? []), failure.label]);
      }
      const report = [...families.entries()]
        .sort(([a], [b]) => a.length - b.length || (a < b ? -1 : 1))
        .slice(0, 10)
        .map(([input, labels]) => `${input} in ${labels.length} subset(s), e.g. ${labels[0]}`);

      expect(report, `non-idempotent (subset, input) in ${locale}`).toEqual([]);
    });
  }
});

/**
 * The sweeps above never produce a span boundary, and the mode sweep in tests/modes never
 * produces a boundary whose skipped region contains a line terminator — so neither exercises
 * the `-2` line marker, which modes.md 3.2 classifies as `BREAK` for every rule. The templates
 * below put a line terminator inside the skipped region on purpose: an HTML comment written
 * across two lines, and a Markdown paragraph break.
 */
describe.skipIf(!hasLocales)("idempotency across line-boundary markers", () => {
  const CONFIGS: ReadonlyArray<{ label: string; options: (locale: string) => Options }> = [
    { label: "html", options: (locale) => ({ locale, mode: "html" }) },
    {
      label: "markdown/commonmark",
      options: (locale) => ({ locale, mode: "markdown", dialect: "commonmark" }),
    },
    { label: "markdown/mdx", options: (locale) => ({ locale, mode: "markdown", dialect: "mdx" }) },
  ];

  /** A gap containing a line terminator, which is what makes the marker `-2` rather than `-1`. */
  const TEMPLATES: Record<string, (a: string, b: string) => string> = {
    html: (a, b) => `${a}<!--\n-->${b}`,
    "markdown/commonmark": (a, b) => `${a}\n\n${b}`,
    "markdown/mdx": (a, b) => `${a}\n\n${b}`,
  };

  const LINE_ALPHABET = [" ", '"', "-", ".", "a", "1"];
  const SIDE_LENGTH = 2;

  function sides(): string[] {
    const out = [""];
    let frontier = [""];
    for (let length = 1; length <= SIDE_LENGTH; length += 1) {
      const next: string[] = [];
      for (const prefix of frontier) {
        for (const char of LINE_ALPHABET) {
          next.push(prefix + char);
          out.push(prefix + char);
        }
      }
      frontier = next;
    }
    return out;
  }

  for (const config of CONFIGS) {
    it(`holds around a line boundary in ${config.label}`, () => {
      const build = TEMPLATES[config.label] as (a: string, b: string) => string;
      const broken: string[] = [];
      for (const locale of locales) {
        const options = config.options(locale);
        for (const left of sides()) {
          for (const right of sides()) {
            const input = build(left, right);
            const once = transform(input, options);
            if (transform(once, options) !== once) {
              broken.push(`${locale}: ${JSON.stringify(input)}`);
              if (broken.length >= 10) break;
            }
          }
        }
      }
      expect(broken, `non-idempotent around a -2 marker in ${config.label}`).toEqual([]);
    });
  }

  // modes.md 7.4: on the same characters a mode must agree with `text`. A run bordering a line
  // boundary is the case that used to diverge, because `-2` was in no rule's `BREAK`.
  it("classifies a line boundary as BREAK, matching text mode on the same characters", () => {
    for (const locale of locales) {
      const text = transform("a  \n  b", { locale });
      expect(transform("a  <!--\n-->  b", { locale, mode: "html" })).toBe(
        text.replace("\n", "<!--\n-->"),
      );
      expect(
        transform("a  \n\n  b", { locale, mode: "markdown", dialect: "commonmark" }),
      ).toContain("a  ");
    }
  });
});
