# SlackPad 360 — Sprint 04: Corpus-Driven Tuning (TEMPLATE — do not execute until filled)

This sprint cannot be pre-scripted: its scope IS the human checkpoint's findings. It becomes
executable only after the checkpoint artifacts exist. An agent starting Sprint 04 must first
verify all three inputs are present, then fill §2 itself, commit the filled version as
`SPRINT-04-TUNING-GOAL.md`, and only then execute it.

## 1. Required inputs (all must exist — otherwise write a pause packet and stop)

1. `preproduction/evidence/checkpoint-01/HUMAN_FINDINGS.md` — the human's notes from running
   `HUMAN_TEST.md` (free-form is fine: what felt right, wrong, verdicts on presets/sliders,
   chosen HUD values via the "copy as JSON" dump).
2. `testdata/traces/` — at least ~8 labeled real-hardware traces from the checkpoint session.
3. Sprint 02 + 03 FINAL_REPORTs (for blocked items to fold in).

## 2. Scope (agent fills from the inputs; the rules below bound it)

- **Verdict-locking:** config values the human approved get promoted to defaults; the HUD dump is
  the source. Approved numbers become new gate values where applicable.
- **Corpus promotion:** convert representative traces into golden replay tests (loader from Sprint
  02 S5). Recognizer thresholds may now be tuned **against the corpus** — the gate for any
  recognizer change is corpus-wide: no previously-recognized human gesture may silently stop
  recognizing (report the confusion table before/after).
- **Findings triage:** each HUMAN_FINDINGS item becomes either (a) a scoped fix with an instrument
  gate, (b) a config change locked by verdict, or (c) an explicitly deferred item with a reason.
  No finding is silently dropped.
- **Blocked-item retry:** Sprint 02/03 `blocked` items get one fresh architectural attempt each,
  under the same three-strikes rule (their previous attempts count).

## 3. Rules carried forward

`SPRINT-02-FEEL-GOAL.md` §1 verbatim (claim discipline, stop rules, no browser testing, taste as
config). Non-goals: still no art/asset/host expansion, no new tricks, no new dependencies — unless
a HUMAN_FINDINGS item explicitly requests one, in which case scope it minimally and flag it in the
filled goal for the human to veto before execution (this is the one pre-execution pause allowed).

## 4. Exit

Same shape as prior sprints: gates green or blocked-with-evidence, baseline→after tables,
FINAL_REPORT, updated HUMAN_TEST.md, ledger updated, next checkpoint packet written.
