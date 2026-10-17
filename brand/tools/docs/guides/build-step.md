---
title: Running polytypo in a build step
seo_title: Fix typography in Markdown, MDX and HTML at build time | polytypo
description: Typeset Markdown, MDX and HTML files at build time with a complete Node script, choosing locale, mode and dialect per file, with a check mode for CI.
section: guides
order: 10
---

`transform()` is a pure function: same input and options, same output, no I/O. That makes it easy to run over a content directory before the site builds. This guide builds a Node script that rewrites `.md` and `.mdx` files in place, picks the locale from the directory a file lives in, and has a `--check` flag for CI.

The goal: after the step runs, every prose string in your content is typeset for its locale, code and URLs are untouched, and a second run changes nothing.

## Decide what to pass

Three decisions per file, all of which the caller owns because the library does not detect them:

- **`locale`** is required and never inferred. Take it from where the file lives (a `content/fr/` directory), from its own metadata, or from your CMS record. Region-less codes resolve through [locale resolution](/docs/concepts/locale-resolution/): `en` is `en-US`, `de` is `de-DE`.
- **`mode`** follows the file format: `markdown` for `.md` and `.mdx`, `html` for `.html` or an HTML field, `text` for plain strings, `yaml` for config files with prose in some keys ([YAML guide](/docs/guides/yaml-config/)).
- **`dialect`**, for `markdown` only, follows the extension: `commonmark` for `.md`, `mdx` for `.mdx`. It is never guessed, because the two disagree on ordinary documents. See [MDX content](/docs/guides/mdx-content/).

## The script

Save as `typeset.mjs` next to a `content/` directory laid out as `content/<locale>/…`. Install first with `npm install polytypo`.

```js
import { readdir, readFile, writeFile } from "node:fs/promises";
import { extname, join, relative, sep } from "node:path";
import { transform } from "polytypo";

const root = "content";
const check = process.argv.includes("--check");
const dialects = { ".md": "commonmark", ".mdx": "mdx" };

async function* walk(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(path);
    else yield path;
  }
}

let changed = 0;
let failed = 0;

for await (const path of walk(root)) {
  const dialect = dialects[extname(path)];
  if (!dialect) continue;

  const locale = relative(root, path).split(sep)[0];
  const source = await readFile(path, "utf8");

  let output;
  try {
    output = transform(source, {
      locale,
      mode: "markdown",
      dialect,
      frontmatterKeys: ["title", "description"],
    });
  } catch (error) {
    if (error.code !== "POLYTYPO_MALFORMED_INPUT") throw error;
    console.error(`does not parse as ${dialect}: ${path}`);
    failed += 1;
    continue;
  }

  if (output === source) continue;
  changed += 1;
  if (check) console.log(`needs typesetting: ${path}`);
  else await writeFile(path, output);
}

if (failed > 0 || (check && changed > 0)) process.exitCode = 1;
console.log(check ? `${changed} file(s) need changes` : `${changed} file(s) rewritten`);
```

Run `node typeset.mjs` to rewrite, `node typeset.mjs --check` to fail a CI job when something would change.

### What it does to a file

With `content/en/post.mdx` containing frontmatter, a link, a code span and a component, this is what the script's call produces:

```example
locale: en-US
mode: markdown
dialect: mdx
frontmatterKeys: title, description
---
---
title: He said "hello" -- twice
slug: "hello-twice"
---

Rates -- all of them... see [the site](https://example.com/a--b) and `a -- b`.

<Callout>It's "fine" -- really</Callout>
```

Notice that `title` is typeset, `slug` is not because it is not listed, the link destination and the code span are left alone, and the text inside `<Callout>` is processed.

## Where it goes in the pipeline

- **Before the formatter.** Typography changes line lengths: three dots become one character, no-break spaces appear. A formatter that wraps prose should see the final text.
- **Before the site build, not inside it**, if you want the typeset text committed. Run it in the build itself if you want sources left as authored; both work because the output is a fixed point of the transform ([idempotency](/docs/concepts/idempotency/)).
- **Run it twice and nothing happens.** A second run over the output returns the same bytes, so a pre-commit hook or a CI `--check` does not flap.

## Other places the same call fits

A rich-text field on save:

```js
import { transform } from "polytypo";

function typesetBody(html, locale) {
  return transform(html, { locale, mode: "html" });
}
```

HTML parsing is recovery-based and does not throw `POLYTYPO_MALFORMED_INPUT`; that code is reachable only for the `mdx` dialect.

Copy that reaches a template:

```jsx
import { transform } from "polytypo";

function Byline({ text, locale }) {
  return <p>{transform(text, { locale })}</p>;
}
```

Call it where imported or untrusted copy reaches a render, not on every keystroke.

## Pitfalls

- **One locale per call.** A file that mixes languages is typeset entirely by one locale's conventions. Split such content, or process the sections separately with their own locale.
- **Unknown locale throws.** `POLYTYPO_UNKNOWN_LOCALE` means the directory name is not a supported code. In the script above a stray `content/drafts/` directory would stop the run; map directory names to locales explicitly if your layout is not purely locale-first.
- **MDX that does not parse throws.** An autolink such as `<https://example.com>` is not valid MDX and raises `POLYTYPO_MALFORMED_INPUT`. The script reports the file and carries on; fix the source or change it to `[text](url)`.
- **Frontmatter is skipped unless you name keys.** Without `frontmatterKeys`, the headline in your frontmatter stays as authored.
- **Narrow no-break space.** Locales such as French insert U+202F, which some fonts lack. Pass `narrowNbsp: "nbsp"` to use U+00A0 in its place ([nbsp](/docs/rules/nbsp/)).

## Related

- [Installation](/docs/getting-started/installation/)
- [Choosing a mode](/docs/getting-started/choosing-a-mode/)
- [MDX content](/docs/guides/mdx-content/)
- [YAML configuration](/docs/guides/yaml-config/)
- [Idempotency](/docs/concepts/idempotency/)
- [JavaScript runtime](/docs/runtimes/javascript/)

Normative text: [spec/rules/modes.md](https://github.com/polytypo/polytypo/blob/main/spec/rules/modes.md).
