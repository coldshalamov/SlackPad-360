/goal Perform SlackPad 360 preproduction cycle 3: consolidate the researched design into one authoritative production package, close the remaining web/toolchain/asset questions, and write the literal gate-aware autonomous build goal that can implement and verify the complete game later.

Workspace:

`C:\Users\93rob\Documents\GitHub\SlackPad 360`

## Mission

This is the third and final planning/specification iteration. Do not produce another parallel pile of opinions. Resolve contradictions, show the diff from cycles 1 and 2, select one production architecture, define exact milestones and acceptance gates, centralize every acquired asset and remaining art brief, and create a self-contained `/goal` prompt for a future autonomous implementation run.

Do not implement the production game in this cycle. Disposable dependency/compile/determinism smokes, asset acquisition, validators, and planning artifacts are allowed.

## Resource ownership: Blender is unavailable now

Another agent owns the currently running Blender process for an unrelated space game.

- Do not invoke Blender MCP.
- Do not inspect, control, save, close, or reuse the active Blender session.
- Do not read other game repositories, shared Blender temporary outputs, recent files, scenes, caches, or assets.
- Do not create a second Blender process during this run.
- Keep every SlackPad artifact inside this repository or a disposable temp directory created specifically for dependency smoke tests.
- The final autonomous build goal must contain an isolated Blender ownership check: it may use Blender only in a later run when no foreign Blender process is active and the SlackPad output path is explicit. Otherwise it must pause that art milestone without touching the foreign process.

## Read and validate first

Read:

1. root `README.md`
2. all `research/`
3. `preproduction/README.md`
4. all cycle prompts
5. all files under `preproduction/cycles/01-foundation/`
6. all files under `preproduction/cycles/02-adversarial/`
7. both files under `preproduction/reviews/`
8. all asset catalogs, source sidecars, and preview index

Run all existing validators. Record the current baseline commit and dirty tree. Preserve cycles 1 and 2 exactly. Do not rewrite them to make the final package look cleaner.

## Product contract that is not negotiable without evidence

- Windows-first 3D skate/fingerboard game.
- Two trackpad contacts are two feet.
- Physical click is a discrete kick/pop primitive; plant, lift, slow translation/rotation, flick, sweep, sustained bias, and catch/replant complete the vocabulary.
- Slow movement is continuous control; fast gestures contribute categorical intent.
- Regular/goofy stance and hand-angle calibration are first-class.
- Hybrid, interruptible maneuvers: recognition commits intent/impulse envelopes; collision, approach, catch, landing, grind entry, over/under-rotation, and failure remain physical and observable.
- Disembodied detailed shoes/feet and a detailed unbranded board are acceptable; a full humanoid is not required.
- Professional tactile visuals, compact line-rich plaza, and stable 60 FPS on target laptop class. No permanent low-quality art strategy.
- 50-50 in first vertical slice; boardslide family in first ship because sideways rail entry is central user intent.
- Human hardware, replay, synthetic tests, and agents share the ContactFrame-derived pipeline. No direct trick or pose API.
- Pure browser is not the human dual-foot product; native Windows host + WebView2 owns hardware input.

## Mandatory cycle-3 corrections and closure work

### 1. Current production toolchain

1. Correct cycle 2's `.NET 8` choice. Microsoft's official policy shows .NET 8 support ends 2026-11-10 and .NET 10 LTS runs through 2028-11-14. Default the new host to `net10.0-windows` unless an actual compile/interoperability result requires otherwise.
2. Verify and record the current stable `Microsoft.Web.WebView2` NuGet package. As of the independent audit it is `1.0.4078.44`; re-query the primary registry.
3. Re-query exact npm versions and engine requirements for Node, Vite, TypeScript, Three.js, `@dimforge/rapier3d-deterministic-compat`, Vitest, fast-check, three-mesh-bvh, glTF Transform, and any selected UI/icon package.
4. Choose a Node LTS line compatible with the selected Vite version. Record required SDK/runtime versions and installation checks.
5. In a disposable directory outside production paths, install the exact selected JS packages and run a smoke that:
   - imports/initializes Rapier;
   - creates a tiny deterministic world;
   - steps a fixed number of frames twice from identical inputs;
   - compares snapshots or hashes;
   - imports Three and confirms the selected bundler can resolve both packages.
6. If `.NET 10` SDK is installed, create a disposable restore/build smoke with the selected WebView2 package. If not installed, do not modify global machine state; record exact prerequisite and commands for the build goal.
7. Save concise smoke evidence under `preproduction/evidence/cycle-03/`, excluding dependency caches and `node_modules`.

### 2. Final architecture

Produce one normative module topology and ownership contract for:

- native Windows host
- pointer and Raw Input adapters
- ContactFrame transport/ring buffer
- foot identity and stance calibration
- gesture FSM and confidence/hysteresis
- deterministic simulation
- maneuver assist controller
- grinding/collision/failure
- animation/foot presentation
- renderer/camera
- UI/audio
- replay/telemetry
- agent harness
- asset pipeline

Specify public interfaces and data ownership enough that an implementation agent cannot invent incompatible subsystems. Resolve exact fixed-step policy, batching, interpolation, clocks, seeds, save format, replay header/versioning, and host/page message envelopes. Keep empirical constants parameterized.

### 3. Final control and physics contract

1. Consolidate the exact primitive and trick grammar for push, steer, ollie, nollie, kickflip, heelflip, front/back shuv 180, catch, land, bail, 50-50, and boardslide.
2. Include all device-mode and conflict tables.
3. Specify the difference between recognition occurrence and intensity-dependent output.
4. Give implementable maneuver-assist equations/state transitions with interrupt and failure behavior.
5. Define feet/shoe animation and catch volumes so catches are skillful but not millimeter-perfect.
6. Define grind detection, family classification, snap limits, balance, exit, and collision interruption.
7. Keep single-board-body v0 only if the cycle-2 comparison and selected OSS study still support it; place raycast wheel/truck behavior at a measured probe milestone.
8. Define camera behavior for ground, prep, air, grind, bail, and replay without changing the board-local input frame.

### 4. Asset completion and honest gaps

1. Reconcile the final asset bill against the acquired files.
2. Inspect and preserve the current license/provenance/hashes.
3. Research exact license-clean audio assets for roll, push, pop, catch, land, bail, grind, ambience, and UI. Prefer direct CC0 downloads that do not require account scraping. Acquire useful, reasonably sized originals with LICENSE/SOURCE/checksum/previews or waveform summaries.
4. Search only remaining high-value exact asset gaps: generic unbranded shoe/foot base, detailed board/trucks/wheels base, modular plaza geometry, grip/rubber material. Stop if results repeat the known low-quality/unclear-license pattern.
5. Do not lower quality to mark a box complete. Mark hero board/shoes/final plaza as bespoke when appropriate.
6. Produce the final isolated Blender task contract from the cycle-2 briefs, including process-ownership checks, output paths, `.blend` and GLB deliverables, render shots, geometry/LOD/material/rig/collider acceptance, and catalog updates. Do not run it now.
7. Define what can be procedurally authored in Three.js without compromising quality and what must be a GLB.
8. Keep `assets/runtime/` empty unless an asset has genuinely passed quality, license, and runtime-format review. Source acquisition is not runtime approval.

### 5. Milestone plan

Create a dependency-ordered implementation plan with explicit entry/exit evidence. At minimum:

0. environment/toolchain smoke and repository guardrails
1. P0 native dual-contact hardware spike (both Windows pointer and Raw Input)
2. ContactFrame, replay, agent, and deterministic sim skeleton
3. foot tracking/calibration and ground locomotion
4. ollie/nollie and catch/land/bail vertical slice
5. flips/shuvs and recognizer conflict tuning
6. grind system: 50-50 then boardslide
7. camera, shoes/feet animation, and failure presentation
8. isolated hero art + modular plaza asset pipeline
9. compact plaza, UI, onboarding, audio, challenges, scoring
10. performance, accessibility, packaging, release evidence

For each milestone include scope, inputs, modules/files, tests, agent scenarios, visual/runtime checks, performance budget, human/device gate, failure/pivot rule, and commit boundary.

G1 failure must stop expensive content. Synthetic work may continue only where reusable after an input pivot.

### 6. Verification and observability

Consolidate:

- unit, property, golden, integration, replay-hash, and host-contract tests
- malformed/noisy input streams and identity reassignment
- discrete/continuous recognizer conflicts
- deterministic physics interruption/catch/land/bail/grind scenarios
- agent API and anti-cheat contract tests
- Playwright/WebView2 screenshot and canvas-pixel checks
- desktop viewport framing and text-overlap checks
- render/material/shadow/asset existence checks
- frame time, physics time, input latency, memory, draw call, triangle, texture, and bundle budgets
- hardware and human protocols with evidence levels
- installer/offline/first-run/calibration recovery tests

Define exact evidence artifact paths and machine-readable result formats. The future agent must leave enough traces for another agent to diagnose feel without direct trackpad access.

### 7. Internet stop decision

Run a final, bounded research sweep only for unresolved high-value questions. The final stop log must list:

- topic
- queries/sources checked
- decision or negative result
- remaining uncertainty class
- why another web search is unlikely to change implementation
- implementation-time recheck trigger

Do not say “internet exhausted” globally if a named asset or dependency is still merely unsearched.

## Required final package

Create `preproduction/cycles/03-production/` with:

1. `README.md`
2. `audit-findings.md` disposing every cycle-2 Codex finding
3. `delta-from-cycle-02.md`
4. `cross-cycle-decision-log.md`
5. `final-product-and-scope-spec.md`
6. `final-input-and-trick-spec.md`
7. `final-physics-animation-camera-spec.md`
8. `final-technical-architecture.md`
9. `final-art-assets-world-audio-spec.md`
10. `final-observability-and-verification.md`
11. `implementation-milestones.md`
12. `autonomy-and-empirical-gates.md`
13. `risk-register.md`
14. `unresolved-gates.md`
15. `internet-stop-log.md`
16. `asset-readiness.json`
17. `dependency-lock.json`
18. `decisions.json`
19. `sources.json`
20. `milestones.json`
21. `review-checklist.md`

Create `preproduction/final/` with:

1. `README.md` - authoritative navigation and readiness verdict
2. `AUTONOMOUS_BUILD_GOAL.md` - the literal self-contained `/goal` prompt
3. `IMPLEMENTATION_PLAN.md` - concise executable milestone view
4. `ACCEPTANCE_MATRIX.md` - requirements to tests/evidence/gates
5. `ASSET_MANIFEST.md` - acquired, runtime-ready, bespoke, deferred, rejected
6. `ARCHITECTURE.md` - normative summary and interfaces
7. `RISK_AND_GATES.md` - stop/continue/pivot rules

Also create:

- `preproduction/probes/validate-cycle-03.mjs`
- `preproduction/probes/validate-final.mjs`
- concise evidence logs under `preproduction/evidence/cycle-03/`
- updated asset/dependency catalogs for any new verified acquisition or corrected selection

Do not modify cycle 1 or cycle 2.

## AUTONOMOUS_BUILD_GOAL requirements

The generated goal is itself a primary deliverable. It must:

- start with `/goal` and be directly runnable by an agent from repo root;
- be self-contained and reference the authoritative final files;
- instruct the agent to inspect dirty tree and preserve unrelated work;
- define exact architecture, product scope, asset rules, and quality bars;
- execute the milestone order with tests and commits after each accepted milestone;
- start with environment and G1 hardware work before expensive content;
- continue autonomously through software-verifiable work;
- pause only at specifically named device/human/Blender-ownership gates;
- request the smallest possible user action and save a resumable evidence bundle;
- never claim G1/G2/G5 from synthetic tests alone;
- never use direct trick/pose shortcuts for the agent;
- never touch a foreign Blender process or unrelated workspace;
- require professional visuals and prohibit performance reward-hacking through permanent quality reduction;
- use proven dependencies and acquired licensed assets according to the manifests;
- require browser/WebView2 runtime interaction, screenshots, canvas-pixel checks, and deterministic agent playtests;
- define done as a playable packaged first-ship scope, not a code scaffold;
- include failure/pivot behavior and a concise final report format.

## Validators

The cycle-3 and final validators must fail on:

- missing deliverables or invalid JSON
- changed cycle-1 or cycle-2 files
- stale `.NET 8` as the selected final host target
- adopted dependency without exact identifier/license/version-or-pin rule
- asset marked acquired without path/hash/source/license sidecars
- asset marked runtime-ready without quality/license/runtime evidence
- missing hero/audio/plaza gap disposition
- missing cross-cycle delta
- unresolved gate without accept/reject/fallback/pause owner
- autonomous goal missing `/goal`, G1-first rule, ContactFrame-only agent, Blender ownership rule, milestone commits, verification, or stop semantics
- production game implementation paths
- untracked scratch terminal folders

Run all validators twice where requested, all earlier validators, JSON parses, evidence-ID resolution, asset hash verification, and `git diff --check`.

## Completion standard

Cycle 3 is done only when:

- all three planning iterations are preserved and diffable;
- cycle 2's `.NET 8` drift is corrected with primary evidence;
- selected dependencies are compatible enough to begin implementation;
- the asset workspace contains every safely acquirable source plus explicit isolated-authoring contracts for bespoke gaps;
- audio and remaining asset searches have real positive or negative results;
- the final package has one authoritative answer per subsystem;
- every remaining uncertainty is empirical, implementation-time maintenance, or explicitly owned by a gate;
- the autonomous build goal can be executed without access to this conversation;
- no production game has been implemented in preproduction.

End with a concise summary of final decisions, assets added, toolchain smoke results, remaining empirical/art gates, validator results, and the exact path of `AUTONOMOUS_BUILD_GOAL.md`.
