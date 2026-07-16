import { MAX_TRICK_GESTURES } from './TrickRegistry';
import type {
  BasePop,
  IntentRotation,
  TrickDefinition,
  TrickFamily,
  TrickRegistry,
} from './TrickRegistry';

export interface TrickResolverOptions {
  /** Fixed-simulation steps after pop in which gesture actions are accepted. */
  recognitionWindowSteps: number;
  /** Overall airborne sequence window; the gameplay phase may close it earlier. */
  airborneSequenceWindowSteps: number;
  /** Hard cap for semantic gesture actions in one airtime. */
  maxAirActions: number;
  minConfidence: number;
}

export const DEFAULT_TRICK_RESOLVER_OPTIONS: Readonly<TrickResolverOptions> = Object.freeze({
  // 350 ms on the 120 Hz semantic input timeline.
  recognitionWindowSteps: 42,
  // Safety bound for unusually long transition air; landing logic closes sooner.
  airborneSequenceWindowSteps: 240,
  maxAirActions: 3,
  minConfidence: 0.6,
});

export const MAX_AIR_ACTIONS = MAX_TRICK_GESTURES;

export interface BeginPopInput {
  step: number;
  popSide: 'tail' | 'nose';
  /** Normalized input intent, not a physical impulse. */
  strength: number;
}

export interface AirGestureIntentInput<Gesture extends string = string> {
  gesture: Gesture;
  step: number;
  confidence: number;
  intensity: number;
}

export type GestureResolutionReason =
  | 'accepted'
  | 'no-active-pop'
  | 'air-window-closed'
  | 'below-confidence'
  | 'outside-window'
  | 'sequence-limit'
  | 'sequence-not-registered';

export interface ResolvedGesture<Gesture extends string = string> {
  gesture: Gesture;
  step: number;
  confidence: number;
  intensity: number;
}

export interface ResolvedTrickIntent<Id extends string = string, Gesture extends string = string> {
  version: 1;
  attemptId: string;
  base: BasePop;
  label: Id | BasePop;
  family: TrickFamily;
  /** Requested semantic rotations; maneuver code decides the bounded envelope. */
  rotations: readonly IntentRotation[];
  popSide: 'tail' | 'nose';
  popStrength: number;
  gestureSequence: readonly ResolvedGesture<Gesture>[];
  fallback: boolean;
  source: { popStep: number; recognizedStep: number | null };
}

export interface GestureResolutionUpdate<Id extends string = string, Gesture extends string = string> {
  accepted: boolean;
  reason: GestureResolutionReason;
  intent: ResolvedTrickIntent<Id, Gesture> | null;
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return value < 0 ? 0 : value > 1 ? 1 : value;
}

function baseForSide(side: BeginPopInput['popSide']): BasePop {
  return side === 'tail' ? 'ollie' : 'nollie';
}

export class TrickIntentResolver<Id extends string, Gesture extends string> {
  #intent: ResolvedTrickIntent<Id, Gesture> | null = null;
  #airActionsOpen = false;
  readonly #options: TrickResolverOptions;

  constructor(
    private readonly registry: TrickRegistry<Id, Gesture>,
    options: Partial<TrickResolverOptions> = {},
  ) {
    this.#options = { ...DEFAULT_TRICK_RESOLVER_OPTIONS, ...options };
    if (
      !Number.isInteger(this.#options.maxAirActions) ||
      this.#options.maxAirActions < 1 ||
      this.#options.maxAirActions > MAX_AIR_ACTIONS
    ) {
      throw new RangeError(`maxAirActions must be an integer from 1 to ${MAX_AIR_ACTIONS}`);
    }
  }

  beginPop(input: BeginPopInput): ResolvedTrickIntent<Id, Gesture> {
    const base = baseForSide(input.popSide);
    const fallback = this.#baseDefinition(base);
    this.#intent = {
      version: 1,
      attemptId: `${input.step}:${base}`,
      base,
      label: fallback?.id ?? base,
      family: fallback?.family ?? 'ollie',
      rotations: fallback?.rotations.map((rotation) => ({ ...rotation })) ?? [],
      popSide: input.popSide,
      popStrength: clamp01(input.strength),
      gestureSequence: [],
      fallback: true,
      source: { popStep: input.step, recognizedStep: null },
    };
    this.#airActionsOpen = true;
    return this.current!;
  }

  /** Landing prediction calls this before the catch/landing guard begins. */
  closeAirActions(): void {
    this.#airActionsOpen = false;
  }

  offerAirGesture(
    input: AirGestureIntentInput<Gesture>,
  ): GestureResolutionUpdate<Id, Gesture> {
    if (!this.#intent) return { accepted: false, reason: 'no-active-pop', intent: null };
    if (!this.#airActionsOpen) {
      return { accepted: false, reason: 'air-window-closed', intent: this.current };
    }

    const confidence = clamp01(input.confidence);
    if (confidence < this.#options.minConfidence) {
      return { accepted: false, reason: 'below-confidence', intent: this.current };
    }
    const elapsedSteps = input.step - this.#intent.source.popStep;
    const windowSteps = this.#intent.gestureSequence.length === 0
      ? this.#options.recognitionWindowSteps
      : this.#options.airborneSequenceWindowSteps;
    if (elapsedSteps < 0 || elapsedSteps > windowSteps) {
      return { accepted: false, reason: 'outside-window', intent: this.current };
    }
    if (this.#intent.gestureSequence.length >= this.#options.maxAirActions) {
      return { accepted: false, reason: 'sequence-limit', intent: this.current };
    }

    const gesture: ResolvedGesture<Gesture> = {
      gesture: input.gesture,
      step: input.step,
      confidence,
      intensity: clamp01(input.intensity),
    };
    const sequence = [...this.#intent.gestureSequence, gesture];
    const definition = this.registry.definitions().find(
      (candidate) =>
        candidate.bases.includes(this.#intent!.base) &&
        candidate.gestures.length === sequence.length &&
        candidate.gestures.every((token, index) => token === sequence[index]!.gesture),
    );
    if (!definition) {
      return { accepted: false, reason: 'sequence-not-registered', intent: this.current };
    }

    this.#intent = {
      ...this.#intent,
      label: definition.id,
      family: definition.family,
      rotations: definition.rotations.map((rotation) => ({ ...rotation })),
      gestureSequence: sequence,
      fallback: false,
      source: { ...this.#intent.source, recognizedStep: input.step },
    };
    return { accepted: true, reason: 'accepted', intent: this.current };
  }

  get current(): ResolvedTrickIntent<Id, Gesture> | null {
    if (!this.#intent) return null;
    return {
      ...this.#intent,
      gestureSequence: this.#intent.gestureSequence.map((gesture) => ({ ...gesture })),
      rotations: this.#intent.rotations.map((rotation) => ({ ...rotation })),
      source: { ...this.#intent.source },
    };
  }

  #baseDefinition(base: BasePop): TrickDefinition<Id, Gesture> | undefined {
    return this.registry
      .definitions()
      .find((definition) => definition.gestures.length === 0 && definition.bases.includes(base));
  }
}
