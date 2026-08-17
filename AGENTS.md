# Repository Guidelines

## Project Structure & Module Organization

`spec/` is the canonical, runtime-independent contract: normative rules live in `spec/rules/`, locale data in `spec/locales/`, conformance cases in `spec/fixtures/`, and JSON Schemas in `spec/schema/`. TypeScript implementation code is under `src/`: shared pipeline machinery in `src/engine/`, one module per typography rule in `src/rules/`, and HTML/Markdown adapters in `src/modes/`. `src/generated/locales.ts` is generated and must not be edited. Tests mirror these areas under `tests/`. Documentation is in `docs/`; read `docs/MULTILINGUAL_ARCHITECTURE.md` before planning language or script expansion. Brand and promotional assets are in `brand/` and `promo/`.

## Build, Test, and Development Commands

Use Node.js 20 or newer and install exact dependencies with `npm ci`.

- `npm run gen` regenerates embedded locale data after changes in `spec/locales/`.
- `npm run validate:spec` validates schemas and refreshes escaped fixture mirrors.
- `npm test` runs locale generation followed by the full Vitest suite.
- `npx vitest run tests/rules/quotes.test.ts` runs one test file; use `-t "nested quotes"` for one case.
- `npm run lint` applies ESLint checks; `npm run format` writes Prettier formatting.
- `npx tsc --noEmit` type-checks; `npm run build` creates ESM, CJS, declarations, and source maps in `dist/`.

## Coding Style & Naming Conventions

Follow Prettier defaults: two-space indentation, double quotes, semicolons, and trailing commas. Use strict TypeScript, `import type` for type-only imports, and avoid `any`, console output in library code, and non-strict equality. Name rule modules after their public lowercase rule ID, such as `src/rules/ellipsis.ts`; use `*.test.ts` for tests. Core rules must scan Unicode code points without regex, normalization, locale-sensitive platform helpers, I/O, or mutable global state.

## Testing & Spec Changes

Vitest provides example tests; `fast-check` covers the release-blocking idempotency invariant: `transform(transform(x)) === transform(x)`. Any behavior fix starts with normative spec and conformance-fixture changes, then implementation and focused tests. Locale additions require data, fixtures, and normative citations. Run spec validation, lint, tests, type-checking, and build before opening a PR.

## Commits & Pull Requests

History follows Conventional Commit-style subjects: `feat:`, `fix:`, `test:`, `spec:`, `docs:`, `build:`, and `chore:`. Keep commits focused and imperative. PRs should explain the behavior and rationale, identify affected rules/locales/modes, link issues or sources, and include before/after examples for output changes. Add screenshots only for visual changes in `brand/` or `promo/`; never commit generated `dist/` output.
