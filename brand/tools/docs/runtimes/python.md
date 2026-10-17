---
title: Python
seo_title: polytypo for Python: PyPI install and transform()
description: Install polytypo from PyPI, call transform and analyze with keyword arguments, handle PolytypoError codes, and see which modes and dialects the package covers.
section: runtimes
order: 20
---

The Python package is published on PyPI as [`polytypo`](https://pypi.org/project/polytypo/); the source is in [polytypo/polytypo-python](https://github.com/polytypo/polytypo-python). It claims spec 1.8.0. The `text`, `html` and `yaml` modes are fully conformant. The `markdown` mode covers the `commonmark` dialect; `dialect="mdx"` raises `POLYTYPO_INVALID_DIALECT`, because no MDX parser is available for this runtime.

## Install

```bash
pip install polytypo
```

## Calling it

Options are keyword arguments. `locale` is required and has no default.

```python
from polytypo import transform

output = transform(text, locale="de")

# mode "markdown" requires an explicit dialect; "text" and "html" ignore it
transform(text, locale="fr", mode="markdown", dialect="commonmark")

# mode "yaml" requires the keys whose values hold prose
transform(text, locale="en-US", mode="yaml", keys=["description"])

# frontmatter keys to process in markdown mode
transform(text, locale="en-US", mode="markdown", dialect="commonmark", frontmatter_keys=["title"])

# switch one rule off; the order of the rest never changes
transform(text, locale="en-US", rules={"dashes": False})
```

| Option | Notes |
| --- | --- |
| `locale` | Required. No fallback to English. |
| `mode` | `"text"` (default), `"html"`, `"markdown"` or `"yaml"`. |
| `dialect` | Required for `markdown`. Only `"commonmark"` is implemented. |
| `keys` | List of strings, required for `yaml`. |
| `frontmatter_keys` | List of strings, optional, `markdown` only. |
| `rules` | Dict of rule id to `bool`. `ranges` is off unless `True`. |

The full option contract is on [Options](/docs/api/options/); option names use snake_case here where the spec uses camelCase.

### Entry points

The aggregate `polytypo` module supports every mode through the `mode` keyword. `polytypo.text`, `polytypo.html`, `polytypo.markdown` and `polytypo.yaml` each default `mode` to themselves and import only the parser dependency their mode needs; `polytypo.text` and `polytypo.yaml` import none.

```python
from polytypo.markdown import transform

transform(source, locale="en-US", dialect="commonmark", frontmatter_keys=["title"])
```

### Reporting without changing

`polytypo.analyze(text, locale=...)` takes the same arguments and returns a list of `Change` records (`rule_id`, `start`, `end`, `before`, `after`) with code-point offsets. See [analyze](/docs/api/analyze/).

## Errors

Every failure is a `PolytypoError` with a stable `code` attribute. Branch on `error.code`, never on the message.

```python
from polytypo import transform, PolytypoError

try:
    transform(text, locale="xx")
except PolytypoError as error:
    error.code  # "POLYTYPO_UNKNOWN_LOCALE"
```

The eight codes are listed on [Error codes](/docs/api/errors/).

## Complete example

```python
import polytypo
from polytypo import transform, PolytypoError

text = 'She said, "it\'s fine" -- but I wasn\'t sure...'

print(transform(text, locale="en-US"))
# She said, “it’s fine”—but I wasn’t sure…

print(transform(text, locale="de-DE"))
# She said, „it’s fine“ – but I wasn’t sure…

print(transform(text, locale="en-US", rules={"dashes": False}))
# She said, “it’s fine” -- but I wasn’t sure…

print(polytypo.analyze('Wait... "really"?', locale="en-US"))
# [Change(rule_id='ellipsis', start=4, end=7, before='...', after='…'), …]

try:
    transform(text, locale="xx")
except PolytypoError as error:
    print(error.code)  # POLYTYPO_UNKNOWN_LOCALE
```

The same call, measured:

```example
locale: en-US
---
She said, "it's fine" -- but I wasn't sure...
```

## Conformance

Spec 1.8.0. Modes: `text`, `html`, `yaml`, and `markdown` with `dialect="commonmark"` (CommonMark plus GFM: tables, strikethrough, task lists, autolink literals). `markdown` with `dialect="mdx"` raises `POLYTYPO_INVALID_DIALECT`. All nine rules. See [spec/CONFORMANCE.md](https://github.com/polytypo/polytypo/blob/main/spec/CONFORMANCE.md).

## Related

- [JavaScript](/docs/runtimes/javascript/), [Go](/docs/runtimes/go/), [Ruby](/docs/runtimes/ruby/), [PHP](/docs/runtimes/php/)
- [MDX](/docs/modes/markdown/mdx/)
- [Options](/docs/api/options/)
- [Error codes](/docs/api/errors/)

Conformance matrix: [spec/CONFORMANCE.md](https://github.com/polytypo/polytypo/blob/main/spec/CONFORMANCE.md).
