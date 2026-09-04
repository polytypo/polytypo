// Semantic check: every external `uses:` reference in a workflow file is pinned to an immutable
// full 40-character commit SHA (this stage's security-hardening task). A mutable major/minor tag
// (`@v5`), a full release tag (`@v5.1.0`), a branch name, or an abbreviated SHA can all be
// force-moved or reused upstream; only a full commit SHA is immutable. Dependabot
// (.github/dependabot.yml) is expected to propose SHA updates over time while this check keeps
// the pin itself mandatory.
//
// Uses the `yaml` package (a direct devDependency, not an incidental transitive one) to parse
// each file into its real document tree and walk every mapping `Pair`, rather than a line-oriented
// regex — a regex over `^uses:` text misses valid YAML forms that still carry a real `uses` key,
// such as a flow mapping (`{ uses: actions/checkout@v5 }`) or a quoted key (`"uses":
// actions/checkout@v5`); both parse to the exact same semantic key/value pair a block-style
// `uses: ...` does, and a policy check that only pattern-matches the common spelling would let a
// real mutable action reference through undetected. `LineCounter` converts the parser's byte
// offsets back into 1-indexed source lines for diagnostics, without ever converting the document
// to plain JSON first (which would discard node ranges entirely).
import { LineCounter, isAlias, isMap, isScalar, isSeq, parseDocument, visit } from "yaml";

const FULL_SHA = /^[0-9a-fA-F]{40}$/;
const ABBREVIATED_SHA = /^[0-9a-fA-F]{7,39}$/;
const DOCKER_DIGEST = /^sha256:[0-9a-fA-F]{64}$/;

/**
 * @param {string} value - a `uses:` value already confirmed to be a literal YAML string.
 * @returns {{ok: true} | {ok: false, reason: string}}
 */
function classifyReference(value) {
  if (value === "") {
    return { ok: false, reason: "uses: has an empty value" };
  }
  // Only a same-repository reference beginning with `./` is exempt — GitHub's documented form
  // for a same-repository reusable workflow is `./.github/workflows/<file>.yml`. `../` is not a
  // form GitHub recognises for `uses:` at all (a step or job `uses:` is always either a local
  // `./`-rooted path, or `owner/repo[/path]@ref` — including for an external reusable workflow,
  // `owner/repo/.github/workflows/<file>@ref`), so it falls through to the generic external-
  // reference check below and is rejected there — deliberately not given its own "unsupported
  // local form" message, since it isn't a local form GitHub supports at all.
  if (value.startsWith("./")) {
    return { ok: true };
  }
  if (value.includes("${{")) {
    return { ok: false, reason: `dynamic expression used as the action reference ("${value}")` };
  }
  if (value.startsWith("docker://")) {
    const image = value.slice("docker://".length);
    const at = image.lastIndexOf("@");
    if (at === -1) {
      return {
        ok: false,
        reason: `docker action "${value}" has no @digest — a bare tag is mutable`,
      };
    }
    const digest = image.slice(at + 1);
    if (!DOCKER_DIGEST.test(digest)) {
      return {
        ok: false,
        reason: `docker action "${value}" is not pinned to an immutable sha256 digest`,
      };
    }
    return { ok: true };
  }

  const at = value.lastIndexOf("@");
  if (at === -1) {
    return { ok: false, reason: `"${value}" has no @revision` };
  }
  const revision = value.slice(at + 1);
  if (revision === "") {
    return { ok: false, reason: `"${value}" has an empty revision` };
  }
  if (FULL_SHA.test(revision)) {
    return { ok: true };
  }
  if (ABBREVIATED_SHA.test(revision)) {
    return {
      ok: false,
      reason: `"${value}" uses an abbreviated commit SHA (${revision.length} hex characters) — needs the full 40-character SHA`,
    };
  }
  return {
    ok: false,
    reason: `"${value}" is not pinned to a full 40-character commit SHA (found "${revision}", a mutable tag, release, or branch reference)`,
  };
}

/**
 * @param {string} yamlText - raw workflow file contents.
 * @returns {Array<{lineNumber: number, reference: string, reason: string}>} every `uses:`
 *   mapping value that is not immutably pinned, in document order. A YAML syntax error is itself
 *   reported as a (fail-closed) violation rather than thrown, so a caller never needs its own
 *   try/catch around this function.
 */
export function findUnpinnedActionUses(yamlText) {
  const lineCounter = new LineCounter();
  const doc = parseDocument(yamlText, { lineCounter });

  if (doc.errors.length > 0) {
    return doc.errors.map((error) => ({
      lineNumber: error.linePos?.[0]?.line ?? 1,
      reference: "",
      reason: `YAML syntax error: ${error.message.split("\n")[0]}`,
    }));
  }

  const violations = [];

  visit(doc, {
    Pair(_key, pair) {
      if (!isScalar(pair.key) || pair.key.value !== "uses") return;
      const lineNumber = lineCounter.linePos(pair.key.range[0]).line;
      const value = pair.value;

      if (value === undefined || value === null || (isScalar(value) && value.value === null)) {
        violations.push({ lineNumber, reference: "", reason: "uses: has no value" });
        return;
      }
      if (isAlias(value)) {
        violations.push({
          lineNumber,
          reference: "",
          reason: "uses: value is a YAML alias, not a literal string",
        });
        return;
      }
      if (isMap(value) || isSeq(value)) {
        violations.push({
          lineNumber,
          reference: "",
          reason: `uses: value is a ${isMap(value) ? "mapping" : "sequence"}, not a literal string`,
        });
        return;
      }
      if (!isScalar(value) || typeof value.value !== "string") {
        violations.push({
          lineNumber,
          reference: "",
          reason: `uses: value is not a plain string (parsed as ${isScalar(value) ? typeof value.value : value.constructor.name})`,
        });
        return;
      }

      const reference = value.value;
      const verdict = classifyReference(reference);
      if (!verdict.ok) {
        violations.push({ lineNumber, reference, reason: verdict.reason });
      }
    },
  });

  return violations;
}

/**
 * Scans every `.yml`/`.yaml` file directly inside `dir` (sorted, for a deterministic report) and
 * runs {@link findUnpinnedActionUses} against each. Shared by the CLI checker
 * (scripts/check-actions-pinned.mjs) and its regression tests, so a test exercises the exact same
 * scanning code path CI runs — not a second, hand-rolled directory walk.
 * @param {string} dir
 * @returns {Promise<Array<{file: string, violations: Array<{lineNumber: number, reference: string, reason: string}>}>>}
 */
export async function checkWorkflowsDirectory(dir) {
  const { readFile, readdir } = await import("node:fs/promises");
  const { default: path } = await import("node:path");
  const files = (await readdir(dir))
    .filter((f) => f.endsWith(".yml") || f.endsWith(".yaml"))
    .sort();
  const results = [];
  for (const file of files) {
    const text = await readFile(path.join(dir, file), "utf8");
    results.push({ file, violations: findUnpinnedActionUses(text) });
  }
  return results;
}
