# Audit Findings — Codex Cycle-2 Disposition

**Audit source:** `preproduction/reviews/02-adversarial-codex-audit.md`
**Baseline commit (cycle 3 start):** `e4abb6e`
**Disposition date:** 2026-07-10

Each cycle-2 Codex finding is **accepted**, **resolved**, or **rejected with evidence**. Cycle-2 files are **not** edited.

---

## P1 — New host should not target .NET 8 in July 2026

| Field | Value |
| --- | --- |
| Severity | P1 |
| Disposition | **Resolved** |
| Evidence | Microsoft support policy: .NET 8 EOS **2026-11-10**; .NET 10 LTS EOS **2028-11-14**. Lifecycle page confirms. |
| Cycle-3 action | Decision **C3-HOST-NET10**: TFM **`net10.0-windows`**. Supersedes C2-HOST-LANG's .NET 8 pin without rewriting cycle-2. Downgrade only on measured interop failure. |
| Local refs | `dependency-lock.json`, `decisions.json`, `final-technical-architecture.md`, sources `ms-dotnet-support-policy` |

---

## P1 — Asset library useful but not build-complete

| Field | Value |
| --- | --- |
| Severity | P1 |
| Disposition | **Resolved (honest asset-gap verdict)** |
| Evidence | Cycle 2 had HDRI/PBR/blockout. Cycle 3 acquired CC0 UI/impact/metal-wood/ambience audio + Rubber004. Hero board/shoes/pro plaza still missing. |
| Cycle-3 action | `asset-readiness.json` **readinessVerdict=`asset-gap`**. Isolated Blender task contract. No runtime promotions. |
| Local refs | `asset-readiness.json`, `final-art-assets-world-audio-spec.md`, `preproduction/final/ASSET_MANIFEST.md` |

---

## P1 — Internet stop claim was premature

| Field | Value |
| --- | --- |
| Severity | P1 |
| Disposition | **Resolved** |
| Evidence | Cycle 2 missed .NET lifecycle, WebView2 exact pin, and deferred audio. Cycle 3 re-queried registries, acquired audio with positive/negative results, topic-by-topic stop log. |
| Cycle-3 action | **C3-INTERNET-STOP** + `internet-stop-log.md`. No global “internet exhausted”; remaining items are gates or maintenance re-pins. |
| Local refs | `internet-stop-log.md`, `sources.json` |

---

## P2 — Toolchain compatibility cataloged but not proven together

| Field | Value |
| --- | --- |
| Severity | P2 |
| Disposition | **Resolved (JS proven; .NET documented)** |
| Evidence | Disposable install of three@0.185.1 + rapier-compat@0.19.3 + vite@8.1.4. Two 120-step Rapier runs → identical SHA-256 pose hashes. Three + Vite resolve. Machine has .NET 8 SDK only → no global install; host smoke commands recorded. |
| Cycle-3 action | Evidence under `preproduction/evidence/cycle-03/`; pins in `dependency-lock.json`. |
| Local refs | `js-toolchain-smoke.log`, `dotnet-webview2-smoke.md`, `toolchain-smoke.md` |

---

## P2 — Final autonomous goal must preserve empirical stops

| Field | Value |
| --- | --- |
| Severity | P2 |
| Disposition | **Resolved** |
| Evidence | Goal must be gate-aware; synthetic cannot certify trackpad/feel/Blender ownership. |
| Cycle-3 action | `preproduction/final/AUTONOMOUS_BUILD_GOAL.md` starts with `/goal`, G1-first, ContactFrame-only agent, Blender ownership pause, milestone commits, no G1/G2/G5 from synthetic alone, packaged first-ship done. |
| Local refs | `AUTONOMOUS_BUILD_GOAL.md`, `autonomy-and-empirical-gates.md` |

---

## Summary matrix

| Finding | Disposition |
| --- | --- |
| P1 .NET 8 drift | **Resolved** → net10.0-windows |
| P1 Asset not build-complete | **Resolved** as asset-gap + bespoke contracts |
| P1 Internet stop premature | **Resolved** topic-by-topic |
| P2 Toolchain unproven | **Resolved** JS smoke; .NET prereq |
| P2 Autonomy empirical stops | **Resolved** in AUTONOMOUS_BUILD_GOAL |

No cycle-2 Codex finding left unaddressed.
