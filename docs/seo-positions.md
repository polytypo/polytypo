# Google positions and semantic core of polytypo.dev

Internal. Organic results of `polytypo.dev` only (exact host and subdomains), via serper.dev. Every market is one `gl`/`hl` pair sent in every request. A phrase is looked up page by page up to page 3; `31+` means the site is not on the first three pages. Volumes are the 12-month average monthly searches from Google Keyword Planner (`generateKeywordHistoricalMetrics`, exact phrase, close variants merged, measured 26.11.2026); `10` is Planner's floor (1–10), `0` means no demand shown. Baseline run: 26.11.2026, 299 market-phrase lookups, 845 Serper credits.

Product is free and open source, so there is no commercial intent: a phrase is valuable by fit with what the site already answers. Content is not expanded: every phrase maps to an **existing** page, otherwise it is recorded under Gaps. The core was built and tracked in one pass on the operator's instruction (the approval gate of the playbook was waived by the task).

Intents: **reference** (what is the rule in locale X), **problem** (how do I fix this in HTML/text), **library** (find a typography package), **tool** (convert quotes now), **brand**.

## Markets

| Market | gl / hl | Planner geo / language | Why |
|---|---|---|---|
| US | us/en | 2840 / 1000 | English phrases (library and problem intents are worldwide, wording and volume differ by country) |
| GB | gb/en | 2826 / 1000 | English phrases (library and problem intents are worldwide, wording and volume differ by country) |
| CA | ca/en | 2124 / 1000 | English phrases (library and problem intents are worldwide, wording and volume differ by country) |
| AU | au/en | 2036 / 1000 | English phrases (library and problem intents are worldwide, wording and volume differ by country) |
| IN | in/en | 2356 / 1000 | English phrases (library and problem intents are worldwide, wording and volume differ by country) |
| DE | de/de | 2276 / 1001 | Local-language demand for the `de-DE` locale page |
| FR | fr/fr | 2250 / 1002 | Local-language demand for the `fr` locale page |
| RU | ru/ru | not targetable | Local-language demand for the `ru` locale page; Google Ads cannot target Russia, so volume is unavailable (positions only) |
| FI | fi/fi | 2246 / 1011 | Local-language demand for the `fi` locale page |
| SE | se/sv | 2752 / 1015 | Local-language demand for the `sv` locale page |
| ES | es/es | 2724 / 1003 | Local-language demand for the `es` locale page |
| IT | it/it | 2380 / 1004 | Local-language demand for the `it` locale page |
| PL | pl/pl | 2616 / 1030 | Local-language demand for the `pl` locale page |
| NL | nl/nl | 2528 / 1010 | Local-language demand for the `nl` locale page |
| BR | br/pt | 2076 / 1014 | Local-language demand for the `pt-BR` locale page |
| UA | ua/uk | 2804 / 1036 | Local-language demand for the `uk` locale page |
| CZ | cz/cs | 2203 / 1021 | Local-language demand for the `cs` locale page |
| TR | tr/tr | 2792 / 1037 | Local-language demand for the `tr` locale page |

English tier A (volume ≥ 100 in some market) is tracked in all five English markets; tier B (intent fits, volume ≤ 50) in US and GB only. Local-language phrases: 3–4 per language (quotes, dash, no-break space, one extra), only to establish a baseline: **all locale pages are English**, so local-language queries have no matching page (see Gaps).

## English tier A (five markets)

| Phrase | Page | Intent | Searches/mo US / GB / CA / AU / IN | US 26.11.2026 | GB 26.11.2026 | CA 26.11.2026 | AU 26.11.2026 | IN 26.11.2026 |
|---|---|---|---|---:|---:|---:|---:|---:|
| em dash vs en dash | /docs/rules/dashes/ | reference | 22200 / 2900 / 2900 / 1900 / 1000 | 31+ | 31+ | 31+ | 31+ | 31+ |
| smartypants | / | library (ambiguous: vitamins) | 4400 / 880 / 480 / 260 / 320 | 31+ | 31+ | 31+ | 31+ | 31+ |
| curly quotes | /docs/rules/quotes/ | reference | 2900 / 720 / 320 / 210 / 1900 | 31+ | 31+ | 31+ | 31+ | 31+ |
| guillemets | /locales/fr/ | reference | 1900 / 590 / 14800 / 170 / 140 | 31+ | 31+ | 31+ | 31+ | 31+ |
| french quotation marks | /locales/fr/ | reference | 1900 / 480 / 2400 / 110 / 720 | 31+ | 31+ | 31+ | 31+ | 31+ |
| curly apostrophe | /docs/rules/apostrophe/ | reference | 1900 / 480 / 260 / 110 / 210 | 31+ | 31+ | 31+ | 31+ | 31+ |
| spanish quotation marks | /locales/es/ | reference | 1300 / 110 / 30 / 10 / 20 | 31+ | 31+ | 31+ | 31+ | 31+ |
| german quotation marks | /locales/de-DE/ | reference | 880 / 260 / 110 / 70 / 1000 | 31+ | 31+ | 31+ | 31+ | 31+ |
| em dash spacing | /docs/rules/dashes/ | reference | 880 / 70 / 50 / 20 / 720 | 31+ | 31+ | 31+ | 31+ | 31+ |
| non breaking space html | /docs/rules/nbsp/ | problem | 590 / 140 / 140 / 50 / 70 | 31+ | 31+ | 31+ | 31+ | 31+ |
| ellipsis character | /docs/rules/ellipsis/ | reference | 590 / 90 / 70 / 40 / 170 | 31+ | 31+ | 31+ | 31+ | 31+ |
| ellipsis spacing | /docs/rules/ellipsis/ | reference | 480 / 30 / 20 / 10 / 880 | 31+ | 31+ | 31+ | 31+ | 31+ |
| russian quotation marks | /locales/ru/ | reference | 320 / 40 / 30 / 20 / 480 | 31+ | 31+ | 31+ | 31+ | 31+ |
| typographic quotes | /docs/rules/quotes/ | reference | 140 / 90 / 20 / 10 / 110 | 31+ | 31+ | 31+ | 31+ | 31+ |
| italian quotation marks | /locales/it/ | reference | 140 / 20 / 10 / 10 / 170 | 31+ | 31+ | 31+ | 31+ | 31+ |
| greek quotation marks | /locales/el/ | reference | 110 / 10 / 10 / 10 / 70 | 26 | 31+ | 31+ | 31+ | 22 |

## English tier B (US, GB)

| Phrase | Page | Intent | Searches/mo US / GB / CA / AU / IN | US 26.11.2026 | GB 26.11.2026 |
|---|---|---|---|---:|---:|
| typography library | / | library | 20 / 10 / 10 / 10 / 10 | 31+ | 31+ |
| smart quotes html | /docs/modes/html/ | library | 20 / 10 / 10 / 10 / 10 | 31+ | 31+ |
| typogrify | / | library | 10 / 10 / 10 / 10 / 10 | 31+ | 31+ |
| remark smartypants | /docs/guides/remark-plugin/ | library | 10 / 10 / 10 / 10 / 10 | 31+ | 31+ |
| typography checker | /playground/ | library | 10 / 10 / 10 / 10 / 10 | 31+ | 31+ |
| typography npm | /docs/runtimes/javascript/ | library | 10 / 10 / 0 / 0 / 10 | 31+ | 31+ |
| typography library javascript | /docs/runtimes/javascript/ | library | 0 / 0 / 0 / 0 / 0 | 31+ | 31+ |
| typography library python | /docs/runtimes/python/ | library | 0 / 0 / 0 / 0 / 0 | 31+ | 31+ |
| smart quotes javascript | /docs/runtimes/javascript/ | library | 0 / 0 / 0 / 0 / 0 | 31+ | 31+ |
| smartypants alternative | / | library | 0 / 0 / 0 / 0 / 0 | 31+ | 31+ |
| typograf alternative | / | library | 0 / 0 / 0 / 0 / 0 | 31+ | 31+ |
| smart quotes library | / | library | 0 / 0 / 0 / 0 / 0 | 31+ | 31+ |
| remark typography | /docs/guides/remark-plugin/ | library | 0 / 0 / 0 / 0 / 0 | 26 | 31+ |
| typography fixer | /playground/ | library | 0 / 0 / 0 / 0 / 0 | 31+ | 31+ |
| typography linter | /playground/ | library | 0 / 0 / 0 / 0 / 0 | 31+ | 31+ |
| smart quotes python | /docs/runtimes/python/ | library | 0 / 0 / 0 / 0 / 0 | 31+ | 31+ |
| smart quotes ruby | /docs/runtimes/ruby/ | library | 0 / 0 / 0 / 0 / 0 | 31+ | 31+ |
| smart quotes php | /docs/runtimes/php/ | library | 0 / 0 / 0 / 0 / 0 | 31+ | 31+ |
| smart quotes go | /docs/runtimes/go/ | library | 0 / 0 / 0 / 0 / 0 | 31+ | 31+ |
| smart quotes markdown | /docs/modes/markdown/ | library | 0 / 0 / 0 / 0 / 0 | 31+ | 31+ |
| typography markdown | /docs/modes/markdown/ | library | 0 / 0 / 0 / 0 / 0 | 31+ | 31+ |
| typography mdx | /docs/guides/mdx-content/ | library | 0 / 0 / 0 / 0 / 0 | 11 | 31+ |
| french punctuation spacing | /locales/fr/ | problem | 10 / 10 / 10 / 10 / 10 | 31+ | 31+ |
| space before percent sign | /docs/rules/nbsp/ | problem | 10 / 10 / 10 / 10 / 10 | 31+ | 31+ |
| guillemets html | /locales/fr/ | problem | 10 / 10 / 10 / 0 / 10 | 31+ | 31+ |
| german quotation marks in html | /locales/de-DE/ | problem | 0 / 0 / 0 / 0 / 0 | 31+ | 31+ |
| german quotes html | /locales/de-DE/ | problem | 0 / 0 / 0 / 0 / 0 | 31+ | 31+ |
| french non breaking space | /locales/fr/ | problem | 0 / 0 / 0 / 0 / 0 | 31+ | 31+ |
| non breaking space before colon french | /locales/fr/ | problem | 0 / 0 / 0 / 0 / 0 | 31+ | 31+ |
| non breaking space before units | /docs/rules/nbsp/ | problem | 0 / 0 / 0 / 0 / 0 | 31+ | 31+ |
| non breaking space before percent | /docs/rules/nbsp/ | problem | 0 / 0 / 0 / 0 / 0 | 31+ | 31+ |
| punctuation inside quotes british | /docs/rules/quote-punctuation/ | problem | 0 / 0 / 0 / 0 / 0 | 31+ | 31+ |
| apostrophe vs right single quote | /docs/rules/apostrophe/ | problem | 0 / 0 / 0 / 0 / 0 | 31+ | 31+ |
| fix apostrophe html | /docs/rules/apostrophe/ | problem | 0 / 0 / 0 / 0 / 0 | 31+ | 31+ |
| quotation marks in different languages | /locales/ | reference | 50 / 10 / 10 / 10 / 30 | 31+ | 31+ |
| em dash in french | /locales/fr/ | reference | 10 / 10 / 50 / 10 / 10 | 31+ | 31+ |
| narrow no break space | /docs/concepts/invisible-characters/ | reference | 40 / 10 / 10 / 10 / 10 | 31+ | 31+ |
| en dash for ranges | /docs/rules/ranges/ | reference | 40 / 10 / 10 / 10 / 10 | 31+ | 31+ |
| polish quotation marks | /locales/pl/ | reference | 30 / 20 / 10 / 10 / 10 | 31+ | 31+ |
| norwegian quotation marks | /locales/nb/ | reference | 20 / 10 / 10 / 10 / 30 | 7 | 7 |
| spaced em dash | /docs/rules/dashes/ | reference | 30 / 10 / 10 / 10 / 10 | 31+ | 31+ |
| dash in german | /locales/de-DE/ | reference | 20 / 10 / 10 / 10 / 10 | 31+ | 31+ |
| thin non breaking space | /docs/concepts/invisible-characters/ | reference | 10 / 10 / 10 / 10 / 10 | 31+ | 31+ |
| british vs american quotation marks | /locales/en-GB/ | reference | 10 / 10 / 10 / 10 / 10 | 31+ | 31+ |
| dutch quotation marks | /locales/nl/ | reference | 10 / 10 / 10 / 10 / 10 | 13 | 13 |
| ukrainian quotation marks | /locales/uk/ | reference | 10 / 10 / 10 / 10 / 10 | 9 | 5 |
| typographic quotation marks | /docs/rules/quotes/ | reference | 10 / 10 / 10 / 10 / 10 | 31+ | 31+ |
| swedish quotation marks | /locales/sv/ | reference | 10 / 10 / 10 / 10 / 10 | 22 | 11 |
| czech quotation marks | /locales/cs/ | reference | 10 / 10 / 10 / 10 / 10 | 10 | 9 |
| portuguese quotation marks | /locales/pt-PT/ | reference | 10 / 10 / 10 / 10 / 10 | 31+ | 31+ |
| romanian quotation marks | /locales/ro/ | reference | 10 / 10 / 10 / 10 / 10 | 31+ | 31+ |
| hungarian quotation marks | /locales/hu/ | reference | 10 / 10 / 10 / 10 / 10 | 7 | 31+ |
| danish quotation marks | /locales/da/ | reference | 10 / 10 / 10 / 10 / 10 | 16 | 31+ |
| icelandic quotation marks | /locales/is/ | reference | 10 / 10 / 10 / 10 / 10 | 31+ | 31+ |
| lithuanian quotation marks | /locales/lt/ | reference | 10 / 10 / 10 / 10 / 10 | 6 | 6 |
| bulgarian quotation marks | /locales/bg/ | reference | 10 / 10 / 10 / 10 / 10 | 7 | 4 |
| serbian quotation marks | /locales/sr/ | reference | 10 / 10 / 10 / 10 / 10 | 31+ | 10 |
| em dash in russian | /locales/ru/ | reference | 10 / 10 / 10 / 10 / 10 | 31+ | 31+ |
| swiss german quotation marks | /locales/de-CH/ | reference | 0 / 0 / 0 / 0 / 0 | 13 | 15 |
| uk vs us quotation marks | /locales/en-GB/ | reference | 0 / 0 / 0 / 0 / 0 | 31+ | 31+ |
| three dots vs ellipsis | /docs/rules/ellipsis/ | reference | 0 / 0 / 0 / 0 / 0 | 31+ | 31+ |
| typography rules by language | /locales/ | reference | 0 / 0 / 0 / 0 / 0 | 31+ | 31+ |
| quotation marks by language | /locales/ | reference | 0 / 0 / 0 / 0 / 0 | 31+ | 31+ |
| quotation marks in european languages | /locales/ | reference | 0 / 0 / 0 / 0 / 0 | 31+ | 31+ |
| dash usage by language | /locales/ | reference | 0 / 0 / 0 / 0 / 0 | 31+ | 31+ |
| non breaking space rules by language | /locales/ | reference | 0 / 0 / 0 / 0 / 0 | 31+ | 31+ |
| finnish quotation marks | /locales/fi/ | reference | 0 / 0 / 0 / 0 / 0 | 11 | 31+ |
| turkish quotation marks | /locales/tr/ | reference | 0 / 0 / 0 / 0 / 0 | 15 | 11 |
| catalan quotation marks | /locales/ca/ | reference | 0 / 0 / 0 / 0 / 0 | 31+ | 31+ |
| latvian quotation marks | /locales/lv/ | reference | 0 / 0 / 0 / 0 / 0 | 5 | 6 |
| estonian quotation marks | /locales/et/ | reference | 0 / 0 / 0 / 0 / 0 | 6 | 31+ |
| croatian quotation marks | /locales/hr/ | reference | 0 / 0 / 0 / 0 / 0 | 31+ | 6 |
| slovak quotation marks | /locales/sk/ | reference | 0 / 0 / 0 / 0 / 0 | 31+ | 31+ |
| slovenian quotation marks | /locales/sl/ | reference | 0 / 0 / 0 / 0 / 0 | 7 | 6 |
| albanian quotation marks | /locales/sq/ | reference | 0 / 0 / 0 / 0 / 0 | 31+ | 2 |
| low 9 quotation marks | /locales/de-DE/ | reference | 0 / 0 / 0 / 0 / 0 | 31+ | 31+ |
| russian typography rules | /locales/ru/ | reference | 0 / 0 / 0 / 0 / 0 | 31+ | 31+ |
| german typography rules | /locales/de-DE/ | reference | 0 / 0 / 0 / 0 / 0 | 26 | 31+ |
| french typography rules | /locales/fr/ | reference | 0 / 0 / 0 / 0 / 0 | 31+ | 31+ |
| swiss typography rules | /locales/de-CH/ | reference | 0 / 0 / 0 / 0 / 0 | 31+ | 31+ |
| finnish typography rules | /locales/fi/ | reference | 0 / 0 / 0 / 0 / 0 | 31+ | 1 |
| swedish typography rules | /locales/sv/ | reference | 0 / 0 / 0 / 0 / 0 | 3 | 1 |
| smart quotes converter | /playground/ | tool | 20 / 10 / 10 / 10 / 10 | 31+ | 31+ |
| straight quotes to curly quotes | /playground/ | tool | 10 / 10 / 10 / 10 / 10 | 31+ | 31+ |
| curly quotes converter | /playground/ | tool | 0 / 0 / 0 / 0 / 0 | 31+ | 31+ |

## Brand

| Phrase | Page | Intent | Searches/mo US / GB / CA / AU / IN | US 26.11.2026 | GB 26.11.2026 |
|---|---|---|---|---:|---:|
| polytypo | / | brand | – | 1 | 31+ |

## Local-language phrases (baseline)

| Market | Phrase | Searches/mo | Locale page (English) | Position 26.11.2026 |
|---|---|---:|---|---:|
| DE | anführungszeichen | 14800 | /locales/de-DE/ | 31+ |
| DE | deutsche anführungszeichen | 1900 | /locales/de-DE/ | 31+ |
| DE | gedankenstrich | 27100 | /locales/de-DE/ | 31+ |
| DE | geschütztes leerzeichen | 4400 | /locales/de-DE/ | 31+ |
| FR | guillemets | 27100 | /locales/fr/ | 31+ |
| FR | guillemets français | 14800 | /locales/fr/ | 31+ |
| FR | tiret cadratin | 12100 | /locales/fr/ | 31+ |
| FR | espace insécable | 5400 | /locales/fr/ | 31+ |
| RU | кавычки ёлочки | n/a | /locales/ru/ | 31+ |
| RU | тире длинное | n/a | /locales/ru/ | 31+ |
| RU | неразрывный пробел | n/a | /locales/ru/ | 31+ |
| RU | типограф | n/a | /locales/ru/ | 31+ |
| FI | lainausmerkit | 880 | /locales/fi/ | 31+ |
| FI | ajatusviiva | 9900 | /locales/fi/ | 31+ |
| FI | sitova välilyönti | 70 | /locales/fi/ | 31+ |
| SE | citattecken | 1300 | /locales/sv/ | 31+ |
| SE | tankstreck | 5400 | /locales/sv/ | 31+ |
| SE | hårt mellanslag | 170 | /locales/sv/ | 31+ |
| ES | comillas españolas | 12100 | /locales/es/ | 31+ |
| ES | comillas angulares | 4400 | /locales/es/ | 31+ |
| ES | guion largo | 12100 | /locales/es/ | 31+ |
| ES | espacio de no separación | 50 | /locales/es/ | 31+ |
| IT | virgolette caporali | 5400 | /locales/it/ | 31+ |
| IT | virgolette basse | 12100 | /locales/it/ | 31+ |
| IT | trattino lungo | 3600 | /locales/it/ | 31+ |
| IT | spazio unificatore | 20 | /locales/it/ | 31+ |
| PL | cudzysłów | 12100 | /locales/pl/ | 31+ |
| PL | cudzysłów polski | 1300 | /locales/pl/ | 31+ |
| PL | półpauza | 9900 | /locales/pl/ | 31+ |
| PL | twarda spacja | 8100 | /locales/pl/ | 31+ |
| NL | aanhalingstekens | 2400 | /locales/nl/ | 31+ |
| NL | gedachtestreepje | 1300 | /locales/nl/ | 31+ |
| NL | harde spatie | 50 | /locales/nl/ | 31+ |
| BR | aspas | 60500 | /locales/pt-BR/ | 31+ |
| BR | travessão | 90500 | /locales/pt-BR/ | 31+ |
| BR | aspas tipográficas | 30 | /locales/pt-BR/ | 31+ |
| BR | espaço não separável | 0 | /locales/pt-BR/ | 31+ |
| UA | лапки | 12100 | /locales/uk/ | 31+ |
| UA | тире довге | 260 | /locales/uk/ | 31+ |
| UA | нерозривний пропуск | 10 | /locales/uk/ | 31+ |
| UA | типограф | 4400 | /locales/uk/ | 31+ |
| CZ | uvozovky | 12100 | /locales/cs/ | 31+ |
| CZ | pomlčka | 9900 | /locales/cs/ | 31+ |
| CZ | nezlomitelná mezera | 260 | /locales/cs/ | 31+ |
| TR | tırnak işareti | 12100 | /locales/tr/ | 31+ |
| TR | uzun tire | 590 | /locales/tr/ | 31+ |
| TR | bölünemez boşluk | 0 | /locales/tr/ | 31+ |

## Where the site ranks now

38 of 299 lookups found polytypo.dev in the top 30. Almost all are tier B or brand (tier A: only `greek quotation marks`, 26 US and 22 IN); no local-language phrase ranks, and the other 15 tier A phrases are 31+ in every market. Ranking pages:

| Market | Phrase | Position | Ranked URL | Intended page |
|---|---|---:|---|---|
| GB | albanian quotation marks | 2 | /locales/sq/ | /locales/sq/ |
| GB | bulgarian quotation marks | 4 | /locales/bg/ | /locales/bg/ |
| US | bulgarian quotation marks | 7 | /locales/bg/ | /locales/bg/ |
| GB | croatian quotation marks | 6 | /locales/hr/ | /locales/hr/ |
| GB | czech quotation marks | 9 | /locales/cs/ | /locales/cs/ |
| US | czech quotation marks | 10 | /locales/cs/ | /locales/cs/ |
| US | danish quotation marks | 16 | /locales/da/ | /locales/da/ |
| US | dutch quotation marks | 13 | /locales/nl/ | /locales/nl/ |
| GB | dutch quotation marks | 13 | /locales/nl/ | /locales/nl/ |
| US | estonian quotation marks | 6 | /locales/et/ | /locales/et/ |
| US | finnish quotation marks | 11 | /locales/fi/ | /locales/fi/ |
| GB | finnish typography rules | 1 | /locales/fi/ | /locales/fi/ |
| US | german typography rules | 26 | /locales/de-CH/ **(wrong page)** | /locales/de-DE/ |
| IN | greek quotation marks | 22 | /locales/el/ | /locales/el/ |
| US | greek quotation marks | 26 | /locales/el/ | /locales/el/ |
| US | hungarian quotation marks | 7 | /locales/hu/ | /locales/hu/ |
| US | latvian quotation marks | 5 | /locales/lv/ | /locales/lv/ |
| GB | latvian quotation marks | 6 | /locales/lv/ | /locales/lv/ |
| US | lithuanian quotation marks | 6 | /locales/lt/ | /locales/lt/ |
| GB | lithuanian quotation marks | 6 | /locales/lt/ | /locales/lt/ |
| US | norwegian quotation marks | 7 | /locales/nn/ **(wrong page)** | /locales/nb/ |
| GB | norwegian quotation marks | 7 | /locales/nn/ **(wrong page)** | /locales/nb/ |
| US | polytypo | 1 | / | / |
| US | remark typography | 26 | /docs/guides/remark-plugin/ | /docs/guides/remark-plugin/ |
| GB | serbian quotation marks | 10 | /locales/sr/ | /locales/sr/ |
| GB | slovenian quotation marks | 6 | /locales/sl/ | /locales/sl/ |
| US | slovenian quotation marks | 7 | /locales/sl/ | /locales/sl/ |
| GB | swedish quotation marks | 11 | /locales/sv/ | /locales/sv/ |
| US | swedish quotation marks | 22 | /locales/sv/ | /locales/sv/ |
| GB | swedish typography rules | 1 | /locales/sv/ | /locales/sv/ |
| US | swedish typography rules | 3 | /locales/sv/ | /locales/sv/ |
| US | swiss german quotation marks | 13 | /locales/de-CH/ | /locales/de-CH/ |
| GB | swiss german quotation marks | 15 | /locales/de-CH/ | /locales/de-CH/ |
| GB | turkish quotation marks | 11 | /locales/tr/ | /locales/tr/ |
| US | turkish quotation marks | 15 | /locales/tr/ | /locales/tr/ |
| US | typography mdx | 11 | /docs/guides/mdx-content/ | /docs/guides/mdx-content/ |
| GB | ukrainian quotation marks | 5 | /locales/uk/ | /locales/uk/ |
| US | ukrainian quotation marks | 9 | /locales/uk/ | /locales/uk/ |

## Competitors

Page-1 domains across all lookups. Excluded: social, video, marketplaces, Q&A forums (Reddit, Quora, Stack Exchange/Overflow, Facebook, YouTube, Instagram, Medium, Scribd); our own domain. Wikipedia is kept (it is the reference incumbent on reference phrases).

| Domain | Lookups with page-1 presence (of 299) |
|---|---:|
| en.wikipedia.org | 142 |
| op.europa.eu | 54 |
| elon.io | 45 |
| practicaltypography.com | 32 |
| github.com | 31 |
| help.unbabel.com | 30 |
| typographyforlawyers.com | 24 |
| type.today | 21 |
| merriam-webster.com | 20 |
| jakubmarian.com | 19 |
| thepunctuationguide.com | 18 |
| stylemanual.gov.au | 17 |
| quillbot.com | 17 |
| our-languages.canada.ca | 15 |
| languagedrops.com | 15 |
| dictionary.cambridge.org | 13 |
| support.microsoft.com | 13 |
| babbel.com | 13 |
| frenchpod101.com | 12 |
| grammarly.com | 11 |
| learn.microsoft.com | 11 |
| library.mskcc.org | 10 |
| thoughtco.com | 10 |
| compart.com | 10 |
| toptal.com | 9 |

By intent (top 8 each):

- **reference** (167 lookups): en.wikipedia.org (128), op.europa.eu (53), elon.io (45), help.unbabel.com (30), practicaltypography.com (25), type.today (21), jakubmarian.com (19), typographyforlawyers.com (18)
- **library** (49 lookups): github.com (22), figma.com (7), pypi.org (6), practicaltypography.com (6), smartypantsvitamins.com (5), invisiblecharacterviewer.com (5), m.imdb.com (4), watch.dropout.tv (4)
- **problem** (29 lookups): en.wikipedia.org (13), toptal.com (8), w3schools.com (8), frenchpod101.com (6), babbel.com (6), our-languages.canada.ca (6), freecodecamp.org (5), mailtrap.io (5)
- **brand** (2 lookups): ruby-toolbox.com (1), rubygems.org (1), github.com (1), npm.io (1)
- **tool** (6 lookups): dan.hersam.com (6), phrasefix.com (5), inkplant.com (4), infyways.com (4), contentpowered.com (4), textground.com (3), webutility.io (2), striphtml.com (2)
- **local** (46 lookups): support.microsoft.com (7), symbl.cc (5), de.wikipedia.org (4), learn.microsoft.com (4), ru.wikipedia.org (4), rae.es (4), it.wikipedia.org (4), pl.wikipedia.org (4)

## Gaps (phrase without a page)

Content is not expanded, so these are recorded, not planned. The first is the dominant one.

1. **Local-language queries have no page.** 13 local markets, demand in the thousands per phrase (examples: `aspas` 60,500, `travessão` 90,500 in BR; `gedankenstrich` 27,100 and `anführungszeichen` 14,800 in DE; `guillemets` 27,100 in FR; `comillas españolas` 12,100 in ES; `virgolette basse` 12,100 in IT; `cudzysłów` 12,100 in PL; `uvozovky` 12,100 in CZ; `ajatusviiva` 9,900 in FI). Every locale page is English, and none of 47 local lookups ranks. Demand is mostly about using the mark in writing, not about an engine.
2. **`em dash vs en dash` (22,200 US, 2,900 GB/CA).** Answered only in part by `/docs/rules/dashes/` (its title is about spacing per locale, not the English difference); no page compares the two marks. Not ranking in any market.
3. **`guillemets` (CA 14,800, US 1,900)** and **`curly quotes` (US 2,900)**: the nearest pages (`/locales/fr/`, `/docs/rules/quotes/`) are reference pages for the engine, not the definition. 31+ everywhere.
4. **Library and tool phrases have zero Planner volume** (`smart quotes javascript`, `typograf alternative`, `typography library python`…); there is no demand to chase, and the only ones ranking are `typography mdx` and `remark typography` (US, 11 and 26). `smartypants` (4,400 US) is mostly a vitamin brand.
5. **HTML entity queries**: Search Console (28 days) shows impressions for `&nbsp`, `&mdash`, `&apos`, `&#160` and bare punctuation at positions 25–90. These are symbol lookups; `/docs/rules/nbsp/` and `/docs/concepts/invisible-characters/` are the nearest pages. Not in the Planner list, worth sizing separately.
6. `/locales/` has no phrase target of its own that ranks: `quotation marks by language`, `typography rules by language`, `dash usage by language` are 0 volume and 31+.

## Cannibalization risks

- **`nb` vs `nn` (Norwegian).** `norwegian quotation marks` ranks `/locales/nn/` (7 in US and GB), while the intended page is `/locales/nb/`. Two locales share one English phrase.
- **`de-DE` vs `de-CH`.** `german typography rules` ranks `/locales/de-CH/` (26 US) instead of `/locales/de-DE/`; `swiss german quotation marks` correctly ranks `de-CH` (13/15). `german quotation marks` is a de-DE phrase; keep `de-CH` on the Swiss phrases only.
- **`pt-PT` vs `pt-BR`; `fr` vs `fr-CA`; `en-GB` vs `en-US`.** `portuguese quotation marks` and `french quotation marks` map to one page each (`pt-PT`, `fr`); the sibling locale page can outrank it. `british vs american quotation marks` fits both `en-GB` and `en-US`.
- **`typography mdx`** ranks `/docs/guides/mdx-content/` (11 US) and is now the target. Resolved 2026-11-26: the guide takes the how-to intent (title "MDX typography in a blog…"), `/docs/modes/markdown/mdx/` became the dialect reference ("MDX dialect reference…") and links to the guide.
- **`non breaking space html`**: `/docs/rules/nbsp/`, `/docs/modes/html/` and `/docs/concepts/invisible-characters/` all fit; mapped to `nbsp`. `narrow no break space` and `thin non breaking space` map to `invisible-characters`.
- **Quotes**: `curly quotes`, `typographic quotes` could be answered by `/docs/rules/quotes/`, `/locales/en-US/` and `/playground/`; mapped to the rule page.
- **Dashes**: `em dash vs en dash`, `em dash spacing`, `en dash for ranges` split between `/docs/rules/dashes/` and `/docs/rules/ranges/`.
- **Library phrases** all map to `/` or a runtime page; `/docs/runtimes/javascript/` (npm) vs `/` for `typography library` is undecided (volume is 10–20).

## Method notes

- Planner: `generateKeywordHistoricalMetrics` per market, up to 50 phrases a call. Seeds came from the engine's own vocabulary (rules, locales, library terms) and Planner ideas (`generateKeywordIdeas`) for en, de, fr, fi, sv, es, nl. Autocomplete (paid) was not used: the list was already narrow and volumes tiny.
- RU: Google Ads rejects the Russia geo target; volumes are `n/a`. Positions use `gl=ru`/`hl=ru`.
- The tracking script is not in this repository (positions come from a scratch script based on the Tesseract `serp_positions.py`, extended with a market loop). The next monthly run needs `SERPER_API_KEY` in `.env.local` of this repo; this baseline used the operator's key from another project.
- Re-run monthly with the same phrases per market; add a column `<market> DD.MM.YYYY`.


## Tool-bound phrases, US baseline (2026-11-26)

Chosen from Serper autocomplete (US/en) on tool-related seeds; positions for polytypo.dev in `gl=us`, `hl=en`, up to 3 pages (99 pages fetched). None of the 33 phrases ranks in the top 30. The column shows the top three domains on page 1.

| Phrase | polytypo.dev | Page-1 top 3 |
|---|---|---|
| smart quotes javascript | 31+ | forum.codeselfstudy.com, www.stone.com, coderanch.com |
| smart quotes javascript example | 31+ | meta.stackoverflow.com, forum.codeselfstudy.com, www.youtube.com |
| smart quotes javascript replace | 31+ | stackoverflow.com, smartquotes.js.org, articleformatter.com |
| smart quotes typescript | 31+ | stackoverflow.com, smartquotes.js.org, medium.com |
| smart quotes typescript example | 31+ | stackoverflow.com, practicaltypography.com, smartquotes.js.org |
| smart quotes python | 31+ | stackoverflow.com, docs.ckan.org, www.reddit.com |
| curly quotes python | 31+ | stackoverflow.com, www.reddit.com, opensource.com |
| smart quotes golang | 31+ | github.com, github.com, go-proverbs.github.io |
| smart quotes ruby | 31+ | stackoverflow.com, docs.railsbridge.org, smartquotesforsmartpeople.com |
| smart quotes ruby json | 31+ | github.com, stackoverflow.com, ruby-doc.org |
| smart quotes ruby csv | 31+ | stackoverflow.com, ssojet.com, www.reddit.com |
| smart quotes php | 31+ | stackoverflow.com, www.tutorialspoint.com, github.com |
| smart quotes php code | 31+ | stackoverflow.com, www.ozzu.com, www.tutorialspoint.com |
| smart quotes php example | 31+ | stackoverflow.com, www.tutorialspoint.com, smartquotesforsmartpeople.com |
| smart quotes php script | 31+ | stackoverflow.com, codecanyon.net, www.ozzu.com |
| smart quotes programming | 31+ | devblogs.microsoft.com, www.reddit.com, communities.sas.com |
| smart quotes coding | 31+ | devblogs.microsoft.com, www.reddit.com, www.freecodecamp.org |
| straight quotes to curly quotes | 31+ | phrasefix.com, dan.hersam.com, inkplant.com |
| straight quotes to curly quotes converter | 31+ | phrasefix.com, www.infyways.com, inkplant.com |
| straight quotes to smart quotes | 31+ | inkplant.com, typographyforlawyers.com, support.microsoft.com |
| straight quotes to smart quotes converter | 31+ | inkplant.com, www.infyways.com, dan.hersam.com |
| curly quotes converter | 31+ | phrasefix.com, inkplant.com, www.infyways.com |
| smart quotes converter | 31+ | inkplant.com, www.infyways.com, phrasefix.com |
| curly to straight quotes converter | 31+ | www.facebook.com, emma-alpern-80872.medium.com, www.facebook.com |
| curly quotes text | 31+ | practicaltypography.com, typographyforlawyers.com, dan.hersam.com |
| non breaking space html | 31+ | stackoverflow.com, www.princexml.com, mattwhite.me |
| non breaking space html entity | 31+ | www.toptal.com, stackoverflow.com, www.w3schools.com |
| non breaking space html code | 31+ | stackoverflow.com, www.toptal.com, en.wikipedia.org |
| narrow non breaking space html | 31+ | stackoverflow.com, en.wikipedia.org, morgan.cugerone.com |
| markdown typographer | 31+ | github.com, discourse.joplinapp.org, kumbuka.me |
| typograf | 31+ | www.neuber.com, superiortype.com, helpcenter.onlyoffice.com |
| fix quotes in text file | 31+ | learn.microsoft.com, www.mrexcel.com, phrasefix.com |
| typography library | 31+ | fonts.google.com, library.typographica.org, fontlibrary.org |

Autocomplete notes: `typography library` suggests design and font queries (Figma, kinetic, CSS), not packages; developers type "smart quotes" plus a language; converters (`straight quotes to curly quotes converter`) are searched by Word and Google Docs users, which `/playground/` is the only page for.
