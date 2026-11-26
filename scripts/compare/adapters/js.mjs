// Runs the corpus through the JavaScript tools. Executed from the temporary install directory.
import fs from "node:fs";
import { transform } from "polytypo";
import Typograf from "typograf";
import smartquotes from "smartquotes";
import smartypants from "smartypants";
import MarkdownIt from "markdown-it";
import { retext } from "retext";
import retextSmartypants from "retext-smartypants";
import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import remarkSmartypants from "remark-smartypants";
import remarkStringify from "remark-stringify";

const cases = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
const tgLocale = { "en-US": "en-US", "de-CH": "de", fr: "fr", ru: "ru" };
const english = (c) => c.locale === "en-US";
const md = new MarkdownIt({ html: true, typographer: true });
const rt = retext().use(retextSmartypants);
const rm = unified().use(remarkParse).use(remarkGfm).use(remarkSmartypants).use(remarkStringify);

// each tool: which cases it is documented to handle, and how to run one pass
const tools = {
  polytypo: {
    applies: () => true,
    run: async (c, s) =>
      transform(s, {
        locale: c.locale,
        mode: c.format,
        ...(c.format === "markdown" ? { dialect: "commonmark" } : {}),
      }),
  },
  typograf: {
    applies: (c) => c.format !== "markdown",
    run: async (c, s) => new Typograf({ locale: [tgLocale[c.locale]] }).execute(s),
  },
  smartquotes: {
    applies: (c) => c.format !== "markdown" && english(c),
    run: async (c, s) => smartquotes.string(s),
  },
  smartypants: {
    applies: (c) => c.format !== "markdown" && english(c),
    run: async (c, s) => smartypants(s, "1"),
  },
  "retext-smartypants": {
    applies: (c) => c.format === "text" && english(c),
    run: async (c, s) => String(await rt.process(s)),
  },
  "remark-smartypants": {
    applies: (c) => c.format === "markdown",
    run: async (c, s) => String(await rm.process(s)),
  },
  "markdown-it": {
    applies: (c) => c.format === "markdown",
    run: async (c, s) => md.render(s),
    html: true,
  },
};

const out = { versions: {}, results: {} };
for (const [name, t] of Object.entries(tools)) {
  out.results[name] = { html: Boolean(t.html), cases: {} };
  for (const c of cases) {
    if (!t.applies(c)) continue;
    try {
      const once = await t.run(c, c.input);
      const twice = t.html ? null : await t.run(c, once);
      out.results[name].cases[c.id] = { once, twice };
    } catch (e) {
      out.results[name].cases[c.id] = { error: String(e.message).slice(0, 120) };
    }
  }
}
fs.writeFileSync(process.argv[3], JSON.stringify(out));
