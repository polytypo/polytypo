import { runPipeline } from "./engine/pipeline.js";
import type { Options } from "./types.js";

export function transform(input: string, options: Options): string {
  return runPipeline(input, options);
}

export { PolytypoError } from "./errors.js";
export type { PolytypoErrorCode } from "./errors.js";
export type {
  Dialect,
  Edit,
  LocaleData,
  LocaleSource,
  Mode,
  Options,
  QuotePair,
  Rule,
  RuleContext,
  RuleId,
} from "./types.js";
