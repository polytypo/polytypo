/**
 * The engine indexes Unicode code points, never UTF-16 units: a JS string, a Go string and a
 * PHP string disagree about "characters" outside the BMP (ARCHITECTURE.md 4.2). Conversion
 * happens once on entry and once on exit.
 *
 * Unpaired surrogates are carried through as their own code point, so text that is not
 * well-formed UTF-16 still round-trips byte-for-byte instead of being silently repaired.
 */
export function toCodePoints(input: string): number[] {
  const out: number[] = [];
  const len = input.length;
  let i = 0;
  while (i < len) {
    const unit = input.charCodeAt(i);
    if (unit >= 0xd800 && unit <= 0xdbff && i + 1 < len) {
      const next = input.charCodeAt(i + 1);
      if (next >= 0xdc00 && next <= 0xdfff) {
        out.push((unit - 0xd800) * 0x400 + (next - 0xdc00) + 0x10000);
        i += 2;
        continue;
      }
    }
    out.push(unit);
    i += 1;
  }
  return out;
}

const CHUNK = 4096;

export function fromCodePoints(cp: readonly number[]): string {
  if (cp.length === 0) return "";
  if (cp.length <= CHUNK) return String.fromCodePoint(...cp);
  let out = "";
  for (let i = 0; i < cp.length; i += CHUNK) {
    out += String.fromCodePoint(...cp.slice(i, i + CHUNK));
  }
  return out;
}

export function isValidCodePoint(value: number): boolean {
  return Number.isInteger(value) && value >= 0 && value <= 0x10ffff;
}
