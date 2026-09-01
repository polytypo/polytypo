# Multilingual Microtypography Package — Plan & Rationale

**Status:** approved for build, low priority
**Owner:** Iurii Rogulia
**Working name:** `polytypo` (npm name verified free 2026-08-15; alternatives also free: `typoglot`, `typonorm`, `multitypo`, `typeset-i18n`)
**Target repo:** `~/Projects/polytypo` — a **new standalone repo**, not part of `rogulia`

> **Amendment 2026-08-15.** This document was written under the assumption of a single
> JavaScript implementation. The operator has since decided that polytypo targets
> **five runtimes** (JS/TS, Ruby, Go, PHP, Python) and must be a viable base for an API
> and for CMS plugins. Everything below stands, with these overrides:
>
> * The **canonical artifact is the spec** (locale data + rule semantics + conformance
>   fixtures), not the JS package. See [ARCHITECTURE.md](ARCHITECTURE.md).
> * §4 "no plugin API / no integrations / one runtime" remains a **v1 shipping scope**
>   limit, not an architectural one. Ports and integrations stay out of v1; the
>   structure that makes them cheap is built in from commit one.
> * §5 (`src/` layout) and §8 (milestones) are superseded by
>   [ARCHITECTURE.md](ARCHITECTURE.md) and [ROADMAP.md](ROADMAP.md). §1–§4, §6, §7, §9
>   remain in force as written.

---

## 0. How to use this document

This is the single brief for whoever implements the package. It states what to build, what **not** to build, and what "done" means. Read §4 (non-goals) before writing any code — most of the risk in this project is scope, not difficulty.

Two rules override anything below:

1. **No monetization is expected.** Do not add licensing, telemetry, paid tiers, hosted API, or "pro" features. See §1.
2. **Do not build for hypothetical contributors or hypothetical platforms.** The data-driven design in §6 exists to make *the author's own* locale additions cheap. Plugin/integration work is explicitly out of scope for v1 (§4).

---

## 1. Why this is being built (and what it is not)

**Decision made 2026-08-15, after a market check.** The package is built as a personal tool and a credibility artifact. It is **not** an investment and **not** a product.

Expected return, stated honestly so nobody re-derives optimistic numbers later:

- **Revenue: zero.** Typography is a pure, stateless function. Anyone can vendor a library in an hour. There is nothing to sell — no external data source, no privileged access, no infrastructure to rent. Contrast with the VAT-validation node, whose value is access to VIES, not the code.
- **Downloads: low.** The closest multilingual competitor, `typopo`, ships 5 languages plus a VS Code extension and does ~386 downloads/week. Assume the same order of magnitude.
- **Real value:** (a) the author uses it on his own MDX content; (b) it is a concrete talking point with technical interviewers; (c) it may later become the engine behind a CMS integration that *is* commercially relevant (§9).

**Priority is low.** This work must not displace outreach, SEO, or client work. It is built in slack time.

---

## 2. Verified competitive landscape

Checked 2026-08-15 against npm registry, GitHub sources, and download APIs. Re-verify before publishing — these move.

| Tool | Real language coverage | Runtime | Downloads/wk | Assessment |
|---|---|---|---|---|
| [`typograf`](https://github.com/typograf/typograf) v7.8 | `ru`, `en-GB`, `en-US` **only**. 107 rules; ~55 are Russian-specific (`из-под`, `гг.`, `ООО`, initials) | JS, HTML-aware via safe-tags | 16.6k | A Russian typographer with an English veneer. Not multilingual. |
| [`JoliTypo`](https://github.com/jolicode/JoliTypo) v1.7 (2026-03-30) | ~50 locales in `LocaleConfig::QUOTE_STYLES_BY_LOCALE`; French spacing, Swiss-German spacing; `fi`/`sv` correctly handled | **PHP**, DOM-based | n/a (Packagist) | **The strongest prior art.** Actively maintained. Solves this problem — in PHP. |
| [`typopo`](https://github.com/surfinzap/typopo) v3.1 | `en`, `de`, `sk`, `cs`, `rue` | JS | 386 | Genuinely multilingual, but tiny reach and no HTML-DOM safety story. |
| `retext-smartypants` v6.2 | English-centric | JS (unified) | 4.7M | Quotes and dashes only. Huge reach because it is a transitive dependency. |
| `remark-typography` v0.7 | English (`english` keyword) | JS (remark) | 10.5k | Markdown only, single language. |
| `smartquotes` v2.3 (2020) | English | JS | 132k | Unmaintained, quotes only. |

**The gap, stated precisely:** in PHP, multilingual HTML-aware microtypography is a solved problem. **In JavaScript/TypeScript it is not.** The JS ecosystem offers either a Russian typographer or English curly quotes. No JS package knows that Finnish closes a quote with the same glyph it opens with, or that French requires U+202F before `? ! ; :` and inside `« »`.

**Positioning:** *"JoliTypo for the JS/TS ecosystem."* Not "another typographer."

**Amended 2026-08-15 by operator decision.** The original text here read: *"Explicit losing strategy — do not adopt it: competing with JoliTypo on locale count."* That is withdrawn. **Breadth of coverage is a goal, not a risk.** The reasoning that produced the original position still holds in one respect and is retained as the gate rather than as a cap: a locale is admitted only as the triple of §6.2 — locale data, fixtures, and a normative citation. Guessed locales are still forbidden; *many* locales are not. If a decision comes down to "add a language" vs "make an existing language provably correct," do both — the triple is what makes that possible without trading one for the other.

---

## 3. Scope — what v1 does

### 3.1 Languages (first wave)

`en` · `fi` · `sv` · `de` · `ru` · `fr` · `el`

> **Amended 2026-08-15.** This section read "exactly six" and capped the count. The cap is
> withdrawn by operator decision: coverage is a goal. Greek (`el`) was added on that basis and
> is shipped in v1. Further locales are admitted whenever they arrive as the complete triple
> required by §6.2 — locale data, fixtures, and a normative citation. There is no numeric limit;
> there is an evidence requirement.

Rationale: `en`/`fi`/`sv`/`de` are the author's working markets; `ru` is verifiable by the author firsthand; `fr` is the most visibly broken language on the web (narrow no-break spaces) and therefore the most convincing demonstration. `fi` and `sv` share a quote style, so the second is nearly free.

Locale variants to support in v1: `en-US`, `en-GB`, `de-DE`, `de-CH`. Others fall back to the base language.

### 3.2 Input modes

Three entry points, one rule engine:

| Mode | Parser | Must skip |
|---|---|---|
| `text` | none | — |
| `html` | `parse5` or `htmlparser2` — **walk text nodes only** | `code`, `pre`, `kbd`, `samp`, `var`, `script`, `style`, `textarea`; **all attributes**; existing HTML entities |
| `markdown` | `micromark` + the GFM, frontmatter and MDX extensions | fenced code, inline code, autolinks, URLs, link destinations |

The HTML mode must never serialize-and-reparse in a way that alters unrelated markup. Round-tripping untouched input must produce byte-identical output.

> **Amended 2026-08-15.** The `markdown` row named **`mdast` (remark)**. The implementation uses
> **`micromark`** instead: the job is to locate prose spans and leave every other byte alone, so what
> is needed is a tokenizer with source offsets, not an AST that must be re-serialized — and
> re-serializing is precisely the round-trip hazard the paragraph above forbids. The same table also
> understated the mode: `markdown` is not one language. The caller must pass **`dialect`**
> (`commonmark` or `mdx`); there is no default and detection is forbidden (§5.1). `parse5` was
> chosen over `htmlparser2` for HTML, as the row already permitted.

### 3.3 Rule set

**Locale-driven (configuration, see §6):**

1. **Quotes** — level 1 and level 2 (nesting), per locale
2. **Apostrophe** — `'` → `’`, without corrupting contractions or anything inside skipped regions
3. **Dashes** — hyphen → en/em dash per locale convention; numeric/date ranges → en dash, unspaced
4. **Ellipsis** — `...` → `…`; Russian `!..` / `?..` forms
5. **No-break spaces** — per-locale lists (see §7)
6. **Space hygiene** — collapse doubles, strip before punctuation, normalize inside brackets
7. **Symbols** — `x` → `×` between numerals; `(c)`/`(tm)`/`(r)` → `©`/`™`/`®`
8. **Hyphen** — bind morphological hyphen forms with U+2011 so they cannot break across lines

**Algorithmic (code, not configuration):** quote open/close resolution and nesting; range and initials detection; rule ordering.

> **Amended 2026-08-15 (second amendment to this section).** The original listed **seven**
> locale-driven rules and filed **"Russian hyphen morphology (`из-под`, `кое-`, `-таки`)"** under
> *Algorithmic (code, not configuration)*. Both halves are now false, and the second was the
> substantive error: the behaviour is rule **`hyphen`**, order 35 in `spec/rules/order.json`, and it
> is **locale-driven** — it reads `hyphen.prefixes`, `hyphen.suffixes` and `hyphen.compounds` from
> the locale file. Those are literal string lists, so nothing in §6's ban on a locale DSL is
> strained: the *lists* are data, the scanning and the U+2011 substitution are code. The rule is
> also not Russian-specific by construction — it is a no-op for every locale whose three lists are
> empty, which is most of them. It runs after `dashes`, which has already declined every
> letter-adjacent hyphen. The rule set was **eight** at the time this line was written; spec
> 0.5.0 split `ranges` out of `dashes` (order 25, off by default), making it **nine**.
> `order.json` is the source of truth and this list is a description of it.

### 3.4 The idempotency contract

**`transform(transform(x)) === transform(x)` is a hard invariant, enforced by property-based tests (`fast-check`) on every rule and every locale.**

This is the package's primary technical differentiator. Existing tools break here, which matters because CMS content gets re-processed on every save. A failing idempotency property is a release blocker, not a bug report.

---

## 4. Non-goals for v1 — do not build these

Adding any of these without an explicit operator decision is scope creep and must be refused:

- **Language auto-detection.** `lang` is an explicit, required parameter. Mixed-language text is the caller's problem.
- **Hyphenation / soft hyphens.**
- **Optical alignment** (`typograf`'s `optalign` — hanging punctuation).
- **Spellcheck, typo correction, keyboard-layout repair.**
- **A hosted API or web service.** See §1.
- **A plugin API or extension system.** No third-party rule loading in v1.
- **Shopify / Sanity / Payload integrations.** See §9 for why and when.
- **A demo page on iurii.rogulia.fi.** Deferred — free-tool traffic does not match the site's buyer positioning.
- ~~**Locale count beyond six.**~~ **Withdrawn 2026-08-15 by operator decision** — see §2 and §3.1.
  Coverage is a goal. The constraint that replaces it is evidentiary, not numeric: a locale ships
  only as the §6.2 triple. A locale without fixtures or without a citation is still refused.
- **Any framework-specific wrapper** (React component, Next.js plugin, etc.).

---

## 5. Architecture

> Superseded by [ARCHITECTURE.md](ARCHITECTURE.md). Retained for the public API shape
> and the purity rule, both of which still hold.
>
> **The tree below is not a description of the repository** (noted 2026-08-15). It is the original
> sketch, kept only as context for §5.1. Read `docs/ARCHITECTURE.md` and `CLAUDE.md` for the real
> layout. Concretely, it differs: locale JSON lives in `spec/locales/`, not `src/locales/`, and
> reaches the build through `src/generated/locales.ts`; fixtures live in `spec/fixtures/`;
> validation is JSON Schema in `spec/schema/`, not a `src/schema.ts` zod file (ARCHITECTURE.md §L0);
> there is no `engine/idempotent.ts` — idempotency is a property of the pipeline, proven by tests,
> not a helper module; and `rules/` has nine files as of spec 0.5.0 (eight when this line was
> written), including the `hyphen.ts` and `ranges.ts` missing below.

```
src/
  index.ts            public API
  engine/
    pipeline.ts       rule ordering + execution
    idempotent.ts     shared helpers guaranteeing re-runs are no-ops
  rules/
    quotes.ts  apostrophe.ts  dashes.ts  ellipsis.ts
    nbsp.ts    spaces.ts      symbols.ts
  modes/
    text.ts  html.ts  markdown.ts
  locales/            *.json — data only, no logic
  schema.ts           zod schema for locale files
fixtures/             *.json — input/expected pairs, one file per locale
```

### 5.1 Public API

Keep it small. Everything is a pure function — **no I/O, no env reads, no platform SDK imports, no filesystem access anywhere in `src/`.**

```ts
type Mode = "text" | "html" | "markdown";
type Dialect = "commonmark" | "mdx";

interface Options {
  locale: string;            // required, no default — fail fast on unknown
  mode?: Mode;               // default "text"
  dialect?: Dialect;         // required when mode is "markdown", no default; ignored otherwise
  rules?: Partial<Record<RuleId, boolean>>;  // opt-out only
}

function transform(input: string, options: Options): string;
```

> **Amended 2026-08-15.** This block is the one part of §5 the head amendment explicitly retains —
> "for the public API shape" — so it has to be right about that shape, and it was wrong in three
> ways. (1) The function was named **`typo`**; it is **`transform`** (`src/index.ts`,
> ARCHITECTURE.md §7, README). (2) The rule map was keyed by **`RuleName`**; the exported type is
> **`RuleId`** (`src/types.ts`), and "rule id" is the term the rest of the project uses — ids are
> public API, so the *name of the type naming them* should not drift. (3) **`dialect` was missing.**
> That is the load-bearing one: `markdown` mode cannot be called without it, it has no default, and
> omitting it raises `POLYTYPO_INVALID_DIALECT`. Dialect detection is forbidden rather than merely
> unbuilt — CommonMark and MDX disagree about ordinary documents, the answer is the file extension,
> and a heuristic would misread an ESM statement as prose. The purity rule below is unchanged.

**Fail-fast, per the project's standing rule:** an unknown locale throws. It must never silently fall back to English — silently applying the wrong language's rules to a customer's catalog is exactly the class of bug that destroys trust in this kind of tool. The same reasoning is why `dialect` is required rather than defaulted: guessing a markup language is the same failure as guessing a human one.

Purity is not future-proofing; it is what makes the engine reusable if an integration is ever built (§9). No preparation beyond purity is required or permitted now.

### 5.2 Stack

TypeScript, ESM + CJS dual build (`tsup`), Node 20+.

> **Amended 2026-08-15.** This section promised "zero runtime dependencies for `text` mode" with
> the parsers as "optional peer/lazy imports so `text`-only consumers pay nothing". That promise
> is withdrawn, because it is not implementable as specified: `transform` is synchronous by
> contract (§5.1), and a lazy `await import()` requires an async API. The package ships
> `parse5` and `micromark` (with the GFM, frontmatter and MDX extensions) as ordinary runtime
> dependencies — five direct, ~57 transitive. They are externalised from the bundle, so the cost
> to a `text`-only consumer is install size and dependency count, not bundle bytes.
>
> The option that *would* deliver the original promise is subpath entry points — `polytypo` with
> the text engine and no dependencies, `polytypo/html` and `polytypo/markdown` with their own.
> It was considered and deliberately deferred by operator decision: it grows the public surface
> from one function to three entry points, and the M4 dry-run over real content is the evidence
> that should drive packaging, not the other way round.

---

## 6. Locale data format

Locale rules split into two classes. **Do not try to express the second class in configuration** — that path ends in maintaining a bespoke DSL instead of a library. `typograf`'s elaborate `queue`/priority system is what that looks like at scale.

**Declarative → `locales/*.json`.** JSON rather than TypeScript objects, deliberately: the locale files become a **portable specification** that a future PHP/Python/Go port can consume unchanged, along with the same fixtures. `typopo` already has a Python port; making the data the artifact is what turns this from "another npm module" into a reusable source of truth on microtypography.

> **Overridden by `ARCHITECTURE.md` §L0.** "Zod schema" below is superseded: validation is JSON
> Schema (`spec/schema/locale.schema.json`, checked with `ajv` via `npm run validate:spec`), not
> zod — zod is a JS library and cannot validate the spec in a Go or PHP CI job. The requirement
> that a malformed locale file fails the build, not degrade at runtime, still holds.

Validated by a zod schema at build time. A malformed locale file must fail the build, not degrade at runtime.

```jsonc
{
  "locale": "fi",
  "quotes": {
    "primary":   { "open": "”", "close": "”" },
    "secondary": { "open": "’", "close": "’" }
  },
  "dash": { "parenthetical": "en-spaced", "range": "en-tight" },
  "nbsp": {
    "beforePunctuation": [],
    "narrowBeforePunctuation": [],
    "afterShortWords": [],
    "abbreviations": []
  },
  "sources": [
    { "rule": "quotes", "cite": "Kotimaisten kielten keskus (Kotus), lainausmerkit", "url": "..." }
  ]
}
```

### 6.1 The `sources` field is mandatory

Every locale file must cite the normative authority for its rules — Duden for German, Imprimerie nationale for French, Kotus for Finnish, Språkrådet for Swedish, Chicago/Oxford for English, Мильчин for Russian. The citation goes in the JSON **and** in the README table.

This is the credibility differentiator. No competing package does it. It is also the only defense against the library slowly filling up with contributors' personal preferences.

> **Amended 2026-08-15 — what a citation must cover.** *A locale attests membership; the rule owns
> the mechanism.* A `sources` entry must support exactly what the locale file **can express** —
> which tokens are in which list, which enum value, which boolean. It is **not** required to
> support the behaviour a rule attaches to that membership.
>
> The reason is that evidentiary burden must track expressive power. There is no field in which a
> locale can say "bind these units" or "do not bind them"; the schema offers a list and nothing
> else. A locale therefore cannot vary the mechanism, cannot be wrong about it, and cannot
> sensibly be asked to cite it. `nbsp.initialBinding` is the reductio, and worth stating precisely
> because it changed shape (spec 0.6.0: the field used to be the boolean `bindInitials`, now the
> enum `"none" | "chain" | "single"`). No typographic authority names a code point for any of the
> three values — the mechanism itself (which code point, which sub-rule) is still entirely the
> rule's, not the locale's, and none of the three values escapes that. What changed is that the
> enum, unlike the boolean, now lets a locale attest a real, citable *distinction in scope*: `"chain"`
> matches Chicago's own wording ("between two or more initials in a name"), `"single"` matches
> André's ("un prénom abrégé et le nom", one abbreviated first name), and `"none"` remains the
> uncitable negative the boolean's `false` always was. A locale is still not asked to cite the
> mechanism — U+00A0, which sub-rule clause fires — only which of the three *scopes* its own
> source actually describes.
>
> This does not lower the bar on membership. A source that shows two tokens side by side does not
> attest that they are one bound unit; a source describing the internal shape of a single
> abbreviation does. The distinction is the same one §6 already draws between declarative facts
> that vary by locale and algorithms that do not — *which tokens are units* varies by language,
> *a measurement does not break between its number and its unit* does not.
>
> Occasioned by `fi.beforeUnits`, which was emptied on the strength of sources that state the
> space between number and unit but not its non-breaking character, and restored under this rule.
> Full argument in `spec/rules/nbsp.md` §2.1.

### 6.2 Contribution rule (the only community infrastructure v1 needs)

**A new locale is accepted only as a triple: `locales/<code>.json` + `fixtures/<code>.json` + a normative source citation.** No fixtures, no merge. Write this as five lines in the README. Do not write a CONTRIBUTING guide, a code of conduct, an RFC process, or a plugin API in v1.

---

## 7. Locale reference table

> ⚠️ **This table is a research starting point, not verified fact.** Every row MUST be checked against the cited normative source before it is committed to a locale file, and the citation recorded per §6.1. Rows marked ❓ are known-uncertain.

### Quotes

| Locale | Level 1 | Level 2 | Authority to check |
|---|---|---|---|
| `en-US` | `“…”` U+201C/201D | `‘…’` U+2018/2019 | Chicago Manual of Style |
| `en-GB` | `“…”` ❓ (single-first also common) | `‘…’` | Oxford Style Manual |
| `de-DE` | `„…“` U+201E/U+201C | `‚…‘` U+201A/U+2018 | Duden |
| `de-CH` | `«…»` unspaced | `‹…›` | Swiss federal style guide |
| `fr` | `« … »` with inner U+202F | `“…”` ❓ (Imprimerie nationale) | Imprimerie nationale, *Lexique* |
| `ru` | `«…»` unspaced | `„…“` | Мильчин, «Справочник издателя» |
| `fi` | `”…”` U+201D **both sides** | `’…’` U+2019 both sides | Kotus |
| `sv` | `”…”` both sides ❓ (`»…»` also used) | `’…’` | Språkrådet |

### Dashes

| Locale | Parenthetical | Range |
|---|---|---|
| `en-US` | em `—`, unspaced | en `–`, unspaced |
| `en-GB` | en `–`, spaced | en `–`, unspaced |
| `de` | en `–`, spaced (*Halbgeviertstrich*) | en `–`, unspaced |
| `fi` | en `–`, spaced (*ajatusviiva*) | en `–`, unspaced |
| `sv` | en `–`, spaced (*tankstreck*) | en `–`, unspaced |
| `ru` | em `—`, spaced | en `–`, unspaced |
| `fr` | en `–`, spaced ❓ | en `–`, unspaced |

### No-break spaces

| Locale | Rule |
|---|---|
| all | number + unit, number + `%`, `§`/`№` + number |
| `fr` | U+202F before `? ! ;` — and `:` takes U+00A0 ❓ (verify against Imprimerie nationale); U+202F inside `« »` |
| `de-CH` | narrow nbsp inside `« »` |
| `ru` | after short prepositions/conjunctions; initials bound to surname; `г.`, `ул.`, `т. д.`, `млн` |
| `de` | `z. B.`, `d. h.`, `Nr.` + number, `S.` + number |
| `fi`/`sv` | number + unit; ordinal suffixes ❓ |
| `en` | number + unit; `Mr.`/`Dr.` + name (optional rule, default off) |

---

## 8. Milestones & acceptance criteria

> Superseded by [ROADMAP.md](ROADMAP.md), which folds these into the multi-runtime plan.
> The acceptance criteria below are unchanged and still binding.

Each milestone must land green before the next starts.

**M1 — Engine + `text` mode + `en`, `fi`, `sv`** (~2–3 days)
- Rule pipeline with deterministic ordering
- zod-validated locale loader; unknown locale throws
- Fixtures for all three locales
- Idempotency property test passing for every rule × locale

**M2 — `html` and `markdown` modes** (~1–2 days)
- Skip-list enforced; attributes never touched
- Byte-identical round-trip on input requiring no changes
- Regression fixture: an MDX file with code fences, inline code, and a URL survives untouched

**M3 — `de`, `ru`, `fr`** (~2–3 days)
- Each locale's `sources` array populated with real citations
- French narrow-nbsp handling verified visually in a browser, not only in tests
- Russian hyphen morphology rules with fixture coverage

**M4 — Dogfooding gate** (~0.5 day) — **the real acceptance test**
- Run the package over `~/Projects/rogulia/content/blog/**/*.mdx` in dry-run mode
- Review the full diff by hand
- **Ship criterion: zero false positives.** Any change the author would not have made by hand is a bug. Fix and re-run until the diff is clean.

**M5 — Publish** (~0.5 day)
- README with the locale table, the source citations, and an honest comparison to `typograf` / `JoliTypo` / `typopo`
- MIT license, CI on GitHub Actions (test + build + idempotency property run)
- Publish to npm; **do not add an npm downloads badge until the number is non-trivial** (project rule: never ship a badge reading zero)

**Total: ~1 week of focused work.**

### Definition of done

- [ ] Every shipped locale complete as the §6.2 triple — locale data, fixtures, cited normative source (currently `en-US` `en-GB` `de-DE` `de-CH` `fr` `ru` `fi` `sv` `el`)
- [ ] `transform(transform(x)) === transform(x)` proven by property tests across all locales and modes
- [ ] Clean dry-run diff over the author's own blog content
- [ ] No I/O, no env access, no platform imports anywhere in `src/`
- [ ] Zero items from §4 present in the codebase

---

## 9. What comes after v1 (do not start now)

Distribution is deliberately deferred until the package has been used in anger on real content.

If an integration is ever built, the cost ranking is very uneven and the order below is the correct one — note it is the *reverse* of the intuitive one:

1. **Payload / Sanity — cheap, ~1–2 days each.** TypeScript, runs in the consumer's own code. Payload: a `beforeValidate`/`beforeChange` field hook. Sanity: a custom input component plus a migration script for existing documents. The genuine work is not typography — it is mapping each platform's localization model to a per-field `lang`, so Finnish rules never run over a German translation.
2. **Shopify — expensive, weeks.** A Shopify app is not a plugin: it is a separately hosted service with OAuth, Admin GraphQL API, webhooks, Billing API, GDPR endpoints, and App Store review. Worse, it **bulk-rewrites a merchant's product data**, which demands dry-run diffs, batching against rate limits, a change journal, and rollback. That machinery *is* the product; the typography engine is a footnote inside it. **Build only in response to a specific paying merchant asking for it** — never speculatively.

The commercially interesting reframing, if it ever happens, is not "a library for developers" but "a tool that fixes a multilingual e-commerce catalog" — which maps onto the author's actual SEO/GEO ICP (multilingual EU e-commerce, 6–50 people). That is a different project with a different scope, and it is not authorized here.

---

## 10. Open decisions for the operator

1. **Package name** — recommendation `polytypo` (short, states the multilingual premise, npm-free as of 2026-08-15). Alternatives verified free: `typoglot`, `typonorm`, `multitypo`, `typeset-i18n`. Scoped `@rogulia/*` is also available but reduces discoverability.
2. **Repo visibility** — public from the first commit, or private until M4? Public earlier is better for the case-study narrative; private avoids shipping a half-correct French locale under the author's name.
