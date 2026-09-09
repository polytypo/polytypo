# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

**This repository is canonical spec + promo site only.** The JavaScript/TypeScript implementation
was split out to [polytypo/polytypo-js](https://github.com/polytypo/polytypo-js) (2026-09-07) and
published to npm as `polytypo@1.0.0` (2026-09-07); the other runtimes have since split into their
own repos too — see "Multi-repo under GitHub org `polytypo`" below for current per-runtime status.
There is no build and nothing published from this repository — its own `package.json` is
`"private": true`, and the `polytypo` devDependency here is the registry package (`^1.0.0`), used
only by the promo-site generator (`brand/tools/gen_examples.ts`) and its tests. `src/engine/` holds
one static data file (`letter-ranges.json`) consumed by `scripts/validate-spec.mjs` via
`scripts/lib/is-letter.mjs` — not an engine implementation.

## Commands

```bash
npm run validate:spec # ajv-validate spec/ against spec/schema/, regenerate spec/fixtures/.escaped/
npm test              # vitest run — promo-site tests + conformance-fixture structure/citation checks
npm run generate:all  # regenerate README.md, promo/ site, brand/BRANDBOOK.html from spec data
npm run lint          # eslint
npm run format        # prettier --write .
npx tsc --noEmit      # type-check the remaining .ts tooling and tests
```

Run `npm run generate:all` after any edit to `spec/locales/` or `spec/fixtures/` — it regenerates
the worked examples shown in `README.md` and the promo site from the real engine (via the
`polytypo` npm package), so those pages cannot drift from what the spec actually says.
CI (`.github/workflows/ci.yml`) runs validate:spec → lint → test → generate:all (drift check) on
Node 20 and 22. `.github/workflows/pages-deploy.yml` is the separate, manually-dispatched Pages
publish workflow.

## Document authority

- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — authoritative on structure. Supersedes PLAN.md §5, §8.
- [docs/ROADMAP.md](docs/ROADMAP.md) — authoritative on milestones. Supersedes PLAN.md §8.
- [docs/PLAN.md](docs/PLAN.md) — §1–§4, §6, §7, §9 still binding (why, competitive landscape, scope, non-goals, locale data format, locale reference table, post-v1).
- [docs/REPOSITORY_SPLIT_AND_SPEC_SYNC.md](docs/REPOSITORY_SPLIT_AND_SPEC_SYNC.md) — the split design; §3 (vendored-spec manifest tooling), §4 (spec-tag dispatch automation) and §5 (conformance matrix) are not implemented yet.

PLAN.md was written for a single JS implementation; the 2026-08-15 amendment at its head overrides
that. Where PLAN.md and ARCHITECTURE.md disagree (e.g. zod vs JSON Schema for locale validation),
ARCHITECTURE.md wins. Both predate the repository split and describe the pre-split monorepo layout
in places (e.g. `src/`) — where they conflict with this file on structure, this file wins for what
lives in _this_ repository specifically. `docs/agents/agent-system-audit.md` is a generated finding
record and ranks below all of the above.

## The premise that drives every decision

polytypo targets **five runtimes** (JS/TS, Ruby, Go, PHP, Python). **The spec is the product;
implementations are replaceable.** An implementation is "polytypo" iff it passes the conformance
suite for the spec version it claims.

Consequence that matters daily: **a behaviour change is a spec change first, code second.** A
behaviour fix lands here first — a fixture in `spec/fixtures/`, updated prose in `spec/rules/` — and
only then as code in the relevant runtime repo. Fixing a bug in an implementation without a
matching fixture here is forbidden — that is how ports drift.

Layers, dependencies pointing strictly downward: `L0 spec` (this repository, runtime-agnostic) →
`L1 engine` (rule pipeline over plain text, per runtime) → `L2 modes` (text/html/markdown adapters,
per runtime) → `L3 integrations` (out of repo, out of v1).

**Multi-repo under GitHub org `polytypo`**, one repo per runtime plus this one. All five runtime
repos now exist (`polytypo-js`, `polytypo-python`, `polytypo-go`, `polytypo-ruby`, `polytypo-php` —
verified via `gh repo list polytypo`, 2026-09-09), each with real engine/mode code, not
placeholders; see ROADMAP.md Phase B/C for per-port status (PHP is the one exception still short of
a tagged release — code-complete and CI-green, but no `v1.0.0` tag pushed yet). **Spec vendoring's
target mechanism is resolved** (ROADMAP.md "Open decisions" #2, 2026-08-27): an automated,
content-hash-verified vendored snapshot, full design in `docs/REPOSITORY_SPLIT_AND_SPEC_SYNC.md`
§3–§4. That automation itself is **not implemented** — every runtime instead vendors via a manual
interim **committed copy** of the subset it needs (`locales/`, `fixtures/`, `rules/order.json`,
`rules/dashes.md`, `VERSION`, `UNICODE`), each under a runtime-specific path chosen to avoid that
ecosystem's own reserved directory name (JS/Python: `vendor/`; Go: `internal/spec/`, forced by
`//go:embed`'s no-parent-directory rule; Ruby: `lib/polytypo/data/`, avoiding RSpec's own `spec/`;
PHP: `resources/spec/`, avoiding Composer's own `vendor/`). What is decided regardless: the spec is
vendored and pinned, never fetched at runtime, and locale data is embedded into each runtime's
published artifact at build time — never loaded from this repository at runtime by any published
package.

## How this repository is laid out

- `spec/` — canonical, runtime-agnostic. `rules/*.md` (normative prose) + `rules/order.json`
  (rule ids, order, defaults, which locale fields each rule reads), `locales/*.json`,
  `fixtures/*.json` (+ CI-generated `.escaped/` mirror), `schema/*.json`, `VERSION`, `UNICODE`.
- `scripts/` — `validate-spec.mjs` (schema + cross-reference validation, the only consumer of
  `scripts/lib/is-letter.mjs` here — a deliberate duplicate of polytypo-js's copy, not shared code),
  `check-actions-pinned.mjs` / `check-workflow-shell-safety.mjs` (workflow hygiene, apply to this
  repo's own `.github/workflows/`).
- `brand/tools/` — generates the promo site (`promo/`) and brandbook (`brand/BRANDBOOK.html`) from
  spec data, calling `transform()` from the `polytypo` npm package to produce the worked examples
  shown in `README.md` and on the site.
- `tests/conformance/` — `fixture-citation-guard.test.ts` and `mode-fixture-strategy.test.ts` check
  `spec/fixtures/*.json` structure and citation quality directly; there is no engine here to run
  them through, so this is _not_ the conformance suite itself — see the relevant runtime repo for
  that. `fixtures.ts`'s two type-only imports come from the `polytypo` package's public types, not
  a local engine.
- `tests/promo/` — the promo site's own tests (generated HTML content, no external requests, link
  depth, hostile-output guards).
- `tests/scripts/validate-spec-version.test.ts` — the one script test that stayed here (tests
  `scripts/validate-spec.mjs`'s own drift check, canonical-only — see polytypo-js's `AGENTS.md`
  for its own, separate `tests/scripts/`).

Current error codes (see the relevant runtime repo's `errors.ts`), all seven:
`POLYTYPO_UNKNOWN_LOCALE`, `POLYTYPO_INVALID_MODE`, `POLYTYPO_INVALID_DIALECT`,
`POLYTYPO_UNKNOWN_RULE`, `POLYTYPO_MALFORMED_LOCALE_DATA`, `POLYTYPO_RULE_CONTRACT`,
`POLYTYPO_MALFORMED_INPUT`. These are spec-level contract, not implementation detail — every
runtime must expose the same seven codes.

Nine rules in spec order: `spaces` `ellipsis` `ranges` `dashes` `hyphen` `quotes` `apostrophe`
`symbols` `nbsp`. `ranges` is the one rule that defaults to off (spec 0.5.0) — see `order.json`.
All three modes — `text`, `html`, `markdown` — are specified (M2 is done for JS).

## Portability constraints every runtime's implementation must satisfy (ARCHITECTURE.md §4, §7)

Nothing in this repository enforces these directly (there is no engine here), but spec prose must
never demand behaviour these rule out, because they are expensive to reverse per-runtime once code
exists:

- **No regex in core rules.** Go's RE2 has no lookahead/lookbehind/backreferences. Rules are a
  single left-to-right scan over a code-point array with explicit lookaround by index. Regex is
  allowed only in build tooling, tests, and literal-string matching lists.
- **Index by Unicode code point**, never a native string. UTF-16 offsets do not survive the port.
- **Never normalize input.** Inserted characters are NFC and specified by code point in the spec
  (`U+00A0`, `U+202F`, `U+2019`), never as literal glyphs in prose. Locale files are stored in NFC
  (CI-enforced, here, by `validate:spec`).
- **No locale-dependent stdlib calls** — no `toLowerCase()` without explicit locale, no
  `localeCompare`, no ICU collation. (Turkish dotless ı.)
- **Rule order comes from `spec/rules/order.json`**, not registration order and never map iteration order.
- **Errors carry stable machine codes.** Messages are English and not part of the contract; codes are.
- **Locale resolution is specified in the spec** (`de-AT` → `de`, see `spec/rules/locale-resolution.md`
  and its fixture file), not delegated to a platform locale-negotiation library.
- **`transform` is pure**: no I/O, env, clock, globals, filesystem, network; reentrant; no
  module-level mutable state; no global configuration.
- **Rules produce edits; the pipeline applies them.** The applying step enforces the rule contract
  (in-bounds, ascending, non-overlapping, valid code points, correct `ruleId` tag) rather than
  trusting it. Do not implement a reserved `analyze()`-style API before the spec calls for one.

## Locale data vs. code

Declarative facts (quote glyphs, dash conventions, nbsp lists, `sources`) live in
`spec/locales/<code>.json`. Algorithms (quote open/close resolution and nesting, Russian hyphen
morphology, range/initials detection, rule ordering) live in each runtime's code, never here.

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
idempotency case — a conformant runtime's own runner asserts `transform(out) == out`. Cases are
tagged with a `rule` id so a runtime can report partial conformance honestly.

`transform(transform(x)) === transform(x)` is a hard invariant every runtime must prove with
property-based tests, not just fixtures — enforced in that runtime's own repo (see polytypo-js's
`tests/engine/idempotency.test.ts`), not here. **A failing idempotency property is a release
blocker, not a bug report.** A red conformance run blocks release, always.

Rule ids are **public API** (they appear in the `rules` option and future CMS config). Renaming one
is a breaking change.

## Scope discipline

v1 locales are `en-US` `en-GB` `de-DE` `de-CH` `fr` `fr-CA` `ru` `fi` `sv` `el` (aliases `en`→`en-US`,
`de`→`de-DE`). **The six-locale cap was withdrawn 2026-08-15 by operator decision — coverage is a
goal, and the constraint is evidentiary rather than numeric: a locale ships only as the PLAN §6.2
triple (data + fixtures + citation).** Also three modes. PLAN.md §4 lists non-goals that **must be
refused without an explicit operator decision**: language auto-detection, hyphenation, optical
alignment, spellcheck, hosted API, plugin/extension API, CMS integrations, demo page, more locales,
framework wrappers. ARCHITECTURE.md §9 adds: no code generation or WASM core shared across
runtimes, no RPC between runtimes, no port started before the M4 dogfooding gate passes.

If a decision comes down to "add a language" vs "make an existing language provably correct" —
choose correctness.

The acceptance test that actually mattered for JS was **M4**: dry-run over the author's own MDX
blog content, full diff reviewed by hand, ship criterion **zero false positives** — already passed
(see polytypo-js's own history). The original plan was for each new runtime to clear its own
M4-equivalent gate before its first port work starts; **operator decision, 2026-09-07 (ROADMAP.md
Phase B) explicitly overrode that precondition** for Python and every port after it, starting port
work as soon as `polytypo@1.0.0`/`1.0.1` shipped on npm rather than waiting for real-content
dogfooding on the JS package itself. Do not assume a runtime has cleared its own dogfooding gate
just because its repo exists — check ROADMAP.md's per-port checklist.

## Open decisions (do not resolve unilaterally)

Per ROADMAP.md: **first port** — resolved, in order: Python (2026-09-07), then Go, Ruby, PHP (all
2026-09-08; PHP still needs its `v1.0.0` tag pushed and a one-time manual Packagist bootstrap before
it's actually published). **Spec vendoring mechanism** — the target model is resolved (2026-08-27,
see "Multi-repo" above), but the manifest/dispatch **automation** in
`REPOSITORY_SPLIT_AND_SPEC_SYNC.md` §3–§4 is not implemented; each port's manual interim copy does
not itself resolve that remaining gap. **Repo visibility** — all five repos were created public
(verified via `gh repo list polytypo`, 2026-09-09); ROADMAP.md's own "Open decisions" list does not
mark this ~~resolved~~ explicitly, so treat it as an observed fact, not confirmed settled policy,
until the operator says otherwise.

## Agent infrastructure

Three agents, all read-only — none of them writes spec, locale data or code:

- `spec-guardian` — review gate before any milestone is declared green and for any change to
  `spec/rules`, `order.json`, `locale.schema.json`, fixtures, or error codes. Enforces
  spec-before-code and the portability constraints above.
- `locale-authority` — verifies a locale claim against its normative source and produces the
  mandatory `sources` citation, before any locale file, rule example or README row lands. Treats
  PLAN.md §7 as unverified research.
- `agent-system-auditor` — run by `/audit-agent-system`; audits the agents and commands themselves.

On claim-bearing prose (README locale and competitor tables), facts are verified first and
`humanizer` runs after, never the reverse.
