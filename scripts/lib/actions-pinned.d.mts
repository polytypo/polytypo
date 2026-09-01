export interface UnpinnedActionUse {
  lineNumber: number;
  /** The parsed `uses:` value, or "" when the value itself wasn't a literal string (a mapping,
   * sequence, alias, null, or non-string scalar) or the violation is a YAML syntax error. */
  reference: string;
  /** Human-readable explanation of why this reference is not immutably pinned. */
  reason: string;
}

export declare function findUnpinnedActionUses(yamlText: string): UnpinnedActionUse[];

export interface WorkflowFileCheckResult {
  file: string;
  violations: UnpinnedActionUse[];
}

export declare function checkWorkflowsDirectory(dir: string): Promise<WorkflowFileCheckResult[]>;
