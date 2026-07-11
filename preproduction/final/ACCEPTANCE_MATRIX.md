# Acceptance Matrix

| Requirement | Tests / evidence | Gate |
| --- | --- | --- |
| Dual-foot ContactFrame on Windows PTP | P0 traces; dual-plant ≥60 s; lift/click metrics | **G1** |
| Click kick/pop discrete | Click edge goldens + hardware | G1 + unit |
| Continuous slow control | Ground locomotion goldens | M3 |
| Fast categorical gestures | Flick/sweep recognition tests | M5 |
| Stance + hand-angle calib | Profile tests; human calib flow | M3 + human |
| Hybrid interruptible maneuvers | Interrupt goldens mid-flip | M4–M6 |
| Catch skillful not mm-perfect | Catch volume hit/miss goldens | M4 |
| 50-50 in vertical slice | GT-grind fifty-fifty | M6 |
| Boardslide first ship | GT-boardslide entry | M6 ship |
| No direct agent trick/pose API | Agent contract tests | **G6** |
| Deterministic replay | Dual-run hash | **G4** |
| Latency budgets | Histograms | **G3** |
| 60 FPS target laptop | Perf log p95 | **G5** |
| Professional visuals | Shot rubric screenshots; no permanent low quality | Art review |
| Assets licensed | Catalog hash + LICENSE/SOURCE | Structural |
| Runtime assets reviewed | Promotion evidence | G-RUNTIME-ASSETS |
| Packaged first ship | Installer offline first-run | M10 release |
| Accessibility baseline | Keyboard/UI contrast checklist | M10 |
| G1/G2/G5 not from synthetic alone | Process + validators | Autonomy |

Evidence paths: `preproduction/evidence/impl/` (see final-observability-and-verification.md).
