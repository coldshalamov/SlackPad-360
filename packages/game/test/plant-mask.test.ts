/**
 * Plant-mask attribution (M3): on a primary rising edge, the KickEvent mask is
 * the nose/tail plant state at that instant. The SAME physical contact set maps
 * to different masks under regular vs goofy stance (which contact is nose/tail
 * flips), so the truth table is exercised under both stances.
 */
import { describe, expect, it } from 'vitest';
import { DEFAULT_SIM_CONFIG } from '@slackpad/shared';
import type { Contact, ContactFrame, InputProfile } from '@slackpad/shared';
import { FootTracker } from '../src/input/FootTracker';
import type { PlantMask } from '../src/input/FootTracker';

const FT = DEFAULT_SIM_CONFIG.footTracker;
const EPS = DEFAULT_SIM_CONFIG.recognition.plantSpeedEps;

type Prof = Pick<InputProfile, 'stance' | 'padYawOffset' | 'swapFeet'>;

function tracker(stance: InputProfile['stance']): FootTracker {
  const p: Prof = { stance, padYawOffset: 0, swapFeet: false };
  return new FootTracker(FT, EPS, p);
}

function c(id: number, x: number, y: number, tip = true): Contact {
  return { id, x, y, tip, confidence: true };
}

let fid = 0;
function frame(tPerfMs: number, contacts: Contact[], primary = false): ContactFrame {
  return {
    schemaVersion: 1,
    frameId: fid++,
    tPerfMs,
    source: 'synthetic',
    contacts,
    buttons: { primary, secondary: false, auxiliary: false },
  };
}

const LEFT = 0.4;
const RIGHT = 0.6;

/** Bind both feet via dual plant, then click a given planted subset. */
function maskFor(stance: InputProfile['stance'], keep: 'both' | 'left' | 'right' | 'neither'): PlantMask {
  const t = tracker(stance);
  let tp = 0;
  t.update([frame(tp, [c(1, LEFT, 0.5), c(2, RIGHT, 0.5)])], 0); // dual plant binds roles
  tp += 8;
  const contacts: Contact[] =
    keep === 'both'
      ? [c(1, LEFT, 0.5), c(2, RIGHT, 0.5)]
      : keep === 'left'
        ? [c(1, LEFT, 0.5)]
        : keep === 'right'
          ? [c(2, RIGHT, 0.5)]
          : [];
  // Settle the plant subset first (no click), then click on the next frame so
  // 'neither' has cleared to zero-planted before the primary edge.
  t.update([frame(tp, contacts)], 1);
  tp += 8;
  const rising = t.update([frame(tp, contacts, true)], 2);
  void rising;
  const kicks = t.drainKicks();
  expect(kicks.length).toBe(1);
  return kicks[0]!.mask;
}

describe('plant-mask attribution truth table', () => {
  it('both feet planted + click → "both" (either stance)', () => {
    expect(maskFor('regular', 'both')).toBe('both');
    expect(maskFor('goofy', 'both')).toBe('both');
  });

  it('left contact alone flips role by stance', () => {
    // regular: padLeft = tail; goofy mirrors to nose.
    expect(maskFor('regular', 'left')).toBe('tail');
    expect(maskFor('goofy', 'left')).toBe('nose');
  });

  it('right contact alone flips role by stance', () => {
    // regular: padRight = nose; goofy mirrors to tail.
    expect(maskFor('regular', 'right')).toBe('nose');
    expect(maskFor('goofy', 'right')).toBe('tail');
  });

  it('no feet planted + click → "none"', () => {
    expect(maskFor('regular', 'neither')).toBe('none');
    expect(maskFor('goofy', 'neither')).toBe('none');
  });
});
