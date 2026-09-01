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

  /** RFC 4648 base64url (no padding) of a UTF-8-encoded string — the alphabet the playground's
   * permalink fragment uses so every Unicode code point (astral characters, combining marks,
   * anything) round-trips through a URL-safe, copy/paste-safe character set. */
  function utf8ToBase64Url(text) {
    const bytes = new TextEncoder().encode(text);
    let binary = "";
    for (const b of bytes) binary += String.fromCharCode(b);
    return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  }

  /** Inverse of utf8ToBase64Url. Throws on malformed base64 or invalid UTF-8 — callers must
   * catch, which is exactly the "fail safely, don't crash" shape a hand-edited or truncated
   * permalink needs. */
  function base64UrlToUtf8(b64url) {
    const b64 = b64url.replace(/-/g, "+").replace(/_/g, "/");
    const pad = (4 - (b64.length % 4)) % 4;
    const binary = atob(b64 + "=".repeat(pad));
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  }

  const PERMALINK_VERSION = 1;
  // Chars in the fragment after "#". Bounds both how long a link stays pasteable in a chat/social
  // UI and how much decode work an untrusted, hand-editable URL can force on load — encodePer-
  // malinkFragment does not enforce this itself (it is a pure encoder); callers building a "Copy
  // Link" action check it before offering the result, and decodePermalinkFragment rejects
  // anything over it on the way in, so an oversized fragment fails safely either direction.
  const MAX_PERMALINK_LENGTH = 8000;

  /** Encodes playground state into a versioned, URL-fragment-safe string. Pure: never throws,
   * never touches location/history — callers decide when (and whether) to write it anywhere. */
  function encodePermalinkFragment(state) {
    const payload = JSON.stringify([
      PERMALINK_VERSION,
      state.locale,
      state.mode,
      state.dialect || "",
      state.input,
    ]);
    return utf8ToBase64Url(payload);
  }

  /**
   * Decodes a permalink fragment back into playground state, or reports why it couldn't.
   * Deliberately validates only shape and type here (string lengths, JSON structure, version) —
   * whether the decoded locale/mode/dialect are ones this build actually supports is the caller's
   * job, since only the caller knows the live <select> option lists. Every failure path returns
   * `{ ok: false, reason }` rather than throwing, so a malformed, truncated, or hand-edited
   * fragment can never take down the playground.
   */
  function decodePermalinkFragment(fragment) {
    if (typeof fragment !== "string" || fragment.length === 0) {
      return { ok: false, reason: "empty" };
    }
    if (fragment.length > MAX_PERMALINK_LENGTH) {
      return { ok: false, reason: "too large to restore safely" };
    }
    let payload;
    try {
      payload = base64UrlToUtf8(fragment);
    } catch {
      return { ok: false, reason: "not valid permalink data" };
    }
    let parsed;
    try {
      parsed = JSON.parse(payload);
    } catch {
      return { ok: false, reason: "not valid permalink data" };
    }
    if (!Array.isArray(parsed) || parsed.length !== 5) {
      return { ok: false, reason: "not valid permalink data" };
    }
    const [version, locale, mode, dialect, input] = parsed;
    if (version !== PERMALINK_VERSION) {
      return { ok: false, reason: "unsupported permalink version" };
    }
    if (
      typeof locale !== "string" ||
      typeof mode !== "string" ||
      typeof dialect !== "string" ||
      typeof input !== "string"
    ) {
      return { ok: false, reason: "not valid permalink data" };
    }
    return { ok: true, state: { locale, mode, dialect, input } };
  }

  /** Status text for a clipboard-copy action, success or failure — factored out so the wording is
   * testable without a real Clipboard API (unavailable/flaky in a test environment). */
  function copyStatusText(what, ok) {
    return ok ? what + " copied." : what + " could not be copied — copy it manually.";
  }

  /**
   * Status text for the "Copy Link" action specifically. Three outcomes, deliberately distinct
   * from each other and from copyStatusText's generic wording:
   *  - "copied": Clipboard API succeeded.
   *  - "clipboard-unavailable": Clipboard API is missing or failed, but the caller has already
   *    placed the fragment in the address bar (via history.replaceState) as a manual fallback —
   *    so the message points there instead of just saying "copy it manually" with nothing to copy.
   *  - "too-long": input exceeds MAX_PERMALINK_LENGTH; no link was created at all.
   */
  function permalinkStatusText(outcome) {
    if (outcome === "copied") return "Link copied.";
    if (outcome === "clipboard-unavailable") {
      return "Clipboard unavailable — link is in the address bar.";
    }
    return "Input is too long for a shareable link — shorten it and try again.";
  }

  /**
   * Status text for the native Share action. Three outcomes, so a real failure is never silent
   * and never indistinguishable from the user simply closing the share sheet:
   *  - "shared": navigator.share() resolved.
   *  - "cancelled": the user dismissed the share sheet (error.name === "AbortError") — reported
   *    neutrally, not as a failure.
   *  - "failed": any other rejection — a real error, reported visibly.
   */
  function shareStatusText(outcome) {
    if (outcome === "shared") return "Shared.";
    if (outcome === "cancelled") return "Share cancelled.";
    return "Share failed.";
  }

  /**
   * Builds the absolute URL for a permalink from the CURRENT full URL plus an encoded fragment —
   * pure, and safe under file:// where `location.origin` is the string "null" (so string
   * concatenation like `location.origin + location.pathname + "#" + fragment` breaks). Any
   * existing query string is deliberately PRESERVED (the URL API's `.hash` setter never touches
   * `.search`) rather than stripped, since stripping would silently drop parameters a caller may
   * have had reason to keep; setting `.hash` also naturally REPLACES any existing fragment rather
   * than appending to it.
   */
  function buildPermalinkUrl(currentHref, encodedFragment) {
    const url = new URL(currentHref);
    url.hash = encodedFragment;
    return url.href;
  }

  /** Inverse-ish helper for fix #4 (stale-fragment invalidation): the current URL with its
   * fragment removed, query string preserved — the counterpart to buildPermalinkUrl's "preserve
   * search, replace hash" rule. Pure; callers decide when to write it via history.replaceState. */
  function stripPermalinkFragment(currentHref) {
    const url = new URL(currentHref);
    url.hash = "";
    return url.href;
  }

  /**
   * Validates a decoded permalink state against the option lists this build actually offers.
   * decodePermalinkFragment only checks shape/type (it has no knowledge of live <select> option
   * lists); this is the membership check a caller applies on top. Rejects the WHOLE state — not
   * just the offending field — on any mismatch, including the case a hand-edited or malicious
   * permalink can encode that decodePermalinkFragment cannot catch on its own: mode !== "markdown"
   * paired with a non-empty dialect (e.g. mode "text" with dialect "mdx"), which is a nonsensical
   * combination and must invalidate the whole permalink rather than silently drop the dialect.
   */
  function validateRestoredState(state, options) {
    const localeValid = options.locales.includes(state.locale);
    const modeValid = options.modes.includes(state.mode);
    const dialectValid =
      state.mode === "markdown"
        ? options.dialects.includes(state.dialect)
        : state.dialect === "";
    return localeValid && modeValid && dialectValid;
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
    diff,
    paint,
    describeChange,
    highlight,
    bootTabs,
    summarizeChange,
    summarizeError,
    encodePermalinkFragment,
    decodePermalinkFragment,
    copyStatusText,
    permalinkStatusText,
    shareStatusText,
    buildPermalinkUrl,
    stripPermalinkFragment,
    validateRestoredState,
    MAX_PERMALINK_LENGTH,
  };
})();
