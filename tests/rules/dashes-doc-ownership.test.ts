// Documentation-topology guard, spec 0.5.0 second correction pass.
//
// `dashes.md` must be structured so that ownership cannot be avoided by declaring a live section
// "historical". Only the real `## 8. History` section is non-normative; §1 through §7 are current
// and must never attribute G1-G5 evaluation, `dash.range` reads, range binding, or U+2060
// emission to `dashes` itself. A mention of `ranges` elsewhere in the same sentence does NOT
// excuse a positive ownership claim — "dashes emits U+2060; see ranges" is still wrong, only an
// explicit negation ("dashes emits no U+2060") is a correct, allowed statement.
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it, expect, afterEach } from "vitest";

const DASHES_MD = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "spec",
  "rules",
  "dashes.md",
);

function readDashesMd(): string {
  return readFileSync(DASHES_MD, "utf8");
}

interface Section {
  label: string;
  title: string;
  body: string;
}

/** Split into top-level `## N. Title` sections (body runs to the next `## ` heading or EOF). */
function topLevelSections(source: string): Section[] {
  const sections: Section[] = [];
  const re = /^## (\d+)\. (.+)$/gm;
  const matches = [...source.matchAll(re)];
  for (let i = 0; i < matches.length; i += 1) {
    const m = matches[i] as RegExpMatchArray;
    const label = m[1] as string;
    const title = m[2] as string;
    const start = (m.index as number) + m[0].length;
    const end = i + 1 < matches.length ? (matches[i + 1] as RegExpMatchArray).index : source.length;
    sections.push({ label, title, body: source.slice(start, end) });
  }
  return sections;
}

const SUBJECT_PATTERN = /\bdashes\b|\bthis rule\b/i;
// JOINER itself is a topic term, not only its code point U+2060 — a claim can name the class
// ("JOINER is in this rule's own emission alphabet") without the literal escape appearing
// anywhere in the same sentence.
const TOPIC_PATTERN = /\bG[1-5]\b|dash\.range|U\+2060|\bJOINER\b|\bbinds?\b|\bbinding\b/i;
const OWNERSHIP_VERB_PATTERN =
  /\b(reads?|emits?|evaluates?|owns?|binds?|performs?|checks?|consults?|processes?|is in|belongs? to|is part of)\b/i;
const NEGATION_PATTERN =
  /\b(no|not|never|cannot|can't|doesn't|does not|no longer|nothing|none)\b/i;

/**
 * Find sentences in `text` that positively attribute a range-owned behaviour (G1-G5, dash.range,
 * U+2060, binding) to `dashes`/"this rule", without a negation cue anywhere in the sentence. A
 * bare mention of "ranges" does not suppress a match — only an explicit negation does.
 */
function findOwnershipClaims(text: string): string[] {
  // Split on sentence-ending punctuation, semicolons, newlines, and table-cell pipes — a claim
  // about `dashes`' current behaviour is always readable within one clause, never legitimately
  // spanning a markdown table-row, paragraph, or independent-clause boundary. Without the
  // semicolon split, "`ranges` emits `JOINER`; `dashes` runs later" reads as one blob where
  // "dashes" (the wrong subject, from the second clause) combines with "emits JOINER" (the wrong
  // verb, from the first) into a false positive.
  const sentences = text.split(/(?<=[.!?])\s+|\n|\||;/);
  const offenders: string[] = [];
  for (const sentence of sentences) {
    if (!SUBJECT_PATTERN.test(sentence)) continue;
    if (!TOPIC_PATTERN.test(sentence)) continue;
    if (!OWNERSHIP_VERB_PATTERN.test(sentence)) continue;
    if (NEGATION_PATTERN.test(sentence)) continue;
    offenders.push(sentence.trim().slice(0, 220));
  }
  return offenders;
}

describe("dashes.md documentation topology", () => {
  it("has exactly one '## 8. History' heading", () => {
    const source = readDashesMd();
    const matches = [...source.matchAll(/^## 8\. History\b/gm)];
    expect(matches.length).toBe(1);
  });

  it("the header's '§8 History' reference resolves to a real heading", () => {
    const source = readDashesMd();
    const headerBlock = source.slice(0, source.indexOf("\n## 1. "));
    expect(headerBlock).toMatch(/§8 History/);
    expect(source).toMatch(/^## 8\. History\b/m);
  });

  it("§5 exists, is not labelled historical, and states the current idempotency conclusion", () => {
    const sections = topLevelSections(readDashesMd());
    const five = sections.find((s) => s.label === "5");
    expect(five, "§5 must exist").toBeTruthy();
    expect(five!.title).toMatch(/Idempotency argument/i);
    expect(five!.body).not.toMatch(/HISTORICAL/);
    expect(five!.body).not.toMatch(/read this section as an account of the combined rule/i);
    // the current conclusion: T(T(x)) = T(x)
    expect(five!.body).toMatch(/T\(T\(x\)\)\s*=\s*T\(x\)/);
  });

  it("§7 exists and is not globally labelled historical", () => {
    const sections = topLevelSections(readDashesMd());
    const seven = sections.find((s) => s.label === "7");
    expect(seven, "§7 must exist").toBeTruthy();
    expect(seven!.title).toMatch(/Open questions/i);
    // a global historical framing note used to open this section pre-restructure; must be gone
    expect(seven!.body).not.toMatch(/were written when this document's own §3\.3 owned range/i);
    expect(seven!.body.slice(0, 400)).not.toMatch(/\bHISTORICAL\b/);
  });

  it("§1 through §7 never positively attribute G1-G5/dash.range/binding/U+2060 to dashes, and a bare 'ranges' mention does not suppress a real violation", () => {
    const sections = topLevelSections(readDashesMd());
    const current = sections.filter((s) => Number(s.label) <= 7);
    expect(current.map((s) => s.label).sort()).toEqual(["1", "2", "3", "4", "5", "6", "7"]);

    const offenders: string[] = [];
    for (const section of current) {
      for (const claim of findOwnershipClaims(section.body)) {
        offenders.push(`§${section.label}: ${claim}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("explicit negative ownership statements are correctly allowed through (sanity check on the detector itself)", () => {
    const positive = "`dashes` emits U+2060 around a tight range.";
    const negative = "`dashes` emits no U+2060; `ranges` owns binding.";
    const negativeWithBareMention =
      "`dashes` emits U+2060; see ranges.md for the current owner.";

    expect(findOwnershipClaims(positive)).not.toEqual([]);
    expect(findOwnershipClaims(negative)).toEqual([]);
    // a bare mention of "ranges" must NOT suppress a genuine positive claim
    expect(findOwnershipClaims(negativeWithBareMention)).not.toEqual([]);
  });

  it("catches 'JOINER is in this rule's own emission alphabet' even when U+2060 occurs only in an unrelated sentence", () => {
    // spec 0.5.0 third correction pass: the exact false sentence §3.2b used to carry, plus a
    // second sentence in the same paragraph that mentions U+2060 but attributes it correctly —
    // the detector must flag the first sentence on its own, not rely on the U+2060 escape being
    // present in the same sentence, and must not be satisfied merely because a later, correct
    // sentence exists nearby.
    const falseClaim =
      "`JOINER` is in this rule's own emission alphabet. Elsewhere, `ranges` emits no U+2060 unless a range binds.";

    const offenders = findOwnershipClaims(falseClaim);
    expect(offenders.length).toBeGreaterThan(0);
    expect(offenders[0]).toMatch(/JOINER.*is in this rule's own emission alphabet/);

    // the correct, current replacement sentence must not be flagged
    const correctClaim =
      "`ranges` (order 25) emits `JOINER`; `dashes` (order 30) runs later and must read through it correctly.";
    expect(findOwnershipClaims(correctClaim)).toEqual([]);
  });
});

// spec 0.5.0 second correction pass, factual fix: §3.6 used to claim "this rule emits no
// non-space code point at all" / "the one non-space code point it emitted was U+2060" — both
// false, since `dashes` necessarily emits U+2013 or U+2014 (the target dash glyph itself) on
// every conversion. Neither false formulation used the present-tense "emits" verb the generic
// ownership-claim detector above looks for ("emitted" is past tense), so that detector could not
// have caught this class of bug — a dedicated regression check is needed.
const FALSE_EMISSION_FORMULATIONS = [
  /emits? no non-space code point/i,
  /(?:the )?one non-space code point (?:it|this rule) emitted was U\+2060/i,
];

function findFalseEmissionClaims(text: string): string[] {
  const offenders: string[] = [];
  for (const pattern of FALSE_EMISSION_FORMULATIONS) {
    const m = pattern.exec(text);
    if (m) offenders.push(m[0]);
  }
  return offenders;
}

describe("dashes.md documentation topology: emission-alphabet consistency (§3.6 vs §5.3/§5.4)", () => {
  it("§1 through §7 never claim dashes emits no non-space code point, or that U+2060 was its one non-space emission", () => {
    const sections = topLevelSections(readDashesMd());
    const current = sections.filter((s) => Number(s.label) <= 7);

    const offenders: string[] = [];
    for (const section of current) {
      for (const claim of findFalseEmissionClaims(section.body)) {
        offenders.push(`§${section.label}: ${claim}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("§3.6 states the correct current emission alphabet: U+2013/U+2014, optionally U+0020, never U+2060", () => {
    const source = readDashesMd();
    const start = source.indexOf("### 3.6 No-break spaces");
    expect(start).toBeGreaterThan(-1);
    const end = source.indexOf("\n---\n", start);
    const body = source.slice(start, end === -1 ? undefined : end);

    expect(body).toMatch(/exactly U\+2013\s+or U\+2014/);
    expect(body).toMatch(/emits no U\+2060/);
    expect(findFalseEmissionClaims(body)).toEqual([]);
  });

  it("§3.6's emission-alphabet statement agrees with §5.3 and §5.4 (no contradiction across sections)", () => {
    const sections = topLevelSections(readDashesMd());
    const five = sections.find((s) => s.label === "5")!;
    // §5.3: "`dashes` emits only U+2013 or U+2014, plus zero or one U+0020 ... — never U+2060."
    expect(five.body).toMatch(/emits only U\+2013 or U\+2014.*never U\+2060/s);
    // §5.4: "What this rule emits. U+2013 or U+2014 ... It never emits a no-break space, a
    // letter, a digit, a full stop, or U+2060."
    expect(five.body).toMatch(/What this rule emits\.\*\* U\+2013 or U\+2014/);
    expect(five.body).toMatch(/It never emits a no-break\s*\n?space, a letter, a digit, a full stop, or U\+2060/);
  });

  it("negative control (in-memory only): reintroducing either false formulation is caught", () => {
    const source = readDashesMd();
    const anchor = "**This rule's current emission alphabet is exactly U+2013";
    expect(source).toContain(anchor);

    const reintroducedA = source.replace(
      anchor,
      "**As of spec 0.5.0, this rule emits no non-space code point at all.** ORIGINAL: " + anchor,
    );
    expect(reintroducedA).not.toBe(source);
    expect(findFalseEmissionClaims(reintroducedA)).not.toEqual([]);

    const reintroducedB = source.replace(
      anchor,
      "Through spec 0.4.1, the one non-space code point it emitted was U+2060. ORIGINAL: " + anchor,
    );
    expect(reintroducedB).not.toBe(source);
    expect(findFalseEmissionClaims(reintroducedB)).not.toEqual([]);

    // sanity: the correct current statement itself must never be flagged
    expect(findFalseEmissionClaims(source)).toEqual([]);
  });
});

describe("dashes.md documentation topology: negative controls", () => {
  const originalSource = readDashesMd();

  afterEach(() => {
    const current = readDashesMd();
    if (current !== originalSource) {
      throw new Error(
        "dashes.md was left modified after a negative-control test — this indicates a bug in " +
          "the test's own restore step, not a real doc defect. Restore from git and re-run.",
      );
    }
  });

  it("fails when a false current ownership claim is inserted into §5", () => {
    const sections = topLevelSections(originalSource);
    const five = sections.find((s) => s.label === "5");
    expect(five).toBeTruthy();
    const anchor = "### 5.3 Interaction with `ranges` is stable";
    expect(five!.body).toContain(anchor);

    const injected = originalSource.replace(
      anchor,
      `${anchor}\n\n\`dashes\` emits U+2060 around a tight range.\n`,
    );
    expect(injected).not.toBe(originalSource);

    const injectedSections = topLevelSections(injected);
    const injectedFive = injectedSections.find((s) => s.label === "5")!;
    const offenders = findOwnershipClaims(injectedFive.body);
    expect(offenders.length).toBeGreaterThan(0);
    expect(offenders[0]).toMatch(/emits U\+2060/);
  });

  it("fails the structural assertion when §5 is re-marked historical", () => {
    const sections = topLevelSections(originalSource);
    const five = sections.find((s) => s.label === "5");
    expect(five).toBeTruthy();

    const remarked = originalSource.replace(
      "## 5. Idempotency argument\n\nWrite `T` for `dashes`.",
      "## 5. Idempotency argument\n\n**HISTORICAL, pre-0.5.0.** Write `T` for `dashes`.",
    );
    expect(remarked).not.toBe(originalSource);

    const remarkedSections = topLevelSections(remarked);
    const remarkedFive = remarkedSections.find((s) => s.label === "5")!;
    expect(remarkedFive.body).toMatch(/HISTORICAL/);
  });

  it("fails when §3.2b's own-emission-alphabet sentence is reintroduced (in-memory only, no on-disk mutation)", () => {
    // spec 0.5.0 third correction pass. The exact sentence the current §3.2b used to carry,
    // before it was corrected to attribute JOINER emission to `ranges`:
    const falseSentence = "`JOINER` is in this rule's own emission alphabet.";

    const sections = topLevelSections(originalSource);
    const three = sections.find((s) => s.label === "3");
    expect(three).toBeTruthy();
    const anchor = "**Why this is forced rather than chosen.**";
    expect(three!.body).toContain(anchor);
    expect(three!.body).not.toContain(falseSentence);

    const injected = originalSource.replace(anchor, `${anchor} ${falseSentence}`);
    expect(injected).not.toBe(originalSource);

    const injectedSections = topLevelSections(injected);
    const injectedThree = injectedSections.find((s) => s.label === "3")!;
    const offenders = findOwnershipClaims(injectedThree.body);
    expect(offenders.length).toBeGreaterThan(0);
    expect(offenders.some((o) => o.includes("own emission alphabet"))).toBe(true);

    // the real, on-disk file must be provably unaffected by this in-memory check
    expect(readDashesMd()).toBe(originalSource);
  });
});
