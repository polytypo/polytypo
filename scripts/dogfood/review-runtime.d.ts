// Type declarations for review-runtime.js -- deliberately kept a plain .js file (see its own doc
// comment: it must run unmodified as an inlined classic <script> in REVIEW.html), typed here so
// tests importing it get normal TypeScript checking.
export declare const DECISIONS: readonly string[];
export declare const EXPORT_SCHEMA_VERSION: number;
export declare const STORAGE_KEY_PREFIX: string;

export declare function storageKey(evidenceReviewHash: string): string;
export declare function isValidDecision(
  value: unknown,
): value is "UNREVIEWED" | "ACCEPT" | "REJECT" | "NEEDS-DISCUSSION";

export interface ReviewDecisionState {
  decisions: Record<string, string>;
  notes: Record<string, string>;
}

export declare function createDefaultState(ids: readonly string[]): ReviewDecisionState;

export interface DecisionCounts {
  total: number;
  UNREVIEWED: number;
  ACCEPT: number;
  REJECT: number;
  "NEEDS-DISCUSSION": number;
}

export declare function computeCounts(
  ids: readonly string[],
  decisions: Record<string, string>,
): DecisionCounts;
export declare function isFullyAccepted(
  ids: readonly string[],
  decisions: Record<string, string>,
): boolean;

export interface ExportPayload {
  schemaVersion: number;
  evidenceReviewHash: string;
  counts: DecisionCounts;
  decisions: { id: string; decision: string; note: string }[];
}

export declare function serializeExportPayload(
  evidenceReviewHash: string,
  ids: readonly string[],
  decisions: Record<string, string>,
  notes: Record<string, string>,
): ExportPayload;

export type ImportValidationResult =
  | {
      ok: true;
      decisions: Record<string, string>;
      notes: Record<string, string>;
      importedCount: number;
      totalCount: number;
    }
  | { ok: false; reason: string };

export declare function validateImportPayload(
  raw: unknown,
  expectedEvidenceReviewHash: string,
  expectedIds: readonly string[],
  opts?: { allowPartial?: boolean },
): ImportValidationResult;

export declare function mergeImportedState(
  existingDecisions: Record<string, string>,
  existingNotes: Record<string, string>,
  imported: { decisions: Record<string, string>; notes: Record<string, string> },
): ReviewDecisionState;
