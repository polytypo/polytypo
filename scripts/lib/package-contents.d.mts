export declare const ENTRY_NAMES: string[];

export declare function extractChunkReferences(content: string, sourceLabel?: string): Promise<string[]>;

export declare function extractSourceMappingRefs(content: string): string[];

export declare function assertPackageContents(
  files: Set<string>,
  pkg: { version: string; exports: unknown },
  readFileContent: (relativePath: string) => Promise<string | null>,
): Promise<string[]>;
