#!/usr/bin/env python3
"""Tests for gen_readmes.py — the repository's own README.md, generated from spec/ and
promo/examples.json. This generator names no runtime, no registry, and no install command: each
runtime gets its own repository, added one at a time as it actually exists (see the module
docstring in gen_readmes.py). These tests exist mainly to lock that property in, plus basic
correctness for the shared table-building helpers.

Run:
    python3 brand/tools/test_gen_readmes.py
"""
import os
import sys
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import gen_readmes  # noqa: E402

# Case-insensitive substrings that would assert something about a package/registry/install state
# this repository does not control and today has none of. If any of these ever appear in the
# generated README again, that is a regression back to writing about what doesn't exist.
_FORBIDDEN_MENTIONS = [
    "npm",
    "pypi",
    "packagist",
    "rubygems",
    "go modules",
    "go get",
    "pip install",
    "gem install",
    "composer require",
    "not yet published",
    "coming soon",
    "planned, not yet started",
    "## runtimes",
]


class HeroBlockTest(unittest.TestCase):
    def test_renders_the_input_once_as_a_blockquote(self):
        block = gen_readmes.hero_block()
        self.assertIn("**Input**", block)
        self.assertIn(f"> {gen_readmes.HERO['en-US']['hero']['in']}", block)
        # The input string must appear exactly once — it is not repeated per locale row.
        self.assertEqual(block.count(gen_readmes.HERO["en-US"]["hero"]["in"]), 1)

    def test_renders_one_table_row_per_registry_locale_in_registry_order(self):
        block = gen_readmes.hero_block()
        lines = [l for l in block.splitlines() if l.startswith("| `")]
        codes = [l.split("`")[1] for l in lines]
        self.assertEqual(codes, gen_readmes.REGISTRY["locales"])

    def test_every_row_shows_that_locales_own_real_output(self):
        block = gen_readmes.hero_block()
        for code in gen_readmes.REGISTRY["locales"]:
            self.assertIn(gen_readmes.HERO[code]["hero"]["out"], block)


class LocaleTableTest(unittest.TestCase):
    def test_has_one_row_per_registry_locale(self):
        table = gen_readmes.locale_table()
        for code in gen_readmes.REGISTRY["locales"]:
            self.assertIn(f"| `{code}` |", table)

    def test_states_alias_resolution(self):
        table = gen_readmes.locale_table()
        for alias, target in gen_readmes.REGISTRY["aliases"].items():
            self.assertIn(f"`{alias}` → `{target}`", table)


class RulesTableTest(unittest.TestCase):
    def test_has_one_row_per_spec_rule_in_order(self):
        table = gen_readmes.rules_table()
        rows = [l for l in table.splitlines() if l.startswith("| ") and "Order" not in l and "---" not in l]
        ids = [r.split("`")[1] for r in rows]
        self.assertEqual(ids, [r["id"] for r in gen_readmes.ORDER["rules"]])


class ExamplesTableTest(unittest.TestCase):
    def test_plain_table_has_no_nbsp_marker_or_note(self):
        table = gen_readmes.examples_table("en-US", mark_invisible=False)
        self.assertNotIn("⍽", table)
        self.assertNotIn("NO-BREAK SPACE", table)

    def test_marked_table_replaces_spaces_with_the_visible_placeholder_and_adds_the_note(self):
        table = gen_readmes.examples_table("en-US", mark_invisible=True)
        self.assertIn("⍽", table)
        self.assertIn("U+00A0 NO-BREAK SPACE", table)


class RootReadmeContentTest(unittest.TestCase):
    """Renders the real template with the real data (no file I/O) and checks the actual generated
    text, not just the building blocks in isolation."""

    def setUp(self):
        self.body = gen_readmes.TEMPLATE.format(
            logo="brand/logo/polytypo-lockup-stacked.svg",
            spec_version=gen_readmes.SPEC_VERSION,
            n_locales=len(gen_readmes.REGISTRY["locales"]),
            n_rules=len(gen_readmes.ORDER["rules"]),
            hero=gen_readmes.hero_block(),
            locales=gen_readmes.locale_table(),
            rules=gen_readmes.rules_table(),
            examples=gen_readmes.examples_table("en-US", mark_invisible=True),
            modes=gen_readmes.MODES,
        )

    def test_title_names_no_runtime(self):
        self.assertIn("<h1 align=\"center\">polytypo</h1>", self.body)

    def test_mentions_no_package_registry_install_command_or_runtime_status(self):
        lowered = self.body.lower()
        for term in _FORBIDDEN_MENTIONS:
            self.assertNotIn(term, lowered, f'forbidden mention "{term}" found in generated README')

    def test_modes_table_names_no_runtime_either(self):
        self.assertNotIn("javascript", gen_readmes.MODES.lower())
        self.assertIn("Implemented", gen_readmes.MODES)

    def test_states_the_real_spec_version_and_counts(self):
        self.assertIn(f"Spec version: **{gen_readmes.SPEC_VERSION}**", self.body)
        self.assertIn(f"locales: **{len(gen_readmes.REGISTRY['locales'])}**", self.body)
        self.assertIn(f"rules: **{len(gen_readmes.ORDER['rules'])}**", self.body)


if __name__ == "__main__":
    unittest.main()
