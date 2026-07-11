# Implementation Milestones (M0–M10)

**Status:** Normative dependency order
**Machine-readable:** `milestones.json`
**Rule:** Failed **G1** stops expensive content (M8 plaza hero marathon, M9 content freeze). Synthetic may continue only if reusable after input pivot (M2–M5 recognizer/sim).

---

## M0 — Environment / toolchain smoke and repository guardrails

| Field | Content |
| --- | --- |
| Scope | Install Node engines, .NET 10 SDK if missing, pin packages, monorepo skeleton, validators, CI smoke |
| Inputs | `dependency-lock.json`, this package |
| Modules/files | `package.json` pins, `host/*.csproj` net10.0-windows, README dev setup |
| Tests | JS Rapier/Three smoke; `dotnet restore/build` host empty shell; validators |
| Agent scenarios | n/a |
| Visual | n/a |
| Perf budget | n/a |
| Human/device gate | None |
| Failure/pivot | If net10 unavailable and install blocked → pause with exact SDK instructions |
| Commit | `chore(m0): toolchain lock + repo guardrails` |

## M1 — P0 native dual-contact hardware spike

| Field | Content |
| --- | --- |
| Scope | Both Win11 pointer + Raw Input adapters; ContactFrame JSONL; metrics; optional blank WebView2 post test |
| Inputs | M0; input-platform rules |
| Modules | `host/` adapters, writer, spike UI dots |
| Tests | Synthetic HID fixtures if available; schema validation of traces |
| Agent | n/a |
| Visual | Contact dots on blank page OK |
| Perf | Sample ≥60 Hz contacts |
| Gate | **G1** accept/reject/pause |
| Failure | G1 reject → **stop content**; pivot input only |
| Commit | `feat(m1): dual adapter ContactFrame spike` |

## M2 — ContactFrame, replay, agent, deterministic sim skeleton

| Field | Content |
| --- | --- |
| Scope | InputHub multi-source; replay header; AgentHarness; Rapier world fixed step; first goldens |
| Inputs | M0 (can parallel M1 for software path) |
| Modules | `packages/game` sim, shared types |
| Tests | GT-malformed/noisy; replay-hash; agent contract |
| Agent | reset/inject/step/observe |
| Visual | debug board box OK |
| Perf | step budget log |
| Gate | G4/G6 structural |
| Failure | Non-determinism → fix before features |
| Commit | `feat(m2): ContactFrame pipeline + rapier skeleton` |

## M3 — Foot tracking/calibration and ground locomotion

| Field | Content |
| --- | --- |
| Scope | Stance, padYawOffset, push, steer, soft recenter |
| Inputs | M2 |
| Tests | Foot-id reassignment; plant mask; continuous force |
| Agent | Ground locomotion scenarios via frames |
| Visual | Board on ground plane |
| Commit | `feat(m3): feet + push/steer ground` |

## M4 — Ollie/nollie catch/land/bail

| Field | Content |
| --- | --- |
| Scope | Pop, air phase, catch volumes, land cones, bail |
| Inputs | M3 |
| Tests | GT-catch/land/bail/interrupt |
| Agent | Ollie sequences from frames only |
| Gate | Slice core software complete |
| Commit | `feat(m4): ollie nollie catch land bail` |

## M5 — Flips/shuvs and recognizer conflicts

| Field | Content |
| --- | --- |
| Scope | Kickflip, heelflip, FS/BS shuv 180, conflict table |
| Inputs | M4 |
| Tests | GT-recog-conflict; heelside/toeside correctness |
| Commit | `feat(m5): flips shuvs recognition` |

## M6 — Grind: 50-50 then boardslide

| Field | Content |
| --- | --- |
| Scope | Grind detection, family classify, latch, balance, exit; 50-50 first; boardslide family |
| Inputs | M5; **prefer G1 accept** before human G2 |
| Tests | GT-grind; boardslide entry |
| Gate | **G2** formative pause |
| Failure | Unfair magnet → retune; do not expand city content |
| Commit | `feat(m6): fifty-fifty and boardslide` |

## M7 — Camera, shoes animation, failure presentation

| Field | Content |
| --- | --- |
| Scope | Shot modes, procedural shoes, bail presentation, viewport checks |
| Inputs | M4+ |
| Tests | Screenshot framing; no HUD overlap |
| Commit | `feat(m7): camera feet bail presentation` |

## M8 — Isolated hero art + modular plaza pipeline

| Field | Content |
| --- | --- |
| Scope | Blender contract outputs, glTF pipeline, catalog, runtime promotion |
| Inputs | **G1 accept** hard for expensive content; **G-BLENDER** ownership free |
| Tests | Asset hash; GLB load; shot renders |
| Gate | Pause if foreign Blender active |
| Failure | If G1 rejected, do not run M8 content marathon |
| Commit | `feat(m8): hero glb pipeline` |

## M9 — Plaza, UI, onboarding, audio, challenges, scoring

| Field | Content |
| --- | --- |
| Scope | Compact plaza, HUD, tutorial, audio map, challenges |
| Inputs | M6–M8 |
| Tests | E2E agent line; audio event triggers; onboarding flow |
| Commit | `feat(m9): plaza ui audio challenges` |

## M10 — Performance, accessibility, packaging, release evidence

| Field | Content |
| --- | --- |
| Scope | Budgets, a11y, installer, release packet |
| Inputs | M9 |
| Gates | G3, G5, release confidence |
| Commit | `feat(m10): package first ship` |
| Done | Playable packaged first-ship — not scaffold |

---

## Parallelism note

M2–M5 software path may proceed with synthetic frames before G1, but **must not** claim hardware success. M8/M9 expensive art/content requires G1 accept.
