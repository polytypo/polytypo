import { parse, postprocess, preprocess } from "micromark";
import { frontmatter } from "micromark-extension-frontmatter";
import { gfm } from "micromark-extension-gfm";
import { mdxjs } from "micromark-extension-mdxjs";
import type { Event, Extension } from "micromark-util-types";
import { PolytypoError } from "../errors.js";
import type { Dialect } from "../types.js";
import { htmlFragmentSpans, isSkippedElement } from "./html.js";
import { wrapParserErrors } from "./parse-error.js";
import type { Span } from "./spans.js";

/**
 * spec/rules/modes.md 3.7. Each entry is skipped **whole**, including anything that looks
 * processable inside it. The complement is not enumerated: a span is emitted only for a
 * micromark `data` token, which is the tokenizer's own name for "literal content", so list
 * markers, emphasis delimiters, heading sequences, table padding, line endings, hard-break
 * spaces, character escapes and character references are outside every span by construction
 * rather than by a second list that could drift from the first.
 */
const SKIPPED_TOKEN_TYPES: ReadonlySet<string> = new Set([
  // fenced code blocks (including the info string and the fences) and indented code blocks
  "codeFenced",
  "codeIndented",
  // inline code spans, including the backticks
  "codeText",
  // autolinks `<https://…>`, and GFM's bare-URL form
  "autolink",
  "literalAutolink",
  // link and image destinations and titles; the definition line of a reference link. The link
  // *text* is a `labelText`, which is not skipped.
  "resource",
  "reference",
  "definition",
  // MDX: expression containers in full, and every JSX attribute — the whole tag is skipped, so
  // attributes never surface. JSX element *children* sit outside the tag tokens and are
  // processable.
  "mdxFlowExpression",
  "mdxTextExpression",
  "mdxjsEsm",
  // Not in modes.md 3.7, and it has to be: without it the second `---` of a YAML block reads as
  // a setext underline, `title: Une note` becomes a paragraph, and `fr` puts a narrow no-break
  // space in front of the colon of a machine-read metadata field. Reported as a spec gap.
  "frontmatter",
]);

/** Token types whose enter/exit also maintains the skipped-element stack. */
const RAW_TAG_TOKEN_TYPES: ReadonlySet<string> = new Set([
  "htmlText",
  "mdxJsxTextTag",
  "mdxJsxFlowTag",
]);

const LESS_THAN = 0x3c;
const GREATER_THAN = 0x3e;
const SLASH = 0x2f;
const EXCLAMATION = 0x21;
const QUESTION = 0x3f;

function isAsciiLetter(unit: number): boolean {
  return (unit >= 0x61 && unit <= 0x7a) || (unit >= 0x41 && unit <= 0x5a);
}

function isTagNameUnit(unit: number): boolean {
  // Deliberately permissive: anything that is not a delimiter belongs to the name. Custom
  // elements (`my-callout`) and member expressions (`Foo.Bar`) must come out whole so that they
  // fail the skip-list membership test rather than being truncated into something that passes.
  return (
    unit !== GREATER_THAN &&
    unit !== SLASH &&
    unit !== 0x20 &&
    unit !== 0x09 &&
    unit !== 0x0a &&
    unit !== 0x0d
  );
}

/** ASCII-only, because HTML tag names are ASCII case-insensitive and `toLowerCase()` is not. */
function asciiLower(value: string): string {
  let out = "";
  for (let i = 0; i < value.length; i += 1) {
    const unit = value.charCodeAt(i);
    out += unit >= 0x41 && unit <= 0x5a ? String.fromCharCode(unit + 0x20) : value[i];
  }
  return out;
}

interface RawTag {
  readonly name: string;
  readonly closing: boolean;
  readonly selfClosing: boolean;
}

function readTag(tag: string): RawTag | null {
  if (tag.charCodeAt(0) !== LESS_THAN) return null;
  let i = 1;
  const closing = tag.charCodeAt(i) === SLASH;
  if (closing) i += 1;
  // Comments, declarations and processing instructions carry no element name.
  if (tag.charCodeAt(i) === EXCLAMATION || tag.charCodeAt(i) === QUESTION) return null;
  if (!isAsciiLetter(tag.charCodeAt(i))) return null;
  const nameAt = i;
  while (i < tag.length && isTagNameUnit(tag.charCodeAt(i))) i += 1;
  const selfClosing = tag.charCodeAt(tag.length - 2) === SLASH;
  return { name: tag.slice(nameAt, i), closing, selfClosing };
}

/**
 * modes.md 3.7: raw HTML is "handed to the html skip list of 3.6". Inline raw HTML reaches the
 * tokenizer as isolated tags with ordinary markdown content between them, so honouring the
 * subtree rule means tracking which skipped element is currently open. JSX names are compared
 * case-sensitively (`<Code>` is a component, `<code>` is an element); HTML names are not.
 */
function updateElementStack(stack: string[], tag: string, caseSensitive: boolean): void {
  const parsed = readTag(tag);
  if (parsed === null) return;
  const name = caseSensitive ? parsed.name : asciiLower(parsed.name);
  if (parsed.closing) {
    if (stack[stack.length - 1] === name) stack.pop();
    return;
  }
  if (!parsed.selfClosing && isSkippedElement(name)) stack.push(name);
}

function tokenize(source: string, extensions: readonly Extension[]): Event[] {
  return postprocess(
    parse({ extensions: [...extensions] })
      .document()
      .write(preprocess()(source, null, true)),
  );
}

/**
 * modes.md 3.7.1. The dialect is the caller's, never detected: `"commonmark"` is CommonMark 0.31
 * plus GFM, `"mdx"` is the same minus indented code blocks and `<…>` autolinks, plus JSX and
 * `{…}` expression containers. Both enable frontmatter and GFM, which 3.7.2 makes normative —
 * §4's promise that table alignment rows survive is empty unless tables are recognised at all.
 */
export function resolveDialect(dialect: Dialect | undefined): Dialect {
  if (dialect === "commonmark" || dialect === "mdx") return dialect;
  if (dialect === undefined) {
    throw new PolytypoError(
      "POLYTYPO_INVALID_DIALECT",
      'Mode "markdown" requires a dialect. Expected "commonmark" or "mdx"; there is no default.',
    );
  }
  throw new PolytypoError(
    "POLYTYPO_INVALID_DIALECT",
    `Unknown dialect "${String(dialect)}". Expected "commonmark" or "mdx".`,
  );
}

function extensionsFor(dialect: Dialect): Extension[] {
  return dialect === "mdx" ? [frontmatter(), gfm(), mdxjs()] : [frontmatter(), gfm()];
}

export function markdownSpans(source: string, dialect: Dialect): Span[] {
  const events = wrapParserErrors(dialect, () => tokenize(source, extensionsFor(dialect)));
  const spans: Span[] = [];
  const elementStack: string[] = [];
  let skipDepth = 0;

  for (const [kind, token] of events) {
    const type = token.type;

    if (SKIPPED_TOKEN_TYPES.has(type)) {
      skipDepth += kind === "enter" ? 1 : -1;
      continue;
    }

    if (RAW_TAG_TOKEN_TYPES.has(type)) {
      if (kind === "enter") {
        updateElementStack(
          elementStack,
          source.slice(token.start.offset, token.end.offset),
          type !== "htmlText",
        );
      }
      skipDepth += kind === "enter" ? 1 : -1;
      continue;
    }

    // An HTML block is handed to the `html` extractor rather than skipped whole, so that the
    // prose inside `<div>…</div>` is typeset while the markup is not.
    if (type === "htmlFlow") {
      if (kind === "enter" && skipDepth === 0 && elementStack.length === 0) {
        for (const span of htmlFragmentSpans(
          source.slice(token.start.offset, token.end.offset),
          token.start.offset,
        )) {
          spans.push(span);
        }
      }
      skipDepth += kind === "enter" ? 1 : -1;
      continue;
    }

    if (kind === "enter" && type === "data" && skipDepth === 0 && elementStack.length === 0) {
      spans.push({ start: token.start.offset, end: token.end.offset });
    }
  }

  return spans;
}
