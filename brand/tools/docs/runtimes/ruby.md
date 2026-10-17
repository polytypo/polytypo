---
title: Ruby
seo_title: polytypo for Ruby: gem install and Polytypo.transform
description: Install the polytypo gem, call Polytypo.transform and Polytypo.analyze with keyword arguments, rescue Polytypo::Error codes, and see which modes the gem covers.
section: runtimes
order: 40
---

The Ruby gem is [`polytypo`](https://rubygems.org/gems/polytypo); the source is in [polytypo/polytypo-ruby](https://github.com/polytypo/polytypo-ruby). It claims spec 1.8.0 and needs Ruby 3.2 or later. The `text`, `html` and `yaml` modes are fully conformant. The `markdown` mode covers the `commonmark` dialect (CommonMark plus GFM, through the `commonmarker` gem); `dialect: "mdx"` raises `POLYTYPO_INVALID_DIALECT`, because no MDX parser is available for this runtime.

## Install

```bash
gem install polytypo
```

In a Gemfile: `gem "polytypo"`.

## Calling it

`Polytypo.transform(input, locale:, ...)` is a module method with keyword arguments. `locale:` is required and has no default.

```ruby
require "polytypo"

output = Polytypo.transform(input, locale: "de")

# mode "markdown" requires an explicit dialect
Polytypo.transform(input, locale: "fr", mode: "markdown", dialect: "commonmark")

# mode "yaml" requires the keys whose values hold prose
Polytypo.transform(input, locale: "en-US", mode: "yaml", keys: ["description"])

# frontmatter keys to process in markdown mode
Polytypo.transform(input, locale: "en-US", mode: "markdown", dialect: "commonmark",
                   frontmatter_keys: ["title"])

# switch one rule off; rule ids are strings
Polytypo.transform(input, locale: "en-US", rules: { "dashes" => false })
```

| Keyword | Notes |
| --- | --- |
| `locale:` | Required. No fallback to English. |
| `mode:` | `"text"` (default), `"html"`, `"markdown"` or `"yaml"`. |
| `dialect:` | Required for `markdown`. Only `"commonmark"` is implemented. Passing it with any other mode raises `POLYTYPO_INVALID_DIALECT`. |
| `keys:` | Array of strings, required for `yaml`. |
| `frontmatter_keys:` | Array of strings, optional, `markdown` only. |
| `rules:` | Hash of rule id to boolean. The keys are strings: a symbol key such as `dashes:` raises `Polytypo::Error` (`unknown rule id`). `ranges` is off unless `true`. |
| `narrow_nbsp:` | `"narrow"` (default) or `"nbsp"`. |

Option names use snake_case here where the spec uses camelCase. The contract is on [Options](/docs/api/options/).

### Reporting without changing

`Polytypo.analyze(input, locale:, ...)` takes the same keywords and returns `Polytypo::Change` records (`rule_id`, `start`, `end`, `before`, `after`) with code-point offsets. See [analyze](/docs/api/analyze/).

## Errors

Every failure is a `Polytypo::Error`, a `StandardError`, with a `code` method. Branch on `code`, never on the message.

```ruby
begin
  Polytypo.transform(input, locale: "xx")
rescue Polytypo::Error => error
  error.code # => "POLYTYPO_UNKNOWN_LOCALE"
end
```

The eight codes are listed on [Error codes](/docs/api/errors/).

## Complete example

Run with `ruby example.rb` after `gem install polytypo`.

```ruby
require "polytypo"

input = %q(She said, "it's fine" -- but I wasn't sure...)

puts Polytypo.transform(input, locale: "en-US")
# She said, “it’s fine”—but I wasn’t sure…

puts Polytypo.transform(input, locale: "de-DE")
# She said, „it’s fine“ – but I wasn’t sure…

puts Polytypo.transform(input, locale: "en-US", rules: { "dashes" => false })
# She said, “it’s fine” -- but I wasn’t sure…

p Polytypo.analyze(%q(Wait... "really"?), locale: "en-US").length # => 3

begin
  Polytypo.transform(input, locale: "xx")
rescue Polytypo::Error => error
  puts error.code # POLYTYPO_UNKNOWN_LOCALE
end
```

The same call, measured:

```example
locale: en-US
rules: -dashes
---
She said, "it's fine" -- but I wasn't sure...
```

`Polytypo.transform` is a pure module method with no class-level mutable state, so it is safe to call from any number of threads. Requiring `polytypo` does not load `commonmarker`; it loads on the first `markdown` call.

## Conformance

Spec 1.8.0. Modes: `text`, `html`, `yaml`, and `markdown` with `dialect: "commonmark"`. `dialect: "mdx"` raises `POLYTYPO_INVALID_DIALECT`. All nine rules. See [spec/CONFORMANCE.md](https://github.com/polytypo/polytypo/blob/main/spec/CONFORMANCE.md).

## Related

- [JavaScript](/docs/runtimes/javascript/), [Python](/docs/runtimes/python/), [Go](/docs/runtimes/go/), [PHP](/docs/runtimes/php/)
- [Options](/docs/api/options/)
- [Error codes](/docs/api/errors/)
- [YAML mode](/docs/modes/yaml/)

Conformance matrix: [spec/CONFORMANCE.md](https://github.com/polytypo/polytypo/blob/main/spec/CONFORMANCE.md).
