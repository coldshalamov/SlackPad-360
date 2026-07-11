# Delta From Cycle 02

**Immutable baseline:** `preproduction/cycles/02-adversarial/` (do not edit)
**Cycle-3 package:** `preproduction/cycles/03-production/` + `preproduction/final/`
**Rule:** Corrections live only in cycle-3 / final. Cycle 2 remains historical.

---

## Added

| Item | Cycle-2 state | Cycle-3 location |
| --- | --- | --- |
| Authoritative `preproduction/final/` surface | Not present | `preproduction/final/*` |
| Literal `/goal` autonomous build prompt | Gate plan only | `AUTONOMOUS_BUILD_GOAL.md` |
| `dependency-lock.json` exact pins + engines | Catalog pins without host TFM correction | `dependency-lock.json` |
| JS Rapier/Three/Vite determinism smoke evidence | Registry only | `preproduction/evidence/cycle-03/` |
| .NET 10 + WebView2 install/build prereq record | Implicit | `dotnet-webview2-smoke.md` |
| CC0 audio packs (UI, impact, metal/wood, ambience) | Freesound catalog only | `assets/source/vendor/kenney-*`, `oga-*` |
| ambientCG Rubber004 | Not present | `acg-rubber-004` |
| `asset-readiness.json` + readinessVerdict | BOM prose | `asset-readiness.json` |
| Isolated Blender ownership check in goal | Brief only | Art spec + AUTONOMOUS_BUILD_GOAL |
| M0–M10 machine-readable milestones | Open questions | `milestones.json`, `implementation-milestones.md` |
| Cross-cycle decision log | Delta from C1 only | `cross-cycle-decision-log.md` |
| Validators cycle-03 + final | validate-cycle-02 only | `validate-cycle-03.mjs`, `validate-final.mjs` |
| ACCEPTANCE_MATRIX | Partial | `preproduction/final/ACCEPTANCE_MATRIX.md` |

---

## Changed

| Item | From (cycle 2) | To (cycle 3) | Why |
| --- | --- | --- | --- |
| Host TFM | .NET 8 / net8.0-windows | **net10.0-windows** | MS support policy; Codex P1 |
| WebView2 SDK | “pin at implement” evergreen | **1.0.4078.44** exact | Registry re-query |
| TypeScript | Unpinned | **5.9.3** (optional 7.0.2 recheck) | Exact pin for implement |
| Node engines | Implicit | **^20.19.0 \|\| >=22.12.0** (Vite 8) | engines field |
| Asset readiness language | “shell resolved with gaps” | Explicit **`asset-gap`** verdict | Codex P1 honesty |
| Internet stop | Near-global stop | Topic-by-topic; closed toolchain/audio | Codex P1 |
| Autonomy | Plan for cycle 3 | Binding `/goal` text | Ship implementer prompt |
| Audio | Deferred | Proxies acquired; field skate still gap | Cycle-3 mandate |

---

## Rejected

| Item | Source | Rejection reason |
| --- | --- | --- |
| Retaining .NET 8 as final host | C2-HOST-LANG pin | EOS 2026-11-10 |
| WebView2 prerelease 1.0.4126 | NuGet | Not release channel |
| Marking audio/runtime assets ready | Temptation to complete boxes | No quality/listen pass |
| Shipping Kenney as final plaza look | Existing reject | Reaffirmed |
| Account scraping Freesound | Audio desire | Policy: no auth scraping |
| Parallel competing architectures in final package | Cycle habit | Single normative answer |
| Claiming G1 from docs/smoke alone | Research | Empirical only |

---

## Deferred (owned)

| Item | Why | Resume |
| --- | --- | --- |
| .NET 10 host compile smoke on this machine | SDK not installed; no global install | M0 after `dotnet --list-sdks` shows 10.x |
| Hero board/shoes GLB authoring | Blender owned by foreign process | M8 when ownership free |
| Freesound grind field audio | Login required | Human-auth download later |
| G1 dual-plant on target trackpad | Hardware | M1 |
| G2 formative feel | Humans | After M6 |
| Runtime promotion of any asset | Review not done | Quality+license+format gate |
| Model B raycast wheels | Only if Model A fails rails | Measured probe post-G2 |
| SharedBuffer transport | Only if G3 fails JSON | G3 pivot |

---

## Cycle-2 decisions status in final package

| Cycle-2 ID | Cycle-3 treatment |
| --- | --- |
| C2-PRODUCT-SCOPE | Preserved as C3-PRODUCT-SCOPE |
| C2-RAPIER-PACKAGE | Preserved; smoke-proven |
| C2-INPUT-PRIMARY-API | Preserved as C3-INPUT-PATH |
| C2-CLICK-ATTRIBUTION | Preserved in final input spec |
| C2-PHYSICS-REPRESENTATION | Preserved as C3-PHYSICS-MODEL-A |
| C2-HOST-LANG | **Changed** language OK; TFM → net10 (C3-HOST-NET10) |
| C2-HZ-PLAN | Preserved |
| C2-ASSET-LIBRARY | Extended; readinessVerdict asset-gap |
| C2-EVIDENCE-LEVELS | Preserved |
| C2-AUTONOMY-GATES | Elevated into AUTONOMOUS_BUILD_GOAL |
| C2-BOARD-SLIDE-SCOPE | Preserved |
| C2-FEET-VISUAL | Preserved |
| C2-MANEUVER-ASSIST | Preserved + consolidated equations |
