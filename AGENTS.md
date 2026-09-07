# Repository Guidelines

## Project Structure & Module Organization

This repository holds the canonical, runtime-independent spec plus the promo site — not an
implementation. Normative rules live in `spec/rules/`, locale data in `spec/locales/`, conformance
cases in `spec/fixtures/`, and JSON Schemas in `spec/schema/`. The JavaScript/TypeScript
implementation lives in [polytypo/polytypo-js](https://github.com/polytypo/polytypo-js); other
runtimes get their own repos as they land. `scripts/` holds spec-validation and workflow-hygiene
tooling; `brand/tools/` generates the promo site (`promo/`) and brandbook (`brand/BRANDBOOK.html`)
from spec data via the published `polytypo` npm package. Documentation is in `docs/`; read
`docs/MULTILINGUAL_ARCHITECTURE.md` before planning language or script expansion.

## Build, Test, and Development Commands

Use Node.js 20 or newer and install exact dependencies with `npm ci`.

- `npm run validate:spec` validates schemas and refreshes escaped fixture mirrors.
- `npm test` runs the Vitest suite (promo-site and conformance-fixture-structure tests only —
  there is no engine here to exercise against the fixtures).
- `npm run generate:all` regenerates `README.md`, the promo site, and the brandbook from spec data;
  run it after any change to `spec/locales/` or `spec/fixtures/`.
- `npm run lint` applies ESLint checks; `npm run format` writes Prettier formatting.
- `npx tsc --noEmit` type-checks the remaining `.ts` tooling and tests.

## Coding Style & Naming Conventions

Follow Prettier defaults: two-space indentation, double quotes, semicolons, and trailing commas.
Use strict TypeScript, `import type` for type-only imports, and avoid `any`, console output in
library code, and non-strict equality. Use `*.test.ts` for tests.

## Testing & Spec Changes

Any behavior fix starts with normative spec and conformance-fixture changes here; implementation
and focused tests belong in the relevant runtime repo (polytypo-js for JavaScript). Locale
additions require data, fixtures, and normative citations — see the `sources` field convention in
`spec/locales/*.json`. Run spec validation, lint, tests, and type-checking before opening a PR.

## Commits & Pull Requests

History follows Conventional Commit-style subjects: `feat:`, `fix:`, `test:`, `spec:`, `docs:`,
`build:`, and `chore:`. Keep commits focused and imperative. PRs should explain the behavior and
rationale, identify affected rules/locales/modes, link issues or sources, and include before/after
examples for output changes. Add screenshots only for visual changes in `brand/` or `promo/`; never
commit generated `promo/vendor/` or `brand/BRANDBOOK.html` drift.
