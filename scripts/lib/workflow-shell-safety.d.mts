export interface RunBlockViolation {
  lineNumber: number;
  line: string;
  /** Diagnostic snippet from the `${{` opener to the end of the line — not a parsed expression. */
  context: string;
}

export declare function findContextExpressionsInRunBlocks(yamlText: string): RunBlockViolation[];
