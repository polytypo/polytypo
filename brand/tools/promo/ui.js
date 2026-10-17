/* Page chrome and components shared by every page: the navigation toggle, the docs sidebar,
 * copy buttons and syntax colours on code blocks, the workbench (the "try it" panel) and the
 * badge picker. Loaded after site.js, whose helpers it uses; each page's own inline script fills
 * in what is specific to that page. */
(function () {
  const { highlight, setButton, copyButton, track } = window.Polytypo;

  document.addEventListener("click", (e) => {
    const toggle = e.target.closest(".nav-toggle");
    if (toggle) {
      const open = document.body.classList.toggle("nav-open");
      toggle.setAttribute("aria-expanded", String(open));
    }

    const go = e.target.closest("[data-wb-go]");
    if (go) {
      const wb = go.closest(".workbench");
      setTab(wb, "output");
    }

    const back = e.target.closest("[data-wb-back]");
    if (back) setTab(back.closest(".workbench"), "input");

    const expand = e.target.closest(".wb-expand");
    if (expand) toggleExpand(expand.closest(".workbench"));

    const seg = e.target.closest(".seg");
    if (seg) {
      seg.parentElement.querySelectorAll(".seg").forEach((b) => {
        b.setAttribute("aria-pressed", String(b === seg));
      });
    }

    const copy = e.target.closest(".code .pg-copy");
    if (copy) {
      const text = copy.closest(".code").querySelector("code").textContent;
      copyButton(copy, text, "Copy").then((ok) => {
        const preview = document.getElementById("badge-preview");
        if (ok && preview && copy.closest("#badge")) {
          track("badge-copy", {
            lang: preview.getAttribute("data-polytypo-lang"),
            theme: preview.getAttribute("data-polytypo-theme"),
          });
        }
      });
    }
  });

  /* ── Workbench: Input and Output share one place, switched by the single bottom button ── */

  function setTab(wb, which) {
    const out = which === "output";
    wb.setAttribute("data-tab", which);
    const panels = wb.querySelector(".wb-body").children;
    panels[0].hidden = out;
    panels[1].hidden = !out;
    wb.querySelector("[data-wb-back]").setAttribute("aria-selected", String(!out));
    wb.querySelector("[data-wb-go][role=tab]").setAttribute("aria-selected", String(out));
    wb.querySelector("[data-copy-output]").hidden = !out;
  }

  function toggleExpand(wb) {
    const on = wb.classList.toggle("is-expanded");
    document.body.classList.toggle("wb-locked", on);
    const b = wb.querySelector(".wb-expand");
    if (on) setButton(b, "Close", "close");
    else setButton(b, "Expand", "expand");
    b.setAttribute("aria-expanded", String(on));
  }

  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    const wb = document.querySelector(".workbench.is-expanded");
    if (wb) toggleExpand(wb);
  });

  /* ── Docs sidebar: open on wide screens, a closed <details> below ───────────────────────── */

  const wide = window.matchMedia("(min-width: 861px)");
  function syncDocNav() {
    const d = document.querySelector("details.doc-nav");
    if (d) d.open = wide.matches;
  }
  syncDocNav();
  wide.addEventListener("change", syncDocNav);

  /* ── Code blocks: syntax colours and a copy button ─────────────────────────────────────── */

  document.querySelectorAll("pre > code").forEach((code) => {
    const pre = code.parentElement;
    code.innerHTML = highlight(code.textContent);
    const wrap = document.createElement("div");
    wrap.className = "code";
    pre.parentNode.insertBefore(wrap, pre);
    wrap.appendChild(pre);
    const b = document.createElement("button");
    b.type = "button";
    b.className = "pg-copy";
    setButton(b, "Copy", "copy");
    wrap.appendChild(b);
  });

  /* ── Badge picker: re-renders the live badge (badge.js) and the snippet that produces it ── */

  const lang = document.getElementById("badge-lang");
  function syncBadge(theme) {
    const el = document.getElementById("badge-preview");
    el.setAttribute("data-polytypo-lang", lang.value);
    if (theme) el.setAttribute("data-polytypo-theme", theme);
    if (window.PolytypoBadge) window.PolytypoBadge.render(el);
    const code = document.querySelector("#badge-code code");
    code.innerHTML = highlight(
      code.textContent
        .replace(/data-polytypo-lang="[^"]*"/, 'data-polytypo-lang="' + lang.value + '"')
        .replace(
          /data-polytypo-theme="[^"]*"/,
          'data-polytypo-theme="' + el.getAttribute("data-polytypo-theme") + '"',
        ),
    );
  }
  if (lang) {
    lang.addEventListener("change", () => syncBadge());
    document.querySelectorAll("[data-badge-theme]").forEach((b) => {
      b.addEventListener("click", () => syncBadge(b.getAttribute("data-badge-theme")));
    });
  }
})();
