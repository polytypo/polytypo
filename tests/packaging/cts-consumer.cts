// CommonJS `.cts` declaration consumer — same file extension a real CJS TypeScript project uses.
// Under `moduleResolution: "nodenext"` (tests/packaging/tsconfig.nodenext.json), a `.cts` file's
// imports resolve via the package's "require" condition, which must select each entry's `.d.cts`
// (never `.d.ts`) — the other half of the same proof as mts-consumer.mts. Type-checked only,
// never executed; the exact file each import resolved to is separately proven by
// scripts/check-declaration-resolution.mjs.
import { transform as transformAggregate, type Options } from "polytypo";
import { transform as transformHtml, type HtmlOptions } from "polytypo/html";
import { transform as transformMarkdown, type MarkdownOptions } from "polytypo/markdown";
import { transform as transformText, type TextOptions } from "polytypo/text";

const aggregateOptions: Options = { locale: "en-US", mode: "text" };
transformAggregate("x", aggregateOptions);

const textOptions: TextOptions = { locale: "en-US" };
transformText("x", textOptions);

const htmlOptions: HtmlOptions = { locale: "en-US" };
transformHtml("x", htmlOptions);

const markdownOptions: MarkdownOptions = { locale: "en-US", dialect: "commonmark" };
transformMarkdown("x", markdownOptions);
