// Renders Markdown with markdown-it so the runner can tell whether a link or image survived.
import fs from "node:fs";
import MarkdownIt from "markdown-it";

const md = new MarkdownIt({ html: true });
const input = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
fs.writeFileSync(
  process.argv[3],
  JSON.stringify(Object.fromEntries(Object.entries(input).map(([k, v]) => [k, md.render(v)]))),
);
