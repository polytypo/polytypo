# polytypo — Roadmap

**Status:** authoritative. Supersedes [PLAN.md](PLAN.md) §8.
**Date:** 2026-08-15

Priority stays low (PLAN.md §1). Phases are ordered, not scheduled. Each milestone lands
green before the next starts. Estimates are focused-work days, not calendar days.

---

## Phase A — spec + JS reference implementation (v1)

The only phase authorized to start. Ports do not begin here.

### M0 — Spec skeleton (~0.5 d)

Comes **first**, not last. Extracting a spec from a finished implementation is the rework
this whole plan exists to avoid.

- `spec/` repo: `locales/`, `rules/`, `fixtures/`, `schema/locale.schema.json`, `VERSION`
- `locale.schema.json` covers quotes, dash, nbsp, sources (PLAN.md §6 shape)
- `rules/order.json` with the v1 rule ids and their defaults — **nine**, not the seven this line
  originally said: `spaces` `ellipsis` `ranges` `dashes` `hyphen` `quotes` `apostrophe` `symbols`
  `nbsp`. `hyphen` was added at order 35 (corrected 2026-08-15); `ranges` was split out of
  `dashes` at order 25, off by default (corrected spec 0.5.0)
- `rules/<id>.md` stubs — semantics written before implementation, not after
- `rules/locale-resolution.md` — the fallback algorithm (ARCHITECTURE.md §4.7)
- Spec CI: schema validation + NFC check on locale files + escaped-mirror generation for fixtures

**Done when:** a locale file with a typo fails the spec CI.

### M1 — Engine + `text` mode + `en`, `fi`, `sv` (~3 d)

- Code-point scanner engine; **rules emit edits, pipeline applies them** (ARCHITECTURE.md §7.1)
- No regex in rules; no locale-dependent stdlib calls (ARCHITECTURE.md §4.1, §4.4)
- Locale data embedded in the build output, loaded in exactly one place (`scripts/gen-locales.mjs`)
  and never read from disk at runtime — **delivered**

> **Corrected 2026-08-15, transport decision updated 2026-08-27.** This item read "Spec vendored as
> a submodule; locale data embedded in the build output" and counted the whole line as delivered.
> The embedding half is delivered; vendoring the spec into each runtime repository **is not, and was
> never M1's to deliver** — the project is still one repo, `spec/` is an ordinary directory, there is
> no `.gitmodules`. Spec distribution is no longer an open decision (see "Open decisions" #2 below):
> the chosen transport is an automated, vendored, content-hash-verified snapshot, not a submodule —
> full design in `docs/REPOSITORY_SPLIT_AND_SPEC_SYNC.md` §3–§4. Vendoring becomes real work at the
> multi-repo split, which has not happened.
- Unknown locale throws with `POLYTYPO_UNKNOWN_LOCALE`
- Conformance runner + `fast-check` idempotency property, every rule × locale

**Done when:** conformance and property runs are green and the runner is generic enough that
a second runtime could use the same fixtures unchanged.

### M2 — `html` and `markdown` modes (~2 d)

- Skip list from the spec, enforced; attributes never touched
- Byte-identical round-trip on no-op input
- Regression fixture: MDX with fenced code, inline code, and a bare URL survives untouched
- `markdown` takes a **required `dialect`** (`commonmark` | `mdx`) with no default; omitting it
  raises `POLYTYPO_INVALID_DIALECT`, and dialect detection is refused outright (ARCHITECTURE.md §7)
- No parser error type on the public surface: parse failures surface as `POLYTYPO_MALFORMED_INPUT`

Both modes are **implemented** — `src/modes/{html,markdown,spans,parse-error}.ts`, covered by
`tests/modes/`, with `parse5` and the `micromark` extensions as ordinary runtime dependencies
(PLAN.md §5.2 amendment). Declaring the milestone green remains the `spec-guardian` gate's call, not
this document's.

### M3 — `de`, `ru`, `fr` (~3 d)

- Every row of PLAN.md §7 verified against its normative source before it lands (that table
  is research, not fact); `sources` populated
- French U+202F verified visually in a browser, not only in tests
- Russian hyphen morphology with fixture coverage

### M4 — Dogfooding gate (~0.5 d) — the real acceptance test

- Dry-run over `~/Projects/rogulia/content/blog/**/*.mdx`, full diff reviewed by hand
- **Ship criterion: zero false positives.** Any change the author would not have made by
  hand is a bug. Fix, re-run, repeat until clean.

### M5 — Publish JS + spec 1.0.0 (~1 d)

- README: locale table, source citations, honest comparison to `typograf` / `JoliTypo` / `typopo`,
  and the five-line contribution rule (PLAN.md §6.2)
- MIT, GitHub Actions CI (schema + conformance + property + build)
- Two distinct tag identities, both currently `1.0.0` in value but never interchangeable: the
  canonical spec tag `spec-v1.0.0` and the npm package tag `v1.0.0`. For this single-repo v1, an
  operator creates and pushes `spec-v1.0.0` at the release commit first, then creates and pushes
  `v1.0.0` at the exact same commit — only the `v*` push triggers `.github/workflows/release.yml`.
  Before building or publishing anything, that workflow verifies both tags resolve to the same
  commit (`scripts/verify-release-tag.mjs` for the package tag, `scripts/verify-spec-tag.mjs`,
  deriving the required tag name from `spec/VERSION`, for the spec tag); pushing `spec-v1.0.0`
  alone publishes nothing. Once a remote exists, tag protection against force-moving either tag
  family is a required repository setting (`docs/REPOSITORY_SPLIT_AND_SPEC_SYNC.md` §4.4) — not
  yet applicable, since no remote is configured. The dispatch automation that opens per-runtime
  update PRs on a `spec-v*` push (`docs/REPOSITORY_SPLIT_AND_SPEC_SYNC.md` §3–§4,
  `docs/AUDIT_REMEDIATION_AND_RELEASE_PLAN.md` §8.4) is future, post-split work — not implemented
  in this single-repo v1
- No downloads badge until the number is non-trivial

**Phase A total: ~10 focused days.** Longer than PLAN.md's original week; the delta is M0 and
the no-regex scanner, both bought deliberately to make Phase B cheap.

---

## Phase B — first port (underway)

Originally gated on "M4 is clean and the JS package has been used on real content for a while."
**Operator decision, 2026-09-07: started immediately after `polytypo@1.0.0`/`1.0.1` shipped on
npm**, overriding that precondition — the JS package had not yet been used on real content for a
"while" when Python work began the same day. M4 itself had already passed.

Recommended first port: **Python** or **Go**. Python for the shortest path (spec-clarity test
with the least ceremony); Go for the harshest portability test (RE2, byte strings, random map
iteration — it will find every place ARCHITECTURE.md §4 was violated). PHP is the least
interesting first choice: JoliTypo already serves that ecosystem well (PLAN.md §2).
**Operator decision, 2026-09-07: Python chosen** as the first port.

Per-port checklist — this is the whole job, and it is deliberately mechanical:

- [x] **Generate `spec/CONFORMANCE.md` first.** Done 2026-09-07, but minimally: written by
      `scripts/gen-conformance.mjs` over `scripts/conformance-status.json` (hand-maintained
      per-runtime status), not the full machine-readable-report/cross-repo-dispatch design
      ARCHITECTURE.md §6.2 and REPOSITORY_SPLIT_AND_SPEC_SYNC.md §5 describe — that automation
      remains deferred. Building it *before* the port means the port's gaps are visible from its
      first red run instead of reconstructed afterwards
- [x] Vendor `spec`. Done 2026-09-07, but via a **manual interim copy** — the same status as
      polytypo-js's own vendoring, not the automated content-hash-verified snapshot model
      `docs/REPOSITORY_SPLIT_AND_SPEC_SYNC.md` §3–§4 describes. That model remains an open
      decision (see "Open decisions" #2 below), not resolved by either port choosing the interim
      answer independently. Locale data is embedded into the built package at build time, never
      read from `vendor/` at runtime.
- [x] Port the engine. Done 2026-09-07: code-point array throughout (`str` is already
      code-point-indexed in Python, unlike JS's UTF-16), no regex, rule order and defaults derived
      from `order.json` at import time, all nine rules including `ranges` (default off).
- [x] Port the three modes, with a caveat. Done 2026-09-07 for `text` and `html`
      (stdlib `html.parser`) and for `markdown`'s `dialect="commonmark"` (tree-sitter-markdown —
      chosen over `markdown-it-py` after that library turned out not to report absolute source
      offsets for inline tokens and to decode escapes/entities in its `text` token content, both
      of which break the mode contract's round-trip guarantee outright). **`dialect="mdx"` is
      not implemented** — Python has no MDX/JSX parser candidate evaluated yet — and raises
      `POLYTYPO_INVALID_DIALECT` immediately rather than silently mishandling a dialect it does
      not support. This is a narrower, honestly-declared conformance claim, not a defect; see
      `spec/CONFORMANCE.md`.
- [x] Same public shape. Done 2026-09-07: `transform(input, *, locale, mode="text", dialect=None,
      rules=None)`, the same seven error codes on one `PolytypoError` class, and
      `polytypo.text`/`polytypo.html`/`polytypo.markdown` as the idiomatic-Python equivalent of
      the JS subpath exports (each excludes the parser dependency the other modes don't need).
- [x] Conformance suite green; idempotency property test green. Done 2026-09-07: all 1015
      fixture cases minus the 5 `dialect="mdx"` cases (correctly declined, not silently wrong) —
      1010/1010 — plus all 36 locale-resolution cases, plus hypothesis-based and bounded
      -exhaustive idempotency sweeps (including around the html/markdown line-boundary marker).
- [x] Update `spec/CONFORMANCE.md` with the new runtime's column. Done 2026-09-07.
- [ ] Publish to the ecosystem's registry. **Not done.** `polytypo/polytypo-python` has not been
      created on GitHub yet; nothing has been pushed; PyPI Trusted Publishing has not been
      configured. CI (`.github/workflows/ci.yml`) and a release workflow using PyPI Trusted
      Publishing (`.github/workflows/release.yml`) are written and passing locally, but neither
      has run in GitHub Actions yet.

**Success criterion for Phase B:** the port required **zero changes to the spec's
semantics** — only clarifications. Every semantic change needed is a defect in Phase A's
spec work, and must be fixed in the spec and back-propagated to JS.

**One discrepancy surfaced, not resolved, during the Python port (2026-09-07):** `modes.md` §3.3's
table states that `nbsp`'s `OPENISH`/`CLOSEISH` classes include the span-boundary `MARKER`
(alongside `quotes` and `apostrophe`, which do). The JS reference implementation's `nbsp.ts` does
not add `MARKER` to its own `isOpenish`/`isCloseish` (only `LINE_MARKER` is honored, via
`isBreak`). Python's port matches JS's actual behaviour (cross-runtime consistency with the
existing published implementation), not the literal table — meaning N3/N7/N9/N10's left-context
guard currently declines a match that starts exactly at an html/markdown span boundary, in both
runtimes. No fixture in either runtime currently exercises this exact shape. This needs a
spec-guardian call on which side is correct — the table or the reference implementation — before
it is resolved in either runtime.

## Phase C — remaining ports

Ruby, PHP, and the rest, one at a time, same checklist. No parallel porting.

## Phase D — integrations (not authorized; see PLAN.md §9)

Only after `analyze()` exists, and only in the order and under the conditions PLAN.md §9
specifies. Shopify only in response to a specific paying merchant.

---

## Open decisions for the operator

Carried from PLAN.md §10, plus what multi-runtime adds:

1. **Repo visibility** — public from commit one, or private until M4? Public helps the
   case-study narrative; private avoids a half-correct French locale shipping under the
   author's name.
2. **Spec distribution** — ~~open~~ **resolved (2026-08-27):** an automated, vendored,
   content-hash-verified snapshot (`vendor/polytypo-spec/`), dispatched from the canonical
   repository on every `spec-vX.Y.Z` tag — not a git submodule, not a per-ecosystem published
   package, not a consumer-time git dependency. Full manifest format, hash algorithm, and
   dispatch/verification flow: `docs/REPOSITORY_SPLIT_AND_SPEC_SYNC.md` §3–§4. ARCHITECTURE.md
   §3.1 reflects this decision. Nothing in the current single-repo state depends on it yet —
   `scripts/gen-locales.mjs` reads `spec/locales/*.json` from the working tree, unchanged until the
   multi-repo split executes.
3. **First port** — ~~open~~ **resolved (2026-09-07):** Python. See Phase B above.
