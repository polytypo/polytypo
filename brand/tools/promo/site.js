/* Shared client-side behavior for the promo site. Loaded on every page; each page's own
 * inline script (written by build_promo.py) wires these into that page's specific DOM. */
window.Polytypo = (function () {
  const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

  /**
   * One custom analytics event. The tracker (Umami, loaded with `defer` in every page's head) is
   * optional in every sense — blocked, still loading, or absent entirely in a test sandbox — so
   * this is a silent no-op whenever it is not there, and nothing on the page may depend on it.
   *
   * `props` carries enum-valued facts only (a locale code, a mode, a theme). Text a visitor typed
   * or pasted into the playground never goes through here, in any form.
   */
  function track(name, props) {
    try {
      if (window.umami && typeof window.umami.track === "function") window.umami.track(name, props);
    } catch {
      // Analytics must never break the page it measures.
    }
  }

  /**
   * Click tracking for plain links, declared in the markup as `data-track-event="<name>"` rather
   * than wired one id at a time. The attribute is the site's own, not the tracker's: no page may
   * carry a vendor-named attribute, because tests/promo/generated-pages.test.ts holds the
   * generated HTML free of third-party tracker markers and that guard stays fail-closed.
   */
  // Guarded because this file is also loaded into a bare sandbox by tests/promo/load-site-js.ts,
  // where there is no document at all.
  if (typeof document !== "undefined") {
    document.addEventListener("click", (event) => {
      const el = event.target && event.target.closest && event.target.closest("[data-track-event]");
      if (el) track(el.dataset.trackEvent);
    });
  }

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
   * The playground's result label ("13 changes"), factored out so it's testable without parsing
   * generated page source. `segments` is diff(a, b)'s OUTPUT-only representation — it has no
   * way to represent characters removed from `text` with nothing put back in their place, so a
   * deletion-only change (e.g. "Hello  , world !" -> "Hello, world!") produces zero changed
   * segments even though text !== out. Reporting "0 changes" there would be false, so that case
   * gets its own wording rather than being folded into the count.
   */
  function summarizeChange(text, out, segments) {
    if (text === out) return "unchanged";
    const regions = segments.filter(([changed]) => changed).length;
    if (regions === 0) return "removals only";
    return regions + (regions === 1 ? " change" : " changes");
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

  const KEYWORDS =
    /^(?:import|from|as|const|let|var|function|return|if|else|try|catch|throw|new|use|require|def|end|class|package|func|type|struct|true|false|null|nil|None|True|False|await|async|export|default|npm|pip|go|gem|composer|install|get)$/;

  /**
   * Syntax colours for a code sample, as escaped HTML. One tokenizer for every language on the
   * site: line comments, string literals, numbers, keywords and calls, and a separate pass for
   * markup. Everything else keeps the block's plain foreground colour rather than a wrong guess.
   * Run on a block's own text, so it never changes what a copy puts on the clipboard.
   */
  function highlight(src) {
    if (/^\s*</.test(src)) {
      return esc(src).replace(/(&lt;\/?)([\w-]+)([^]*?)(&gt;)/g, (m, open, tag, rest, close) => {
        rest = rest.replace(
          /([\w-]+)=(&quot;|")(.*?)\2/g,
          '<span class="tok-attr">$1</span>=<span class="tok-str">$2$3$2</span>',
        );
        return open + '<span class="tok-tag">' + tag + "</span>" + rest + close;
      });
    }
    const re =
      /(\/\/[^\n]*|#[^\n]*)|("(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*')|(\b\d+(?:\.\d+)?\b)|([A-Za-z_$][\w$]*)(\()?/g;
    let out = "";
    let last = 0;
    let m;
    while ((m = re.exec(src))) {
      out += esc(src.slice(last, m.index));
      if (m[1]) out += '<span class="tok-com">' + esc(m[1]) + "</span>";
      else if (m[2]) out += '<span class="tok-str">' + esc(m[2]) + "</span>";
      else if (m[3]) out += '<span class="tok-num">' + m[3] + "</span>";
      else if (KEYWORDS.test(m[4]))
        out += '<span class="tok-kw">' + m[4] + "</span>" + (m[5] || "");
      else if (m[5]) out += '<span class="tok-fn">' + m[4] + "</span>(";
      else out += esc(m[4]);
      last = re.lastIndex;
    }
    return out + esc(src.slice(last));
  }

  const ICONS = {
    copy: '<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V6a2 2 0 0 1 2-2h9"/>',
    check: '<path d="m5 12 5 5 9-10"/>',
    expand: '<path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/>',
    close: '<path d="M6 6l12 12M18 6 6 18"/>',
    right: '<path d="M5 12h14M13 6l6 6-6 6"/>',
    left: '<path d="M19 12H5M11 6l-6 6 6 6"/>',
  };
  const icon = (name) =>
    '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    ICONS[name] +
    "</svg>";

  /** A button's face: its label and an icon, before the label or (`after`) behind it. */
  function setButton(button, label, name, after) {
    button.innerHTML = after
      ? "<span>" + label + "</span>" + icon(name)
      : icon(name) + "<span>" + label + "</span>";
  }

  /** Copies `text`, shows "Copied" (or "Copy failed") on the button for a moment, and resolves to
   * whether the clipboard accepted it. */
  async function copyButton(button, text, label) {
    let ok = true;
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      ok = false;
    }
    setButton(button, ok ? "Copied" : "Copy failed", ok ? "check" : "copy");
    setTimeout(() => setButton(button, label, "copy"), 1500);
    return ok;
  }

  /** Wires a `.tabs` bar + a set of `.pane[data-label]` elements into a click-to-switch tab set. */
  function bootTabs(tabsId, panesId) {
    const tabs = document.getElementById(tabsId);
    if (!tabs) return;
    const panes = [...document.querySelectorAll("#" + panesId + " .pane")];
    panes.forEach((p, i) => {
      const b = document.createElement("button");
      b.type = "button";
      b.setAttribute("role", "tab");
      b.textContent = p.dataset.label;
      b.setAttribute("aria-selected", String(i === 0));
      p.setAttribute("role", "tabpanel");
      b.addEventListener("click", () => {
        panes.forEach((q, j) => {
          q.hidden = j !== i;
          tabs.children[j].setAttribute("aria-selected", String(j === i));
        });
        // One event for every tab set on the site (install snippets, build steps, the playground's
        // call block), so `set` is what tells them apart.
        track("code-tab", { set: tabsId, tab: p.dataset.label });
      });
      tabs.appendChild(b);
      p.hidden = i !== 0;
    });
  }

  return {
    esc,
    mark,
    diff,
    paint,
    describeChange,
    highlight,
    setButton,
    copyButton,
    bootTabs,
    summarizeChange,
    summarizeError,
    copyStatusText,
    track,
  };
})();
