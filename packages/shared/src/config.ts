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
  /** Vertical pop impulse range, N·s at board mass scale. */
  jMin: number;
  jMax: number;
  /** Pitch bias factor applied along boardRight × up during pop. */
  pitchBias: number;
}

export interface FlipConfig {
  /** Max flip angular speed, rad/s (hypothesis 12–18). */
  omegaFlipMax: number;
  /** PD gains for flip torque tracking. */
  kp: number;
  kd: number;
  /** Torque clamp per assist level, N·m. */
  tauMax: [number, number, number];
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
}

export interface LandConfig {
  /** Board-up vs world-up angle for a clean landing, deg (~25). */
  thetaCleanDeg: number;
  /** Dirty landing limit, deg (~45); beyond is bail. */
  thetaDirtyDeg: number;
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

export interface SimConfig {
  recognition: RecognitionConfig;
  footTracker: FootTrackerConfig;
  pop: PopConfig;
  flip: FlipConfig;
  catch: CatchConfig;
  land: LandConfig;
  grind: GrindConfig;
  physics: PhysicsConfig;
  locomotion: LocomotionConfig;
  runtime: RuntimeConfig;
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
    jMin: 2.2,
    jMax: 4.6,
    pitchBias: 0.35,
  },
  flip: {
    omegaFlipMax: 15,
    kp: 8,
    kd: 0.6,
    tauMax: [1.2, 2.0, 3.0],
  },
  catch: {
    volumeRadius: 0.15,
    windowMs: 420,
    assistScale: [0.35, 0.55, 0.75],
    catchGain: 1.0,
  },
  land: {
    thetaCleanDeg: 25,
    thetaDirtyDeg: 45,
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
