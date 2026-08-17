# Multilingual Architecture Proposal

## Status and Goal

This document records the intended direction for making polytypo broadly multilingual, including Arabic, Persian, Chinese, Japanese, Indic, and other writing systems. It is an architecture proposal, not yet a normative part of `spec/`, and does not override `docs/ARCHITECTURE.md`. Ratified behavior must still land spec-first with conformance fixtures and sources.

The central model should be: **polytypo formats typographic profiles defined by language, script, region, and document context—not languages as flat independent bundles.**

## Profile Composition

Keep a BCP 47 locale as the public input, but resolve it into composable layers:

```text
Unicode defaults → script profile → language profile → regional tailoring
                   Arab              ar                 EG
                   Arab              fa                 IR
                   Hant              zh                 TW
```

For example, `zh-Hant-TW` combines Unicode-wide behavior, Traditional Han script conventions, Chinese-language rules, and Taiwanese tailoring. Arabic, Persian, and Urdu may share the Arabic script while retaining distinct punctuation, numeral, and spacing conventions.

Profiles should inherit declarative data rather than copy it. CLDR can provide baseline locale identifiers, inheritance, quotation delimiters, and number symbols, but imported facts must be pinned, reviewed, and covered by the existing acceptance triple: data, fixtures, and normative sources.

## Unicode Foundation

Processing by Unicode code point remains necessary but is not sufficient for complex scripts. Add generated, version-pinned tables for at least:

- `Script` and `Script_Extensions`;
- `General_Category` and combining-mark properties;
- `Grapheme_Cluster_Break` and `Word_Break`;
- `Line_Break` and `Bidi_Class`;
- default-ignorable characters and variation selectors.

Rules may inspect code points but must never split an extended grapheme cluster. The implementation should derive boundaries without normalizing or rewriting the input. All runtimes must generate equivalent tables from the Unicode version pinned in `spec/UNICODE`.

Relevant standards are Unicode UAX #29 (text segmentation), UAX #14 (line breaking), UAX #9 (bidirectional text), and UAX #50 (vertical text orientation).

## Mixed-Language Documents

Mode adapters should eventually return text spans with inherited context rather than bare strings:

```ts
interface TextSpan {
  text: string;
  locale: string;
  script: Script;
  direction: "ltr" | "rtl";
}
```

HTML mode should inherit `lang` and `dir` through the element tree and allow nested overrides. Markdown may receive a document locale from options or frontmatter and use explicit embedded markup for local overrides. Plain-text mode should retain one caller-supplied locale.

Script-run detection from Unicode properties is acceptable. Language auto-detection is not: the same Arabic-script text may be Arabic, Persian, Urdu, Pashto, or another language. Ambiguous Common and Inherited characters must take context from neighboring runs and the declared locale.

## Transformation Versus Layout

Polytypo should edit logical text, not become a shaping or rendering engine. In scope are punctuation replacement, quotation pairing, safe spacing, non-breaking relationships, range and unit handling, and script-aware transformations.

Out of scope are Arabic glyph shaping, kashida justification, visual RTL reordering, font or ligature selection, optical positioning, hanging punctuation, and vertical glyph orientation. Those belong to Unicode bidi processing, fonts, CSS, and layout engines. In particular, polytypo must preserve logical character order and should not insert bidi control characters as a general repair strategy.

## Capability-Based Rules

Rules should declare where they apply instead of assuming that every locale supports the same eight transformations. Suggested scopes are:

- **universal:** behavior safe across Unicode text;
- **script:** shared conventions for `Arab`, `Hans`, `Hant`, `Jpan`, `Deva`, etc.;
- **locale:** language- or region-specific punctuation and spacing;
- **layout hint:** textual control of break opportunities only where normatively justified.

A profile should explicitly enable, disable, or tailor capabilities such as quotation conversion, ellipses, ASCII punctuation replacement, spacing, dash ranges, and non-breaking behavior. Existing public rule IDs remain stable; any new rule taxonomy requires a versioned spec decision.

## Conformance Strategy

Every profile must include positive, negative, mixed-script, protected-span, and idempotency fixtures. Add cross-cutting properties that ensure transformations:

- preserve extended grapheme clusters;
- never reorder logical text;
- do not corrupt combining marks, variation selectors, or bidi controls;
- remain byte-identical across runtimes;
- leave HTML/Markdown protected regions untouched;
- are idempotent.

Prefer real editorial corpora reviewed by native typographers over synthetic coverage alone. Locale claims should cite CLDR, Unicode, W3C Language Enablement documents, national standards, or recognized style authorities.

## Recommended Expansion Sequence

Use architecturally different pilot profiles to expose incorrect assumptions early:

1. `ar` and `fa` for RTL Arabic script, combining marks, and distinct locale conventions.
2. `zh-Hans-CN` and `zh-Hant-TW` for unspaced text and regional punctuation.
3. `ja-JP` for mixed Han, Hiragana, and Katakana runs.
4. `hi-IN` for Devanagari grapheme clusters.
5. `th-TH` for text without ordinary space-delimited words.
6. `he-IL` as a second RTL writing system without Arabic shaping.

The first milestone is not the number of supported locales. It is proving that these diverse profiles fit one model without per-language engine forks. After that, adding locales should primarily require sourced profile data and conformance fixtures rather than new architecture.

