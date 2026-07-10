# Risk Register — Cycle 1 Foundation

**Access date:** 2026-07-10
**Severity:** S1 blocks concept · S2 blocks ship quality · S3 painful · S4 minor
**Likelihood:** L1 almost certain without mitigation · L2 likely · L3 possible · L4 unlikely

Extends `research/risk-register.md` with cycle-1 foundation risks. Research file preserved.

---

## R01 — Browser dual-foot gap

| | |
| --- | --- |
| Severity / Likelihood | S1 / L1 if pure web |
| Evidence | PE3 lacks trackpad dual absolute feet; Edge pan collapse history (**confirmed fact** research) |
| Mitigation | Native host + ContactFrame |
| Validation | Browser probe fails dual feet; native P0 passes |

## R02 — Device dual ID instability

| | |
| --- | --- |
| S/L | S1 / L3 |
| Evidence | VEN_06CB present; per-device stability **unresolved** |
| Mitigation | P0 early; unsupported hardware message |
| Validation | 60 s dual-contact test |

## R03 — Win11 pointer path pan/zoom-only

| | |
| --- | --- |
| S/L | S1 / L2 |
| Evidence | Docs emphasize two-finger pan/zoom (**confirmed fact** MS portal) |
| Mitigation | P0-A then Raw Input primary if needed |
| Validation | Free dual-plant continuous stream |

## R04 — OS gesture hijack

| | |
| --- | --- |
| S/L | S1–S2 / L2 |
| Mitigation | Focus sink; P1 stress |
| Validation | 5 min steer without desktop gesture |

## R05 — False pops / click ambiguity

| | |
| --- | --- |
| S/L | S2 / L2 |
| Evidence | Button report-level (**confirmed fact**) |
| Mitigation | Planted-state attribution + windows |
| Validation | False pop <10% E2 |

## R06 — Ergonomic fatigue

| | |
| --- | --- |
| S/L | S2 / L2 |
| Evidence | ISO/HCI risk **hypothesis** for high click rate |
| Mitigation | Hold-push, assist, breaks UX |
| Validation | E6 pain maps |

## R07 — Recognizer brittleness

| | |
| --- | --- |
| S/L | S2 / L2 |
| Mitigation | Rule FSM, goldens, presets |
| Validation | noisy synthetic suite |

## R08 — Auto-skate over-assist

| | |
| --- | --- |
| S/L | S2 / L3 |
| Mitigation | Assist 0–2; log interventions; agency survey |
| Validation | PQ-4 ≥4/5 |

## R09 — Unfair pure physics

| | |
| --- | --- |
| S/L | S2 / L3 if pure RB |
| Mitigation | Hybrid model |
| Validation | ollie ≥50% after tutorial |

## R10 — Grind magnetism / impossibility

| | |
| --- | --- |
| S/L | S2 / L2 |
| Mitigation | Soft snap + visible volumes |
| Validation | 50% tutorial rail entries |

## R11 — Latency multi-hop

| | |
| --- | --- |
| S/L | S2 / L3 |
| Mitigation | In-process WV2 messages; SharedBuffer if needed |
| Validation | G3 |

## R12 — Nondeterminism

| | |
| --- | --- |
| S/L | S2 / L2 without discipline |
| Mitigation | deterministic Rapier; seeded RNG; no Date.now branches |
| Validation | G4 |

## R13 — iGPU performance vs art bar

| | |
| --- | --- |
| S/L | S2 / L2 |
| Evidence | Professional look + 60 FPS **hypothesis** |
| Mitigation | Budgets, meshopt/KTX2, restrained post; art LODs not permanent unlit cubes |
| Validation | G5 with budgeted hero art |

## R14 — License contamination

| | |
| --- | --- |
| S/L | S2 / L2 if bulk download |
| Mitigation | Catalog-first; CC0 default; validator |
| Validation | assets catalog + no runtime unreviewed |

## R15 — Host language / packaging churn

| | |
| --- | --- |
| S/L | S3 / L3 |
| Mitigation | C# WV2 primary; Electron fallback contract-stable ContactFrame |
| Validation | Architecture review cycle 2 |

## R16 — Pre-release Win11 touchpad APIs change

| | |
| --- | --- |
| S/L | S2 / L3 |
| Evidence | Learn pre-release disclaimer (**confirmed fact**) |
| Mitigation | Raw Input production-capable path |
| Validation | P0 dual backend |

## R17 — Scope creep encyclopedia tricks

| | |
| --- | --- |
| S/L | S3 / L2 |
| Mitigation | v0 vocab freeze until G2 |
| Validation | design checklist |

## R18 — Agent cheat path

| | |
| --- | --- |
| S/L | S2 / L3 if rushed |
| Mitigation | single pipeline; contract tests |
| Validation | G6 |

## R19 — Relative control feel wrong after absolute muscle memory

| | |
| --- | --- |
| S/L | S2 / L3 |
| Mitigation | calibration; foot ghosts; reject AbsoluteTouch product path |
| Validation | P2 comfort |

## R20 — Kenney blockout locked as final art

| | |
| --- | --- |
| S/L | S3 / L2 |
| Mitigation | art direction bars; runtime only after review |
| Validation | art review checklist vs art-direction.md |
