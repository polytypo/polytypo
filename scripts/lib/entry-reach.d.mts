export declare const PACKAGES: {
  parse5: RegExp;
  micromarkCore: RegExp;
  gfm: RegExp;
  frontmatter: RegExp;
  mdx: RegExp;
};

export declare const MICROMARK_FAMILY: RegExp;

export declare const ALL_FIVE: RegExp[];

export interface EntryReachSpec {
  forbidden: RegExp[];
  required: RegExp[];
}

export declare const ENTRIES: {
  text: EntryReachSpec;
  html: EntryReachSpec;
  markdown: EntryReachSpec;
  index: EntryReachSpec;
};

export declare function matching(inputs: string[], patterns: RegExp[]): string[];

export interface EvaluateResult {
  ok: boolean;
  reason: "forbidden" | "missing-required" | null;
  forbiddenHits: string[];
  missingRequired: RegExp[];
}

export declare function evaluate(inputs: string[], spec: EntryReachSpec): EvaluateResult;
