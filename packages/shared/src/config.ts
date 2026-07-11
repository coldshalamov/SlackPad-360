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

export const DEFAULT_INPUT_PROFILE: InputProfile = {
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
};

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
}

export const DEFAULT_SIM_CONFIG: SimConfig = {
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
    pushImpulse: 1.6,
    maxGroundSpeed: 8.0,
    steerYawRateMax: 2.6,
    rollingFriction: 0.18,
    interruptCollisionImpulse: 8.0,
  },
};

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
