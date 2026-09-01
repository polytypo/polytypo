# polytypo — audit remediation, release, and repository plan

**Status:** execution plan derived from the 2026-08-26 implementation and promo-site audit.

**Relationship to other documents:** `docs/ROADMAP.md` remains the authoritative product roadmap.
This document records concrete audit findings, release gates, the chosen repository model, and
copy-ready prompts for an implementation agent. If this document conflicts with the normative
typography contract in `spec/`, the spec wins. Behaviour changes must update the spec and fixtures
before implementation.

## 1. Project goal and positioning

polytypo is a multilingual microtypography engine for web content. Its public idea is:

> The em dash was mine before AI. An em dash is a sign of considered typography, not an AI
> watermark.

The technical product is a portable specification plus native implementations for JavaScript /
TypeScript, Python, Go, Ruby, and PHP. Locale-correct typography includes quotation marks, dashes,
ellipsis, apostrophes, symbols, non-breaking spaces, and morphological non-breaking hyphens.

The spec is the source of truth. Runtime implementations are replaceable and conform to the spec;
locale practice is decided by normative citations rather than preference.

## 2. Audit baseline

The 2026-08-26 audit ran successfully:

- `npm run validate:spec`;
- `npm test`: 19 files and 2,725 tests passed;
- `npm run lint`;
- `npx tsc --noEmit`;
- `npm run build`;
- `npm pack --dry-run --json`;
- desktop and mobile browser checks of Home, Docs, Playground, and Locales;
- interactive `text`, `html`, and `markdown` playground checks;
- an output-escaping check with HTML containing an event handler;
- a fresh browser-bundle comparison against `promo/vendor/polytypo.browser.js`.

The current implementation has no observed build, type, lint, console, or obvious output-escaping
failure. Its strongest qualities are the code-point scanner model, edit validation, byte-preserving
HTML/Markdown adapters, locale citations, canonical fixtures, and property-based idempotency.

The repository contained pre-existing uncommitted promo changes during the audit. Any implementation
work must preserve unrelated user changes and must not reset or overwrite the worktree.

## 3. Release blockers

### 3.1 Known false-positive transformations

The canonical fixtures currently assert outputs that the spec itself calls incorrect:

- `Figure 5-10` becomes a numeric range, although it is a compound label;
- `rock 'n' roll` becomes quotation marks instead of apostrophes;
- equivalent cases exist in several locales;
- the quotes spec records related elision-versus-closer ambiguity.

This contradicts the M4 shipping criterion in `docs/ROADMAP.md`: zero false positives. Before a
stable release, ambiguous transformations must become conservative, explicitly opt-in, or be
resolved from well-defined locale data. Missing a possible improvement is safer than damaging text.

The exact contract must be settled in the spec before code changes. Candidate approaches include:

1. add a narrowly specified locale elision list for forms such as English `'n'`;
2. split or separately gate ambiguous numeric-range conversion;
3. introduce a conservative/default preset and an explicit aggressive preset;
4. add bounded, cited label guards if they can be expressed portably without an open-ended DSL.

Acceptance criteria:

- known incorrect outputs are no longer treated as conforming success cases;
- fixtures state the newly normative safe output;
- all affected locales and modes are covered;
- idempotency remains green;
- the full dogfooding diff contains zero changes the author would reject by hand.

### 3.2 Markdown is missing from the portable conformance path

The fixture schema requires `dialect` for Markdown, but the TypeScript conformance loader drops that
field and the runner never passes it to `transform()`. Canonical locale fixtures currently contain
no `mode: "markdown"` cases, so this omission stays hidden. JS-specific adapter tests are good, but
they are not the promised cross-runtime conformance contract.

Acceptance criteria:

- `ConformanceCase` carries `dialect`;
- the fixture loader validates and preserves it;
- the runner passes it into public options;
- canonical fixtures cover CommonMark and MDX;
- fixtures cover prose, inline/fenced code, links, autolinks, frontmatter, raw HTML, JSX/expressions,
  malformed MDX, byte-identical no-op input, and idempotency;
- a future runtime can consume the same fixture files without JS-specific assumptions.

## 4. Documentation, generation, and CI corrections

### 4.1 One global spec-version source

`brand/tools/gen_readmes.py` currently reads the global version from `spec/rules/order.json`, which
left README files on 0.2.0 while `spec/VERSION` and the promo site moved to 0.3.0.

Required change:

- `spec/VERSION` is the single global spec-version source;
- generated READMEs and promo pages read it directly;
- validation detects accidental version drift where a file is required to claim the global version;
- per-rule historical versions may remain documented, but cannot masquerade as the global version.

### 4.2 Generated artifacts must be reproducible and enforced

The CI workflow checks only part of the generated documentation and does not rebuild/check the
browser bundle. It must cover:

- root README and port READMEs;
- `promo/examples.json`;
- Home, Docs, Playground, Locales, and Manifesto pages;
- copied CSS/JS/font assets;
- `promo/vendor/polytypo.browser.js`;
- generated locale source;
- escaped fixture mirrors where applicable.

Prefer one deterministic `generate` or `generate:all` entry point followed by a scoped
`git diff --exit-code`. Do not hide drift behind `continue-on-error`.

### 4.3 Honest runtime status

The site currently leads with “One spec, five runtimes” although only JavaScript exists, and a docs
card still says “Six correct” with ten locales. Proposed wording:

> One runtime today. One portable spec designed for five.

Proposed/nonexistent runtime APIs must be visibly labelled “planned API”, not shown as though their
packages can already be installed. The malformed-input docs must also reflect reality: HTML parsing
is recovery-based; malformed-input errors are primarily reachable through MDX parsing.

## 5. Package and implementation improvements

### 5.1 Reduce the cost for text-only consumers

The audited browser bundle was approximately 676 KB minified / 195 KB gzip and installed 58
production dependency nodes because HTML and Markdown parsers are reachable from the only entry
point. Add subpath entry points while preserving a convenient aggregate API:

```text
polytypo
polytypo/text
polytypo/html
polytypo/markdown
```

Acceptance criteria:

- `polytypo/text` does not import or bundle `parse5`, Micromark, GFM, frontmatter, or MDX;
- aggregate `polytypo` remains compatible unless a deliberate pre-1.0 API decision says otherwise;
- ESM, CJS, declarations, exports, tree-shaking, and browser bundling are tested;
- bundle sizes are reported in CI to prevent silent regression.

### 5.2 Publication metadata

Before the first npm publication, add and verify:

- a real non-zero version;
- `repository`, `homepage`, `bugs`, and `keywords`;
- suitable `publishConfig`;
- provenance/release workflow;
- `npm pack` contents;
- whether source maps should be shipped;
- direct declaration of build tools used by npm scripts rather than reliance on transitive bins.

The npm name `polytypo` returned 404 during the audit and appeared free. It is not safely reserved
until ownership is established through npm.

### 5.3 Public introspection and future analysis

Useful additions after the stable transform contract:

- exported `specVersion`;
- exported `supportedLocales`;
- `analyze()` returning edits, rule IDs, source spans, replacements, and explanations;
- CLI with `--check`, `--write`, and unified diff;
- remark/rehype integration;
- later integrations for Astro, Eleventy, CMS save hooks, and editors;
- mixed-locale processing driven by HTML `lang` and explicit document metadata.

## 6. Promo-site improvements

### 6.1 Accessibility and interaction

- associate visible Input/Output labels with their controls/regions;
- use an appropriate live region or status semantics for dynamic output;
- retain visible focus states and keyboard operation;
- improve the narrow mobile navigation rather than leaving one link stranded on a second line;
- rename “changes” if the value is actually the number of changed diff regions;
- keep output escaping and the current protection against executing pasted HTML.

### 6.2 Viral positioning

The package is a niche developer dependency; the idea and playground have a better chance of broad
reach. Lead with the em-dash thesis instead of a generic typography heading. Candidate hero:

> The em dash was mine before AI.
>
> `—` is typography, not a watermark.

Follow with a locale-aware demonstration, not an anti-AI rant. Useful share mechanics:

- a permalink containing locale, mode, and input;
- a shareable before/after card;
- “AI punctuation or correct typography?” examples;
- visible explanations of NBSP, narrow NBSP, word joiners, quote style, and dash choice;
- copy-output and copy-link actions;
- one concise manifesto page suitable for sharing independently of npm documentation.

Success should be measured separately:

- story/demo reach: shares, visits, completed playground interactions;
- library adoption: registry downloads, dependants, integrations, retained usage;
- spec credibility: citations, contributed fixtures, and conforming runtimes.

## 7. Hosting on polytypo.js.org

The project is directly related to the JavaScript ecosystem and should be a plausible candidate for
`polytypo.js.org`, even if it documents future non-JS ports. The site must remain substantive,
focused on the project, and must not automatically redirect away from the js.org domain.

Process:

1. publish the canonical site through GitHub Pages or another CNAME-capable host;
2. configure `polytypo.js.org` as the custom domain;
3. add the required CNAME configuration through the Pages settings/workflow as appropriate;
4. submit a PR to `js-org/js.org`;
5. treat approval and exact-name availability as decisions of the js.org maintainers.

The domain hosts documentation/demo; runtime packages are still published through their ecosystem
registries.

## 8. Chosen repository model

Use the same organisational pattern as VATNode, adapted for executable native ports.

### 8.1 Canonical repository

```text
github.com/polytypo/polytypo
  spec/
    rules/
    locales/
    fixtures/
    schema/
    VERSION
  site/
  brand/
  docs/
  conformance/
```

It owns typography facts, normative rules, citations, schemas, conformance fixtures, the spec
version, the conformance matrix, project documentation, and the public site.

### 8.2 Runtime repositories

```text
github.com/polytypo/polytypo-js       -> npm: polytypo
github.com/polytypo/polytypo-python   -> PyPI: polytypo
github.com/polytypo/polytypo-go       -> github.com/polytypo/polytypo-go
github.com/polytypo/polytypo-ruby     -> RubyGems: polytypo
github.com/polytypo/polytypo-php      -> Packagist: polytypo/polytypo
```

This gives Go a clean module path and gives public Packagist the required repository-root
`composer.json` without subtree-split workarounds.

The governing sentence is:

> Runtime packages are not independent specifications, but they are independent native
> implementations.

They may not independently decide locale behaviour. They do contain handwritten runtime code,
runtime-specific parser adapters, package metadata, tests, builds, and registry release workflows.

### 8.3 Spec distribution to runtime repositories

Prefer an automated vendored snapshot over a consumer-time Git dependency or mandatory submodule:

```text
polytypo-js/
  vendor/polytypo-spec/
  scripts/update-spec.*
  src/
  tests/
```

Each snapshot records:

- `specVersion`;
- canonical spec tag;
- canonical commit SHA;
- optional content hash;
- a generated-file warning and source URL.

Packages embed generated locale data and perform no network/filesystem access at runtime. Canonical
fixtures may stay in the runtime source repository for CI but need not be included in the registry
artifact.

### 8.4 Release choreography

1. Change the canonical spec and fixtures first.
2. Make the canonical suite green.
3. Tag `spec-vX.Y.Z` in `polytypo`.
4. Dispatch automation that opens an update PR in every runtime repository.
5. Update the vendored snapshot and generated locale data.
6. Run that runtime's conformance, idempotency, unit, parser, build, and packaging checks.
7. Publish only the runtimes that are green for that spec version.
8. Update the canonical generated conformance matrix from machine-readable runtime reports.

Runtime package versions are independent from the spec version because packaging or implementation
bugs can require a patch without a semantic spec change. Every runtime exposes and documents the
spec version it conforms to.

### 8.5 Issue ownership

- wrong locale behaviour, citation, schema, or normative output -> `polytypo`;
- Node/CJS/bundling or JS parser problem -> `polytypo-js`;
- Python packaging/runtime problem -> `polytypo-python`;
- Go implementation/module problem -> `polytypo-go`;
- Ruby implementation/gem problem -> `polytypo-ruby`;
- PHP implementation/Composer problem -> `polytypo-php`.

### 8.6 Migration of the current repository

Do not split repositories until the current JavaScript implementation clears the correctness and
dogfooding gates. Then:

- move `spec/`, shared docs, site, brand, and conformance coordination to `polytypo`;
- move `src/`, JS-specific unit tests/configuration, `package.json`, and JS build tooling to
  `polytypo-js`;
- retain canonical fixtures only in `polytypo` and vendor them into `polytypo-js` automatically;
- preserve Git history where practical using a history-aware split;
- validate that the JS package built after the split is byte/behaviour equivalent before release;
- never create the other four runtime repos with placeholder install instructions presented as live.

## 9. Recommended execution order

1. Fix spec-version sourcing and generated-artifact CI.
2. Repair the portable Markdown conformance path and add canonical mode fixtures.
3. Resolve known false positives and complete the real-content M4 dogfooding gate.
4. Correct runtime-status and stale promo copy.
5. Add text-only packaging/subpath entry points and publication metadata.
6. Improve accessibility and mobile presentation.
7. Reposition the public landing page around the em-dash thesis.
8. Publish JavaScript only after the complete release gate is green.
9. Split canonical and JS repositories without changing behaviour.
10. Implement exactly one second runtime, preferably Python or Go, to test the completeness of the
    spec before creating the remaining ports.

## 10. Copy-ready prompts for the implementation agent

Send these prompts one at a time. After each prompt, review the diff and verification output before
starting the next. The agent must follow `AGENTS.md`, preserve unrelated changes, use spec-first
behaviour changes, and never claim success without running the relevant checks.

### Prompt 1 — global version and generated artifacts

```text
Work in /home/iuriirogulia/Projects/polytypo. Read AGENTS.md and
docs/AUDIT_REMEDIATION_AND_RELEASE_PLAN.md completely before editing.

Implement section 4.1 and 4.2 of the audit plan only:
- make spec/VERSION the single source for the global spec version used by generated READMEs and
  promo pages;
- remove accidental reliance on spec/rules/order.json as the global version;
- make generation deterministic;
- update CI so every tracked generated README, promo page, promo asset, examples file, generated
  locale file, escaped mirror where applicable, and promo browser bundle is regenerated and checked
  for drift;
- remove the non-blocking/continue-on-error generated-promo check once the complete hard check works.

Preserve unrelated uncommitted changes. Do not change typography behaviour. Add focused tests or
validation assertions for version drift. Regenerate the affected artifacts, then run spec
validation, focused tests, lint, typecheck, full tests, build, and the generated-diff check. Report
exact files changed and commands/results. Do not commit.
```

### Prompt 2 — portable Markdown conformance

```text
Work in /home/iuriirogulia/Projects/polytypo. Read AGENTS.md,
docs/AUDIT_REMEDIATION_AND_RELEASE_PLAN.md section 3.2, and spec/rules/modes.md completely before
editing.

Fix the portable conformance contract for Markdown:
- add dialect to ConformanceCase and preserve/validate it in the fixture loader;
- require it exactly for mode=markdown and reject it for other modes consistently with the schema;
- pass it through the public Options used by the conformance runner;
- add canonical CommonMark and MDX fixtures covering prose, inline/fenced code, link text and
  destinations, autolinks, frontmatter, raw HTML, JSX/expressions, malformed MDX, byte-identical
  no-op behaviour, boundaries, and idempotency;
- keep fixtures runtime-independent and avoid JS parser terminology in expected behaviour.

This is a spec/fixture change first, then runner implementation. Do not change unrelated typography
rules. Run validate:spec, focused conformance/mode tests, full tests, lint, typecheck, and build.
Report fixture coverage by dialect and mode. Do not commit.
```

### Prompt 3 — false-positive safety gate

```text
Work in /home/iuriirogulia/Projects/polytypo. Read AGENTS.md,
docs/AUDIT_REMEDIATION_AND_RELEASE_PLAN.md section 3.1, docs/ROADMAP.md M4, and the complete dashes,
quotes, apostrophe, and pipeline-idempotency specs before editing.

Resolve the known false positives that the current fixtures deliberately accept, including at least
compound labels such as "Figure 5-10" and elision forms such as "rock 'n' roll" across every
affected locale.

Start by documenting the smallest conservative, portable normative contract. If choosing among a
default-safe mode, new public option/rule IDs, or locale-data/schema expansion would materially
change the public API, stop before editing and present the alternatives with exact fixture impacts.
Otherwise proceed spec-first: normative prose, schema/data if required, canonical fixtures, then
implementation and focused tests.

False negatives are preferable to text damage. Do not add an unbounded heuristic or locale DSL.
Preserve idempotency and modes. Run validate:spec, all affected rule/conformance/property tests,
full tests, lint, typecheck, and build. List every previously known-wrong case and its new output.
Do not commit.
```

### Prompt 4 — honest documentation and runtime status

```text
Work in /home/iuriirogulia/Projects/polytypo. Read AGENTS.md and
docs/AUDIT_REMEDIATION_AND_RELEASE_PLAN.md sections 4.3 and 6.2.

Correct documentation and promo claims without changing engine behaviour:
- replace misleading above-the-fold "five runtimes" wording with "One runtime today. One portable
  spec designed for five" or a meaning-equivalent concise formulation;
- clearly label Python, Go, Ruby, and PHP APIs/packages as planned rather than installable;
- replace stale locale counts such as "Six correct" with generated current data;
- correct malformed-input documentation so it reflects HTML recovery and MDX parser errors;
- add the em-dash/AI thesis to the positioning, but keep technical docs factual and restrained;
- ensure all claims are generated from shared status/count/version data where practical.

Regenerate all docs/site outputs. Run the generated-diff check, lint, tests, and a local browser
check of all five promo pages at desktop and mobile widths with no console errors. Do not commit.
```

### Prompt 5 — text-only package entry point

```text
Work in /home/iuriirogulia/Projects/polytypo. Read AGENTS.md and
docs/AUDIT_REMEDIATION_AND_RELEASE_PLAN.md section 5.1 before editing.

Design and implement package subpath entry points for text-only, HTML, and Markdown use while
preserving the aggregate API unless a pre-1.0 incompatibility is explicitly justified:
- polytypo/text must not import or bundle parse5, micromark, GFM, frontmatter, or MDX;
- polytypo/html may include only its required parser stack;
- polytypo/markdown may include its required parser stack;
- ESM, CJS, declarations, package exports, sideEffects, and browser bundling must work;
- add tests that build/import every public entry in ESM and CJS;
- add repeatable raw/gzip bundle-size reporting and a reasonable regression budget.

Do not change typography semantics. Run focused packaging tests, npm pack --dry-run, lint,
typecheck, full tests, and build. Report before/after bundle sizes and production dependency reach
for each entry. Do not commit.
```

### Prompt 6 — publication readiness

```text
Work in /home/iuriirogulia/Projects/polytypo. Read AGENTS.md and
docs/AUDIT_REMEDIATION_AND_RELEASE_PLAN.md section 5.2.

Prepare, but do not publish, the JavaScript package:
- add correct repository, homepage, bugs, keywords, publishConfig, and other standard metadata;
- ensure every command-line build tool used by package scripts is a direct dependency;
- decide and document whether source maps belong in the published artifact;
- add package-content assertions and ESM/CJS smoke tests against the packed tarball;
- prepare a provenance-capable GitHub release workflow that publishes only from an explicit tag and
  after all release gates pass;
- keep the version non-releasable unless the user has explicitly selected the first public version;
- do not run npm publish, create tags, push, or create releases.

Run npm pack --dry-run and all validation/test/build checks. Report the exact tarball contents and
sizes. Do not commit.
```

### Prompt 7 — playground accessibility and mobile polish

```text
Work in /home/iuriirogulia/Projects/polytypo. Read AGENTS.md and
docs/AUDIT_REMEDIATION_AND_RELEASE_PLAN.md section 6.1.

Improve the generated promo/playground accessibility and narrow-screen layout without changing the
visual identity or engine behaviour:
- associate visible labels with the input and output;
- give dynamic output/status appropriate accessible semantics without noisy announcements;
- retain complete keyboard access and visible focus;
- fix awkward mobile navigation wrapping;
- make the change count terminology accurate;
- preserve output escaping and add a regression test/check for pasted hostile HTML;
- edit source templates/assets, never generated promo files as the primary source.

Regenerate the site. Verify all five pages in a real browser at desktop and representative mobile
widths, exercise text/html/markdown modes, inspect console errors, and run lint/tests/build. Include
before/after observations. Do not commit.
```

### Prompt 8 — viral landing-page iteration

```text
Work in /home/iuriirogulia/Projects/polytypo. Read AGENTS.md and
docs/AUDIT_REMEDIATION_AND_RELEASE_PLAN.md section 6.2.

Revise the promo landing page around the core idea "The em dash was mine before AI" while keeping
the project technically credible:
- lead with the thesis that an em dash is typography, not an AI watermark;
- immediately demonstrate that dash/quote/spacing conventions differ by locale;
- retain a clear route to the playground and technical docs;
- avoid unprovable virality, adoption, accuracy, or runtime claims;
- do not present planned packages as published;
- add copy/share/permalink mechanics only if they can remain static, private-by-default, and free of
  analytics or external services;
- preserve the existing brand system and generated-source workflow.

Regenerate and test the site at desktop/mobile widths, verify keyboard interaction and URLs, check
for console errors, and run project validation. Do not change engine semantics or publish/deploy.
Do not commit.
```

### Prompt 9 — repository split design and automation

```text
Work in /home/iuriirogulia/Projects/polytypo. Read AGENTS.md and the complete section 8 of
docs/AUDIT_REMEDIATION_AND_RELEASE_PLAN.md.

Prepare an implementation-ready repository split plan matching the VATNode-style model:
- canonical github.com/polytypo/polytypo for spec/site/brand/shared docs/conformance;
- github.com/polytypo/polytypo-js for the native JS implementation and npm package;
- future separate Python, Go, Ruby, and PHP implementation repositories;
- automated vendored spec snapshots recording version, tag, commit, and hash;
- spec-tag dispatch that opens runtime update PRs;
- machine-readable conformance reports and a generated canonical matrix;
- independent runtime package versions that declare their conformed spec version;
- issue ownership and release gates.

Do not create remote repositories, push, tag, publish, or destructively move files. Produce the
proposed target trees, migration command/script design, history-preservation strategy, workflow
contracts, failure/recovery plan, and exact acceptance checklist. If safe and useful, add only local
non-destructive documentation or validation scaffolding. Do not commit.
```

### Prompt 10 — final release audit

```text
Perform a final read-only release audit of /home/iuriirogulia/Projects/polytypo against AGENTS.md,
docs/ROADMAP.md, and docs/AUDIT_REMEDIATION_AND_RELEASE_PLAN.md.

Do not edit files. Verify:
- no canonical fixture intentionally asserts a known incorrect output;
- the real-content M4 dogfooding evidence exists and reports zero rejected changes;
- spec validation, canonical conformance, idempotency, full tests, lint, typecheck, and build pass;
- CommonMark and MDX are present in portable fixtures;
- generated artifacts and browser bundle are clean after regeneration;
- all five promo pages pass desktop/mobile interaction and console checks;
- documentation honestly distinguishes the one live runtime from planned ports;
- npm packed-artifact ESM/CJS/subpath smoke tests pass;
- package metadata and release workflow are ready but no publication action is taken;
- repository split prerequisites are documented without assuming the split has already happened.

Return findings ordered by severity with file/line evidence, commands run, and a final explicit
GO/NO-GO recommendation. Do not commit, tag, push, publish, deploy, or modify external state.
```

## 11. Review protocol

After the implementation agent completes any prompt:

1. provide its summary and complete diff to the reviewing agent;
2. do not begin the next prompt until the review is complete;
3. the reviewer reruns checks proportionate to the change and inspects generated outputs;
4. behavioural work is rejected if the spec/fixture change did not precede the implementation;
5. generated-file edits are rejected if their source template/generator did not change;
6. unrelated cleanup is split out rather than mixed into the task;
7. no publish, tag, push, remote-repository creation, or deployment occurs without explicit user
   authorization at that step.
