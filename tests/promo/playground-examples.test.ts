// The worked examples on /playground are written to brand/tools/promo/playground-examples.json
// but are never trusted: every output here is re-measured with the installed engine.
// The FAQ copy is checked to be a fixed point of polytypo's own en-GB rules.
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { transform } from "polytypo";
import { describe, expect, it } from "vitest";

const SRC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../brand/tools/promo");
const read = <T>(name: string): T => JSON.parse(readFileSync(path.join(SRC, name), "utf8")) as T;

describe("/playground static copy", () => {
  const examples = read<{ locale: string; input: string; output: string }[]>(
    "playground-examples.json",
  );
  it.each(examples.map((e) => [e.locale, e.input, e.output]))(
    "example %s: %s",
    (locale, input, output) => {
      expect(transform(input, { locale, mode: "text" })).toBe(output);
    },
  );

  it("FAQ answers are already typeset in en-GB", () => {
    for (const { q, a } of read<{ q: string; a: string }[]>("playground-faq.json")) {
      expect(transform(q, { locale: "en-GB", mode: "text" })).toBe(q);
      expect(transform(a, { locale: "en-GB", mode: "text" })).toBe(a);
    }
  });
});
