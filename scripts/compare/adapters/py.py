# Runs the corpus through the Python tools. Executed with the venv interpreter in isolated mode.
import json
import sys

import polytypo
import smartypants
from typogrify.filters import typogrify

cases = json.load(open(sys.argv[1], encoding="utf-8"))


def run_polytypo(c, s):
    kw = {"locale": c["locale"], "mode": c["format"]}
    if c["format"] == "markdown":
        kw["dialect"] = "commonmark"
    return polytypo.transform(s, **kw)


english = lambda c: c["locale"] == "en-US"
tools = {
    "polytypo": (lambda c: True, run_polytypo),
    "smartypants.py": (lambda c: c["format"] != "markdown" and english(c), lambda c, s: smartypants.smartypants(s)),
    "typogrify": (lambda c: c["format"] != "markdown" and english(c), lambda c, s: typogrify(s)),
}
out = {"results": {}}
for name, (applies, run) in tools.items():
    out["results"][name] = {"html": False, "cases": {}}
    for c in cases:
        if not applies(c):
            continue
        try:
            once = run(c, c["input"])
            out["results"][name]["cases"][c["id"]] = {"once": once, "twice": run(c, once)}
        except Exception as e:  # noqa: BLE001
            out["results"][name]["cases"][c["id"]] = {"error": str(e)[:120]}
json.dump(out, open(sys.argv[2], "w", encoding="utf-8"), ensure_ascii=False)
