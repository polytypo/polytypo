#!/usr/bin/env python3
"""Deterministic test for js_status_and_install() and js_metadata_line() in gen_readmes.py (Stage
6 follow-up review, item 3; corrected first in the versioning-corrections pass that removed the
false npm-publication inference, then in the final wording pass that made the real-version
metadata line registry-state-neutral instead of asserting "not yet on npm" — a claim that is true
before `npm publish` and permanently false, inside an immutable tarball, the moment after). Proves
both the placeholder-version rendering and a representative real-version rendering, without ever
touching the real package.json — both functions are pure functions of their arguments, so every
case is exercised by calling them directly with literal arguments, and without any network access.

Run:
    python3 brand/tools/test_gen_readmes.py
"""
import os
import sys
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import gen_readmes  # noqa: E402

# build_promo defines CODE (and its own hard-coded "npm — not yet published" status string) as
# module-level state evaluated at import time, exactly like gen_readmes — imported directly, not
# re-parsed, so the no-contradiction check compares the real generator output on both sides.
import build_promo  # noqa: E402

# Every phrase asserting either presence OR absence in the npm registry — a real-version README
# must contain none of them, case-insensitively, since Markdown bolding/casing must not be able to
# dodge the check. Order matters for substring containment below: "not yet published" and
# "not yet on npm" must be checked before their shorter substrings ("published", "on npm") would
# otherwise already have matched, so this list is checked as whole phrases, not via the shorter
# entries' accidental containment.
_REGISTRY_STATE_CLAIMS = [
    "not yet published",
    "not yet on npm",
    "released",
    "published",
    "on npm",
]


def _assert_registry_state_neutral(testcase, text):
    lowered = text.lower()
    for claim in _REGISTRY_STATE_CLAIMS:
        testcase.assertNotIn(claim, lowered, f'registry-state claim "{claim}" must not appear: {text!r}')


class JsStatusAndInstallTest(unittest.TestCase):
    def test_placeholder_version_is_honestly_unpublished(self):
        status, install = gen_readmes.js_status_and_install("0.0.0", "ten")
        self.assertIn("not yet published", status)
        self.assertNotIn("Status: released", status)
        self.assertIn("has not been published to npm yet", install)
        self.assertIn("npm install polytypo", install)  # still shown, as the *future* step

    def test_placeholder_version_does_not_claim_the_name_is_reserved(self):
        # A registry 404 only proves the name is currently unclaimed, not that it is reserved for
        # this project — nothing prevents someone else from publishing it first. "reserved" is a
        # stronger claim than a 404 supports.
        _, install = gen_readmes.js_status_and_install("0.0.0", "ten")
        self.assertNotIn("reserved", install)

    def test_placeholder_version_points_clone_at_canonical_repository(self):
        _, install = gen_readmes.js_status_and_install("0.0.0", "ten")
        self.assertIn("git clone https://github.com/polytypo/polytypo ", install)
        self.assertNotIn("polytypo-js", install)

    def test_real_version_is_described_as_stable_release_ready(self):
        status, _ = gen_readmes.js_status_and_install("1.0.0", "ten")
        self.assertIn("stable", status.lower())

    def test_real_version_status_and_install_are_registry_state_neutral(self):
        for version in ["1.0.0", "2.3.4", "0.0.1"]:
            status, install = gen_readmes.js_status_and_install(version, "ten")
            _assert_registry_state_neutral(self, status)
            _assert_registry_state_neutral(self, install)

    def test_real_version_does_not_falsely_claim_the_placeholder(self):
        status, install = gen_readmes.js_status_and_install("1.0.0", "ten")
        self.assertNotIn("0.0.0", status)
        self.assertNotIn("0.0.0", install)

    def test_real_version_exposes_the_real_package_version_in_status(self):
        status, _ = gen_readmes.js_status_and_install("1.0.0", "ten")
        self.assertIn("1.0.0", status)
        status2, _ = gen_readmes.js_status_and_install("2.3.4", "ten")
        self.assertIn("2.3.4", status2)

    def test_real_version_has_no_clone_requirement(self):
        _, install = gen_readmes.js_status_and_install("0.1.0", "ten")
        self.assertNotIn("git clone", install)
        self.assertNotIn("has not been published", install)

    def test_real_version_install_is_the_normal_npm_install(self):
        _, install = gen_readmes.js_status_and_install("0.1.0", "ten")
        self.assertEqual(install, "```bash\nnpm install polytypo\n```")

    def test_mode_sentence_reflects_the_given_locale_count_word_in_both_states(self):
        placeholder_status, _ = gen_readmes.js_status_and_install("0.0.0", "seven")
        real_status, _ = gen_readmes.js_status_and_install("1.0.0", "seven")
        self.assertIn("seven locales", placeholder_status)
        self.assertIn("seven locales", real_status)

    def test_does_not_mutate_the_real_package_json(self):
        # js_status_and_install() takes version as a parameter; this test only ever passes
        # literals, so nothing here can touch the checked-out package.json regardless of order.
        real_version = gen_readmes.PACKAGE_VERSION
        gen_readmes.js_status_and_install("9.9.9", "ten")
        self.assertEqual(gen_readmes.PACKAGE_VERSION, real_version)


class JsMetadataLineTest(unittest.TestCase):
    """js_metadata_line() builds the one line that states spec/package version, locale, and rule
    counts for JS's own README section — the exact text that changed in the final wording
    correction, from a binary "on npm."/"not yet on npm." claim to a registry-state-neutral one
    for a real version."""

    def test_placeholder_version_keeps_the_not_yet_on_npm_wording(self):
        # This branch is never packed as a real release candidate, so its honest negative claim
        # carries no future-tarball risk and may state it plainly, unchanged from before.
        line = gen_readmes.js_metadata_line("0.0.0", "1.0.0", 10, 9)
        self.assertIn("not yet on npm", line)
        self.assertIn("Spec version: **1.0.0**", line)

    def test_real_version_is_registry_state_neutral(self):
        line = gen_readmes.js_metadata_line("1.0.0", "1.0.0", 10, 9)
        _assert_registry_state_neutral(self, line)

    def test_real_version_states_both_spec_version_and_package_version(self):
        line = gen_readmes.js_metadata_line("1.0.0", "1.0.0", 10, 9)
        self.assertIn("Spec version: **1.0.0**", line)
        self.assertIn("package version: **1.0.0**", line)

    def test_real_version_with_diverging_spec_and_package_versions_states_both_correctly(self):
        # Spec version and package version are independent identifiers (docs/ARCHITECTURE.md
        # section 3.1) — this line must never conflate them even when they happen to be equal.
        line = gen_readmes.js_metadata_line("1.4.0", "1.2.0", 10, 9)
        self.assertIn("Spec version: **1.2.0**", line)
        self.assertIn("package version: **1.4.0**", line)
        _assert_registry_state_neutral(self, line)

    def test_real_version_states_locale_and_rule_counts(self):
        line = gen_readmes.js_metadata_line("1.0.0", "1.0.0", 10, 9)
        self.assertIn("locales: **10**", line)
        self.assertIn("rules: **9**", line)

    def test_does_not_mutate_real_module_state(self):
        real_line = gen_readmes._JS_METADATA_LINE
        gen_readmes.js_metadata_line("9.9.9", "9.9.9", 1, 1)
        self.assertEqual(gen_readmes._JS_METADATA_LINE, real_line)


class JsAndPromoRegistryClaimsTest(unittest.TestCase):
    """The corrected relationship is not "README and promo say the same thing" — it is "README
    makes no registry-state claim at all, and promo's own independent claim, whatever it currently
    is, is never contradicted by README's silence." Checked against the real, current
    PACKAGE_VERSION (non-placeholder), so this proves the actual generated README, not just a
    literal function call."""

    def test_real_generated_readme_metadata_line_is_registry_state_neutral(self):
        self.assertNotEqual(gen_readmes.PACKAGE_VERSION, gen_readmes.PLACEHOLDER_VERSION)
        _assert_registry_state_neutral(self, gen_readmes.LANGS["js"]["metadata_line"])
        _assert_registry_state_neutral(self, gen_readmes.LANGS["js"]["status"])

    def test_promo_may_independently_keep_its_current_truthful_unpublished_claim(self):
        js_row = next(row for row in build_promo.CODE if row[0] == "JavaScript / TypeScript")
        promo_status = js_row[1]
        self.assertIn("not yet published", promo_status)

    def test_readmes_silence_never_contradicts_whatever_promo_currently_claims(self):
        # README's metadata line makes no registry-state claim, so there is nothing in it that
        # could contradict promo's own claim, whatever that claim is at any given moment (promo is
        # free to change after a real publish; README's packed copy is not).
        metadata_line = gen_readmes.LANGS["js"]["metadata_line"]
        js_row = next(row for row in build_promo.CODE if row[0] == "JavaScript / TypeScript")
        promo_status = js_row[1]
        self.assertIn("not yet published", promo_status)  # promo's current claim, for context
        _assert_registry_state_neutral(self, metadata_line)  # README asserts nothing to conflict


class JsSubpathEntryPointsTest(unittest.TestCase):
    """Stage 10 correction pass 2: README.md must document all four published entry points, not
    only the aggregate one. Reads gen_readmes.LANGS["js"]["extra"] directly — the same string
    build() writes into README.md — so a regression here means a regression in the real file."""

    def setUp(self):
        self.extra = gen_readmes.LANGS["js"]["extra"]

    def test_documents_all_four_entry_points(self):
        for path in ['"polytypo"', '"polytypo/text"', '"polytypo/html"', '"polytypo/markdown"']:
            self.assertIn(path, self.extra, f"missing import example for {path}")

    def test_states_every_subpath_ships_esm_cjs_and_typescript_declarations(self):
        self.assertIn("ESM, CommonJS, and their own TypeScript", self.extra)

    def test_mode_specific_entries_do_not_imply_a_still_needed_mode_argument(self):
        # The whole point of a fixed-mode entry point is that `mode` is not a parameter at all —
        # the doc must say so explicitly, not just show an example that happens to omit it.
        self.assertIn("`mode` is not a parameter of `TextOptions` or `HtmlOptions`", self.extra)
        self.assertIn("POLYTYPO_INVALID_MODE", self.extra)

    def test_states_the_exact_three_way_runtime_mode_check_not_a_blanket_throw(self):
        # assertFixedMode() (src/engine/assert-fixed-mode.ts) accepts an omitted mode, tolerates
        # the entry's own fixed mode, and only throws on a genuinely conflicting one — the doc
        # must not read as "supplying a runtime mode throws," which would be wrong for the
        # tolerated case.
        self.assertIn("omitting it is the normal case", self.extra)
        self.assertIn("redundant but tolerated", self.extra)
        self.assertIn("supplying any other mode throws", self.extra)

    def test_markdown_entry_keeps_the_required_no_default_dialect_contract(self):
        self.assertIn("`dialect` contract exactly: required, no default", self.extra)

    def test_states_subpaths_narrow_reach_not_a_guaranteed_smaller_bundle_and_not_install_footprint(self):
        # Reach is mechanically provable (check:entry-reach); a smaller resulting bundle depends
        # on the consumer's own bundler and configuration and must not be stated categorically.
        self.assertIn("narrows what a bundler can *reach*", self.extra)
        self.assertIn("depends on your bundler and its\nconfiguration", self.extra)
        self.assertNotIn("A subpath shrinks your bundle", self.extra)
        self.assertIn("does **not** change what `npm install polytypo` puts", self.extra)


class PortDialectApiTest(unittest.TestCase):
    """Fails if `dialect` disappears from any planned port's own API section — the shared
    ERRORS table (present on every language's page regardless) does not satisfy this; each
    language's own `api` string must independently document it."""

    PORTS = ["python", "go", "ruby", "php"]

    def test_dialect_is_present_in_every_ports_own_api_section(self):
        for lang in self.PORTS:
            api = gen_readmes.LANGS[lang]["api"]
            self.assertIn("dialect", api.lower(), f"{lang}: 'dialect' missing from its api section")
            self.assertIn("commonmark", api.lower(), f"{lang}: no commonmark mention")
            self.assertIn("mdx", api.lower(), f"{lang}: no mdx mention")

    def test_every_port_has_a_markdown_call_example_and_a_missing_dialect_error_example(self):
        for lang in self.PORTS:
            api = gen_readmes.LANGS[lang]["api"]
            self.assertIn(
                "POLYTYPO_INVALID_DIALECT", api, f"{lang}: no missing-dialect error example"
            )
            self.assertIn("markdown", api.lower(), f"{lang}: no markdown-mode call example")

    def test_every_port_states_dialect_is_required_with_no_default_for_markdown(self):
        for lang in self.PORTS:
            api = gen_readmes.LANGS[lang]["api"].lower()
            self.assertIn("required", api, f"{lang}: does not state dialect is required")
            self.assertTrue(
                "not defaulted" in api or "no default" in api,
                f"{lang}: does not state dialect has no default",
            )

    def test_every_port_states_dialect_detection_is_refused(self):
        for lang in self.PORTS:
            api = gen_readmes.LANGS[lang]["api"].lower()
            self.assertIn(
                "detection is refused", api, f"{lang}: does not state detection is refused"
            )

    def test_go_defines_an_explicit_dialect_type_rather_than_a_bare_string(self):
        api = gen_readmes.LANGS["go"]["api"]
        self.assertIn("type Dialect", api)
        self.assertIn("DialectCommonMark", api)
        self.assertIn("DialectMDX", api)

    def test_no_port_claims_to_be_currently_installable(self):
        for lang in self.PORTS:
            self.assertFalse(gen_readmes.LANGS[lang]["on_registry"], f"{lang}: on_registry must stay False")
            self.assertIn("not installable", gen_readmes.LANGS[lang]["install"].lower())


if __name__ == "__main__":
    unittest.main()
