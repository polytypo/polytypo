# GSC indexing log

Managed by the global `/gsc-indexing` command (playbook: search-and-ai-visibility §9.3).
Property: `sc-domain:polytypo.dev` · Sitemap: `https://polytypo.dev/sitemap.xml`

The operator requests indexing for each "Recommended" row in the GSC UI on the same day.
If a row was NOT requested, change its `Requested` cell to `no`.

## Requests

| URL | Class | Recommended | Requested | Status at pick | Last check | Current status | Indexed on | Attempts |
| --- | ----- | ----------- | --------- | -------------- | ---------- | -------------- | ---------- | -------- |
| https://polytypo.dev/playground/ | target | 2026-10-18 | yes (assumed) | Discovered – currently not indexed | 2026-10-18 | Discovered – currently not indexed | | 1 |
| https://polytypo.dev/docs/ | target | 2026-10-18 | yes (assumed) | URL is unknown to Google | 2026-10-18 | URL is unknown to Google | | 1 |
| https://polytypo.dev/docs/getting-started/installation/ | target | 2026-10-18 | yes (assumed) | URL is unknown to Google | 2026-10-18 | URL is unknown to Google | | 1 |
| https://polytypo.dev/docs/getting-started/ | target | 2026-10-18 | yes (assumed) | URL is unknown to Google | 2026-10-18 | URL is unknown to Google | | 1 |
| https://polytypo.dev/showcase/ | target | 2026-10-18 | yes (assumed) | URL is unknown to Google | 2026-10-18 | URL is unknown to Google | | 1 |
| https://polytypo.dev/docs/modes/ | hub | 2026-10-18 | yes (assumed) | URL is unknown to Google | 2026-10-18 | URL is unknown to Google | | 1 |
| https://polytypo.dev/docs/rules/ | hub | 2026-10-18 | yes (assumed) | URL is unknown to Google | 2026-10-18 | URL is unknown to Google | | 1 |
| https://polytypo.dev/docs/api/ | hub | 2026-10-18 | yes (assumed) | URL is unknown to Google | 2026-10-18 | URL is unknown to Google | | 1 |
| https://polytypo.dev/docs/runtimes/ | hub | 2026-10-18 | yes (assumed) | URL is unknown to Google | 2026-10-18 | URL is unknown to Google | | 1 |
| https://polytypo.dev/changelog/ | new | 2026-10-18 | yes (assumed) | URL is unknown to Google | 2026-10-18 | URL is unknown to Google | | 1 |
| https://polytypo.dev/locales/ | hub | next run (2026-10-19) | no | Submitted and indexed, crawl 2026-10-09 predates the 2026-10-17 rework | 2026-10-18 | Submitted and indexed (stale copy) | 2026-10-09 | 0 |

Operator decision 2026-10-18: `/locales/` was substantially reworked on 2026-10-17 after its last crawl; re-request it on the next run despite being indexed, and pick it first (then 3 locale pages `de-DE`, `fr`, `ru` after pulling demand from GSC).

## Snapshot

| URL | Status | Last crawl | Checked |
| --- | ------ | ---------- | ------- |
| https://polytypo.dev/ | Submitted and indexed | 2026-10-08 | 2026-10-18 |
| https://polytypo.dev/docs/ | URL is unknown to Google | Never | 2026-10-18 |
| https://polytypo.dev/playground/ | Discovered – currently not indexed | Never | 2026-10-18 |
| https://polytypo.dev/locales/ | Submitted and indexed | 2026-10-09 | 2026-10-18 |
| https://polytypo.dev/manifesto/ | Submitted and indexed | 2026-10-07 | 2026-10-18 |
| https://polytypo.dev/showcase/ | URL is unknown to Google | Never | 2026-10-18 |
| https://polytypo.dev/changelog/ | URL is unknown to Google | Never | 2026-10-18 |
| https://polytypo.dev/contribute/ | URL is unknown to Google | Never | 2026-10-18 |
| https://polytypo.dev/docs/getting-started/installation/ | URL is unknown to Google | Never | 2026-10-18 |
| https://polytypo.dev/docs/getting-started/choosing-a-mode/ | URL is unknown to Google | Never | 2026-10-18 |
| https://polytypo.dev/docs/api/transform/ | Discovered – currently not indexed | Never | 2026-10-18 |
| https://polytypo.dev/docs/api/options/ | URL is unknown to Google | Never | 2026-10-18 |
| https://polytypo.dev/docs/api/analyze/ | Discovered – currently not indexed | Never | 2026-10-18 |
| https://polytypo.dev/docs/api/errors/ | Discovered – currently not indexed | Never | 2026-10-18 |
| https://polytypo.dev/docs/modes/overview/ | Submitted and indexed | 2026-10-18 | 2026-10-18 |
| https://polytypo.dev/docs/modes/text/ | Discovered – currently not indexed | Never | 2026-10-18 |
| https://polytypo.dev/docs/modes/html/ | Submitted and indexed | 2026-10-17 | 2026-10-18 |
| https://polytypo.dev/docs/modes/markdown/ | URL is unknown to Google | Never | 2026-10-18 |
| https://polytypo.dev/docs/modes/markdown/dialects/ | URL is unknown to Google | Never | 2026-10-18 |
| https://polytypo.dev/docs/modes/markdown/skip-list/ | URL is unknown to Google | Never | 2026-10-18 |
| https://polytypo.dev/docs/modes/markdown/frontmatter/ | URL is unknown to Google | Never | 2026-10-18 |
| https://polytypo.dev/docs/modes/markdown/mdx/ | URL is unknown to Google | Never | 2026-10-18 |
| https://polytypo.dev/docs/modes/yaml/ | URL is unknown to Google | Never | 2026-10-18 |
| https://polytypo.dev/docs/modes/yaml/keys/ | URL is unknown to Google | Never | 2026-10-18 |
| https://polytypo.dev/docs/modes/yaml/quoting/ | URL is unknown to Google | Never | 2026-10-18 |
| https://polytypo.dev/docs/rules/spaces/ | Discovered – currently not indexed | Never | 2026-10-18 |
| https://polytypo.dev/docs/rules/ellipsis/ | URL is unknown to Google | Never | 2026-10-18 |
| https://polytypo.dev/docs/rules/ranges/ | URL is unknown to Google | Never | 2026-10-18 |
| https://polytypo.dev/docs/rules/dashes/ | Discovered – currently not indexed | Never | 2026-10-18 |
| https://polytypo.dev/docs/rules/hyphen/ | Submitted and indexed | 2026-10-17 | 2026-10-18 |
| https://polytypo.dev/docs/rules/quotes/ | URL is unknown to Google | Never | 2026-10-18 |
| https://polytypo.dev/docs/rules/apostrophe/ | URL is unknown to Google | Never | 2026-10-18 |
| https://polytypo.dev/docs/rules/symbols/ | URL is unknown to Google | Never | 2026-10-18 |
| https://polytypo.dev/docs/rules/nbsp/ | URL is unknown to Google | Never | 2026-10-18 |
| https://polytypo.dev/docs/concepts/span-model/ | Discovered – currently not indexed | Never | 2026-10-18 |
| https://polytypo.dev/docs/concepts/round-trip/ | URL is unknown to Google | Never | 2026-10-18 |
| https://polytypo.dev/docs/concepts/idempotency/ | URL is unknown to Google | Never | 2026-10-18 |
| https://polytypo.dev/docs/concepts/rule-order/ | Discovered – currently not indexed | Never | 2026-10-18 |
| https://polytypo.dev/docs/concepts/locale-resolution/ | Submitted and indexed | 2026-10-17 | 2026-10-18 |
| https://polytypo.dev/docs/concepts/invisible-characters/ | Discovered – currently not indexed | Never | 2026-10-18 |
| https://polytypo.dev/docs/guides/build-step/ | URL is unknown to Google | Never | 2026-10-18 |
| https://polytypo.dev/docs/guides/mdx-content/ | Submitted and indexed | 2026-10-17 | 2026-10-18 |
| https://polytypo.dev/docs/guides/yaml-config/ | Submitted and indexed | 2026-10-17 | 2026-10-18 |
| https://polytypo.dev/docs/runtimes/javascript/ | Discovered – currently not indexed | Never | 2026-10-18 |
| https://polytypo.dev/docs/runtimes/python/ | Discovered – currently not indexed | Never | 2026-10-18 |
| https://polytypo.dev/docs/runtimes/go/ | URL is unknown to Google | Never | 2026-10-18 |
| https://polytypo.dev/docs/runtimes/ruby/ | URL is unknown to Google | Never | 2026-10-18 |
| https://polytypo.dev/docs/runtimes/php/ | URL is unknown to Google | Never | 2026-10-18 |
| https://polytypo.dev/docs/getting-started/ | URL is unknown to Google | Never | 2026-10-18 |
| https://polytypo.dev/docs/api/ | URL is unknown to Google | Never | 2026-10-18 |
| https://polytypo.dev/docs/modes/ | URL is unknown to Google | Never | 2026-10-18 |
| https://polytypo.dev/docs/rules/ | URL is unknown to Google | Never | 2026-10-18 |
| https://polytypo.dev/docs/concepts/ | URL is unknown to Google | Never | 2026-10-18 |
| https://polytypo.dev/docs/guides/ | URL is unknown to Google | Never | 2026-10-18 |
| https://polytypo.dev/docs/runtimes/ | URL is unknown to Google | Never | 2026-10-18 |
| https://polytypo.dev/locales/cs/ | URL is unknown to Google | Never | 2026-10-18 |
| https://polytypo.dev/locales/nl/ | Discovered – currently not indexed | Never | 2026-10-18 |
| https://polytypo.dev/locales/en-GB/ | Discovered – currently not indexed | Never | 2026-10-18 |
| https://polytypo.dev/locales/en-US/ | URL is unknown to Google | Never | 2026-10-18 |
| https://polytypo.dev/locales/fi/ | URL is unknown to Google | Never | 2026-10-18 |
| https://polytypo.dev/locales/fr-CA/ | Discovered – currently not indexed | Never | 2026-10-18 |
| https://polytypo.dev/locales/fr/ | URL is unknown to Google | Never | 2026-10-18 |
| https://polytypo.dev/locales/de-DE/ | URL is unknown to Google | Never | 2026-10-18 |
| https://polytypo.dev/locales/de-CH/ | URL is unknown to Google | Never | 2026-10-18 |
| https://polytypo.dev/locales/el/ | URL is unknown to Google | Never | 2026-10-18 |
| https://polytypo.dev/locales/it/ | URL is unknown to Google | Never | 2026-10-18 |
| https://polytypo.dev/locales/pl/ | URL is unknown to Google | Never | 2026-10-18 |
| https://polytypo.dev/locales/pt-BR/ | Discovered – currently not indexed | Never | 2026-10-18 |
| https://polytypo.dev/locales/pt-PT/ | URL is unknown to Google | Never | 2026-10-18 |
| https://polytypo.dev/locales/ru/ | Discovered – currently not indexed | Never | 2026-10-18 |
| https://polytypo.dev/locales/es/ | Discovered – currently not indexed | Never | 2026-10-18 |
| https://polytypo.dev/locales/sv/ | URL is unknown to Google | Never | 2026-10-18 |
| https://polytypo.dev/locales/tr/ | Discovered – currently not indexed | Never | 2026-10-18 |
| https://polytypo.dev/locales/uk/ | URL is unknown to Google | Never | 2026-10-18 |

## Remediation

Weak pages ("Crawled – currently not indexed") with their Todoist strengthening task. `Edited on` = date the strengthening change went live; `/gsc-indexing` then re-requests the URL.

| URL | Cluster | Todoist task | Found | Edited on | Re-requested |
| --- | ------- | ------------ | ----- | --------- | ------------ |

## Runs

| Date | Inspected | Indexed (sitemap) | Picked | Newly indexed from requests | Sitemap last read | Notes |
| ---- | --------- | ----------------- | ------ | --------------------------- | ----------------- | ----- |
| 2026-10-18 | 74 | 9/74 | 10 | 0 (first run) | 2026-10-17 | No crawled-not-indexed pages. Live sitemap 74 URLs vs 67 in GSC (read yesterday, not stale). Picks: target by no demand data (no GSC impressions pulled; entry/docs hubs first), hubs link to many unknown pages, changelog = newest content. |
