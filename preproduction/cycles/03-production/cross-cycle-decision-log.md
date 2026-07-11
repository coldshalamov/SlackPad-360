# Cross-Cycle Decision Log

Lineage of authoritative choices from research → cycle 1 → cycle 2 → cycle 3.
**Authority today:** cycle-3 `decisions.json` + `preproduction/final/*`. Historical cycles are immutable evidence, not parallel forks.

---

## Product fantasy

| Phase | Decision |
| --- | --- |
| Research | Conditionally feasible hybrid finger-skate; dual-foot unproven on metal |
| C1 | Hybrid product; ContactFrame; relative control; WebView2 host |
| C2 | Boardslide first-ship; 50-50 slice-first; disembodied shoes |
| **C3** | **Frozen** product contract; pure browser not dual-foot human product |

## Host / runtime

| Phase | Decision |
| --- | --- |
| Research | Native host + WebView2 preferred |
| C1 | C#/.NET + WebView2 primary |
| C2 | **.NET 8** + WebView2; Rust switch trigger |
| **C3** | **net10.0-windows** + WebView2 **1.0.4078.44**; Rust trigger unchanged |

## Physics package

| Phase | Decision |
| --- | --- |
| Research | Rapier candidate |
| C1 | Hybrid + Rapier (name/URL mixed) |
| C2 | `@dimforge/rapier3d-deterministic-compat@0.19.3` |
| **C3** | Same pin; **smoke-proven** two-run hash match |

## Physics body model

| Phase | Decision |
| --- | --- |
| C1 | Single board hybrid |
| C2 | Model A v0; Model B probe; reject articulated first ship; 60 default Hz |
| **C3** | Same; OSS study reaffirmed Model A first |

## Input API ranking

| Phase | Decision |
| --- | --- |
| Research | Win11 pointer docs + Raw Input class path |
| C1 | Pointer primary, Raw fallback |
| C2 | Spike both; **Raw ranked primary** for free dual-plant |
| **C3** | Same; G1 still open |

## Assets

| Phase | Decision |
| --- | --- |
| C1 | Catalog shell |
| C2 | HDRI/PBR/Kenney acquired; hero gaps |
| **C3** | Audio proxies + rubber; readiness **asset-gap**; Blender contract with ownership |

## Autonomy

| Phase | Decision |
| --- | --- |
| Research | Agent observability path |
| C1 | Gates listed |
| C2 | Gate-aware stop/continue/pivot |
| **C3** | Literal `/goal` with G1-first, ContactFrame-only, Blender ownership |

## Internet research

| Phase | Decision |
| --- | --- |
| C2 | Near stop (premature on toolchain/audio) |
| **C3** | Topic-by-topic closed; implement-time re-pin = maintenance |

---

## Supersession rule

When implementers find conflict between cycles:

1. Prefer `preproduction/final/*`
2. Then `preproduction/cycles/03-production/*`
3. Cycle 2 for historical rationale only
4. Cycle 1 / research for background only

Never “average” competing designs.
