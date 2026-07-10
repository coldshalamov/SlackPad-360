/goal Perform SlackPad 360 preproduction cycle 2: an adversarial, evidence-driven revision of cycle 1 that acquires the usable asset base, settles dependency and architecture ambiguities, and produces an explicit diff rather than rewriting history.

You are working in:

`C:\Users\93rob\Documents\GitHub\SlackPad 360`

## Operating mode

- Work autonomously and deeply.
- You may browse the web, inspect repositories and package registries, download redistributable free assets, and run scripts.
- **Blender is unavailable in this cycle.** Another agent owns the currently running Blender process for an unrelated space-game repository. Do not invoke Blender MCP, inspect or control any Blender process/session, read shared Blender temporary outputs, or infer that any open scene or recent Blender asset belongs to SlackPad 360.
- Keep every acquired or generated SlackPad artifact inside `C:\Users\93rob\Documents\GitHub\SlackPad 360`. Do not inspect unrelated game workspaces for reusable assets.
- Do not build the production game in this cycle.
- Small non-Blender asset-pipeline proofs, license checks, source-code studies, and validators are preproduction work and are allowed.
- Preserve `research/` and `preproduction/cycles/01-foundation/` unchanged. Cycle 1 is an immutable baseline at commit `53b3f14`.
- Preserve unrelated user work. Do not reset or clean the repository.
- Prefer primary sources: official API docs, package registries, upstream repositories, license files, standards, papers, and original asset pages.
- Never treat a search-result summary, marketplace label, generated prose, or transcript as evidence.
- Label claims as confirmed fact, inference, recommendation, hypothesis, or unresolved.
- Keep URLs, access dates, versions/commit hashes, license terms, and local evidence paths beside consequential decisions.
- Do not claim that web research can prove target-device behavior, ergonomics, fun, or visual quality.

## Read first

Read all of:

1. root `README.md`
2. every file under `research/`
3. `preproduction/README.md`
4. `preproduction/prompts/cycle-01-foundation.md`
5. every file under `preproduction/cycles/01-foundation/`
6. `preproduction/reviews/01-foundation-codex-audit.md`
7. `assets/README.md` and every current asset catalog

Run the existing research and cycle-1 validators before changing anything. Record the baseline commit and dirty tree. Do not edit cycle 1 to make cycle 2 look cleaner.

## Product intent that must survive

SlackPad 360 is a Windows-first 3D skateboarding/fingerboarding game. Two trackpad contacts are two feet. A physical click is a discrete kick/pop primitive; lift, plant, relative motion, flick, and sweep are other primitives. Slow motion controls continuously; fast motion participates in categorical trick recognition. The board should accelerate while both feet are planted through an ergonomic push rule. Stance and foot swapping must support regular and goofy play.

The target feel is a defensible browser-rendered analogue of Skate-style gestural initiation plus Tony Hawk's Underground 2-style compact line exploration. It is not a microscopic fingerboard simulator and not a canned trick menu. Recognition may commit an interruptible maneuver envelope; real collision, approach, catch, landing, grind entry, under/over-rotation, and failure must still matter.

The product must look intentional and professional. Low-detail CC0 kits may prove layout but are not a substitute for a detailed hero board, convincing shoes/feet, materials, lighting, and a coherent plaza. Do not improve performance by permanently lowering the visible-quality target.

Agents, replays, synthetic tests, and hardware must enter through the same ContactFrame-derived pipeline. An agent may not call a trick or set the board pose directly.

## Mandatory adversarial questions

### A. Input and native platform

1. Re-verify the exact current behavior and status of:
   - `RegisterTouchpadCapableWindow` / `RegisterTouchpadCapableThread`
   - `GetPointerTouchpadInfo` and frame/history variants
   - Windows Precision Touchpad HID collection/report usages
   - Raw Input HID access for Digitizers / Touch Pad (`0x0D/0x05`)
   - WebView2 host-to-page transport options and timing
2. Distinguish documented API shape from proven free dual-contact behavior.
3. Design the smallest P0 native hardware spike. Specify files/modules, trace format, test gestures, timestamps, metrics, and exact accept/reject/fallback rules.
4. Decide whether Win11 pointer APIs or Raw Input should be primary for the first executable. Do not choose by aesthetic preference.
5. Produce a device-mode matrix for:
   - mechanical clickpad
   - haptic/force clickpad
   - tap-to-click
   - Windows left/right click zones
   - zero, one, and two contacts at click
   - simultaneous and staggered lifts
   - contact-ID reassignment
   - no pressure/force signal
6. Resolve how click attribution supports the user's left-foot/right-foot mental model when hardware only exposes a report-level button.
7. Define regular/goofy calibration, hand-angle calibration, board-local axes, and camera invariance without assuming a physically uncomfortable hand orientation.

### B. Trick grammar and feel

1. Attack every v0 sequence for ambiguity and ergonomic cost.
2. Build an explicit primitive vocabulary: plant, lift, click/kick, slow translate, slow rotate, flick, sweep, catch/replant, sustained bias.
3. For each primitive, decide whether magnitude, direction, duration, timing, or merely occurrence matters.
4. Specify recognition confidence, hysteresis, cancellation, conflicts, failed-recognition feedback, and adaptive calibration limits.
5. Preserve the distinction between discrete intent recognition and continuous physical outcome.
6. Decide the minimum enjoyable launch vocabulary. Reconsider whether boardslide must be in the first vertical slice because the user explicitly wants turning sideways into a grind; distinguish prototype slice from first ship.
7. Explain how partial flips, missed catches, upside-down foot plants, over/under-rotation, rail collisions, and bails behave. The answer may be assisted, but cannot be undefined.
8. Separate automatic visual foot animation from actual required finger precision. Players must not need impossible millimeter-perfect virtual shoe contact to catch a board.

### C. Physics, animation, and camera

1. Compare at least these physical representations:
   - one dynamic board body with assisted impulses and cosmetic rider mass
   - board body plus constrained/raycast truck and wheel contacts
   - a more articulated board/truck/wheel or rider-foot constraint model
2. Evaluate each against stability, determinism, rail/coping interaction, truck lean, wheel roll, flip/catch, failed landings, animation integration, CPU budget, and implementation risk.
3. Inspect official Rapier capabilities and multiple inspectable open-source skating/vehicle implementations. Record what can be adopted, studied, or rejected and why. Do not infer quality from stars.
4. Verify the exact Rapier npm package. Cycle 1's `@dimforge/rapier3d-deterministic` name conflicts with its `-compat` source URL. Decide and record the exact current install/import/bundler strategy and determinism caveats.
5. Specify the maneuver-assist controller mathematically enough to implement: state, target angular velocity/impulse envelopes, interruption, catch damping, landing cones, fail transitions, grind constraints, and assist-level boundaries.
6. Specify visual feet/shoes attachment, IK or procedural placement, board separation during tricks, catch animation, and bail presentation. Do not assume a full humanoid if disembodied shoes work better.
7. Decide 60 vs 120 Hz as a benchmark plan, not an unsupported constant.
8. Produce a camera shot/transition contract that lets players read foot placement, board rotation, obstacles, and rails without changing the input frame.

### D. Reuse and dependencies

1. Search current official registries/upstream repositories for every planned runtime, host, test, graphics-debug, asset-pipeline, and packaging dependency.
2. Record exact package/repository name, current stable version or commit, license, maintenance signal, role, ownership boundary, integration risk, alternative, and rejection reason.
3. Inspect candidate open-source skating projects at source level. Identify any reusable algorithms, tests, data formats, camera ideas, or asset workflows. Avoid copying proprietary behavior or weak prototypes wholesale.
4. Do not vendor `node_modules` or nested Git repositories. For uniquely valuable reference code, copy only the minimum license-compatible files into `third_party/reference/<project>/` with the upstream LICENSE, commit hash, source URL, and a note saying reference-only or adoptable. Otherwise pin by manifest.
5. Include host-language evidence for C#/.NET WebView2 versus Rust. Select a primary path and state the trigger for changing it.

### E. Assets and visual quality

Cycle 2 must turn the asset shell into a useful, auditable preproduction library.

1. Define the exact needed asset bill of materials for:
   - detailed hero board: deck, grip, trucks, wheels, bearings/hardware
   - generic unbranded skate shoes and minimal foot/ankle rig
   - modular plaza geometry and collision proxies
   - concrete, painted metal, galvanized steel, wood, rubber/grip materials
   - one daylight HDRI or equivalent environment lighting source
   - rail, coping, curb, stair, bank, quarter-pipe, ledge, and background props
   - roll, push, pop, catch, land, bail, grind, surface, ambience, and UI audio
   - fonts/icons only if needed and license-clean
2. Find exact asset pages, not just collection homepages. Verify commercial use, modification, and redistribution from the original page/license.
3. Download only selected, reasonably sized, clearly redistributable candidates to `assets/source/vendor/<asset-id>/`.
4. Place the exact license text, `SOURCE.md`, original filename, checksum, retrieval date, and unmodified original beside each download.
5. Update `assets/catalog/assets.json` and `licenses.json` with exact records. A downloaded file with missing provenance is a failure.
6. Generate inspectable previews/contact sheets under `assets/generated/previews/`; keep original sources untouched.
7. Reject assets that are technically free but visibly conflict with the professional target.
8. Determine the bespoke art gap. If no suitable hero board or shoe asset is both high-quality and safely redistributable, produce a Blender-ready modeling brief detailed enough for a later isolated asset-authoring pass. Include dimensions, topology targets, named parts, pivots, materials, UV/texture requirements, rig/attachment points, LODs, collision proxies, export settings, and shot-based acceptance renders. Do not create branded graphics.
9. Record Blender authoring as deferred because the shared Blender process is owned by unrelated work, not because the asset is optional. Cycle 3 must either schedule an isolated Blender pass or select an equally credible non-Blender source.
10. Do not promote anything into `assets/runtime/` until geometry/material/license/performance checks pass.

### F. Verification, evidence, and autonomy

1. Separate evidence levels:
   - structural smoke
   - deterministic automated regression
   - hardware acceptance
   - formative feel test
   - tuning study
   - release confidence
2. Revisit all `n >= 5` statements. Keep small samples where appropriate but do not call them release proof.
3. Define deterministic golden traces and property tests for malformed/noisy ContactFrame streams, foot identity, click attribution, recognizer conflicts, maneuver interruption, catches, landings, bails, grinds, and replay hashes.
4. Define image/frame/performance checks for the Three.js scene, including nonblank canvas, visual framing, materials, shadow/readability, no overlap, desktop viewport, and target laptop FPS/frame-time evidence.
5. Define the agent API as an observable test harness: reset, inject ContactFrame, step, observe, capture, replay, log. Prevent direct pose/trick shortcuts.
6. Design a gate-aware autonomous process. For each human/device gate, specify what the agent can do first, exactly when it must pause, the smallest user action needed, and what artifacts let it continue.
7. Define stop/continue/pivot rules so a failed G1 does not trigger months of content work.
8. State which unknowns web research can no longer reduce and why.

## Required deliverables

Create `preproduction/cycles/02-adversarial/` containing at minimum:

1. `README.md` - verdict, committed recommendations, remaining gates, and navigation
2. `audit-findings.md` - findings ordered by severity with evidence
3. `delta-from-cycle-01.md` - Added / Changed / Rejected / Deferred table with cycle-1 references
4. `product-and-scope-spec.md`
5. `input-platform-and-device-spec.md`
6. `input-and-trick-spec.md`
7. `physics-animation-and-camera-spec.md`
8. `technical-architecture.md`
9. `reuse-and-dependency-audit.md`
10. `asset-bill-of-materials.md`
11. `asset-selection-and-gap-plan.md`
12. `art-direction-and-shot-rubric.md`
13. `world-ui-audio-spec.md`
14. `observability-and-verification.md`
15. `autonomy-and-gate-plan.md`
16. `risk-register.md`
17. `open-questions.md`
18. `internet-stop-log.md` - search areas, decisive sources, dead ends, and why more browsing has diminishing value
19. `decisions.json`
20. `sources.json`
21. `review-checklist.md`

Also create or update:

- selected source assets and licenses under the established `assets/` contract
- `assets/catalog/assets.json`
- `assets/catalog/licenses.json`
- `assets/catalog/dependencies.json`
- `preproduction/probes/validate-cycle-02.mjs`
- optional `third_party/reference/` files only under the strict minimal-copy rule above

Do not modify cycle-1 files. Any correction belongs in cycle 2 and its delta.

## Machine-readable requirements

`decisions.json` must include stable IDs, status, decision, rationale, evidence IDs, alternatives, rejection reasons, confidence, owner, implementation consequence, validation method, and reopen trigger.

`sources.json` must include stable ID, title, canonical URL, publisher/author, source type, access date, primary/secondary classification, supports, limitations, and local evidence path when downloaded.

Asset catalog records must include exact asset page, exact license, author, original filename, local path, SHA-256, retrieval date, allowed uses, attribution, modification status, review status, runtime intent, preview path, and rejection reason when rejected.

Dependency records must include exact install/repository identifier, selected version/commit or explicit pin-at-build rule, license, role, ownership boundary, maintenance evidence, integration risk, selected alternative, and decision.

## Validator requirements

`validate-cycle-02.mjs` must fail on at least:

- missing required deliverable
- modification or deletion of cycle-1 baseline files relative to commit `53b3f14`
- invalid JSON
- a downloaded asset without path, hash, source, license, and source/license sidecars
- a runtime asset that is not approved
- a dependency marked adopt without an exact identifier and license
- unresolved references to the incorrect Rapier package name unless explicitly quoted as a cycle-1 defect
- missing delta entries
- missing accept/reject/fallback for open gates
- missing evidence-level distinction
- production game implementation paths

Run the validator twice, both research validators, the cycle-1 validator, JSON parse checks, and `git diff --check`. Record commands and outcomes.

## Completion standard

Cycle 2 is complete only when:

- every Codex audit finding is accepted, rejected with evidence, or resolved;
- revisions are traceable to cycle 1;
- exact dependency names and current upstream evidence are recorded;
- the asset workspace contains useful selected source assets or a precise evidence-backed Blender-ready brief for each bespoke gap;
- visual quality has inspectable references/previews, not prose alone;
- physics representation and assistance boundaries are implementable and honestly scoped;
- the native hardware uncertainty has a minimal executable gate and cannot be mistaken for solved research;
- the autonomous process knows when to continue and when to pause;
- further internet research areas are either exhausted or explicitly deferred to implementation-time version checks;
- no production game has been implemented.

End with a concise report of files created, assets acquired/authored, decisions changed, remaining empirical gates, validator results, and the strongest arguments cycle 3 must still attack.
