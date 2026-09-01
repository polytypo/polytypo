export declare const PLACEHOLDER_VERSION: string;

export declare function verifyReleaseTag(
  tag: string,
  packageVersion: string,
): { ok: true } | { ok: false; reason: string };
