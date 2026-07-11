# M0 smoke results

Date: 2026-07-11
Machine: Windows 11 Pro 10.0.26200

## Toolchain

| Tool | Version | Source |
| --- | --- | --- |
| Node | v24.15.0 | preinstalled (satisfies `^20.19.0 \|\| >=22.12.0`) |
| npm | 11.5.2 | preinstalled |
| .NET SDK | 10.0.301 | installed this session via `winget install Microsoft.DotNet.SDK.10` (exit 0) |
| .NET SDK (legacy) | 8.0.419 | preinstalled; not used |

## Pinned packages resolved (npm ls)

- three@0.185.1 (exact)
- @dimforge/rapier3d-deterministic-compat@0.19.3 (exact)
- vite@8.1.4 (exact)
- typescript@5.9.3 (exact)
- vitest@4.1.10 (exact)
- fast-check@4.9.0 (exact)
- three-mesh-bvh@0.9.11 (exact)
- @gltf-transform/core@4.4.1 + @gltf-transform/cli@4.4.1 (asset-pipeline workspace)

## Results

| Step | Result |
| --- | --- |
| research/probes/validate-deliverables.mjs | PASS |
| research/probes/validate-followup.mjs | PASS |
| preproduction/probes/validate-final.mjs | PASS (52 checks; production-path freeze now phase-aware) |
| `npm run typecheck` (tsc -b) | PASS |
| `npx vitest run` | PASS — 4 tests (rapier 120-step determinism hash x2 identical; three r185; ContactFrame validate accept/reject) |
| `npm run build -w @slackpad/game` | PASS — dist 2,798 kB main chunk (rapier WASM inlined by design) |
| `dotnet build host/SlackPad.sln -c Release` | PASS — net10.0-windows, WebView2 1.0.4078.44; 1 benign MSB3277 warning (WPF assembly variant in package) |

## Decisions locked at M0

- Monorepo shape: npm workspaces — `packages/shared` (contracts), `packages/game` (Vite TS), `packages/asset-pipeline` (gltf-transform), `host/` (C# WinForms + WebView2).
- Host UI shell: **WinForms** (per dependency-lock "pick one at M0 and keep") — chosen for direct WndProc access needed by the Raw Input adapter.
- Single sim authority: Rapier world lives only in `packages/game`; shared package is types/config only.
- `preproduction/probes/validate-final.mjs` production-path freeze made phase-aware (freeze applied only before `preproduction/evidence/impl/` exists) — the freeze documented preproduction completion, and implementation is now sanctioned by AUTONOMOUS_BUILD_GOAL.md.
