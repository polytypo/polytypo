"""Markdown subset renderer for the documentation pages under brand/tools/docs/.

A page is `---`-delimited front matter (flat `key: value` lines) followed by Markdown. The subset
is exactly what the pages use: headings, paragraphs, bullet and numbered lists, fenced code,
tables, blockquotes, rules, and the inline code / emphasis / link forms. Everything else is
escaped as text. There is no raw HTML pass-through, so a page cannot inject markup.

Internal links are written site-absolute (`/docs/api/errors/#codes`) and rewritten here to the
document-relative form the site requires (see build_promo.PAGE_PREFIXES); a link to a page that
does not exist fails the build.
"""
import html as H
import re

FENCE = re.compile(r"^```(\w*)\s*$")
HEADING = re.compile(r"^(#{2,4})\s+(.+?)\s*$")
BULLET = re.compile(r"^[-*]\s+(.*)$")
NUMBERED = re.compile(r"^\d+\.\s+(.*)$")
TABLE_SEP = re.compile(r"^\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)*\|?$")


class DocError(Exception):
    pass


def parse_front_matter(text, source):
    if not text.startswith("---\n"):
        raise DocError(f"{source}: missing front matter")
    end = text.find("\n---\n", 4)
    if end < 0:
        raise DocError(f"{source}: unterminated front matter")
    meta = {}
    for line in text[4:end].split("\n"):
        if not line.strip():
            continue
        key, sep, value = line.partition(":")
        if not sep:
            raise DocError(f"{source}: bad front matter line {line!r}")
        meta[key.strip()] = value.strip()
    return meta, text[end + 5 :]


def slugify(text):
    s = re.sub(r"[^a-z0-9]+", "-", re.sub(r"`", "", text).lower()).strip("-")
    return s or "section"


class Renderer:
    def __init__(self, source, prefix, known_slugs):
        self.source = source
        self.prefix = prefix
        self.known = known_slugs
        self.toc = []
        self.ids = set()

    def link_target(self, url):
        if re.match(r"^[a-z][a-z0-9+.-]*:", url) or url.startswith("#"):
            return url
        if not url.startswith("/"):
            raise DocError(f"{self.source}: link {url!r} must be site-absolute or off-site")
        path, _, frag = url.partition("#")
        slug = path.strip("/")
        if slug not in self.known:
            raise DocError(f"{self.source}: link to unknown page {url!r}")
        href = f"{self.prefix}{slug}/" if slug else (self.prefix or "./")
        return href + (f"#{frag}" if frag else "")

    def inline(self, text):
        stash = []

        def keep(m):
            stash.append(f"<code>{H.escape(m.group(1))}</code>")
            return f"\x00{len(stash) - 1}\x00"

        text = re.sub(r"`([^`]+)`", keep, text)
        text = H.escape(text, quote=False)

        def link(m):
            label, url = m.group(1), H.unescape(m.group(2))
            return f'<a href="{H.escape(self.link_target(url))}">{label}</a>'

        text = re.sub(r"\[([^\]]+)\]\(([^)\s]+)\)", link, text)
        text = re.sub(r"\*\*([^*]+)\*\*", r"<strong>\1</strong>", text)
        text = re.sub(r"(?<![\w*])\*([^*\s][^*]*)\*(?![\w*])", r"<em>\1</em>", text)
        return re.sub(r"\x00(\d+)\x00", lambda m: stash[int(m.group(1))], text)

    def heading_id(self, text):
        base = slugify(text)
        hid, n = base, 2
        while hid in self.ids:
            hid, n = f"{base}-{n}", n + 1
        self.ids.add(hid)
        return hid

    def render(self, body, code_block):
        lines = body.split("\n")
        out = []
        i = 0
        while i < len(lines):
            line = lines[i]
            if not line.strip():
                i += 1
                continue
            m = FENCE.match(line)
            if m:
                lang, code = m.group(1), []
                i += 1
                while i < len(lines) and not lines[i].startswith("```"):
                    code.append(lines[i])
                    i += 1
                if i >= len(lines):
                    raise DocError(f"{self.source}: unterminated code fence")
                i += 1
                out.append(code_block(lang, "\n".join(code)))
                continue
            m = HEADING.match(line)
            if m:
                level, text = len(m.group(1)), m.group(2)
                hid = self.heading_id(text)
                if level == 2:
                    self.toc.append((hid, re.sub(r"`", "", text)))
                out.append(
                    f'<h{level} id="{hid}"><a class="anchor" href="#{hid}">'
                    f"{self.inline(text)}</a></h{level}>"
                )
                i += 1
                continue
            if line.strip() == "---":
                out.append("<hr>")
                i += 1
                continue
            if line.startswith(">"):
                quote = []
                while i < len(lines) and lines[i].startswith(">"):
                    quote.append(lines[i][1:].strip())
                    i += 1
                out.append(f'<aside class="note"><p>{self.inline(" ".join(quote))}</p></aside>')
                continue
            if "|" in line and i + 1 < len(lines) and TABLE_SEP.match(lines[i + 1].strip()):
                rows = []
                while i < len(lines) and "|" in lines[i]:
                    rows.append([c.strip() for c in lines[i].strip().strip("|").split("|")])
                    i += 1
                head, body_rows = rows[0], rows[2:]
                th = "".join(f"<th>{self.inline(c)}</th>" for c in head)
                trs = "".join(
                    "<tr>" + "".join(f"<td>{self.inline(c)}</td>" for c in r) + "</tr>"
                    for r in body_rows
                )
                out.append(
                    f'<div class="scroll"><table class="kv"><tr>{th}</tr>{trs}</table></div>'
                )
                continue
            for pattern, tag in ((BULLET, "ul"), (NUMBERED, "ol")):
                if pattern.match(line):
                    items = []
                    while i < len(lines) and pattern.match(lines[i]):
                        item = [pattern.match(lines[i]).group(1)]
                        i += 1
                        while (
                            i < len(lines)
                            and lines[i].startswith("  ")
                            and not pattern.match(lines[i])
                        ):
                            item.append(lines[i].strip())
                            i += 1
                        items.append(f"<li>{self.inline(' '.join(item))}</li>")
                    out.append(f"<{tag}>{''.join(items)}</{tag}>")
                    break
            else:
                para = []
                while (
                    i < len(lines)
                    and lines[i].strip()
                    and not FENCE.match(lines[i])
                    and not HEADING.match(lines[i])
                    and not BULLET.match(lines[i])
                    and not NUMBERED.match(lines[i])
                    and not lines[i].startswith(">")
                ):
                    para.append(lines[i].strip())
                    i += 1
                out.append(f"<p>{self.inline(' '.join(para))}</p>")
        return "\n".join(out)
