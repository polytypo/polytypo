# Changelog

Versions here are **spec versions**, and every runtime publishes the same number: `polytypo@1.12.0`
on npm, PyPI, pkg.go.dev, RubyGems and Packagist all implement spec 1.12.0 and produce byte-identical
output. Only released versions are listed.

Read an entry as "what changes in text I already run through polytypo". Each one is a behaviour
change with a cost, stated: a rule that fires where it did not before also fires somewhere you may
not want, and the fixtures pin both sides.

**Two characters below are not in the output.** ⍽ marks U+00A0 NO-BREAK SPACE and · marks U+202F
NARROW NO-BREAK SPACE — both are otherwise indistinguishable from an ordinary space here, and a
changelog whose entries are about invisible characters has to show them somehow.

## 1.12.0 — 21 October 2026

Romanian, Hungarian, Bulgarian and Croatian join, taking polytypo to twenty-four languages, each cited to its national orthography.

- Romanian ships as `ro`, cited to the Academia Română's Îndreptar (ÎOOP6) and DOOM3. Until now Romanian text had to be skipped or run through a foreign locale, and the second has a cost. Measured: `Ea a spus: "Citește 'Luceafărul' acum" - sigur - și a plecat.` came back from `en-GB` as `Ea a spus: ‘Citește “Luceafărul” acum’ – sigur – și a plecat.`, the nesting inverted and the native marks gone. `ro` gives `Ea a spus: „Citește «Luceafărul» acum” – sigur – și a plecat.`: `„…”` for the first level, the guillemets `«…»` for the second, no space inside, and an en dash with spaces. `km`, `kg`, `cm`, `mm`, `km/h` and `°C` after a number, `art.` and `nr.` before one, and a single initial before a surname get a no-break space.
- Hungarian ships as `hu`, cited to A magyar helyesírás szabályai (AkH12). Measured: `Azt mondta: "olvasd az 'Egri csillagok'-at" - biztosan - és elment.` came back from `en-GB` as `Azt mondta: ‘olvasd az “Egri csillagok”-at’ – biztosan – és elment.`; `hu` gives `Azt mondta: „olvasd az »Egri csillagok«-at” – biztosan – és elment.`, the Hungarian marks `„…”` and `»…«`.
- Bulgarian ships as `bg`, cited to the Institute for Bulgarian Language (BAS) and the Официален правописен речник (ОПР 2012). Measured: `Той каза: "не" - сигурно - и си тръгна.` came back from `en-GB` as `Той каза: ‘не’ – сигурно – и си тръгна.`; `bg` gives `Той каза: „не“ – сигурно – и си тръгна.`. The closing mark is U+201C, not U+201D as in Romanian and Hungarian, and a quotation inside a quotation takes the same `„…“` pair, as in ОПР. A numeric range, when the `ranges` rule is on, is spaced: `2000 – 2010 г.`.
- The accepted cost of Bulgarian's identical pair: a nested quotation whose inner mark touches the outer one, such as `"това е 'Славия'"` with the inner quotation at the very end, is left as typed rather than half-converted, and a plain pair next to it stays straight too. The same text typed with the typographic marks is left alone. Nothing is rewritten wrongly; the case is only not converted.
- Croatian ships as `hr`, cited to the Hrvatski pravopis of the Institut za hrvatski jezik i jezikoslovlje. Measured: `Rekao je: "pjesma 'Lijepa naša' je himna" - sigurno - i otišao.` came back from `en-GB` as `Rekao je: ‘pjesma “Lijepa naša” je himna’ – sigurno – i otišao.`; `hr` gives `Rekao je: „pjesma ‘Lijepa naša’ je himna” – sigurno – i otišao.`: `„…”` for the first level and `‘…’` for the second, no space inside, and an en dash with spaces. `%`, `‰`, `€`, `°C` and `kg` after a number, the section sign before one, and the abbreviations `dipl. ing.` and `d. o. o.` get a no-break space.
- The accepted cost of Croatian: the pravopis writes page ranges in bibliographies closed up, `str. 145–162`, and prints other ranges spaced. Locale data cannot tell the two apart, so with the `ranges` rule on, `str. 145-162` becomes `str. 145 – 162`. The rule is off by default. A year range typed `2010.-2012.` is left as typed, because the period after the year is not a digit.
- What the four do not do, because the sources say nothing: short words such as `u`, `s`, `k` and `i` are not bound to the word after them, and no hyphenated-word list ships. Where a source gives two unranked forms, the choice is recorded in the locale file and is not presented as a citation.

## 1.11.0 — 19 October 2026

Slovak joins as the twentieth language, cited to the Jazykovedný ústav Ľudovíta Štúra; in YAML, a blank line after a value no longer stops polytypo from typesetting it, and text inside a block or quoted scalar is no longer mistaken for a listed key.

- Slovak ships as `sk`. Until now Slovak content had to be skipped or run through a foreign locale, and the second has a cost. Measured: `Povedal: "Toto je 'citát' z knihy" - prirodzene - a odišiel.` came back from `en-GB` as `Povedal: ‘Toto je “citát” z knihy’ – prirodzene – a odišiel.`, the nesting inverted and the native marks gone, and an already-correct `„ahoj“` became `‘ahoj’`. `sk` gives `Povedal: „Toto je ‚citát‘ z knihy“ – prirodzene – a odišiel.`, the marks the Pravidlá slovenského pravopisu prescribe: `„…“` for the first level and `‚…‘` for the second, with no space inside. Dashes are en dashes with spaces, and, when the `ranges` rule is on, a numeric range is spaced as well, `1980 – 1990`, where Czech closes it up. Beside a spaced dash a range is left as typed: `a - 5-10` gives `a – 5-10`. The spaced range is where the Czech data would have been wrong for Slovak, so it was read from the source, not borrowed.
- What Slovak does not do, because the source does not say it: short words such as `v`, `s`, `k` and `u` are not bound to the word after them, and initials are not bound to the surname. The Pravidlá have no such rule and the paid norm behind them could not be consulted, so nothing is added where nothing is cited. Abbreviations `t. j.`, `a pod.` and `a. s.`, the references `č.`, `ods.` and `s.` before a number, the paragraph sign, and `%`, `‰`, `kg`, `km`, `m/s`, `km/s` and `min` after a number do get a no-break space. The unit list rests on a university's published reading of the norm plus the SI brochure rather than on the Pravidlá themselves, and says so in the locale file.
- In `yaml` mode, a value followed by a blank line was left exactly as it was. `summary: the one -- here` converted, and the same file with a blank line after it came back untouched; a file that ends in a blank line, or one that separates its entries with blank lines, was silently skipped value by value. Both now convert: `title: "a -- b"` followed by a blank line comes back as `title: "a—b"`, in `en-US`, for plain, single-quoted and double-quoted values. A blank line followed by a more-indented line is still a continuation of the value above it and is still left alone.
- The same applies to the YAML block at the top of a Markdown file when `frontmatterKeys` is given: blank lines between entries and before the closing `---` no longer stop a listed key.
- Also in `yaml` mode: a carriage return that is not part of a normal line ending, inside a block scalar of a key you did not list, no longer lets polytypo rewrite the lines after it. `run: |` followed by `  echo a`, a line starting with a bare carriage return, and `  title: c -- d` came back with `title: c—d` even though `run` is not a listed key and that text is a script. A line with a stray carriage return now leaves every line after it alone, down to the next unindented line, in `yaml` mode and in the frontmatter block of a Markdown file with `frontmatterKeys`. Ordinary `\r\n` files are unaffected.
- Also in `yaml` mode: a block scalar or a quoted scalar that starts on a line with no key — a list entry, or a header on a line of its own — no longer exposes its content lines. `- |` followed by `  title: c -- d` is a block scalar whose content is the text `title: c -- d`, yet polytypo read the second line as a `title` key and came back with `title: c—d`; the same happened for `- "x` continued on a second line, for a quoted key, for a flow collection, an anchored or tagged block and an explicit `? ` key, and `- 'x` continued on a second line even had its closing quote turned into a typographic apostrophe. These lines now stay exactly as written, in `yaml` mode and in the frontmatter block of a Markdown file with `frontmatterKeys`. A line containing a tab, or a document marker followed by a node (`--- |`), is treated the same way. A key in quotes followed by its own nested keys, a list entry with nothing after the dash, and OpenAPI paths such as `/users/{id}:` are unaffected and still convert.
- The accepted costs: a frontmatter block whose last line is a lone carriage return on a line of its own now converts the key above it, where before that key was left alone as a side effect of the same bug. In a nested YAML document with a stray carriage return, everything up to the next unindented line is left alone, including real listed keys. A quoted value followed by an indented line of any kind, including a comment, is still left alone, and so is the second key of a list item that holds a mapping (`- title: "x"` then `  slug: y`). Measured on the author's own 367-file content directory, no file contains a stray carriage return. A line that holds only an anchor or a tag over a nested mapping now absorbs that mapping (`- &x` then `  title: a -- b`), a line that starts with an anchor, a tag or a flow collection and holds a key absorbs the key after it, an explicit `? ` key inside a list entry does the same, and a flow collection, a quote or a block header on a line of its own leaves everything up to the next unindented line alone, including real listed keys in a nested document; at the top level of a document that is the rest of the document, and so is a `---` line followed by a tag or a node. Nothing in a document is changed that was not already a listed value.

## 1.10.0 — 18 October 2026

A stray carriage return no longer ends up inside a YAML value polytypo rewrites.

- In `yaml` mode, a line holding a carriage return that is not part of a normal line ending is now left exactly as it was. Until now polytypo converted the text on that line and carried the carriage return along inside the part it rewrote: `title: a<CR>b -- c` came back as `title: a<CR>b—c`, and `title: a<CR>#c -- d` rewrote text that YAML reads as a comment. Both now come back unchanged. The rule polytypo states for itself — line endings stay outside everything it rewrites — was not true of this case.
- The same applies to a block scalar (`|` or `>`): a carriage return inside one of its lines leaves the whole block alone, the way a tab already did. Ordinary line endings are unaffected — `\r\n` files, and a file whose last line ends in a bare `\r`, convert as before. Two carriage returns in a row at the end of a line count as one line ending plus a stray one, so that line is left alone.
- The accepted cost: a value on a line with a lone carriage return, which is how old Mac files ended every line, is no longer typeset. Measured on the author's own 367-file content directory, no file contains one. In `markdown` mode with `frontmatterKeys` the same decline already applied, so the two agree on a stray carriage return inside a line.

## 1.9.0 — 17 October 2026

Single-quoted YAML now gets typeset — the apostrophe is the one thing it leaves straight.

- In `yaml` mode, and in the frontmatter block of `markdown` mode when you pass `frontmatterKeys`, a single-quoted value containing an apostrophe used to come back untouched, whole. YAML writes an apostrophe inside single quotes as two, `''`, and polytypo declined any value that held one. Nothing told you: the value looked like one that needed no changes.
- It now converts everything around the `''` and leaves the `''` itself alone. `description: 'It''s a "quiet" year -- really...'` in `en-GB` used to return unchanged and now returns `description: 'It''s a ‘quiet’ year – really…'`. In `fr`, `description: 'l''idee -- et ... fin'` becomes `description: 'l''idee — et … fin'`. Double-quoted, plain and block scalars are unaffected.
- The accepted cost: the apostrophe that `''` spells stays straight, so a single-quoted value whose only convertible character was that apostrophe still comes back unchanged. Measured on 1913 values from a real 207-file site, de-typeset and re-written as single-quoted scalars in eight languages: 1104 came back unchanged before this version and 672 do now, 602 of them because the apostrophe was all there was to convert. The other 70 that remain include phrases written in single quotation marks, which are the same `''` seen from the other side.
- Converting the apostrophe as well would mean polytypo decoding the YAML string and mapping positions back to your source, which five language builds would each have to do their own way. It is left straight, deliberately.

## 1.8.1 — 17 October 2026

No change to what polytypo does to your text — the French locale now says which French it is.

- Nothing in this version changes your output. Run the same text through 1.8.0 and 1.8.1 and you get the same bytes, in every language and every mode.
- The one change is a name. The `fr` locale was labelled “French” while `fr-CA` was “French (Canada)”, which read as if `fr` were the neutral base of both. Its rules are those of France, cited from the French style guides in the locale file, and its label is now “French (France)”, the way `de-DE` is “German (Germany)”. The locale code is unchanged, so `locale: "fr"` keeps working.
- The accepted cost is on the reading side only: anything that displays the locale's `name` field, such as a locale picker built from the spec data, now shows the longer label.

## 1.8.0 — 26 September 2026

Your frontmatter is metadata again — polytypo now decides where the block is, instead of asking four different parsers.

- Until now each language's build of polytypo found your frontmatter block by asking whatever Markdown parser it already had. Those parsers disagree, so the same file could come back with its metadata typeset in one language and untouched in another. Measured across twenty documents and four languages before this release: eleven disagreed somewhere.
- The most ordinary case is a trailing space. `--- ` with one space after the dashes — which any editor that does not trim whitespace produces — used to be "not a frontmatter block" for the Go and Ruby builds, so `title: "Une note"` came back as `title: “Une note”` and `date: "2026-09-26"` grew quotation marks with it. It is a block now, in all of them, and its contents are left alone.
- Same for a file that starts with a byte-order mark, which Windows editors add without asking: the Go and Ruby builds typeset the metadata behind it. And for the JavaScript build, a file with a mark and no frontmatter at all came back completely unconverted — `Wait for it...` stayed as it was written. Both are fixed.
- A fenced code block inside a metadata value no longer reaches the rest of your document. If a value contained three backticks, the Go build paired them with your body's own fence, typeset the contents of your code block, and skipped the prose after it. The block is now blanked out before the parser sees the file, so nothing inside it can open or close anything outside it.
- Files with old Mac line endings — a lone carriage return, no line feed — are handled rather than mishandled. The Ruby build used to raise a parse error on them; the Go build typeset the metadata. One accepted cost, stated: inside such a block `frontmatterKeys` converts nothing, because the part of polytypo that reads the block's contents still splits lines on line feeds alone. Your metadata is safe either way; it is the conversion you lose. A stray carriage return inside a single value costs that value and not the rest of the block.
- Nothing here changes a document that has no frontmatter, and nothing changes what `frontmatterKeys` does to the values you name — only which files it recognises as having a block at all.

## 1.7.0 — 25 September 2026

Frontmatter you can opt into, key by key — the one string on a page that polytypo used to refuse.

- `markdown` mode takes an optional `frontmatterKeys` list: the frontmatter keys whose values are prose. `transform(src, { locale: "en-GB", mode: "markdown", dialect: "mdx", frontmatterKeys: ["title", "description"] })`. Without it nothing changes — the block is skipped whole, exactly as before — and there is no default list, because only you know which of your fields a reader sees and which a machine reads.
- Why it was worth adding: on a site whose frontmatter carries the headline, the single most visible string on the page was the one string that came back untouched. `title: He said "hello" once` now becomes `title: He said “hello” once` when you name `title`, while `slug`, `date` and everything else in the block keep every byte.
- The block is processed separately from the body, which is not a detail you can see until it matters: an unbalanced quotation mark in `title` cannot reach into your first paragraph and pair with a mark there. Measured — `---\ntitle: He said "hello\n---\n\nworld" she said` comes back with both marks straight, where one pass over the whole document would have curled them into a quotation spanning the metadata and the prose.
- It reads your frontmatter with the same scanner `yaml` mode uses, so it inherits that mode's refusals rather than inventing new ones. The one worth knowing: a single-quoted scalar containing `''` is left alone, and an apostrophe inside single quotes is written exactly that way — so `title: 'It''s a test'` gets nothing. Double-quoted and plain scalars are unaffected. On a real 187-file site, 130 of the 247 convertible values would be skipped if they were written with single quotes and none are as written.
- A TOML block (`+++`) is still skipped whole whether you pass the option or not, and a key listed at any depth matches — `title` is processed wherever it appears in the block, including nested under `seo`.

## 1.6.3 — 24 September 2026

No change to what polytypo does to your text — the explanation corrected yesterday's correction was itself blaming the wrong mechanism.

- Nothing in this version changes your output. Run the same text through 1.6.2 and 1.6.3 and you get the same bytes. One paragraph of `quotes.md` changed, and it is the third pass over the same paragraph today; this one is the mechanism rather than the measurement.
- 1.6.2 established that a possessive apostrophe written flush against an inline element keeps its typewriter form when polytypo declines to pair it. That is measured and still true. What it got wrong was why. It said the apostrophe rule cannot see past an element boundary. It can, and it is documented doing so: `The <code>xs</code>'s printer works.` comes back as `The <code>xs</code>’s printer works.` The rule reaches that mark and curls it. What it does not reach is the plural, `The <code>xs</code>' printer works.`, and the reason is what sits on the other side: the case that accepts an element boundary on its left needs a letter or digit on its right, and a plural possessive has a space there. The original explanation blamed a character class that plays no part in it, and in doing so contradicted a note in the apostrophe rule's own document, shipped in the same packages.
- That is the failure this whole day was about, in miniature: prose that nothing checks, drifting from behaviour nobody re-measured, in documents four of the five packages ship. The documents are now verified against this repository on every push and again before every publish, which is how two of today's three corrections were found at all.

## 1.6.2 — 24 September 2026

No change to what polytypo does to your text — the rule that explains one decision was measuring it wrong in its own favour.

- Nothing in this version changes your output. Run the same text through 1.6.1 and 1.6.2 and you get the same bytes. What changed is one passage of normative prose in `quotes.md`, and both things it got wrong made a decision look cheaper than it is.
- The decision is what polytypo does with a possessive apostrophe written flush against an inline element, as in `The <code>xs</code>' printer works.` Nothing can tell that mark apart from a quotation closing in the same place, so it is read as one. The passage said the character a reader sees there is right either way, and that only the pairing is spent. Measured on the published package: it is not. Declining to pair the mark leaves it a typewriter apostrophe, because the rule that would curl it needs a letter on the far side and finds a space. So both options leave one straight mark in that sentence, in different places — the choice moves it rather than removing it.
- The same passage priced the alternative at "7 of 2801 conformance cases". 2801 is the test count of one implementation's conformance runner, which no other implementation can reproduce. The real figure is six of the suite's 1366 cases. Five are Turkish, where an apostrophe carrying a case suffix is grammar rather than style, and the sixth is the case that pins this behaviour: the alternative closes the pair at the author's own mark, which is what you want, and leaves the typewriter apostrophe on the possessive instead, which is not. A count in a rule document is a count of conformance cases from now on, never one implementation's tests.

## 1.6.1 — 24 September 2026

No change to what polytypo does to your text — an apostrophe rule that rested a decision on an authority which had not made it.

- Nothing in this version changes your output. Run the same text through 1.6.0 and 1.6.1 and you get the same bytes; every rule, locale, mode and option behaves identically. What changed is normative prose — the documents that say why the engine does what it does — in two of the nine rules.
- `apostrophe.md` explains why nothing is inserted between a closing quotation mark and a possessive apostrophe immediately after it, as in `the “Times”’s editor`. It rested that on The Chicago Manual of Style, under a heading saying the authority named both the remedy and the character. It had not. The separator and its code points come from a post on the manual's own CMOS Shop Talk blog describing how CMOS Online typesets its own website, and the section that post cross-references is about nested quotation marks and calls a space there not strictly required — that section's text is quoted verbatim in `en-US`'s citations, and has been since the locale landed. Nothing found addresses this ordering at all. The two marks are set side by side, in every locale, exactly as before; the rule now says so as its own choice rather than someone else's.
- `quotes.md` covers a possessive apostrophe that lands directly after an inline element. Character for character, `The <code>xs</code>' printer works.` is indistinguishable from a quotation closing in that position, so polytypo reads it as one. On its own the sentence comes back untouched; inside a real quotation the same mark closes it early, and `It is 'the <code>quotes</code>' locale data' here.` becomes `It is ‘the <code>quotes</code>’ locale data’ here.` — the pair ends two words short and the author's own closing mark is left over. The rule now states what the alternative costs instead of leaving it implied: no test over the neighbouring characters separates the two readings, and the narrowest test that tries makes Turkish worse, where an apostrophe carrying a case suffix is grammar rather than style.

## 1.6.0 — 23 September 2026

Turkish, cited to the Türk Dil Kurumu — the nineteenth language, and the first whose apostrophe is grammar rather than punctuation.

- Turkish ships as `tr`. Until now a caller with Turkish content had two options: skip the language, or run it through a foreign locale. The second is not free, and this is what it cost, measured: `Sordu: "Bu, 'köşedeki' dedikleri dükkân mı?"` came back from `en-GB` as `Sordu: ‘Bu, “köşedeki” dedikleri dükkân mı?’` — the nesting inverted, singles outside and doubles inside. `tr` gives `Sordu: “Bu, ‘köşedeki’ dedikleri dükkân mı?”`, which is what the TDK rule prescribes.
- The quotation marks are U+201C and U+201D at the first level and U+2018 and U+2019 at the second. That sounds unremarkable and was the hardest fact in the file: tdk.gov.tr serves its examples with plain ASCII marks, so the website cannot say which code points it means. They were read out of the text layer of TDK's own journal, in the passage whose footnote is the Yazım Kılavuzu itself, and independently confirmed against the Unicode Consortium's CLDR data for `tr`. A production report had described Turkish quotes as the `«…»` family; the same journal article shows that form as the preference of some writers rather than the institute's norm, so it is re-typeset like any other foreign pair.
- An ellipsis after `?` or `!` may be written with two dots, and TDK puts it as sufficient rather than as required. `Nasıl da akşam oldu?...` becomes `Nasıl da akşam oldu?..`, where every other locale but Russian and Ukrainian completes it to `?…`. This is the field's other direction, and it matters: had Turkish shipped with the default, TDK's own printed form would have been rewritten into one the guide never shows.
- Turkish attaches case suffixes to names, abbreviations and numbers with an apostrophe — `TBMM'nin`, `1985'te`, `Ankara'da` — so the mark is grammar, not punctuation, and it is everywhere. In `html` and `markdown` that ran into the defect 1.4.0 fixed for English: written against a span, `'<b>TBMM</b>'nin kararı doğru.'` had the suffix open the quotation and the author's own marks come out inverted. Ten suffix fragments are now cited from TDK's own printed examples, each one evidenced as a whole word fragment rather than inferred from the paradigm, and the sentence comes out as `“<b>TBMM</b>’nin kararı doğru.”`
- The accepted cost of those ten, and the two things they do not reach, are all pinned as conformance cases rather than left to be discovered. A quotation whose entire content is one of the fragments, written against a span, is read as a suffix: `<em>'de'</em>` gives `<em>’de’</em>`, and the risk is higher than English's because `de` is also a separate conjunction. An uppercase suffix does not match, because the fold is ASCII-only and Turkish `İ` is U+0130 — widening it is the one thing the portability rules forbid outright. And a suffix TDK's read pages never print whole, such as the `ta` of `Irak'ta`, is simply not in the list.
- Three things Turkish deliberately does not get, each for a stated reason. No dash convention: TDK sets a parenthetical with the short hyphen, closed up, which is neither an en nor an em dash, so writing either would produce a transformation the guide contradicts — `tr` is the third locale, after Greek and Spanish, for which the dash rule is a provable no-op. No range dash, for the same reason. And the percent sign is not bound to its number, because Turkish writes it before the number and closed up: `%25` stays exactly as typed.

## 1.5.0 — 23 September 2026

A possessive written straight after a closing bracket or a closing quotation mark is no longer left as a typewriter apostrophe.

- A possessive or a suffix written directly after a closing bracket or a closing quotation mark kept its straight mark. `The pipeline (order 90)'s own output`, `“Hamlet”'s first line`, `{user}'s account`, `the footnote [3]'s author` — every one of them came out with the typewriter apostrophe that `don't` and `the dogs' bowls` have not had since 1.0.0. This repository's own documentation contained four of them.
- The cause was an asymmetry inside the rule, not a language nobody had got round to. The apostrophe decision reads exactly one character on each side of the mark. Its right-hand side has accepted a closing bracket or quotation mark since 1.0.0 — `dogs')` and `dogs'”` convert — while its left-hand side accepted a letter, a digit, a space or an opening delimiter, and no closing one. Which side of the word the delimiter happened to sit on decided the answer.
- It also depended on the glyph, which is the half worth knowing if you write a language other than English. `»Wort«'s` converted and `«Wort»'s` did not, because the guillemet that opens a quotation was in one internal set and the one that closes it was in another. That put every locale whose quotation marks close with `»`, `›`, `”` or `’` on the losing side of a coin flip — which is most of them, English included. The three forms now give one answer.
- The accepted cost, measured rather than assumed: a straight mark after a closing bracket that was meant to open a quotation now closes instead of opening. `(aside)'quoted' here` gives `(aside)’quoted’ here`, where 1.4.0 gave `(aside)'quoted’ here` and left the pair mismatched. Nothing local tells a possessive apart from an unmatched opening quotation mark in that position, and it is the same trade the rule already makes before a space and before a quotation glyph.
- Two things this release was asked for and deliberately does not do. An apostrophe after a symbol stays straight — `10%'u`, `24 m²'ye`, `50°'lik` — because nothing attests it: Turkish, the language the request came from, writes the percent sign before the number, so `%50'si` was already converting, and its own authority attests the apostrophe after abbreviations and numerals, which were converting too. An apostrophe after a comma or a full stop stays straight as well: in `He said,'yes'` the first mark is as likely to be an opening quotation mark, and Chicago spells the abbreviations `US` and `PhD`, so `the U.S.'s economy` is not a shape that orthography produces.

| Locale | Mode | In | Before | After |
| --- | --- | --- | --- | --- |
| `en-US` | `text` | `The pipeline (order 90)'s own output is stable.` | `The pipeline (order 90)'s own output is stable.` | `The pipeline (order 90)’s own output is stable.` |
| `en-US` | `text` | `“Hamlet”'s first line is the question.` | `“Hamlet”'s first line is the question.` | `“Hamlet”’s first line is the question.` |
| `en-GB` | `text` | `(aside)'quoted' here` | `(aside)'quoted’ here` | `(aside)’quoted’ here` |

## 1.4.0 — 22 September 2026

An apostrophe written against inline code, emphasis or a link no longer turns the sentence's quotation marks inside out.

- In `html` and `markdown`, a possessive or an elision written directly against a span — `` `x`'s ``, `<code>x</code>'s`, `l'<em>idée</em>` — was read as a quotation mark opening a quotation. If the sentence around it was already quoted, the apostrophe took the pair and your own opening mark was demoted to a closing one. The sentence came out with its quotation marks inverted, and running polytypo again did not fix it: the wrong version was a stable result, so a second pass reproduced it.
- This is the shape technical writing hits constantly, because possessivising a name set in code is ordinary English: `` `useEffect`'s dependency array ``. French and Italian hit the mirror of it, where an elided article sits against an emphasised word: `l'<em>idée</em>` produced guillemets around the single letter `l` and abandoned the real closing mark.
- The fix reads a new piece of locale data — the short word fragments that attach across an apostrophe in that language, each one cited to the language's own authority. English carries the possessive `s`; French carries `l`, `d`, `qu`, `jusqu` and nine more; Italian, Portuguese and Dutch carry their own. A language with no citable list of them behaves exactly as it did in 1.3.1, so nothing changes where nothing was evidenced.
- The accepted cost, measured rather than assumed: inside a span, a quotation whose entire content is one of those fragments is now read as an apostrophe. `He said <em>'s'</em> loudly.` gives `<em>’s’</em>`. Quoting a real word — `<em>'no'</em>`, `<em>'fine'</em>` — is unaffected, and both exposures are pinned as conformance cases.
- One related shape is still wrong and is tracked separately: a plural possessive after a span, `` `xs`' printer ``, is written with exactly the same characters as a closing quotation mark after a span, so nothing local can tell them apart. It can still close a quotation opened paragraphs earlier.

| Locale | Mode | In | Before | After |
| --- | --- | --- | --- | --- |
| `en-GB` | `html` | `He says 'avoid <code>x</code>'s printer.' Done.` | `He says ’avoid <code>x</code>‘s printer.’ Done.` | `He says ‘avoid <code>x</code>’s printer.’ Done.` |
| `fr` | `html` | `Il dit 'l'<em>idée</em> est bonne.' Fin.` | `Il dit « l »<em>idée</em> est bonne.' Fin.` | `Il dit «⍽l’<em>idée</em> est bonne.⍽» Fin.` |

## 1.3.1 — 21 September 2026

No change to what polytypo does to your text — two conformance cases that pin behaviour 1.3.0 already specified but never proved.

- Nothing in this version changes your output. Run the same text through 1.3.0 and 1.3.1 and you get the same bytes; every rule, locale, mode and option behaves identically. What changed is the conformance suite, which is the executable half of the spec: it gained two `yaml` cases, so a runtime claiming 1.3.1 has proved something a runtime claiming 1.3.0 only promised.
- In `yaml` mode, a value written without quotes or a `|` cannot contain a colon followed by a space — `description: She asked: one...two` comes back untouched even though `description` is named in `keys`. That is not a limitation polytypo invented: YAML reads the second colon as a nested mapping, and a real parser rejects such a document outright. The engine declines the line rather than rewrite text it could not read back. The prose said so in 1.3.0; now a fixture proves it, next to its opposite — the same sentence in a block scalar, which is processed.

## 1.3.0 — 20 September 2026

A fourth mode for YAML, eight more languages, and a dash fix that had been quietly putting spaces inside your markup.

- `yaml` is a fourth mode. It takes a required `keys` list naming which mapping keys hold prose — there is no default and no guess, because nothing in YAML's syntax separates a `description:` from a `run:`. Quoting, indentation, anchors and a block scalar's chomping indicator are never decoded and rewritten, so everything you did not name comes back byte for byte. The accepted cost is that a document quoting its keys gets nothing, and a scalar spread over several lines is left alone.
- **`dashes`** — In `html` and `markdown`, three dashes at the edge of an element no longer put spaces inside it. `a<em>---</em>b` in a locale that spaces its dashes used to come back as `a<em> – </em>b` — an element beginning and ending with a space it never contained, invisible until it carried a border or a background. Two dashes were already left alone there; three now are too. The accepted cost is that such a dash is not converted at all in those positions, which is the same trade the two-dash case already made.
- **`nbsp`** — A character reference survives `text` mode. In French, `&nbsp;` and `&laquo;` used to come back with a narrow no-break space wedged before their semicolon, which destroyed the reference. They are now left alone. Separately, `Nr.` in German and `n°` in French bind to the number that follows them.
- `narrowNbsp: "nbsp"` makes the engine emit U+00A0 everywhere it would emit U+202F, for faces that do not carry the narrow no-break space. It moves the rule's target rather than cleaning up afterwards, so the result is still a fixed point.
- **`ranges`** — A range may repeat a symbol closed up on both members: `$15-$20` is a range, `$15 - $20` is not. `ranges` still defaults to off.
- `analyze()` reports what `transform()` would do without doing it — one record per edit, with the rule that made it and code-point offsets into the input you passed. It is a report, not a patch.
- Eight more languages: Spanish, Italian, European and Brazilian Portuguese, Dutch, Polish, Ukrainian and Czech. Portuguese ships as `pt-PT` and `pt-BR` rather than one neutral `pt`, because they do not agree; `pt` resolves to `pt-PT`.

| Locale | Mode | In | Before | After |
| --- | --- | --- | --- | --- |
| `de-DE` | `html` | `a<em>---</em>b` | `a<em> – </em>b` | `a<em>---</em>b` |
| `fr` | `text` | `oui&nbsp;!` | `oui&nbsp·;!` | `oui&nbsp;!` |
| `de-DE` | `text` | `Nr. 5` | `Nr. 5` | `Nr.⍽5` |
| `de-DE` | `markdown` | `x *---* y` | `x * – * y` | `x *---* y` |

## 1.2.0 — 17 September 2026

Three fixes from production reports: file extensions keep their space, French spacing survives an inline element, and an elision before a quotation mark is set.

- **`spaces`** — A space before a token that begins with a dot is kept. Before 1.2.0 it was deleted, so `Requires .NET 8` came back as `Requires.NET 8` and `a .gitignore file` lost its space too. The rule now looks at the code point after the dot: a letter or a digit means the dot starts a token, not ends a sentence. The accepted cost is that a stray space before a real sentence stop followed by a capitalised word, `end .Next`, is now kept rather than removed.
- **`nbsp`** — In `html` and `markdown` modes, French spacing survives an inline element boundary. `<strong>Label :</strong>` kept its space before 1.2.0 only if the colon sat in the middle of a text run; at the end of a span the space was dropped entirely. The accepted cost is that a colon immediately followed by an opening tag, `12:<b>30</b>`, now gains a no-break space before it.
- **`apostrophe`** — An elision apostrophe directly before an opening quotation mark becomes U+2019. `d'«idée»` and `l'“idée”` kept a straight mark before 1.2.0, in French and Italian the commonest shape there is. Brackets stay excluded, so a prime in `f'(x)` is still left alone.

| Locale | Mode | In | Before | After |
| --- | --- | --- | --- | --- |
| `en-US` | `text` | `Requires .NET 8 and a .gitignore file.` | `Requires.NET 8 and a.gitignore file.` | `Requires .NET 8 and a .gitignore file.` |
| `fr` | `html` | `<strong>Label :</strong> oui` | `<strong>Label:</strong> oui` | `<strong>Label⍽:</strong> oui` |
| `fr` | `text` | `d'«idée»` | `d'«⍽idée⍽»` | `d’«⍽idée⍽»` |

## 1.1.0 — 9 September 2026

Short quotations convert again, and rock 'n' roll is elided in every locale.

- **`apostrophe`** — Up to 1.0.0 the rule refused to convert any one-to-three-letter run between straight single quotes, because it could not tell the `'n'` idiom from an ordinary short quotation. That declined both: `He said 'no' to me.` kept straight marks, and so did `«это 'моё' дело»`. The test is now exactly one code point, `n` or `N`, and the outcome inverts: that one shape becomes U+2019 on both sides in every locale, and every other short quotation converts like any other quotation.
- **`apostrophe`** — The accepted cost, pinned by fixtures: a genuine quotation of the letter n, `The letter 'n' is common.`, is elided. The class it replaces — every short quotation in every locale — was larger.

| Locale | Mode | In | Before | After |
| --- | --- | --- | --- | --- |
| `en-US` | `text` | `He said 'no' to me.` | `He said 'no' to me.` | `He said “no” to me.` |
| `fi` | `text` | `rock 'n' roll` | `rock 'n' roll` | `rock ’n’ roll` |

## 1.0.0 — 7 September 2026

The first frozen spec, and the first published runtime.

- Nine rules in a fixed order, ten locales, three modes, seven error codes, and idempotency as a contract rather than a hope: running `transform` over its own output returns the same bytes. Everything after this entry is a change against that baseline.

## Patch releases

Patch releases carry no behaviour change and no spec change. polytypo-js 1.0.1 moved npm publishing to trusted publishing (OIDC) and rewrote its README; 1.0.2, along with polytypo-python 1.0.1, polytypo-go 1.0.1 and polytypo-ruby 1.0.1, dropped the word “microtypography” from the published package description. The spec stayed at 1.0.0 throughout, and output was byte-identical. All five runtimes' 1.4.1 stopped shipping the locale citations: they are mandatory in the spec and unchanged there, but no rule reads them and they were 94% of the embedded locale data by size, so every install carried a quarter-megabyte of bibliography. The browser bundle's smallest entry dropped from 88.7 KB to 19.7 KB gzipped. Read the citations where they belong — on the Locales page, generated from the spec files that hold them. polytypo-python 1.6.4 is spec 1.6.3 with one metadata fix: `polytypo.__version__` reported `0.0.0` in every release up to and including 1.6.3, while `pip show polytypo` reported the real number. It now comes from the installed distribution, so the two agree.
