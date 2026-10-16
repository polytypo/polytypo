#!/usr/bin/env python3
"""Tests for docs_md.py, the Markdown subset the documentation pages are written in.

Run:
    python3 brand/tools/test_docs_md.py
"""
import os
import sys
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import docs_md  # noqa: E402


def render(body, known=("docs", "docs/api/errors"), prefix="../../"):
    r = docs_md.Renderer("t", prefix, set(known))
    return r.render(body, lambda lang, code: f"<pre data-lang='{lang}'>{code}</pre>"), r


class FrontMatter(unittest.TestCase):
    def test_parses_flat_keys(self):
        meta, body = docs_md.parse_front_matter("---\ntitle: A: b\norder: 3\n---\nBody\n", "t")
        self.assertEqual(meta, {"title": "A: b", "order": "3"})
        self.assertEqual(body, "Body\n")

    def test_missing_front_matter_fails(self):
        with self.assertRaises(docs_md.DocError):
            docs_md.parse_front_matter("Body", "t")


class Inline(unittest.TestCase):
    def test_html_is_escaped_not_passed_through(self):
        html, _ = render("<script>alert(1)</script> & **b**")
        self.assertIn("&lt;script&gt;", html)
        self.assertNotIn("<script>", html)
        self.assertIn("<strong>b</strong>", html)

    def test_code_span_is_protected_from_emphasis_and_links(self):
        html, _ = render("`*a* [x](/nope/)`")
        self.assertEqual(html, "<p><code>*a* [x](/nope/)</code></p>")


class Links(unittest.TestCase):
    def test_site_absolute_link_becomes_document_relative(self):
        html, _ = render("[e](/docs/api/errors/#codes) [h](/docs/)")
        self.assertIn('href="../../docs/api/errors/#codes"', html)
        self.assertIn('href="../../docs/"', html)

    def test_unknown_page_fails_the_build(self):
        with self.assertRaises(docs_md.DocError):
            render("[x](/docs/missing/)")

    def test_relative_link_is_rejected(self):
        with self.assertRaises(docs_md.DocError):
            render("[x](errors/)")

    def test_external_link_passes(self):
        html, _ = render("[x](https://example.com/a)")
        self.assertIn('href="https://example.com/a"', html)


class Blocks(unittest.TestCase):
    def test_headings_get_unique_ids_and_h2_enter_the_toc(self):
        html, r = render("## Same\n\n### Same\n\n## Other")
        self.assertIn('id="same"', html)
        self.assertIn('id="same-2"', html)
        self.assertEqual([i for i, _t in r.toc], ["same", "other"])

    def test_fence_is_handed_to_the_callback_verbatim(self):
        html, _ = render("```js\nconst a = '<b>';\n```")
        self.assertEqual(html, "<pre data-lang='js'>const a = '<b>';</pre>")

    def test_unterminated_fence_fails(self):
        with self.assertRaises(docs_md.DocError):
            render("```js\ncode")

    def test_table(self):
        html, _ = render("| A | B |\n| --- | --- |\n| `x` | y |")
        self.assertIn("<th>A</th><th>B</th>", html)
        self.assertIn("<td><code>x</code></td><td>y</td>", html)

    def test_lists(self):
        html, _ = render("- a\n- b\n\n1. c\n2. d")
        self.assertIn("<ul><li>a</li><li>b</li></ul>", html)
        self.assertIn("<ol><li>c</li><li>d</li></ol>", html)


if __name__ == "__main__":
    unittest.main()
