"""Site search: a header button that opens a modal dialog, backed by Pagefind.

The index is built after the site is generated (`npm run gen:search`, and the Pages deploy job)
into promo/pagefind/, which is not committed. Pagefind's script and index are requested only when
the dialog is first opened, so a page that is merely read makes no extra request, and a site served
without the index (a plain file:// view, a local preview before gen:search) shows a short notice
instead of failing.
"""

SEARCH_ICON = (
    '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor"'
    ' stroke-width="2" stroke-linecap="round" aria-hidden="true">'
    '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>'
)

SEARCH_BUTTON = (
    '<button class="search-open" type="button" aria-haspopup="dialog" aria-label="Search">'
    f'{SEARCH_ICON}<span class="search-open-label">Search</span><kbd>/</kbd></button>'
)

SEARCH_DIALOG = (
    '<dialog class="search-dialog" aria-label="Search">'
    f'<div class="search-head">{SEARCH_ICON}'
    '<input type="search" placeholder="Search documentation and locales" aria-label="Search"'
    ' autocomplete="off" spellcheck="false">'
    '<button class="search-close" type="button" aria-label="Close search">Esc</button></div>'
    '<ul class="search-results" role="listbox"></ul>'
    '<p class="search-foot"><span>Search runs in your browser. Nothing is sent anywhere.</span></p>'
    "</dialog>\n"
)


def search_script(prefix):
    return (
        "<script>\n"
        "(function () {\n"
        '  var dlg = document.querySelector(".search-dialog");\n'
        '  var open = document.querySelector(".search-open");\n'
        "  if (!dlg || !open || !dlg.showModal) { if (open) open.hidden = true; return; }\n"
        '  var input = dlg.querySelector("input");\n'
        '  var list = dlg.querySelector(".search-results");\n'
        "  var pf = null;\n"
        "  var seq = 0;\n"
        "  var active = -1;\n"
        "  function load() {\n"
        f'    if (!pf) pf = import("{prefix}pagefind/pagefind.js").then(function (m) {{ return m.init().then(function () {{ return m; }}); }});\n'
        "    return pf;\n"
        "  }\n"
        "  function note(text) {\n"
        '    list.replaceChildren();\n'
        '    var li = document.createElement("li");\n'
        '    li.className = "search-note";\n'
        "    li.textContent = text;\n"
        "    list.appendChild(li);\n"
        "  }\n"
        "  function where(url) {\n"
        '    if (url.indexOf("/locales/") === 0) return "Locales";\n'
        '    var part = url.split("/")[2];\n'
        '    return part ? "Docs / " + part.replace(/-/g, " ") : "Docs";\n'
        "  }\n"
        "  function mark(i) {\n"
        '    var items = list.querySelectorAll("a");\n'
        '    items.forEach(function (a, n) { a.classList.toggle("is-active", n === i); });\n'
        '    if (items[i]) items[i].scrollIntoView({ block: "nearest" });\n'
        "    active = i;\n"
        "  }\n"
        "  function show(items) {\n"
        '    list.replaceChildren();\n'
        "    active = -1;\n"
        '    if (!items.length) return note("No results");\n'
        "    items.forEach(function (d) {\n"
        '      var li = document.createElement("li");\n'
        '      var a = document.createElement("a");\n'
        f'      a.href = "{prefix}" + d.url.replace(/^\\//, "");\n'
        '      var w = document.createElement("small");\n'
        "      w.textContent = where(d.url);\n"
        '      var t = document.createElement("strong");\n'
        "      t.textContent = d.meta.title || d.url;\n"
        '      var p = document.createElement("span");\n'
        "      p.innerHTML = d.excerpt;\n"
        "      a.append(w, t, p);\n"
        "      li.appendChild(a);\n"
        "      list.appendChild(li);\n"
        "    });\n"
        "    mark(0);\n"
        "  }\n"
        "  function openDialog() {\n"
        "    if (!dlg.open) dlg.showModal();\n"
        "    input.focus();\n"
        "    input.select();\n"
        '    load().catch(function () { note("Search is unavailable here."); });\n'
        "  }\n"
        '  open.addEventListener("click", openDialog);\n'
        '  dlg.querySelector(".search-close").addEventListener("click", function () { dlg.close(); });\n'
        '  dlg.addEventListener("click", function (e) { if (e.target === dlg) dlg.close(); });\n'
        '  list.addEventListener("click", function () { dlg.close(); });\n'
        '  input.addEventListener("input", function () {\n'
        "    var q = input.value.trim();\n"
        "    var id = ++seq;\n"
        '    if (!q) { list.replaceChildren(); active = -1; return; }\n'
        "    load().then(function (m) { return m.search(q); }).then(function (r) {\n"
        "      if (id !== seq) return;\n"
        "      return Promise.all(r.results.slice(0, 10).map(function (x) { return x.data(); })).then(function (items) {\n"
        "        if (id === seq) show(items);\n"
        "      });\n"
        '    }).catch(function () { if (id === seq) note("Search is unavailable here."); });\n'
        "  });\n"
        '  input.addEventListener("keydown", function (e) {\n'
        '    var items = list.querySelectorAll("a");\n'
        '    if (e.key === "ArrowDown" && items.length) { e.preventDefault(); mark((active + 1) % items.length); }\n'
        '    else if (e.key === "ArrowUp" && items.length) { e.preventDefault(); mark((active - 1 + items.length) % items.length); }\n'
        '    else if (e.key === "Enter" && items[active]) { e.preventDefault(); location.href = items[active].href; }\n'
        "  });\n"
        '  document.addEventListener("keydown", function (e) {\n'
        '    var typing = /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName) || document.activeElement.isContentEditable;\n'
        '    if (((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") || (e.key === "/" && !typing && !dlg.open)) {\n'
        "      e.preventDefault();\n"
        "      openDialog();\n"
        "    }\n"
        "  });\n"
        "})();\n"
        "</script>\n"
    )
