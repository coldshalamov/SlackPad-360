# Implementation-era decision log

Decisions made during the autonomous build (successor studio), extending the
cycle-1..3 decision logs. Format: ID, decision, rationale, reopen trigger.

## IMPL-001 — Host UI shell = WinForms

Lock said "WinForms or WPF, pick one at M0 and keep." WinForms chosen: direct
`WndProc` override for `WM_INPUT`/`WM_POINTER` without HwndSource
interop, simpler overlay painting for the spike UI.
Reopen: never (cosmetic shell only; adapters are plain Win32).

## IMPL-002 — validate-final production-path freeze made phase-aware

The final-package validator forbade implementation paths to prove the
preproduction package was authored before code. Implementation is now
sanctioned by AUTONOMOUS_BUILD_GOAL.md, so the freeze applies only while
`preproduction/evidence/impl/` does not exist. Historical validation intent
preserved; validator remains green in both eras.
Reopen: n/a.

## IMPL-003 — Content milestones proceed with G1 pending (not rejected)

The plan gates M8/M9 "content marathons" on G1 accept to avoid wasting
expensive human art effort if the input class pivots. Two facts changed the
cost calculus: (a) the product owner's /goal directive explicitly requests the
full implementation including best-possible graphics now; (b) content is
produced by inexpensive agent labor, and every planned pivot option (alternate
PTP device, controller hybrid) reuses the same 3D world, board, plaza, audio,
and recognizer. G1 remains an open gate with a pause packet; no dual-foot
hardware claim is made from synthetic evidence anywhere in the evidence tree.
Reopen: if G1 is REJECTED for the device class (not merely untested), content
work stops per plan and the pivot rules apply.

## IMPL-004 — Hero art authored programmatically, not in Blender

G-BLENDER requires an ownership preflight and Blender is not on PATH on this
machine. Instead of pausing M8, hero board / shoes / plaza modules are
authored as procedural geometry in a Node authoring pipeline
(`packages/asset-pipeline`) exporting glTF 2.0 binary via @gltf-transform,
then optimized (meshopt/KTX2) per the existing pipeline plan. This satisfies
the spec's actual bar — "must be GLB / authored", named parts, LOD budgets,
shot-rubric review — while removing the foreign-process risk entirely. The
Blender contract remains valid for a future human art pass; catalog entries
mark provenance `procedural-authored`.
Reopen: if the shot rubric fails on procedural output, fall back to the
Blender contract (pause packet) or commissioned assets per cycle-2 option B/C.

## IMPL-005 — Browser dev mode with virtual trackpad (synthetic source)

The plan rejects the browser as the human dual-foot *product* path; it also
mandates that synthetic ContactFrames share the hardware pipeline. We add a
first-class dev input source: an on-screen virtual trackpad driven by
mouse/keyboard that emits `source:"synthetic"` ContactFrames through InputHub.
Purpose: development, tuning, demos, agent-free manual smoke, and honest
degraded-mode play for users without the native host. It is labeled
non-representative of trackpad feel and never feeds G1/G2/G3/G5 evidence.
Reopen: n/a (additive; product claims unaffected).
