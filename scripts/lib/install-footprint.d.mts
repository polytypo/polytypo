export interface DependencyGraphResult {
  directDependencyNames: string[];
  identities: Set<string>;
  edgeCount: number;
}

export declare function collectDependencyGraph(tree: unknown): DependencyGraphResult;

export declare function countInstalledDirectories(parseableOutput: string): number;
