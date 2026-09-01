# polytypo — Architecture

**Status:** authoritative. Supersedes [PLAN.md](PLAN.md) §5 and §8.
**Date:** 2026-08-15
**Applies to:** every runtime implementation.

This document exists for one reason: **polytypo will exist in five runtimes (JS/TS, Ruby,
Go, PHP, Python), and every decision that is hard to reverse later is made here, once.**
If a choice below looks over-specified for a one-week JS package, that is deliberate — it
is specified so that port #4 does not force a rewrite of port #1.

Read [PLAN.md](PLAN.md) §4 first. Nothing here authorizes building anything listed there.

---

## 1. The one principle

**The spec is the product. Implementations are replaceable.**

The canonical artifact is not `polytypo` on npm. It is:

* **locale data** — declarative typographic conventions per locale, with normative citations;
* **rule semantics** — a written definition of what each rule does, precise enough that two
  people in two languages produce byte-identical output;
* **conformance fixtures** — the executable form of the above.

A runtime implementation is "polytypo" if and only if it passes the conformance suite for
the spec version it claims. That is the entire compatibility story, and it is what makes
five runtimes tractable instead of five divergent forks.

Corollary: **a behaviour change is a spec change first, and code second.** Fixing a bug in
the JS package without adding a fixture is how the ports drift apart. Not allowed.

---

## 2. Layers

```
L0  spec/          locale data + rule semantics + conformance fixtures   ← canonical
L1  engine         rule pipeline over plain text, one per runtime
L2  modes          text | html | markdown adapters, one per runtime
L3  integrations   CLI, HTTP API, CMS plugins                            ← out of repo, out of v1
```

Dependencies point strictly downward. L0 knows nothing about any runtime. L1 knows nothing
about HTML or Markdown. L3 does not exist yet and is not designed for.

### L0 — spec

* `spec/locales/<code>.json` — declarative locale data (shape per PLAN.md §6)
* `spec/rules/<rule-id>.md` — semantics of one rule, prose + examples
* `spec/fixtures/<code>.json` — input/expected pairs
* `spec/schema/locale.schema.json` — **JSON Schema**, not zod
* `spec/VERSION` — spec version (semver)

> **JSON Schema, not zod.** PLAN.md §6 said "zod schema". Overridden: zod is a JS library
> and cannot validate the spec in a Go or PHP CI job. The canonical schema is JSON Schema;
> each runtime validates against it with whatever local library it likes. A JS-side zod
> type may be *generated* from it for ergonomics, never hand-maintained alongside it.

### L1 — engine

Per runtime, the nine rules of `spec/rules/order.json` over a plain string. No I/O, no env, no
clock, no locale-dependent library calls (see §4.6). Pure function in, pure string out.

> **Corrected 2026-08-15.** This read "~7 rules". The count was eight and it was not approximate —
> `order.json` is the source of truth and `hyphen` was added at order 35. Rule count is not a
> rounding matter: a port that implements seven of eight failed conformance.
>
> **Corrected spec 0.5.0.** The count is now nine: `ranges` (order 25, off by default) was split
> out of `dashes`, which retains only parenthetical-dash processing. A port implementing eight of
> nine — omitting `ranges` — is non-conforming even though `ranges` defaults off, exactly as
> omitting any other default-off behaviour would be; "off by default" is a runtime option, not
> licence to skip implementing the rule.

### L2 — modes

Per runtime, adapters that extract processable text spans and reassemble the document
untouched elsewhere. The parser differs per runtime (`parse5` in JS, `nokogiri` in Ruby,
`golang.org/x/net/html` in Go, DOM in PHP, `lxml`/`html5lib` in Python) — the **skip list
and the reassembly guarantee do not**, and both live in the spec.

---

## 3. Repository layout

GitHub org `polytypo`. **Multi-repo, one repo per runtime, plus the canonical repo.**

```
polytypo/polytypo         ← canonical: spec, fixtures, schema, brand, public site
polytypo/polytypo-js      ← npm
polytypo/polytypo-php     ← packagist
polytypo/polytypo-python  ← pypi
polytypo/polytypo-ruby    ← rubygems
polytypo/polytypo-go      ← go module
```

Rationale for multi-repo over a monorepo: every one of these ecosystems expects a repo root
it can consume directly (`go get` on a subdirectory is friction; Packagist and RubyGems both
assume a repo). A polyglot monorepo also means every runtime's CI runs on every locale-data
typo. Multi-repo costs one thing — spec distribution — and §3.1 solves that.

**Until the multi-repo split happens**, "each implementation repo" describes an intended end
state, not the present layout. This section's repo table is a plan, not a description. The
implementation-ready design — inventory, migration runbook, and acceptance checklist — is
`docs/REPOSITORY_SPLIT_AND_SPEC_SYNC.md`; it is authoritative on execution detail and supersedes
this section wherever the two might read as disagreeing.

### 3.1 How each runtime gets the spec

**Vendored, pinned, content-hash-verified, and never fetched at runtime — decided, not open.**

> **Corrected 2026-08-27.** This section previously left the submodule-vs-package transport
> question open (ROADMAP.md "Open decisions" #2). It is resolved: `docs/REPOSITORY_SPLIT_AND_SPEC_SYNC.md`
> §3 specifies an automated, vendored, content-hashed snapshot (`vendor/polytypo-spec/`) as the
> transport, dispatched from the canonical repository on every `spec-vX.Y.Z` tag and verified by
> each runtime before it is applied — neither a git submodule nor a consumer-time git dependency.
> That document is the authoritative source for the manifest format, the hash algorithm, and the
> dispatch/verification flow; this section states the decision and its consequences only.

* The spec is **vendored, pinned, and hash-verified** into each implementation repo — a fixed spec
  version, chosen deliberately by merging a reviewed update PR, never resolved at build time and
  never fetched over the network during ordinary use.
* A build step copies the vendored locale data into the runtime's package payload, so the published
  artifact is self-contained and does not require the vendored spec directory at install time.
* Locale data is **embedded** in the shipped artifact (`import` in JS, `embed.FS` in Go, package
  data in Python/Ruby/PHP). No filesystem reads at runtime, anywhere, ever — this is what keeps the
  library usable in browsers, edge runtimes, and serverless.
* Each implementation's README, and a programmatic export, state the spec version it implements.
  The npm package `polytypo@1.4.0` implementing spec 1.2.0 is normal and expected — the package
  name (`polytypo`), the repository name (`polytypo-js`), and the spec's own tag syntax
  (`spec-vX.Y.Z`, never a name a registry would publish) are three distinct identifiers and are not
  interchangeable.
* Until the multi-repo split executes, `scripts/gen-locales.mjs` reads `spec/locales/*.json` from
  the working tree directly, which remains correct in the single-repo state and requires no change
  ahead of the split.

### 3.2 Order of construction

JS first, and **only** JS through v1 (PLAN.md §1: this is slack-time work). The spec is
extracted from day one, not retrofitted — retrofitting a spec out of a finished
implementation is precisely the rework this document exists to prevent. Ports start only
after the JS implementation has passed the dogfooding gate.

---

## 4. Portability constraints

These are the decisions that are expensive to reverse. They are binding on the JS
implementation *now*, even though nothing else exists yet.

### 4.1 No regex in core rules

Go's RE2 has **no lookahead, no lookbehind, no backreferences**. JS, PCRE (PHP), Ruby (Onigmo)
and Python all do, with differing syntax and differing Unicode property support. Any rule
written as a clever regex in JS is a rule that must be rewritten from scratch — with new
bugs — in Go.

**Therefore: core rules are implemented as a single left-to-right scan over a code-point
array, with explicit lookaround by index.** This is more code and it is not negotiable. It
also happens to be what makes quote resolution and idempotency tractable.

Regex is permitted only in: build tooling, tests, and locale-data *matching lists* that are
expressed as literal strings (e.g. the abbreviation list), never as patterns.

### 4.2 Indexing is by Unicode code point

JS strings are UTF-16, Go strings are UTF-8 bytes, Python 3 strings are code points, PHP
strings are bytes. An algorithm written against "characters" will silently disagree across
runtimes on anything outside the BMP.

**The engine operates on an explicit `int[]`/`rune[]`/code-point array.** Convert once on
entry, convert back once on exit. Never index a native string directly inside a rule.

### 4.3 Normalization policy — decided, not open

* Input is **not** normalized. `transform` never changes the Unicode normalization form of
  text it does not otherwise touch. Silently NFC-ing a user's content is a data mutation
  they did not ask for.
* Characters the engine *inserts* are always in NFC and always specified by code point in
  the spec (`U+00A0`, `U+202F`, `U+2019`, …), never by literal glyph in prose.
* Rules that *compare* text (abbreviation lists, short-word lists) compare on the raw code
  points as given in the locale file. Locale files are stored in NFC; this is enforced by a
  spec CI check.

### 4.4 No locale-dependent standard-library calls

No `toLowerCase()` without an explicit locale, no `localeCompare`, no ICU collation, no
`strtolower` (byte-wise in PHP), no Go `strings.ToLower` on Turkish input. Case folding, if
a rule ever needs it, is done against an explicit table in the spec.

Reason: Turkish dotless ı. A rule that behaves differently depending on the *host process's*
locale breaks determinism, and determinism is the whole product.

### 4.5 Deterministic rule order

Rules execute in a **fixed order declared in the spec**, not in registration order, not in
map-iteration order (Go randomizes map iteration; PHP and Python do not — a rule pipeline
built on a map is a rule pipeline that behaves differently in Go).

`spec/rules/order.json` is the single source of truth for pipeline order. Disabling a rule
removes it from the sequence; it never reorders the rest.

### 4.6 Shared error taxonomy

Errors carry a stable machine code from the spec. Each runtime raises its idiomatic error type
(JS `Error` subclass, Go `error` value, Python exception, PHP exception, Ruby `StandardError`)
**carrying that code**. Messages are English and are not part of the contract; codes are.

The taxonomy is **seven codes**, and this list is the contract every runtime implements:

| Code                             | Raised when                                                                                       |
| -------------------------------- | ------------------------------------------------------------------------------------------------- |
| `POLYTYPO_UNKNOWN_LOCALE`        | The locale is not in the registry and does not resolve to one (§4.7).                             |
| `POLYTYPO_INVALID_MODE`          | `mode` is not `text`, `html` or `markdown`.                                                       |
| `POLYTYPO_INVALID_DIALECT`       | `mode` is `markdown` and `dialect` is missing, or is not `commonmark` or `mdx` (§7).               |
| `POLYTYPO_UNKNOWN_RULE`          | The `rules` map names a rule id that does not exist in `order.json`.                              |
| `POLYTYPO_MALFORMED_LOCALE_DATA` | Embedded locale data failed schema validation.                                                    |
| `POLYTYPO_RULE_CONTRACT`         | A rule produced an edit violating the pipeline contract (§7.1).                                   |
| `POLYTYPO_MALFORMED_INPUT`       | The input does not parse in the requested language. Reachable only for `mdx`, which embeds JS.    |

> **Corrected 2026-08-15.** This section previously named three codes as though they were the whole
> taxonomy. Being wrong here is worse than elsewhere: this is the section the review gate enforces
> from, and a port built from the old text would ship an error contract missing four codes. The two
> newest — `POLYTYPO_INVALID_DIALECT` and `POLYTYPO_MALFORMED_INPUT` — are ratified public contract
> by operator decision, not provisional.

**A parser's own error type must never escape**, in any runtime. A `VFileMessage`, a
`Nokogiri::SyntaxError` or a Python exception on the public surface puts a dependency's type into a
contract the other four runtimes cannot reproduce. Wrap it; keep the code, discard the type.

Fail-fast per PLAN.md §5.1: unknown locale throws, always, in every runtime.

### 4.7 Locale resolution is specified, not per-runtime

`de-AT` → `de`. `en` → default variant declared in the spec. Fallback is a single documented
algorithm in `spec/rules/locale-resolution.md`, with fixtures. Runtimes must not use their
own platform locale-negotiation library — those disagree.

---

## 5. The rule contract

A rule is:

```
id            stable identifier, e.g. "quotes", "hyphen", "nbsp"
order         integer, from spec/rules/order.json
default       on | off
locale-data   which fields of the locale file it reads (may be none)
modes         which modes it applies in (default: all)
semantics     spec/rules/<id>.md — prose + worked examples
fixtures      tagged with the rule id
```

Rule ids are **public API** — they appear in the `rules` option, in future plugin config, in
CMS settings UI. Renaming one is a breaking change. Choose names once.

> **Corrected 2026-08-15.** The example above read `"quotes", "nbsp-abbreviations"` and described
> ids as "kebab-case". No `nbsp-abbreviations` rule exists, and the invented shape contradicted the
> eight real ids, every one of which is a **single lowercase word**: `spaces` `ellipsis` `dashes`
> `hyphen` `quotes` `apostrophe` `symbols` `nbsp`. `abbreviations` is a *field of the locale file*
> that the `nbsp` rule reads — not a rule. Since ids are public API, an illustrative id that does
> not exist is a naming precedent nobody agreed to; `order.json` is the only list.
>
> **Corrected spec 0.5.0.** Nine real ids now: `spaces` `ellipsis` `ranges` `dashes` `hyphen`
> `quotes` `apostrophe` `symbols` `nbsp`. `ranges` (order 25) is the first rule id whose
> `RULE_DEFAULTS` entry is off — a caller opts in explicitly (`{ rules: { ranges: true } }`); it
> is still a full rule id subject to the same public-API stability as the other eight.

Adding a rule is therefore a mechanical, five-step operation, which is the extensibility
goal stated in the brief:

1. `spec/rules/<id>.md` — semantics and examples
2. entry in `spec/rules/order.json` with `default`
3. locale-data fields (if any) added to `locale.schema.json`, filled for **every** locale
4. fixtures covering the rule, including an idempotency case
5. implementation in each runtime; runtimes that lag are recorded in the conformance matrix

Steps 1–4 are the contribution. Step 5 is labour. Community PRs that stop after step 4 with
a JS implementation are acceptable and expected.

### 5.1 Locale vs. rule, restated

PLAN.md §6 draws the line: declarative facts go in locale JSON, algorithms go in code. The
multi-runtime setting sharpens it — **anything expressed as configuration must be
implementable identically in five languages.** In practice this bans, from locale files:

* regex patterns of any kind (§4.1);
* ordering or priority numbers (that is `order.json`'s job);
* conditionals, expressions, or anything resembling a DSL — the failure mode PLAN.md §6
  already warned about, now with five interpreters to keep in sync.

Locale files contain literal strings, literal code points, string lists, and enum values.
Nothing else.

---

## 6. Conformance suite

The mechanism that keeps five implementations honest.

### 6.1 Fixture format

One flat, boring format, consumable by a ~50-line runner in any language:

```jsonc
{
  "spec": "1.0.0",
  "locale": "fi",
  "cases": [
    {
      "id": "fi-quotes-basic",
      "rule": "quotes",
      "mode": "text",
      "in":  "Hän sanoi \"moi\" ja lähti.",
      "out": "Hän sanoi ”moi” ja lähti.",
      "note": "Kotus: closing glyph equals opening glyph"
    }
  ]
}
```

Rules for fixtures:

* The root `"spec"` field is the current global spec contract version and must equal
  `spec/VERSION` exactly — it is not an authoring-time stamp and not a per-case introduction
  version. `scripts/validate-spec.mjs` fails closed on every fixture root that disagrees.
* `in` and `out` are written with **literal characters**, and the spec CI additionally emits
  an escaped `\uXXXX` mirror file — reviewing a diff full of invisible U+202F is otherwise
  impossible.
* Every case is automatically also an idempotency case: the runner asserts
  `transform(out) == out`. This is free coverage and catches the most common port bug.
* Cases must be tagged with a `rule` so a runtime can report partial conformance honestly.

### 6.2 Conformance matrix

`spec/CONFORMANCE.md` — a table of runtime × locale × rule, generated from CI results, not
hand-written. A runtime may ship with gaps; it may not misreport them. This is the honest
substitute for pretending five ports stay in lockstep.

> **Status, 2026-08-15: not yet generated.** `spec/CONFORMANCE.md` does not exist. This is correct
> for now and stops being correct the moment a second runtime exists — with one implementation there
> is nothing to be dishonest about, because "conformance" and "the JS test suite" are the same run.
> Recorded explicitly because the file was previously referenced as though it were present, both
> here and in ROADMAP.md's Phase B checklist.
>
> **What generates it and when:** a script in the spec repo consumes each runtime's machine-readable
> conformance report (the per-case pass/fail the fixture runner already produces, keyed by locale and
> `rule` tag) and renders the matrix. It is **due with the first port, not before** — it is
> Phase B's first checklist item, ahead of porting the engine, so that the port's gaps are visible
> from its first red run rather than reconstructed afterwards. Hand-writing it is forbidden; a
> hand-maintained conformance table is exactly the misreporting it exists to prevent.

### 6.3 CI gate

Every implementation repo runs, on every PR:

1. locale files validate against the JSON Schema;
2. full conformance suite for the pinned spec version;
3. idempotency property test (`transform∘transform == transform`) over generated input, per
   PLAN.md §3.4 — property-based, not just fixture-based, in every runtime that has a usable
   property-testing library (`fast-check`, `hypothesis`, `gopter`, `rantly`, `eris/php`);
   **plus a bounded exhaustive sweep** — every string up to a small length over a small
   alphabet, across every locale. Sampling is not enough: a uniform random generator ran
   green over this pipeline while an enumeration found the first counterexample in
   milliseconds. Bias the generator toward the alphabet that actually breaks things
   (quote marks, the hyphen family, spaces including U+00A0 and U+202F, digits, full stops)
   and enumerate as well;
   **Idempotency is a property of the pipeline, not of each rule.** Every rule being a fixed
   point on its own output does not imply the composition is one — a rule can emit a space
   that an earlier-ordered rule deletes on the next run. Each rule's output invariants and
   the composition argument live in `spec/rules/pipeline-idempotency.md`; a rule-local proof
   alone does not satisfy PLAN.md §3.4, which binds the public function;
4. round-trip test: input requiring no changes comes out byte-identical.

A red conformance run blocks release. Always.

---

## 7. What the public API must look like everywhere

Same shape, idiomatic naming per runtime. This is what makes an API or a plugin cheap later
(brief requirement), and it costs nothing now.

```
transform(input: string, options) -> string
```

`options`, in every runtime:

| Option    | Required                          | Default | Meaning                                                    |
| --------- | --------------------------------- | ------- | ---------------------------------------------------------- |
| `locale`  | yes                               | none    | Unknown locale throws. Never falls back (§4.7).            |
| `mode`    | no                                | `text`  | `text` \| `html` \| `markdown`.                            |
| `dialect` | **yes when `mode` is `markdown`** | none    | `commonmark` \| `mdx`. Ignored in the other two modes.     |
| `rules`   | no                                | all on  | Opt-out map keyed by rule id; `false` disables.            |

> **Corrected 2026-08-15.** This listed only `locale`, `mode` and `rules`. A port built from the old
> text would ship a `markdown` mode it cannot implement: **`dialect` has no default and must not
> acquire one.** CommonMark and MDX disagree about ordinary documents, so the caller supplies the
> fact — it is the file extension, which the library cannot observe. Detection is **forbidden, not
> merely unimplemented**: one `<https://…>` autolink makes a file invalid MDX, and a heuristic would
> then silently reclassify an ESM statement as prose. Omitting it raises
> `POLYTYPO_INVALID_DIALECT` (§4.6), which is the fail-fast rule applied to a second required fact.

Constraints, binding in every runtime:

* **Pure.** No I/O, no env, no clock, no globals, no filesystem, no network. Reusability in
  an API, a CMS hook, or a worker is a *consequence* of purity, not of any extra machinery.
* **Thread/goroutine-safe and reentrant.** No mutable module-level state. Go and Ruby ports
  will be called concurrently; JS will not care; the constraint is written once, here.
* **No global configuration.** Everything through the call. A CMS processing three languages
  in one request must not be able to poison one field's locale with another's.

### 7.1 Reserved, not implemented in v1

Recorded here so the shape is not accidentally foreclosed. **Do not build these now** — they
are listed to prevent a v1 API that makes them impossible:

* `analyze(input, options) -> Change[]` — same pipeline, reporting `{ruleId, start, end,
  before, after}` instead of applying. Every bulk-rewrite integration (PLAN.md §9) needs a
  dry-run diff, and retrofitting one onto a pipeline that only knows how to concatenate
  strings is a rewrite. The engine must therefore be written so each rule reports *edits*,
  and the pipeline applies them — even though v1 only ever exposes the applied string.

That single design choice — **rules produce edits, the pipeline applies them** — is the one
piece of v1 internal structure that exists for the future, and it is authorized because
without it, `analyze` and every CMS integration is a rewrite.

---

## 8. Governance of locale data

PLAN.md §6.1 and §6.2 stand and are strengthened by the multi-runtime setting:

* A locale is accepted as a triple: locale JSON + fixtures + normative citation. No fixtures,
  no merge.
* A locale change is a **spec change** with a version bump — all five runtimes inherit it by
  bumping their pin. Never patch locale data inside an implementation repo.
* Disagreements about a locale's rules are settled by citation, not by preference or by vote.
  This is the only workable moderation policy for a community-owned rule set, and it is the
  reason §6.1 was mandatory in the first place.

---

## 9. Explicitly out of scope, restated for the multi-runtime context

In addition to everything in PLAN.md §4:

* **No shared code generation across runtimes.** No transpiling the JS engine to Go, no
  WASM core. Each port is hand-written against the spec. A WASM core sounds like it saves
  work and instead produces a package that is unusable in exactly the environments each
  ecosystem cares about, plus a debugging story nobody wants.
* **No RPC or service boundary between runtimes.** They share data, not processes.
* **No plugin/extension API in v1**, in any runtime. Stable rule ids (§5) are the affordance;
  third-party rule loading is not.
* **No port started before the JS dogfooding gate passes.** Porting a design that has not
  yet met real content is porting bugs five times.
