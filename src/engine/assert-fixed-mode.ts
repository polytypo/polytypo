import { PolytypoError } from "../errors.js";
import type { Mode } from "../types.js";

/**
 * `polytypo/text`, `polytypo/html` and `polytypo/markdown` each fix `mode` at the type level by
 * omitting it from their Options type (AUDIT_REMEDIATION_AND_RELEASE_PLAN.md 5.1, criterion 6).
 * A plain-JS caller — or a TypeScript caller passing a wider-typed variable, which excess-property
 * checking does not catch — can still supply a conflicting `mode` at runtime. That is rejected
 * explicitly here, never silently ignored or overridden.
 */
export function assertFixedMode(mode: unknown, fixed: Mode, entryPoint: string): void {
  if (mode === undefined || mode === fixed) return;
  throw new PolytypoError(
    "POLYTYPO_INVALID_MODE",
    `"${entryPoint}" only supports mode "${fixed}". Received "${String(mode)}" — ` +
      `import from "polytypo" for the other modes, or omit \`mode\` here.`,
  );
}
