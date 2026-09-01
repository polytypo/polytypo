export type Mode = "text" | "html" | "markdown";

/**
 * `markdown` is not one language (spec/rules/modes.md 3.7.1). CommonMark and MDX disagree on
 * ordinary documents, so the caller states which they have — it is the file extension, and the
 * library can never know it. Detection is forbidden: one `<https://…>` autolink makes a file
 * invalid MDX, and a heuristic would then silently reclassify an ESM statement as prose.
 */
export type Dialect = "commonmark" | "mdx";

export type RuleId =
  | "spaces"
  | "ellipsis"
  | "dashes"
  | "ranges"
  | "hyphen"
  | "quotes"
  | "apostrophe"
  | "symbols"
  | "nbsp";

export interface Options {
  /** Required. An unknown locale throws; there is never a fallback to English. */
  locale: string;
  mode?: Mode;
  /** Required when `mode` is `"markdown"`, with no default; ignored in `text` and `html`. */
  dialect?: Dialect;
  /**
   * Per-rule override, keyed by `RuleId`. For a default-on rule (every rule except `ranges`),
   * `false` disables it and `true` is a no-op. For `ranges` — off by default (spec 0.5.0) —
   * `true` explicitly opts in and `false` (or omitting the key) leaves it disabled. Absence of a
   * key always means "use that rule's own default", never "off".
   */
  rules?: Partial<Record<RuleId, boolean>>;
}

/** Mirrors spec/schema/locale.schema.json. Literal data only — no patterns, no priorities. */
export interface QuotePair {
  readonly open: string;
  readonly close: string;
  readonly innerSpace: "none" | "nbsp" | "narrow-nbsp";
}

/**
 * A closed-set elision idiom — quotes.md 3.2's listed elision veto. Matching `elided` alone
 * cannot distinguish an idiom (`rock 'n' roll`) from an arbitrary quoted word
 * (`The letter 'n' is common.`); `left`/`right` are the surrounding context that does.
 */
export interface ElisionIdiom {
  readonly left: string;
  readonly elided: string;
  readonly right: string;
}

/**
 * `nbsp.initialBinding` — spec/rules/nbsp.md §3.9 (spec 0.6.0, replaces the boolean
 * `bindInitials`). `"none"`: N7 disabled. `"chain"`: binds only a confirmed sequence of two or
 * more adjacent initials (Chicago's own "two or more initials" wording) — a lone initial next to
 * an ordinary capitalized word is left alone. `"single"`: additionally binds one lone initial to
 * a following word (Jacques André's citation for `fr`/`fr-CA`), which cannot structurally
 * distinguish every genuine name from a sentence-boundary collision — see nbsp.md §7.
 */
export type InitialBinding = "none" | "chain" | "single";

export interface LocaleData {
  readonly locale: string;
  readonly name: string;
  readonly quotes: {
    readonly primary: QuotePair;
    readonly secondary: QuotePair;
    /** May be empty. Empty means no verified idiom of this shape for this locale. */
    readonly elisionIdioms: readonly ElisionIdiom[];
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
    readonly initialBinding: InitialBinding;
  };
  readonly sources: readonly LocaleSource[];
}

export interface LocaleSource {
  /** Rule ids from spec/rules/order.json — note the rule is `dashes`/`ranges` while the field
   * both read is `dash`. */
  readonly rule:
    | "quotes"
    | "dashes"
    | "ranges"
    | "ellipsis"
    | "hyphen"
    | "nbsp"
    | "spaces"
    | "apostrophe"
    | "symbols";
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
