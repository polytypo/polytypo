// ESM `.mts` declaration consumer — same file extension a real ESM TypeScript project uses.
// Under `moduleResolution: "nodenext"` (tests/packaging/tsconfig.nodenext.json), a `.mts` file's
// imports resolve via the package's "import" condition, which must select each entry's `.d.ts`
// (never `.d.cts`) — proving the exports map's condition-specific "types" (package.json 5.1/5.2
// follow-up) actually routes ESM consumers correctly. Type-checked only, never executed; the
// exact file each import resolved to is separately proven by
// scripts/check-declaration-resolution.mjs, since successful compilation alone does not show
// which declaration file was picked (see AUDIT_REMEDIATION_AND_RELEASE_PLAN.md 5.1 review).
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
