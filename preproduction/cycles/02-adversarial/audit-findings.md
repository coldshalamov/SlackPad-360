# Audit Findings — Codex Cycle-1 Disposition

**Audit source:** `preproduction/reviews/01-foundation-codex-audit.md`
**Baseline commit:** `53b3f14`
**Disposition date:** 2026-07-10

Each finding is **accepted**, **rejected with evidence**, or **resolved** in cycle 2. Cycle-1 files are **not** edited.

---

## P1 — Rapier package name not exact

| Field | Value |
| --- | --- |
| Severity | P1 |
| Disposition | **Resolved** |
| Evidence | npm `2026-07-10`: `@dimforge/rapier3d-deterministic@0.19.3` **and** `@dimforge/rapier3d-deterministic-compat@0.19.3` both exist (Apache-2.0). Cycle 1 mixed bare name with `-compat` URL. |
| Cycle-2 action | Decision **C2-RAPIER-PACKAGE**: adopt **`-compat@0.19.3`** as primary (inlined WASM). Record non-compat as optional alt. Determinism caveats from https://rapier.rs/docs/user_guides/javascript/determinism/ |
| Local refs | `assets/catalog/dependencies.json`, `reuse-and-dependency-audit.md`, `decisions.json` |

**Note (confirmed fact):** The bare package is not “nonexistent” on the registry today; the defect is **identity ambiguity** and incomplete install/import strategy.

---

## P1 — Asset workspace is a policy shell

| Field | Value |
| --- | --- |
| Severity | P1 |
| Disposition | **Resolved (partial, honest gaps)** |
| Evidence | Cycle 1 had 3 catalog-only candidates, no downloads. Cycle 2 downloaded Poly Haven HDRI, AmbientCG materials, Kenney Mini Skate with LICENSE + SOURCE.md + SHA-256 + previews. |
| Cycle-2 action | Selected sources under `assets/source/vendor/`; catalogs updated; Kenney **rejected as final look**; hero board/shoes = **gap-blender-brief** (no safe high-quality redistributable found). |
| Local refs | `assets/catalog/assets.json`, `asset-selection-and-gap-plan.md`, previews under `assets/generated/previews/` |

---

## P1 — Physical input gate cannot be researched away

| Field | Value |
| --- | --- |
| Severity | P1 |
| Disposition | **Accepted and reinforced** |
| Evidence | MS Learn `RegisterTouchpadCapableWindow`: registered windows receive **WM_POINTER for two-finger gestures (pans and zooms)**; pre-release disclaimer present. Does **not** prove free dual-plant. |
| Cycle-2 action | Smallest P0 spike + accept/reject/fallback; Raw Input ranked primary for free dual-plant; G1 remains open; autonomy must pause. |
| Local refs | `input-platform-and-device-spec.md`, `autonomy-and-gate-plan.md`, sources `ms-register-touchpad-capable` |

---

## P1 — Single-body physics needs harsher fidelity audit

| Field | Value |
| --- | --- |
| Severity | P1 |
| Disposition | **Resolved as comparison + commitment** |
| Evidence | Compared three representations (single body assisted; board + raycast/constrained wheels; articulated multi-body). |
| Cycle-2 action | **C2-PHYSICS-REPRESENTATION**: single body v0; raycast wheels as P3 probe; articulated rejected for first ship. Simulated vs assisted vs animated vs omitted table in physics spec. |
| Local refs | `physics-animation-and-camera-spec.md` |

---

## P1 — Autonomy must be gate-aware

| Field | Value |
| --- | --- |
| Severity | P1 |
| Disposition | **Resolved** |
| Evidence | Agents can inject ContactFrames; cannot certify trackpad or fun. |
| Cycle-2 action | **C2-AUTONOMY-GATES**: stop/continue/pivot; evidence bundles; failed G1 stops content. |
| Local refs | `autonomy-and-gate-plan.md` |

---

## P2 — Prototype and ship evidence levels conflated

| Field | Value |
| --- | --- |
| Severity | P2 |
| Disposition | **Resolved** |
| Evidence | Cycle 1 used `n≥5` near ship language. |
| Cycle-2 action | Six evidence levels; `n≥5` = formative only. |
| Local refs | `observability-and-verification.md`, decision **C2-EVIDENCE-LEVELS** |

---

## P2 — Click grammar needs device-specific fallback table

| Field | Value |
| --- | --- |
| Severity | P2 |
| Disposition | **Resolved** |
| Evidence | Report-level Button 1 (MS); modes vary by hardware. |
| Cycle-2 action | Full device-mode matrix + click attribution rules. |
| Local refs | `input-platform-and-device-spec.md` |

---

## P2 — Visual quality needs inspectable references

| Field | Value |
| --- | --- |
| Severity | P2 |
| Disposition | **Resolved (within Blender unavailability)** |
| Evidence | Cycle 1 art was verbal. Cycle 2 previews + shot rubric + modeling briefs. |
| Cycle-2 action | Previews for acquired assets; art-direction-and-shot-rubric; Blender-ready briefs for hero gaps. Blender deferred because process owned by unrelated work. |
| Local refs | `art-direction-and-shot-rubric.md`, `asset-selection-and-gap-plan.md` |

---

## Summary matrix

| Finding | Disposition |
| --- | --- |
| P1 Rapier name | Resolved |
| P1 Asset shell | Resolved with explicit gaps |
| P1 Input gate | Accepted (still open empirically) |
| P1 Physics fidelity | Resolved (comparison + v0 choice) |
| P1 Autonomy gates | Resolved |
| P2 Evidence levels | Resolved |
| P2 Device click matrix | Resolved |
| P2 Visual references | Resolved within constraints |

No Codex finding left unaddressed.
