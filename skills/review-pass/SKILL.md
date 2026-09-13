---
name: review-pass
description: >
  A fresh-context review of everything a gate covers, run before the gate is opened. The
  orchestrator spawns a reviewer with these instructions and the rubric; the reviewer reads,
  finds, proposes fixes and writes a verdict, and never edits an artifact. Use before Gate A,
  B and C, and again after each revision round, at most two rounds.
metadata:
  version: 0.1.0
user-invocable: false
---

# Skill: Review pass

**Purpose:** catch what a director cannot see in its own work before a person is asked to lock it.
**Used by:** the orchestrator, at rows 1h, 2f and 3c of 1-22, as the instructions of a spawned reviewer.

## Inputs

- The gate letter and the round number.
- `${CLAUDE_PLUGIN_ROOT}/playbooks/review-rubrics.md`, the section for that gate.
- Every artifact the gate covers, at the paths the rubric names, plus the playbook each director followed and the client's template under `workspaces/{client}/client/templates/`.
- `revisions/*.json` from the previous round, if any.

## Spawn

One general subagent: Read, Glob, Grep, `disallowedTools: Agent`; this file, the rubric section, absolute artifact paths and the output path in the prompt. It has no memory of writing anything.

## Steps

1. Read the rubric section, then every artifact it names, then the playbook and the template.
2. Answer every rubric item yes or no. A no is a finding.
3. Place each finding: file and line, cell, panel id or shot id. Unplaceable means `investigation` or dropped.
4. One finding of a class (a scene number, an unknown copied as zero, a name spelled two ways) means scanning the whole artifact for that class and listing every instance.
5. Severity per finding; for critical and should, the fix as the director applies it: the value, the row, the cell.
6. Write `validation/review-{gate}-{round}.md` on the contract below.
7. Any critical finding is NEEDS REVISION; only should and nitpick is GO with warnings. There is no round 3.

## Rules

1. Every finding names a place. File and line, cell, panel or shot id.
2. One error found means the whole artifact is scanned for its class.
3. Critical means the gate cannot honestly open: a rubric no, a missing template column, an agent-typed XX value, an unrecorded version. Wordiness is a nitpick.
4. Every critical or should finding carries a fix. Without one it is `investigation`, which never blocks.
5. Review the artifact, not how it was made. A strange route to a correct file is not a finding.
6. The playbook and the client's template are law. Where they disagree, the template wins.
7. Two rounds maximum. The third pass is the person's, at the gate.
8. Never edit, rename or write an artifact. The reviewer writes one file, the review.

## Output contract

`validation/review-{gate}-{round}.md`:

```
# Review {gate}, round {n}
Rubric: {items answered} of {items}; no on: {ids}

| Severity | Where | What | Fix |
|---|---|---|---|
| critical | shot-list.csv line 14 (S007) | scene 4 is not in script/v3.md | change scene to 3 or add scene 4 to the script |

Verdict: NEEDS REVISION | GO | GO with warnings
Items: {item}: {reason code from templates/revision.json}
```

## Boundary

The reviewer does not decide the gate (a person does, on the board), run the check scripts (the orchestrator hands their output in) or judge the brief's intent (the creative director does).

## Failure modes

| Failure | Fix |
|---|---|
| A finding with no place | Drop it, or mark `investigation` |
| "The script feels flat" | Not a finding; name the scene and the rubric item |
| Critical inflated from a nitpick | Severity by consequence at the gate, not by taste |
| Finding one wrong scene number and stopping | Scan every row for scene numbers |
| Reviewer edits the file to fix it | Never; the fix goes in the table |
| Round three | Open the gate with warnings; the person decides |
