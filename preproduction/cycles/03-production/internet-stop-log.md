# Internet Stop Log — Cycle 3

Topic-by-topic. **Not** a global “internet exhausted” claim.

---

## 1. .NET host TFM / support lifecycle

| Field | Value |
| --- | --- |
| Queries/sources | MS support policy; MS lifecycle; .NET 8/9 EOS blog |
| Decision | **net10.0-windows**; supersede cycle-2 .NET 8 |
| Uncertainty | None material for selection |
| Why more search unlikely to change | Primary Microsoft policy pages agree |
| Recheck trigger | Microsoft changes EOS dates or security forces TFM move |

## 2. WebView2 NuGet stable version

| Field | Value |
| --- | --- |
| Queries/sources | nuget.org flat container; MS release notes |
| Decision | **1.0.4078.44** release; reject 1.0.4126-prerelease |
| Uncertainty | Newer stable may appear later |
| Why more search unlikely now | Current stable identified |
| Recheck trigger | Security advisory; implement-time re-pin |

## 3. npm package versions + Node engines

| Field | Value |
| --- | --- |
| Queries/sources | `npm view` for three, rapier-compat, vite, typescript, vitest, fast-check, three-mesh-bvh, gltf-transform |
| Decision | Pins in `dependency-lock.json`; Node `^20.19.0 \|\| >=22.12.0` |
| Uncertainty | Registry drifts |
| Why more search unlikely now | Exact versions captured + smoke |
| Recheck trigger | CVE; major breaking release at implement |

## 4. JS Rapier+Three compatibility

| Field | Value |
| --- | --- |
| Queries/sources | Disposable install + smoke (local) |
| Decision | Compatible; hashes match |
| Uncertainty | WebView2 GPU path not proven by Node smoke |
| Why more web search unlikely | Local evidence stronger than blogs |
| Recheck trigger | Init fail in WebView2 |

## 5. .NET 10 + WebView2 compile on this machine

| Field | Value |
| --- | --- |
| Queries/sources | `dotnet --list-sdks` → 8.0.419 only |
| Decision | **Do not** install globally in cycle 3; document prereq |
| Uncertainty | Unrun host build |
| Why more web search unlikely | Needs local SDK install, not docs |
| Recheck trigger | M0 after SDK install |

## 6. CC0 audio (roll/push/pop/catch/land/bail/grind/ambience/UI)

| Field | Value |
| --- | --- |
| Queries/sources | Kenney interface/impact direct zips; OGA metal-wood + SFX#2; Freesound grind page |
| Decision | Acquire Kenney UI/Impact + OGA packs; Freesound **auth-gated negative**; skate-specific field still gap; proxies only |
| Uncertainty | Final quality of proxies |
| Why more search unlikely to change architecture | Enough CC0 proxies for implement; hero field audio is acquisition task not design fork |
| Recheck trigger | Human-auth Freesound or new direct CC0 skate pack |

## 7. Hero board / shoes / modular plaza free sources

| Field | Value |
| --- | --- |
| Queries/sources | Cycle-2 search pattern + cycle-3 high-value gap sweep; ambientCG rubber acquired |
| Decision | **Bespoke** for hero board/shoes/pro plaza; rubber material acquired; grip procedural/bespoke |
| Uncertainty | None that changes “bespoke” without a new high-quality redistributable pack |
| Why more search unlikely | Repeated low-quality/unclear-license pattern |
| Recheck trigger | Credible commercial-safe high-quality pack with license page |

## 8. Input free dual-plant via docs

| Field | Value |
| --- | --- |
| Queries/sources | MS RegisterTouchpad / PTP / Raw Input (cycle 1–2) |
| Decision | **Stop researching as substitute for G1**; spike both adapters |
| Uncertainty | Device empirical |
| Why more web search unlikely | Docs already maxed; G1 is metal |
| Recheck trigger | New Win API guaranteeing free dual-plant |

## 9. Physics representation / OSS

| Field | Value |
| --- | --- |
| Queries/sources | Cycle-2 Godot_Skate + GEVP inspections; Rapier docs |
| Decision | Model A v0; Model B probe; study-only OSS |
| Uncertainty | Rail feel empirical |
| Why more web search unlikely | Architecture set; need goldens/playtests |
| Recheck trigger | Model A fails G2 rails |

---

## Summary

Preproduction **open-web research** for toolchain, host TFM, dependency identity, and safely acquirable CC0 assets is closed with evidence. Remaining work is implementation, hardware gates, human feel, and isolated art authoring — not more parallel opinion research.
