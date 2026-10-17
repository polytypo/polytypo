(function () {
  var root = document.documentElement;
  function store(k, v) {
    try {
      if (v === undefined) return localStorage.getItem(k);
      localStorage.setItem(k, v);
    } catch (e) {
      return null;
    }
  }

  var theme = store("mock-theme");
  if (theme === "light" || theme === "dark") root.setAttribute("data-theme", theme);

  document.addEventListener("click", function (e) {
    var t = e.target.closest("[data-theme-set]");
    if (t) {
      var v = t.getAttribute("data-theme-set");
      if (v === "auto") root.removeAttribute("data-theme");
      else root.setAttribute("data-theme", v);
      store("mock-theme", v);
      syncTheme();
    }
    var nt = e.target.closest(".nav-toggle");
    if (nt) {
      var open = document.body.classList.toggle("nav-open");
      nt.setAttribute("aria-expanded", String(open));
    }
    var tab = e.target.closest(".tabs [role=tab]");
    if (tab) {
      var group = tab.closest(".tabs");
      var panes = document.getElementById(group.getAttribute("data-panes"));
      group.querySelectorAll("[role=tab]").forEach(function (b) {
        b.setAttribute("aria-selected", String(b === tab));
      });
      panes.querySelectorAll("[role=tabpanel]").forEach(function (p) {
        p.hidden = p.id !== tab.getAttribute("aria-controls");
      });
    }
    var go = e.target.closest("[data-wb-go]");
    if (go) {
      var gw = go.closest(".workbench");
      setTab(gw, gw.getAttribute("data-tab") === "output" ? "input" : "output");
    }
    var ex = e.target.closest(".wb-expand");
    if (ex) toggleExpand(ex.closest(".workbench"));
    var co = e.target.closest("[data-copy-output]");
    if (co) copyText(co, co.closest(".workbench").querySelector(".wb-output").textContent, "Copy output");
    var seg = e.target.closest(".seg");
    if (seg) {
      seg.parentElement.querySelectorAll(".seg").forEach(function (b) {
        b.setAttribute("aria-pressed", String(b === seg));
      });
    }
  });

  var ICONS = {
    copy: '<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V6a2 2 0 0 1 2-2h9"/>',
    check: '<path d="m5 12 5 5 9-10"/>',
    expand: '<path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/>',
    close: '<path d="M6 6l12 12M18 6 6 18"/>',
    right: '<path d="M5 12h14M13 6l6 6-6 6"/>',
    left: '<path d="M19 12H5M11 6l-6 6 6 6"/>'
  };
  function icon(name) {
    return '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + ICONS[name] + "</svg>";
  }
  function setBtn(b, label, name, after) {
    b.innerHTML = after ? "<span>" + label + "</span>" + icon(name) : icon(name) + "<span>" + label + "</span>";
  }
  function copyText(b, text, label) {
    var done = function () {
      setBtn(b, "Copied", "check");
      setTimeout(function () { setBtn(b, label, "copy"); }, 1500);
    };
    try { navigator.clipboard.writeText(text).then(done, done); } catch (err) { done(); }
  }

  function setTab(wb, which) {
    var out = which === "output";
    wb.setAttribute("data-tab", which);
    var panels = wb.querySelector(".wb-body").children;
    panels[0].hidden = out;
    panels[1].hidden = !out;
    wb.querySelector("[data-wb-label-in]").hidden = out;
    wb.querySelector("[data-wb-label-out]").hidden = !out;
    var go = wb.querySelector("[data-wb-go]");
    if (out) setBtn(go, "Back to your text", "left");
    else setBtn(go, "Fix typography", "right", true);
  }

  function toggleExpand(wb) {
    var on = wb.classList.toggle("is-expanded");
    document.body.classList.toggle("wb-locked", on);
    var b = wb.querySelector(".wb-expand");
    if (on) setBtn(b, "Close", "close");
    else setBtn(b, "Expand", "expand");
    b.setAttribute("aria-expanded", String(on));
  }
  document.addEventListener("keydown", function (e) {
    if (e.key !== "Escape") return;
    var wb = document.querySelector(".workbench.is-expanded");
    if (wb) toggleExpand(wb);
  });

  function syncTheme() {
    var cur = root.getAttribute("data-theme") || "auto";
    document.querySelectorAll("[data-theme-set]").forEach(function (b) {
      b.setAttribute("aria-pressed", String(b.getAttribute("data-theme-set") === cur));
    });
  }
  syncTheme();

  var mq = window.matchMedia("(min-width: 861px)");
  function syncDocNav() {
    var d = document.querySelector("details.doc-nav");
    if (d) d.open = mq.matches;
  }
  syncDocNav();
  mq.addEventListener("change", syncDocNav);
  /* ── Code blocks: syntax colours and a copy button ───────────────────────────────────── */
  var KW = /^(?:import|from|as|const|let|var|function|return|if|else|try|catch|throw|new|use|require|def|end|class|package|func|type|struct|true|false|null|nil|None|True|False|await|async|export|default|npm|pip|go|gem|composer|install|get)$/;
  function esc(s) {
    return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }
  function highlight(src) {
    if (/^\s*</.test(src)) {
      return esc(src).replace(/(&lt;\/?)([\w-]+)([^]*?)(&gt;)/g, function (m, o, tag, rest, c) {
        rest = rest.replace(/([\w-]+)=(&quot;|")(.*?)\2/g, '<span class="tok-attr">$1</span>=<span class="tok-str">$2$3$2</span>');
        return o + '<span class="tok-tag">' + tag + "</span>" + rest + c;
      });
    }
    var re = /(\/\/[^\n]*|#[^\n]*)|("(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*')|(\b\d+(?:\.\d+)?\b)|([A-Za-z_$][\w$]*)(\()?/g;
    var out = "", last = 0, m;
    while ((m = re.exec(src))) {
      out += esc(src.slice(last, m.index));
      if (m[1]) out += '<span class="tok-com">' + esc(m[1]) + "</span>";
      else if (m[2]) out += '<span class="tok-str">' + esc(m[2]) + "</span>";
      else if (m[3]) out += '<span class="tok-num">' + m[3] + "</span>";
      else if (KW.test(m[4])) out += '<span class="tok-kw">' + m[4] + "</span>" + (m[5] || "");
      else if (m[5]) out += '<span class="tok-fn">' + m[4] + "</span>(";
      else out += esc(m[4]);
      last = re.lastIndex;
    }
    return out + esc(src.slice(last));
  }
  document.querySelectorAll("pre > code").forEach(function (code) {
    var pre = code.parentElement;
    var text = code.textContent;
    code.innerHTML = highlight(text);
    var wrap = document.createElement("div");
    wrap.className = "code";
    pre.parentNode.insertBefore(wrap, pre);
    wrap.appendChild(pre);
    var b = document.createElement("button");
    b.type = "button";
    b.className = "pg-copy";
    setBtn(b, "Copy", "copy");
    wrap.appendChild(b);
  });
  /* Badge picker: re-renders the live badge (badge.js) and the snippet that produces it. */
  var bsel = document.getElementById("badge-lang");
  function syncBadge(theme) {
    var el = document.getElementById("badge-preview");
    el.setAttribute("data-polytypo-lang", bsel.value);
    if (theme) el.setAttribute("data-polytypo-theme", theme);
    if (window.PolytypoBadge) window.PolytypoBadge.render(el);
    var code = document.querySelector("#badge-code code");
    code.innerHTML = highlight(
      '<script async src="https://polytypo.dev/badge.js"><\/script>\n<span data-polytypo-lang="' +
        bsel.value + '" data-polytypo-theme="' + el.getAttribute("data-polytypo-theme") + '"></span>'
    );
  }
  if (bsel) {
    bsel.addEventListener("change", function () { syncBadge(); });
    document.querySelectorAll("[data-badge-theme]").forEach(function (b) {
      b.addEventListener("click", function () { syncBadge(b.getAttribute("data-badge-theme")); });
    });
  }

  document.addEventListener("click", function (e) {
    var b = e.target.closest(".code .pg-copy");
    if (!b) return;
    copyText(b, b.closest(".code").querySelector("code").textContent, "Copy");
  });
})();
