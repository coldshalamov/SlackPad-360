/**
 * All empirical/hypothesis constants live here, per the final specs:
 * "Empirical constants parameterized in config, not magic undocumented
 * literals". Defaults are the cycle-3 hypothesis values; G2 tuning owns
 * their final values. Auto-adaptation may move the marked fields by at most
 * ±20% of these defaults.
 */

export type Stance = 'regular' | 'goofy';
export type AssistLevel = 0 | 1 | 2;
export type BothClickMeans = 'push' | 'ollie';

export interface InputProfile {
  stance: Stance;
  /** Degrees; hand approach angle mapping pad axes → board local. */
  padYawOffset: number;
  swapFeet: boolean;
  assistLevel: AssistLevel;
  bothClickMeans: BothClickMeans;
  /** Treat OS tap-to-click primary edges as kicks. */
  tapToClickIsKick: boolean;
  accessibility: {
    reducedMotion: boolean;
    highContrastHud: boolean;
  };
}

export const DEFAULT_INPUT_PROFILE: InputProfile = deepFreezeConfig({
  stance: 'regular',
  padYawOffset: 0,
  swapFeet: false,
  assistLevel: 1,
  bothClickMeans: 'push',
  tapToClickIsKick: true,
  accessibility: {
    reducedMotion: false,
    highContrastHud: false,
  },
} as InputProfile);

export interface RecognitionConfig {
  /** Confidence to open a label (hypothesis 0.55). */
  cEnter: number;
  /** Confidence to keep a label open — hysteresis (hypothesis 0.40). */
  cExit: number;
  /** Same-family replacement margin (hypothesis 0.15). */
  replaceMargin: number;
  /** Click-centered classification window, ms (hypothesis 40–80). */
  popLookbackMs: number;
  popLookaheadMs: number;
  /** Air trick window after pop for flick/sweep classification, ms. */
  airTrickWindowMs: number;
  /** Minimum free-foot speed (pad units/s) to read a flick. ±20% auto ok. */
  flickSpeedMin: number;
  /** Below this contact speed a planted foot counts as holding. */
  plantSpeedEps: number;
  /** Sweep minimum integrated yaw (radians) to classify a shuv. */
  sweepMinAngleRad: number;
  /** Nose-lift prep velocity threshold distinguishing ollie prep from noise. */
  prepLiftSpeedMin: number;
  // --- M5 shuv naming/target (hypothesis) --------------------------------
  /** Shuv rotation target, degrees (180 first ship; 360 deferred). */
  shuvTargetDeg: number;
  /**
   * Minimum |completed yaw| (degrees) for the OUTCOME namer to call a shuv
   * 'fs-shuv'/'bs-shuv' rather than fall back to the base pop label. Set safely
   * above any incidental yaw a plain ollie accrues.
   */
  shuvNameMinDeg: number;
}

export interface FootTrackerConfig {
  /** Soft recenter hold time while both planted and still, ms (250–400). */
  recenterHoldMs: number;
  /** Dual-lift ballistic prediction window before clearing feet, ms (150–250). */
  ballisticPredictMs: number;
  /** After dual lift, rebind window before IDs are considered fresh, ms (400–600). */
  dualLiftClearMs: number;
  /** Max reassignments/min while held before tracker degrades gracefully. */
  idThrashWarnPerMin: number;
  // --- M3 additions -----------------------------------------------------
  /**
   * EMA smoothing factor (0..1) for foot velocity, segment angular velocity and
   * midpoint velocity finite differences. Higher = snappier / noisier, lower =
   * smoother / laggier. New sample weight per update.
   */
  velEmaAlpha: number;
  /**
   * Spatial rebind radius in CALIBRATED pad units. On re-plant after a lift a
   * contact rebinds to a remembered role only if within this distance of that
   * role's last position; otherwise it is a fresh assignment.
   */
  rebindRadius: number;
  /**
   * Soft-recenter drift rate, 1/s. Once both feet have been planted and nearly
   * still for `recenterHoldMs`, the rest pose eases toward the current pose at
   * this rate (per second), never in a sudden jump. `restNew = rest + (cur -
   * rest) * clamp(recenterRateHz * dt, 0, 1)`.
   */
  recenterRateHz: number;
}

export interface PopConfig {
  /**
   * Vertical pop impulse range, N·s at board mass scale (M4, hypothesis —
   * retuned from the cycle-3 placeholders so pop heights land in the playable
   * 0.25–0.8 m band at boardMass 2.4: v0 = jY/m, h ≈ v0²/2g).
   * jY = jMin + q·(jMax − jMin) where q ∈ [0,1] is pop prep quality.
   */
  jMin: number;
  jMax: number;
  /** Pitch bias factor applied to the pop pitch torque impulse (spec §3.2). */
  pitchBias: number;
  /**
   * Pitch torque impulse per N·s of vertical pop (M4, hypothesis): the pop's
   * torque impulse about the board-right axis is
   * `pitchBias · pitchTorqueScale · jY` (nose-up for ollie, mirrored for
   * nollie). Tuned so an UNCAUGHT max-q ollie lands DIRTY (~30° cone) while a
   * caught one lands CLEAN — catching matters, per the M4 feel goals.
   */
  pitchTorqueScale: number;
  /** Hard clamp on the pop pitch torque impulse magnitude, N·m·s (SimWorld). */
  pitchTorqueImpulseMax: number;
  /**
   * Prep-lift pad speed (calibrated units/s) at which the crispness component
   * of pop quality saturates to 1 (M4, hypothesis). Lifts slower than
   * `recognition.prepLiftSpeedMin` contribute zero crispness.
   */
  prepLiftSpeedForMaxQ: number;
  /** Pop quality weights (sum ≤ 1): q = qTimingWeight·timing + qCrispWeight·crisp. */
  qTimingWeight: number;
  qCrispWeight: number;
  /**
   * Steps after the pop impulse within which the board must actually leave
   * the ground; otherwise the pop "fizzles" (board blocked) and the FSM
   * returns to ground with the label cancelled (M4, hypothesis — failure is
   * never silent/undefined per final-input-and-trick-spec §7).
   */
  groundLeaveTimeoutSteps: number;
}

export interface FlipConfig {
  /** Max flip angular speed, rad/s (hypothesis 12–18). */
  omegaFlipMax: number;
  /** PD gains for flip torque tracking. */
  kp: number;
  kd: number;
  /** Torque clamp per assist level, N·m. */
  tauMax: [number, number, number];
  // --- M5 flick/sweep classification + envelopes (hypothesis) -----------
  /**
   * Axis-dominance ratio for the shuv-vs-flip conflict (final-input-and-trick
   * §3.1): the free foot's lateral (across-board) speed must exceed its
   * longitudinal (along-board) speed by this factor for a LATERAL-dominant
   * flick → flip; otherwise arc/yaw evidence is allowed to win → shuv.
   */
  axisDominanceRatio: number;
  /**
   * Minimum integrated lateral pad displacement (calibrated units) over the
   * flick path to confirm a flick (rejects a single noisy fast frame). ~one
   * board-half of pad travel.
   */
  flickPathMinLen: number;
  /**
   * Lateral pad speed (calibrated units/s) at which the flick intensity s
   * saturates to 1. s = clamp((peakLatSpeed − flickSpeedMin)/(flickSpeedForMaxS
   * − flickSpeedMin), 0, 1); omegaTarget = s·sign·omegaFlipMax.
   */
  flickSpeedForMaxS: number;
  /** Target yaw rate magnitude for a shuv envelope, rad/s (about board up). */
  shuvOmegaMax: number;
  /**
   * Torque clamp per assist level for the SHUV yaw envelope, N·m. Separate from
   * `tauMax` (which drives flip roll) because the board's yaw inertia about the
   * up axis is ~17× its roll inertia about the long axis — the same clamp would
   * barely spin a shuv. Sized so a shuv reaches its 180° target within airtime.
   */
  shuvTauMax: [number, number, number];
  /**
   * Catch-time quantize cone half-width per assist level, degrees. When the
   * integrated flip roll (or shuv yaw) at catch lands within this cone of the
   * nearest k·360° (flip) / k·180° (shuv), extra axis-damping bleeds the
   * residual spin so the trick settles ON the level (final-physics §3.4). L0 is
   * 0 → L0 NEVER snaps (quantize off). NEVER a pose write.
   */
  quantizeConeDeg: [number, number, number];
  /**
   * Fraction of the on-axis spin removed at catch when inside the quantize cone,
   * per assist level. Applied ON TOP of the base catch damping, only about the
   * trick axis. L0 is 0 by construction. L2 > L1 (stronger snap).
   */
  quantizeExtraDamp: [number, number, number];
  /**
   * Minimum |completed rotations| (turns) for the OUTCOME namer to call a flip
   * 'kickflip'/'heelflip' rather than fall back to the base pop label
   * (final-input-and-trick §7: names from board-state history — a flick whose
   * rotation died early is named for what physically happened). Set safely above
   * any incidental roll a plain/dirty ollie accrues about its long axis.
   */
  nameMinTurns: number;
}

export interface CatchConfig {
  /** Catch volume radius, m board-local (hypothesis 0.12–0.18). ±20% auto ok. */
  volumeRadius: number;
  /** Catch window after pop apex, ms. */
  windowMs: number;
  /** Angular damping applied on catch per assist level. */
  assistScale: [number, number, number];
  /** Base catch gain multiplied by assistScale. */
  catchGain: number;
  /**
   * When true (M4 default, hypothesis) the catch window opens only after the
   * vertical apex (lv.y ≤ 0); a replant during the ascent does not catch.
   * When false any mid-air replant into a catch volume catches.
   */
  apexOnly: boolean;
}

export interface LandConfig {
  /** Board-up vs world-up angle for a clean landing, deg (~25). */
  thetaCleanDeg: number;
  /** Dirty landing limit, deg (~45); beyond is bail. */
  thetaDirtyDeg: number;
  /**
   * Fraction of horizontal speed scrubbed on a DIRTY landing (M4, hypothesis).
   * Applied by SimWorld as an opposing impulse (−mass·scrub·v_horizontal),
   * force/impulse-based — never a velocity write.
   */
  dirtySpeedScrub: number;
}

/** Air-phase guards (M4). */
export interface AirConfig {
  /**
   * Max sim steps a maneuver may stay airborne before it bails with reason
   * 'timeout' (M4, hypothesis ~4 s — falling-out-of-world guard).
   */
  timeoutSteps: number;
}

/** Bail state tuning (M4). */
export interface BailConfig {
  /**
   * Steps the bail state lasts before the deterministic checkpoint respawn
   * (M4, hypothesis 1.5 s — long enough to read the failure).
   */
  recoverSteps: number;
  /**
   * Rigid-body linear+angular damping applied while bailed (M4, hypothesis).
   * Damping-parameter change integrated by the engine — not a velocity write.
   * Restored to the physics defaults on respawn.
   */
  dampingFactor: number;
}

export interface GrindConfig {
  /** Entry relative-speed window along rail, m/s. */
  vMin: number;
  vMax: number;
  /** Approach angle envelope half-width for 50-50 (near parallel), deg. */
  fiftyFiftyEnvelopeDeg: number;
  /** Boardslide requires |yaw vs rail| near 90° within this half-width, deg. */
  boardslideEnvelopeDeg: number;
  /** Snap radius by assist level, m (L0 ≈ 0). */
  rSnap: [number, number, number];
  /** Balance meter fail limit (|balance| > limit → slip). */
  balanceLimit: number;
  /** Balance drift gain from lateral lean / contact offset. */
  balanceGain: number;
  /** Hard off-axis impulse (N·s) that clears the latch. */
  interruptImpulse: number;
}

export interface PhysicsConfig {
  hz: number;
  gravity: { x: number; y: number; z: number };
  /** Board dimensions, m. */
  boardLength: number;
  boardWidth: number;
  wheelbase: number;
  boardMass: number;
  /** Ground locomotion. */
  pushImpulse: number;
  maxGroundSpeed: number;
  /** Steering yaw rate at full segment rotation, rad/s. */
  steerYawRateMax: number;
  rollingFriction: number;
  /** Collision impulse above which maneuvers interrupt (T_col). */
  interruptCollisionImpulse: number;
  /**
   * Steps over which airborne contact impulses accumulate toward the
   * interrupt threshold (M4, hypothesis). The contact solver spreads a sharp
   * impact across ~2-3 steps at 60 Hz (measured: a 5.9 m/s wall crash reports
   * ~6 N·s on each of 3 consecutive steps, while a dirty-landing tail strike
   * is a single ~5.8 N·s step), so a windowed SUM separates "hard crash"
   * (~18 N·s > T_col) from "scrappy landing" (~6 N·s < T_col) where a
   * per-step magnitude cannot. The window resets whenever the board is
   * grounded and at each pop.
   */
  interruptWindowSteps: number;

  // --- Model A rigid body construction (M2) -----------------------------
  /**
   * Deck cuboid thickness, m (final-physics-animation-camera-spec §1: deck
   * cuboid ~0.05 thick). Long axis is local +Z, width is local X.
   */
  deckThickness: number;
  /** Half-extents of each truck box collider, m. */
  truckHalfExtents: { x: number; y: number; z: number };
  /**
   * |Z| offset of each truck box from board center, m. Two trucks at ±this
   * along the long axis (defaults to wheelbase / 2).
   */
  truckInsetZ: number;
  /**
   * Downward offset (m) of each truck box center below the deck center. With
   * truckDropY 0.055 and truck half-height 0.03 the truck undersides sit
   * 0.085 m below board center, so the resting board-center height is
   * ~0.085 m (observed ~0.084 with contact slop) — the spec's "deck height
   * ~0.09 m" class.
   */
  truckDropY: number;
  /** Board center height at spawn/reset, m (board drops onto the ground). */
  spawnHeight: number;
  /**
   * Seeded reset variation magnitude. Position jitter is up to this many m and
   * angular-velocity jitter up to this many rad/s, both derived from the reset
   * seed so that different seeds diverge (M2 determinism / cross-seed golden).
   */
  spawnJitter: number;
  /** Board (deck) collider friction coefficient. Deck grips rails/ledges. */
  boardFriction: number;
  /**
   * Truck collider friction coefficient (M3). The trucks are the ground-contact
   * geometry; keeping them low-friction models the wheels/trucks ROLLING so
   * gentle cruise forces are not pinned by static friction (μN ≈ 20 N at
   * boardMass). Deck keeps `boardFriction` for rail/ledge grip.
   */
  truckFriction: number;
  /**
   * Ground-proximity tolerance, m (M3). `isGrounded()` reports true when the
   * board center height is within this margin of its resting height
   * (truckDropY + truckHalfExtents.y). During the spawn drop the board is high,
   * so it reads NOT grounded until it settles — no ground forces mid-air.
   */
  groundedTolerance: number;
  /** Board collider restitution (bounce). */
  boardRestitution: number;
  /** Board rigid-body linear/angular damping (settles the drop). */
  linearDamping: number;
  angularDamping: number;
  /** Static ground plane collider. Top surface sits at world y = 0. */
  ground: {
    halfExtents: { x: number; y: number; z: number };
    friction: number;
  };
}

/**
 * Ground-locomotion control gains (M3). These are CONTROLLER tunables (how
 * input maps to intent), distinct from the raw body/collider properties in
 * PhysicsConfig. BoardController emits body-state-free intents; SimWorld applies
 * them inside these clamps against live linear/angular velocity. All are
 * hypothesis defaults for G2 tuning.
 */
export interface LocomotionConfig {
  /**
   * Cruise asymptotic ground speed, m/s. Holding both feet planted drives the
   * board toward this speed (below the hard `physics.maxGroundSpeed` cap that
   * push pulses respect). Feel target ~4 m/s.
   */
  cruiseTargetSpeed: number;
  /**
   * Base forward drive force for cruise, N. SimWorld scales it by
   * `(1 - forwardSpeed / cruiseTargetSpeed)` so drive fades to zero at the
   * target — force-based saturation, never a hard velocity write.
   */
  cruiseDriveForce: number;
  /** Minimum sim steps between push pulses (cooldown) so a held click is one push. */
  pushCooldownSteps: number;
  /**
   * Segment angular velocity (rad/s) → target board yaw rate scale. The primary
   * steering signal. Result is clamped to `physics.steerYawRateMax`.
   */
  steerYawGain: number;
  /**
   * Sustained segment angle-from-rest (rad) → added heading-bias yaw rate, 1/s.
   * Smaller than the angular-velocity term so a slow deliberate hold still
   * steers.
   */
  steerHeadingBiasGain: number;
  /**
   * Yaw servo gain, N·m per (rad/s) of yaw-rate error. SimWorld drives angular
   * velocity toward the (clamped) target yaw rate with a torque limited by
   * `steerMaxTorque` — no direct angular-velocity writes.
   */
  steerServoGain: number;
  /** Steering torque clamp, N·m. */
  steerMaxTorque: number;
  /**
   * Midpoint lateral offset-from-rest (calibrated pad units) → mild carve yaw
   * rate contribution, 1/s. Lets a lateral lean add a gentle turn.
   */
  leanCarveGain: number;
  /** Midpoint lateral offset → cosmetic roll torque, N·m per unit offset. */
  leanRollGain: number;
  /** Roll torque clamp, N·m (kept small so lean can never flip the board). */
  leanMaxRollTorque: number;
  /**
   * Scale mapping a calibrated pad offset-from-rest to a board-local shoe socket
   * offset (m) for ObserveState.feet. Presentation only; never drives physics.
   */
  padToBoardScale: number;
  /** Emit a sampled `groundControl` telemetry event every N sim steps (throttle). */
  groundControlLogEvery: number;
}

/**
 * App/runtime engine tunables introduced in M2. Not physics laws; these govern
 * the fixed-timestep loop, telemetry retention, and replay checkpoint cadence.
 */
export interface RuntimeConfig {
  loop: {
    /** Max real time (ms) folded into the accumulator per frame (anti-spiral). */
    maxFrameMs: number;
    /** Max fixed steps executed per rendered frame (anti-spiral clamp). */
    maxStepsPerFrame: number;
  };
  telemetry: {
    /** Bounded ring-log capacity (events beyond this drop oldest-first). */
    ringCapacity: number;
  };
  replay: {
    /** Emit a checkpoint hash every N sim steps while recording. */
    checkpointEverySteps: number;
  };
}

/**
 * Camera rig tunables (M7). PRESENTATION ONLY — the camera reads sim state via
 * the harness and never writes input/sim (spec §6: "camera never changes the
 * board-local input frame"). All values are cycle-3 hypothesis defaults for a
 * later feel pass; distances are metres, heights metres, FOV degrees. The rig
 * frames off `ObserveState.phase`; transitions are a critically damped spring on
 * position + a rate-clamped slerp on orientation (spec §6).
 */
export interface CameraConfig {
  /** Near/far clip planes, m. */
  near: number;
  far: number;
  /** Base (ground/chase) vertical FOV, deg. */
  fovBase: number;
  /** Air pull-back FOV, deg — widened so a full rotation reads (spec §6). */
  fovAir: number;

  // --- Chase low 3/4 (ground) -------------------------------------------
  /** Distance the chase cam sits BEHIND the board (along board heading −Z), m. */
  chaseDistance: number;
  /** Chase cam height above the board centre, m (feet stay visible). */
  chaseHeight: number;
  /** Lateral 3/4 offset of the chase cam, m (the "3/4" in low 3/4). */
  chaseSide: number;
  /** Aim point height above the board centre for the look target, m. */
  aimHeight: number;
  /** Minimum look-ahead distance in front of the board, m (spec: 2–4 m). */
  lookAheadMin: number;
  /** Maximum look-ahead distance, m (reached at `lookAheadSpeedRef`). */
  lookAheadMax: number;
  /** Ground speed (m/s) at which look-ahead saturates to `lookAheadMax`. */
  lookAheadSpeedRef: number;

  // --- Air pull-back / catch --------------------------------------------
  /** Chase distance while airborne, m (pulled back for readability). */
  airDistance: number;
  /** Chase height while airborne, m. */
  airHeight: number;
  /**
   * Catch tightening factor in [0,1]: how far catch frames blend from the air
   * pose back toward the chase pose (0 = stay air, 1 = full chase).
   */
  catchTighten: number;

  // --- Bail wide --------------------------------------------------------
  /** Bail cam distance, m — wide so the failure is readable (spec §6). */
  bailDistance: number;
  /** Bail cam height, m. */
  bailHeight: number;
  /** Slow orbit rate while holding the bail wide shot, rad/s. */
  bailOrbitRate: number;

  // --- Grind overhead blend (STUB until M6 phase arrives) ----------------
  /** Grind cam height above the board, m (overhead-ish). */
  grindHeight: number;
  /** Grind cam lateral offset, m. */
  grindSide: number;
  /** Grind look-ahead along the rail, m. */
  grindLookAhead: number;

  // --- Transitions ------------------------------------------------------
  /**
   * Critically damped position smooth time, s (Unity-style SmoothDamp — the
   * analytic critically damped spring). Smaller = snappier. `reducedMotion`
   * snaps instantly regardless.
   */
  positionSmoothTime: number;
  /** Max camera angular slew rate, deg/s (orientation slerp clamp, spec §6). */
  maxAngularRateDeg: number;

  // --- Occlusion spring-arm ---------------------------------------------
  /** Sphere-cast probe radius for the occlusion spring-arm, m (spec §6). */
  occlusionRadius: number;
  /** Never shorten the arm below this distance from the target, m. */
  occlusionMinDistance: number;
}

/**
 * Presentation tunables (M7) for the shoes, wheels, and bail/respawn overlays.
 * PRESENTATION ONLY — none of these feed the sim. Blend RATES are per-second
 * exponential smoothing coefficients (`a = 1 − exp(−rate·dt)`), so they are
 * frame-rate independent and never pop. Cycle-3 hypothesis defaults.
 */
export interface PresentationConfig {
  /** Shoe follow rate on the ground (plant/rest tracking), 1/s. */
  shoeGroundBlendRate: number;
  /** Shoe rate while lerping back to sockets on catch, 1/s (spec §5 damp). */
  shoeCatchBlendRate: number;
  /** Air lean angle per unit board roll rate, rad per (rad/s) — cosmetic. */
  shoeAirLeanGain: number;
  /** Clamp on the procedural air lean, deg. */
  shoeAirLeanMaxDeg: number;
  /** Vertical squash of a planted shoe (1 = none), spec §5 "slight squash". */
  shoeSquashY: number;
  /** Render-space gravity for a bailed (detached) shoe, m/s². */
  bailShoeGravity: number;
  /** Tumble spin of a bailed shoe, rad/s (cosmetic). */
  bailShoeSpin: number;
  /** Bailed-shoe fade-out duration, ms. */
  bailShoeFadeMs: number;
  /**
   * Visual wheel-spin multiplier. Wheel angle accumulates
   * `+= (groundSpeed / wheelRadius) · dt · wheelSpinFactor` — never an absolute
   * angle derived from instantaneous speed (that stutters).
   */
  wheelSpinFactor: number;
  /** Fallback wheel radius, m, if the GLB wheel bbox can't be measured. */
  wheelRadiusFallback: number;
  /** Red bail vignette hold duration, ms (CSS overlay; skipped if reducedMotion). */
  bailVignetteMs: number;
  /** Respawn fade-through-black duration, ms (instant if reducedMotion). */
  respawnFadeMs: number;
}

export interface SimConfig {
  recognition: RecognitionConfig;
  footTracker: FootTrackerConfig;
  pop: PopConfig;
  flip: FlipConfig;
  catch: CatchConfig;
  land: LandConfig;
  air: AirConfig;
  bail: BailConfig;
  grind: GrindConfig;
  physics: PhysicsConfig;
  locomotion: LocomotionConfig;
  runtime: RuntimeConfig;
  camera: CameraConfig;
  presentation: PresentationConfig;
}

// Deep-frozen at definition: the shared defaults are a contract, not a
// scratchpad. Tampering (including by injected agent code) throws in strict
// mode. Runs needing tweaked values must clone first (e.g. structuredClone).
export const DEFAULT_SIM_CONFIG: SimConfig = deepFreezeConfig({
  recognition: {
    cEnter: 0.55,
    cExit: 0.4,
    replaceMargin: 0.15,
    popLookbackMs: 60,
    popLookaheadMs: 60,
    airTrickWindowMs: 320,
    flickSpeedMin: 2.2,
    plantSpeedEps: 0.35,
    sweepMinAngleRad: 0.9,
    prepLiftSpeedMin: 0.8,
    shuvTargetDeg: 180,
    shuvNameMinDeg: 90,
  },
  footTracker: {
    recenterHoldMs: 300,
    ballisticPredictMs: 200,
    dualLiftClearMs: 500,
    idThrashWarnPerMin: 2,
    velEmaAlpha: 0.4,
    rebindRadius: 0.18,
    recenterRateHz: 1.5,
  },
  pop: {
    jMin: 5.8,
    jMax: 9.6,
    pitchBias: 0.35,
    pitchTorqueScale: 0.064,
    pitchTorqueImpulseMax: 0.5,
    prepLiftSpeedForMaxQ: 2.0,
    qTimingWeight: 0.5,
    qCrispWeight: 0.5,
    groundLeaveTimeoutSteps: 12,
  },
  flip: {
    omegaFlipMax: 15,
    kp: 8,
    kd: 0.6,
    tauMax: [1.2, 2.0, 3.0],
    axisDominanceRatio: 1.3,
    flickPathMinLen: 0.06,
    flickSpeedForMaxS: 5.0,
    shuvOmegaMax: 9.0,
    shuvTauMax: [5, 7, 10],
    quantizeConeDeg: [0, 45, 80],
    quantizeExtraDamp: [0, 0.5, 0.85],
    nameMinTurns: 0.4,
  },
  catch: {
    volumeRadius: 0.15,
    windowMs: 420,
    assistScale: [0.35, 0.55, 0.75],
    catchGain: 1.0,
    apexOnly: true,
  },
  land: {
    thetaCleanDeg: 25,
    thetaDirtyDeg: 45,
    dirtySpeedScrub: 0.35,
  },
  air: {
    timeoutSteps: 240,
  },
  bail: {
    recoverSteps: 90,
    dampingFactor: 6.0,
  },
  grind: {
    vMin: 0.8,
    vMax: 9.0,
    fiftyFiftyEnvelopeDeg: 25,
    boardslideEnvelopeDeg: 30,
    rSnap: [0.02, 0.08, 0.14],
    balanceLimit: 1.0,
    balanceGain: 1.6,
    interruptImpulse: 6.0,
  },
  physics: {
    hz: 60,
    gravity: { x: 0, y: -9.81, z: 0 },
    boardLength: 0.8,
    boardWidth: 0.2,
    wheelbase: 0.43,
    boardMass: 2.4,
    pushImpulse: 2.9,
    maxGroundSpeed: 8.0,
    steerYawRateMax: 2.6,
    rollingFriction: 0.18,
    interruptCollisionImpulse: 8.0,
    interruptWindowSteps: 3,
    deckThickness: 0.05,
    truckHalfExtents: { x: 0.05, y: 0.03, z: 0.03 },
    truckInsetZ: 0.215,
    truckDropY: 0.055,
    spawnHeight: 0.6,
    spawnJitter: 0.02,
    boardFriction: 0.8,
    truckFriction: 0.06,
    groundedTolerance: 0.06,
    boardRestitution: 0.1,
    linearDamping: 0.05,
    angularDamping: 0.2,
    ground: {
      halfExtents: { x: 25, y: 0.1, z: 25 },
      friction: 0.9,
    },
  },
  locomotion: {
    cruiseTargetSpeed: 5.5,
    cruiseDriveForce: 20,
    pushCooldownSteps: 12,
    steerYawGain: 1.2,
    steerHeadingBiasGain: 2.5,
    steerServoGain: 3.0,
    steerMaxTorque: 2.6,
    leanCarveGain: 1.4,
    leanRollGain: 0.6,
    leanMaxRollTorque: 0.25,
    padToBoardScale: 0.6,
    groundControlLogEvery: 15,
  },
  runtime: {
    loop: { maxFrameMs: 250, maxStepsPerFrame: 5 },
    telemetry: { ringCapacity: 10000 },
    replay: { checkpointEverySteps: 30 },
  },
  camera: {
    near: 0.05,
    far: 400,
    fovBase: 55,
    fovAir: 66,
    chaseDistance: 2.8,
    chaseHeight: 1.05,
    chaseSide: 0.7,
    aimHeight: 0.45,
    lookAheadMin: 2.0,
    lookAheadMax: 4.0,
    lookAheadSpeedRef: 6.0,
    airDistance: 5.0,
    airHeight: 2.2,
    catchTighten: 0.55,
    bailDistance: 7.0,
    bailHeight: 3.0,
    bailOrbitRate: 0.25,
    grindHeight: 4.0,
    grindSide: 2.5,
    grindLookAhead: 2.5,
    positionSmoothTime: 0.32,
    maxAngularRateDeg: 150,
    occlusionRadius: 0.25,
    occlusionMinDistance: 0.8,
  },
  presentation: {
    shoeGroundBlendRate: 18,
    shoeCatchBlendRate: 9,
    shoeAirLeanGain: 0.06,
    shoeAirLeanMaxDeg: 18,
    shoeSquashY: 0.9,
    bailShoeGravity: -9.0,
    bailShoeSpin: 3.0,
    bailShoeFadeMs: 650,
    wheelSpinFactor: 1.0,
    wheelRadiusFallback: 0.026,
    bailVignetteMs: 900,
    respawnFadeMs: 250,
  },
} as SimConfig);

/** Fields the adaptive tuner may move, each within ±20% of default. */
export const AUTO_ADJUSTABLE_FIELDS = [
  'recognition.flickSpeedMin',
  'recognition.popLookbackMs',
  'recognition.popLookaheadMs',
  'catch.windowMs',
  'catch.volumeRadius',
] as const;

export function deepFreezeConfig<T>(cfg: T): T {
  if (cfg && typeof cfg === 'object') {
    for (const value of Object.values(cfg as Record<string, unknown>)) {
      deepFreezeConfig(value);
    }
    Object.freeze(cfg);
  }
  return cfg;
}
