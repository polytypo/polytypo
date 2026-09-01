#!/usr/bin/env python3
"""Tests for gen_svg.py's ensure_font(): immutable, checksum-verified font acquisition
(Stage 10 correction pass 1). Never touches the network or the real brand/tools/*.ttf cache —
each test points ensure_font() at a disposable temp directory and, where a download would
happen, injects a fake `download` callable instead of the real network fetch.

Run:
    python3 brand/tools/test_gen_svg.py
"""
import hashlib
import os
import sys
import tempfile
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import gen_svg as G  # noqa: E402

FAKE_NAME = "Inter.ttf"  # reuse a real registered name so FONTS[name] lookups succeed
FAKE_BYTES = b"fake font bytes for testing, not a real font\x00\x01\x02"
FAKE_SHA256 = hashlib.sha256(FAKE_BYTES).hexdigest()


class EnsureFontTest(unittest.TestCase):
    def setUp(self):
        tmpdir = tempfile.TemporaryDirectory()
        self.addCleanup(tmpdir.cleanup)
        self._tmpdir = tmpdir

        orig_here, orig_fonts = G.HERE, G.FONTS
        G.HERE = tmpdir.name
        # A fake registered font pointing at fixture bytes, so no test depends on the real
        # Inter/JBMono pins or on network content.
        G.FONTS = dict(G.FONTS)
        G.FONTS[FAKE_NAME] = {"url": "https://example.invalid/font.ttf", "sha256": FAKE_SHA256}

        def restore():
            G.HERE, G.FONTS = orig_here, orig_fonts

        self.addCleanup(restore)

    def _path(self):
        return os.path.join(self._tmpdir.name, FAKE_NAME)

    def test_valid_cached_font_is_accepted_without_a_download(self):
        with open(self._path(), "wb") as f:
            f.write(FAKE_BYTES)

        def never_call(url, timeout):
            raise AssertionError("download() must not be called when the cache is already valid")

        result = G.ensure_font(FAKE_NAME, download=never_call)
        self.assertEqual(result, self._path())

    def test_corrupted_cached_font_is_rejected_not_silently_replaced(self):
        with open(self._path(), "wb") as f:
            f.write(b"corrupted, does not match the pinned checksum")

        def never_call(url, timeout):
            raise AssertionError("a corrupted cache must raise, not silently trigger a re-download")

        with self.assertRaises(RuntimeError) as ctx:
            G.ensure_font(FAKE_NAME, download=never_call)
        self.assertIn("does not match the pinned checksum", str(ctx.exception))
        # The corrupted file itself is left exactly as it was — inspectable, not deleted or
        # silently overwritten.
        with open(self._path(), "rb") as f:
            self.assertEqual(f.read(), b"corrupted, does not match the pinned checksum")

    def test_downloaded_bytes_are_checked_before_being_written_into_place(self):
        calls = []

        def good_download(url, timeout):
            calls.append((url, timeout))
            return FAKE_BYTES

        result = G.ensure_font(FAKE_NAME, download=good_download)
        self.assertEqual(result, self._path())
        self.assertEqual(len(calls), 1)
        self.assertEqual(calls[0][0], "https://example.invalid/font.ttf")
        with open(self._path(), "rb") as f:
            self.assertEqual(f.read(), FAKE_BYTES)

    def test_a_mismatched_download_never_leaves_a_partial_target_file(self):
        def bad_download(url, timeout):
            return b"wrong bytes entirely, checksum will not match"

        with self.assertRaises(RuntimeError) as ctx:
            G.ensure_font(FAKE_NAME, download=bad_download)
        self.assertIn("match the pinned checksum", str(ctx.exception))
        self.assertFalse(
            os.path.exists(self._path()), "a failed checksum must not create the target file"
        )
        # No stray temp file left behind either.
        leftovers = os.listdir(self._tmpdir.name)
        self.assertEqual(leftovers, [], f"expected an empty directory, found {leftovers}")

    def test_a_download_exception_never_leaves_a_partial_target_file(self):
        def raising_download(url, timeout):
            raise ConnectionError("simulated network failure")

        with self.assertRaises(ConnectionError):
            G.ensure_font(FAKE_NAME, download=raising_download)
        self.assertFalse(os.path.exists(self._path()))
        self.assertEqual(os.listdir(self._tmpdir.name), [])

    def test_unregistered_font_name_fails_loudly(self):
        with self.assertRaises(KeyError):
            G.ensure_font("NotARealFont.ttf", download=lambda url, timeout: b"")

    def test_download_receives_the_pinned_url_and_a_bounded_timeout(self):
        seen = {}

        def capturing_download(url, timeout):
            seen["url"] = url
            seen["timeout"] = timeout
            return FAKE_BYTES

        G.ensure_font(FAKE_NAME, download=capturing_download)
        self.assertEqual(seen["url"], "https://example.invalid/font.ttf")
        self.assertIsInstance(seen["timeout"], (int, float))
        self.assertGreater(seen["timeout"], 0)


class RealFontPinsTest(unittest.TestCase):
    """Sanity-checks the actual registered pins, not just the ensure_font() mechanism."""

    def test_real_font_urls_are_pinned_to_a_full_commit_sha_not_a_branch(self):
        for name, spec in G.FONTS.items():
            url = spec["url"]
            self.assertIn("/google/fonts/", url)
            self.assertNotIn("/main/", url, f"{name}: must not reference the mutable main branch")
            after = url.split("/google/fonts/", 1)[1]
            commit = after.split("/", 1)[0]
            self.assertEqual(len(commit), 40, f"{name}: {commit!r} is not a 40-char commit SHA")
            self.assertTrue(
                all(c in "0123456789abcdef" for c in commit),
                f"{name}: {commit!r} is not lowercase hex",
            )

    def test_real_font_pins_declare_a_64_char_lowercase_hex_sha256(self):
        for name, spec in G.FONTS.items():
            digest = spec["sha256"]
            self.assertEqual(len(digest), 64, f"{name}: sha256 must be 64 hex chars")
            self.assertTrue(
                all(c in "0123456789abcdef" for c in digest), f"{name}: sha256 not lowercase hex"
            )


if __name__ == "__main__":
    unittest.main()
