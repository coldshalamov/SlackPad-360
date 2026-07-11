# Vite 8.1.4 production build smoke (cycle 03)

Access date: 2026-07-10
Purpose: Prove selected Vite can **bundle** Three + Rapier, not merely `require.resolve`.

## Input manifest

| Field | Value |
| --- | --- |
| Disposable path | `%TEMP%/grok-goal-2c7ab443ef36/implementer/vite-build-smoke` (outside production tree) |
| vite | **8.1.4** |
| three | **0.185.1** |
| @dimforge/rapier3d-deterministic-compat | **0.19.3** |
| entry | `main.js` — `import * as THREE from 'three'` + `import RAPIER from '@dimforge/rapier3d-deterministic-compat'` + `RAPIER.init()` + `THREE.Scene` usage |
| html | `index.html` module entry |
| config | `vite.config.js` — production `build.outDir=dist`, minify true, target es2022 |

## Commands

```
npm install --no-fund --no-audit
npx vite build
```

Installed versions (package-lock): three 0.185.1, rapier 0.19.3, vite 8.1.4.

## Result

| Field | Value |
| --- | --- |
| install exit code | 0 |
| **vite build exit code** | **0** |
| modules transformed | 7 |
| build time | ~371 ms |
| vite version banner | vite v8.1.4 building client environment for production |

### Bundle inventory (generated; not committed as binary tree)

| File | Bytes | gzip (Vite report) |
| --- | --- | --- |
| dist/index.html | 275 | 0.21 kB |
| dist/assets/index-Dga_xtSY.js | 2,422,241 | 894.40 kB |
| **dist total** | **2,422,516** | |

Note: large JS chunk is expected (Rapier deterministic-compat inlines WASM base64 + Three). Warning about >500 kB is informational only; build succeeded.

## What this proves vs does not prove

| Claim | Status |
| --- | --- |
| Vite 8.1.4 production-builds an entry importing Three + Rapier-compat | **Proven** (exit 0 + dist artifacts) |
| `require.resolve('vite')` alone | **Not** build proof — earlier `js-resolve.log` is package-resolve-only |
| Field `viteResolved: true` in Node Rapier determinism log | **Unsupported as build proof** — relabeled; see js-toolchain-smoke.log note |
| WebView2 runtime load / GPU | Not proven by this smoke |

## Artifacts in repo (no node_modules / no dist tree)

- `preproduction/evidence/cycle-03/vite-build-smoke.md` (this file)
- `preproduction/evidence/cycle-03/vite-build-smoke.log` (vite stdout/stderr)
- `preproduction/evidence/cycle-03/vite-build-dist-inventory.txt` (size inventory)

Disposable build tree remains only under implementer temp; **not** committed.
