export type Mode = "text" | "html" | "markdown";

/**
 * `markdown` is not one language (spec/rules/modes.md 3.7.1). CommonMark and MDX disagree on
 * ordinary documents, so the caller states which they have — it is the file extension, and the
 * library can never know it. Detection is forbidden: one `<https://…>` autolink makes a file
 * invalid MDX, and a heuristic would then silently reclassify an ESM statement as prose.
 */
export type Dialect = "commonmark" | "mdx";

export type RuleId =
  "spaces" | "ellipsis" | "dashes" | "hyphen" | "quotes" | "apostrophe" | "symbols" | "nbsp";

export interface Options {
  /** Required. An unknown locale throws; there is never a fallback to English. */
  locale: string;
  mode?: Mode;
  /** Required when `mode` is `"markdown"`, with no default; ignored in `text` and `html`. */
  dialect?: Dialect;
  /** Opt-out only: `false` disables a rule, `true` is a no-op. */
  rules?: Partial<Record<RuleId, boolean>>;
}

/** Mirrors spec/schema/locale.schema.json. Literal data only — no patterns, no priorities. */
export interface QuotePair {
  readonly open: string;
  readonly close: string;
  readonly innerSpace: "none" | "nbsp" | "narrow-nbsp";
}

export interface LocaleData {
  readonly locale: string;
  readonly name: string;
  readonly quotes: {
    readonly primary: QuotePair;
    readonly secondary: QuotePair;
  };
  readonly dash: {
    readonly parenthetical: "em-tight" | "em-spaced" | "en-tight" | "en-spaced" | "none";
    readonly range: "em-tight" | "em-spaced" | "en-tight" | "en-spaced" | "none";
  };
  readonly ellipsis: {
    readonly abbreviatedAfterTerminal: boolean;
  };
  /** Morphological forms whose hyphen must not break. Empty arrays are the normal case. */
  readonly hyphen: {
    readonly prefixes: readonly string[];
    readonly suffixes: readonly string[];
    readonly compounds: readonly string[];
  };
  readonly nbsp: {
    readonly beforePunctuation: readonly string[];
    readonly narrowBeforePunctuation: readonly string[];
    readonly afterShortWords: readonly string[];
    readonly abbreviations: readonly string[];
    readonly beforeUnits: readonly string[];
    readonly beforeNumber: readonly string[];
    readonly beforeWord: readonly string[];
    readonly afterSymbols: readonly string[];
    readonly bindInitials: boolean;
  };
  readonly sources: readonly LocaleSource[];
}

export interface LocaleSource {
  /** Rule ids from spec/rules/order.json — note the rule is `dashes` while the field it reads is `dash`. */
  readonly rule:
    "quotes" | "dashes" | "ellipsis" | "hyphen" | "nbsp" | "spaces" | "apostrophe" | "symbols";
  readonly cite: string;
  readonly url?: string;
  readonly note?: string;
}

/**
 * Indices address the code-point array, never a native string: UTF-16 offsets do not
 * survive the port to Go/PHP (ARCHITECTURE.md 4.2).
 */
export interface Edit {
  readonly start: number;
  readonly end: number;
  readonly replacement: readonly number[];
  readonly ruleId: RuleId;
}

export interface RuleContext {
  readonly cp: readonly number[];
  readonly locale: LocaleData;
  readonly mode: Mode;
}

export interface Rule {
  readonly id: RuleId;
  /** Must return non-overlapping edits in ascending order of `start`. */
  apply(ctx: RuleContext): Edit[];
}
