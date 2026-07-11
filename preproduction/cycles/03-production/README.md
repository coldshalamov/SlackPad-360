# Cycle 03 — Production Package

**Cycle:** 3 of 3 (final preproduction)
**Status:** Authoritative production package (no production game implemented)
**Access date:** 2026-07-10
**Baseline commit at start:** `e4abb6e`
**Immutables:** `preproduction/cycles/01-foundation/` and `02-adversarial/` are **byte-preserved**

Labels used historically remain: **confirmed fact** | **inference** | **recommendation** | **hypothesis** | **unresolved**.
This cycle **resolves** planning contradictions into one answer per subsystem. Remaining items are empirical gates, not competing designs.

---

## Readiness verdict

| Area | Verdict |
| --- | --- |
| Product / scope | **Ready** — single contract |
| Architecture / interfaces | **Ready** — normative topology |
| Input / trick grammar | **Ready** — implementable; **G1 open** |
| Physics / animation / camera | **Ready** — Model A + assist; constants parameterized |
| Toolchain pins | **Ready** — `net10.0-windows`, WebView2 `1.0.4078.44`, npm pins + JS smoke |
| Assets | **`asset-gap`** — useful source library; hero board/shoes/pro plaza bespoke; audio proxies not runtime-ready |
| Verification / gates | **Ready** — evidence levels + autonomy rules |
| Autonomous build goal | **Ready** — `preproduction/final/AUTONOMOUS_BUILD_GOAL.md` |

**Overall:** Preproduction planning is complete enough to start implementation under gate-aware autonomy. **Do not** claim dual-foot hardware or ship-quality fun from this package alone.

---

## What cycle 3 corrects (headline)

1. **Host TFM:** `.NET 8` → **`net10.0-windows`** (.NET 10 LTS EOS 2028-11-14; .NET 8 EOS 2026-11-10).
2. **WebView2 SDK pin:** **`Microsoft.Web.WebView2 1.0.4078.44`**.
3. **JS toolchain smoke:** Rapier two-run identical hashes + Three resolve (evidence under `preproduction/evidence/cycle-03/`).
4. **Audio + rubber:** CC0 packs acquired with provenance; still **not** runtime-ready.
5. **One package:** `preproduction/final/` is the navigation surface for implementers.

---

## Document map (cycle 03)

| File | Role |
| --- | --- |
| [audit-findings.md](./audit-findings.md) | Dispose every cycle-2 Codex finding |
| [delta-from-cycle-02.md](./delta-from-cycle-02.md) | Added / Changed / Rejected / Deferred vs cycle 2 |
| [cross-cycle-decision-log.md](./cross-cycle-decision-log.md) | Research → C1 → C2 → C3 decision lineage |
| [final-product-and-scope-spec.md](./final-product-and-scope-spec.md) | Product contract |
| [final-input-and-trick-spec.md](./final-input-and-trick-spec.md) | Primitives, device modes, tricks |
| [final-physics-animation-camera-spec.md](./final-physics-animation-camera-spec.md) | Model A, assist, grind, camera |
| [final-technical-architecture.md](./final-technical-architecture.md) | Modules, envelopes, clocks, replay |
| [final-art-assets-world-audio-spec.md](./final-art-assets-world-audio-spec.md) | BOM, Blender contract, audio map |
| [final-observability-and-verification.md](./final-observability-and-verification.md) | Tests, evidence paths |
| [implementation-milestones.md](./implementation-milestones.md) | M0–M10 with gates |
| [autonomy-and-empirical-gates.md](./autonomy-and-empirical-gates.md) | Stop/continue/pivot |
| [risk-register.md](./risk-register.md) | Risks |
| [unresolved-gates.md](./unresolved-gates.md) | Owned open gates |
| [internet-stop-log.md](./internet-stop-log.md) | Topic-by-topic stop |
| [asset-readiness.json](./asset-readiness.json) | Asset ledger machine-readable |
| [dependency-lock.json](./dependency-lock.json) | Exact pins |
| [decisions.json](./decisions.json) | C3 decisions |
| [sources.json](./sources.json) | Evidence sources |
| [milestones.json](./milestones.json) | Milestone DAG |
| [review-checklist.md](./review-checklist.md) | Exit checklist |

**Authoritative for implementers:** `preproduction/final/` (summaries + `/goal`).

---

## Consistency anchors (final)

1. ContactFrame v1 is the sole hardware/agent/replay/synthetic path.
2. Relative board-local control; no pad→world teleport.
3. Board axes: +X right, +Y up, +Z nose.
4. Button 1 report-level; foot attribution by plant mask + stance.
5. Hybrid assist opens maneuvers; Rapier owns collisions/fails.
6. Rapier: `@dimforge/rapier3d-deterministic-compat@0.19.3`.
7. Host: **C# / `net10.0-windows` + WebView2 `1.0.4078.44`**.
8. No permanent low-quality art strategy; no production game in preproduction.
9. G1 failure stops expensive content.
10. Blender only when foreign process absent and SlackPad output path explicit.

---

## Completion summary (cycle 3)

| Item | Result |
| --- | --- |
| Final decisions | See `decisions.json` / cross-cycle log |
| Assets added | Kenney UI + Impact SFX; OGA metal/wood + SFX#2; ambientCG Rubber004 |
| Toolchain smoke | JS OK (matching hashes); .NET 10 not installed → prereq documented |
| Remaining gates | G1–G5, G-BLENDER ownership, hero art authoring |
| Validators | `validate-cycle-03.mjs`, `validate-final.mjs` |
| Autonomous goal | `preproduction/final/AUTONOMOUS_BUILD_GOAL.md` |
