// Strict parsing for scripts/dogfood-m4.ts's flags. Follows the same fail-closed contract as
// scripts/lib/cli-args.mjs's parseTarballArg: an unrecognised flag, a duplicate, or a missing
// value is an error, not a silently-tolerated default — this tool runs against real content and a
// silently wrong locale/dialect would misrepresent the whole evidence bundle.
export interface DogfoodArgs {
  corpus: string;
  out: string;
  locale: string;
  dialect: "commonmark" | "mdx";
  /** Why this locale, for this corpus, was chosen — recorded verbatim in manifest.json so the
   * evidence bundle states the locale decision explicitly rather than leaving a bare code
   * ("en-US") to speak for itself. Optional at the parser level (a caller who truly has nothing
   * to add can omit it), but the real M4 run always supplies one. */
  localeRationale: string;
}

export type ParsedDogfoodArgs =
  { args: DogfoodArgs; error?: undefined } | { args?: undefined; error: string };

const REQUIRED_FLAGS = ["--corpus", "--out", "--locale", "--dialect"] as const;
const OPTIONAL_FLAGS = ["--locale-rationale"] as const;
const ALL_FLAGS = [...REQUIRED_FLAGS, ...OPTIONAL_FLAGS] as const;

export function parseDogfoodArgs(argv: readonly string[]): ParsedDogfoodArgs {
  const values = new Map<string, string>();

  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i];
    if (flag === undefined || !(ALL_FLAGS as readonly string[]).includes(flag)) {
      return { error: `unknown argument: "${flag}"` };
    }
    if (values.has(flag)) {
      return { error: `duplicate ${flag} flag` };
    }
    const value = argv[i + 1];
    if (value === undefined) {
      return { error: `${flag} requires a value` };
    }
    values.set(flag, value);
    i += 1;
  }

  const missing = REQUIRED_FLAGS.filter((flag) => !values.has(flag));
  if (missing.length > 0) {
    return { error: `missing required argument(s): ${missing.join(", ")}` };
  }

  const dialect = values.get("--dialect") as string;
  if (dialect !== "commonmark" && dialect !== "mdx") {
    return { error: `--dialect must be "commonmark" or "mdx", got "${dialect}"` };
  }

  const locale = values.get("--locale") as string;
  if (locale.trim() === "") {
    return { error: "--locale must not be empty" };
  }

  return {
    args: {
      corpus: values.get("--corpus") as string,
      out: values.get("--out") as string,
      locale,
      dialect,
      localeRationale: values.get("--locale-rationale") ?? "",
    },
  };
}
