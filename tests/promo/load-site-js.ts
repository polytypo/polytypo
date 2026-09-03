// Loads the actual shipped brand/tools/promo/site.js (a browser script assigning
// `window.Polytypo`) into a Node vm sandbox, so tests exercise the real code rather than a
// reimplementation of it. No real DOM is needed: none of the tested functions touch `document`
// (only `bootTabs` does, and it is never called here), and none of them need a browser global —
// the `btoa`/`atob`/`TextEncoder`/`TextDecoder`/`URL` injections a fresh vm context does not
// inherit from Node were there for the permalink encoder, which no longer exists.
//
// The declared interface is deliberately the exhaustive public surface, not a convenient subset:
// tests/promo/no-permalink.test.ts asserts against `loadRawPolytypoSiteJs()` that nothing outside
// it is exported, so a helper quietly reintroduced into site.js cannot slip past unnoticed.
import { readFileSync } from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

export interface PolytypoSiteJs {
  esc: (s: string) => string;
  mark: (s: string) => string;
  diff: (a: string[], b: string[]) => Array<[boolean, string]>;
  paint: (segments: Array<[boolean, string]>) => string;
  describeChange: (text: string) => string | undefined;
  highlight: (code: string, commentToken: string) => string;
  highlightLines: (code: string, commentToken: string) => string;
  bootTabs: (tabsId: string, panesId: string) => void;
  summarizeChange: (text: string, out: string, segments: Array<[boolean, string]>) => string;
  summarizeError: (code: string) => string;
  copyStatusText: (what: string, ok: boolean) => string;
}

/** The exported object exactly as site.js assigns it, untyped — for the guard test that checks
 * which keys exist at all, including ones the typed view above deliberately does not name. */
export function loadRawPolytypoSiteJs(): Record<string, unknown> {
  const source = readFileSync(path.join(ROOT, "brand/tools/promo/site.js"), "utf8");
  const sandbox: { window: Record<string, unknown> } = { window: {} };
  vm.createContext(sandbox);
  vm.runInContext(source, sandbox, { filename: "site.js" });
  return sandbox.window.Polytypo as Record<string, unknown>;
}

export function loadPolytypoSiteJs(): PolytypoSiteJs {
  return loadRawPolytypoSiteJs() as unknown as PolytypoSiteJs;
}
