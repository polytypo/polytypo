/* Shared client-side behavior for the promo site. Loaded on every page; each page's own
 * inline script (written by build_promo.py) wires these into that page's specific DOM. */
window.Polytypo = (function () {
  const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

  const INVISIBLES = [
    [/\u00a0/g, '<span class="nb" title="U+00A0 no-break space">\u00a0</span>'],
    [/\u202f/g, '<span class="nb" title="U+202F narrow no-break space">\u202f</span>'],
    [/\u2011/g, '<span class="nb" title="U+2011 non-breaking hyphen">\u2011</span>'],
  ];

  /** What a single visibly-changed character is, for the title tooltip on a highlighted span. */
  const CHAR_INFO = {
    "’": "U+2019 right single quotation mark — closing quote or apostrophe",
    "‘": "U+2018 left single quotation mark — opening secondary quote",
    "“": "U+201C left double quotation mark — opening quote",
    "”": "U+201D right double quotation mark — closing quote",
    "„": "U+201E double low-9 quotation mark — opening quote (German/Russian style)",
    "‚": "U+201A single low-9 quotation mark — opening secondary quote",
    "«": "U+00AB left-pointing double angle quotation mark (guillemet)",
    "»": "U+00BB right-pointing double angle quotation mark (guillemet)",
    "‹": "U+2039 single left-pointing angle quotation mark",
    "›": "U+203A single right-pointing angle quotation mark",
    "–": "U+2013 en dash",
    "—": "U+2014 em dash",
    "…": "U+2026 horizontal ellipsis",
    "×": "U+00D7 multiplication sign",
    "©": "U+00A9 copyright sign",
    "®": "U+00AE registered sign",
    "™": "U+2122 trade mark sign",
  };
  const describeChange = (text) => ([...text].length === 1 ? CHAR_INFO[text] : undefined);

  /** Escape, then always reveal the characters the engine inserted but nobody can see. */
  function mark(text) {
    let html = esc(text);
    // U+2060 is zero-width, so underline the dash it binds instead of the character itself.
    html = html.replace(
      /⁠([–—])⁠/g,
      '<span class="bound" title="U+2060 word joiner on both sides: this range cannot break">⁠$1⁠</span>',
    );
    for (const [re, rep] of INVISIBLES) html = html.replace(re, rep);
    return html;
  }

  /**
   * Character-level LCS. Returns the OUTPUT side only, as segments of [changed, text] —
   * the input side is shown untouched, so the page marks what happened, not what was doomed.
   */
  function diff(a, b) {
    const n = a.length,
      m = b.length;
    const dp = new Uint16Array((n + 1) * (m + 1));
    for (let i = n - 1; i >= 0; i--)
      for (let j = m - 1; j >= 0; j--)
        dp[i * (m + 1) + j] =
          a[i] === b[j]
            ? dp[(i + 1) * (m + 1) + j + 1] + 1
            : Math.max(dp[(i + 1) * (m + 1) + j], dp[i * (m + 1) + j + 1]);

    const right = [];
    const push = (changed, ch) => {
      const last = right[right.length - 1];
      if (last && last[0] === changed) last[1] += ch;
      else right.push([changed, ch]);
    };
    let i = 0,
      j = 0;
    while (i < n && j < m) {
      if (a[i] === b[j]) {
        push(false, b[j]);
        i++;
        j++;
      } else if (dp[(i + 1) * (m + 1) + j] >= dp[i * (m + 1) + j + 1]) i++;
      else {
        push(true, b[j]);
        j++;
      }
    }
    while (j < m) {
      push(true, b[j]);
      j++;
    }
    return right;
  }

  function paint(segments) {
    return segments
      .map(([changed, text]) => {
        if (!changed) return mark(text);
        const why = describeChange(text);
        const title = why ? ' title="' + esc(why) + '"' : "";
        return '<span class="chg"' + title + ">" + mark(text) + "</span>";
      })
      .join("");
  }

  /**
   * Wraps one already-escaped HTML fragment per source line into the numbered line spans every
   * code panel on this site is built from. The number itself is never emitted here: it is CSS
   * generated content on `.ln::before` (see style.css), so it is not a text node, is not part of
   * `textContent`, and does not reach the clipboard when a block is selected and copied.
   *
   * The literal "\n" between spans is what makes that true — the line break has to be real text
   * for a copy to reproduce it, which is also why `.ln` stays inline rather than becoming a block.
   */
  function numberLines(lineHtmls) {
    return lineHtmls.map((html) => '<span class="ln">' + html + "</span>").join("\n");
  }

  /** mark(), split into numbered lines — the diff-skipped path's code-panel form. */
  function markLines(text) {
    return numberLines(text.split("\n").map(mark));
  }

  /**
   * paint(), split into numbered lines. Segments are cut at newlines FIRST so a highlighted span
   * can never straddle a line boundary; each line is then painted by paint() itself, so the
   * escaping and wrapper-class rules are exactly the ones hostile-output.test.ts already pins
   * down rather than a second implementation of them.
   */
  function paintLines(segments) {
    const lines = [[]];
    for (const [changed, text] of segments) {
      const parts = text.split("\n");
      for (let i = 0; i < parts.length; i++) {
        if (i > 0) lines.push([]);
        if (parts[i]) lines[lines.length - 1].push([changed, parts[i]]);
      }
    }
    return numberLines(lines.map(paint));
  }

  /**
   * The playground's `#pg-foot` status line, factored out so it's testable without parsing
   * generated page source. `segments` is diff(a, b)'s OUTPUT-only representation — it has no
   * way to represent characters removed from `text` with nothing put back in their place, so a
   * deletion-only change (e.g. "Hello  , world !" -> "Hello, world!") produces zero changed
   * segments even though text !== out. Reporting "0 changed regions" there would be false, so
   * that case gets its own wording rather than being folded into the region count.
   */
  function summarizeChange(text, out, segments) {
    if (text === out) return "unchanged";
    const regions = segments.filter(([changed]) => changed).length;
    if (regions === 0) return "changed by removals only";
    return regions + " highlighted output region" + (regions === 1 ? "" : "s");
  }

  /** Concise counterpart to the full error text already shown in the labelled Output region —
   * this is the only thing `#pg-foot`'s role="status" live region should announce for a failed
   * transform, so assistive tech gets a short, deterministic message instead of the full error
   * body (or, without this, no announcement at all). */
  function summarizeError(code) {
    return code + " · transformation failed; details in Output";
  }

  /** Status text for a clipboard-copy action, success or failure — factored out so the wording is
   * testable without a real Clipboard API (unavailable/flaky in a test environment). */
  function copyStatusText(what, ok) {
    return ok ? what + " copied." : what + " could not be copied — copy it manually.";
  }

  /** Minimal highlighting: string literals and line comments only, in source order. */
  function highlight(code, commentToken) {
    const pattern = new RegExp(
      `"(?:[^"\\\\]|\\\\.)*"|'(?:[^'\\\\]|\\\\.)*'|${commentToken}.*$`,
      "gm",
    );
    let html = "";
    let last = 0;
    for (const m of code.matchAll(pattern)) {
      html += esc(code.slice(last, m.index));
      const cls = m[0].startsWith(commentToken) ? "tok-com" : "tok-str";
      html += `<span class="${cls}">${esc(m[0])}</span>`;
      last = m.index + m[0].length;
    }
    html += esc(code.slice(last));
    return html;
  }

  /** highlight(), split into numbered lines. Tokenising each line on its own is what keeps a
   * token from straddling a line boundary: line comments are line-scoped already, and an
   * unterminated quote can then only mis-colour its own line instead of swallowing the next. */
  function highlightLines(code, commentToken) {
    return numberLines(code.split("\n").map((line) => highlight(line, commentToken)));
  }

  /** Wires a `.tabs` bar + a set of `.pane[data-label]` elements into a click-to-switch tab set. */
  function bootTabs(tabsId, panesId) {
    const tabs = document.getElementById(tabsId);
    if (!tabs) return;
    const panes = [...document.querySelectorAll("#" + panesId + " .pane")];
    panes.forEach((p, i) => {
      const b = document.createElement("button");
      b.type = "button";
      b.textContent = p.dataset.label;
      b.setAttribute("aria-pressed", String(i === 0));
      b.addEventListener("click", () => {
        panes.forEach((q, j) => {
          q.hidden = j !== i;
          tabs.children[j].setAttribute("aria-pressed", String(j === i));
        });
      });
      tabs.appendChild(b);
      p.hidden = i !== 0;
    });
  }

  return {
    esc,
    mark,
    markLines,
    diff,
    paint,
    paintLines,
    describeChange,
    highlight,
    highlightLines,
    bootTabs,
    summarizeChange,
    summarizeError,
    copyStatusText,
  };
})();
