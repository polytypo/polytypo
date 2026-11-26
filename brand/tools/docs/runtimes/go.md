---
title: Go
h1: Typography library for Go
seo_title: Typography library for Go: go get and Transform | polytypo
description: polytypo is a typography library for Go: it fixes quotes, dashes, ellipses and no-break spaces for each locale. Install the module, call Transform and Analyze with an Options struct, check *polytypo.Error codes, and see which modes and dialects it covers.
section: runtimes
order: 30
---

The Go module is [`github.com/polytypo/polytypo-go`](https://pkg.go.dev/github.com/polytypo/polytypo-go); the source is in [polytypo/polytypo-go](https://github.com/polytypo/polytypo-go). It claims spec {{claimed_spec}}. The `text`, `html` and `yaml` modes are fully conformant. The `markdown` mode covers the `commonmark` dialect (CommonMark plus GFM); `mdx` returns `CodeInvalidDialect`, because no MDX parser is available for this runtime. If you need smart quotes in Go, `polytypo.Transform` converts the straight quotes in a string to curly ones for the locale in `Options`.

## Install

```bash
go get github.com/polytypo/polytypo-go
```

## Smart quotes in Go

`Transform` returns the string with curly quotes, typographic apostrophes and an ellipsis character, in the style of the locale:

```go
package main

import (
    "fmt"

    polytypo "github.com/polytypo/polytypo-go"
)

func main() {
    text := `"It's 5 o'clock," he said... "really?"`

    out, err := polytypo.Transform(text, polytypo.Options{Locale: "en-US"})
    if err != nil {
        panic(err)
    }
    fmt.Println(out)
    // “It’s 5 o’clock,” he said… “really?”

    out, _ = polytypo.Transform(text, polytypo.Options{Locale: "de-DE"})
    fmt.Println(out)
    // „It’s 5 o’clock,“ he said… „really?“
}
```

## Calling it

There is one package and one entry point: `polytypo.Transform(input, polytypo.Options{...})` returns `(string, error)`. There are no per-mode subpaths. `Locale` is required and has no default; an empty `Mode` means `"text"`.

```go
import polytypo "github.com/polytypo/polytypo-go"

out, err := polytypo.Transform(input, polytypo.Options{Locale: "de"})

// Mode "markdown" requires an explicit Dialect; "text" and "html" ignore it
out, err = polytypo.Transform(input, polytypo.Options{
    Locale:  "fr",
    Mode:    "markdown",
    Dialect: "commonmark",
})

// Mode "yaml" requires the Keys whose values hold prose
out, err = polytypo.Transform(input, polytypo.Options{
    Locale: "en-US",
    Mode:   "yaml",
    Keys:   []string{"description"},
})
```

| Field | Notes |
| --- | --- |
| `Locale` | Required. No fallback to English. |
| `Mode` | `"text"` (default when empty), `"html"`, `"markdown"` or `"yaml"`. |
| `Dialect` | Required for `markdown`. Only `"commonmark"` is implemented. |
| `Keys` | `[]string`, required for `yaml`. A `nil` slice counts as not supplied and returns `CodeInvalidOption`; an empty non-nil slice is legal and processes nothing. |
| `FrontmatterKeys` | `[]string`, optional, `markdown` only. A `nil` slice leaves the block skipped; an empty non-nil slice processes nothing. |

The option contract is on [Options](/docs/api/options/).

### Reporting without changing

`polytypo.Analyze(input, options)` returns `[]polytypo.Change` with `RuleID`, `Start`, `End`, `Before` and `After`. Offsets are code points, not bytes. See [analyze](/docs/api/analyze/).

## Errors

Every error returned is a `*polytypo.Error` with a `Code` field. Compare `Code`, never the message text.

```go
var perr *polytypo.Error
if errors.As(err, &perr) {
    switch perr.Code {
    case polytypo.CodeUnknownLocale:
        // ...
    }
}
```

The codes are Go constants named `CodeUnknownLocale`, `CodeInvalidDialect`, `CodeInvalidOption` and so on, one per entry on [Error codes](/docs/api/errors/).

## Complete example

```go
package main

import (
    "errors"
    "fmt"

    polytypo "github.com/polytypo/polytypo-go"
)

func main() {
    input := `She said, "it's fine" -- but I wasn't sure...`

    out, err := polytypo.Transform(input, polytypo.Options{Locale: "en-US"})
    if err != nil {
        panic(err)
    }
    fmt.Println(out)
    // She said, “it’s fine”—but I wasn’t sure…

    out, _ = polytypo.Transform(input, polytypo.Options{Locale: "de-DE"})
    fmt.Println(out)
    // She said, „it’s fine“ – but I wasn’t sure…

    changes, _ := polytypo.Analyze(`Wait... "really"?`, polytypo.Options{Locale: "en-US"})
    fmt.Println(len(changes)) // 3

    _, err = polytypo.Transform(input, polytypo.Options{Locale: "xx"})
    var perr *polytypo.Error
    if errors.As(err, &perr) {
        fmt.Println(perr.Code) // POLYTYPO_UNKNOWN_LOCALE
    }
}
```

The same call, measured:

```example
locale: de-DE
---
She said, "it's fine" -- but I wasn't sure...
```

`Transform` is a pure function with no package-level mutable state, so it is safe to call from any number of goroutines.

## Conformance

Spec {{claimed_spec}}. Modes: `text`, `html`, `yaml`, and `markdown` with `Dialect: "commonmark"`. `Dialect: "mdx"` returns `CodeInvalidDialect`. All {{rules_count}} rules. See [spec/CONFORMANCE.md](https://github.com/polytypo/polytypo/blob/main/spec/CONFORMANCE.md).

## Related

- [JavaScript](/docs/runtimes/javascript/), [Python](/docs/runtimes/python/), [Ruby](/docs/runtimes/ruby/), [PHP](/docs/runtimes/php/)
- [Options](/docs/api/options/)
- [Error codes](/docs/api/errors/)
- [Choosing a mode](/docs/getting-started/choosing-a-mode/)

Conformance matrix: [spec/CONFORMANCE.md](https://github.com/polytypo/polytypo/blob/main/spec/CONFORMANCE.md).
