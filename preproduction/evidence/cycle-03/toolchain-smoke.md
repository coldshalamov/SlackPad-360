# Cycle 03 toolchain smoke evidence

Access date: 2026-07-10
Baseline commit: e4abb6e30bbbeec2280d56cbf18f6f91d1ac2e42

## Machine
- Node: v24.15.0 (satisfies Vite 8 engines ^20.19.0 || >=22.12.0)
- npm: 11.5.2
- .NET SDKs installed: 8.0.419 only (no .NET 10 SDK)

## JS disposable smoke — Rapier determinism + Three import (Node)
- Path: disposable temp (outside production tree)
- Packages: three@0.185.1, @dimforge/rapier3d-deterministic-compat@0.19.3, vite@8.1.4
- Result: ok=true; two 120-step Rapier runs produced identical SHA-256 pose hashes
- Hash: 9093f5c3b52324488f1d71b32c6b0f7495fcdf0bb28006af1d40a9a8efd3157c
- Three: THREE.Scene and THREE.WebGLRenderer resolve (revision 185)
- Log: `js-toolchain-smoke.log`
- Note: any package-resolve of Vite is **not** build proof (see vitePackageResolveOnly)

## JS disposable smoke — **real Vite production build** (authoritative bundler proof)
- Path: `%TEMP%/grok-goal-2c7ab443ef36/implementer/vite-build-smoke`
- Pins: vite@8.1.4, three@0.185.1, @dimforge/rapier3d-deterministic-compat@0.19.3
- Command: `npm install --no-fund --no-audit` then `npx vite build`
- **Exit code: 0**
- Output: dist/index.html (275 B) + dist/assets/index-Dga_xtSY.js (2,422,241 B); total 2,422,516 B
- Evidence: `vite-build-smoke.md`, `vite-build-smoke.log`, `vite-build-dist-inventory.txt`
- node_modules and dist **not** committed

## .NET 10 + WebView2 smoke
- Status: NOT RUN — .NET 10 SDK not installed
- Do not mutate global machine state in cycle 3
- Prerequisite for host smoke / P0:
  1. Install .NET 10 SDK from https://dotnet.microsoft.com/download/dotnet/10.0
  2. Verify: `dotnet --list-sdks` shows 10.x
  3. Disposable project:
     ```
     mkdir %TEMP%\slackpad-host-smoke && cd %TEMP%\slackpad-host-smoke
     dotnet new winforms -n WebView2Smoke -f net10.0-windows
     cd WebView2Smoke
     dotnet add package Microsoft.Web.WebView2 --version 1.0.4078.44
     dotnet restore
     dotnet build -c Release
     ```
  4. Capture stdout/stderr to preproduction/evidence/cycle-03/dotnet-webview2-smoke.log

## Selected pins (re-verified 2026-07-10)
- Host TFM: net10.0-windows (.NET 10 LTS EOS 2028-11-14; .NET 8 EOS 2026-11-10)
- Microsoft.Web.WebView2: 1.0.4078.44 (NuGet stable; 1.0.4126-prerelease exists and is not selected)
- Node LTS line: 22.x LTS or 20.19+; machine used 24.15.0 (Current) which matches Vite engines >=22.12.0
- TypeScript production pin: 5.9.3 (ecosystem-stable); registry also has 7.0.2 — recheck at implement
