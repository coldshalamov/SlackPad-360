import { describe, expect, it } from 'vitest';
import { DEFAULT_TRICK_REGISTRY, TrickRegistry } from '../src/control/TrickRegistry';
import { TrickIntentResolver } from '../src/control/TrickIntentResolver';

describe('TrickIntentResolver', () => {
  it('ships a 350 ms initial recognition window at the 120 Hz control timeline', () => {
    const resolver = new TrickIntentResolver(DEFAULT_TRICK_REGISTRY);
    resolver.beginPop({ step: 120, popSide: 'tail', strength: 0.8 });

    expect(resolver.offerAirGesture({
      gesture: 'kickflip',
      step: 162,
      confidence: 0.6,
      intensity: 0.7,
    })).toMatchObject({ accepted: true, intent: { label: 'kickflip' } });
  });

  it('rejects an unbounded airborne-action configuration', () => {
    expect(() => new TrickIntentResolver(DEFAULT_TRICK_REGISTRY, {
      maxAirActions: 99,
    })).toThrow(/maxAirActions must be an integer from 1 to 4/i);
  });

  it('turns a tail or nose tap into a deterministic base-pop fallback intent', () => {
    const resolver = new TrickIntentResolver(DEFAULT_TRICK_REGISTRY, {
      recognitionWindowSteps: 42,
      maxAirActions: 3,
      minConfidence: 0.6,
    });

    expect(resolver.beginPop({ step: 120, popSide: 'tail', strength: 0.75 })).toMatchObject({
      version: 1,
      attemptId: '120:ollie',
      base: 'ollie',
      label: 'ollie',
      family: 'ollie',
      popSide: 'tail',
      popStrength: 0.75,
      gestureSequence: [],
      fallback: true,
      source: { popStep: 120, recognizedStep: null },
    });

    expect(resolver.beginPop({ step: 200, popSide: 'nose', strength: 2 })).toMatchObject({
      attemptId: '200:nollie',
      base: 'nollie',
      label: 'nollie',
      popSide: 'nose',
      popStrength: 1,
    });
  });

  it.each([
    ['kickflip', 'flip'],
    ['heelflip', 'flip'],
    ['fs-shuv', 'shuv'],
    ['bs-shuv', 'shuv'],
  ] as const)('resolves a confident in-window %s gesture to high-level intent', (gesture, family) => {
    const resolver = new TrickIntentResolver(DEFAULT_TRICK_REGISTRY, {
      recognitionWindowSteps: 42,
      maxAirActions: 3,
      minConfidence: 0.6,
    });
    resolver.beginPop({ step: 120, popSide: 'tail', strength: 0.75 });

    const update = resolver.offerAirGesture({
      gesture,
      step: 126,
      confidence: 0.82,
      intensity: 0.7,
    });

    expect(update).toMatchObject({
      accepted: true,
      reason: 'accepted',
      intent: {
        base: 'ollie',
        label: gesture,
        family,
        fallback: false,
        gestureSequence: [{ gesture, step: 126, confidence: 0.82, intensity: 0.7 }],
        source: { popStep: 120, recognizedStep: 126 },
      },
    });
    expect(update.intent).not.toHaveProperty('pose');
    expect(update.intent).not.toHaveProperty('force');
    expect(update.intent).not.toHaveProperty('torque');
  });

  it.each([
    [{ gesture: 'kickflip', step: 126, confidence: 0.59, intensity: 1 }, 'below-confidence'],
    [{ gesture: 'kickflip', step: 163, confidence: 1, intensity: 1 }, 'outside-window'],
  ] as const)('keeps the base pop fallback when an air gesture is rejected: %s', (gesture, reason) => {
    const resolver = new TrickIntentResolver(DEFAULT_TRICK_REGISTRY, {
      recognitionWindowSteps: 42,
      maxAirActions: 3,
      minConfidence: 0.6,
    });
    resolver.beginPop({ step: 120, popSide: 'tail', strength: 0.75 });

    expect(resolver.offerAirGesture(gesture)).toMatchObject({
      accepted: false,
      reason,
      intent: {
        label: 'ollie',
        fallback: true,
        gestureSequence: [],
        source: { recognizedStep: null },
      },
    });
  });

  it('extends an airborne gesture sequence through a later data-only trick definition', () => {
    const registry = new TrickRegistry([
      ...DEFAULT_TRICK_REGISTRY.definitions(),
      {
        id: 'varial-kickflip',
        family: 'combo',
        bases: ['ollie', 'nollie'],
        gestures: ['bs-shuv', 'kickflip'],
        rotations: [
          { axis: 'yaw', turns: 0.5 },
          { axis: 'roll', turns: 1 },
        ],
      },
    ] as const);
    const resolver = new TrickIntentResolver(registry, {
      recognitionWindowSteps: 42,
      maxAirActions: 3,
      minConfidence: 0.6,
    });
    resolver.beginPop({ step: 120, popSide: 'tail', strength: 0.8 });

    expect(resolver.offerAirGesture({
      gesture: 'bs-shuv',
      step: 126,
      confidence: 0.8,
      intensity: 0.75,
    }).intent?.label).toBe('bs-shuv');

    expect(resolver.offerAirGesture({
      gesture: 'kickflip',
      step: 132,
      confidence: 0.85,
      intensity: 0.9,
    })).toMatchObject({
      accepted: true,
      intent: {
        label: 'varial-kickflip',
        family: 'combo',
        fallback: false,
        gestureSequence: [{ gesture: 'bs-shuv' }, { gesture: 'kickflip' }],
        rotations: [
          { axis: 'yaw', turns: 0.5 },
          { axis: 'roll', turns: 1 },
        ],
        source: { recognizedStep: 132 },
      },
    });
  });

  it('keeps accepting registered combo actions after the initial trick window while airborne', () => {
    const registry = new TrickRegistry([
      ...DEFAULT_TRICK_REGISTRY.definitions(),
      {
        id: 'varial-kickflip',
        family: 'combo',
        bases: ['ollie', 'nollie'],
        gestures: ['bs-shuv', 'kickflip'],
        rotations: [
          { axis: 'yaw', turns: 0.5 },
          { axis: 'roll', turns: 1 },
        ],
      },
    ] as const);
    const resolver = new TrickIntentResolver(registry);
    resolver.beginPop({ step: 120, popSide: 'tail', strength: 0.8 });
    resolver.offerAirGesture({ gesture: 'bs-shuv', step: 126, confidence: 0.8, intensity: 0.75 });

    expect(resolver.offerAirGesture({
      gesture: 'kickflip',
      step: 180,
      confidence: 0.85,
      intensity: 0.9,
    })).toMatchObject({ accepted: true, intent: { label: 'varial-kickflip' } });
  });

  it('stops accepting trick input when landing prediction closes the air-action window', () => {
    const resolver = new TrickIntentResolver(DEFAULT_TRICK_REGISTRY);
    resolver.beginPop({ step: 120, popSide: 'tail', strength: 0.8 });
    resolver.closeAirActions();

    expect(resolver.offerAirGesture({
      gesture: 'kickflip',
      step: 126,
      confidence: 0.8,
      intensity: 0.75,
    })).toMatchObject({
      accepted: false,
      reason: 'air-window-closed',
      intent: { label: 'ollie', fallback: true, gestureSequence: [] },
    });
  });

  it('bounds airborne combo input without erasing the last recognized trick', () => {
    const registry = new TrickRegistry([
      ...DEFAULT_TRICK_REGISTRY.definitions(),
      {
        id: 'varial-kickflip',
        family: 'combo',
        bases: ['ollie', 'nollie'],
        gestures: ['bs-shuv', 'kickflip'],
        rotations: [
          { axis: 'yaw', turns: 0.5 },
          { axis: 'roll', turns: 1 },
        ],
      },
    ] as const);
    const resolver = new TrickIntentResolver(registry, {
      recognitionWindowSteps: 42,
      maxAirActions: 1,
      minConfidence: 0.6,
    });
    resolver.beginPop({ step: 120, popSide: 'tail', strength: 0.8 });
    resolver.offerAirGesture({ gesture: 'bs-shuv', step: 126, confidence: 0.8, intensity: 0.75 });

    expect(resolver.offerAirGesture({
      gesture: 'kickflip',
      step: 132,
      confidence: 0.85,
      intensity: 0.9,
    })).toMatchObject({
      accepted: false,
      reason: 'sequence-limit',
      intent: {
        label: 'bs-shuv',
        gestureSequence: [{ gesture: 'bs-shuv' }],
      },
    });
  });
});
