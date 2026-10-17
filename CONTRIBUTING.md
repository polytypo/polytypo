# Contributing to polytypo

This repository is the canonical spec and the promo site. The spec is the product: a behaviour
change lands here first (a fixture in `spec/fixtures/`, prose in `spec/rules/`), and only then as
code in a runtime repo. Full walkthrough: https://polytypo.dev/contribute/

## Adding a locale

A locale is accepted only as a triple: data, fixtures and a citation.

1. Read `spec/schema/locale.schema.json`. A locale file holds literal strings, code points, string
   lists and enum values only: no regex, no priorities, no conditionals.
2. Write `spec/locales/<code>.json`. Every field is backed by an entry in the mandatory `sources`
   array: a national style guide or standards body, not a blog post or personal habit.
3. Add cases to `spec/fixtures/<code>.json`: one `{ "in", "out", "rule" }` pair per behaviour the
   citation asserts, plus an edge case per rule.
4. Add the code to the `locales` array in `spec/locales/registry.json`.
5. Run `npm run validate:spec`, `npm test` and `npm run generate:all`; all must pass.
6. Open a pull request. Disagreements are settled by citation, not preference.

## Changing a rule

Rule ids, order, defaults and the locale fields each rule reads live in `spec/rules/order.json`.
The normative prose is `spec/rules/<id>.md`, written before any implementation. Rule ids and
locale codes are public API: renaming one is a breaking change.

Rules must stay portable across all five runtimes: no regex in a rule, index by Unicode code
point, never normalize input, no locale-dependent standard-library calls.

## Working in this repository

```bash
npm run validate:spec   # schema and cross-reference checks
npm test                # promo-site and fixture checks
npm run generate:all    # regenerate README.md and promo/ from the spec data
npm run lint
```

Generated files (`README.md`, `CHANGELOG.md`, `promo/`) are not edited by hand; change the
generator or the spec data and rerun `npm run generate:all`.

A released `spec-v*` tag freezes `spec/` under that version: a correction needs a version bump and
a changelog entry in `brand/tools/changelog.json`.

## License

By contributing you agree that your contribution is licensed under the [MIT license](LICENSE).
