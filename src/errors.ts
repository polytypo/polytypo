export type PolytypoErrorCode =
  | "POLYTYPO_UNKNOWN_LOCALE"
  | "POLYTYPO_INVALID_MODE"
  | "POLYTYPO_INVALID_DIALECT"
  | "POLYTYPO_UNKNOWN_RULE"
  | "POLYTYPO_MALFORMED_LOCALE_DATA"
  | "POLYTYPO_RULE_CONTRACT"
  | "POLYTYPO_MALFORMED_INPUT";

/** Codes are the contract across all five runtimes; messages are English and are not (ARCHITECTURE.md 4.6). */
export class PolytypoError extends Error {
  readonly code: PolytypoErrorCode;

  constructor(code: PolytypoErrorCode, message: string) {
    super(message);
    this.name = "PolytypoError";
    this.code = code;
  }
}
