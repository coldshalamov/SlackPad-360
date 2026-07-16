/**
 * Data-only vocabulary between gesture recognition and maneuver execution.
 *
 * Definitions describe what the player asked for. They deliberately contain
 * no shoe pose, rigid-body handle, force, impulse, or torque tuning.
 */

export type BasePop = 'ollie' | 'nollie';
export type SeedAirGesture = 'kickflip' | 'heelflip' | 'fs-shuv' | 'bs-shuv';
export type SeedTrickId = BasePop | SeedAirGesture;
export type TrickFamily = 'ollie' | 'flip' | 'shuv' | 'combo';
export type IntentRotationAxis = 'roll' | 'yaw';
export const MAX_TRICK_GESTURES = 4;

export interface IntentRotation {
  axis: IntentRotationAxis;
  /** Signed revolutions requested by this trick. */
  turns: number;
}

export interface TrickDefinition<Id extends string = string, Gesture extends string = string> {
  id: Id;
  family: TrickFamily;
  bases: readonly BasePop[];
  /** Semantic recognizer outputs, ordered for multi-gesture air tricks. */
  gestures: readonly Gesture[];
  rotations: readonly IntentRotation[];
}

function copyDefinition<Id extends string, Gesture extends string>(
  definition: TrickDefinition<Id, Gesture>,
): TrickDefinition<Id, Gesture> {
  return {
    ...definition,
    bases: [...definition.bases],
    gestures: [...definition.gestures],
    rotations: definition.rotations.map((rotation) => ({ ...rotation })),
  };
}

export class TrickRegistry<Id extends string = string, Gesture extends string = string> {
  readonly #ordered: readonly TrickDefinition<Id, Gesture>[];
  readonly #byId: ReadonlyMap<Id, TrickDefinition<Id, Gesture>>;

  constructor(definitions: readonly TrickDefinition<Id, Gesture>[]) {
    const ids = new Set<Id>();
    const sequences = new Set<string>();
    for (const definition of definitions) {
      if (ids.has(definition.id)) throw new Error(`Duplicate trick id: ${definition.id}`);
      ids.add(definition.id);
      if (definition.gestures.length > MAX_TRICK_GESTURES) {
        throw new RangeError(`A trick may define at most ${MAX_TRICK_GESTURES} gestures`);
      }
      for (const base of definition.bases) {
        const key = JSON.stringify([base, ...definition.gestures]);
        if (sequences.has(key)) {
          throw new Error(`Ambiguous trick sequence: ${base}: ${definition.gestures.join(', ')}`);
        }
        sequences.add(key);
      }
    }
    this.#ordered = definitions.map(copyDefinition);
    this.#byId = new Map(this.#ordered.map((definition) => [definition.id, definition]));
  }

  definitions(): readonly TrickDefinition<Id, Gesture>[] {
    return this.#ordered.map(copyDefinition);
  }

  get(id: Id): TrickDefinition<Id, Gesture> | undefined {
    const definition = this.#byId.get(id);
    return definition ? copyDefinition(definition) : undefined;
  }
}

const CORE_TRICKS = [
  {
    id: 'ollie',
    family: 'ollie',
    bases: ['ollie'],
    gestures: [],
    rotations: [],
  },
  {
    id: 'nollie',
    family: 'ollie',
    bases: ['nollie'],
    gestures: [],
    rotations: [],
  },
  {
    id: 'kickflip',
    family: 'flip',
    bases: ['ollie', 'nollie'],
    gestures: ['kickflip'],
    rotations: [{ axis: 'roll', turns: 1 }],
  },
  {
    id: 'heelflip',
    family: 'flip',
    bases: ['ollie', 'nollie'],
    gestures: ['heelflip'],
    rotations: [{ axis: 'roll', turns: -1 }],
  },
  {
    id: 'fs-shuv',
    family: 'shuv',
    bases: ['ollie', 'nollie'],
    gestures: ['fs-shuv'],
    rotations: [{ axis: 'yaw', turns: -0.5 }],
  },
  {
    id: 'bs-shuv',
    family: 'shuv',
    bases: ['ollie', 'nollie'],
    gestures: ['bs-shuv'],
    rotations: [{ axis: 'yaw', turns: 0.5 }],
  },
] as const satisfies readonly TrickDefinition<SeedTrickId, SeedAirGesture>[];

export const DEFAULT_TRICK_REGISTRY = new TrickRegistry<SeedTrickId, SeedAirGesture>(CORE_TRICKS);
