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

## Phase B — first port (not authorized yet)

Starts only after M4 is clean and the JS package has been used on real content for a while.
**Exactly one port first**, to discover what the spec failed to specify — porting to four
runtimes in parallel just multiplies the same gaps.

Recommended first port: **Python** or **Go**. Python for the shortest path (spec-clarity test
with the least ceremony); Go for the harshest portability test (RE2, byte strings, random map
iteration — it will find every place ARCHITECTURE.md §4 was violated). PHP is the least
interesting first choice: JoliTypo already serves that ecosystem well (PLAN.md §2).

Per-port checklist — this is the whole job, and it is deliberately mechanical:

- [ ] **Generate `spec/CONFORMANCE.md` first.** It does not exist yet, and correctly so: with one
      implementation, "conformance" and "the JS test suite" are the same run. It is written by a
      script over each runtime's machine-readable conformance report, never by hand
      (ARCHITECTURE.md §6.2). Building it *before* the port means the port's gaps are visible from
      its first red run instead of reconstructed afterwards
- [ ] Vendor `spec` per the chosen automated snapshot model (`docs/REPOSITORY_SPLIT_AND_SPEC_SYNC.md`
      §3–§4: content-hash-verified `vendor/polytypo-spec/`, dispatched on `spec-vX.Y.Z` tags — not a
      submodule, not a per-ecosystem spec package); embed locale data in the package
- [ ] Port the engine: code-point array, no regex, fixed rule order, all nine rules (including `ranges`, off by default)
- [ ] Port the three modes with the runtime's own HTML/Markdown parser; same required `dialect`
- [ ] Same public shape, idiomatic naming; the same seven error codes
- [ ] Conformance suite green; idempotency property test green
- [ ] Update `spec/CONFORMANCE.md` with the new runtime's column
- [ ] Publish to the ecosystem's registry

**Success criterion for Phase B:** the port required **zero changes to the spec's
semantics** — only clarifications. Every semantic change needed is a defect in Phase A's
spec work, and must be fixed in the spec and back-propagated to JS.

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
3. **First port** — Python (fast feedback) or Go (harshest portability test). Not needed
   until Phase B.
