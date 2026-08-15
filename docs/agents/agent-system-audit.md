# Agent System Audit — polytypo

**Verdict: NEEDS_CHANGES**

_Run: `/audit-agent-system --full`, 2026-08-15 (second run). Mode: AUDIT, read-only. The only file
written is this report. Supersedes the previous run's report in place._

> **What changed since run 1:** run 1 audited a project with no code, no package manifest and no git
> repository. The implementation now exists (engine + 8 rules + 8 locale files + 2060 tests + CI),
> and both agents recommended by run 1 were created. The roster is **fit in shape** and **stale in
> detail**: two agent prompts carry contract facts that are now wrong against the code they gate.
> No new agent is warranted. The three most serious findings are outside the agent system.

---

## Project model

- **Product:** `polytypo` — a runtime-agnostic microtypography **spec** plus a JS/TS reference
  implementation. _Current project document_ (`docs/ARCHITECTURE.md:16-35`), _Observed in code_
  (`src/index.ts`, `spec/`).
- **Users:** none yet — not published, no git remote, no telemetry (forbidden, `docs/PLAN.md:30`).
  _Observed in configuration._
- **Business model:** none. Zero revenue, MIT, explicitly low-priority slack-time work
  (`docs/PLAN.md:35-48`). Brand assets carved out of MIT (`README.md:212-214`, `brand/README.md`).
- **Phase: `PRE_LAUNCH`** — _Inference_ from: `spec/VERSION` 0.1.0; 8 rule ids frozen in
  `spec/rules/order.json`; 8 locale files with populated `sources`; 15 test files / 2060 tests
  passing; `package.json` `version 0.0.0`, `"private": false`; `README.md:14` "in development, not
  yet published". Run 1's `DESIGN` label is stale.
- **Milestone reality** — _Observed in code_:

| Milestone                     | State                 | Evidence                                                                                     |
| ----------------------------- | --------------------- | -------------------------------------------------------------------------------------------- |
| M0 spec skeleton              | **done**              | `spec/rules/*.md` (11), `order.json`, `spec/schema/*.json` (4), `VERSION`, `UNICODE`            |
| M1 engine + `text` + en/fi/sv | **done, 1 deviation** | `src/engine/*`, 2060 tests green. `ROADMAP.md:33` "spec vendored as a submodule" — not done     |
| M2 `html`/`markdown`          | **not started**       | `src/engine/pipeline.ts:10-14` raises `POLYTYPO_INVALID_MODE`; `spec/rules/modes.md` written    |
| M3 de/ru/fr                   | **data landed**       | `spec/locales/{de-DE,de-CH,ru,fr}.json` with `sources` — but see the `fr` finding               |
| M4 dogfooding gate            | **not run**           | no artifact in repo                                                                            |
| M5 publish                    | **not started**       | not on npm, no tag, **zero commits**                                                           |

- **Critical domains:** spec-before-code; ARCHITECTURE §4 portability; normative-citation integrity;
  public-identifier stability (rule ids, error codes); conformance + idempotency as release
  blockers; **new since run 1** — generated public artifacts, CI, npm release boundary, git history.

---

## Inventory

**agent_prompt_files (4 resolvable):** `.claude/agents/agent-system-auditor.md` (2137 lines),
`.claude/agents/spec-guardian.md` (184), `.claude/agents/locale-authority.md` (161),
`~/.claude/agents/humanizer.md` (825, user-level — resolves here, invisible to a project-only scan).
**active_named_agents (4):** `agent-system-auditor`, `spec-guardian`, `locale-authority`, `humanizer`.
**disabled_or_archived_agent_files:** none. **invalid_agent_files:** none — all four declare
`name`, `description`, `model`, `tools`.
**command_files (1):** `.claude/commands/audit-agent-system.md` (1528 lines). `~/.claude/commands/`
does not exist. **active_named_commands (1):** `/audit-agent-system`.
**Durable state:** this report (write authorized at `audit-agent-system.md:1014-1024`).
**Settings:** no `.claude/settings.json` or `settings.local.json` — tool restriction is per-agent
frontmatter only. All declared tools verified available.

### Correction to run 1's record

Run 1 stated that `/add-locale` and `/release-check` are referenced by the two agent prompts as
their invokers. **They are not.** `grep -rn "add-locale\|release-check" .claude docs CLAUDE.md`
returns hits only inside `docs/agents/agent-system-audit.md` (run 1's own report, non-canonical per
`CLAUDE.md:16-19`). Neither agent prompt names any command. Consequence: the absence of those two
commands is **not** a broken handoff — the handoff was never written. Confirmed independently by
both agents' self-audits. This changes run 1's P1 command recommendations to P2/defer.

### Broken and stale references

| #   | Reference                                                                                      | Reality                                                                                    | Severity |
| --- | ---------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ | -------- |
| 1   | `spec-guardian.md:85` lists **three** error codes                                                | `src/errors.ts:1-6` defines **five**; `spec/schema/fixtures.schema.json:44-48` lists five    | **P1**   |
| 2   | `spec-guardian.md:104` "the **seven** rule ids"                                                  | `spec/rules/order.json` has **eight** (`hyphen`, order 35)                                   | **P1**   |
| 3   | `spec-guardian.md:115` blocks "hyphenation" as a non-goal                                        | a rule named `hyphen` shipped (U+2011 binding ≠ line-break hyphenation) — false-BLOCK hazard | **P1**   |
| 4   | `spec-guardian.md:115` "locales beyond six"                                                      | 8 locale files / 9 tags; six _languages_ — same false-BLOCK hazard                           | P2       |
| 5   | `spec-guardian.md:40,:65,:124` "once they exist"                                                 | spec, code, tests and CI all exist                                                           | P2       |
| 6   | `locale-authority.md:93` cites the `sources` shape from `PLAN.md` §6                             | binding shape is `spec/schema/locale.schema.json:139-161` (`url` optional, `note` exists)    | P2       |
| 7   | `locale-authority.md:89,:161` mandate retrieval dates                                            | schema is `additionalProperties: false` with no date field — **structurally impossible**     | **P1**   |
| 8   | `locale-authority.md:74,:99-106` frozen ❓ backlog                                                | five of six rows decided and shipped                                                        | P2       |
| 9   | `audit-agent-system.md:289` `--since` "unavailable until the repo is created"                    | repo exists; still inoperable — zero commits                                                 | P2       |
| 10  | `audit-agent-system.md:317` "when the roster grows past four agents"                             | roster is now exactly four                                                                   | P2       |
| 11  | `CLAUDE.md:158` "Three agents, all read-only"                                                    | four agents resolve here; `humanizer` holds `Edit, Write`                                    | P2       |
| 12  | run 1 report `:241` — `humanizer` runs **before** the factual check                               | `CLAUDE.md:169` says after. Direct contradiction; CLAUDE.md wins by precedence                | P2       |
| 13  | `.github/workflows/ci.yml:5` `branches: [main]`                                                  | branch is `master`, no remote, zero commits — **CI has never run**                            | **P1**   |

---

## Settled operator decisions

| Decision                                                                | Source                                             | Status                                                                              | Migration residue                                                                              | Valid blocker |
| ----------------------------------------------------------------------- | -------------------------------------------------- | ----------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- | ------------- |
| External universal-principles document retired; governance embedded      | `audit-agent-system.md:27,345,1507`                | **IMPLEMENTED** (vacuously — never existed here)                                     | none                                                                                             | no            |
| Precedence ARCHITECTURE > ROADMAP > PLAN §1–4/6/7/9; audit report lowest  | `CLAUDE.md:11-19`                                  | **IMPLEMENTED**                                                                      | run 1 report `:241` contradicts `CLAUDE.md:169`; precedence resolves it                          | no            |
| JSON Schema, not zod                                                     | `ARCHITECTURE.md:53`, `CLAUDE.md:17`               | **CONTRADICTED_BY_STALE_SOURCE** — implemented in fact (`spec/schema/*`, `ajv`)       | `docs/PLAN.md:184` still reads "Validated by a zod schema at build time" — **verified present**   | no            |
| Spec-before-code; behaviour change is a spec change first                | `ARCHITECTURE.md:31-32`                            | **PARTIALLY_IMPLEMENTED** — artifacts consistent, but **no diff surface**: 0 commits  | no gate record exists for `hyphen`, added after the M0 freeze                                     | no            |
| Conformance + idempotency are absolute release blockers                  | `PLAN.md:110`, `ARCHITECTURE.md:287`               | **PARTIALLY_IMPLEMENTED** — suites pass locally; CI encodes them but **never ran**    | `.github/workflows/ci.yml:5`                                                                     | no            |
| Rule ids and error codes are public API                                  | `ARCHITECTURE.md:203-205`                          | **IMPLEMENTED in code**, **CONTRADICTED_BY_STALE_SOURCE in docs**                    | `ARCHITECTURE.md:174-175` names 3 of 5 codes; `:63` "~7 rules"; `ROADMAP.md:22` "seven rule ids"  | no            |
| Locale accepted only as JSON + fixtures + citation                       | `PLAN.md:214`, `ARCHITECTURE.md:331-337`           | **IMPLEMENTED** — 8 locale files, 8 fixture files, 8 non-empty `sources`             | quality defects in `fr`; no per-rule `sources` coverage enforced (`minItems: 1` only)            | no            |
| PLAN.md §7 is research, verify every row before it lands                 | `PLAN.md:220`, `CLAUDE.md`                         | **PARTIALLY_IMPLEMENTED** — verified into locale notes, never written back to §7      | §7 still carries ❓ on rows the data has since refuted (`:227,:245,:252`)                        | no            |
| Non-goals refused without explicit operator decision                     | `PLAN.md:114-127`, `ARCHITECTURE.md:352ff`         | **IMPLEMENTED** — `promo/index.html` is a static unpublished page with pre-rendered output, not the forbidden hosted demo | none                                            | no            |
| Roster philosophy: ~4 agents for Phase A, no sibling-roster imports      | run 1 report                                       | **IMPLEMENTED** — exactly 4                                                          | none                                                                                             | no            |
| Spec vendored as a pinned submodule (M1 criterion)                       | `ROADMAP.md:33`                                    | **NOT_IMPLEMENTED**                                                                  | n/a — downstream of the _open_ spec-distribution decision, not residue                            | no            |

The three ROADMAP open decisions (repo visibility, spec distribution, first port) are **not
re-raised**. No settled decision was reopened in this run; none satisfies the reopening guard.

---

## Constitution compliance

| Object                 | Compliance    | Main violation                                                                                                                                                                                                                 | Severity |
| ---------------------- | ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------- |
| `spec-guardian`        | **PARTIAL**   | Carries a private copy of a mutable public contract — 3 error codes (`:85`) and "seven rule ids" (`:104`), both now wrong. A gate whose checklist understates the contract will not flag a rename of the two missing codes.       | **P1**   |
| `locale-authority`     | **PARTIAL**   | Same defect class: `sources` shape cited from PLAN §6 rather than the schema (`:93`); mandatory retrieval dates the schema cannot store (`:89,:161`); frozen ❓ backlog (`:99-106`).                                              | P1/P2    |
| `agent-system-auditor` | **PARTIAL**   | Read-only role holds `Bash` + `WebFetch`; read-only is prompt-enforced only. `Bash` is genuinely required for inventory. Prompt retains large generic domains with no referent here — cost is context, not correctness.           | P2       |
| `humanizer` (user)     | **COMPLIANT** | Holds `Edit, Write`; self-excludes code, schemas, error codes, identifiers (`humanizer.md:337-347,:565-587`). **Gap:** no rule against editing _generated_ files, and none covering normative spec prose. Cross-project asset.    | P2       |
| `/audit-agent-system`  | **PARTIAL**   | Approval boundary correct (recommends, never applies, `:26`). Two stale conditions (`:289`, `:317`).                                                                                                                             | P2       |

No `UNSAFE` object. No agent can deploy, publish, spend, message, push or mutate an external system.

---

## Ownership

| Domain                                                              | Decision  | Evidence           | Implementation         | Independent review        | Operator |
| ------------------------------------------------------------------- | --------- | ------------------ | ---------------------- | ------------------------- | -------- |
| Spec semantics (`spec/rules/*.md`)                                   | operator  | `locale-authority` | main session           | `spec-guardian`           | final    |
| Locale data + `sources`                                              | operator  | `locale-authority` | main session           | `spec-guardian`           | final    |
| Portability §4 constraints                                           | ARCH §4   | —                  | main session           | `spec-guardian`           | final    |
| Rule ids / error codes                                               | operator  | —                  | main session           | `spec-guardian` (stale)   | final    |
| Conformance + idempotency                                            | ARCH/PLAN | test suite         | main session           | `spec-guardian` + CI      | final    |
| **CI configuration**                                                 | —         | —                  | main session           | **none**                  | final    |
| **Generated public artifacts** (`README.md`, `docs/ports/*`, `promo/*`) | operator | `locale-authority` (claims) | `brand/tools/*` | **none**                  | final    |
| **Git history / repo hygiene**                                       | operator  | —                  | operator               | **none**                  | final    |
| **npm publish / tagging**                                            | operator  | —                  | —                      | **none defined**          | final    |
| Prose voice (README)                                                 | operator  | —                  | `humanizer`            | operator                  | final    |
| M4 false-positive judgement                                          | operator  | —                  | —                      | —                         | final    |
| Agent/command roster                                                 | operator  | `agent-system-auditor` | operator           | —                         | final    |

Unowned rows: CI, generated public artifacts, git hygiene, npm publish. **Only one of them warrants
a new object, and it is a command at M5 — not an agent.** Six of the constitution's mandatory gate
categories (auth, tenancy, money, privacy, time, legal) still have no referent: `transform` is pure,
there is no data processing, no users, no revenue.

---

## Agent roster

| Agent                  | Decision            | Evidence                                                                                                                                                              | Priority                |
| ---------------------- | ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------- |
| `spec-guardian`        | **KEEP_BUT_UPDATE** | Domain unchanged and owned by nobody else; `:85` and `:104` are factually wrong against the code it gates; `:115` invites a false BLOCK on the shipped `hyphen` rule.     | **P1**                  |
| `locale-authority`     | **KEEP_BUT_UPDATE** | Role is proven — every locale file carries a real `sources` array, including honest negative-evidence entries. Prompt is pre-code; the `fr` evidence has a defect.        | P2 (prompt) / P1 (`fr`) |
| `agent-system-auditor` | **KEEP**            | Sole governance owner; correct read-only posture; model correct; tool set matches the work. No change on length grounds.                                                  | —                       |
| `humanizer` (user)     | **KEEP, unchanged** | Cross-project asset outside polytypo's authority. Two improvements are global, not local — see Operator decisions.                                                        | —                       |

**Do the two pre-code agents still match the code?** Their _domains, decision rights, boundaries and
hard rules_ do — every §4 constraint they enforce is real and observable (`src/engine/codepoints.ts`,
`RULE_ORDER` from `order.json`, `src/engine/locale.ts`, pure `transform`). Their _enumerated facts_
do not. The correct fix is **not** 7→8 and 3→5: that reintroduces the same defect at the next rule.
Delete the counts, point at the canonical sources (`spec/rules/order.json`, `src/errors.ts`).

## Agents to add

```text
— none
```

Each candidate domain, tested against the ADD bar:

- **Generated-artifact integrity** — real and recurring, but it is a _deterministic diff_
  (`gen_readmes.py && git diff --exit-code`), not a judgement call. Belongs in `package.json` + CI +
  a `spec-guardian` trigger line. **No.**
- **CI / release engineering** — one workflow, one publish event. Belongs in `/release-check`. **No.**
- **Brand / design** — finished reproducible toolchain, operator-run by hand. **No.**
- **Public-claim review** — claims are generated _from_ spec; the residual risk is drift, covered
  above. The one real claim defect (README's source list) is `locale-authority`'s existing remit. **No.**
- **Security / supply chain** — `transform` is pure; npm supply chain is a `/release-check` line. **No.**
- **`port-conformance-auditor`** — Phase B at the earliest; a natural extension of `spec-guardian`. **No.**

## Agents to remove

```text
— none
```

## Merge, split, rename

```text
— none
```

The one merge worth re-testing — `spec-guardian` + `locale-authority` — is still correctly rejected:
incompatible tool sets (repo/Bash vs web research), incompatible role types (gate vs evidence), and
merging would let the agent that sources a locale claim also approve it. The `fr` finding below is
exactly the failure that separation exists to catch.

---

## Overlaps

1. `agent-system-auditor` ↔ `/audit-agent-system` — **legitimate collaboration**. Command routes to
   the agent and separately writes this report; the agent holds no write authority.
2. `spec-guardian` ↔ CI — **legitimate collaboration**, but only the agent is operative: CI has
   never executed.
3. `humanizer` ↔ `README.md` — **unclear boundary, now live**. The README is _generated_
   (`brand/tools/gen_readmes.py:2,:116`); a voice pass on the file is destroyed by the next
   generator run. `CLAUDE.md:168-169` states the sequencing rule but not the generated-file
   constraint. **P2.**

## Contradictions

1. `ARCHITECTURE.md:174-175` names three error codes; `src/errors.ts:1-6` defines five —
   `BEHAVIOR_VS_INTENT_DRIFT`, **CONFIRMED**. The top-precedence document understates a contract it
   declares stable, and `spec-guardian.md:85` inherited the error. **P1.**
2. `ROADMAP.md:22` "seven v1 rule ids", `ARCHITECTURE.md:63` "~7 rules" vs eight in `order.json` —
   `BEHAVIOR_VS_INTENT_DRIFT`, **CONFIRMED**. P2 in the docs, P1 as the cause of `spec-guardian.md:104`.
3. `docs/PLAN.md:184` zod sentence inside §6, which `CLAUDE.md:15` declares binding —
   `STALE_MIGRATION_RESIDUE`, **CONFIRMED**. Downgraded to **P2** from run 1's P1: the trap did not
   fire — M0 shipped JSON Schema correctly. Still should be struck.
4. `.github/workflows/ci.yml:5` `branches: [main]` vs branch `master`, no remote, zero commits —
   `BEHAVIOR_VS_INTENT_DRIFT`, **CONFIRMED**. Two documents call conformance and idempotency
   absolute release blockers; the automation that enforces them cannot fire. **P1.**
5. `spec/locales/fr.json` cites the Imprimerie nationale _Lexique_ with a `fr.wikipedia.org` URL —
   `ACTIVE_DECISION_CONFLICT` against `locale-authority.md:65` ("Wikipedia … may never be cited as
   a source"). **CONFIRMED.** **P1.**
6. `CLAUDE.md:158` "Three agents, all read-only" vs four resolvable, one with `Edit, Write` —
   `UNCLEAR_CANON`. P2.
7. Run 1 report `:241` (humanizer before facts) vs `CLAUDE.md:169` (after) — `UNCLEAR_CANON`,
   resolved by precedence; superseded by this report. P2.

## Stale migration residue

1. `docs/PLAN.md:184` — strike or annotate in the house style of `PLAN.md:14-21`. Do not touch the
   rest of §6; the data-format shape and the `sources` requirement are load-bearing.
2. `spec-guardian.md:85,:104` — replace enumerations with pointers to canonical sources.
3. `locale-authority.md:99-106` — replace the frozen ❓ backlog with a pointer to the `sources`
   entries that record no authority (currently `en-US`, `en-GB`, `fi`, `sv`).
4. `docs/PLAN.md` §7 — rows `:227`, `:245`, `:252` still carry ❓ that the landed locale data has
   since answered; the answers live only in locale-file `note` fields.
5. The previous version of this report — superseded in place by this run. Its `/add-locale` and
   `/release-check` sections were never commitments.

## Black holes

1. **Generated public artifacts have no owner and no drift check. P1, CONFIRMED.** `README.md`,
   `docs/ports/README.{go,php,python,ruby}.md`, `promo/index.html` and `promo/examples.json` are
   generated from `spec/` and from real engine output. **Verified: none of the generators appears in
   `package.json` scripts or in `.github/workflows/ci.yml`.** The next locale or rule change makes
   five public documents assert a spec version, locale table and rule table that no longer match
   `spec/`, with nothing detecting it — the exact drift mechanism the project exists to prevent,
   applied to its own claims.
2. **CI is inert. P1, CONFIRMED.** Every release blocker is currently enforced only by a human
   remembering to run `npm test` locally.
3. **No git history. P1, CONFIRMED.** `spec-guardian`'s primary mode is reviewing a proposed change
   (`:36,:151`). There is no diff to review, no rollback, and no way to verify after the fact that
   spec-before-code was followed for any change, including `hyphen`. Operator action.
4. **`spec-guardian` verdicts have no recording location. P2.** The absence of a record for
   `hyphen`'s addition is _not_ evidence the gate was skipped — it is evidence the gate is
   unauditable.
5. **Retrieval dates have nowhere to live. P1.** `locale-authority.md:89,:161` make them mandatory;
   `spec/schema/locale.schema.json:139-161` is `additionalProperties: false` over
   `rule`/`cite`/`url`/`note`. **Verified: zero retrieval dates exist in any locale file.** The
   agent's `review` mode therefore has no baseline. Either the prompt or the schema must change —
   and the schema is a spec change, so this is `spec-guardian` + operator territory.
6. **No per-rule `sources` coverage rule. P2.** The schema requires `minItems: 1` only. **Verified:
   `fr`, `de-DE` and `de-CH` have no `ellipsis` source entry**, though all three set
   `abbreviatedAfterTerminal: false` — the same value the other four locales each documented.
7. **npm publish boundary unstated in any project file. P2 now, P1 at M5.** `package.json` is
   publish-ready (`"private": false`).
8. **M4 procedure undefined. P2.** "Zero false positives" over the MDX corpus with no defined method
   for producing or reviewing the diff — the most rubber-stampable milestone in the plan.
9. **Brand-asset licence split. P2.** `LICENSE` is plain MIT; `README.md:212-214` and
   `brand/README.md` carve brand assets out of it.

## Broken handoffs

1. `spec → generated public artifacts → nobody`. No receiver, no acceptance check, no failure
   behaviour. **P1.**
2. `implementation → CI → release`. Receiver exists but unreachable (branch mismatch). **P1.**
3. `locale-authority → operator` for unsourced rows. `locale-authority.md:81` routes
   `COMMON_USAGE`/`NOT_ADDRESSED`/`UNKNOWN` to the operator; **nine such entries are nonetheless in
   the shipped locale files** (`en-US`, `en-GB`, `fi`, `sv`, cites beginning "No normative source
   found…"). Mitigating: the deviation is self-documented in the canonical artifact, which is close
   to the right record. **P2** — confirm as accepted deviations and add a `spec-guardian` checklist
   line.
4. **`fr` citation quality — the differentiator handoff failed. P1, CONFIRMED by direct inspection.**
   Of seven `sources` entries in `spec/locales/fr.json`, **six** cite Jacques André, _Petites leçons
   de typographie_ — a personal PDF, tier 2/3 under `locale-authority.md:58-65`, not the named
   authority. The **one** entry citing the Imprimerie nationale _Lexique_ carries
   `https://fr.wikipedia.org/wiki/Espace_fine_insécable` as its URL, explicitly barred by
   `locale-authority.md:65`. `README.md:200-202` and `PLAN.md` §6.1 sell "Imprimerie nationale" as
   the French authority; `locale-authority.md:108` names French as the locale demanding the most
   scepticism. The locale file's own `note` is honest about all of this; the `cite`/`url` fields and
   the README summary are not. **Not a prompt defect** — a prompt that was correct and either was
   not invoked for `fr` or was overridden.
5. Related, same class: `de-DE` nbsp/hyphen cite the Swiss Bundeskanzlei (labelled as a derivation);
   `de-DE` dashes cite DIN 5008, paywalled and cross-checked via Duden instead; `en-GB` cites a
   university house style rather than the Oxford Style Manual named in `PLAN.md:227`. Each is
   labelled honestly in-file. **The defect is that `README.md:200-202` claims a source list the data
   does not support.** P2 individually, P1 as a public claim at M5.

## Unsafe authority

1. **None at P0.**
2. `agent-system-auditor` holds `Bash` + `WebFetch` while declaring itself read-only. `Bash` is
   required for inventory; read-only remains prompt-enforced only. P2, no fix without breaking the role.
3. `spec-guardian` holds `Bash` in a project where `Bash` can now mutate: `npm test` runs
   `npm run gen`, which writes `src/generated/locales.ts`; `npm run validate:spec` writes
   `spec/fixtures/.escaped/`. Both are gitignored build artifacts, but `spec-guardian.md:176` says
   "you never create, edit, delete or rename a file". This run the agent improvised the carve-out by
   running `npx vitest run` instead; a future instance may instead report the suite as `Unknown`.
   **P1 (blocking its own verification path)** — the prompt must carve out gitignored generated
   artifacts and name the read-safe commands.
4. `humanizer` holds `Edit, Write` and now has a real target that is a _generated_ file. **P2** —
   record the constraint in `CLAUDE.md`, not in the cross-project prompt.

---

## Agent model assignments

| Agent                  | Declared | Line                                | Status      | Recommended  | Rationale                                                                                                                                                                                | Priority |
| ---------------------- | -------- | ----------------------------------- | ----------- | ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------- |
| `spec-guardian`        | `opus`   | `.claude/agents/spec-guardian.md:4` | **CORRECT** | `opus` — keep | Gates artifacts irreversible by contract; reasons across RE2/PCRE, UTF-16 vs code points, Go map-iteration order. This run it correctly distinguished `hyphen`-the-rule from hyphenation-the-non-goal. Low frequency ⇒ bounded cost. | —        |
| `locale-authority`     | `opus`   | `.claude/agents/locale-authority.md:4` | **CORRECT** | `opus` — keep | Failure mode is fluent, plausible, wrong citation across five languages; no independent citation reviewer exists downstream. Finding 4 shows the failure is real _with_ opus — a weaker model makes it likelier, not rarer. | —        |
| `agent-system-auditor` | `opus`   | `.claude/agents/agent-system-auditor.md:4` | **CORRECT** | `opus` — keep | Reconciles conflicting sources repo-wide; errors propagate into roster structure. Very low frequency.                                                                                     | —        |
| `humanizer`            | `opus`   | `~/.claude/agents/humanizer.md:3`   | **CORRECT, out of project authority** | no change from polytypo | Disproportionate _for polytypo_ (~15 lines of prose, ≤1 invocation across v1) but proportionate globally; polytypo is not the constraining consumer and a downgrade decided here would degrade other projects. | —        |

### Required model changes

```text
— none
```

No agent is `MISSING`, `OVERPOWERED`, `UNDERPOWERED`, `STALE` or `UNSUPPORTED`. No `model: inherit`,
no omitted `model`. Explicitly considered and rejected: downgrading `spec-guardian` to `sonnet` for
routine fixture checks — rejected because the same agent performs the breaking-change review and the
prompt does not separate those paths by invocation.

### Model environment

- **Official source checked:** `https://code.claude.com/docs/en/sub-agents` ("Choose a model").
- **Checked at:** 2026-08-15.
- **Supported frontmatter values:** aliases `sonnet`, `opus`, `haiku`, `fable`; full model ids
  (`claude-opus-5`, `claude-sonnet-5`, `claude-haiku-4-5-20251001`, `claude-fable-5`); `inherit`.
  Resolution order: `CLAUDE_CODE_SUBAGENT_MODEL` → per-invocation parameter → frontmatter → main
  conversation model.
- **Configuration overrides:** none — no `.claude/settings.json` or `settings.local.json` exists in
  the project; `ls .claude/` → `agents/`, `commands/` only.
- **Availability limitations:** none identified.
- **Unverified assumptions:** none material.

---

## Command roster

| Command               | Decision            | Evidence                                                                                                                                                                    | Priority           |
| --------------------- | ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------ |
| `/audit-agent-system` | **KEEP_BUT_UPDATE** | Approval boundary and read-only posture correct (`:26`, `:1014-1024`). Two stale conditions: `:289` (`--since`) and `:317` (four-agent threshold now met).                       | P2                 |
| `/release-check`      | **ADD — at M5**     | Publish and tag are external mutations with no stated project boundary; `package.json` is publish-ready. Now additionally needs a generated-artifact drift gate and the `fr` fix. | **P1 at M5**, P2 now |
| `/add-locale`         | **DEFER**           | Its justification was the six v1 locales; **all eight locale files landed without it**. Remaining use is post-v1 contributions and re-verification.                              | P2, revisit after M5 |
| `/verify-generated`   | **do not create**   | Deterministic, single-actor, no approval boundary. Belongs in `package.json` + CI, not a command.                                                                               | —                  |

**Commands to add now: none.**

---

## P0

```text
— none
```

No unsafe external authority, no missing owner for a critical invariant, no self-approval of
high-risk work, no contradictory production permissions, no absent mandatory gate.

## P1

1. `spec-guardian.md:85` — three-code enumeration → pointer to `src/errors.ts` /
   `spec/schema/fixtures.schema.json` (five codes). _Today, a rename of `POLYTYPO_UNKNOWN_RULE` or
   `POLYTYPO_RULE_CONTRACT` would not be recognised by the gate as a breaking change._ CONFIRMED.
2. `spec-guardian.md:104` — "seven rule ids" → pointer to `spec/rules/order.json`. CONFIRMED.
3. `spec-guardian.md:115` — disambiguate "hyphenation" (line-break, the non-goal) from the shipped
   `hyphen` rule, and "six locales" (six languages, nine tags). False-BLOCK hazard. CONFIRMED.
4. `spec-guardian.md:40,:176` — carve gitignored generated artifacts out of the read-only rule and
   name the read-safe commands (`npx vitest run`, `npm run validate:spec`, `npx tsc --noEmit`).
   CONFIRMED — the agent hit this in this run.
5. `ARCHITECTURE.md:174-175` — canonical error taxonomy lists three of five codes. Upstream cause of
   P1.1. Operator's edit. CONFIRMED.
6. `.github/workflows/ci.yml:5` — branch filter `main` vs actual branch `master`; with zero commits
   and no remote, the release blockers are unenforced. CONFIRMED.
7. **Generated-artifact drift has no check** — add a `gen:docs` script + a CI step running the
   generators and `git diff --exit-code`; add a `spec-guardian` trigger line. CONFIRMED.
8. `spec/locales/fr.json` — six of seven citations rest on a non-authority; the single _Lexique_
   citation carries a Wikipedia URL. Re-run `locale-authority` in `review` mode over `fr` before
   anything is published under the "settled by citation" claim. CONFIRMED.
9. **Zero commits** — no diff surface for the gate, no rollback, no history. Operator action. CONFIRMED.
10. `locale-authority.md:89,:161` vs `spec/schema/locale.schema.json:139-161` — mandatory retrieval
    dates cannot be stored. Either relax the prompt or extend the schema (a spec change). CONFIRMED.

## P2

1. `docs/PLAN.md:184` — strike or annotate the zod sentence (last outstanding item from run 1).
2. `spec-guardian.md:40,:65,:124` — drop the "once it exists" framing; keep the M2 exemption.
3. `spec-guardian.md:104` — replace "At M0 completion" with a standing identifier-drift check.
4. `spec-guardian` — add checks it now lacks: `src/rules/registry.ts` `RULE_ORDER` ↔ `order.json`;
   spec-version ↔ `package.json`-version coherence; type-check.
5. `locale-authority.md:93` — cite the schema, not `PLAN.md` §6, for the `sources` shape.
6. `locale-authority.md:74,:99-106` — replace the frozen ❓ backlog.
7. `audit-agent-system.md:289,:317` — restate `--since` and the roster-growth trigger.
8. `CLAUDE.md:158` — four resolvable agents, one with `Edit, Write`; and record that `README.md` is
   generated, so a voice pass edits `brand/tools/gen_readmes.py`, not the file.
9. `ROADMAP.md:22` and `ARCHITECTURE.md:63` — "seven"/"~7" rules → eight, or drop the count.
10. Define where `spec-guardian` verdicts are recorded.
11. `docs/PLAN.md` §7 — write back the answers now recorded only in locale-file notes.
12. Per-rule `sources` coverage: `fr`, `de-DE`, `de-CH` have no `ellipsis` entry.
13. `LICENSE` vs `README.md:212-214` brand-asset carve-out — align the wording.
14. `README.md:200-202` — the source list claims authorities the data does not fully support.

---

## Exact patch plan

### ADD

- `package.json` scripts — `"gen:docs"` running `brand/tools/gen_examples.ts`, `gen_readmes.py`,
  `build_promo.py` in the sequence documented at `brand/README.md:29-31` (exact shape is the
  operator's call).
- `.github/workflows/ci.yml` — a step after `validate:spec`: run `gen:docs`, then
  `git diff --exit-code`.
- `.claude/agents/spec-guardian.md` — must-block bullet: a spec change landing without regenerating
  `README.md`, `docs/ports/README.*.md`, `promo/examples.json`, `promo/index.html` → `BLOCK`.
- `.claude/agents/spec-guardian.md` — bullet: a `sources` entry recording no normative authority
  requires a recorded operator acceptance.
- `.claude/agents/spec-guardian.md` — checks for `RULE_ORDER` ↔ `order.json` and spec-version ↔
  package-version coherence.
- `/release-check` command — **at M5, not now.**

### EDIT

- `.claude/agents/spec-guardian.md:85` (codes → pointer), `:104` (rule count → pointer; drop "At M0
  completion"), `:115` (hyphenation vs `hyphen`; six languages vs nine tags), `:40,:65,:124`
  ("once it exists"; read-safe commands; `npm test` write side-effect), `:176` (carve-out), `:3`
  (extend the trigger list to `spec/locales/*`, `registry.json`, all four schemas, `VERSION`,
  `UNICODE`, `src/rules/registry.ts`, `scripts/gen-locales.mjs`).
- `.claude/agents/locale-authority.md:89,:93,:161` (schema-shaped `sources`, retrieval-date
  resolution), `:74,:99-106` (backlog), `:47` (`review` is now the dominant mode).
- `.claude/commands/audit-agent-system.md:289,:317`.
- `docs/ARCHITECTURE.md:174-175`, `:63`; `docs/ROADMAP.md:22`; `docs/PLAN.md:184` and §7 rows.
- `CLAUDE.md:158`, `:168-169`.
- `.github/workflows/ci.yml:5`.

### MERGE / SPLIT / RENAME / DELETE

```text
— none
```

---

## Operator decisions

1. **Branch and commit strategy.** `master`, zero commits, no remote; `ci.yml` targets `main`.
   Distinct from the open "repo visibility" question — a private local repo can still have commits
   and a `main` branch. Options: (a) commit on `master` and change the CI filter; (b) rename to
   `main` and commit; (c) accept that CI, `--since`, diff review and rollback are all unavailable.
   **Recommendation: (b).** Blocking: **yes** for `spec-guardian`'s diff-based modes and for
   automatic enforcement of every release blocker.
2. **`fr` locale citations.** Options: (a) obtain the _Lexique_ and re-cite; (b) keep André and
   re-label the claims honestly in both the locale file and `README.md:200-202`; (c) hold `fr` back
   from the published locale table. **Recommendation: (a) or (b) before M5**; (b) is acceptable and
   cheap. Blocking: **yes for M5 publication**, no for M2/M4.
3. **Retrieval dates: prompt or schema?** `locale-authority` requires them; the schema forbids them.
   Options: (a) add an optional `retrieved` field to `spec/schema/locale.schema.json` (a spec change,
   gated by `spec-guardian`); (b) drop the requirement from the prompt and accept that re-verification
   has no baseline. **Recommendation: (a)** — re-verification is the agent's dominant future mode.
   Blocking: no.
4. **Acceptance of the nine unsourced `sources` rows** (`en-US`, `en-GB`, `fi`, `sv`). Accept as
   documented deviations and record it, then add the `spec-guardian` checklist line; or remove the
   affected behaviour. **Recommendation: accept explicitly.** Blocking: no.
5. **Brand-asset licence wording.** `LICENSE` says MIT unqualified; two other files carve brand
   assets out. **Recommendation:** add the carve-out to `LICENSE` itself. Blocking: no (yes if the
   repo goes public).
6. **`humanizer` global improvements** (user-level, affects other projects — polytypo has no
   authority to apply them): add a "check for a generator before editing any prose file" rule, and
   add "normative specification prose" to its unsupported-content list. Blocking: no.

The three ROADMAP open decisions (repo visibility, spec distribution, first port) are **not**
re-raised here.

---

## Validation

- Every P1 claim independently re-verified by the orchestrator after the agents reported:
  `docs/ARCHITECTURE.md:174-175` (three codes), `:63` ("~7 rules"), `docs/ROADMAP.md:22` ("seven"),
  `.github/workflows/ci.yml:5` + `git branch --show-current` → `master` + `git remote -v` → empty,
  `spec-guardian.md:85,:104`, `docs/PLAN.md:184`, all seven `spec/locales/fr.json` `sources` entries,
  per-locale `sources` rule coverage, and the absence of every generator from `package.json` and
  `ci.yml`.
- `grep` for `/add-locale` and `/release-check` across `.claude`, `docs`, `CLAUDE.md`: hits only in
  the previous version of this report. Run 1's premise corrected accordingly.
- Test suite: `npx vitest run` → 15 files, 2060 tests passed (run by `spec-guardian` and by
  `agent-system-auditor`, without `npm run gen`, so no tracked file was written).
- **Not run:** `npm run validate:spec`, `npm run lint`, `npm run build`, `npx tsc --noEmit`, and the
  brand/promo generators — each writes files and this run is read-only. Generated-artifact drift is
  therefore reported as an **unowned risk**, not as an observed divergence.
- **Not verified:** whether any `spec-guardian` or `locale-authority` invocation actually occurred
  for the shipped spec and locale data. No record exists either way. The absence of a record is not
  evidence the gate was skipped.
- Self-audits from `spec-guardian`, `locale-authority` and `humanizer` were treated as evidence, not
  authority. `agent-system-auditor` was not self-audited (sole-auditor bias; `audit-agent-system.md:493`).

**External changes: none.**
