// Source-level regression coverage for the narrow-viewport overflow fix (docs/AUDIT_REMEDIATION_
// AND_RELEASE_PLAN.md 6.1): a prose inline <code> element (e.g. `promo/vendor/polytypo.browser.js`
// inside a <p>) has no horizontal-scroll affordance of its own, unlike a <pre><code> block, so at
// narrow viewports a long identifier could push the whole document wider than the viewport. This
// asserts the CSS rule that fixes it is present and correctly scoped — it does not (and cannot,
// without a real layout engine) prove no overflow occurs; the authoritative check for that is a
// live browser measurement of scrollWidth <= clientWidth, not a source-text assertion.
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const css = readFileSync(path.join(ROOT, "brand/tools/promo/style.css"), "utf8");

/** Finds `selector { ...declarations... }` for an exact selector list, non-greedy on the body. */
function findRule(selector: string): string | undefined {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = css.match(new RegExp(`${escaped}\\s*\\{([^}]*)\\}`));
  return match?.[1];
}

describe("brand/tools/promo/style.css — prose inline <code> wraps, <pre><code> does not", () => {
  it("wraps prose inline code (not inside <pre>) at narrow widths", () => {
    const body = findRule(":not(pre) > code");
    expect(body).toBeDefined();
    expect(body).toMatch(/overflow-wrap:\s*anywhere/);
  });

  it("keeps <pre> as a horizontally-scrolling container, not a wrapping one", () => {
    const body = findRule("pre");
    expect(body).toBeDefined();
    expect(body).toMatch(/overflow-x:\s*auto/);
    expect(body).not.toMatch(/overflow-wrap/);
  });

  it("does not apply the inline-code wrap rule to pre code itself", () => {
    expect(css).not.toMatch(/pre\s+code\s*\{[^}]*overflow-wrap/);
    expect(css).not.toMatch(/pre\s*>\s*code\s*\{[^}]*overflow-wrap/);
  });
});
