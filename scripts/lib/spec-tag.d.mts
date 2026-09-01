export declare function parseStrictSpecVersion(
  raw: string,
): { ok: true; version: string } | { ok: false; reason: string };

export declare function deriveSpecTagName(specVersion: string): string;

export declare function verifySpecTag(opts: {
  specVersionRaw: string;
  expectedCommitSha: string;
  cwd?: string;
  run?: (args: string[], cwd: string | undefined) => string;
}): { ok: true; tagName: string; commit: string } | { ok: false; reason: string };
