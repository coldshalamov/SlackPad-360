import { describe, expect, it } from 'vitest';
import { DEFAULT_TRICK_REGISTRY, TrickRegistry } from '../src/control/TrickRegistry';

describe('Skate trick registry', () => {
  it('seeds the six core Skate-style maneuvers as data', () => {
    expect(DEFAULT_TRICK_REGISTRY.definitions().map((definition) => definition.id)).toEqual([
      'ollie',
      'nollie',
      'kickflip',
      'heelflip',
      'fs-shuv',
      'bs-shuv',
    ]);

    expect(DEFAULT_TRICK_REGISTRY.get('kickflip')).toMatchObject({
      family: 'flip',
      bases: ['ollie', 'nollie'],
      gestures: ['kickflip'],
      rotations: [{ axis: 'roll', turns: 1 }],
    });
    expect(DEFAULT_TRICK_REGISTRY.get('fs-shuv')).toMatchObject({
      family: 'shuv',
      rotations: [{ axis: 'yaw', turns: -0.5 }],
    });
  });

  it('rejects duplicate trick identifiers instead of silently changing intent', () => {
    const duplicate = {
      id: 'ollie',
      family: 'ollie',
      bases: ['ollie'],
      gestures: [],
      rotations: [],
    } as const;

    expect(() => new TrickRegistry([duplicate, duplicate])).toThrow(/duplicate trick id: ollie/i);
  });

  it('rejects two labels for the same base and gesture sequence', () => {
    const shared = {
      family: 'flip',
      bases: ['ollie'],
      gestures: ['kickflip'],
      rotations: [{ axis: 'roll', turns: 1 }],
    } as const;

    expect(() => new TrickRegistry([
      { ...shared, id: 'kickflip-a' },
      { ...shared, id: 'kickflip-b' },
    ])).toThrow(/ambiguous trick sequence: ollie: kickflip/i);
  });

  it('bounds data-defined combos to four semantic airborne actions', () => {
    expect(() => new TrickRegistry([{
      id: 'unbounded-combo',
      family: 'combo',
      bases: ['ollie'],
      gestures: ['a', 'b', 'c', 'd', 'e'],
      rotations: [],
    }] as const)).toThrow(/at most 4 gestures/i);
  });
});
