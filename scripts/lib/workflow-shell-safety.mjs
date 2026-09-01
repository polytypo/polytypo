// Static check: no `${{ ... }}` GitHub Actions expression appears inside a `run:` step's shell
// text (Stage 6 follow-up review, item 2). A git tag name (`github.ref_name`) — and other GitHub
// context values in general — can contain arbitrary characters, including shell metacharacters
// (`v$(...)`, backticks, `;`); interpolating one directly into a `run:` block lets its contents
// be parsed as shell syntax. The fix is always the same: pass the value through a step-level
// `env:` var and reference it as a shell variable (`"${VAR}"`), never `${{ }}` inside `run:`.
//
// Deliberately dependency-free (no YAML parser added just for this): workflow `run:` blocks are
// either a block scalar (`run: |`, `run: >`, and their indentation/chomping-indicator variants —
// see RUN_BLOCK_SCALAR below — followed by more-indented lines) or an inline scalar (`run: <rest
// of line>`), and this project's workflow files don't do anything more exotic than that — a
// line/indentation scan is sufficient and avoids taking on a YAML-parsing dependency for one
// structural check. Extracted into this pure module so
// tests/scripts/workflow-shell-safety.test.ts can exercise it against fabricated YAML text.
//
// The invariant this enforces is narrow on purpose: "no `${{` opener occurs anywhere in
// executable run: text." It does not attempt to parse a complete `${{ ... }}` expression (which
// can legally contain `}` inside a quoted function argument, e.g.
// `${{ format('{0}', github.ref_name) }}` — a naive `/\$\{\{[^}]*\}\}/` stops at that inner `}`
// and never finds the real close). Finding the opener is sufficient to prove the invariant either
// holds or doesn't; nothing downstream needs the expression's parsed content, only its presence
// and location.
// `[|>]` block-scalar type, then an optional indentation indicator (1-9) and/or chomping
// indicator (-/+), in either order (both orders are valid YAML: `|2-` and `|-2` are equivalent),
// then an optional trailing comment.
const RUN_BLOCK_SCALAR = /^(\s*)run:\s*[|>](?:[1-9][+-]?|[+-][1-9]?)?\s*(?:#.*)?$/;
const RUN_INLINE_SCALAR = /^(\s*)run:\s*(\S.*)$/;
const EXPRESSION_OPENER = /\$\{\{/g;

/** Every `${{` opener found on `line`, reported with the rest of the line as diagnostic context
 * (not a parsed expression — see the module comment on why this checker doesn't try to find the
 * matching close). */
function pushOpenersOnLine(line, lineNumber, violations) {
  for (const match of line.matchAll(EXPRESSION_OPENER)) {
    violations.push({ lineNumber, line, context: line.slice(match.index).trimEnd() });
  }
}

/**
 * @param {string} yamlText - raw workflow file contents.
 * @returns {Array<{lineNumber: number, line: string, context: string}>} every `${{` opener found
 *   inside a `run:` step's shell text, with its 1-indexed source line and the rest of that line
 *   (from the opener onward) for diagnosis.
 */
export function findContextExpressionsInRunBlocks(yamlText) {
  const lines = yamlText.split("\n");
  const violations = [];

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];

    // Block-scalar check first: `run: |` (and its `>`/indentation/chomping-indicator variants)
    // would otherwise also match the inline-scalar pattern below (its content looks like a
    // single non-whitespace token, e.g. "|" or ">2-"), which would stop at that line instead of
    // scanning the following, more-indented body lines.
    const blockMatch = line.match(RUN_BLOCK_SCALAR);
    if (blockMatch) {
      const runIndent = blockMatch[1].length;
      for (let j = i + 1; j < lines.length; j += 1) {
        const bodyLine = lines[j];
        if (bodyLine.trim().length === 0) continue; // blank lines don't end a block scalar
        const bodyIndent = bodyLine.length - bodyLine.trimStart().length;
        if (bodyIndent <= runIndent) break; // dedent — block scalar ended
        pushOpenersOnLine(bodyLine, j + 1, violations);
      }
      continue;
    }

    const inlineMatch = line.match(RUN_INLINE_SCALAR);
    if (inlineMatch) {
      pushOpenersOnLine(line, i + 1, violations);
    }
  }

  return violations;
}
