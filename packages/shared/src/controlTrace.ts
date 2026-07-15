import type { InputProfile, Stance } from './config';
import type { ContactFrame } from './contactFrame';
import type { ManeuverPhase, Quat, Vec3 } from './observe';

export const TRICK_INTENT_VERSION = 1 as const;
export const CONTROL_TRACE_VERSION = 2 as const;

export interface TrickIntentV1 {
  version: typeof TRICK_INTENT_VERSION;
  attemptId: string;
  popSide: 'tail' | 'nose';
  base: 'ollie' | 'nollie';
  family: 'ollie' | 'flip' | 'shuv';
  direction: 'none' | 'heelside' | 'toeside' | 'frontside' | 'backside';
  label: 'ollie' | 'nollie' | 'kickflip' | 'heelflip' | 'fs-shuv' | 'bs-shuv';
  /** Normalized gesture speed/expression score. */
  gestureSpeed: number;
  /** Normalized directional/path accuracy score. */
  gestureAccuracy: number;
  confidence: number;
  /** True while the dependable base ollie/nollie is the active fallback. */
  fallback: boolean;
  stance: Stance;
  source: {
    popStep: number;
    recognizedStep: number | null;
    popTPerfMs?: number;
    recognizedTPerfMs?: number;
  };
}

export interface CalibratedFootTraceV2 {
  role: 'nose' | 'tail';
  planted: boolean;
  pos: { x: number; y: number };
  vel: { x: number; y: number };
  offsetFromRest: { x: number; y: number };
  contactId: number | null;
}

export interface CalibratedFeetTraceV2 {
  nose: CalibratedFootTraceV2;
  tail: CalibratedFootTraceV2;
  segment: {
    valid: boolean;
    angle: number;
    angleFromRest: number;
    angVel: number;
    midpoint: { x: number; y: number };
    midpointOffsetFromRest: { x: number; y: number };
    midpointVel: { x: number; y: number };
    lengthRatio: number;
  };
  bothPlanted: boolean;
  plantCount: number;
  accelerating?: boolean;
}

export interface CalibratedFeetSampleTraceV2 {
  frameId: number;
  tPerfMs: number;
  dtSeconds: number;
  state: CalibratedFeetTraceV2;
}

export type ControlTraceEventV2 =
  | { kind: 'contact'; step: number; frame: ContactFrame }
  | {
      kind: 'control';
      step: number;
      /** Every calibrated ~125 Hz sample consumed by this 60 Hz sim step. */
      samples: CalibratedFeetSampleTraceV2[];
      feet: CalibratedFeetTraceV2;
      /** Recognized kick edges. Name retained for ControlTraceV2 compatibility. */
      clickEdges: Array<{
        button: 'primary' | 'secondary';
        mask: 'nose' | 'tail' | 'both' | 'none';
        source?: 'button' | 'motionTap';
        tapRole?: 'nose' | 'tail';
        tapDurationMs?: number;
        tapDistance?: number;
      }>;
      recognizerPhase: ManeuverPhase;
      intent: TrickIntentV1 | null;
    }
  | { kind: 'intent'; step: number; intent: TrickIntentV1 }
  | {
      kind: 'sim';
      step: number;
      board: { p: Vec3; q: Quat; lv: Vec3; av: Vec3 };
      phase: ManeuverPhase;
      intent: TrickIntentV1 | null;
    }
  | {
      kind: 'render';
      step: number;
      tPerfMs: number;
      frameMs: number;
      camera?: { p: Vec3; target: Vec3 };
    }
  | {
      kind: 'outcome';
      step: number;
      type: 'trickCompleted' | 'bail' | 'grindCompleted' | 'grindExit' | 'respawn';
      payload: Record<string, unknown>;
    };

export interface ControlTraceV2 {
  version: typeof CONTROL_TRACE_VERSION;
  profile: InputProfile;
  events: ControlTraceEventV2[];
  /** Human-authored Flick-It Lab labels; diagnostic only, never replay authority. */
  attempts?: LabeledAttemptV1[];
  /** Cumulative lab classification counts at export time. */
  metrics?: { confusion: Record<string, number> };
}

export interface LabeledAttemptV1 {
  expected: TrickIntentV1['label'];
  recognized: TrickIntentV1['label'] | 'none';
  correct: boolean;
  fallback: boolean;
}
