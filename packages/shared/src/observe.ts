import type { ContactFrameSource } from './contactFrame';

/** Minimal vector/quaternion value shapes (plain data, engine-agnostic). */
export interface Vec3 {
  x: number;
  y: number;
  z: number;
}
export interface Quat {
  x: number;
  y: number;
  z: number;
  w: number;
}

/**
 * Maneuver phase visible to the agent. 'ground' (riding on the ground) is an
 * M4 addition for observability; the spec AssistState phase enum maps it to
 * 'none' (nothing is assisted on plain ground). 'none' = not riding (spawn
 * drop, post-bail respawn fall).
 */
export type ManeuverPhase = 'none' | 'ground' | 'pop' | 'air' | 'catch' | 'grind' | 'bail';

export type GrindFamily = 'fifty-fifty' | 'boardslide';

export interface FootObservation {
  planted: boolean;
  /** Board-local placement offset of the shoe, m. */
  offset: Vec3;
}

/** Read-only sim observation returned by AgentHarness.observe(). */
export interface ObserveState {
  step: number;
  seed: number;
  board: {
    p: Vec3;
    q: Quat;
    lv: Vec3;
    av: Vec3;
  };
  phase: ManeuverPhase;
  label: string | null;
  assistLevel: 0 | 1 | 2;
  feet: {
    nose: FootObservation;
    tail: FootObservation;
  };
  grind: {
    active: boolean;
    family: GrindFamily;
    balance: number;
  } | null;
  score: number;
  lastFailReason: string | null;
  inputSource: ContactFrameSource | null;
}
