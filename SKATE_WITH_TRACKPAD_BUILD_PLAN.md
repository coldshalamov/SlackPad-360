# Skate With Trackpad Controls — Gameplay Build Plan

## Goal

Ship one convincing vertical slice of a mainstream skateboarding game whose
controller happens to be a Precision Touchpad.

The target is assisted simcade play:

```text
clear player gesture
  -> one named gameplay action
  -> authored, readable motion
  -> physics trajectory and collision
  -> forgiving catch, grind, or bail result
```

The target is not physical foot simulation, a Tech Deck biomechanics model, or
maximum rigid-body purity. A player should learn the controls in minutes and
reliably perform recognizable lines.

## Locked product decisions

- Keep the native Windows Precision Touchpad input path.
- Keep Three.js, Rapier, the fixed gameplay step, the current board/contact
  foundation, and the current park. Do not change engines.
- Keep the board plus two disembodied shoes for the first vertical slice. Do not
  add a humanoid skater or skeletal-animation pipeline yet.
- Keep Ctrl as push/acceleration for the first slice. A trackpad-only push input
  is a separate product decision, not part of trick/grind work.
- Ship six air actions first: ollie, nollie, kickflip, heelflip, frontside shuv,
  and backside shuv.
- Ship two grind families first: 50-50 and boardslide.
- One pop and at most one trick gesture per airtime. Defer multi-gesture trick
  combinations until the six core actions feel good.
- Allow deliberate game assists: orientation targets, angular-velocity stops,
  small velocity correction, grind snapping, automatic catches, and landing
  correction. These are gameplay mechanics, not physics failures.
- Use native play as the acceptance path. Browser/synthetic tests remain useful
  diagnostics but cannot certify feel.

## Current state

The repository already contains most of the technical foundation:

- Native high-rate contact acquisition and replayable `ContactFrame` input.
- A fixed-step Rapier world with CCD, a loaded board/rider mass proxy, four-wheel
  contact, truck steering, banks, and transition assistance.
- Motion-tap pop detection, four air-gesture labels, catch/landing/bail phases,
  50-50/boardslide grind detection, grind balance state, telemetry, and tests.
- A staged hero board, staged shoes, a playable plaza, CC0 materials, CC0 proxy
  audio, a GLB asset pipeline, and Flick-It Lab observability.

The missing product layer is not another physics engine. It is:

1. A narrow, explicitly assisted trick-motion controller.
2. Intentional shoe animation synchronized to those actions.
3. A genre-standard grind path/snap/balance loop.
4. Native hardware tuning with player-visible acceptance criteria.
5. Audio and camera feedback that sell pop, catch, land, grind, and bail.

Several existing rules actively work against that outcome:

- `packages/game/test/physical-maneuver-contract.test.ts` forbids direct linear
  or angular velocity correction during tricks.
- `ManeuverAssist` and `SimWorld` prioritize physically applied open-loop
  impulses even when a short authored target would be clearer and more reliable.
- `ShoeAnimator.#updateAttached` pins both shoes to their sockets in every
  attached phase, so pop, flick, catch, and landing have no readable foot motion.
- `TrickRegistry` and `TrickIntentResolver` prepare for multi-action sequences,
  while shipping gameplay deliberately accepts only the first air action.
- The grind implementation avoids decisive snapping and uses a small debug-like
  horizontal meter instead of the expected top-center balance presentation.

The build should remove or bypass those constraints instead of adding more
systems around them.

## Chosen gameplay architecture

### Ground

Rapier remains authoritative for board position, surface contact, speed,
collisions, slopes, banks, and transition launches. Ground steering receives
strong upright assistance so ordinary carving cannot overturn the board.

### Air tricks

A new `TrickActionController` owns a normalized action clock and an authored
orientation target. Rapier still owns gravity, world movement, and collisions;
the action controller supplies bounded servo/correction commands.

Each `TrickMotionProfile` contains only:

```ts
interface TrickMotionProfile {
  id: 'ollie' | 'nollie' | 'kickflip' | 'heelflip' | 'fs-shuv' | 'bs-shuv';
  durationSeconds: number;
  catchAt: number;                 // normalized action time
  boardPitch: MotionCurve;
  boardRollTurns: MotionCurve;
  boardYawTurns: MotionCurve;
  shoeMotion: 'ollie' | 'flip' | 'shuv';
  mirror: -1 | 1;
}
```

There are only three shoe-motion motifs: ollie, flip, and shuv. Nollie and
directional variants mirror those motifs. That produces six readable actions
without six bespoke animation systems.

The board's action curve is a target, not a second render transform. The
controller drives the Rapier body toward it so rendering, collision, telemetry,
and landing all observe one board pose.

### Air positioning

After the trick swipe is recognized:

- Rotating the two-finger line requests bounded yaw toward a landing heading.
- Moving the two-finger midpoint sideways requests a small lateral velocity
  correction.
- Total correction is capped so it helps line up a rail or landing without
  becoming free flight.
- Air positioning is suppressed while a one-finger trick swipe is being read.

No individual finger is mapped to a physical foot in the air.

### Catch and landing

- Pop begins immediately; it never waits for trick classification.
- The trick completes its visible rotation before the final descent.
- When the action reaches its catch phase, the game automatically catches a
  reasonably aligned board and damps residual spin.
- A nearly correct landing is corrected over a short blend and succeeds.
- A visibly bad orientation, inverted board, large heading error, or hard impact
  bails.
- Direct velocity/orientation correction is allowed only inside named assist
  states and is recorded in telemetry.

### Grinds

Grindability is authored data, not guessed from arbitrary collision geometry.
Every rail/ledge exposes a hidden grind path. This is the reliable shortcut:
commercial skate games author grindable paths rather than expecting a generic
physics engine to understand every edge.

- Level-data pieces generate a path automatically from their dimensions.
- Imported GLBs may contain named `GRIND_*` line nodes.
- The path supports slope and later supports polylines/curves; the first slice
  needs straight flat and sloped segments.
- Descending contact inside the entry volume commits the grind.
- The game blends board pose onto the path over roughly 80–120 ms, projects
  velocity along the path, and then owns one-dimensional path motion.
- Parallel entry selects 50-50; approximately perpendicular entry selects
  boardslide. The assist widens these entry cones but does not choose a family
  unrelated to the visible board angle.
- Balance is a single state variable driven by slow deterministic drift, entry
  error, board lean, and one lateral trackpad correction.
- The board's displayed lean follows balance. A top-center curved meter shows a
  white needle, gray safe region, and red edge danger.
- Tap while grinding pops out. Rail end carries tangent velocity into a clean
  dismount. Reaching the balance edge produces a visible slip/bail.

## Asset and shortcut decisions

| Need | Decision for first slice | Why |
| --- | --- | --- |
| Board | Reuse staged `hero-board` GLB | Already higher quality and integrated with physics/wheels/sockets. |
| Shoes | Reuse staged `shoes` GLB | Only rigid transforms are required; no skeleton or Blender clips needed. |
| Park | Reuse playable park and authored plaza modules | Already supplies banks, ledges, rails, stairs, and return lines. |
| Trick animation | Store short motion curves in TypeScript/JSON | Three rigid objects are cheaper and safer to animate directly than retargeting a humanoid. |
| Audio | Promote a small subset of already acquired CC0 clips | Pop/catch/land/grind audio provides a large feel gain with little code. |
| Reference code | Study MIT `Godot_Skate` and `threejskate` for rail paths and animation-state organization only | Their arcade proxies are useful patterns, not replacement physics. |
| Character clips | Keep Kenney Mini Skate CC0 as an optional later full-skater path | It has ride/crouch/air/fall clips but not a complete high-quality trick set. |
| Exact external tricks | Use CC-BY kickflip/ollie assets only as timing or pose references after attribution review | Rig mismatch and visual quality make direct import uncertain. |
| Accelerometer classifier | Do not integrate | It supplies class signatures, not board orientation, shoe pose, or skeletal animation. |
| Mixamo or video mocap | Defer until a full humanoid is approved | Retargeting, cleanup, and redistribution rules create work that the current board-plus-shoes presentation does not need. |

Vetted reference sources:

- [Kenney Mini Skate](https://kenney.nl/assets/mini-skate) — CC0 models and
  general skate/air/fall character clips.
- [Quaternius Universal Animation Library](https://quaternius.com/packs/universalanimationlibrary.html)
  — CC0 generic humanoid clips, useful only if a full rider is added later.
- [Serjogasan Kickflip](https://sketchfab.com/3d-models/kickflip-b337b005a7a9458da71764bca243a3c8)
  — downloadable CC BY reference/retarget candidate.
- [Godot_Skate](https://github.com/3deric/Godot_Skate) — MIT code; study its
  explicitly authored rail curves and animation-state separation, not its
  character assets.
- [threejskate](https://github.com/lalomorales22/threejskate) — MIT Three.js game
  using Kenney CC0 assets; useful for AnimationMixer and rail-metadata examples,
  not as a physics baseline.

## Milestones

### M0 — Supersede the hyper-realism contract

Deliverables:

- Add a short normative gameplay contract based on this plan.
- Rewrite README control language around action intent rather than physical foot
  replication.
- Replace `physical-maneuver-contract.test.ts` with an assist-boundary test:
  corrections are legal only during trick catch, landing, grind, or recovery.
- Collapse the first-slice trick mapping to `base pop + zero/one air gesture`.
  Do not expand multi-gesture registry scaffolding.
- Save a native baseline trace and short video of the current central park line.

Gate:

- No remaining test or document may require open-loop physics merely because it
  is more physically pure.

### M1 — Ground feel gate

Owning files:

- `packages/shared/src/config.ts`
- `packages/game/src/control/BoardController.ts`
- `packages/game/src/sim/SkateboardContactSolver.ts`
- `packages/game/src/sim/SimWorld.ts`
- `packages/game/test/professional-skate-physics.test.ts`
- Flick-It Lab trace analyzer, added under `scripts/` or `research/probes/`

Initial target bands:

- Push response begins immediately but reaches cruise progressively, not as a
  one-frame speed jump.
- Continuous push reaches approximately 4.5–6 m/s in 2–3 seconds.
- Releasing push preserves at least 65% of cruise speed after three seconds and
  takes roughly 7–12 seconds to coast near rest on flat ground.
- A 90-degree heading request at cruise takes roughly 0.8–1.4 seconds.
- Grounded deck-up remains above 0.8 during aggressive normal steering.
- No stationary or ordinary carve input can flip the board.
- Bank entry preserves speed and produces a readable launch instead of sticking
  or being ejected by a contact glitch.

Process:

1. Run the packaged native build on `flat-dev` and the central park route.
2. Record speed, acceleration, yaw rate, deck-up, wheel load, and contact loss.
3. Tune existing config first.
4. Modify solver/controller code only where the trace proves a structural issue.
5. Freeze the accepted ground profile before changing tricks.

Gate:

- Five consecutive loops through flat ground, a full carve, a bank, and recovery
  without unexplained flip, snap acceleration, or contact loss.

### M2 — Reliable action input

Owning files:

- `packages/game/src/input/FootTracker.ts`
- `packages/game/src/control/KickArbiter.ts`
- `packages/game/src/control/AirGestureClassifier.ts`
- `packages/game/src/control/GestureFSM.ts`
- `packages/game/src/control/TrickRegistry.ts`
- `packages/game/src/control/TrickIntentResolver.ts`
- `packages/game/src/ui/FlickItLab.ts`

Rules:

- A local tail tap triggers ollie; a local nose tap triggers nollie.
- A tap is treated as a binary action edge. Tap speed does not scale pop height.
- The next clear swipe inside a short post-pop window selects one of four tricks.
- Weak or ambiguous motion remains the base ollie/nollie.
- Flick sensitivity changes recognition thresholds, not trick physics.
- Classification consumes one gesture and closes; there is no sequence grammar
  in the first slice.

Native validation set:

- 20 intended attempts for each of six actions.
- 50 seconds of ordinary resting, turning, and pushing for false-trigger checks.
- Target: at least 19/20 pops, at least 18/20 correct trick labels, no more than
  one false trick in the neutral run, and immediate visual pop response.

Gate:

- Recognition misses are visible in an expected-versus-recognized confusion
  table. No tuning change is accepted without improving that table or latency.

### M3 — Assisted air-trick controller

New narrow modules:

- `packages/game/src/control/TrickActionController.ts`
- `packages/game/src/control/TrickMotionProfiles.ts`

Modified seams:

- `packages/game/src/control/ManeuverCommand.ts`
- `packages/game/src/control/ManeuverAssist.ts`
- `packages/game/src/sim/SimWorld.ts`
- `packages/game/src/render/ShoeAnimator.ts`
- `packages/game/src/agent/AgentHarness.ts`
- `packages/shared/src/controlTrace.ts`

Order:

1. Implement ollie only: pitch-up, level, automatic catch, clean/dirty/bail.
2. Add kickflip as the proving case for one full roll.
3. Mirror kickflip to heelflip.
4. Add the shared shuv curve and mirror it frontside/backside.
5. Mirror the pop motif for nollie.
6. Add bounded air yaw and lateral line correction after gesture recognition.
7. Make `ShoeAnimator` use the three shared shoe motifs rather than raw finger
   positions.

Initial timing bands:

- Ordinary airtime: approximately 0.65–0.9 seconds.
- Pop pitch reaches its visual maximum early, then levels before descent.
- Flip/shuv rotation completes by about 65–75% of airtime.
- Catch settles residual rotation over roughly 80–150 ms.
- A clearly recognizable but imperfect landing receives correction; an inverted
  or grossly sideways landing bails.

Gate:

- Each action is recognizable in a muted screen recording without HUD labels.
- Ten consecutive correctly recognized base ollies can land without random bail.
- A deliberately incomplete/late trick can still fail visibly.
- No trick requires a finger to trace the board's physical rotation.

### M4 — Genre-standard grind loop

Owning files:

- `packages/game/src/sim/rails.ts`
- `packages/game/src/sim/levels/types.ts`
- `packages/game/src/sim/levels/playable-park.ts`
- `packages/game/src/control/GrindSystem.ts`
- `packages/game/src/sim/grindForces.ts`
- `packages/game/src/control/GestureFSM.ts`
- `packages/game/src/render/DebugHud.ts` or a new player-facing `GrindBalanceHud.ts`
- `packages/asset-pipeline/src/validate.mjs`

Order:

1. Extend grind descriptors from horizontal segments to finite 3D path frames.
2. Add maximum capture distance and rail-end/lost-path exits.
3. Replace indefinite soft-force capture with a short explicit entry blend.
4. Project motion along the path while grinding; preserve tangent speed on exit.
5. Make 50-50 and boardslide selection depend on visible board yaw.
6. Wire one lateral trackpad correction to balance.
7. Drive board visual lean from the same balance value.
8. Replace the small horizontal debug bar with the top-center arc/needle/red-edge
   widget.
9. Tap-to-pop from grind reuses the normal pop action and opens air positioning.
10. Generate/validate `GRIND_*` paths for every marked rail or ledge.

Gate route:

```text
push -> ollie -> 50-50 -> balance -> pop out -> align -> clean land
push -> shuv/air yaw -> boardslide -> balance -> pop out -> clean land
```

Both lines must work five times consecutively in the native build. Neutral input
must not cause an immediate balance loss; holding a deliberately bad correction
must visibly drive the needle to the edge and fail.

### M5 — Transition and line continuity

Owning files:

- `packages/game/src/sim/TransitionAssist.ts`
- `packages/game/src/sim/SkateboardContactSolver.ts`
- `packages/game/src/render/CameraRig.ts`
- one deterministic bank/quarter-pipe test level or route

Deliverables:

- Preserve approach momentum into a bank or quarter-pipe.
- Launch from the lip without requiring a special trick gesture.
- Permit one air trick and bounded alignment.
- Reacquire the landing surface and continue riding if the board is reasonably
  aligned.
- Camera pulls back enough to show the whole arc and board rotation.

Gate:

- Three consecutive transition launches, tricks, and continued ride-outs without
  unexplained speed injection, wall-like collision, or camera loss.

### M6 — Feedback and compact game loop

Owning files:

- new `packages/game/src/audio/GameAudio.ts`
- `packages/game/src/main.ts`
- `packages/game/src/render/CameraRig.ts`
- `packages/game/src/render/DebugHud.ts`
- existing `assets/generated/audio/event-map.json`

Deliverables:

- Rolling loop varies gently with speed.
- Distinct push, pop, catch, clean land, dirty land, grind, and bail sounds.
- Camera modes emphasize ground line, air readability, and rail direction.
- Last trick name and landed-line score are player-facing; engineering metrics
  remain debug-only.
- A landed-line accumulator resets on bail. No large progression system yet.

Gate:

- With debug HUD disabled, every pop, catch, grind latch, grind danger, clean
  land, and bail remains understandable from motion, camera, audio, and the
  compact player HUD.

### M7 — Native acceptance and freeze

Test matrix:

- Two supported Precision Touchpads if available; otherwise one device plus the
  recorded trace corpus replayed at different sample rates.
- Default and one sensitivity-adjusted profile.
- 60 Hz and bursty/high-rate input delivery.
- Flat, bank/transition, thin rail, and ledge.
- Clean land, dirty land, deliberate bail, rail end, and grind pop-out.

Required evidence:

- A five-minute uncut native play video.
- Labeled attempt table for all six actions.
- Two successful grind lines.
- Ground-feel trace with speed/yaw/contact graphs.
- Screenshots of air readability and the balance widget.
- Full TypeScript tests, typecheck, production build, native host tests, and
  packaged Windows build.

Definition of done:

- A new player can understand push, steer, tap-pop, swipe-trick, catch/land,
  grind, balance, and pop-out from a short control guide.
- Intended actions are dependable, but bad lines and clearly bad landings can
  still fail.
- The board has weight, acceleration is progressive, grounded turning is stable,
  air tricks read clearly, and grind capture feels deliberate rather than
  accidental.
- No implementation depends on foot biomechanics, an accelerometer classifier,
  a full humanoid animation set, or a new physics engine.

## Pitfall register

| Pitfall | Preventive rule |
| --- | --- |
| Passing deterministic tests but still feeling bad | Every milestone ends with packaged native play and visible metrics. |
| Reintroducing finger-as-foot simulation | Gameplay reads tap, swipe, pair angle, and midpoint only as action intent. Shoes never follow raw HID positions. |
| Physics purity making tricks unreliable | Action states may apply bounded pose/velocity correction and must log it. |
| Animation and physics fighting each other | Board pose has one authority: Rapier plus the action controller. Renderer never adds a second trick rotation. |
| Asset search becoming the project | Existing board/shoes/park ship first. External exact-trick assets get a one-day evaluation cap and must beat the procedural profile visibly. |
| Humanoid retargeting scope explosion | No full rider until the board-plus-shoes slice passes. |
| Generic edge detection producing random grinds | Grindable paths are authored/generated and validated. Ordinary edges are not grindable by accident. |
| Invisible grind magnetism | Entry blend, candidate feedback, latch sound, and the balance widget expose what the game is doing. |
| Trackpad variation | Normalize through the existing profile, retain sensitivity, and validate with labeled traces rather than device-specific constants. |
| Pop latency caused by waiting for a trick | Pop fires on tap; trick classification happens after takeoff. |
| Overlarge configuration surface | The first slice exposes only assist preset and flick sensitivity. Internal tuning values stay in one profile. |
| Multi-trick scope creep | Exactly one post-pop action until the six-action confusion and landing gates pass. |
| Dirty-tree/golden churn hiding regressions | Update only goldens whose semantic behavior intentionally changed; keep prior native fixes and unrelated work intact. |
| Camera hiding the trick | Air and grind framing are explicit acceptance shots, not aesthetic cleanup at the end. |
| Licensing ambiguity | Every imported asset retains source URL, exact license, author, hash, and modification notes before runtime promotion. |

## Explicitly deferred

- Tre flips, laser flips, grabs, manuals, reverts, wall rides, lip tricks, and
  multi-gesture combos.
- A full humanoid rider and skeletal retargeting.
- Procedural foot IK or body biomechanics.
- Runtime ML trick classification.
- Accelerometer-driven animation.
- Generic grind detection on every geometric edge.
- Multiplayer, progression, customization, and a large content expansion.
- Replacing Rapier, Three.js, or the native touchpad host.

Those features become candidates only after the vertical slice passes its native
acceptance gates.
