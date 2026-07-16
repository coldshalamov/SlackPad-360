# 03 — Game-Feel Audit and Redesign Direction

**Date:** 2026-07-16
**Scope:** Why the build doesn't feel like a tech deck, traced to specific code, and what to change.
**Verdict in one line:** The engineering is sound; the design center is wrong. The game simulates a
74 kg skateboard-vehicle that your fingers *advise*, when a tech deck is a 30 g toy your fingers *hold*.

---

## 1. What is right (keep all of it)

- Raw HID ContactFrame pipeline over WebView2 (`HostInputSource`), high-rate samples preserved per
  sim step (`FeetSample`) so an 8 ms flick is not flattened. This is better input plumbing than most
  shipped touch games have.
- `FootTracker` contact→role binding (sticky IDs, proximity rebind, ballistic hold). Solid.
- Deterministic fixed-step sim, telemetry, replay, golden traces. This is the tuning instrument —
  underused for feel so far, but exactly what Stage 3 below needs.
- The control grammar itself: pop first, listen for flick/sweep in a post-pop window, catch, land
  cones, assists L0–L2, outcome-named tricks. This IS the Skate model and it is the right one.
- GrindSystem candidate/latch design, quantize-at-catch concept.

The feel failure is concentrated in three places: ground steering authority, the pop's authored
shape, and the camera. Not a rewrite — a re-centering.

---

## 2. Root causes, with receipts

### 2.1 Steering: heading is *slaved to the absolute angle of your fingers*, through four layers of mush

`BoardController.applyGroundControl`:

```
cmd.steerAngle = wrapPi(-seg.angle + (stance goofy ? π : 0))   // ABSOLUTE pad angle → world heading
cmd.targetYawRate = 0                                          // rate path: dead
```

`SimWorld.applyGroundForces` then runs a heading servo through a vehicle model:

```
headingError → desiredYawRate = error × steerHeadingBiasGain(1.2), clamp ±steerYawRateMax(2.6)
            → truck steer δ = atan2(rate·wheelbase, 2·speed), clamp 18°
            → executed via per-wheel side friction on a boardMass+riderMass = 74.4 kg body
            → and ONLY when horizontalSpeed ≥ rideMotionFullSpeed (0.35 m/s)
```

Four independent problems stack here:

1. **Absolute mapping caps navigation at wrist range.** World heading is pinned to the literal angle
   of the two-finger line on the pad. A comfortable wrist rotates ±30–45°, so the board can never
   head more than ~45° away from its calibrated zero without hand gymnastics. You cannot *go
   anywhere*. This alone makes the game unnavigable by construction.
2. **The servo is slow.** A 30° finger rotation requests 1.2 × 0.52 ≈ 0.63 rad/s ≈ **36°/s**. The
   board takes the better part of a second to arrive. That is the reported "board slides over to
   where my fingers sort of are, slowly."
3. **The speed gate makes response feel random.** Below 0.35 m/s, finger rotation does *nothing*
   (`commandedSteer` never engages). That is the reported "sometimes it turns, sometimes it doesn't"
   — it depends on speed the player isn't tracking.
4. **Truck-grip execution adds lag and load dependence.** Even the commanded rate is then mediated
   by simulated truck geometry, wheel side friction, and suspension load on a 74 kg body. Real and
   admirable vehicle physics — and exactly what a finger-held toy does not have. Your fingers are an
   effectively infinite-stiffness constraint on a tech deck; grip never gets a vote on heading.

**Spec drift note:** `final-input-and-trick-spec` §5 defines steering as *segment yaw rate*
("slow rotate: both plant, segment yaw rate — direction + magnitude continuous"), and config carries
the full rate vocabulary (`steerYawGain`, `steerRateAtFull`, `steerInputFullScale`, `leanCarveGain`)
— **all dead code**. BoardController never emits them. The implementation replaced the spec's rate
steering with an absolute-heading servo. The plans were closer to right than the build.

**Root of the root:** `research/physics-and-game-feel.md` §2 ruled "Kinematic control → cheatable,
agent-risk, UI only," and the codebase absorbed that as *no direct authority anywhere, ever*. The
anti-cheat rationale doesn't hold: commands already cross a validated, clamped SimWorld boundary;
a stiff, clamped yaw authority is no more cheatable than a mushy one.

### 2.2 The pop is a physics event, not a performed ollie

- Every motionTap pop has **constant strength**: `q = pop.baseQuality = 0.6`
  (`KickArbiter`, motionTap branch — "Consistent binary base-pop strength"). Tap softly or snap
  hard: identical hop. The tracker already measures `tapDurationMs` and `tapDistance` and then
  ignores them.
- The response is an impulse (half-sine over 4 substeps) plus a two-segment pitch PD
  ("hold 24° for 7 steps, level by step 30" — `ManeuverAssist` `ollieLevel`). There is no authored
  pitch *silhouette*. A real ollie reads as: tail strike (fast, ~60–80 ms), sharp nose-up rise,
  level-off at apex, slight nose-down into descent. The silhouette and its timing are what make an
  ollie legible as an ollie; a vertical impulse with a leveling controller reads as "weird hop"
  because that is literally what it is.
- No impact accent: the tail never visibly/audibly strikes. (The repo already has wood-hit SFX
  packs staged in `assets/` — unused for this.)

### 2.3 Camera: a profile shot you can't navigate from

`camera.chaseSide = -1.25` vs `chaseDistance = 1.2` — the camera sits *beside* the board as much as
behind it, i.e. the perpendicular framing the LMB/RMB era forced, kept after the constraint died.
Heading also freezes below 0.08 m/s and position holds inside a 0.25 m deadband, so at low speed the
view goes inert. `research/physics-and-game-feel.md` §8 already said it: "Camera lag creates
perceived input lag — keep follow tight on ground." Config values contradict the research.

### 2.4 The feet

Any attempt to physically simulate feet/shoes on the deck (the loafer convulsions) inverts the
metaphor. The fingers ARE the feet. Shoes are presentation: pose them from `FeetState` + FSM phase,
never from simulation, and never let them exert or imply force.

---

## 3. The design law (the trick)

> **Fingers planted = direct authority. Fingers off = physics. Heading is not travel.**

Expanded:

1. **While both fingers are planted and the board is grounded, the board's yaw is your fingers',
   1:1 and now.** Relative, not absolute: yaw follows the *change* in segment angle since plant
   (ratchet steering — lift, re-plant, keep turning; same as steering a tech deck with re-grips).
   Target tracking constant 30–50 ms, i.e. the board is never more than a few degrees behind your
   fingers at comfortable rotation speeds. Implement as a stiff clamped yaw servo at the SimWorld
   boundary (gains ~20×, cap ~12 rad/s) or as bounded kinematic yaw-rate authority — either is
   fine; the boundary validation is the anti-cheat, not the mush.
2. **Heading ≠ travel (the grip model).** Keep linear momentum physical. Each grounded step, rotate
   the velocity vector toward board-forward by a grip factor (time constant ~100–200 ms), leaving
   lateral slip as remainder. Fast rotation at speed = powerslide for free; slow rotation = carve.
   This is the one-line model that makes direct-drive steering feel *earned* instead of cheap: you
   turn the board instantly, the world's momentum negotiates.
3. **Standstill pivot works.** No speed gate on yaw authority. Rotating fingers while stopped pivots
   the deck in place — the first thing anyone does with a tech deck, and currently a dead zone.
4. **Tricks = recognized intent → authored orientation curve, tracked by strong PDs, on a physical
   root.** Physics owns the center-of-mass trajectory (impulse, gravity, collision, landing).
   Authored curves own *orientation* during the maneuver (pop pitch silhouette; flip/shuv omega
   envelopes already exist and fit this frame). This is Skate's actual architecture — gesture wide
   thresholds → performance with parameters — and it is what the hybrid row of the research table
   meant. The current code is 80% there for flips and 20% there for the base pop, and the base pop
   is what every trick is built on.
5. **Rider mass is a trajectory parameter, not a control obstacle.** Whether `riderMass` stays 72
   is a tuning question for pop height/momentum feel — but control authority (yaw, trick torques)
   must be scaled so the *player never feels the mass in the steering*. If a gain fight persists,
   drop rider mass toward toy scale and retune impulses; "Tech Deck toy vs full skate scale" was
   flagged unresolved in research §11. Decide it: **toy**.

---

## 4. Staged plan

### Stage 0 — Make feel measurable (do this before touching feel)

**Why first:** repeated agent runs have shipped basic control-direction bugs while the test suite
stayed green, and agents fell back to browser testing that cannot even receive granular trackpad
input (browsers never expose raw multi-contact pad data; the native WebView2 host is the only real
input path). The root problem: the suite verifies *correctness* (phases, contracts, determinism,
replay identity) and verifies **zero feel claims**. Agents cannot feel; numbers are how they see.
The machinery to fix this already exists — `AgentHarness` (inject ContactFrames, observe, no cheat
surface), `PadDriver` (scripted synthetic frames through the REAL pipeline), deterministic replay,
`ControlDiagnostics` (requested vs actual heading, pop polarity), `exportControlTrace` on the host —
it has just never been pointed at playability.

Four builds, roughly in order:

**0.1 Perceptual contract suite** — pin every sign and direction in the control vocabulary as tiny
PadDriver tests with pose assertions: clockwise finger rotation → clockwise board yaw (top-down);
tail tap → tail end dips / nose rises (nollie mirrored); flick direction → flip direction; sweep
direction → shuv direction; goofy mirrors all of it; camera azimuth within 15° of heading while
grounded. This is the permanent net for the "board turns the wrong way / hops the wrong end" class
of agent regression. ~15 small tests; `ControlDiagnostics.popPolarityOk` shows the pattern.

**0.2 Feel report runner** — one command (`pnpm feel:report`): run the canonical scripted scenarios
headlessly through AgentHarness, emit JSON + SVG plots + a markdown table, exit nonzero on gate
failure. Core metrics:

| Metric | Definition | Gate (post-Stage-1) |
| --- | --- | --- |
| `steer.lagMs` | offset of peak cross-correlation, finger-segment angle vs board yaw, scripted 45° ratchet @200°/s | < 50 |
| `steer.trackErrDeg` | max \|commanded − actual\| during same script | < 5 |
| `steer.pivotDeg` | yaw achieved by 1 s standstill finger rotation | ≥ 80 |
| `pop.latencyMs` | replant sample tPerfMs → first airborne step | ≤ 80 |
| `pop.silhouetteRmsDeg` | pitch(t) vs authored curve over the maneuver | < 4 |
| `land.cleanRate` | clean landings over N seeded standard-ollie runs | tracked |
| `nav.*` | task-battery success (see 0.4) | tracked |

The SVG plots (finger angle vs board yaw overlay; ollie pitch vs authored curve) are the human
review channel: a regression is visible in ten seconds without launching the game.

**0.3 Hardware trace corpus** — the answer to "the browser didn't take the granular inputs." Add a
record hotkey in the native host session (the `exportControlTrace` plumbing already exists), a
`testdata/traces/` corpus with a labeling convention (`turn-left-slow`, `hard-ollie`,
`kickflip-attempt-1` …), and a test-helper loader that replays corpus traces through the harness.
One recorded 15-minute human session becomes the permanent, full-granularity, deterministic input
agents test against forever. Recognizer changes get judged against real human gestures, not just
synthetic ones — the modern version of the Skate studio's record-real-input-and-iterate loop.

**0.4 Playability probes** — task-level bot scripts on PadDriver: ride straight 20 m; slalom 5
gates; standstill 90° pivot; pop over a gap; 10/10 ollies; land a kickflip at wide thresholds.
Success rates + times go in the feel report. This layer catches what unit tests structurally
cannot — e.g. the current absolute-angle steering caps heading at wrist range, which fails
"slalom" instantly while every existing test passes.

**Gate for Stage 0 itself:** the feel report runs headless in CI, and re-running it twice on the
same build produces identical numbers (determinism already guarantees this — assert it).

### Stage 1 — Feel floor (steering + camera). Everything after is judged through the Stage 0 report.

- BoardController: emit **relative** segment-angle steering (delta since plant, wrapPi-accumulated),
  as a yaw-rate/heading-delta command. Delete the absolute `-seg.angle` mapping. Wire the spec's
  rate vocabulary (`steerYawGain` path) or a new `steerDirectGain` (~1.0–1.2 board° per finger°).
- SimWorld: stiff yaw tracking (raise authority ~10×; execute yaw as direct clamped torque about
  deck-up, not through truck δ). Keep truck lean steering as a *flavor* layer on top, not the
  authority path. Remove `rideMotionFullSpeed` gating on yaw.
- Add the grip model: grounded velocity redirect toward board-forward, `gripRate` config
  (hypothesis 8/s), lateral slip preserved above a slip threshold.
- Camera: `chaseSide` → ±0.35, `chaseDistance` → ~2.0–2.4, `positionSmoothTime` → ~0.12 on ground,
  drop the rest deadband to ~0.05 m, keep heading live at all speeds (rate-limit instead of freeze).
- **Gate (telemetry-measurable):** finger→board yaw lag < 50 ms and peak tracking error < 5° during
  a scripted 45° finger rotation at 200°/s; standstill 90° ratchet turn achievable in < 1.5 s;
  camera never more than 15° off heading while grounded.

### Stage 2 — The ollie is a performance

- Pop strength: **fixed first.** One reliable, great-feeling ollie (keep constant q; tune jY + the
  silhouette below until it sings). The current build's fixed strength is not why it feels bad.
  Tap-intensity → height is an EXPERIMENT behind an empirical gate, not a plan item: a trackpad tap
  has no spring travel and no proprioceptive feedback (unlike Skate's thumbstick flick), so first
  prove the channel is controllable — instruct a player to alternate soft/hard on command and check
  whether the `tapDurationMs` / replant-speed distributions separate in telemetry. Overlapping
  distributions = not a control; drop it. (`ContactFrame.pressure` exists on the wire, optional and
  currently unconsumed — if the native host can populate it from HID contact geometry, run it
  through the same gate before it ever drives gameplay.) Board speed already buys longer airs
  naturally through trajectory; no artificial speed→height scaling.
- Authored pitch curve: keyframed silhouette (strike 0→+24..30° in ~4–5 steps, hold, level by apex,
  −4° into descent), scaled by q, tracked by the existing PD machinery (`ollieLevel` generalizes to
  `pitchCurve`). Nollie mirrors.
- Impact accents: tail-strike SFX (assets already vendored) + 1-frame camera nudge + board shadow.
  Cheap, disproportionate feel gains.
- Latency budget: replant→first visible pitch motion ≤ 3 steps (50 ms). Audit the arbiter path for
  any lookahead in the motionTap branch (there should be none; keep it that way).
- **Gate:** the base ollie reads as an ollie (silhouette self-report: tail strike → rise → level →
  land, unambiguous); pop-to-liftoff ≤ 80 ms in telemetry. Intensity ships only if its
  controllability gate above passes.

### Stage 3 — Tune with the instrument

- Live tuning HUD (sliders over `SimConfig` locomotion/pop fields, hot-applied; DebugHud exists,
  FlickItLab exists — extend, don't rebuild).
- Grow the trace corpus with each human playtest; promote representative traces to golden.
- Only after Stage 1–2 land: revisit flips/shuvs thresholds, grind feel, then graphics.

---

## 5. Guardrails for future agent runs (paste into prompts)

1. Fingers planted = direct authority over yaw; do not reintroduce heading servos, speed gates, or
   grip-mediated steering on the authority path.
2. Steering input is RELATIVE (delta since plant), never the absolute pad angle.
3. Shoes/feet are presentation driven by FeetState; they are never simulated and never collide.
4. Do not "fix" mushiness by adding assists, clamps, or smoothing. Mush = authority problem.
5. Physics owns trajectory; authored curves own maneuver orientation; PDs track curves. No pose
   teleports (unchanged), but stiffness is not cheating.
6. The camera reads heading and stays behind it; it never frames from the side by default.
7. Every feel change ships with its telemetry gate number, measured before/after.
8. Input realism and output realism are different axes — never trade them together. Input stays
   ABSTRACT and forgiving (few dimensions, wide thresholds, low latency); output stays PHYSICAL and
   truthful (real momentum, real trajectory, readable consequence). Realistic output makes the game
   easier (the player can predict it); realistic input makes it harder (the player must produce it).
   Granular input data (rate, pressure, contact geometry) is spent on recognition reliability and
   latency, never on new control dimensions the player must master.
9. Agents never assess gameplay through a browser, screenshots, or mouse-emulated input. The
   testing surface is `AgentHarness` + the feel report + the trace corpus, headless. A gameplay
   claim that is not expressed as a contract test, a feel-report metric, or a corpus replay is
   unverified — say so instead of asserting it.
