import { describe, expect, it } from 'vitest';
import { DEFAULT_INPUT_PROFILE, DEFAULT_SIM_CONFIG, type ContactFrame } from '@slackpad/shared';
import { FootTracker } from '../src/input/FootTracker';

const contact = (id: number, x: number, y = 0.5) => ({
  id,
  x,
  y,
  tip: true,
  confidence: true,
});

function frame(
  frameId: number,
  tPerfMs: number,
  contacts: ContactFrame['contacts'],
  primary = false,
): ContactFrame {
  return {
    schemaVersion: 1,
    frameId,
    tPerfMs,
    contacts,
    buttons: { primary, secondary: false, auxiliary: false },
    source: 'agent',
  };
}

function tracker(): FootTracker {
  return new FootTracker(
    DEFAULT_SIM_CONFIG.footTracker,
    DEFAULT_SIM_CONFIG.recognition.plantSpeedEps,
    DEFAULT_INPUT_PROFILE,
  );
}

describe('125 Hz lift-and-retap acquisition', () => {
  it('preserves a two-report tail lift and replant inside one 60 Hz sim batch', () => {
    const t = tracker();
    t.update([
      frame(0, 0, [contact(1, 0.6), contact(2, 0.4)]),
      frame(1, 8, [contact(1, 0.6)]),
      frame(2, 16, [contact(1, 0.6)]),
      frame(3, 24, [contact(1, 0.6), contact(3, 0.4)]),
    ], 10);

    expect(t.drainKicks()).toEqual([
      expect.objectContaining({
        step: 10,
        source: 'motionTap',
        tapRole: 'tail',
        button: 'primary',
        mask: 'both',
        tapDurationMs: 16,
      }),
    ]);
  });

  it('rejects a one-report dropout and ignores physical click edges', () => {
    const t = tracker();
    t.update([
      frame(0, 0, [contact(1, 0.6), contact(2, 0.4)]),
      frame(1, 8, [contact(1, 0.6)]),
      frame(2, 16, [contact(1, 0.6), contact(3, 0.4)], true),
      frame(3, 24, [contact(1, 0.6), contact(3, 0.4)]),
    ], 11);

    expect(t.drainKicks()).toEqual([]);
  });

  it('rejects a replant far from the remembered foot socket', () => {
    const t = tracker();
    t.update([
      frame(0, 0, [contact(1, 0.6), contact(2, 0.4)]),
      frame(1, 8, [contact(1, 0.6)]),
      frame(2, 16, [contact(1, 0.6)]),
      frame(3, 24, [contact(1, 0.6), contact(3, 0.08, 0.9)]),
    ], 12);

    expect(t.drainKicks()).toEqual([]);
  });
});
