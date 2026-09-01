// Regression coverage for #pg-foot's status text (docs/AUDIT_REMEDIATION_AND_RELEASE_PLAN.md
// 6.1): summarizeChange/summarizeError are pure helpers factored out of brand/tools/promo/site.js
// specifically so this behaviour is testable without parsing generated page source.
import { describe, expect, it } from "vitest";
import { loadPolytypoSiteJs } from "./load-site-js.js";

const Polytypo = loadPolytypoSiteJs();

describe("brand/tools/promo/site.js — summarizeChange()", () => {
  it("reports 'unchanged' when text === out, regardless of segments", () => {
    const segments = Polytypo.diff([..."abc"], [..."abc"]);
    expect(Polytypo.summarizeChange("abc", "abc", segments)).toBe("unchanged");
  });

  it("reports a single highlighted output region in the singular", () => {
    const text = "abc";
    const out = "aXc";
    const segments = Polytypo.diff([...text], [...out]);
    expect(Polytypo.summarizeChange(text, out, segments)).toBe("1 highlighted output region");
  });

  it("reports multiple highlighted output regions in the plural", () => {
    const text = "a-b-c";
    const out = "aXbXc";
    const segments = Polytypo.diff([...text], [...out]);
    expect(Polytypo.summarizeChange(text, out, segments)).toBe("2 highlighted output regions");
  });

  it("reports a deletion-only change truthfully instead of '0 changed regions'", () => {
    // diff() represents only the OUTPUT side, so characters removed with nothing put in their
    // place produce zero changed segments even though text !== out — the exact case reported
    // against the previous "N changed regions" wording (input "Hello  , world !" -> "Hello, world!").
    const text = "Hello  , world !";
    const out = "Hello, world!";
    const segments = Polytypo.diff([...text], [...out]);
    expect(segments.filter(([changed]) => changed).length).toBe(0); // sanity: the bug precondition
    expect(Polytypo.summarizeChange(text, out, segments)).toBe("changed by removals only");
  });
});

describe("brand/tools/promo/site.js — summarizeError()", () => {
  it("puts the machine-readable code before the concise, human-readable explanation", () => {
    expect(Polytypo.summarizeError("POLYTYPO_MALFORMED_INPUT")).toBe(
      "POLYTYPO_MALFORMED_INPUT · transformation failed; details in Output",
    );
  });

  it("works the same way for a synthetic (non-PolytypoError) failure code", () => {
    expect(Polytypo.summarizeError("PolytypoEngineMissing")).toBe(
      "PolytypoEngineMissing · transformation failed; details in Output",
    );
  });
});
