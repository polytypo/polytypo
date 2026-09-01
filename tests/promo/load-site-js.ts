// Loads the actual shipped brand/tools/promo/site.js (a browser script assigning
// `window.Polytypo`) into a Node vm sandbox, so tests exercise the real code rather than a
// reimplementation of it. No real DOM is needed: none of the tested functions touch `document`
// (only `bootTabs` does, and it is never called here). The permalink helpers use `btoa`/`atob`/
// `TextEncoder`/`TextDecoder`/`URL` as bare globals (as they are in a real browser's `window`) —
// a fresh vm context does not inherit Node's own globals, so they're injected explicitly below.
import { readFileSync } from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

export interface PermalinkDecodeResult {
  ok: boolean;
  reason?: string;
  state?: { locale: string; mode: string; dialect: string; input: string };
}

export interface PolytypoSiteJs {
  esc: (s: string) => string;
  mark: (s: string) => string;
  diff: (a: string[], b: string[]) => Array<[boolean, string]>;
  paint: (segments: Array<[boolean, string]>) => string;
  summarizeChange: (text: string, out: string, segments: Array<[boolean, string]>) => string;
  summarizeError: (code: string) => string;
  encodePermalinkFragment: (state: {
    locale: string;
    mode: string;
    dialect?: string;
    input: string;
  }) => string;
  decodePermalinkFragment: (fragment: string) => PermalinkDecodeResult;
  copyStatusText: (what: string, ok: boolean) => string;
  permalinkStatusText: (outcome: "copied" | "clipboard-unavailable" | "too-long") => string;
  shareStatusText: (outcome: "shared" | "cancelled" | "failed") => string;
  buildPermalinkUrl: (currentHref: string, encodedFragment: string) => string;
  stripPermalinkFragment: (currentHref: string) => string;
  validateRestoredState: (
    state: { locale: string; mode: string; dialect: string; input: string },
    options: { locales: string[]; modes: string[]; dialects: string[] },
  ) => boolean;
  MAX_PERMALINK_LENGTH: number;
}

export function loadPolytypoSiteJs(): PolytypoSiteJs {
  const source = readFileSync(path.join(ROOT, "brand/tools/promo/site.js"), "utf8");
  const sandbox: {
    window: Record<string, unknown>;
    btoa: typeof btoa;
    atob: typeof atob;
    TextEncoder: typeof TextEncoder;
    TextDecoder: typeof TextDecoder;
    URL: typeof URL;
  } = {
    window: {},
    btoa: globalThis.btoa,
    atob: globalThis.atob,
    TextEncoder: globalThis.TextEncoder,
    TextDecoder: globalThis.TextDecoder,
    URL: globalThis.URL,
  };
  vm.createContext(sandbox);
  vm.runInContext(source, sandbox, { filename: "site.js" });
  return sandbox.window.Polytypo as unknown as PolytypoSiteJs;
}
