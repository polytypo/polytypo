---
title: Installation
seo_title: Install polytypo: npm, pip, go get, gem and Composer
description: Install polytypo for JavaScript, Python, Go, Ruby or PHP and make a first call.
section: getting-started
order: 10
---

polytypo has one specification and five implementations. They are separate packages with the same behaviour for the same spec version: the same input, locale and options produce the same output in all of them.

| Runtime | Package | Source |
| --- | --- | --- |
| JavaScript / TypeScript | [polytypo on npm](https://www.npmjs.com/package/polytypo) | [polytypo-js](https://github.com/polytypo/polytypo-js) |
| Python | [polytypo on PyPI](https://pypi.org/project/polytypo/) | [polytypo-python](https://github.com/polytypo/polytypo-python) |
| Go | [polytypo-go on pkg.go.dev](https://pkg.go.dev/github.com/polytypo/polytypo-go) | [polytypo-go](https://github.com/polytypo/polytypo-go) |
| Ruby | [polytypo on RubyGems](https://rubygems.org/gems/polytypo) | [polytypo-ruby](https://github.com/polytypo/polytypo-ruby) |
| PHP | [polytypo/polytypo on Packagist](https://packagist.org/packages/polytypo/polytypo) | [polytypo-php](https://github.com/polytypo/polytypo-php) |

Install commands and the exact call shape for each language are on its runtime page: [JavaScript](/docs/runtimes/javascript/), [Python](/docs/runtimes/python/), [Go](/docs/runtimes/go/), [Ruby](/docs/runtimes/ruby/), [PHP](/docs/runtimes/php/).

## First call

```js
import { transform } from "polytypo";

transform('He said "wait..." -- twice.', { locale: "en-US" });
```

```example
locale: en-US
---
He said "wait..." -- twice.
```

That is the whole shape: a string and a locale in, a string out. Anything else is an option on that call. Next:

1. Pick the [mode](/docs/getting-started/choosing-a-mode/) that matches what your string is.
2. Pick the [locale](/locales/) your text is written in.
3. Read [Options](/docs/api/options/) for what else a call can say.

## Related

- [Choosing a mode](/docs/getting-started/choosing-a-mode/)
- [transform](/docs/api/transform/)
- [Playground](/playground/): run the engine in the browser
