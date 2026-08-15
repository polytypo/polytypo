# Locale resolution

**Not a pipeline rule.** This document has no entry in `spec/rules/order.json` and produces no
edits. It specifies the function that turns the caller's `locale` option into the identifier
of exactly one locale file, and it lives in `spec/rules/` because it is normative,
runtime-independent, and fixture-covered like everything else here.
**Spec version:** 0.1.0.

---

## 1. Purpose

`transform(input, { locale })` takes a locale tag from the caller and must select exactly one
`spec/locales/<id>.json` file. That selection has to be identical in five runtimes, which is
precisely why it cannot be delegated to a platform locale-negotiation library: ICU's
`ResourceBundle`, Go's `golang.org/x/text/language` matcher, PHP's `Locale::lookup`, Python's
`babel.negotiate_locale` and the JS `Intl.Locale` machinery all implement _different_
fallback policies, several of them probabilistic in the sense that they will happily return a
"best effort" match for a language the library has never heard of. polytypo does the opposite:
it resolves exactly, then by declared alias, then by dropping the region subtag once — and if
that fails it **throws**. It never falls back to English, never to the first entry in the
registry, and never to a "closest" language. Silently applying Finnish quotation rules to a
Portuguese catalogue is the failure mode that destroys trust in a tool like this
(PLAN.md §5.1), and it is cheaper to make the caller fix a typo than to make them discover
it in production.

---

## 2. Data consumed

`spec/locales/registry.json`, in full:

- `locales` — array of concrete locale identifiers, each of which has a file
  `spec/locales/<id>.json`;
- `aliases` — object mapping a tag to a member of `locales`.

Nothing else. In particular the individual locale files are not read during resolution, and
the algorithm never inspects the filesystem (ARCHITECTURE.md §3.1: locale data is embedded in
the artifact).

**Registry invariants.** These are preconditions on the data, checked in spec CI, not at
runtime:

- every value of `aliases` is a member of `locales`;
- no key of `aliases` is a member of `locales` (an alias can never shadow a real locale, and
  a registry that tries to is a mistake, not a precedence question);
- `aliases` is not transitive — a value is a final answer, never another alias key. The
  invariant above guarantees this.

If any invariant is violated at runtime, raise `POLYTYPO_MALFORMED_LOCALE_DATA`.

---

## 3. Algorithm

The input is the caller's `locale` string. Convert it once to a code-point array
`t[0 … m-1]` (ARCHITECTURE.md §4.2).

### 3.1 Step 1 — presence

If `locale` is absent, null, or `m = 0`, throw `POLYTYPO_UNKNOWN_LOCALE`. There is no default
locale (PLAN.md §5.1: `locale` is required, no default).

### 3.2 Step 2 — canonicalisation (ASCII only, host-independent)

Produce a canonical array `c` of the same length:

1. For each index `j`: if `t[j]` is U+005F (`_`), set `c[j]` = U+002D (`-`); otherwise
   `c[j] = t[j]`.
2. If `m ≥ 2`: for `j` in `{0, 1}`, if `c[j]` is in U+0041–U+005A (`A`–`Z`), add 32 to get
   the ASCII lowercase form.
3. If `m = 5` and `c[2]` is U+002D: for `j` in `{3, 4}`, if `c[j]` is in U+0061–U+007A
   (`a`–`z`), subtract 32 to get the ASCII uppercase form.

This is an explicit arithmetic table over the ASCII range and involves **no** `toLowerCase`,
no `toUpperCase`, no `strtolower`, no ICU, and no host locale (ARCHITECTURE.md §4.4). A
Turkish process resolves `EN-us` exactly as a Finnish one does.

Nothing outside U+0041–U+005A, U+0061–U+007A, U+002D and U+005F is altered; a tag containing
anything else will fail step 3.

### 3.3 Step 3 — structural validation

`c` must have one of exactly two shapes. Test by index, not by pattern:

- **Language only**, `m = 2`: `c[0]` and `c[1]` are both in U+0061–U+007A.
- **Language + region**, `m = 5`: `c[0]`, `c[1]` in U+0061–U+007A; `c[2]` = U+002D;
  `c[3]`, `c[4]` in U+0041–U+005A.

Anything else — `m` of 0, 1, 3, 4, 6 or more; a three-letter code (`eng`); a script subtag
(`sr-Latn`); a numeric region (`es-419`); a private-use tag (`x-pig`); the wildcard `und` —
throws `POLYTYPO_UNKNOWN_LOCALE`.

`locale.schema.json` constrains the `locale` field of a locale file to
`^[a-z]{2}(-[A-Z]{2})?$`, which is exactly the same two shapes; the index-based test above is
the regex-free statement of it (ARCHITECTURE.md §4.1).

> A malformed tag and an unrecognised tag both raise `POLYTYPO_UNKNOWN_LOCALE`. There is no
> separate `POLYTYPO_INVALID_LOCALE` in the taxonomy — see §6.1.

### 3.4 Step 4 — resolve

Let `tag` be the canonical string built from `c`.

1. **Exact match.** If `tag` is a member of `registry.locales`, return `tag`.
2. **Alias.** If `tag` is a key of `registry.aliases`, let `v = aliases[tag]`. If `v` is not a
   member of `registry.locales`, raise `POLYTYPO_MALFORMED_LOCALE_DATA`. Otherwise return `v`.
3. **Strip the region and retry, once.** If `m = 5`, let `base` be the two-code-point tag
   `c[0] c[1]`.
   a. If `base` is a member of `registry.locales`, return `base`.
   b. If `base` is a key of `registry.aliases`, let `v = aliases[base]`, validate as in
   step 2, and return `v`.
4. **Throw** `POLYTYPO_UNKNOWN_LOCALE`.

The retry happens **once**. There is no third attempt, no loop, and no chain: a two-letter tag
has no region to strip, and an alias value is a concrete locale by invariant (§2).

Exact match is attempted before the alias table so that a registry which (incorrectly) lists
a tag in both places can never change behaviour based on lookup order — combined with the §2
invariant forbidding that overlap, the result is that lookup order is unobservable.

### 3.5 Purity and lifetime

Resolution is a pure function of `(locale, registry.json)`. It is performed **once per
`transform` call**, before any rule runs, and the resulting locale object is passed down. It
must not be cached in mutable module state (ARCHITECTURE.md §7: no global configuration, no
module-level mutable state, reentrant).

---

## 4. Must not do

- **Never fall back to English**, or to any other default, under any circumstance. Not on an
  unknown language, not on a malformed tag, not on an empty string.
- **Never fall back to a "nearest" language.** `nb` does not resolve to `sv`, `nl` does not
  resolve to `de`, `pt` does not resolve to `fr`.
- **Never fall back to the first entry of `registry.locales`.**
- **Never consult the host environment** — `LANG`, `LC_ALL`, `navigator.language`,
  `Intl.DateTimeFormat().resolvedOptions().locale`, `setlocale`, or a browser's
  `Accept-Language`. `transform` is pure and reads no environment (ARCHITECTURE.md §7).
- **Never use a platform locale-negotiation library**, even when it appears to agree
  (ARCHITECTURE.md §4.7).
- **Never strip the region more than once**, and never strip a language subtag.
- **Never follow an alias to another alias.**
- **Never lowercase or uppercase with a host-locale-sensitive function** (§3.2).
- **Never return a locale id that has no file.** Step 2/3b validate the alias target.

---

## 5. Worked table

Against `spec/locales/registry.json` as of spec 0.1.0:
`locales = ["en-US","en-GB","de-DE","de-CH","fr","ru","fi","sv","el"]`,
`aliases = {"en":"en-US","de":"de-DE"}`.

| Input         | Canonical | Path                                                 | Result                              |
| ------------- | --------- | ---------------------------------------------------- | ----------------------------------- |
| `en-US`       | `en-US`   | exact                                                | `en-US`                             |
| `en-GB`       | `en-GB`   | exact                                                | `en-GB`                             |
| `en`          | `en`      | alias                                                | `en-US`                             |
| `en-AU`       | `en-AU`   | no exact, no alias, strip → `en`, no exact, alias    | `en-US`                             |
| `de`          | `de`      | alias                                                | `de-DE`                             |
| `de-DE`       | `de-DE`   | exact                                                | `de-DE`                             |
| `de-CH`       | `de-CH`   | exact                                                | `de-CH`                             |
| `de-AT`       | `de-AT`   | no exact, no alias, strip → `de`, no exact, alias    | `de-DE`                             |
| `fr`          | `fr`      | exact                                                | `fr`                                |
| `fr-CA`       | `fr-CA`   | strip → `fr`, exact                                  | `fr`                                |
| `fi`          | `fi`      | exact                                                | `fi`                                |
| `fi-FI`       | `fi-FI`   | strip → `fi`, exact                                  | `fi`                                |
| `sv-FI`       | `sv-FI`   | strip → `sv`, exact                                  | `sv` (see §6.3)                     |
| `ru-BY`       | `ru-BY`   | strip → `ru`, exact                                  | `ru`                                |
| `el`          | `el`      | exact                                                | `el`                                |
| `el-GR`       | `el-GR`   | strip → `el`, exact                                  | `el`                                |
| `EN-us`       | `en-US`   | canonicalise, exact                                  | `en-US`                             |
| `en_US`       | `en-US`   | canonicalise, exact                                  | `en-US`                             |
| `DE`          | `de`      | canonicalise, alias                                  | `de-DE`                             |
| `xx-YY`       | `xx-YY`   | no exact, no alias, strip → `xx`, no exact, no alias | **throw** `POLYTYPO_UNKNOWN_LOCALE` |
| `xx`          | `xx`      | no exact, no alias, nothing to strip                 | **throw** `POLYTYPO_UNKNOWN_LOCALE` |
| `nb-NO`       | `nb-NO`   | strip → `nb`, miss                                   | **throw** `POLYTYPO_UNKNOWN_LOCALE` |
| `eng`         | —         | fails §3.3 (length 3)                                | **throw** `POLYTYPO_UNKNOWN_LOCALE` |
| `sr-Latn`     | —         | fails §3.3 (length 7)                                | **throw** `POLYTYPO_UNKNOWN_LOCALE` |
| `es-419`      | —         | fails §3.3 (region not `A`–`Z`)                      | **throw** `POLYTYPO_UNKNOWN_LOCALE` |
| `und`         | —         | fails §3.3 (length 3)                                | **throw** `POLYTYPO_UNKNOWN_LOCALE` |
| `` (empty)    | —         | fails §3.1                                           | **throw** `POLYTYPO_UNKNOWN_LOCALE` |
| absent / null | —         | fails §3.1, `tagAbsent`                              | **throw** `POLYTYPO_UNKNOWN_LOCALE` |
| options object absent | — | fails §3.1, `tagAbsent`                              | **throw** `POLYTYPO_UNKNOWN_LOCALE` |
| non-string tag (number, object, boolean) | — | fails §3.1, `tagAbsent`          | **throw** `POLYTYPO_UNKNOWN_LOCALE` |

The last three rows carry `tagAbsent: true`, a closed flag in `resolution.schema.json` added so
that "no tag was supplied at all" is expressible as a fixture rather than only as a JS test.
`transform("a", {})`, `{locale: null}`, a missing options object and every non-string locale now
raise the coded error rather than a native `TypeError` — which matters because a `TypeError` is
not in the taxonomy (ARCHITECTURE.md §4.6) and would differ in each of the five runtimes.

Every row is a fixture, not a candidate: **35 resolution cases run today**, covering these rows
and the malformed-tag rejections. `fixtures.schema.json` was extended with a case shape carrying
no `mode` and no `out`, whose expected result is a locale id or a thrown code. An earlier
revision of this paragraph said such rows "cannot be expressed in the existing fixture format";
that was true when written, and is why the schema was changed.

---

## 6. Open questions

1. **The error taxonomy has no code for a malformed tag.** ARCHITECTURE.md §4.6 lists
   `POLYTYPO_UNKNOWN_LOCALE`, `POLYTYPO_INVALID_MODE` and `POLYTYPO_MALFORMED_LOCALE_DATA`.
   `eng`, `es-419` and `""` are structurally invalid rather than merely unknown, and a caller
   would benefit from telling the two apart (one is a typo in their code, the other is a
   language polytypo does not support yet). I have mapped both to
   `POLYTYPO_UNKNOWN_LOCALE` because inventing a code would change a documented contract.
   Recommend adding `POLYTYPO_INVALID_LOCALE`; operator decision.
2. *(Closed.)* Resolution **is** fixture-covered: 35 resolution cases run today. The gap this
   item reported — that `fixtures.schema.json` could not express a case with no `mode`, no `out`
   and an expected locale id or thrown code — was closed by extending the schema, and the §5
   table's rows are those cases. (The item also miscounted the pipeline as seven rules; it is
   eight, since `hyphen` was added at order 35.)

3. **`sv-FI` (Finland Swedish) silently resolves to `sv`.** The two genuinely differ in some
   conventions, and PLAN.md §7 already flags Swedish quote practice as uncertain. The
   algorithm is correct as specified; the question is whether `sv-FI` should be a locale of
   its own. Not resolvable here — it needs a normative citation (PLAN.md §6.1).
4. **Canonicalisation accepts `_` as a separator and is case-insensitive.** That is leniency
   in a public API, and PLAN.md §5.1's stance is fail-fast. The arguments for it: Java, Ruby
   and PHP ecosystems routinely produce `en_US`; the mapping is unambiguous; and rejecting it
   converts a trivially-correctable input into a production exception. The argument against:
   every accepted spelling is a spelling someone will depend on. I specified leniency —
   **this is the one behavioural choice in this document that I would want the operator to
   confirm before it becomes contract.**
5. *(Closed.)* `registry.json` **has** a JSON Schema, compiled and enforced, so the §2
   invariants are machine-checked rather than deferred to a runtime
   `POLYTYPO_MALFORMED_LOCALE_DATA`.
6. *(Closed.)* The registry and the files in `spec/locales/` **are** cross-checked in both
   directions by `scripts/validate-spec.mjs`: an entry with no file, and a file with no entry,
   both fail the build. This item asked for "a two-line CI check"; it exists.

7. **Region-only variation is the only variation supported.** There is no way to express
   `de-CH-1901` or a house-style variant. Deliberate for v1 and consistent with the schema
   pattern, recorded so it is a decision.
