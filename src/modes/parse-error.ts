import { PolytypoError } from "../errors.js";

interface PositionedError {
  readonly reason?: unknown;
  readonly place?: { readonly line?: unknown; readonly column?: unknown } | null;
}

function describe(error: unknown): string {
  if (typeof error !== "object" || error === null) return String(error);
  const positioned = error as PositionedError;
  const reason =
    typeof positioned.reason === "string" ? positioned.reason : (error as Error).message;
  const place = positioned.place;
  if (
    place !== null &&
    place !== undefined &&
    typeof place.line === "number" &&
    typeof place.column === "number"
  ) {
    return `${reason} (line ${place.line}, column ${place.column})`;
  }
  return reason;
}

/**
 * spec/rules/modes.md 3.7.2. **The parser's own error type must never escape.** A
 * `VFileMessage`, a `Nokogiri::SyntaxError` or a Python exception on the public surface puts a
 * dependency's type into the contract and is unreproducible in the other four runtimes; only the
 * code is contractual (ARCHITECTURE.md 4.6), while the message and the source position are
 * useful and are not.
 *
 * Reachable in exactly one place: `dialect: "mdx"`, because MDX embeds JavaScript. HTML parsing
 * is specified with total error recovery and every byte sequence is valid CommonMark, so neither
 * of the other two languages can fail. The wrapper is applied to all of them anyway — the
 * guarantee is that no parser type escapes, not that this particular parser is trusted.
 */
export function wrapParserErrors<T>(what: string, run: () => T): T {
  try {
    return run();
  } catch (error) {
    if (error instanceof PolytypoError) throw error;
    throw new PolytypoError(
      "POLYTYPO_MALFORMED_INPUT",
      `Input does not parse as ${what}: ${describe(error)}`,
    );
  }
}
