---
name: polytypo
description: Add locale-correct typography (quotes, dashes, ellipses, hyphens, no-break spaces) to a project with polytypo. Use when the user wants to fix straight quotes, dashes or spacing in text, HTML, Markdown/MDX or YAML content, or asks to install or use polytypo.
---

# polytypo

polytypo turns straight quotes, hyphen-dashes, three dots and plain spaces into the typography a specific locale prescribes. It is one specification with separate packages for JavaScript/TypeScript, Python, Go, Ruby and PHP; the same input, locale and options give the same output in all of them.

Docs: https://polytypo.dev/docs/

## Install

Install the package for the language of the project. Package names and install commands: https://polytypo.dev/docs/getting-started/installation/

## Call

The call takes a string and options and returns a string:

```js
import { transform } from "polytypo";

transform('He said "wait..." -- twice.', { locale: "en-US" });
```

Other runtimes spell options in their own style (`narrow_nbsp`, `NarrowNbsp`); the call shape for each is on its runtime page under https://polytypo.dev/docs/runtimes/.

## Rules for using it

- **`locale` is required.** There is no default and no language detection. Set it from the language the text is written in. Supported locales: https://polytypo.dev/locales/
- **`mode` says what the string is.** It defaults to `text`, which treats the whole string as prose; passing HTML or Markdown to it corrupts markup. Pick the mode for the input:
  - `text`: plain prose, such as a headline or a CMS field.
  - `html`: HTML or a fragment of it.
  - `markdown`: Markdown or MDX. Requires `dialect`: `commonmark` or `mdx`.
  - `yaml`: a YAML file with some prose fields. Requires `keys`: the mapping keys whose values are prose.
- **Choosing a mode:** https://polytypo.dev/docs/getting-started/choosing-a-mode/
- **All options:** https://polytypo.dev/docs/api/options/
- **Pass whole prose, not fragments.** Rules read the characters around a change and stop at the ends of the string, so transforming each text node of a component tree separately gives worse results than transforming the whole document in the right mode.
- Output is idempotent: running it again on its own output changes nothing.

## Applying it to existing content

1. Run it on a few real files first and show the user the diff before rewriting anything.
2. Do not apply `text` mode to files that contain markup or code.
3. Use `analyze()` to list what would change without changing it.
4. For a build step or CI check over a content directory, follow https://polytypo.dev/docs/guides/build-step/
