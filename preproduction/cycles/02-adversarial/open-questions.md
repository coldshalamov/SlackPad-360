# Open Questions — Cycle 2

**Access date:** 2026-07-10
Each item: experiment, **Accept**, **Reject**, **Fallback**. Evidence level noted.

---

## OQ-C2-01 — Free dual-plant (G1)

| | |
| --- | --- |
| Question | Does target laptop expose free dual-plant + lifts + click? |
| Experiment | P0 spike T1–T11 both adapters |
| Accept | Metrics in input-platform-and-device-spec §3.6 |
| Reject | Gesture-only / thrash / no lift / no click |
| Fallback | Other PTP device; else product pivot |
| Level | Hardware acceptance |

## OQ-C2-02 — Pointer vs Raw winner

| | |
| --- | --- |
| Question | Which adapter wins on latency/stability? |
| Experiment | Side-by-side traces same gestures |
| Accept | Prefer lower p95 dt + higher dual stability |
| Reject | Neither meets G1 |
| Fallback | Rank winner primary |
| Level | Hardware |

## OQ-C2-03 — 60 vs 120 Hz

| | |
| --- | --- |
| Question | Does 120 improve land/grind enough? |
| Experiment | Same goldens + feel formative |
| Accept | CPU p95 in budget and feel better |
| Reject | CPU breaks G5 or no feel gain |
| Fallback | 60 default; 120 quality mode |
| Level | Tuning + formative |

## OQ-C2-04 — Model A vs B rails

| | |
| --- | --- |
| Question | Single body enough for fair grind entry? |
| Experiment | P3 rail suite |
| Accept | Skill band + low false latch |
| Reject | Unfair bounce or magnet |
| Fallback | Raycast wheels Model B |
| Level | Tuning |

## OQ-C2-05 — Boardslide recognition

| | |
| --- | --- |
| Question | Can boardslide be recognized without destroying flip/shuv? |
| Experiment | Confusion matrix after G2 basics |
| Accept | ≥70% intended boardslide vs flip (formative) |
| Reject | <50% |
| Fallback | Explicit grind-approach modifier / longer prep |
| Level | Formative / tuning |

## OQ-C2-06 — Pop window ms

| | |
| --- | --- |
| Question | Optimal L lookback/lookahead |
| Experiment | A/B 40/60/80 ms |
| Accept | False pop <10% and ollie success formative ≥50% after tutorial |
| Reject | No setting works |
| Fallback | Explicit prep gesture |
| Level | Tuning (not release) |

## OQ-C2-07 — Hero art source

| | |
| --- | --- |
| Question | Blender pass vs commercial kit |
| Experiment | Cycle 3 schedule + quality rubric |
| Accept | Passes S1–S3 shots |
| Reject | Misses professional bar |
| Fallback | Alternate artist/source |
| Level | Structural + review |

## OQ-C2-08 — WebView2 message rate

| | |
| --- | --- |
| Question | JSON batches meet G3? |
| Experiment | Instrumented host |
| Accept | Contact move ≤50 ms typical |
| Reject | Exceed |
| Fallback | SharedBuffer / denser framing |
| Level | Hardware |

---

## Closed by research this cycle (not device)

| Topic | Closure |
| --- | --- |
| Rapier package identity | Registry + docs → `-compat@0.19.3` primary |
| Button 1 per-finger | Impossible as guaranteed; report-level |
| Pure browser dual-foot | Rejected |

---

## Cannot be closed by more browsing

Dual-plant, fun, ergonomics, final visual quality, exact latency on target — require hardware/formative/release evidence levels.
