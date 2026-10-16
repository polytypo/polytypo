---
title: Error codes
description: The eight stable polytypo error codes, when each is thrown, and why the code, not the message, is the contract.
section: api
order: 40
---

Every failure from `transform` carries a stable machine code. All eight are part of the contract in every runtime; the message text is English and is not.

Branch on the code, never on the message. In JavaScript the code is `error.code`; in Python `error.code` on `PolytypoError`; in Go `perr.Code` on `*polytypo.Error`; in Ruby `error.code` on `Polytypo::Error`; in PHP `getErrorCode()` on `PolytypoException`.

## Codes

| Code | Thrown when |
| --- | --- |
| `POLYTYPO_UNKNOWN_LOCALE` | `locale` is missing or not in the spec's locale registry. |
| `POLYTYPO_INVALID_MODE` | `mode` is set to something other than `text`, `html`, `markdown` or `yaml`. |
| `POLYTYPO_INVALID_DIALECT` | `mode: "markdown"` without a `dialect`, or an unrecognised one. |
| `POLYTYPO_INVALID_OPTION` | An option value outside its permitted set, where no more specific code applies: `mode: "yaml"` without `keys`, or a `narrowNbsp` that is neither `"narrow"` nor `"nbsp"`. `mode` and `dialect` keep their own codes above. |
| `POLYTYPO_UNKNOWN_RULE` | A key in `rules` that is not one of the {{rules_count}} rule ids. |
| `POLYTYPO_MALFORMED_LOCALE_DATA` | Internal: a locale's data failed its own schema at load time. |
| `POLYTYPO_RULE_CONTRACT` | Internal: a rule emitted an edit outside its contract (out of bounds, overlapping, wrong `ruleId`). Should never surface; if it does, it is a bug in this project, not your input. |
| `POLYTYPO_MALFORMED_INPUT` | Reachable only with `mode: "markdown"` and `dialect: "mdx"`. MDX embeds JavaScript, so an unterminated JSX element or a broken `{…}` expression can fail to parse. `html` parsing is recovery-based and never throws this; plain CommonMark has no syntax errors at all. The underlying parser error is wrapped either way, so no dependency's error type reaches the public surface. |

## Input errors and internal errors

Six codes describe a problem with what you passed in: an unknown locale, mode, dialect or rule, a bad option value, or MDX that does not parse. They are the ones worth handling.

`POLYTYPO_MALFORMED_LOCALE_DATA` and `POLYTYPO_RULE_CONTRACT` describe the library itself. They are in the contract so a runtime cannot invent a ninth code for the same situation, not because calling code is expected to recover from them.
