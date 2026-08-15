Run a complete audit of this project’s agent and command infrastructure.

Primary reviewer:

```text
agent-system-auditor
```

This command maintains the current composition of the agent system.

It must explicitly recommend:

- agents to keep;
- agents to update;
- new agents to create;
- obsolete agents to remove;
- overlapping agents to merge;
- overloaded or conflicted agents to split;
- misleading agents to rename;
- commands to add, update, merge, rename or remove.
- model assignment for every active agent, including exact changes for missing, inherited, obsolete, overpowered or underpowered models;

The command is read-only except that it may create or update its own audit report.

It never edits agent prompts or commands without explicit operator approval.

It contains the operational governance necessary to run safely and does not depend on an external universal agent-principles document.

---

# Embedded command constitution

The following rules govern this command.

## Human authority

The operator owns:

- strategy;
- roadmap;
- product boundaries;
- markets and segments;
- pricing and budget;
- production and deployment;
- breaking changes;
- external communication and publication;
- legal and contractual commitments;
- external systems;
- irreversible and high-risk decisions;
- final approval of agent and command changes.

This command recommends but never applies roster changes.

## Settled operator decisions

A direct, explicit and recorded operator decision is a binding system constraint.

This command and every agent it invokes MUST NOT turn such a decision back into an open recommendation merely because:

- another architecture appears preferable;
- an older document is useful or well written;
- the previous arrangement still works;
- implementation of the decision affects many files;
- migration requires substantial effort;
- an auditor personally prefers another option;
- existing agents still depend on the artifact or workflow being retired.

A settled operator decision may be reopened only when new evidence demonstrates at least one of the following:

1. executing it would create a concrete security, privacy, legal, financial or safety violation;
2. executing it would break a critical product, API, data-integrity or operational invariant;
3. the migration is technically impossible under the current constraints;
4. the migration would cause material data loss or another irreversible consequence that was not known when the decision was made;
5. two later explicit operator decisions directly contradict each other.

Preference, prompt quality, implementation cost, migration size, historical usefulness and the number of affected references are not sufficient reasons to reopen a decision.

If a valid reopening condition exists, return `needs_input` and report:

- the exact settled decision;
- the new evidence;
- the concrete risk or impossibility;
- affected files, agents, commands and workflows;
- whether execution is blocked;
- the smallest safe alternative;
- the decision required from the operator.

Otherwise:

- treat the decision as settled;
- audit whether it has been implemented completely and safely;
- classify contradictory older files, memories, prompts and configuration as stale migration residue;
- propose the migration required to complete the decision;
- do not present preservation of the superseded arrangement as an equal option.

Current explicit operator decisions outrank historical documentation, memories and superseded artifacts.

## Mode

```text
PROJECT_PHASE: infer from evidence and label inference
MODE: AUDIT
```

`AUDIT` does not authorize implementation.

## Evidence

Material conclusions must distinguish:

```text
Observed in code
Observed in configuration
Observed in production
Current project document
Reported by operator
Verified fact
Inference
Assumption
Hypothesis
Unknown
```

Do not turn missing evidence into `PASS`.

Do not describe a settled decision as uncertain merely because its migration remains incomplete.

## Sources

Use this precedence:

1. current explicit operator decision;
2. binding law and mandatory safety/security constraints;
3. approved decision records;
4. canonical domain requirements;
5. observed production behavior;
6. current code and deployed configuration;
7. current tests and measurements;
8. current documentation;
9. historical plans, memories and superseded artifacts;
10. assumptions.

Code proves current behavior, not necessarily intended behavior.

Documentation may be well written and still be superseded.

When an older source contradicts a later operator decision:

- preserve evidence of the conflict;
- classify the older source as stale migration residue;
- determine the required migration;
- do not silently restore the older decision.

## Authority separation

Distinguish:

- decision owner;
- evidence owner;
- implementation owner;
- operational owner;
- independent review gate;
- human approval.

One material decision should have one primary owner.

High-risk authors must not independently approve their own work.

## External mutations

Forbidden during this command:

- editing, deleting or renaming agents or commands;
- changing application code;
- deploying or running migrations;
- sending messages or creating external tasks;
- mutating production, configuration or external accounts;
- committing, pushing or opening pull requests.

Access is not authorization.

The only permitted write is creation or update of the command’s canonical audit report.

## Missing input

Complete all safe analysis first.

Return `needs_input` when missing information affects:

- strategy;
- project phase;
- ownership;
- pricing;
- legal, security or safety;
- external authority;
- critical architecture;
- breaking changes;
- removal of an agent or mandatory gate;
- project canon;
- tool availability;
- interpretation of two genuinely conflicting current operator decisions.

Do not use `needs_input` to reopen an otherwise clear settled decision.

Do not guess.

## Critical invariants

The audit must preserve and inspect:

- authentication and authorization;
- tenant, account and environment isolation;
- data integrity;
- privacy;
- money, currency and pricing;
- time and timezone;
- public claims;
- API compatibility;
- physical and manufacturing constraints where applicable;
- safeguards around consequential decisions.

## Review gates

Verify appropriate triggers for:

- security;
- privacy and legal;
- financial changes;
- technical and product claims;
- quality and model evaluation;
- customer remedies;
- accessibility;
- release readiness.

Gates must report:

- risk;
- evidence;
- severity;
- mitigation;
- unblock condition.

## Repository safety

The command may read git history and working-tree state.

It must not:

- reset or overwrite work;
- use destructive commands;
- commit;
- push;
- create branches;
- modify unrelated files.

## Completion

Allowed statuses:

```text
completed
completed_with_followups
partial
needs_input
blocked
rejected
```

The report must state:

- outcome;
- evidence;
- assumptions;
- validation;
- risks;
- decisions;
- handoffs;
- external changes.

---

# Arguments

- `--full` — complete audit; default
- `--delta` — changed objects plus unresolved previous findings
- `--roster` — agent roster only
- `--commands` — command roster only
- `--handoffs` — ownership and workflow only
- `--since=<commit|date>` — requires an initialized git repository; unavailable until the repo is created
- free-form constraints

Examples:

```text
/audit-agent-system
/audit-agent-system --full
/audit-agent-system --delta
/audit-agent-system --roster
/audit-agent-system --commands
/audit-agent-system --since=2026-06-01
```

Calling `/audit-agent-system` without arguments is equivalent to:

```text
/audit-agent-system --full
```

---

# When to run

Run:

- once after installing this command;
- after a milestone lands green (ROADMAP.md), not on a calendar cadence;
- before the first port is authorized (Phase B);
- after adding or removing several agents or commands, or when the roster grows past four agents;
- after a change to the document precedence chain or to the ARCHITECTURE.md §4 constraints;
- when agents repeatedly conflict;
- when ownership becomes unclear.

Do not run after every minor prompt edit.

---

# Step 0 — Discover the project

Read:

1. root `CLAUDE.md`;
2. all applicable `AGENTS.md`, if any exist (absence is not by itself a finding);
3. project strategy, product and architecture documents;
4. `.claude/agents/*.md`;
   4b. user-level agents in `~/.claude/agents/*.md` — they resolve in this project and are invisible to a
   project-only scan, so a filesystem sweep of `.claude/agents/` alone under-counts the roster;
5. `.claude/commands/*.md`;
6. skills, plugins and tools referenced by prompts;
7. current code structure;
8. package scripts;
9. relevant recent git history;
10. previous agent-system audit;
11. current explicit operator decisions recorded in project instructions, decision records or the current conversation context available to Claude Code.

Do not look for or depend on `docs/agents/agent-principles.md`.

The operator has explicitly retired the external universal-principles document in favor of the embedded governance in:

```text
.claude/commands/audit-agent-system.md
.claude/agents/agent-system-auditor.md
```

This is a settled operator decision.

Therefore:

- do not recommend retaining or restoring `docs/agents/agent-principles.md` merely because it is useful or well written;
- treat remaining references to it as incomplete migration;
- verify that affected agent prompts remain sufficiently self-contained;
- propose transfer of only the domain-relevant rules each agent actually needs;
- do not copy the entire universal constitution into every domain-agent prompt;
- remove stale references before proposing deletion of the old document;
- report a genuine blocker only when the migration would violate the settled-decision guard.

Determine:

- product or project;
- users;
- business model;
- architecture;
- current phase;
- active channels;
- providers;
- critical domains;
- operator workflow.

If phase is inferred, label it.

If essential project context cannot be established, return `needs_input`.

---

# Step 1 — Inventory agents and commands

Inventory all current agents and commands.

Report separately:

```text
agent_prompt_files
active_named_agents
disabled_or_archived_agent_files
invalid_agent_files
command_files
active_named_commands
```

Do not use one unexplained count when files and active agents differ.

For every agent capture:

- name;
- description;
- role type;
- responsibilities;
- decision rights;
- out of scope;
- inputs;
- outputs;
- evidence requirements;
- tools;
- delegations;
- gates;
- sources;
- completion format;
- references and callers;
- references to settled or superseded decisions.

For every command capture:

- trigger;
- cadence;
- arguments;
- agents invoked;
- files read and written;
- external actions;
- approval boundary;
- durable state;
- idempotency;
- terminal condition;
- output;
- relationship to settled operator decisions.

Search the repository for every agent and command name.

Detect:

- dead references;
- renamed agents;
- commands calling missing agents;
- agents referring to removed files;
- stale references to an external principles document;
- commands nobody can complete;
- agents never referenced;
- partially implemented settled decisions.

An unreferenced agent is not automatically obsolete. It may be directly invoked or reserved for rare high-risk work.

---

# Step 2 — Invoke independent auditor

Invoke `agent-system-auditor` with:

- project model;
- full inventories;
- relevant code and documentation;
- previous audit;
- changes since `--since`, if applicable;
- explicit read-only mode;
- known settled operator decisions;
- known superseded artifacts;
- instruction to distinguish migration residue from genuine disagreement.

Request:

- constitution compliance;
- settled-decision compliance;
- ownership matrix;
- overlaps;
- contradictions;
- black holes;
- handoffs;
- authority conflicts;
- tool mismatch;
- roster decisions;
- new-agent proposals;
- removal, merge, split and rename proposals;
- command decisions;
- exact patch plan.

The auditor’s recommendation is evidence, not automatic approval.

The auditor may not reopen a settled operator decision without satisfying the settled-decision guard.

---

# Step 3 — Agent self-audits

For `--full`, invoke every current agent in parallel batches.

Skip `agent-system-auditor` itself: a self-audit by the sole auditor is the biased evidence this command already discounts, and the auditor holds no `Agent` tool. When no other project agent exists, Step 3 is a no-op — record it as such rather than as coverage. This is a clarification, not a scope reduction.

Shared self-audit prompt:

```text
Audit your own definition against the current project.

MODE: AUDIT. Remain read-only.

Explicit current operator decisions are binding constraints.
Do not reopen them based on preference, historical usefulness or migration effort.
If an older source contradicts a later operator decision, classify it as stale migration residue unless new evidence proves a concrete safety, legal, security, irreversible-loss or technical-impossibility blocker.

Return:

ROLE_STATUS:
CURRENT | NEEDS_UPDATE | REDUNDANT | OVERLOADED |
MISSING_AUTHORITY | EXCESS_AUTHORITY | NEEDS_INPUT

UNIQUE_RESPONSIBILITIES:
- ...

OVERLAPS:
- ...

WRONG_OR_ADJACENT_WORK:
- responsibilities you receive but should not own

UNOWNED_WORK:
- relevant work with no owner

COMMAND_USAGE:
- commands that should invoke you but do not
- commands that invoke you unnecessarily

STALE_CONTEXT:
- files, product assumptions, tools, providers, prices,
  markets, terminology or workflows that are no longer current

SETTLED_DECISIONS:
- applicable settled operator decisions
- migration residue that contradicts them
- genuine blockers, if any, with new evidence

CONSTITUTION:
- authority, mutation, gate, evidence or completion problems

RECOMMENDATION:
KEEP | UPDATE | MERGE | SPLIT | RENAME | REMOVE

EVIDENCE:
- exact files and references

Do not defend your existence merely because you currently own the role.
Do not edit files.
```

For `--delta`, invoke:

- changed agents;
- agents referenced by changed commands;
- agents affected by unresolved findings;
- neighboring agents affected by proposed roster changes;
- agents still referencing superseded sources.

Self-audits do not decide roster changes. Existing agents may be biased toward preserving their roles or historical sources.

---

# Step 4 — Constitution compliance

For every agent and command evaluate:

## Context

- project purpose;
- phase;
- users;
- scope;
- owners;
- gates;
- success.

## Mode

Is the allowed mode clear?

Does audit incorrectly authorize implementation?

Does design authorize launch?

Does verify silently fix findings?

## Human authority

Does the prompt preserve operator authority over:

- strategy;
- pricing and budget;
- production;
- breaking changes;
- publication and outbound;
- external systems;
- legal commitments;
- irreversible risk?

## Settled decisions

For each relevant explicit operator decision, determine:

```text
IMPLEMENTED
PARTIALLY_IMPLEMENTED
NOT_IMPLEMENTED
CONTRADICTED_BY_STALE_SOURCE
VALIDLY_BLOCKED
NEEDS_INPUT
```

Do not classify a decision as `NEEDS_INPUT` merely because an older artifact recommends something else.

A `VALIDLY_BLOCKED` result requires new evidence of:

- security, privacy, legal, financial or safety violation;
- critical-invariant breakage;
- technical impossibility;
- previously undisclosed material irreversible loss;
- contradiction between later operator decisions.

For every incomplete decision identify:

- migration residue;
- affected agents and commands;
- safe migration order;
- verification required;
- whether operator input is genuinely necessary.

## Role type

Is it clear whether the agent is:

- domain owner;
- evidence specialist;
- implementer;
- operator;
- gate;
- workflow or transformation agent?

## Decision rights

Is there one primary owner?

Does consultation accidentally transfer authority?

## Sources and evidence

Are canonical sources and evidence standards defined?

Are mutable facts duplicated in prompts?

Are assumptions marked?

Does the prompt incorrectly treat historical documentation as equal to a later operator decision?

## Critical invariants

Does the prompt trigger relevant checks for:

- authentication;
- isolation;
- integrity;
- privacy;
- money;
- time;
- claims;
- APIs;
- physical operations;
- consequential decisions?

## Review gates

Are security, privacy, legal, financial, technical, accessibility, QA and release gates applied by trigger?

## External mutations

Does access get confused with permission?

Are irreversible actions scoped and approved?

## Repository safety

Does implementation preserve a dirty worktree, use minimal patches and avoid destructive git actions?

## Delegation

Are handoffs self-contained?

Are adjacent issues routed correctly?

## Verification

Are acceptance criteria, tests, negative cases and limitations required?

## Completion

Are statuses honest?

Can partial work be called completed?

Does output show evidence, validation, risks and external changes?

Classify:

```text
COMPLIANT
PARTIALLY_COMPLIANT
CONTRADICTORY
UNSAFE
NOT_APPLICABLE
```

Do not fail an agent merely because it does not repeat the complete constitution.

Fail it when required behavior is missing, ambiguous or contradictory.

---

# Step 5 — Ownership coverage

Build:

| Domain | Decision owner | Evidence | Implementation | Independent review | Operator |
| ------ | -------------- | -------- | -------------- | ------------------ | -------- |

Identify:

- missing owners;
- multiple decision owners;
- missing implementation;
- missing independent gate;
- unnecessary duplicated review;
- unclear operator authority.

Before recommending a new agent, consider:

1. clarify an existing agent;
2. improve a handoff;
3. update a command;
4. only then create a new agent.

---

# Step 6 — Find overlaps, contradictions and black holes

## Overlaps

Classify:

- legitimate collaboration;
- unclear boundary;
- direct contradiction;
- duplicate role;
- conflict of interest.

## Contradictions

Compare:

- prompts;
- commands;
- current operator decisions;
- approved decision records;
- project canon;
- actual code;
- tools;
- workflow state;
- historical and superseded artifacts.

For each contradiction determine whether it is:

```text
ACTIVE_DECISION_CONFLICT
STALE_MIGRATION_RESIDUE
BEHAVIOR_VS_INTENT_DRIFT
UNCLEAR_CANON
```

A historical document contradicting a later explicit operator decision is normally `STALE_MIGRATION_RESIDUE`, not an open governance choice.

Report both rules, their precedence and the practical consequence.

## Black holes

Find work with:

- no decision owner;
- no implementer;
- no reviewer;
- no next handoff;
- no durable state;
- no operator boundary.

## Broken handoffs

Inspect:

```text
research
→ decision
→ requirement or brief
→ implementation
→ independent review
→ release
→ monitoring
→ feedback
```

Every transition needs:

- input;
- output;
- owner;
- recipient;
- acceptance;
- blocking behavior.

---

# Step 7 — Agent roster decisions

Classify every current and proposed agent:

```text
KEEP
KEEP_BUT_UPDATE
ADD
REMOVE
MERGE
SPLIT
RENAME
NEEDS_DECISION
```

## Add

A new agent requires:

- durable recurring material domain;
- missing unique ownership;
- evidence that existing agents are insufficient;
- clear authority and boundaries;
- commands or workflows that will use it.

Provide a prompt-ready specification:

- name and description;
- role and mission;
- responsibilities;
- decisions;
- out of scope;
- inputs and outputs;
- evidence;
- tools;
- delegation;
- gates;
- verification;
- completion;
- needed now or later.

Do not create a new agent merely because a stale memory names one.

First determine whether:

- the workflow remains current;
- an existing agent can own the responsibility;
- the reference should simply be removed.

## Remove

Require:

- evidence of obsolescence or redundancy;
- responsibility migration;
- reference migration;
- affected commands;
- risk analysis.

Do not remove rare security, legal or incident gates solely due to low frequency.

## Merge

Use only when roles duplicate authority and independent separation has no value.

## Split

Use when one agent combines incompatible domains, implementation and gate authority, or materially different tools.

## Rename

Use when a name misrepresents authority or causes recurring confusion.

Do not apply changes.

Do not reopen a settled roster or governance decision unless the settled-decision guard is satisfied.

---

# Step 8 — Command roster decisions

Classify:

```text
KEEP
UPDATE
ADD
REMOVE
MERGE
RENAME
NEEDS_DECISION
```

Recommend `ADD` only for recurring multi-agent workflows where order, approvals, state or report consistency matter.

Do not create commands for one-off tasks or work already owned well by one agent.

Audit:

- trigger and cadence;
- scope and arguments;
- agent routing;
- tools;
- state and idempotency;
- approvals;
- missing-data behavior;
- terminal condition;
- honest completion;
- compliance with settled operator decisions.

A command may optimize parallelism, delegation and report aggregation without reducing an explicitly required audit scope.

---

# Step 9 — Validate recommendations

The root orchestrator independently validates:

- auditor findings;
- self-audits;
- project evidence;
- current operator decisions;
- code and references;
- workflow consequences.

Reject recommendations based solely on:

- similar names;
- prompt length;
- low invocation frequency;
- generic industry practice;
- aesthetic preference for fewer or more agents;
- quality or usefulness of a superseded artifact;
- migration effort;
- preference for the previous architecture.

Require confidence:

```text
CONFIRMED
LIKELY
POSSIBLE
NEEDS_INPUT
```

Before presenting an operator decision, verify that it has not already been explicitly decided.

If already decided:

- report implementation status;
- report migration residue;
- do not ask the operator to choose again.

If a recommendation depends on a genuinely unresolved product strategy or authority question, return a decision request rather than silently choosing.

---

# Step 10 — Severity

## P0

- unsafe external authority;
- missing owner for a critical invariant;
- author self-approves high-risk work;
- contradictory production permissions;
- mandatory gate absent;
- obsolete agent controls an active high-risk workflow;
- stale migration residue causes a live security, legal, privacy or data-integrity failure.

## P1

- recurring black hole;
- duplicate primary authority;
- important stale prompt;
- broken command terminal condition;
- missing tool;
- command reports incomplete work as completed;
- required handoff missing;
- settled operator decision remains materially incomplete;
- a command or agent improperly reopens a settled decision.

## P2

- naming;
- efficiency;
- report consistency;
- non-critical dead references;
- future roles or commands;
- prompt maintainability;
- harmless migration residue.

---

# Step 11 — Persistent report

Preferred report:

```text
docs/agents/agent-system-audit.md
```

This command explicitly authorizes creation or update of this audit report.

If the project has an established different path, use it and report the choice.

Do not create duplicate reports.

The report must contain:

```markdown
# Agent System Audit — {project}

**Verdict: HEALTHY | NEEDS_CHANGES | UNSAFE | NEEDS_INPUT**

## Project model

...

## Inventory

...

## Settled operator decisions

| Decision | Source | Status | Migration residue | Blocker |
| -------- | ------ | ------ | ----------------- | ------- |

## Constitution compliance

| Object | Compliance | Violation | Severity |
| ------ | ---------- | --------- | -------- |

## Ownership

| Domain | Decision | Evidence | Implementation | Review | Operator |
| ------ | -------- | -------- | -------------- | ------ | -------- |

## Agent roster

| Agent | Decision | Evidence | Priority |
| ----- | -------- | -------- | -------- |

## Agents to add

...

## Agents to remove

...

## Merge/split/rename

...

## Overlaps

...

## Contradictions

...

## Stale migration residue

...

## Black holes

...

## Broken handoffs

...

## Unsafe authority

...

## Command roster

| Command | Decision | Evidence | Priority |
| ------- | -------- | -------- | -------- |

## Commands to add

...

## Commands to update/remove/merge

...

## Tools and references

...

## Efficiency

...

## P0

...

## P1

...

## P2

...

## Exact patch plan

### ADD

- ...

### EDIT

- ...

### MERGE

- ...

### SPLIT

- ...

### RENAME

- ...

### DELETE

- ...

## Operator decisions

Include only genuinely unresolved decisions.

Do not include decisions already explicitly settled by the operator.
```

---

# Step 12 — Final response

Use:

```text
STATUS:
completed | completed_with_followups | partial | needs_input | blocked | rejected

PROJECT_PHASE:
DESIGN | PRE_LAUNCH | PRIVATE_BETA | PUBLIC_BETA | LAUNCHED | SCALE | N/A

MODE:
AUDIT

OUTCOME:
[Agent-system verdict]

DONE:
- [Audited agents, commands and workflows]

EVIDENCE:
- [Files, references, code and self-audits]
- [Explicit assumptions]

CHANGES:
- docs/agents/agent-system-audit.md
- or none

INVARIANTS:
- Human authority preserved
- Settled operator decisions preserved
- No external mutations
- No automatic roster changes
- Required gates preserved

VALIDATION:
- [Reference searches]
- [Ownership coverage]
- [Settled-decision migration check]
- [Recommendation validation]
- [Known limitations]

RISKS:
- [Remaining risks]
- none identified

DECISIONS_REQUIRED:
- [Only genuinely unresolved decisions]
- none

HANDOFFS:
- TO: user | relevant owner | none
  TASK: [self-contained action]
  WHY:
  BLOCKING: yes | no

NEXT:
[Approve selected changes, or none]

EXTERNAL_CHANGES:
none
```

Also include:

```text
VERDICT: HEALTHY | NEEDS_CHANGES | UNSAFE | UNDECIDED
ROSTER: add N · update N · merge N · split N · rename N · remove N
COMMANDS: add N · update N · merge N · rename N · remove N
SETTLED_DECISIONS: implemented N · partial N · blocked N
```

---

# Step 13 — Applying approved changes

Do not apply recommendations during this command.

The operator may approve:

- all;
- selected item numbers;
- P0 only;
- roster only;
- commands only.

Apply approved prompt changes in a separate implementation task.

Before deleting a superseded governance artifact:

1. find all references;
2. classify each reference;
3. make affected prompts self-contained for their own domain;
4. remove stale references;
5. verify no governance black hole was created;
6. delete only after reference migration;
7. verify repository-wide absence of unintended references.

After implementation run:

```text
/audit-agent-system --delta
```

Verify:

- old references removed;
- responsibilities migrated;
- settled decisions implemented;
- no new black holes;
- commands use the current roster;
- mandatory gates remain;
- authority remains consistent.

---

# Model assignment audit

As part of every normal audit, inspect the model assignment of every active agent.

This is mandatory and does not require a separate command mode or argument.

## Requirements

Every active agent in `.claude/agents/*.md` must explicitly declare a model in its frontmatter:

```yaml
model: <supported-model>
```

Model inheritance is forbidden.

The following are findings:

- `model` is missing;
- `model: inherit`;
- an empty or invalid model value;
- an obsolete or unsupported model;
- a model unavailable in the current Claude Code environment;
- a model materially stronger and more expensive than the agent’s recurring work requires;
- a model too weak for the agent’s risk, reasoning complexity or output requirements.

Do not assume that the main conversation model is appropriate for a subagent. The parent model may change between runs and must not determine the agent’s effective capability.

## Current-model verification

Model availability, names, capabilities and pricing change over time.

During every audit:

1. inspect the current official Claude Code documentation for supported subagent model values;
2. inspect project and user-level Claude Code configuration for model restrictions or overrides;
3. determine which models are actually available to the operator;
4. verify every declared model against the current environment;
5. do not rely on model names or capability assumptions copied from an older audit.

Use current official documentation as the canonical source for model support.

If current model availability cannot be verified, do not silently preserve or invent an assignment. Mark it `NEEDS_INPUT` and state what must be confirmed.

## Selection principle

Assign the least expensive currently supported model that can reliably perform the agent’s normal responsibilities at the required quality and risk level.

Cost optimization must not reduce the reliability of critical work.

Evaluate each agent using:

- reasoning depth;
- ambiguity of inputs;
- need to reconcile conflicting evidence;
- technical complexity;
- context size;
- number and complexity of tools;
- autonomy;
- consequence of an incorrect result;
- security, privacy, legal, financial or production risk;
- need for precise implementation;
- need for nuanced writing or localization;
- frequency of invocation;
- availability of independent downstream review.

Do not classify an agent as cheap merely because its role contains words such as “research”, “review”, “writer” or “support”. Judge its actual responsibilities and failure cost.

## Capability guidance

Use a fast/economical model for work that is primarily:

- structured extraction;
- straightforward classification;
- formatting;
- deterministic transformations;
- simple repository inventory;
- narrow research with explicit criteria;
- repetitive checks with strong downstream validation.

Use a balanced general-purpose model for work that requires:

- normal implementation;
- multi-source research and synthesis;
- content drafting;
- SEO or marketing analysis;
- API and product reasoning;
- moderate ambiguity;
- tool orchestration;
- reliable judgment without exceptional risk.

Use the strongest reasoning model for work that involves:

- architecture across multiple domains;
- security or privacy gates;
- legal or financial risk;
- production incidents;
- critical data integrity;
- complex migrations;
- conflicting requirements;
- release or go/no-go synthesis;
- auditing the complete agent system;
- decisions where an incorrect recommendation has material consequences.

These are selection criteria, not permanent mappings to specific model names. Resolve the actual supported model for each tier during the audit.

## Existing assignments

For every agent with an existing model:

- verify that the model still exists and is supported;
- verify that it remains appropriate for the agent’s current prompt;
- detect capability drift after the agent’s responsibilities changed;
- detect unnecessary cost;
- detect unsafe downgrades;
- recommend a change when a better current model exists.

Do not preserve an assignment merely because it was explicitly configured earlier.

## Missing assignments

When `model` is absent or inherited:

1. determine the agent’s required capability tier;
2. select a specific currently supported model;
3. provide the exact frontmatter change;
4. explain the quality and cost rationale;
5. identify any uncertainty or required operator input.

Example patch:

```yaml
---
name: example-agent
description: ...
model: <recommended-supported-model>
tools: ...
---
```

Do not write `model: inherit`.

## Classification

Classify every active agent:

```text
CORRECT
MISSING
OVERPOWERED
UNDERPOWERED
STALE
UNSUPPORTED
NEEDS_INPUT
```

Definitions:

- `CORRECT` — explicit, supported and proportionate assignment;
- `MISSING` — model is absent, empty or inherited;
- `OVERPOWERED` — a cheaper model should reliably satisfy the role;
- `UNDERPOWERED` — the assigned model creates material quality or safety risk;
- `STALE` — assignment was valid previously but should be reconsidered because models or responsibilities changed;
- `UNSUPPORTED` — the configured model is unavailable or invalid;
- `NEEDS_INPUT` — availability, plan restrictions or material requirements cannot be established.

## Required report section

Include this section in the normal audit report:

```markdown
## Agent model assignments

| Agent | Declared model | Status                                                                 | Recommended model | Rationale | Priority |
| ----- | -------------- | ---------------------------------------------------------------------- | ----------------- | --------- | -------- |
| ...   | ...            | CORRECT/MISSING/OVERPOWERED/UNDERPOWERED/STALE/UNSUPPORTED/NEEDS_INPUT | ...               | ...       | P0/P1/P2 |

### Required model changes

1. `agent-name`
   - Current:
   - Recommended:
   - Reason:
   - Quality risk:
   - Expected relative cost effect:
   - Exact patch:

### Model environment

- Official source checked:
- Checked at:
- Supported models:
- Configuration overrides:
- Availability limitations:
- Unverified assumptions:
```

Do not state precise cost savings unless actual usage and current pricing data support the calculation. Otherwise use relative estimates such as:

```text
lower
approximately unchanged
higher
unknown
```

## Applying model assignments

This audit remains read-only.

It must:

- identify missing or incorrect assignments;
- select the recommended model;
- include exact frontmatter patches in the audit report;
- include those patches in the overall exact patch plan.

It must not edit agent prompts during the audit.

Model changes are applied only after explicit operator approval through a separate implementation task.

# Hard rules

- Audit mode is read-only except for the audit report.
- Do not depend on an external agent-principles document.
- Treat the retirement of that document as a settled operator decision.
- Flag remaining references as incomplete migration.
- Do not recommend restoring a superseded artifact merely because it is useful or well written.
- Do not reopen any settled operator decision without new qualifying evidence.
- Distinguish migration difficulty from technical impossibility.
- Explicitly recommend agents to add and remove.
- Never automatically alter the roster.
- Never preserve obsolete agents merely because they exist.
- Never remove an independent gate merely for simplicity.
- Never create one agent per minor topic.
- Never create an agent solely because stale memory mentions one.
- Never treat low usage as proof of irrelevance.
- Resolve ownership before creating agents.
- Treat self-audits as evidence, not authority.
- Cite exact files and workflow consequences.
- Ask for genuinely missing strategy, tools or authority.
- Do not ask the operator to decide the same settled question again.
- Human operator approves all structural changes.
- Every active agent must have an explicit supported model; `model: inherit` and omitted model assignments are not allowed.
- Audit model assignments during every normal run; do not require a separate model-audit mode.
- Do not apply model changes automatically—the audit provides exact patches for operator approval.
