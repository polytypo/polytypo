// TypeScript declaration consumer test — imports every public entry point through its published
// package path and its shipped .d.ts, proving the exports map's "types" condition resolves and
// that each subpath's Options type makes a conflicting `mode` (and, for markdown, a missing
// `dialect`) a compile error rather than something only caught at runtime. Type-checked only
// (see tests/packaging/tsconfig.json); never executed. Requires `npm run build` to have already
// produced dist/*.d.ts. Run via `npm run test:packaging`.
import { transform as transformAggregate, type Options } from "polytypo";
import { transform as transformHtml, type HtmlOptions } from "polytypo/html";
import { transform as transformMarkdown, type MarkdownOptions } from "polytypo/markdown";
import { transform as transformText, type TextOptions } from "polytypo/text";

// Aggregate entry: all three modes remain legal, exactly as before this stage.
const aggregateOptions: Options = { locale: "en-US", mode: "html" };
transformAggregate("x", aggregateOptions);

// polytypo/text: `mode` is not a field of TextOptions.
const textOptions: TextOptions = { locale: "en-US" };
transformText("x", textOptions);
// @ts-expect-error TextOptions has no `mode` field — a literal with one is a compile error.
const textOptionsBad: TextOptions = { locale: "en-US", mode: "html" };
void textOptionsBad;

// polytypo/html: `mode` is not a field of HtmlOptions.
const htmlOptions: HtmlOptions = { locale: "en-US" };
transformHtml("x", htmlOptions);
// @ts-expect-error HtmlOptions has no `mode` field — a literal with one is a compile error.
const htmlOptionsBad: HtmlOptions = { locale: "en-US", mode: "markdown" };
void htmlOptionsBad;

// polytypo/markdown: `dialect` is required, `mode` is not a field of MarkdownOptions.
const markdownOptions: MarkdownOptions = { locale: "en-US", dialect: "commonmark" };
transformMarkdown("x", markdownOptions);
// @ts-expect-error dialect is required on MarkdownOptions — omitting it is a compile error.
const markdownOptionsMissingDialect: MarkdownOptions = { locale: "en-US" };
void markdownOptionsMissingDialect;
// @ts-expect-error MarkdownOptions has no `mode` field — a literal with one is a compile error.
const markdownOptionsBad: MarkdownOptions = {
  locale: "en-US",
  dialect: "commonmark",
  mode: "text",
};
void markdownOptionsBad;
