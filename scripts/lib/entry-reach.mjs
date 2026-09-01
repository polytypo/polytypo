// Pure dependency-reach logic for scripts/check-entry-reach.mjs, factored out so
// tests/scripts/entry-reach.test.ts can exercise it against synthetic module-path lists without
// needing a real esbuild bundle or a real dist/ build for every scenario. Identity patterns match
// literal npm package directory names under node_modules, one per production dependency in
// package.json (AUDIT_REMEDIATION_AND_RELEASE_PLAN.md 5.1 review, item 4) — a combined
// `/micromark|mdxjs/` pattern is deliberately not used here, since it cannot say *which*
// Markdown component leaked.
// esbuild metafile input keys are paths relative to the project root (e.g.
// "node_modules/parse5/dist/cjs/index.js"), never absolute — no leading slash before
// "node_modules".
export const PACKAGES = {
  parse5: /node_modules\/parse5\//,
  micromarkCore: /node_modules\/micromark\//,
  gfm: /node_modules\/micromark-extension-gfm\//,
  frontmatter: /node_modules\/micromark-extension-frontmatter\//,
  mdx: /node_modules\/micromark-extension-mdxjs\//,
};

// Every micromark-family package, including `micromark`'s own internal utility/core
// dependencies (`micromark-util-*`, `micromark-core-commonmark`, `micromark-factory-*`, …), which
// are not one of the five named production dependencies above but would still mean a Markdown
// component leaked if they showed up in an entry that must exclude Markdown entirely. A defensive
// net alongside the five precise identities, not a replacement for them.
export const MICROMARK_FAMILY = /node_modules\/micromark[^/]*\//;

export const ALL_FIVE = [
  PACKAGES.parse5,
  PACKAGES.micromarkCore,
  PACKAGES.gfm,
  PACKAGES.frontmatter,
  PACKAGES.mdx,
];

const MARKDOWN_STACK_FORBIDDEN = [
  PACKAGES.micromarkCore,
  PACKAGES.gfm,
  PACKAGES.frontmatter,
  PACKAGES.mdx,
  MICROMARK_FAMILY,
];

export const ENTRIES = {
  text: { forbidden: [...ALL_FIVE, MICROMARK_FAMILY], required: [] },
  html: { forbidden: MARKDOWN_STACK_FORBIDDEN, required: [PACKAGES.parse5] },
  markdown: { forbidden: [], required: ALL_FIVE },
  index: { forbidden: [], required: ALL_FIVE },
};

/** Every `inputs` entry whose path matches at least one of `patterns`. */
export function matching(inputs, patterns) {
  return inputs.filter((file) => patterns.some((pattern) => pattern.test(file)));
}

/**
 * Evaluates one entry's module graph (`inputs`, e.g. `Object.keys(esbuildMetafile.inputs)`)
 * against a `{forbidden, required}` spec. Pure function, no I/O — this is what both the real
 * checker and the synthetic-input self-test in tests/scripts/entry-reach.test.ts call, so the
 * exact same logic is what's actually verified against fabricated forbidden/required violations
 * and what runs against real esbuild output.
 */
export function evaluate(inputs, { forbidden, required }) {
  const forbiddenHits = matching(inputs, forbidden);
  if (forbiddenHits.length > 0) {
    return { ok: false, reason: "forbidden", forbiddenHits, missingRequired: [] };
  }
  const missingRequired = required.filter((pattern) => !inputs.some((file) => pattern.test(file)));
  if (missingRequired.length > 0) {
    return { ok: false, reason: "missing-required", forbiddenHits: [], missingRequired };
  }
  return { ok: true, reason: null, forbiddenHits: [], missingRequired: [] };
}
