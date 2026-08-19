# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run gen           # regenerate src/generated/locales.ts from spec/locales/*.json (gitignored, required before test/build)
npm test              # gen + vitest run (whole suite)
npm run validate:spec # ajv-validate spec/ against spec/schema/, regenerate spec/fixtures/.escaped/
npm run lint          # eslint
npm run format        # prettier --write .
npm run build         # gen + tsup (ESM + CJS + d.ts)
npx tsc --noEmit      # type-check (no npm script; tsconfig emits declarations only)
```

Single test file / single case:

```bash
npx vitest run tests/rules/quotes.test.ts
npx vitest run -t "nested quotes"
```

`npm run gen` must run after any edit to `spec/locales/`, otherwise tests and build see stale
embedded data. CI (`.github/workflows`) runs validate:spec → lint → test → build on Node 20 and 22.

## Document authority

- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — authoritative on structure. Supersedes PLAN.md §5, §8.
- [docs/ROADMAP.md](docs/ROADMAP.md) — authoritative on milestones. Supersedes PLAN.md §8.
- [docs/PLAN.md](docs/PLAN.md) — §1–§4, §6, §7, §9 still binding (why, competitive landscape, scope, non-goals, locale data format, locale reference table, post-v1).

PLAN.md was written for a single JS implementation; the 2026-08-15 amendment at its head overrides
that. Where PLAN.md and ARCHITECTURE.md disagree (e.g. zod vs JSON Schema for locale validation),
ARCHITECTURE.md wins. `docs/agents/agent-system-audit.md` is a generated finding record and ranks
below all three.

## The premise that drives every decision

polytypo targets **five runtimes** (JS/TS, Ruby, Go, PHP, Python). **The spec is the product;
implementations are replaceable.** An implementation is "polytypo" iff it passes the conformance
suite for the spec version it claims.

Consequence that matters daily: **a behaviour change is a spec change first, code second.** Fixing
a bug in `src/` without adding a fixture in `spec/fixtures/` is forbidden — that is how ports drift.

Layers, dependencies pointing strictly downward: `L0 spec` (canonical, runtime-agnostic) →
`L1 engine` (rule pipeline over plain text) → `L2 modes` (text/html/markdown adapters) →
`L3 integrations` (out of repo, out of v1).

Planned as **multi-repo** under GitHub org `polytypo`: `spec` plus one repo per runtime. Today it is
still one repo — `spec/` is a plain directory, there is no `.gitmodules`, and **how each runtime will
vendor the spec is an open operator decision** (submodule vs per-ecosystem spec packages;
ROADMAP.md "Open decisions" #2). What is decided regardless of that outcome: the spec is vendored and
pinned, never fetched at runtime, and locale data is embedded into the published artifact at build
time. Hence `scripts/gen-locales.mjs`: it is the only place locale JSON is ever loaded.

## How the code is laid out

- `spec/` — canonical, runtime-agnostic. `rules/*.md` (normative prose) + `rules/order.json`
  (rule ids, order, defaults, which locale fields each rule reads), `locales/*.json`,
  `fixtures/*.json` (+ CI-generated `.escaped/` mirror), `schema/*.json`, `VERSION`, `UNICODE`.
- `src/engine/` — `codepoints` (string ↔ code-point array, once in / once out), `edits`
  (validate + apply), `pipeline` (mode + rule plan + locale resolution, then run), `locale`,
  `unicode` (hand-rolled category predicates; no regex, no ICU).
- `src/rules/` — one file per rule id; `registry.ts` holds `RULE_ORDER`, `RULE_DEFAULTS`, `RULES`.
  `RULE_ORDER` mirrors `spec/rules/order.json` and `tests/engine/pipeline.test.ts` asserts it.
- `src/modes/` — `html` (parse5), `markdown` (micromark), `spans` (the extract/reassemble contract
  shared by both), `parse-error` (wraps every parser exception so no dependency's error type reaches
  the public surface).
- `src/generated/locales.ts` — build output, gitignored, never hand-edited.
- `tests/conformance/` — drives `spec/fixtures/` through `transform()`; `tests/engine/idempotency.test.ts`
  is the `fast-check` property suite; `tests/modes/` covers the mode adapters.

Public surface (`src/index.ts`): `transform(input, options) -> string`, `PolytypoError`, and types.
Options: `{ locale (required, no fallback), mode?, dialect?, rules? }`; `rules` is **opt-out only**.
`dialect` (`"commonmark" | "mdx"`) is **required when `mode` is `"markdown"`**, has no default and is
ignored in the other modes — dialect detection is forbidden, not merely unimplemented (see the
comment on `Dialect` in `src/types.ts`).

Current error codes (`src/errors.ts`), all seven: `POLYTYPO_UNKNOWN_LOCALE`, `POLYTYPO_INVALID_MODE`,
`POLYTYPO_INVALID_DIALECT`, `POLYTYPO_UNKNOWN_RULE`, `POLYTYPO_MALFORMED_LOCALE_DATA`,
`POLYTYPO_RULE_CONTRACT`, `POLYTYPO_MALFORMED_INPUT`. `POLYTYPO_INVALID_DIALECT` and
`POLYTYPO_MALFORMED_INPUT` are ratified public contract by operator decision, same status as the
other five.

Eight rules in spec order: `spaces` `ellipsis` `dashes` `hyphen` `quotes` `apostrophe` `symbols` `nbsp`.
All three modes — `text`, `html`, `markdown` — are implemented (M2 is done). `parse5` and four
`micromark` packages are ordinary runtime dependencies; see PLAN.md §5.2's amendment for why they are
not lazy imports.

## Binding implementation constraints (ARCHITECTURE.md §4, §7)

Already binding on the JS implementation even though no other runtime exists, because they are
expensive to reverse:

- **No regex in core rules.** Go's RE2 has no lookahead/lookbehind/backreferences. Rules are a
  single left-to-right scan over a code-point array with explicit lookaround by index. Regex is
  allowed only in build tooling, tests, and literal-string matching lists.
- **Index by Unicode code point**, never a native string. UTF-16 offsets do not survive the port.
- **Never normalize input.** Inserted characters are NFC and specified by code point in the spec
  (`U+00A0`, `U+202F`, `U+2019`), never as literal glyphs in prose. Locale files are stored in NFC
  (CI-enforced).
- **No locale-dependent stdlib calls** — no `toLowerCase()` without explicit locale, no
  `localeCompare`, no ICU collation. (Turkish dotless ı.)
- **Rule order comes from `spec/rules/order.json`**, not registration order and never map iteration order.
- **Errors carry stable machine codes.** Messages are English and not part of the contract; codes are.
- **Locale resolution is specified in the spec** (`de-AT` → `de`, see `spec/rules/locale-resolution.md`
  and its fixture file), not delegated to a platform locale-negotiation library.
- **`transform` is pure**: no I/O, env, clock, globals, filesystem, network; reentrant; no
  module-level mutable state; no global configuration.
- **Rules produce edits; the pipeline applies them.** `applyEdits` enforces the rule contract
  (in-bounds, ascending, non-overlapping, valid code points, correct `ruleId` tag) rather than
  trusting it. This is the one piece of v1 internal structure built for the future, and it is
  explicitly authorized. Do not implement the reserved `analyze()` API in v1.

## Locale data vs. code

Declarative facts (quote glyphs, dash conventions, nbsp lists, `sources`) live in
`spec/locales/<code>.json`. Algorithms (quote open/close resolution and nesting, Russian hyphen
morphology, range/initials detection, rule ordering) live in code.

Locale files may contain **only** literal strings, literal code points, string lists, and enum
values. Banned: regex patterns, priority/ordering numbers, conditionals or anything resembling a DSL.

Every locale file's `sources` array is mandatory — the normative citation (Duden, Imprimerie
nationale, Kotus, Språkrådet, Chicago/Oxford, Мильчин), tagged with the rule id it supports. A
locale is accepted only as a triple: locale JSON + fixtures + citation. Disagreements about a
locale's rules are settled by citation, not preference.

**PLAN.md §7's locale reference table is research, not fact.** Every row must be verified against
its cited source before it lands in a locale file; rows marked ❓ are known-uncertain.

## Conformance and idempotency

Fixtures are flat JSON with `in`/`out` written as literal characters, plus the CI-generated escaped
`\uXXXX` mirror so diffs of invisible U+202F are reviewable. Every case is automatically an
idempotency case — the runner asserts `transform(out) == out`. Cases are tagged with a `rule` id so
a runtime can report partial conformance honestly.

`transform(transform(x)) === transform(x)` is a hard invariant proven by property-based tests, not
just fixtures. **A failing idempotency property is a release blocker, not a bug report.** A red
conformance run blocks release, always.

Rule ids are **public API** (they appear in the `rules` option and future CMS config). Renaming one
is a breaking change.

## Scope discipline

v1 locales are `en-US` `en-GB` `de-DE` `de-CH` `fr` `fr-CA` `ru` `fi` `sv` `el` (aliases `en`→`en-US`,
`de`→`de-DE`). **The six-locale cap was withdrawn 2026-08-15 by operator decision — coverage is a
goal, and the constraint is evidentiary rather than numeric: a locale ships only as the PLAN §6.2
triple (data + fixtures + citation).** Also three
modes, JS only. PLAN.md §4 lists non-goals that **must be refused without an explicit operator
decision**: language auto-detection, hyphenation, optical alignment, spellcheck, hosted API,
plugin/extension API, CMS integrations, demo page, more locales, framework wrappers.
ARCHITECTURE.md §9 adds: no code generation or WASM core shared across runtimes, no RPC between
runtimes, no port started before the M4 dogfooding gate passes.

If a decision comes down to "add a language" vs "make an existing language provably correct" —
choose correctness.

The acceptance test that actually matters is **M4**: dry-run over the author's own MDX blog content,
full diff reviewed by hand, ship criterion **zero false positives**.

## Open decisions (do not resolve unilaterally)

Per ROADMAP.md: repo visibility (public from commit one vs private until M4); spec distribution
(git submodule vs per-ecosystem spec packages); first port (Python vs Go) — not needed until Phase B.

## Agent infrastructure

Three agents, all read-only — none of them writes spec, locale data or code:

- `spec-guardian` — review gate before any milestone is declared green and for any change to
  `spec/rules`, `order.json`, `locale.schema.json`, fixtures, error codes or engine code. Enforces
  spec-before-code and the ARCHITECTURE.md §4 portability constraints.
- `locale-authority` — verifies a locale claim against its normative source and produces the
  mandatory `sources` citation, before any locale file, rule example or README row lands. Treats
  PLAN.md §7 as unverified research.
- `agent-system-auditor` — run by `/audit-agent-system`; audits the agents and commands themselves.

On claim-bearing prose (README locale and competitor tables), facts are verified first and
`humanizer` runs after, never the reverse.
