/**
 * Generates promo/examples.json by running the real engine.
 * Every string shown on the promo page and in the READMEs comes from here —
 * nothing is hand-written, so the docs cannot drift from the implementation.
 *
 *   npx tsx brand/tools/gen_examples.ts
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { transform } from "polytypo";

const LOCALES = [
  "en-US",
  "en-GB",
  "de-DE",
  "de-CH",
  "fr",
  "fr-CA",
  "ru",
  "fi",
  "sv",
  "el",
  "es",
  "it",
  "pt-PT",
  "pt-BR",
  "nl",
  "pl",
  "uk",
  "cs",
  "tr",
  "sk",
  "ro",
  "hu",
  "bg",
  "hr",
  "sr",
  "sl",
] as const;

// Every hero line: nested quotes, an apostrophe or elision (except el — see its own note below),
// an ellipsis, a spaced dash, and a symbols cluster ((c)/x). Deliberately NOT a question-and-
// answer about the library's own name (the previous version read too close to Artemiy Lebedev's
// "Typograf", the best-known tool in this exact space) and deliberately free of any year that
// reads as a war reference — 1914-1918 and 1939/1941-1945 both did, across three different
// locales' hero lines, and a distance/print-size pair shows the same rules without either
// reading. Translations beyond en/de/fr are a good-faith draft, not a native-speaker-reviewed one.
const HERO: Record<(typeof LOCALES)[number], string> = {
  "en-US":
    `She asked, "Isn't this the shop they call 'round the corner'?" ... We'd walked - nearly 3 ` +
    `km - just to find it closed. Copyright (c) 2026; the print measures 40x60 cm.`,
  "en-GB":
    `She asked, "Isn't this the shop they call 'round the corner'?" ... We'd walked - nearly 3 ` +
    `km - just to find it closed. Copyright (c) 2026; the print measures 40x60 cm.`,
  "de-DE":
    `Sie fragte: "Ist das nicht der Laden namens 'an der Ecke'?" ... Wir liefen -- fast 3 km -- ` +
    `und fanden ihn leider geschlossen. Copyright (c) 2026, Format 40x60 cm, z. B. für Poster.`,
  "de-CH":
    `Sie fragte: "Ist das nicht der Laden namens 'an der Ecke'?" ... Wir liefen -- fast 3 km -- ` +
    `und fanden ihn leider geschlossen. Copyright (c) 2026, Format 40x60 cm, z. B. für Poster.`,
  fr:
    `Elle a dit : "Ce n'est pas la librairie qu'on appelle 'le coin', si ?" ... On a marché - ` +
    `presque 3 km - pour la trouver fermée. Copyright (c) 2026 ; le tirage fait 40x60 cm.`,
  "fr-CA":
    `Elle a dit : "Ce n'est pas la librairie qu'on appelle 'le coin', si ?" ... On a marché - ` +
    `presque 3 km - pour la trouver fermée. Copyright (c) 2026 ; le tirage fait 40x60 cm.`,
  ru:
    `Она спросила: "Это не тот магазинчик, который называют 'за углом'?" ... Мы прошли - почти ` +
    `3 км - и нашли его закрытым, а что-то достали из-под прилавка. Copyright (c) 2026, формат 40x60 см.`,
  fi:
    `Hän kysyi: "Eikö tämä ole se 'nurkan' kirjakauppa?" ... Kävelimme - lähes 3 km - ja ` +
    `löysimme sen kiinni. Copyright (c) 2026; tulosteen koko on 40x60 cm, hinta nousi 10,5 %.`,
  sv:
    `Hon frågade: "Är det inte affären i 'hörnet'?" ... Vi gick - nästan 3 km - och hittade den ` +
    `stängd. Copyright (c) 2026; trycket mäter 40x60 cm och kostar 10,5 % mer.`,
  // No straight apostrophe in the Greek hero line, and that is deliberate: Greek elision
  // inside a straight-quoted span is the known-wrong case pinned by the fixture
  // el-quotes-elision-swallowed-by-straight-quote-known-wrong (quotes.md 7.1). The promo page shows what
  // the library does well; the defect belongs in the conformance suite, not in the shop window.
  el:
    `Ρώτησε: "Δεν είναι αυτό το μαγαζί 'στη γωνία';" ... Περπατήσαμε -- σχεδόν 3 χλμ -- και το ` +
    `βρήκαμε κλειστό. Copyright (c) 2026, μέγεθος 40x60 cm.`,
  es:
    `Preguntó: "¿No es esta la tienda que llaman 'la de la esquina'?" ... Caminamos -- casi 3 ` +
    `km -- y estaba cerrada. Copyright (c) 2026, tamaño 40x60 cm.`,
  uk:
    `Він запитав: "Хіба це не та крамниця, яку називають 'тією за рогом'?" ... Ми йшли -- майже ` +
    `3 км -- а вона була зачинена. Copyright (c) 2026, формат 40x60 см.`,
  cs:
    `Zeptal se: "Není to ten obchod, kterému říkají 'ten za rohem'?" ... Šli jsme -- skoro 3 km ` +
    `-- a byl zavřený. Copyright (c) 2026, formát 40x60 cm.`,
  tr:
    `Sordu: "Bu, 'köşedeki' dedikleri dükkân değil mi?" ... Ankara'da neredeyse 3 km yürüdük -- ` +
    `ve kapalıydı. Copyright (c) 2026, baskı 40x60 cm.`,
  sk:
    `Spýtal sa: "Nie je to ten obchod, ktorému hovoria 'ten za rohom'?" ... Išli sme -- takmer 3 km ` +
    `-- a bol zatvorený. Copyright (c) 2026, formát 40x60 cm.`,
  ro:
    `Ea a întrebat: "Nu e acesta magazinul pe care îl numesc 'de la colț'?" ... Am mers -- aproape 3 km ` +
    `-- și era închis. Copyright (c) 2026, format 40x60 cm.`,
  hu:
    `Megkérdezte: "Nem ez az a bolt, amit 'a sarki'-nak hívnak?" ... Mentünk -- majdnem 3 km-t -- ` +
    `és zárva volt. Copyright (c) 2026, 40x60 cm.`,
  bg:
    `Тя попита: "Не е ли това магазинът, който наричат 'на ъгъла'?" ... Вървяхме - почти 3 км - и беше ` +
    `затворен. Copyright (c) 2026, формат 40x60 см.`,
  hr:
    `Pitala je: "Nije li to dućan koji zovu 'onaj na uglu'?" ... Hodali smo -- gotovo 3 km -- i bio je ` +
    `zatvoren. Copyright (c) 2026, format 40x60 cm.`,
  sr:
    `Питала је: "Није ли то продавница коју зову 'она на углу'?" ... Ходали смо - скоро 3 км - и била је ` +
    `затворена. Copyright (c) 2026, формат 40x60 цм.`,
  sl:
    `Vprašala je: "Ali ni to trgovina, ki ji pravijo 'tista za vogalom'?" ... Hodili smo - skoraj 3 km - in ` +
    `bila je zaprta. Copyright (c) 2026, format 40x60 cm.`,
  nl:
    `Hij vroeg: "Is dit niet de winkel die ze 'om de hoek' noemen?" ... We liepen -- bijna 3 km ` +
    `-- en hij was dicht. Copyright (c) 2026, formaat 40x60 cm.`,
  pl:
    `Zapytał: "Czy to nie ten sklep, który nazywają 'tym za rogiem'?" ... Szliśmy -- prawie 3 km ` +
    `-- a był zamknięty. Copyright (c) 2026, format 40x60 cm.`,
  "pt-PT":
    `Perguntou: "Não é esta a loja a que chamam 'a da esquina'?" ... Caminhámos -- quase 3 km ` +
    `-- e estava fechada. Copyright (c) 2026, formato 40x60 cm.`,
  "pt-BR":
    `Perguntou: "Não é esta a loja que chamam de 'a da esquina'?" ... Caminhamos -- quase 3 km ` +
    `-- e estava fechada. Copyright (c) 2026, formato 40x60 cm.`,
  it:
    `Ha chiesto: "Non è questo il negozio che chiamano 'quello all'angolo'?" ... Abbiamo camminato ` +
    `-- quasi 3 km -- ed era chiuso. Copyright (c) 2026, formato 40x60 cm.`,
};

// `rules` is passed to transform() as given, and recorded next to the case, so a case for a rule
// that is off by default (`ranges`) shows the option it was generated with.
const SHOWCASE: Record<
  (typeof LOCALES)[number],
  Array<{ rule: string; in: string; rules?: Record<string, boolean> }>
> = {
  "en-US": [
    { rule: "quotes", in: `"He said 'no' to me," she noted.` },
    { rule: "dashes", in: `The plan - if there is one - fails.` },
    { rule: "dashes", in: `chapters 3-5 and pp. 34-36` },
    { rule: "ranges", in: `chapters 3-5 and pp. 34-36`, rules: { ranges: true } },
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
    { rule: "dashes", in: `Die Jahre 2019-2023` },
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
  "fr-CA": [
    { rule: "quotes", in: `Il a dit "bonjour".` },
    { rule: "dashes", in: `Le plan - il existe - échoue.` },
    { rule: "nbsp", in: `Ça va? Bonjour!` },
    { rule: "nbsp", in: `Rendez-vous à 15 h: bureau 204.` },
  ],
  ru: [
    { rule: "quotes", in: `Он сказал: "это 'моё' дело".` },
    { rule: "dashes", in: `Москва - столица` },
    { rule: "dashes", in: `Годы 2019-2023 были насыщенными` },
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
  uk: [
    { rule: "quotes", in: `Він сказав: "Це мій Кобзар".` },
    { rule: "ellipsis", in: `а щоб селяни?...` },
    { rule: "hyphen", in: `з-під столу і будь-хто` },
  ],
  cs: [
    { rule: "quotes", in: `Řekl "ahoj".` },
    { rule: "nbsp", in: `v Plzni a u babičky` },
    { rule: "dashes", in: `Tato kniha - vydaná před válkou - je úžasná.` },
  ],
  tr: [
    { rule: "quotes", in: `Sordu: "Bu, 'köşedeki' dükkân mı?"` },
    { rule: "apostrophe", in: `TBMM'nin kararı 1985'te açıklandı.` },
    { rule: "ellipsis", in: `Nasıl da akşam oldu?...` },
    { rule: "nbsp", in: `15 °C ve 20 kg` },
  ],
  sk: [
    { rule: "quotes", in: `Povedal "ahoj".` },
    { rule: "nbsp", in: `v bode č. 2 a na s. 5` },
    { rule: "dashes", in: `Táto kniha - vydaná pred vojnou - je skvelá.` },
  ],
  ro: [
    { rule: "quotes", in: `Ea a spus "da".` },
    { rule: "dashes", in: `Cartea - apărută înainte de război - e excelentă.` },
    { rule: "nbsp", in: `la art. 5 și 3 kg` },
  ],
  hu: [
    { rule: "quotes", in: `Azt mondta "szia".` },
    { rule: "dashes", in: `A könyv - amely a háború előtt jelent meg - kiváló.` },
    { rule: "nbsp", in: `5 kg és 20 °C` },
  ],
  bg: [
    { rule: "quotes", in: `Той каза "здравей".` },
    { rule: "dashes", in: `Книгата - издадена преди войната - е чудесна.` },
    { rule: "nbsp", in: `100 км и 5 кг` },
  ],
  hr: [
    { rule: "quotes", in: `Rekao je "bok".` },
    { rule: "dashes", in: `Knjiga - objavljena prije rata - je izvrsna.` },
    { rule: "nbsp", in: `3 kg i 50 %` },
  ],
  sr: [
    { rule: "quotes", in: `Рекао је "здраво".` },
    { rule: "dashes", in: `Књига - објављена пре рата - је одлична.` },
    { rule: "ranges", in: `рат 1941-1945`, rules: { ranges: true } },
  ],
  sl: [
    { rule: "quotes", in: `Rekel je "zdravo".` },
    { rule: "dashes", in: `Knjiga - izdana pred vojno - je odlična.` },
    { rule: "nbsp", in: `3 kg in 50 %` },
  ],
  nl: [
    { rule: "quotes", in: `Hij zei "dag" en vertrok.` },
    { rule: "dashes", in: `Het nieuws - volgens de kranten - is niet bekend.` },
    { rule: "nbsp", in: `De vaas kostte € 179.` },
  ],
  pl: [
    { rule: "quotes", in: `Powiedział "dzień dobry".` },
    { rule: "nbsp", in: `Mieszkam w Warszawie i pracuję.` },
    { rule: "ellipsis", in: `Czekaj... co?` },
  ],
  "pt-PT": [
    { rule: "quotes", in: `Ele disse "bom dia" e saiu.` },
    { rule: "dashes", in: `As condições - ordenado e subvenções - eram boas.` },
    { rule: "nbsp", in: `7 % do volume de negócios` },
  ],
  "pt-BR": [
    { rule: "quotes", in: `Ele disse "bom dia" e saiu.` },
    { rule: "dashes", in: `O controle - meta prioritária - será rigoroso.` },
    { rule: "ellipsis", in: `Espere... o quê?` },
  ],
  es: [
    { rule: "quotes", in: `Ha dicho "buenos días" y salió.` },
    { rule: "nbsp", in: `El Sr. Pérez aprobó un 8 % de los alumnos` },
    { rule: "ellipsis", in: `Espera... ¿qué?` },
    { rule: "symbols", in: `Resolución 1920x1080` },
  ],
  it: [
    { rule: "quotes", in: `Ha detto "buongiorno" ed è uscito.` },
    { rule: "dashes", in: `La casa - se casa era - sorgeva ai piedi del colle.` },
    { rule: "apostrophe", in: `un'utopia e dell'Unione` },
    { rule: "nbsp", in: `il regolamento n. 3600 e un aumento del 45 %` },
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

// The home/manifesto "proof" grid runs this ONE input string through every selected locale, so
// the only thing that varies card-to-card is the locale's own convention, not the sentence. Same
// literal sentence as HERO["en-US"] above — nested quotes, a straight spaced hyphen, an ellipsis
// and a symbols cluster all in one place, so the engine has to choose a quote style (including
// nesting), a dash style, and spacing, not just one of those. Verified by running this exact
// string through every PROOF_LOCALES entry below: en-US produces a tight (unspaced) em dash,
// de-DE a spaced en dash, fr/ru a spaced em dash — with fr additionally showing NBSP-guillemet
// spacing (space before "?") that ru's guillemets don't get, and each locale nesting the two
// quote levels in its own pairing rather than reusing one universal style.
const PROOF_INPUT =
  `She asked, "Isn't this the shop they call 'round the corner'?" ... We'd walked - nearly 3 ` +
  `km - just to find it closed. Copyright (c) 2026; the print measures 40x60 cm.`;

const NAMES: Record<(typeof LOCALES)[number], string> = {
  "en-US": "English (US)",
  "en-GB": "English (UK)",
  "de-DE": "German",
  "de-CH": "Swiss German",
  fr: "French (France)",
  "fr-CA": "French (Canada)",
  ru: "Russian",
  fi: "Finnish",
  sv: "Swedish",
  el: "Greek",
  es: "Spanish",
  it: "Italian",
  nl: "Dutch",
  pl: "Polish",
  uk: "Ukrainian",
  cs: "Czech",
  tr: "Turkish",
  sk: "Slovak",
  ro: "Romanian",
  hu: "Hungarian",
  bg: "Bulgarian",
  hr: "Croatian",
  sr: "Serbian",
  sl: "Slovenian",
  "pt-PT": "Portuguese (Portugal)",
  "pt-BR": "Portuguese (Brazil)",
};

// Single source of truth for which locales the home/manifesto "proof grid" renders — read by
// brand/tools/build_promo.py (proof_grid()) from the `proofLocales` field below, so the builder
// never maintains its own parallel list that could silently drift from what's actually generated,
// and by home.body.html/manifesto.body.html's own prose paragraph, which must name exactly this
// set (build() has no mechanism to check that by itself — it's a manual pairing to keep honest).
//
// Verified by running this exact PROOF_INPUT through all ten locales: fi and sv render
// byte-identical output for this specific sentence (both close with the same doubled ” ’ pair and
// the same spaced en dash), which the proof grid's own idempotency/distinctness tests would
// rightly fail on — so only one of that colliding pair may ever appear here. The six below are
// pairwise distinct for this input; re-verify for collisions if either PROOF_INPUT or this list
// ever changes.
const PROOF_LOCALES = ["en-US", "en-GB", "de-DE", "de-CH", "fr", "ru"] as const;

// Every list of locales is presented in one order: alphabetical by the spec's English locale name,
// then by code (brand/tools/locale_order.py is the same rule for the Python generators).
const specName = (code: string): string =>
  (
    JSON.parse(
      readFileSync(new URL(`../../spec/locales/${code}.json`, import.meta.url), "utf8"),
    ) as { name: string }
  ).name.toLowerCase();
const byLocaleOrder = (a: string, b: string): number =>
  specName(a) < specName(b) ? -1 : specName(a) > specName(b) ? 1 : a < b ? -1 : a > b ? 1 : 0;

const specVersion = readFileSync(new URL("../../spec/VERSION", import.meta.url), "utf8").trim();

// A locale the spec has added but no published runtime implements yet is skipped here rather than
// crashing the build: the promo site and README describe what ships, never what sits unreleased on
// main, and every worked example on them is real output from the INSTALLED `polytypo` package. The
// locale reappears on its own, with no edit to this file, once the bumped devDependency knows it.
const supported = [...LOCALES].sort(byLocaleOrder).filter((locale) => {
  try {
    transform("", { locale });
    return true;
  } catch (error) {
    const code = (error as { code?: string }).code;
    if (code !== "POLYTYPO_UNKNOWN_LOCALE") throw error;
    console.log(`  skipping ${locale}: not in the installed engine yet (unreleased spec locale)`);
    return false;
  }
});

const data = {
  spec: specVersion,
  proofLocales: [...PROOF_LOCALES].sort(byLocaleOrder),
  locales: supported.map((locale) => ({
    locale,
    name: NAMES[locale],
    hero: { in: HERO[locale], out: transform(HERO[locale], { locale }) },
    proof: { in: PROOF_INPUT, out: transform(PROOF_INPUT, { locale }) },
    cases: SHOWCASE[locale].map((c) => ({
      rule: c.rule,
      ...(c.rules ? { rules: c.rules } : {}),
      in: c.in,
      out: transform(c.in, { locale, ...(c.rules ? { rules: c.rules } : {}) }),
    })),
  })),
};

const out = new URL("../../promo/examples.json", import.meta.url);
writeFileSync(out, JSON.stringify(data, null, 2) + "\n", "utf8");
console.log(`wrote ${out.pathname} — ${data.locales.length} locales`);

// ---------------------------------------------------------------------------------------------
// promo/locale-examples.json — the data behind /locales/<code>/. Inputs are the spec's own
// conformance fixtures (cited, reviewed cases), so no sentence on a locale page is typed for the
// page; outputs are the installed engine's. A fixture whose recorded `out` differs from what the
// installed engine returns is dropped and counted, never shown, so a page cannot display a result
// the spec does not stand behind.
// ---------------------------------------------------------------------------------------------
type Fixture = {
  id: string;
  rule?: string;
  mode?: string;
  in?: string;
  out?: string;
  rules?: Record<string, boolean>;
  narrowNbsp?: "nbsp" | "narrow";
  throws?: string;
  dialect?: string;
  keys?: string[];
};

const PER_RULE = 3;
const MAX_INPUT_LENGTH = 110;

const NEIGHBOUR: Partial<Record<(typeof LOCALES)[number], (typeof LOCALES)[number]>> = {
  "de-DE": "de-CH",
  "de-CH": "de-DE",
  "en-US": "en-GB",
  "en-GB": "en-US",
  fr: "fr-CA",
  "fr-CA": "fr",
  "pt-PT": "pt-BR",
  "pt-BR": "pt-PT",
};

// Neutral code carrier for the mode demonstration: the same straight-quoted, dashed, dotted run
// that the prose carries, placed where each document mode must leave it alone.
const CODE_RUN = `say("a -- b ...")`;

function modeInputs(prose: string): Record<string, string> {
  return {
    text: `${prose}\n${CODE_RUN}`,
    html: `<p>${prose}</p>\n<pre><code>${CODE_RUN}</code></pre>`,
    markdown: `${prose}\n\n\`${CODE_RUN}\``,
  };
}

function modeOptions(mode: string): Record<string, string> {
  return mode === "markdown" ? { mode, dialect: "commonmark" } : { mode };
}

const resolutionCases = (
  JSON.parse(
    readFileSync(new URL("../../spec/fixtures/locale-resolution.json", import.meta.url), "utf8"),
  ) as {
    cases: Array<{ id: string; tag: string; resolves?: string }>;
  }
).cases;

const localeExamples: Record<string, unknown> = {};
for (const locale of supported) {
  const fixturePath = new URL(`../../spec/fixtures/${locale}.json`, import.meta.url);
  const fixtures = existsSync(fixturePath)
    ? (JSON.parse(readFileSync(fixturePath, "utf8")) as { cases: Fixture[] }).cases
    : [];
  const byRule: Record<string, unknown[]> = {};
  let disagreed = 0;
  for (const c of fixtures) {
    if (c.mode !== "text" || c.throws || c.dialect || c.keys) continue;
    if (c.in === undefined || c.out === undefined || c.rule === undefined) continue;
    if (c.in === c.out || c.in.length > MAX_INPUT_LENGTH || c.id.includes("known-wrong")) continue;
    const list = (byRule[c.rule] ??= []);
    if (list.length >= PER_RULE) continue;
    const options = {
      locale,
      ...(c.rules ? { rules: c.rules } : {}),
      ...(c.narrowNbsp !== undefined ? { narrowNbsp: c.narrowNbsp } : {}),
    };
    const out = transform(c.in, options);
    if (out !== c.out) {
      disagreed += 1;
      continue;
    }
    list.push({
      id: c.id,
      in: c.in,
      out,
      ...(c.rules ? { rules: c.rules } : {}),
      ...(c.narrowNbsp !== undefined ? { narrowNbsp: c.narrowNbsp } : {}),
    });
  }

  const modes = Object.entries(modeInputs(HERO[locale])).map(([mode, input]) => ({
    mode,
    in: input,
    out: transform(input, { locale, ...modeOptions(mode) }),
  }));

  const neighbour = NEIGHBOUR[locale];
  const compare = neighbour
    ? {
        neighbour,
        in: HERO[locale],
        out: transform(HERO[locale], { locale }),
        neighbourOut: transform(HERO[locale], { locale: neighbour }),
      }
    : null;

  // Only tags the installed engine accepts are listed, each with the output of one probe so a
  // page shows that the tag and its resolved locale agree.
  const resolution = resolutionCases
    .filter((r) => r.resolves === locale)
    .filter((r) => {
      try {
        return transform(HERO[locale], { locale: r.tag }) === transform(HERO[locale], { locale });
      } catch {
        return false;
      }
    })
    .map((r) => r.tag);

  localeExamples[locale] = { byRule, modes, compare, resolution, disagreed };
}

const localeOut = new URL("../../promo/locale-examples.json", import.meta.url);
writeFileSync(
  localeOut,
  JSON.stringify({ spec: specVersion, locales: localeExamples }, null, 2) + "\n",
  "utf8",
);
console.log(`wrote ${localeOut.pathname}`);
