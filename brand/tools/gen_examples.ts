/**
 * Generates promo/examples.json by running the real engine.
 * Every string shown on the promo page and in the READMEs comes from here —
 * nothing is hand-written, so the docs cannot drift from the implementation.
 *
 *   npx tsx brand/tools/gen_examples.ts
 */
import { writeFileSync } from "node:fs";
import { transform } from "../../src/index.js";

const LOCALES = ["en-US", "en-GB", "de-DE", "de-CH", "fr", "ru", "fi", "sv", "el"] as const;

const HERO: Record<string, string> = {
  "en-US":
    `Is this "polytypo"? - No, it's "polytypo"! She said, "He replied 'never' twice"... ` +
    `The release - all 5 km of it - covers 1914-1918. Copyright (c) 2026, at 1920x1080.`,
  "en-GB":
    `Is this "polytypo"? - No, it's "polytypo"! She said, "He replied 'never' twice"... ` +
    `The release - all 5 km of it - covers 1914-1918. Copyright (c) 2026, at 1920x1080.`,
  "de-DE":
    `Ist das "polytypo"? - Nein, das ist "polytypo"! Sie sagte: "Er hat 'nie' geantwortet"... ` +
    `Die Ausgabe - z. B. die Jahre 1939-1945 - erscheint in 1920x1080. Copyright (c) 2026.`,
  "de-CH":
    `Ist das "polytypo"? - Nein, das ist "polytypo"! Sie sagte: "Er hat 'nie' geantwortet"... ` +
    `Die Ausgabe - z. B. die Jahre 1939-1945 - erscheint in 1920x1080. Copyright (c) 2026.`,
  fr:
    `C'est "polytypo" ? - Non, c'est "polytypo" ! Elle a dit : "Il a répondu 'jamais'"... ` +
    `L'édition - celle de l'été - fait 3x5 cm ; c'est tout. Copyright (c) 2026.`,
  ru:
    `Это "полиштамп"? - Нет, это "полиштамп"! Она сказала: "он ответил 'никогда'"... ` +
    `Достал из-под стола - в 1941-1945 годах - размер 10 x 20 см. Все права защищены (c) 2026.`,
  fi:
    `Onko tämä "polytypo"? - Ei, tämä on "polytypo"! Hän sanoi: "hän vastasi 'ei koskaan'"... ` +
    `Matkaa on 20 km - vuosina 1914-1918 - ja hinta nousi 10,5 %. Copyright (c) 2026.`,
  sv:
    `Är det här "polytypo"? - Nej, det är "polytypo"! Hon sa: "han svarade 'aldrig'"... ` +
    `Vi gick 5 km - åren 1914-1918 - och det kostar 100 kr. Copyright (c) 2026.`,
  // No straight apostrophe in the Greek hero line, and that is deliberate: Greek elision
  // inside a straight-quoted span is the known-wrong case pinned by the fixture
  // el-quotes-elision-swallowed-by-straight-quote-known-wrong (quotes.md 7.1). The promo page shows what
  // the library does well; the defect belongs in the conformance suite, not in the shop window.
  el:
    `Είναι αυτό "polytypo"; - Όχι, αυτό είναι "polytypo"! Είπε: "απάντησε “ποτέ”"... ` +
    `Η έκδοση - όλα τα 25-45 άτομα - καλύπτει 1989-1991. Copyright (c) 2026, σε 1920x1080.`,
};

const SHOWCASE: Record<string, Array<{ rule: string; in: string }>> = {
  "en-US": [
    { rule: "quotes", in: `"He said 'no' to me," she noted.` },
    { rule: "dashes", in: `The plan - if there is one - fails.` },
    { rule: "dashes", in: `1914-1918 and pp. 34-36` },
    { rule: "ellipsis", in: `Wait... what?` },
    { rule: "apostrophe", in: `don't` },
    { rule: "nbsp", in: `It is 20 km to the coast` },
    { rule: "symbols", in: `Copyright (c) 2026, 1920x1080` },
  ],
  "en-GB": [
    { rule: "quotes", in: `"He said 'no' to me," she noted.` },
    { rule: "dashes", in: `The plan - if there is one - fails.` },
    { rule: "ellipsis", in: `Wait... what?` },
    { rule: "nbsp", in: `It is 20 km to the coast` },
  ],
  "de-DE": [
    { rule: "quotes", in: `"Er sagte 'nein' zu mir", notierte sie.` },
    { rule: "dashes", in: `Der Plan--falls es einen gibt--scheitert.` },
    { rule: "dashes", in: `Die Jahre 1939-1945` },
    { rule: "nbsp", in: `z. B. Berlin` },
    { rule: "symbols", in: `Auflösung 1920x1080` },
  ],
  "de-CH": [
    { rule: "quotes", in: `"Er sagte 'nein' zu mir", notierte sie.` },
    { rule: "dashes", in: `Der Plan--falls es einen gibt--scheitert.` },
    { rule: "nbsp", in: `z. B. Bern` },
  ],
  fr: [
    { rule: "quotes", in: `Il a dit "bonjour".` },
    { rule: "quotes", in: `"Il a dit 'oui' hier."` },
    { rule: "nbsp", in: `Ça va ? Bonjour !` },
    { rule: "dashes", in: `Le plan - il existe - échoue.` },
    { rule: "apostrophe", in: `l'été et l'hiver` },
  ],
  ru: [
    { rule: "quotes", in: `Он сказал: "это 'моё' дело".` },
    { rule: "dashes", in: `Москва - столица` },
    { rule: "dashes", in: `Годы 1941-1945 были тяжёлыми` },
    { rule: "hyphen", in: `Достал из-под стола` },
    { rule: "ellipsis", in: `Что?...` },
    { rule: "nbsp", in: `Он живёт в Москве` },
  ],
  fi: [
    { rule: "quotes", in: `"Hän sanoi 'moi'", totesin.` },
    { rule: "dashes", in: `Suunnitelma - jos sellainen on - kaatuu.` },
    { rule: "nbsp", in: `Hinta nousi 10,5 %` },
  ],
  sv: [
    { rule: "quotes", in: `"Han sa 'hej'", sa jag.` },
    { rule: "dashes", in: `Planen - om det finns en - misslyckas.` },
    { rule: "nbsp", in: `Det kostar 100 kr` },
  ],
  el: [
    { rule: "quotes", in: `Είπε "καλημέρα" και έφυγε.` },
    { rule: "quotes", in: `"Είπε “όχι” σε μένα", σημείωσε.` },
    { rule: "apostrophe", in: `γι' αυτό και απ' την αρχή` },
    { rule: "spaces", in: `Τι κάνεις ;` },
    { rule: "ellipsis", in: `Περίμενε... τι έγινε` },
    { rule: "symbols", in: `Ανάλυση 1920x1080` },
  ],
};

const NAMES: Record<string, string> = {
  "en-US": "English (US)",
  "en-GB": "English (UK)",
  "de-DE": "German",
  "de-CH": "Swiss German",
  fr: "French",
  ru: "Russian",
  fi: "Finnish",
  sv: "Swedish",
  el: "Greek",
};

const data = {
  spec: "0.1.0",
  locales: LOCALES.map((locale) => ({
    locale,
    name: NAMES[locale],
    hero: { in: HERO[locale], out: transform(HERO[locale], { locale }) },
    cases: SHOWCASE[locale].map((c) => ({
      rule: c.rule,
      in: c.in,
      out: transform(c.in, { locale }),
    })),
  })),
};

const out = new URL("../../promo/examples.json", import.meta.url);
writeFileSync(out, JSON.stringify(data, null, 2) + "\n", "utf8");
console.log(`wrote ${out.pathname} — ${data.locales.length} locales`);
