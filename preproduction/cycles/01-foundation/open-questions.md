# Open Questions — Decisive Experiments

**Access date:** 2026-07-10
Each item: cheapest experiment, accept, reject, fallback. Do not ship fixed answers without measurement.

---

## OQ-INPUT-01 — Dual-contact stability on target hardware

| | |
| --- | --- |
| Question | Do we get two stable IDs, independent lift, free dual-plant ≥60 s? |
| Experiment | P0-A then P0-B native probe; CSV log |
| Accept | Research P0 accept criteria met |
| Reject | Only mouse deltas / thrashing IDs / no independent lift |
| Fallback | Different PTP device list; else product pivot (controller hybrid = different product) |

## OQ-INPUT-02 — Win11 pointer free dual-plant vs gesture-only

| | |
| --- | --- |
| Question | Does GetPointerFrameTouchpadInfo stream continuous dual feet outside pan/zoom? |
| Experiment | P0-A free plant/steer without OS gesture classification |
| Accept | Continuous himetric dual contacts while focused |
| Reject | Frames only during pan/zoom |
| Fallback | Make Raw Input **primary** production path |

## OQ-INPUT-03 — Pop window timings

| | |
| --- | --- |
| Question | Optimal lookback/lookahead ms for kick-centered pop? |
| Experiment | P4 A/B 40/60/80 ms; false pop vs miss rate |
| Accept | False pop <10%, ollie success ≥50% after tutorial |
| Reject | No setting meets both |
| Fallback | Explicit prep gesture (longer nose lift) before kick |

## OQ-INPUT-04 — Flick axis after hand angle

| | |
| --- | --- |
| Question | Is heelside/toeside reliable after padYawOffset calib? |
| Experiment | P5 with n≥5; confusion matrix kickflip vs heelflip |
| Accept | ≥80% intended flip direction |
| Reject | <60% |
| Fallback | Larger angular deadzone; on-screen axis coach |

## OQ-INPUT-05 — Both+click = push forever?

| | |
| --- | --- |
| Question | Do advanced players want both+click ollie? |
| Experiment | Playtest preference after G1 |
| Accept | Keep push default if majority prefer |
| Reject | If majority want ollie |
| Fallback | Profile toggle `bothClickMeans` |

## OQ-PHYS-01 — 120 vs 60 Hz physics

| | |
| --- | --- |
| Question | Does 120 Hz improve land/grind enough to justify CPU on iGPU? |
| Experiment | Same recording at 60/120; CPU ms + feel survey |
| Accept | 120 if step <4 ms p95 and feel ≥60 |
| Reject | If CPU breaks G5 |
| Fallback | 60 Hz default; 120 quality mode |

## OQ-PHYS-02 — Wheel model

| | |
| --- | --- |
| Question | Raycast wheels vs anisotropic hull? |
| Experiment | P3 ramp + carve comparison |
| Accept | Stable S-curves, no jitter |
| Reject | Penetration/jitter |
| Fallback | Hull + tuned friction |

## OQ-PHYS-03 — Mass / inertia fantasy

| | |
| --- | --- |
| Question | Aggregate skater+board mass vs light board? |
| Experiment | P4 pop height and land stability A/B |
| Accept | Readable pop + fair land |
| Reject | Floaty or brick |
| Fallback | Keep aggregate; tune density |

## OQ-PHYS-04 — Snap radius honesty

| | |
| --- | --- |
| Question | Soft snap R that hits 50% entry without magnetism complaints? |
| Experiment | P6 vary R; survey + entry rate |
| Accept | ≥50% entry; magnetism complaints <30% |
| Reject | Impossible band |
| Fallback | Assist-differentiated R; stronger rail readability |

## OQ-CAM-01 — Look-ahead constants

| | |
| --- | --- |
| Question | 0.15–0.35 s look-ahead preference? |
| Experiment | Camera A/B on gap line E4 |
| Accept | Majority prefer default band |
| Reject | <30% prefer default |
| Fallback | Change default; keep others in settings |

## OQ-CAM-02 — Grind overhead blend

| | |
| --- | --- |
| Question | 10–20% overhead blend enough for rails? |
| Experiment | E5 with blend 0/15/40% |
| Accept | Entry rate ↑ without flip unreadability |
| Reject | Motion sickness or lost flips |
| Fallback | Optional full overhead toggle only |

## OQ-ARCH-01 — C# vs Rust host

| | |
| --- | --- |
| Question | Is C# WV2 host sufficient for HID safety and latency? |
| Experiment | P0 in C#; measure drops; code review HID parse |
| Accept | G1+G3 met; no memory safety incidents in probe |
| Reject | Critical parse bugs / unsafe patterns dominate |
| Fallback | Rust host for input module; keep ContactFrame |

## OQ-ARCH-02 — JSON message rate vs SharedBuffer

| | |
| --- | --- |
| Question | Does JSON ContactFrame batching break G3? |
| Experiment | Instrument PostWebMessageAsJson at full pad rate |
| Accept | G3 met |
| Reject | Persistent >100 ms |
| Fallback | SharedBuffer binary frames |

## OQ-ART-01 — CC0 kit vs bespoke hero

| | |
| --- | --- |
| Question | Can Kenney blockout be re-dressed to pass professional bar under G5? |
| Experiment | Material pass on board+plaza tile; art review + FPS |
| Accept | Review pass + G5 |
| Reject | Still reads as placeholder |
| Fallback | Bespoke modular set; kits remain blockout-only |

## OQ-AUDIO-01 — SFX library

| | |
| --- | --- |
| Question | Which CC0/licensed pack covers roll/grind/land? |
| Experiment | Shortlist 2 libraries; license ledger; placeholder test |
| Accept | Full v0 event coverage + clean licenses |
| Reject | Missing grind loop quality |
| Fallback | Commission original SFX |

## OQ-ERG-01 — 15-minute pain

| | |
| --- | --- |
| Question | Can majority complete 15 min with pain ≤2/5 after mitigations? |
| Experiment | E6 n≥5 |
| Accept | Median pain ≤2 |
| Reject | Median ≥3 after mitigations |
| Fallback | Lower click dependency; session breaks; controller hybrid optional mode |

## OQ-PROD-01 — Body varial in v0

| | |
| --- | --- |
| Question | Need pad signal for body spin v0? |
| Experiment | Design review after shuv 180 ships |
| Accept | Defer if board yaw enough for lines |
| Reject | If players report “stuck facing” |
| Fallback | Dual-contact air rotate → cosmetic body yaw

## OQ-FEEL-01 — G2 fun gate

| | |
| --- | --- |
| Question | Is the hybrid fun enough to proceed to production content? |
| Experiment | P8 vertical slice; n≥5; fun≥4/5 for ≥3 testers |
| Accept | G2 pass |
| Reject | Majority abandon / broken |
| Fallback | Redesign grammar thresholds or stop trackpad-primary concept |
