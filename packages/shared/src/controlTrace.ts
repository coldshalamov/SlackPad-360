import {
  FLICK_SENSITIVITY_MAX,
  FLICK_SENSITIVITY_MIN,
  type InputProfile,
  type Stance,
} from './config';
import { validateContactFrame, type ContactFrame } from './contactFrame';
import type { ManeuverPhase, Quat, Vec3 } from './observe';

export const TRICK_INTENT_VERSION = 1 as const;
/** Version retained for all existing writers/readers. */
export const CONTROL_TRACE_VERSION = 2 as const;
/** Opt-in diagnostic trace version; replay authority remains SessionTrace.frames. */
export const CONTROL_TRACE_V3_VERSION = 3 as const;

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

export type SkateWheelId = 'frontLeft' | 'frontRight' | 'rearLeft' | 'rearRight';

export interface SkatePhysicsBodyObservationV1 {
  boardMassKg: number;
  riderProxyMassKg?: number;
  centerOfMassLocalM: Vec3;
  inertiaKgM2?: Vec3;
}

export interface SkateWheelContactObservationV1 {
  wheel: SkateWheelId;
  grounded: boolean;
  point?: Vec3;
  normal?: Vec3;
  normalLoadN: number;
  suspensionCompressionM: number;
  longitudinalSlipMps: number;
  lateralSlipMps: number;
}

export type SkateAssistKind =
  | 'steering'
  | 'stability'
  | 'pop'
  | 'air-control'
  | 'catch'
  | 'landing'
  | 'transition'
  | 'grind';

export interface SkateAssistObservationV1 {
  kind: SkateAssistKind;
  active: boolean;
  /** Normalized requested assist magnitude in [0, 1]. */
  strength: number;
  forceN?: Vec3;
  torqueNm?: Vec3;
  /** Actual linear impulse applied during this recorded simulation step. */
  impulseNs?: Vec3;
  /** Actual angular impulse applied during this recorded simulation step. */
  torqueImpulseNms?: Vec3;
  reason?: string;
}

export interface SkateSolverObservationV1 {
  totalMassKg: number;
  physicsSubsteps: number;
  internalHz: number;
  ccdEnabled: boolean;
}

export interface SkateContactImpulseObservationV1 {
  totalNs: number;
  supportNs: number;
  impactNs: number;
}

/**
 * Read-only physics telemetry. These values explain a run but never drive it;
 * the ordered SessionTrace ContactFrames remain the sole replay authority.
 */
export interface SkatePhysicsObservationV1 {
  version: 1;
  body?: SkatePhysicsBodyObservationV1;
  solver?: SkateSolverObservationV1;
  wheelContacts?: SkateWheelContactObservationV1[];
  contactImpulses?: SkateContactImpulseObservationV1;
  assists?: SkateAssistObservationV1[];
}

type ControlTraceSimEventV2 = Extract<ControlTraceEventV2, { kind: 'sim' }>;

export type ControlTraceEventV3 =
  | Exclude<ControlTraceEventV2, { kind: 'sim' }>
  | (ControlTraceSimEventV2 & { physics?: SkatePhysicsObservationV1 });

export interface ControlTraceV3 extends Omit<ControlTraceV2, 'version' | 'events'> {
  version: typeof CONTROL_TRACE_V3_VERSION;
  events: ControlTraceEventV3[];
}

/** Both trace versions are readable; new writers may opt into V3 diagnostics. */
export type ControlTrace = ControlTraceV2 | ControlTraceV3;

export interface LabeledAttemptV1 {
  expected: TrickIntentV1['label'];
  recognized: TrickIntentV1['label'] | 'none';
  correct: boolean;
  fallback: boolean;
}

export interface ControlTraceValidationResult {
  ok: boolean;
  version: 2 | 3 | null;
  errors: string[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function validateQuat(value: unknown, path: string, errors: string[]): void {
  validateVec3(value, path, errors);
  if (isRecord(value) && !isFiniteNumber(value.w)) {
    errors.push(`${path}.w must be a finite number`);
  }
}

const MANEUVER_PHASES: readonly ManeuverPhase[] = [
  'none', 'ground', 'pop', 'air', 'catch', 'grind', 'bail',
];

function validatePhase(value: unknown, path: string, errors: string[]): void {
  if (!MANEUVER_PHASES.includes(value as ManeuverPhase)) {
    errors.push(`${path} must be a supported maneuver phase`);
  }
}

function validateInputProfile(value: unknown, path: string, errors: string[]): void {
  if (!isRecord(value)) {
    errors.push(`${path} must be an object`);
    return;
  }
  if (value.stance !== 'regular' && value.stance !== 'goofy') {
    errors.push(`${path}.stance must be regular or goofy`);
  }
  if (!isFiniteNumber(value.padYawOffset)) {
    errors.push(`${path}.padYawOffset must be a finite number`);
  }
  if (value.flickSensitivity !== undefined
    && (!isFiniteNumber(value.flickSensitivity)
      || value.flickSensitivity < FLICK_SENSITIVITY_MIN
      || value.flickSensitivity > FLICK_SENSITIVITY_MAX)) {
    errors.push(
      `${path}.flickSensitivity must be between ${FLICK_SENSITIVITY_MIN} and ${FLICK_SENSITIVITY_MAX}`,
    );
  }
  if (typeof value.swapFeet !== 'boolean') errors.push(`${path}.swapFeet must be boolean`);
  if (value.assistLevel !== 0 && value.assistLevel !== 1 && value.assistLevel !== 2) {
    errors.push(`${path}.assistLevel must be 0, 1, or 2`);
  }
  if (value.assistPreset !== undefined
    && value.assistPreset !== 'experienced'
    && value.assistPreset !== 'classic'
    && value.assistPreset !== 'streamlined') {
    errors.push(`${path}.assistPreset is not supported`);
  }
  if (value.bothClickMeans !== 'ignore'
    && value.bothClickMeans !== 'push'
    && value.bothClickMeans !== 'ollie') {
    errors.push(`${path}.bothClickMeans is not supported`);
  }
  if (value.kickAttribution !== 'motionTap'
    && value.kickAttribution !== 'buttonSide'
    && value.kickAttribution !== 'plantMask') {
    errors.push(`${path}.kickAttribution is not supported`);
  }
  if (typeof value.tapToClickIsKick !== 'boolean') {
    errors.push(`${path}.tapToClickIsKick must be boolean`);
  }
  if (!isRecord(value.accessibility)) {
    errors.push(`${path}.accessibility must be an object`);
  } else {
    if (typeof value.accessibility.reducedMotion !== 'boolean') {
      errors.push(`${path}.accessibility.reducedMotion must be boolean`);
    }
    if (typeof value.accessibility.highContrastHud !== 'boolean') {
      errors.push(`${path}.accessibility.highContrastHud must be boolean`);
    }
  }
}

function validateIntent(value: unknown, path: string, errors: string[]): void {
  if (value === null) return;
  if (!isRecord(value)) {
    errors.push(`${path} must be an object or null`);
    return;
  }
  if (value.version !== TRICK_INTENT_VERSION) errors.push(`${path}.version must be 1`);
  if (typeof value.attemptId !== 'string') errors.push(`${path}.attemptId must be a string`);
  if (value.popSide !== 'tail' && value.popSide !== 'nose') {
    errors.push(`${path}.popSide must be tail or nose`);
  }
  if (value.base !== 'ollie' && value.base !== 'nollie') {
    errors.push(`${path}.base must be ollie or nollie`);
  }
  if (!['ollie', 'flip', 'shuv'].includes(value.family as string)) {
    errors.push(`${path}.family is not supported`);
  }
  if (!['none', 'heelside', 'toeside', 'frontside', 'backside'].includes(value.direction as string)) {
    errors.push(`${path}.direction is not supported`);
  }
  if (!['ollie', 'nollie', 'kickflip', 'heelflip', 'fs-shuv', 'bs-shuv'].includes(value.label as string)) {
    errors.push(`${path}.label is not supported`);
  }
  for (const field of ['gestureSpeed', 'gestureAccuracy', 'confidence'] as const) {
    if (!isFiniteNumber(value[field])) errors.push(`${path}.${field} must be a finite number`);
  }
  if (typeof value.fallback !== 'boolean') errors.push(`${path}.fallback must be boolean`);
  if (value.stance !== 'regular' && value.stance !== 'goofy') {
    errors.push(`${path}.stance must be regular or goofy`);
  }
  if (!isRecord(value.source)) {
    errors.push(`${path}.source must be an object`);
  } else {
    if (!Number.isInteger(value.source.popStep) || (value.source.popStep as number) < 0) {
      errors.push(`${path}.source.popStep must be a non-negative integer`);
    }
    if (value.source.recognizedStep !== null
      && (!Number.isInteger(value.source.recognizedStep) || (value.source.recognizedStep as number) < 0)) {
      errors.push(`${path}.source.recognizedStep must be a non-negative integer or null`);
    }
  }
}

function validateBoard(value: unknown, path: string, errors: string[]): void {
  if (!isRecord(value)) {
    errors.push(`${path} must be an object`);
    return;
  }
  validateVec3(value.p, `${path}.p`, errors);
  validateQuat(value.q, `${path}.q`, errors);
  validateVec3(value.lv, `${path}.lv`, errors);
  validateVec3(value.av, `${path}.av`, errors);
}

function validateFeet(value: unknown, path: string, errors: string[]): void {
  if (!isRecord(value)) {
    errors.push(`${path} must be an object`);
    return;
  }
  for (const role of ['nose', 'tail'] as const) {
    const foot = value[role];
    if (!isRecord(foot)) {
      errors.push(`${path}.${role} must be an object`);
      continue;
    }
    if (foot.role !== role) errors.push(`${path}.${role}.role must be ${role}`);
    if (typeof foot.planted !== 'boolean') errors.push(`${path}.${role}.planted must be boolean`);
    for (const field of ['pos', 'vel', 'offsetFromRest'] as const) {
      const point = foot[field];
      if (!isRecord(point) || !isFiniteNumber(point.x) || !isFiniteNumber(point.y)) {
        errors.push(`${path}.${role}.${field} must be a finite Vec2 object`);
      }
    }
    if (foot.contactId !== null
      && (!Number.isInteger(foot.contactId) || (foot.contactId as number) < 0)) {
      errors.push(`${path}.${role}.contactId must be a non-negative integer or null`);
    }
  }
  if (!isRecord(value.segment)) {
    errors.push(`${path}.segment must be an object`);
  } else {
    if (typeof value.segment.valid !== 'boolean') {
      errors.push(`${path}.segment.valid must be boolean`);
    }
    for (const field of ['angle', 'angleFromRest', 'angVel', 'lengthRatio'] as const) {
      if (!isFiniteNumber(value.segment[field])) {
        errors.push(`${path}.segment.${field} must be a finite number`);
      }
    }
    for (const field of ['midpoint', 'midpointOffsetFromRest', 'midpointVel'] as const) {
      const point = value.segment[field];
      if (!isRecord(point) || !isFiniteNumber(point.x) || !isFiniteNumber(point.y)) {
        errors.push(`${path}.segment.${field} must be a finite Vec2 object`);
      }
    }
  }
  if (typeof value.bothPlanted !== 'boolean') errors.push(`${path}.bothPlanted must be boolean`);
  if (!Number.isInteger(value.plantCount) || (value.plantCount as number) < 0) {
    errors.push(`${path}.plantCount must be a non-negative integer`);
  }
  if (value.accelerating !== undefined && typeof value.accelerating !== 'boolean') {
    errors.push(`${path}.accelerating must be boolean when present`);
  }
}

function validateFeetSample(value: unknown, path: string, errors: string[]): void {
  if (!isRecord(value)) {
    errors.push(`${path} must be an object`);
    return;
  }
  if (!Number.isInteger(value.frameId) || (value.frameId as number) < 0) {
    errors.push(`${path}.frameId must be a non-negative integer`);
  }
  if (!isFiniteNumber(value.tPerfMs)) errors.push(`${path}.tPerfMs must be a finite number`);
  if (!isFiniteNumber(value.dtSeconds) || value.dtSeconds < 0) {
    errors.push(`${path}.dtSeconds must be a non-negative finite number`);
  }
  validateFeet(value.state, `${path}.state`, errors);
}

function validateClickEdge(value: unknown, path: string, errors: string[]): void {
  if (!isRecord(value)) {
    errors.push(`${path} must be an object`);
    return;
  }
  if (value.button !== 'primary' && value.button !== 'secondary') {
    errors.push(`${path}.button must be primary or secondary`);
  }
  if (!['nose', 'tail', 'both', 'none'].includes(value.mask as string)) {
    errors.push(`${path}.mask is not supported`);
  }
  if (value.source !== undefined && value.source !== 'button' && value.source !== 'motionTap') {
    errors.push(`${path}.source is not supported`);
  }
  if (value.tapRole !== undefined && value.tapRole !== 'nose' && value.tapRole !== 'tail') {
    errors.push(`${path}.tapRole must be nose or tail`);
  }
  for (const field of ['tapDurationMs', 'tapDistance'] as const) {
    if (value[field] !== undefined && (!isFiniteNumber(value[field]) || value[field] < 0)) {
      errors.push(`${path}.${field} must be a non-negative finite number`);
    }
  }
}

function validateVec3(value: unknown, path: string, errors: string[]): void {
  if (!isRecord(value)) {
    errors.push(`${path} must be a Vec3 object`);
    return;
  }
  for (const axis of ['x', 'y', 'z'] as const) {
    if (!isFiniteNumber(value[axis])) errors.push(`${path}.${axis} must be a finite number`);
  }
}

const SKATE_WHEEL_IDS: readonly SkateWheelId[] = [
  'frontLeft', 'frontRight', 'rearLeft', 'rearRight',
];
const SKATE_ASSIST_KINDS: readonly SkateAssistKind[] = [
  'steering', 'stability', 'pop', 'air-control', 'catch', 'landing', 'transition', 'grind',
];
const CONTROL_TRACE_EVENT_KINDS = [
  'contact', 'control', 'intent', 'sim', 'render', 'outcome',
] as const;

function validatePhysicsObservation(value: unknown, path: string, errors: string[]): void {
  if (!isRecord(value)) {
    errors.push(`${path} must be an object`);
    return;
  }
  if (value.version !== 1) errors.push(`${path}.version must be 1`);

  if (value.body !== undefined) {
    if (!isRecord(value.body)) {
      errors.push(`${path}.body must be an object`);
    } else {
      if (!isFiniteNumber(value.body.boardMassKg) || value.body.boardMassKg <= 0) {
        errors.push(`${path}.body.boardMassKg must be greater than 0`);
      }
      if (value.body.riderProxyMassKg !== undefined
        && (!isFiniteNumber(value.body.riderProxyMassKg) || value.body.riderProxyMassKg < 0)) {
        errors.push(`${path}.body.riderProxyMassKg must be non-negative`);
      }
      validateVec3(value.body.centerOfMassLocalM, `${path}.body.centerOfMassLocalM`, errors);
      if (value.body.inertiaKgM2 !== undefined) {
        validateVec3(value.body.inertiaKgM2, `${path}.body.inertiaKgM2`, errors);
      }
    }
  }

  if (value.solver !== undefined) {
    if (!isRecord(value.solver)) {
      errors.push(`${path}.solver must be an object`);
    } else {
      if (!isFiniteNumber(value.solver.totalMassKg) || value.solver.totalMassKg <= 0) {
        errors.push(`${path}.solver.totalMassKg must be greater than 0`);
      }
      if (!Number.isInteger(value.solver.physicsSubsteps)
        || (value.solver.physicsSubsteps as number) < 1) {
        errors.push(`${path}.solver.physicsSubsteps must be a positive integer`);
      }
      if (!isFiniteNumber(value.solver.internalHz) || value.solver.internalHz <= 0) {
        errors.push(`${path}.solver.internalHz must be greater than 0`);
      }
      if (typeof value.solver.ccdEnabled !== 'boolean') {
        errors.push(`${path}.solver.ccdEnabled must be boolean`);
      }
    }
  }

  if (value.wheelContacts !== undefined) {
    if (!Array.isArray(value.wheelContacts)) {
      errors.push(`${path}.wheelContacts must be an array`);
    } else {
      value.wheelContacts.forEach((contact, index) => {
        const contactPath = `${path}.wheelContacts[${index}]`;
        if (!isRecord(contact)) {
          errors.push(`${contactPath} must be an object`);
          return;
        }
        if (!SKATE_WHEEL_IDS.includes(contact.wheel as SkateWheelId)) {
          errors.push(`${contactPath}.wheel must identify a board wheel`);
        }
        if (typeof contact.grounded !== 'boolean') {
          errors.push(`${contactPath}.grounded must be boolean`);
        }
        if (contact.point !== undefined) validateVec3(contact.point, `${contactPath}.point`, errors);
        if (contact.normal !== undefined) validateVec3(contact.normal, `${contactPath}.normal`, errors);
        for (const field of ['normalLoadN', 'suspensionCompressionM'] as const) {
          if (!isFiniteNumber(contact[field]) || contact[field] < 0) {
            errors.push(`${contactPath}.${field} must be non-negative`);
          }
        }
        for (const field of ['longitudinalSlipMps', 'lateralSlipMps'] as const) {
          if (!isFiniteNumber(contact[field])) {
            errors.push(`${contactPath}.${field} must be a finite number`);
          }
        }
      });
    }
  }

  if (value.contactImpulses !== undefined) {
    if (!isRecord(value.contactImpulses)) {
      errors.push(`${path}.contactImpulses must be an object`);
    } else {
      for (const field of ['totalNs', 'supportNs', 'impactNs'] as const) {
        if (!isFiniteNumber(value.contactImpulses[field]) || value.contactImpulses[field] < 0) {
          errors.push(`${path}.contactImpulses.${field} must be non-negative`);
        }
      }
    }
  }

  if (value.assists !== undefined) {
    if (!Array.isArray(value.assists)) {
      errors.push(`${path}.assists must be an array`);
    } else {
      value.assists.forEach((assist, index) => {
        const assistPath = `${path}.assists[${index}]`;
        if (!isRecord(assist)) {
          errors.push(`${assistPath} must be an object`);
          return;
        }
        if (!SKATE_ASSIST_KINDS.includes(assist.kind as SkateAssistKind)) {
          errors.push(`${assistPath}.kind is not supported`);
        }
        if (typeof assist.active !== 'boolean') errors.push(`${assistPath}.active must be boolean`);
        if (!isFiniteNumber(assist.strength) || assist.strength < 0 || assist.strength > 1) {
          errors.push(`${assistPath}.strength must be in [0,1]`);
        }
        if (assist.forceN !== undefined) validateVec3(assist.forceN, `${assistPath}.forceN`, errors);
        if (assist.torqueNm !== undefined) validateVec3(assist.torqueNm, `${assistPath}.torqueNm`, errors);
        if (assist.impulseNs !== undefined) validateVec3(assist.impulseNs, `${assistPath}.impulseNs`, errors);
        if (assist.torqueImpulseNms !== undefined) {
          validateVec3(assist.torqueImpulseNms, `${assistPath}.torqueImpulseNms`, errors);
        }
        if (assist.reason !== undefined && typeof assist.reason !== 'string') {
          errors.push(`${assistPath}.reason must be a string`);
        }
      });
    }
  }
}

/** Runtime validation for imported diagnostic control traces. */
export function validateControlTrace(value: unknown): ControlTraceValidationResult {
  if (!isRecord(value)) {
    return { ok: false, version: null, errors: ['control trace must be an object'] };
  }

  const trace = value;
  const version = trace.version === CONTROL_TRACE_VERSION || trace.version === CONTROL_TRACE_V3_VERSION
    ? trace.version
    : null;
  const errors: string[] = [];
  if (version === null) errors.push('version must be 2 or 3');
  validateInputProfile(trace.profile, 'profile', errors);
  if (!Array.isArray(trace.events)) {
    errors.push('events must be an array');
  } else {
    trace.events.forEach((event, index) => {
      if (!isRecord(event)) {
        errors.push(`events[${index}] must be an object`);
        return;
      }
      if (!CONTROL_TRACE_EVENT_KINDS.includes(event.kind as typeof CONTROL_TRACE_EVENT_KINDS[number])) {
        errors.push(`events[${index}].kind is not supported`);
        return;
      }
      if (!Number.isInteger(event.step) || (event.step as number) < 0) {
        errors.push(`events[${index}].step must be a non-negative integer`);
      }
      const path = `events[${index}]`;
      switch (event.kind) {
        case 'contact': {
          const frame = validateContactFrame(event.frame);
          for (const error of frame.errors) errors.push(`${path}.frame.${error}`);
          break;
        }
        case 'control': {
          if (!Array.isArray(event.samples)) {
            errors.push(`${path}.samples must be an array`);
          } else {
            event.samples.forEach((sample, sampleIndex) => {
              validateFeetSample(sample, `${path}.samples[${sampleIndex}]`, errors);
            });
          }
          validateFeet(event.feet, `${path}.feet`, errors);
          if (!Array.isArray(event.clickEdges)) {
            errors.push(`${path}.clickEdges must be an array`);
          } else {
            event.clickEdges.forEach((edge, edgeIndex) => {
              validateClickEdge(edge, `${path}.clickEdges[${edgeIndex}]`, errors);
            });
          }
          validatePhase(event.recognizerPhase, `${path}.recognizerPhase`, errors);
          validateIntent(event.intent, `${path}.intent`, errors);
          break;
        }
        case 'intent':
          if (event.intent === null || event.intent === undefined) {
            errors.push(`${path}.intent must be an object`);
          } else {
            validateIntent(event.intent, `${path}.intent`, errors);
          }
          break;
        case 'sim':
          validateBoard(event.board, `${path}.board`, errors);
          validatePhase(event.phase, `${path}.phase`, errors);
          validateIntent(event.intent, `${path}.intent`, errors);
          break;
        case 'render':
          if (!isFiniteNumber(event.tPerfMs)) errors.push(`${path}.tPerfMs must be a finite number`);
          if (!isFiniteNumber(event.frameMs) || event.frameMs < 0) {
            errors.push(`${path}.frameMs must be a non-negative finite number`);
          }
          if (event.camera !== undefined) {
            if (!isRecord(event.camera)) {
              errors.push(`${path}.camera must be an object`);
            } else {
              validateVec3(event.camera.p, `${path}.camera.p`, errors);
              validateVec3(event.camera.target, `${path}.camera.target`, errors);
            }
          }
          break;
        case 'outcome':
          if (!['trickCompleted', 'bail', 'grindCompleted', 'grindExit', 'respawn'].includes(event.type as string)) {
            errors.push(`${path}.type is not supported`);
          }
          if (!isRecord(event.payload)) errors.push(`${path}.payload must be an object`);
          break;
      }
      if (version === CONTROL_TRACE_V3_VERSION
        && event.kind === 'sim'
        && event.physics !== undefined) {
        validatePhysicsObservation(event.physics, `events[${index}].physics`, errors);
      }
    });
  }

  return { ok: errors.length === 0, version, errors };
}
