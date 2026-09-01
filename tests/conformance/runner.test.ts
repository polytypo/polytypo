// The conformance runner (docs/ARCHITECTURE.md section 6). Every case in spec/fixtures/ is
// driven through the public `transform`, and every case is also an idempotency case.
// Nothing here knows about individual locales or rules: fixtures are discovered at test time.

import { describe, expect, it } from "vitest";
import { PolytypoError, transform } from "../../src/index";
import type { Options } from "../../src/types";
import {
  caseLabel,
  discoverFixtureFiles,
  escapeNonAscii,
  loadResolutionFile,
  type ConformanceCase,
} from "./fixtures";

const files = discoverFixtureFiles();
const totalCases = files.reduce((sum, f) => sum + f.cases.length, 0);

function optionsFor(locale: string, testCase: ConformanceCase): Options {
  const base: Options =
    testCase.dialect === undefined
      ? { locale, mode: testCase.mode }
      : { locale, mode: testCase.mode, dialect: testCase.dialect };
  return testCase.rules === undefined ? base : { ...base, rules: testCase.rules };
}

function assertThrowsCode(label: string, code: string, run: () => string): void {
  let produced: string;
  try {
    produced = run();
  } catch (error) {
    expect(error, `${label}: expected a PolytypoError`).toBeInstanceOf(PolytypoError);
    // Messages are English prose and are not part of the contract; codes are (section 4.6).
    expect((error as PolytypoError).code, label).toBe(code);
    return;
  }
  throw new Error(`${label}: expected ${code}, got "${escapeNonAscii(produced)}"`);
}

describe("conformance fixtures", () => {
  if (files.length === 0) {
    // eslint-disable-next-line no-console
    console.warn(
      "conformance: 0 fixture file(s) found in spec/fixtures/ — no locale case was executed. " +
        "The runner is wired up; the fixtures have not landed yet.",
    );
    it.skip("spec/fixtures/*.json — 0 fixture file(s) found, nothing to run", () => {
      throw new Error("unreachable");
    });
  }

  for (const file of files) {
    describe(`${file.name} (${file.cases.length} case(s), spec ${file.spec})`, () => {
      it("file name stem matches the declared locale", () => {
        expect(`${file.locale}.json`).toBe(file.name);
      });

      for (const testCase of file.cases) {
        const label = caseLabel(file.name, file.locale, testCase.id);
        const options = optionsFor(file.locale, testCase);

        if (testCase.throws !== undefined) {
          it(`${testCase.id} [${testCase.rule}] throws ${testCase.throws}`, () => {
            assertThrowsCode(label, testCase.throws as string, () =>
              transform(testCase.in, options),
            );
          });
          continue;
        }

        const expected = testCase.out as string;

        it(`${testCase.id} [${testCase.rule}]`, () => {
          expect(escapeNonAscii(transform(testCase.in, options)), `${label}: in → out`).toBe(
            escapeNonAscii(expected),
          );
        });

        // Free coverage, and the most common port bug (section 6.1).
        it(`${testCase.id} [${testCase.rule}] is idempotent`, () => {
          expect(
            escapeNonAscii(transform(expected, options)),
            `${label}: transform(out) must equal out`,
          ).toBe(escapeNonAscii(expected));
        });
      }
    });
  }
});

// ---- locale resolution -----------------------------------------------------
// spec/rules/locale-resolution.md. Driven through the public API: `transform` never returns
// the resolved locale, so a tag is asserted to behave exactly like its canonical locale.

const resolution = loadResolutionFile();

const PROBES: readonly string[] = [
  'He said "so" -- and left...',
  "Pages 1999-2005, see  p. 7 .",
  "Really?.. 50 % (c) 2026",
];

describe("locale resolution fixtures", () => {
  if (resolution === null) {
    // eslint-disable-next-line no-console
    console.warn("conformance: spec/fixtures/locale-resolution.json not found — 0 case(s) run.");
    it.skip("spec/fixtures/locale-resolution.json — file not found", () => {
      throw new Error("unreachable");
    });
  }

  for (const testCase of resolution?.cases ?? []) {
    const label = caseLabel("locale-resolution.json", testCase.tag, testCase.id);

    if (testCase.throws !== undefined) {
      it(`${testCase.id}: ${JSON.stringify(testCase.tag)} throws ${testCase.throws}`, () => {
        assertThrowsCode(label, testCase.throws as string, () =>
          transform("plain text", { locale: testCase.tag }),
        );
      });
      continue;
    }

    const resolved = testCase.resolves as string;

    it(`${testCase.id}: ${JSON.stringify(testCase.tag)} resolves to ${resolved}`, () => {
      for (const probe of PROBES) {
        const viaTag = transform(probe, { locale: testCase.tag });
        const viaCanonical = transform(probe, { locale: resolved });
        expect(escapeNonAscii(viaTag), `${label}: must behave as locale "${resolved}"`).toBe(
          escapeNonAscii(viaCanonical),
        );
      }
    });
  }
});

describe("conformance runner", () => {
  it("reports how much of the suite it actually ran", () => {
    // eslint-disable-next-line no-console
    console.log(
      `conformance: ${files.length} fixture file(s), ${totalCases} locale case(s), ` +
        `${resolution?.cases.length ?? 0} resolution case(s).`,
    );
    expect(totalCases).toBeGreaterThanOrEqual(0);
  });
});
