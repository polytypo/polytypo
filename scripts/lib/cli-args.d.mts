export declare function parseTarballArg(
  argv: string[],
): { tarballPath: string | null; error?: undefined } | { tarballPath?: undefined; error: string };
