// Builds REVIEW.html: a self-contained, local, per-change human review viewer for one M4 evidence
// bundle. Pure string-building only -- scripts/dogfood/run.ts does the file I/O (reading
// review-runtime.js's source, writing the result).
//
// Hard constraints (Stage 10 Pass A second correction, item 3): fully local, opens via `file://`,
// no CDN/external fonts/analytics/fetch/XHR/WebSocket, all CSS/JS/data inlined, never mutates the
// corpus, never applies typography output, never decides anything automatically (no "accept all",
// no batch approval, no inherited decisions).
//
// Hash-cycle avoidance (item 5): the embedded `evidenceReviewHash` is a value computed BEFORE this
// function runs (see scripts/dogfood/evidence-hash.ts) from changes.json's and REVIEW.md's own
// content -- never from REVIEW.html itself. This file's own digest is computed by the caller AFTER
// this function returns, purely for manifest bookkeeping; it is never fed back into the hash this
// file embeds.
import type { ReviewChangeEntry } from "./evidence.js";

/** Strips a leading `export ` from each top-level declaration in review-runtime.js's source so it
 * can run as a classic (non-module) inline `<script>` -- required for the page to open correctly
 * via a bare `file://` URL with no server and no module resolution. The exported names remain
 * ordinary top-level `const`/`function` declarations, visible to the next inline `<script>` block
 * exactly as they were in the original module (browsers execute sibling classic scripts in the
 * same global scope, in document order). */
export function inlineReviewRuntime(reviewRuntimeSource: string): string {
  return reviewRuntimeSource.replace(/^export\s+/gm, "");
}

interface ReviewHtmlMeta {
  corpus: string;
  locale: string;
  mode: string;
  dialect: string;
  specVersion: string;
  implementationAggregateHash: string;
  corpusAggregateHash: string;
  gitHead: string;
}

/** Data-only projection of `ReviewChangeEntry`, embedded verbatim into the page as
 * `window.__REVIEW_DATA__` -- deliberately the exact same shape `changes.json` already produces
 * (no separate "review-data.json" file: it would just be a byte-for-byte duplicate of
 * `changes.json`'s content under a different name, which the project's own KISS/DRY guidance
 * argues against; changes.json's content is already immutable and available before REVIEW.html is
 * generated, which is all the hash-cycle avoidance above actually needs). */
function toEmbeddedEntry(e: ReviewChangeEntry) {
  return {
    id: e.id,
    anchor: e.anchor,
    path: e.path,
    oldLineCol: e.oldLineCol,
    newLineCol: e.newLineCol,
    before: e.before,
    after: e.after,
    oldMarks: e.oldMarks,
    newMarks: e.newMarks,
    previewOldLeading: e.previewOldLeading,
    previewOldTrailing: e.previewOldTrailing,
    previewIsolatedLeading: e.previewIsolatedLeading,
    previewIsolatedTrailing: e.previewIsolatedTrailing,
    notableCodePoints: e.notableCodePoints,
    codePointDelta: e.codePointDelta,
    crossLineEdit: e.crossLineEdit,
    riskTags: e.riskTags,
    quotePairing: e.quotePairing,
    attribution: e.attribution,
  };
}

/** Embeds `data` as a direct JS object-literal assignment (not JSON.parse'd from a string) so a
 * `file://`-loaded page never needs `fetch` (blocked by CORS under `file://` in Chromium). Escapes
 * `</` -> `<\/` so a literal `</script>` inside any corpus text (e.g. quoted in a code fence)
 * cannot prematurely close the surrounding `<script>` element -- this is HTML-tokenizer safety,
 * not JSON escaping; `\/` is an ordinary (if redundant) JS string escape, so the emitted object
 * literal remains valid. */
function embedJson(data: unknown): string {
  return JSON.stringify(data).replace(/<\//g, "<\\/");
}

const REVIEW_HTML_STYLE = `
:root { color-scheme: light dark; --fg:#1b1b1b; --bg:#fff; --muted:#666; --border:#ccc; --accept:#1a7f37; --reject:#c0392b; --discuss:#a3690a; --mark:#fff4b8; --code-bg:#f3f3f3; }
@media (prefers-color-scheme: dark) { :root { --fg:#e8e8e8; --bg:#161616; --muted:#999; --border:#444; --mark:#5a4b12; --code-bg:#242424; } }
* { box-sizing: border-box; }
body { font-family: ui-sans-serif, system-ui, sans-serif; color: var(--fg); background: var(--bg); margin: 0; }
header { padding: 0.75rem 1rem; border-bottom: 1px solid var(--border); position: sticky; top: 0; background: var(--bg); z-index: 5; }
header h1 { font-size: 1rem; margin: 0 0 0.25rem; }
.meta { font-size: 0.75rem; color: var(--muted); }
.banner { background: var(--code-bg); border: 1px solid var(--border); border-radius: 4px; padding: 0.5rem 0.75rem; margin: 0.5rem 0; font-size: 0.85rem; }
.banner.blocked { border-color: var(--reject); }
.banner.clear { border-color: var(--accept); }
main { display: grid; grid-template-columns: 280px 1fr; gap: 0; min-height: calc(100vh - 90px); }
nav.filters { border-right: 1px solid var(--border); padding: 0.75rem; overflow-y: auto; max-height: calc(100vh - 90px); position: sticky; top: 90px; }
nav.filters label { display: block; font-size: 0.75rem; margin-top: 0.6rem; color: var(--muted); }
nav.filters select, nav.filters input { width: 100%; margin-top: 0.15rem; font-size: 0.85rem; }
.counts { font-size: 0.75rem; margin-top: 0.75rem; line-height: 1.5; }
.counts b { color: var(--fg); }
#panel { padding: 1rem; max-width: 900px; }
.navbar { display: flex; gap: 0.4rem; align-items: center; margin-bottom: 0.75rem; flex-wrap: wrap; }
.navbar button, .navbar input { font-size: 0.85rem; }
.navpos { font-size: 0.8rem; color: var(--muted); }
code, .code { font-family: ui-monospace, monospace; background: var(--code-bg); border-radius: 3px; padding: 0 0.15rem; }
mark { background: var(--mark); border-radius: 2px; padding: 0 1px; }
.preview-row { margin: 0.5rem 0; padding: 0.5rem; border: 1px solid var(--border); border-radius: 4px; }
.preview-row .label { font-size: 0.7rem; color: var(--muted); text-transform: uppercase; letter-spacing: 0.03em; }
.preview-text { font-size: 1rem; margin-top: 0.25rem; line-height: 1.6; word-break: break-word; white-space: pre-wrap; }
table.kv { border-collapse: collapse; font-size: 0.85rem; margin: 0.5rem 0; }
table.kv td { border: 1px solid var(--border); padding: 0.2rem 0.5rem; vertical-align: top; }
table.kv td:first-child { color: var(--muted); white-space: nowrap; }
.tags span.tag { display: inline-block; background: var(--code-bg); border: 1px solid var(--border); border-radius: 3px; padding: 0.05rem 0.4rem; margin: 0.1rem 0.2rem 0.1rem 0; font-size: 0.75rem; }
.decision-buttons button { font-size: 0.85rem; padding: 0.3rem 0.6rem; margin-right: 0.3rem; border: 1px solid var(--border); border-radius: 4px; background: var(--bg); color: var(--fg); cursor: pointer; }
.decision-buttons button.active[data-d="ACCEPT"] { background: var(--accept); color: #fff; border-color: var(--accept); }
.decision-buttons button.active[data-d="REJECT"] { background: var(--reject); color: #fff; border-color: var(--reject); }
.decision-buttons button.active[data-d="NEEDS-DISCUSSION"] { background: var(--discuss); color: #fff; border-color: var(--discuss); }
.decision-buttons button.active[data-d="UNREVIEWED"] { background: var(--muted); color: #fff; }
textarea#note { width: 100%; min-height: 3rem; font-size: 0.85rem; margin-top: 0.4rem; }
.toolbar { display:flex; gap:0.4rem; flex-wrap:wrap; margin: 0.6rem 0; }
.toolbar button { font-size: 0.75rem; }
#import-status { font-size: 0.75rem; margin-top: 0.3rem; }
#import-status.error { color: var(--reject); }
#import-status.ok { color: var(--accept); }
.shortcuts { font-size: 0.7rem; color: var(--muted); margin-top: 1rem; line-height: 1.6; }
.pairlink { font-size: 0.8rem; }
footer.static-note { font-size: 0.7rem; color: var(--muted); padding: 1rem; }
`;

/** Builds REVIEW.html's complete content. `entries` must be in the same canonical order
 * `changes.json` lists them in (files in discovery order, review changes ascending old-offset
 * within a file) -- the embedded `ids` array preserves that order for deterministic export. */
export function buildReviewHtml(
  entries: readonly ReviewChangeEntry[],
  evidenceReviewHash: string,
  meta: ReviewHtmlMeta,
  reviewRuntimeSource: string,
): string {
  const entriesById: Record<string, unknown> = {};
  const ids: string[] = [];
  for (const e of entries) {
    ids.push(e.id);
    entriesById[e.id] = toEmbeddedEntry(e);
  }
  const data = { evidenceReviewHash, meta, ids, entries: entriesById };
  const runtimeInline = inlineReviewRuntime(reviewRuntimeSource);

  return `<title>M4 Dogfooding Review — ${escapeHtml(meta.locale)}/${escapeHtml(meta.mode)}/${escapeHtml(meta.dialect)}</title>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:;">
<style>${REVIEW_HTML_STYLE}</style>
<header>
  <h1>M4 Dogfooding Review — local, self-contained, no network access</h1>
  <div class="meta">
    corpus <code>${escapeHtml(meta.corpus)}</code> · locale <code>${escapeHtml(meta.locale)}</code> ·
    mode <code>${escapeHtml(meta.mode)}</code> · dialect <code>${escapeHtml(meta.dialect)}</code> ·
    git <code>${escapeHtml(meta.gitHead)}</code><br>
    evidenceReviewHash <code id="hash-display">${escapeHtml(evidenceReviewHash)}</code>
  </div>
  <div id="completion-banner" class="banner"></div>
</header>
<main>
  <nav class="filters">
    <label>Search (path / id / preview text)
      <input type="search" id="f-search" placeholder="type to filter…">
    </label>
    <label>File
      <select id="f-file"><option value="">(all files)</option></select>
    </label>
    <label>Attribution
      <select id="f-attribution"><option value="">(all)</option></select>
    </label>
    <label>Risk tag
      <select id="f-tag"><option value="">(all)</option></select>
    </label>
    <label>Quote-pair status
      <select id="f-quote">
        <option value="">(all)</option>
        <option value="paired">paired</option>
        <option value="unpaired">unpaired</option>
        <option value="unknown">unknown</option>
        <option value="none">not a quote change</option>
      </select>
    </label>
    <label>Decision
      <select id="f-decision">
        <option value="">(all)</option>
        <option value="UNREVIEWED">UNREVIEWED</option>
        <option value="ACCEPT">ACCEPT</option>
        <option value="REJECT">REJECT</option>
        <option value="NEEDS-DISCUSSION">NEEDS-DISCUSSION</option>
      </select>
    </label>
    <label><input type="checkbox" id="f-unresolved-only" style="width:auto;"> unresolved only (UNREVIEWED / NEEDS-DISCUSSION / REJECT)</label>

    <div class="counts" id="counts"></div>

    <div class="toolbar">
      <button id="btn-export">Export decisions JSON</button>
      <button id="btn-import">Import decisions JSON</button>
      <input type="file" id="file-import" accept="application/json" style="display:none;">
    </div>
    <div id="import-status"></div>

    <div class="shortcuts">
      <b>Shortcuts:</b> j/k or ←/→ = prev/next · a = ACCEPT · r = REJECT · d = NEEDS-DISCUSSION ·
      u = UNREVIEWED · / = focus search · g = focus jump-to-id
    </div>
  </nav>

  <div id="panel"></div>
</main>
<footer class="static-note">
  Nothing on this page ever leaves your machine: no network requests, no CDN, no analytics, no
  external fonts. Decisions are stored only in this browser's localStorage (namespaced to this
  bundle's evidenceReviewHash) unless you explicitly export them.
</footer>
<script>${runtimeInline}</script>
<script>window.__REVIEW_DATA__ = ${embedJson(data)};</script>
<script>
(function () {
  "use strict";
  var DATA = window.__REVIEW_DATA__;
  var IDS = DATA.ids;
  var ENTRIES = DATA.entries;
  var HASH = DATA.evidenceReviewHash;
  var KEY = storageKey(HASH);

  var state = loadState();
  var filtered = IDS.slice();
  var cursor = 0;

  function loadState() {
    try {
      var raw = window.localStorage.getItem(KEY);
      if (!raw) return createDefaultState(IDS);
      var parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object" || !parsed.decisions) return createDefaultState(IDS);
      var base = createDefaultState(IDS);
      for (var id in parsed.decisions) { if (ENTRIES[id] && isValidDecision(parsed.decisions[id])) base.decisions[id] = parsed.decisions[id]; }
      for (var id2 in parsed.notes) { if (ENTRIES[id2]) base.notes[id2] = typeof parsed.notes[id2] === "string" ? parsed.notes[id2] : ""; }
      return base;
    } catch (e) {
      return createDefaultState(IDS);
    }
  }

  function saveState() {
    try {
      window.localStorage.setItem(KEY, JSON.stringify({ decisions: state.decisions, notes: state.notes }));
    } catch (e) { /* storage unavailable/full -- decisions still hold in memory for this session */ }
  }

  function el(tag, attrs, children) {
    var node = document.createElement(tag);
    if (attrs) for (var k in attrs) {
      if (k === "class") node.className = attrs[k];
      else if (k === "html") { /* never used -- see textContent-only rule below */ }
      else node.setAttribute(k, attrs[k]);
    }
    (children || []).forEach(function (c) {
      if (c === null || c === undefined) return;
      node.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
    });
    return node;
  }

  // Every piece of corpus-derived or user-authored text (paths, preview text, notes, ids) is
  // rendered via textContent / DOM text nodes only, never innerHTML -- see acceptance item 14 and
  // the security tests in tests/scripts/dogfood-review-html.test.ts.
  function renderMarkedPreview(text, marks) {
    var frag = document.createDocumentFragment();
    var cps = Array.from(text);
    var cursor2 = 0;
    marks.forEach(function (m) {
      if (m.start > cursor2) frag.appendChild(document.createTextNode(cps.slice(cursor2, m.start).join("")));
      frag.appendChild(el("mark", null, [cps.slice(m.start, m.end).join("")]));
      cursor2 = m.end;
    });
    if (cursor2 < cps.length) frag.appendChild(document.createTextNode(cps.slice(cursor2).join("")));
    return frag;
  }

  function previewRow(label, leading, text, marks, trailing) {
    var textEl = el("div", { class: "preview-text" }, [
      leading.truncated ? "… " : "",
    ]);
    textEl.appendChild(document.createTextNode(leading.text));
    textEl.appendChild(renderMarkedPreview(text, marks));
    textEl.appendChild(document.createTextNode(trailing.text));
    if (trailing.truncated) textEl.appendChild(document.createTextNode(" …"));
    return el("div", { class: "preview-row" }, [el("div", { class: "label" }, [label]), textEl]);
  }

  function populateFilterOptions() {
    var files = {}, attributions = {}, tags = {};
    IDS.forEach(function (id) {
      var e = ENTRIES[id];
      files[e.path] = true;
      var label = attributionLabel(e);
      attributions[label] = true;
      (e.riskTags.length ? e.riskTags.map(function (t) { return t.tag; }) : ["no-high-risk-tag"]).forEach(function (t) { tags[t] = true; });
    });
    fillSelect("f-file", Object.keys(files).sort());
    fillSelect("f-attribution", Object.keys(attributions).sort());
    fillSelect("f-tag", Object.keys(tags).sort());
  }

  function attributionLabel(e) {
    if (!e.attribution) return "unattributed";
    var a = e.attribution;
    if (a.category === "single-rule") return a.singleRule || "unknown";
    if (a.category === "multi-rule-composition") return "multi-rule-composition (" + (a.composingRules || []).join("+") + ")";
    if (a.category === "interaction-candidate") return "interaction-candidate";
    if (a.category === "ambiguous") return "ambiguous";
    return "unknown";
  }

  function fillSelect(id, values) {
    var sel = document.getElementById(id);
    values.forEach(function (v) {
      var opt = document.createElement("option");
      opt.value = v; opt.textContent = v;
      sel.appendChild(opt);
    });
  }

  function quoteStatus(e) {
    return e.quotePairing ? e.quotePairing.status : "none";
  }

  function applyFilters() {
    var search = document.getElementById("f-search").value.trim().toLowerCase();
    var file = document.getElementById("f-file").value;
    var attribution = document.getElementById("f-attribution").value;
    var tag = document.getElementById("f-tag").value;
    var quote = document.getElementById("f-quote").value;
    var decision = document.getElementById("f-decision").value;
    var unresolvedOnly = document.getElementById("f-unresolved-only").checked;

    filtered = IDS.filter(function (id) {
      var e = ENTRIES[id];
      if (file && e.path !== file) return false;
      if (attribution && attributionLabel(e) !== attribution) return false;
      if (tag) {
        var tagNames = e.riskTags.length ? e.riskTags.map(function (t) { return t.tag; }) : ["no-high-risk-tag"];
        if (tagNames.indexOf(tag) === -1) return false;
      }
      if (quote && quoteStatus(e) !== quote) return false;
      var d = state.decisions[id] || "UNREVIEWED";
      if (decision && d !== decision) return false;
      if (unresolvedOnly && d === "ACCEPT") return false;
      if (search) {
        var hay = (e.path + " " + e.id + " " + e.before + " " + e.after + " " + e.previewOldLeading.text + " " + e.previewOldTrailing.text).toLowerCase();
        if (hay.indexOf(search) === -1) return false;
      }
      return true;
    });
    if (filtered.length === 0) cursor = 0;
    else if (cursor >= filtered.length) cursor = filtered.length - 1;
    renderCounts();
    renderPanel();
  }

  function renderCounts() {
    var counts = computeCounts(IDS, state.decisions);
    var box = document.getElementById("counts");
    box.textContent = "";
    box.appendChild(el("div", null, ["Total: ", el("b", null, [String(counts.total)])]));
    box.appendChild(el("div", null, ["Filtered: ", el("b", null, [String(filtered.length)])]));
    box.appendChild(el("div", null, ["ACCEPT: ", el("b", null, [String(counts.ACCEPT)])]));
    box.appendChild(el("div", null, ["REJECT: ", el("b", null, [String(counts.REJECT)])]));
    box.appendChild(el("div", null, ["NEEDS-DISCUSSION: ", el("b", null, [String(counts["NEEDS-DISCUSSION"])])]));
    box.appendChild(el("div", null, ["UNREVIEWED: ", el("b", null, [String(counts.UNREVIEWED)])]));

    var banner = document.getElementById("completion-banner");
    var accepted = isFullyAccepted(IDS, state.decisions);
    banner.className = "banner " + (accepted ? "clear" : "blocked");
    banner.textContent = accepted
      ? "Every review change has an ACCEPT decision recorded in THIS browser. This is a record of your own review, not a tool verdict -- M4 requires the author's actual judgement, and remains PENDING HUMAN REVIEW regardless of this banner."
      : "M4 cannot be PASS while any row is UNREVIEWED, NEEDS-DISCUSSION, or REJECT (" + (counts.total - counts.ACCEPT) + " remaining). This banner reflects only decisions recorded in this browser's local storage.";
  }

  function jumpToId(id) {
    var idx = filtered.indexOf(id);
    if (idx === -1) {
      // Not in the current filtered set (likely filtered out) -- clear filters to make it reachable.
      document.getElementById("f-search").value = "";
      document.getElementById("f-file").value = "";
      document.getElementById("f-attribution").value = "";
      document.getElementById("f-tag").value = "";
      document.getElementById("f-quote").value = "";
      document.getElementById("f-decision").value = "";
      document.getElementById("f-unresolved-only").checked = false;
      applyFilters();
      idx = filtered.indexOf(id);
    }
    if (idx !== -1) { cursor = idx; renderPanel(); }
  }

  function setDecision(id, decision) {
    state.decisions[id] = decision;
    saveState();
    renderCounts();
    renderPanel();
  }

  function renderPanel() {
    var panel = document.getElementById("panel");
    panel.textContent = "";
    if (filtered.length === 0) {
      panel.appendChild(el("p", null, ["No review changes match the current filters."]));
      return;
    }
    var id = filtered[cursor];
    var e = ENTRIES[id];
    var decision = state.decisions[id] || "UNREVIEWED";

    var navbar = el("div", { class: "navbar" });
    var prevBtn = el("button", {}, ["◀ Prev"]);
    prevBtn.onclick = function () { if (cursor > 0) { cursor--; renderPanel(); } };
    var nextBtn = el("button", {}, ["Next ▶"]);
    nextBtn.onclick = function () { if (cursor < filtered.length - 1) { cursor++; renderPanel(); } };
    var jumpInput = el("input", { type: "text", id: "jump-input", placeholder: "jump to id…", size: "24" });
    jumpInput.onkeydown = function (ev) { if (ev.key === "Enter") jumpToId(jumpInput.value.trim()); };
    var jumpBtn = el("button", {}, ["Go"]);
    jumpBtn.onclick = function () { jumpToId(jumpInput.value.trim()); };
    navbar.appendChild(prevBtn);
    navbar.appendChild(el("span", { class: "navpos" }, [(cursor + 1) + " / " + filtered.length + " (filtered), " + IDS.length + " total"]));
    navbar.appendChild(nextBtn);
    navbar.appendChild(jumpInput);
    navbar.appendChild(jumpBtn);
    panel.appendChild(navbar);

    var idLine = el("table", { class: "kv" }, [
      el("tr", null, [el("td", null, ["ID"]), el("td", null, [el("code", { id: "anchor-target-" + e.anchor }, [e.id])])]),
      el("tr", null, [el("td", null, ["Path"]), el("td", null, [e.path])]),
      el("tr", null, [
        el("td", null, ["Line:col (old→new)"]),
        el("td", null, [e.oldLineCol.start.line + ":" + e.oldLineCol.start.column + " → " + e.newLineCol.start.line + ":" + e.newLineCol.start.column]),
      ]),
      el("tr", null, [el("td", null, ["Cross-line edit"]), el("td", null, [String(e.crossLineEdit)])]),
    ]);
    panel.appendChild(idLine);

    panel.appendChild(previewRow("sourcePreview", e.previewOldLeading, e.before, e.oldMarks, e.previewOldTrailing));
    panel.appendChild(previewRow("isolatedAfterPreview", e.previewIsolatedLeading, e.after, e.newMarks, e.previewIsolatedTrailing));

    var delta = el("table", { class: "kv" }, [
      el("tr", null, [el("td", null, ["Exact before"]), el("td", null, [el("code", null, [e.before])])]),
      el("tr", null, [el("td", null, ["Exact after"]), el("td", null, [el("code", null, [e.after])])]),
    ]);
    if (e.notableCodePoints.length) {
      delta.appendChild(el("tr", null, [
        el("td", null, ["Invisible/notable code points"]),
        el("td", null, [e.notableCodePoints.map(function (n) { return n.codePoint + " " + n.name + " ×" + n.count; }).join(", ")]),
      ]));
    }
    if (e.codePointDelta) {
      delta.appendChild(el("tr", null, [
        el("td", null, ["Code-point delta"]),
        el("td", null, [e.codePointDelta.map(function (d) { return d.kind === "substitute" ? d.from + "→" + d.to : d.kind === "delete" ? "−" + d.from : "+" + d.to; }).join(", ")]),
      ]));
    }
    panel.appendChild(delta);

    var tagsDiv = el("div", { class: "tags" }, [el("span", { class: "label" }, ["Risk tags: "])]);
    if (e.riskTags.length) {
      e.riskTags.forEach(function (t) { tagsDiv.appendChild(el("span", { class: "tag" }, [t.tag])); });
    } else {
      tagsDiv.appendChild(el("span", { class: "tag" }, ["none"]));
    }
    panel.appendChild(tagsDiv);
    panel.appendChild(el("div", { class: "meta" }, ["Attribution: " + attributionLabel(e)]));

    if (e.quotePairing) {
      var qp = e.quotePairing;
      var pairDiv = el("div", { class: "pairlink" });
      if (qp.status === "paired") {
        var link = el("a", { href: "#" }, [qp.role + " ↔ " + qp.pairedReviewChangeId]);
        link.onclick = function (ev) { ev.preventDefault(); jumpToId(qp.pairedReviewChangeId); };
        pairDiv.appendChild(document.createTextNode("Quote pair: "));
        pairDiv.appendChild(link);
      } else {
        pairDiv.appendChild(document.createTextNode("Quote pair: " + qp.status));
      }
      panel.appendChild(pairDiv);
    }

    var decisionButtons = el("div", { class: "decision-buttons" });
    ["ACCEPT", "REJECT", "NEEDS-DISCUSSION", "UNREVIEWED"].forEach(function (d) {
      var btn = el("button", { "data-d": d }, [d]);
      if (d === decision) btn.className = "active";
      btn.onclick = function () { setDecision(id, d); };
      decisionButtons.appendChild(btn);
    });
    panel.appendChild(el("div", { class: "label" }, ["Decision"]));
    panel.appendChild(decisionButtons);

    var noteArea = el("textarea", { id: "note", placeholder: "optional note…" });
    noteArea.value = state.notes[id] || "";
    noteArea.oninput = function () { state.notes[id] = noteArea.value; saveState(); };
    panel.appendChild(el("div", { class: "label" }, ["Note"]));
    panel.appendChild(noteArea);
  }

  document.getElementById("btn-export").onclick = function () {
    var payload = serializeExportPayload(HASH, IDS, state.decisions, state.notes);
    var blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url;
    a.download = "m4-review-decisions-" + HASH.slice(0, 12) + ".json";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    // Blob download, not a direct filesystem write: browsers do not let a bare file:// page write
    // to disk directly, so this is the correct and only reliable mechanism here.
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  };

  document.getElementById("btn-import").onclick = function () { document.getElementById("file-import").click(); };
  document.getElementById("file-import").onchange = function (ev) {
    var file = ev.target.files && ev.target.files[0];
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function () {
      var status = document.getElementById("import-status");
      var parsed;
      try { parsed = JSON.parse(String(reader.result)); } catch (e) {
        status.className = "error"; status.textContent = "Import failed: not valid JSON."; return;
      }
      var result = validateImportPayload(parsed, HASH, IDS);
      if (!result.ok) {
        // Fail closed by default; offer nothing automatic for a partial import here -- a genuinely
        // partial import must be re-attempted with an explicit, separate confirmation step, never
        // silently accepted.
        status.className = "error"; status.textContent = "Import rejected: " + result.reason; return;
      }
      var merged = mergeImportedState(state.decisions, state.notes, result);
      state.decisions = merged.decisions; state.notes = merged.notes;
      saveState(); renderCounts(); renderPanel();
      status.className = "ok"; status.textContent = "Imported " + result.importedCount + "/" + result.totalCount + " decisions.";
    };
    reader.readAsText(file);
    ev.target.value = "";
  };

  ["f-search", "f-file", "f-attribution", "f-tag", "f-quote", "f-decision"].forEach(function (id) {
    document.getElementById(id).addEventListener("input", applyFilters);
    document.getElementById(id).addEventListener("change", applyFilters);
  });
  document.getElementById("f-unresolved-only").addEventListener("change", applyFilters);

  document.addEventListener("keydown", function (ev) {
    var tag = (ev.target && ev.target.tagName) || "";
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
    if (ev.key === "j" || ev.key === "ArrowRight") { if (cursor < filtered.length - 1) { cursor++; renderPanel(); } }
    else if (ev.key === "k" || ev.key === "ArrowLeft") { if (cursor > 0) { cursor--; renderPanel(); } }
    else if (ev.key === "a") { if (filtered[cursor]) setDecision(filtered[cursor], "ACCEPT"); }
    else if (ev.key === "r") { if (filtered[cursor]) setDecision(filtered[cursor], "REJECT"); }
    else if (ev.key === "d") { if (filtered[cursor]) setDecision(filtered[cursor], "NEEDS-DISCUSSION"); }
    else if (ev.key === "u") { if (filtered[cursor]) setDecision(filtered[cursor], "UNREVIEWED"); }
    else if (ev.key === "/") { ev.preventDefault(); document.getElementById("f-search").focus(); }
    else if (ev.key === "g") { ev.preventDefault(); var j = document.getElementById("jump-input"); if (j) j.focus(); }
  });

  populateFilterOptions();

  // #rc-<hash> deep link support: if the page was opened with a fragment matching a known anchor,
  // jump straight to that review change.
  if (window.location.hash) {
    var frag = window.location.hash.slice(1);
    for (var i = 0; i < IDS.length; i++) {
      if (ENTRIES[IDS[i]].anchor === frag) { jumpToId(IDS[i]); break; }
    }
  }

  applyFilters();
})();
</script>
`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
