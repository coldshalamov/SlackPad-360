import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SIM_CONFIG,
  normalizeInputProfile,
  validateControlTrace,
} from '@slackpad/shared';
import { AirGestureClassifier } from '../src/control/AirGestureClassifier';

const DT = 1 / DEFAULT_SIM_CONFIG.physics.hz;

function feed(
  classifier: AirGestureClassifier,
  velocities: Array<{ x: number; y: number }>,
): ReturnType<AirGestureClassifier['update']> {
  let result: ReturnType<AirGestureClassifier['update']> = null;
  for (let i = 0; i < velocities.length; i++) {
    result = classifier.update({
      step: i + 1,
      dt: DT,
      nose: { planted: false, vel: { x: 0, y: 0 } },
      tail: { planted: true, vel: velocities[i]! },
    });
  }
  return result;
}

function arc(speed: number, turnRad: number, count: number): Array<{ x: number; y: number }> {
  return Array.from({ length: count }, (_, i) => {
    const angle = turnRad * (i / (count - 1));
    return { x: speed * Math.cos(angle), y: speed * Math.sin(angle) };
  });
}

describe('player-facing flick sensitivity', () => {
  it('defaults to 1 and clamps persisted values to the supported range', () => {
    expect(normalizeInputProfile({}).flickSensitivity).toBe(1);
    expect(normalizeInputProfile({ flickSensitivity: 0.1 }).flickSensitivity).toBe(0.6);
    expect(normalizeInputProfile({ flickSensitivity: 9 }).flickSensitivity).toBe(1.6);
    expect(normalizeInputProfile({ flickSensitivity: Number.NaN }).flickSensitivity).toBe(1);
  });

  it('keeps legacy traces readable but rejects an out-of-range recorded gain', () => {
    const legacyProfile = { ...normalizeInputProfile({}) };
    delete legacyProfile.flickSensitivity;
    expect(validateControlTrace({ version: 2, profile: legacyProfile, events: [] }).ok).toBe(true);

    const result = validateControlTrace({
      version: 2,
      profile: { ...legacyProfile, flickSensitivity: 2 },
      events: [],
    });
    expect(result.ok).toBe(false);
    expect(result.errors).toContain('profile.flickSensitivity must be between 0.6 and 1.6');
  });

  it('changes whether the same borderline physical flick clears recognition', () => {
    const low = new AirGestureClassifier(DEFAULT_SIM_CONFIG, 'regular', undefined, 0.6);
    const high = new AirGestureClassifier(DEFAULT_SIM_CONFIG, 'regular', undefined, 1.6);
    const sameMotion = Array.from({ length: 5 }, () => ({ x: 0, y: 0.7 }));

    expect(feed(low, sameMotion)).toBeNull();
    expect(feed(high, sameMotion)).toMatchObject({ kind: 'flip', label: 'kickflip' });
  });

  it('scales sweep evidence as well as straight-flick velocity', () => {
    const low = new AirGestureClassifier(DEFAULT_SIM_CONFIG, 'regular', undefined, 0.6);
    const high = new AirGestureClassifier(DEFAULT_SIM_CONFIG, 'regular', undefined, 1.6);
    const sameMotion = arc(2, 0.45, 6);

    expect(feed(low, sameMotion)).toBeNull();
    expect(feed(high, sameMotion)).toMatchObject({ kind: 'shuv' });
  });
});
