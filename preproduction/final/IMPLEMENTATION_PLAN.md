# Implementation Plan (Executable)

Normative detail: `preproduction/cycles/03-production/implementation-milestones.md` + `milestones.json`.

## Order

| # | Milestone | Gate hooks | Commit after accept |
| --- | --- | --- | --- |
| M0 | Toolchain + guardrails | — | `chore(m0): toolchain lock + repo guardrails` |
| M1 | Dual-adapter hardware spike | **G1** | `feat(m1): dual adapter ContactFrame spike` |
| M2 | ContactFrame/replay/agent/sim skeleton | G4/G6 | `feat(m2): ContactFrame pipeline + rapier skeleton` |
| M3 | Feet + ground locomotion | — | `feat(m3): feet + push/steer ground` |
| M4 | Ollie/nollie catch land bail | — | `feat(m4): ollie nollie catch land bail` |
| M5 | Flips/shuvs conflicts | — | `feat(m5): flips shuvs recognition` |
| M6 | 50-50 then boardslide | **G2** | `feat(m6): fifty-fifty and boardslide` |
| M7 | Camera, shoes, bail presentation | — | `feat(m7): camera feet bail presentation` |
| M8 | Hero art + plaza pipeline | **G1 accept**, **G-BLENDER** | `feat(m8): hero glb pipeline` |
| M9 | Plaza UI audio challenges | — | `feat(m9): plaza ui audio challenges` |
| M10 | Perf a11y package release | G3/G5/release | `feat(m10): package first ship` |

## Hard rules

1. **G1 first** for expensive content: M8/M9 content freeze requires G1 accept.
2. M2–M5 may use synthetic frames; never claim G1.
3. Commit only after milestone tests pass.
4. Pause packets for device/human/Blender gates.
5. Done = packaged playable first-ship, not scaffold.
