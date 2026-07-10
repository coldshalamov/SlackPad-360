/goal

Act as the lead game director, technical director, input-systems researcher,
physics designer, art director, asset technical artist, and QA architect for
SlackPad 360. Work autonomously in this repository:

C:\Users\93rob\Documents\GitHub\SlackPad 360

This is preproduction cycle 1 of 3. Do not implement the production game. Your
job is to assemble a complete, evidence-backed foundation that later cycles can
criticize and improve.

Read the root README and every file under `research/` before deciding anything.
Treat existing research as input, not infallible truth. Preserve it. Do not
touch `mcps/`, do not create tool-schema dumps, and do not rewrite Git history.

## Product target

Design a professional 3D skateboarding/fingerboarding game rendered with
Three.js and controlled by two fingers on a Windows laptop Precision Touchpad.
Each contact represents a foot. Plant, lift, move, flick, sweep, and return are
foot primitives; a physical click is a discrete kick/pop commitment. The game
should capture the expressive, forgiving philosophy of Skate's Flick-It system
and the immediate line-building/exploration appeal of Tony Hawk's Underground 2
without copying proprietary code, art, levels, branding, or exact content.

The game is not a microscopic rigid-body fingerboard simulator. Recognized
gestures should initiate assisted but interruptible physical maneuvers. The
player must still own approach, direction, timing, catch, landing, rail contact,
and failure. The visual target must be detailed, coherent, and professional on
the target laptop; poor graphics are not an acceptable performance strategy.

The first shipping scope should favor a compact, replayable skate plaza and a
small but combinable trick vocabulary over a huge trick encyclopedia. The full
architecture must preserve deterministic ContactFrame recording/replay and an
agent API that uses exactly the same input path as a human.

## Mandatory research and decisions

1. Product and audience
   - Define the fantasy, core loop, session length, progression-light sandbox,
     failure/recovery loop, accessibility, difficulty/assistance modes, and
     explicit non-goals.
   - Define what "physics at least at Skate or THUG2 quality" means in measurable
     game-feel and interaction terms instead of an unsupported AAA comparison.

2. Input and trick grammar
   - Consolidate the research into a normative ContactFrame contract, logical
     foot tracker, click-centered gesture state machine, stance/hand calibration,
     recentering, edge behavior, catch model, and false-positive policy.
   - Produce exact v0 gesture sequences and conflicts for push, steer, ollie,
     nollie, kickflip, heelflip, front/back shuv, 180 modifiers, catch, landing,
     bail, and one initial grind family.
   - Clearly separate guaranteed hardware signals, inferred intent, tunable
     thresholds, categorical triggers, bounded continuous modifiers, and
     playtest-only hypotheses.

3. Physics and camera
   - Specify the hybrid maneuver controller, Rapier body/collider model,
     skateboard dimensions/units, mass/inertia strategy, rolling/lateral
     friction, wheel/truck approximation, ramps, air control, torque targets,
     catch/landing cones, bail causes, grind candidate detection, snap limits,
     balance, exits, and collision interruption.
   - Specify a low three-quarter chase camera with concrete state transitions,
     occlusion handling, look-ahead, air/grind framing, reset behavior, and
     board-relative input invariants.
   - Identify what must be measured in prototypes rather than guessed.

4. Runtime and Windows host
   - Select a single primary architecture for the Windows-first product and a
     fallback path. Cover Win11 touchpad APIs, Raw Input fallback, WebView2 host,
     native-to-JavaScript transport, fixed-step simulation, renderer separation,
     context loss, save/config boundaries, security, packaging, and updates.
   - Audit RawInput.Touchpad, Microsoft WebView2Samples, Rapier, Three.js,
     fast-check, three-mesh-bvh, glTF Transform, meshoptimizer, KTX2, SpectorJS,
     and any superior current alternatives. Do not add dependencies because they
     are fashionable; give each one an ownership boundary and rejection reason.

5. Existing open-source work
   - Search broadly for open-source skateboarding games, vehicle/board
     controllers, grind systems, replay systems, gesture recognizers, touchpad
     visualizers, camera rigs, physics testbeds, park generators, and Blender
     assets that could reduce debugging.
   - For every candidate, inspect the actual repository when possible. Record
     repository URL, exact commit/tag, maintenance state, language/engine,
     architecture, reusable components, quality concerns, license, transitive
     licensing risks, and whether to adopt, study, or reject.
   - Prefer primary repositories and official documentation. Never equate
     "available to download" with permission to redistribute.

6. Art direction and assets
   - Establish a distinctive visual direction appropriate to a tactile
     fingerboarding game: detailed board and shoe materials, readable obstacles,
     convincing scale, daylight/environment lighting, restrained effects, and
     strong motion/readability. Avoid generic low-poly, flat prototype, excessive
     bloom, or deliberately degraded visuals.
   - Define units, axes, naming, pivots, material conventions, texture density,
     collision proxies, LODs, lightmaps, animation ownership, GLB export,
     meshopt/KTX2 optimization, performance budgets, and Blender source policy.
   - Search for free assets and reference projects. Download only assets that are
     clearly licensed for commercial reuse and are genuinely useful. Keep the
     original license and source URL beside every downloaded item. Do not bulk
     download or import uncertain assets.
   - You may use the configured Blender MCP to inspect candidate models, validate
     scale/materials/topology, or make preview renders. Do not create final art
     merely to fill directories. Record every Blender action and output.

7. World, audio, UI, and presentation
   - Specify a compact but exploration-rich plaza with line loops, verticality,
     rails, ledges, stairs, banks, quarter pipes, recoverable failures, spawn and
     reset logic, tutorial affordances, and performance-aware modularity.
   - Define skateboard sounds, surface audio, impacts, grinds, ambience, music
     policy, UI/HUD, onboarding, calibration, settings, replay/input theater,
     accessibility, and visual feedback for recognized gestures and assists.

8. Observability and verification
   - Define deterministic recordings, golden traces, synthetic gesture
     generation, property-based tests, physics invariants, agent restrictions,
     screenshots/video evidence, visual regression, performance budgets,
     latency measurement, hardware test matrix, playtest protocol, and release
     gates.
   - Every requirement must have an objective verification method or be labeled
     subjective with a structured playtest procedure.

## Asset workspace contract

Create and document this top-level structure only as needed:

- `assets/catalog/` machine-readable manifests and license ledger
- `assets/source/vendor/` untouched licensed originals with LICENSE/source files
- `assets/source/blender/` editable `.blend` sources created for this project
- `assets/reference/` legally retainable visual/technical references
- `assets/generated/` generated candidates and preview renders
- `assets/runtime/` reserved for validated shipping GLB/textures/audio; do not
  populate with unvalidated candidates

Every asset record must include id, description, source URL, author, exact
license/SPDX when possible, retrieval date, original filename, checksum,
allowed uses, attribution requirement, modification status, runtime intent,
and review status. Code dependencies belong in a dependency ledger, not vendored
into `assets/`.

## Required cycle-1 outputs

Create `preproduction/cycles/01-foundation/` containing:

- `README.md` with committed recommendations and unresolved gates
- `product-vision.md`
- `game-design-spec.md`
- `input-and-trick-spec.md`
- `physics-and-camera-spec.md`
- `technical-architecture.md`
- `art-direction.md`
- `world-ui-audio-spec.md`
- `asset-acquisition-and-pipeline.md`
- `reuse-and-dependency-audit.md`
- `observability-and-verification.md`
- `risk-register.md`
- `decisions.json`
- `sources.json`
- `open-questions.md`
- `review-checklist.md`

Also create or update:

- `assets/README.md`
- `assets/catalog/assets.json`
- `assets/catalog/licenses.json`
- `assets/catalog/dependencies.json`

Create a validator at
`preproduction/probes/validate-cycle-01.mjs` that checks required files, JSON
shape, source/license fields, decision coverage, forbidden production paths,
and that no unreviewed candidate was placed in `assets/runtime/`.

## Evidence and quality rules

- Use current web research and primary sources. Cite direct URLs beside claims.
- Distinguish fact, inference, recommendation, hypothesis, and unresolved.
- Record versions, dates, commit hashes, and licenses. Verify links and files.
- Actively search for reasons each choice could fail and compare alternatives.
- Do not claim hardware, physics feel, ergonomics, art quality, or performance
  has been proven without a corresponding measurement.
- Do not hide open questions. Convert them into the cheapest decisive experiment
  with accept, reject, and fallback criteria.
- Keep the documents mutually consistent and implementation-ready.
- Run the existing research validators and the new cycle validator before
  finishing. Run `git diff --check` and report any unrelated files left alone.

Finish only when cycle 1 forms a coherent foundation another senior team could
critique without needing to reconstruct your reasoning from a transcript.
