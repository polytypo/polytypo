"""The one order every list of locales on this site, README and generated file uses.

Alphabetical by the locale's English `name` in spec/locales/<code>.json, case-insensitive, with the
code as tie-breaker. "French" sorts before "French (Canada)", "German (Germany)" before
"German (Switzerland)". The registry's own order (spec/locales/registry.json) is the spec's and
is left alone; this order is applied where a list is presented.
"""
import json
import os

SPEC = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), "spec")

_names = {}


def locale_name(code):
    if code not in _names:
        with open(os.path.join(SPEC, "locales", f"{code}.json"), encoding="utf-8") as f:
            _names[code] = json.load(f)["name"]
    return _names[code]


def sort_key(code):
    return (locale_name(code).casefold(), code)


def sorted_codes(codes):
    return sorted(codes, key=sort_key)
