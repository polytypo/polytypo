---
title: transform
description: The one function polytypo is built around: its signature in all five runtimes, what it returns, what it throws, and the purity it guarantees.
section: api
order: 10
---

`transform(input, options)` takes a string and a locale and returns a string. It is pure: no filesystem, no network, no clock, no ambient configuration, no module-level state, no global settings. The same arguments give the same result on every call, in every runtime, and calls do not interfere with each other.

`locale` is required. An unknown locale throws rather than silently falling back to English.

## Signature

```js
import { transform } from "polytypo";

transform(input, { locale: "de" });
```

```python
from polytypo import transform

transform(input, locale="de")
```

```go
import "github.com/polytypo/polytypo-go"

out, err := polytypo.Transform(input, polytypo.Options{Locale: "de"})
```

```ruby
require "polytypo"

Polytypo.transform(input, locale: "de")
```

```php
use Polytypo\Polytypo;

Polytypo::transform($input, 'de');
```

Every option is available in every runtime under that language's naming. The [options](/docs/api/options/) page lists them. Each [runtime page](/docs/runtimes/javascript/) shows the full call shape.

## Return value

A string. In `text` mode it is the input with the rules applied. In `html`, `markdown` and `yaml` mode it is the input with the rules applied to the prose only, and every other byte unchanged. See [Round-trip guarantee](/docs/concepts/round-trip/).

When nothing needs changing the result equals the input. When it is called again on its own output, it returns the same string: the result is a fixed point. See [Idempotency](/docs/concepts/idempotency/).

## Errors

All failures carry a stable code. Messages are English and are not part of the contract; codes are. The full list is on [Error codes](/docs/api/errors/).

```example
locale: xx
expect: error
---
Some "text".
```

Input alone can make `transform` throw in exactly one place: an MDX document that does not parse. Every other error is caused by the options.

## What one call does

- **One locale.** A call applies a single locale. Language is never detected, so split a document that mixes languages and call `transform` on each part with its own locale.
- **One string.** `transform` sees only the string it is given. Rules read the characters on either side of what they change, and that reading stops at the ends of the string. Text nodes transformed one at a time lose each other as context; give the call whole prose where you can. See [Choosing a mode](/docs/getting-started/choosing-a-mode/).
- **A fixed pipeline.** Nine rules run in a fixed order, identical in every runtime. `rules` can switch any of them on or off and never reorders the rest. See [Rule order](/docs/concepts/rule-order/).

## Related

- [Options](/docs/api/options/)
- [analyze](/docs/api/analyze/): the same pipeline, reporting instead of applying
- [Modes](/docs/modes/overview/)

Normative text: [spec/rules/pipeline-idempotency.md](https://github.com/polytypo/polytypo/blob/main/spec/rules/pipeline-idempotency.md).
