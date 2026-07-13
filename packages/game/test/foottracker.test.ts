/**
 * FootTracker unit tests (M3): binding, stance, swap, sticky ids, proximity
 * rebind, dual-lift ballistic clear, >2 contact clamp, palm rejection, and the
 * KEY padYawOffset camera-invariance test.
 */
import { describe, expect, it } from 'vitest';
import { DEFAULT_SIM_CONFIG } from '@slackpad/shared';
import type { Contact, ContactFrame, InputProfile } from '@slackpad/shared';
import { FootTracker, rotateAboutCenter } from '../src/input/FootTracker';
import { Telemetry } from '../src/telemetry/Telemetry';

const FT = DEFAULT_SIM_CONFIG.footTracker;
const EPS = DEFAULT_SIM_CONFIG.recognition.plantSpeedEps;

type Prof = Pick<InputProfile, 'stance' | 'padYawOffset' | 'swapFeet'>;

function tracker(profile: Partial<Prof> = {}, telemetry?: Telemetry): FootTracker {
  return new FootTracker(
    FT,
    EPS,
    { stance: 'regular', padYawOffset: 0, swapFeet: false, ...profile },
    telemetry,
  );
}

function c(id: number, x: number, y: number, tip = true, confidence = true): Contact {
  return { id, x, y, tip, confidence };
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

describe('FootTracker binding + stance', () => {
  it('regular right-hand stance maps pad-left index to tail and pad-right middle to nose', () => {
    const t = tracker({ stance: 'regular' });
    const s = t.update([frame(0, [c(1, 0.4, 0.5), c(2, 0.6, 0.5)])], 0);
    expect(s.bothPlanted).toBe(true);
    expect(s.tail.contactId).toBe(1); // x=0.4 = index/back foot/tail
    expect(s.nose.contactId).toBe(2); // x=0.6 = middle/front foot/nose
  });

  it('goofy inverts nose/tail binding', () => {
    const t = tracker({ stance: 'goofy' });
    const s = t.update([frame(0, [c(1, 0.4, 0.5), c(2, 0.6, 0.5)])], 0);
    expect(s.nose.contactId).toBe(1);
    expect(s.tail.contactId).toBe(2);
  });

  it('swapFeet inverts which contact is padLeft', () => {
    const t = tracker({ stance: 'regular', swapFeet: true });
    const s = t.update([frame(0, [c(1, 0.4, 0.5), c(2, 0.6, 0.5)])], 0);
    expect(s.nose.contactId).toBe(1);
    expect(s.tail.contactId).toBe(2);
  });

  it('sticky ids: bindings survive contacts crossing in x', () => {
    const t = tracker();
    t.update([frame(0, [c(1, 0.4, 0.5), c(2, 0.6, 0.5)])], 0); // tail=1, nose=2
    // Swap positions: id1 now larger x than id2. Sticky → roles unchanged.
    const s = t.update([frame(8, [c(1, 0.7, 0.5), c(2, 0.3, 0.5)])], 1);
    expect(s.tail.contactId).toBe(1);
    expect(s.nose.contactId).toBe(2);
    expect(s.tail.pos.x).toBeCloseTo(0.7, 6);
  });
});

describe('FootTracker rebind + lift', () => {
  it('re-plant after dual lift rebinds by proximity, not provisional', () => {
    const tel = new Telemetry();
    const t = tracker({}, tel);
    t.update([frame(0, [c(1, 0.3, 0.5), c(2, 0.7, 0.5)])], 0); // tail=1@0.3, nose=2@0.7
    t.update([frame(8, [])], 1); // dual lift → held, memory retained
    // A single NEW id near the OLD TAIL position must bind to TAIL by proximity.
    const s = t.update([frame(16, [c(3, 0.32, 0.5)])], 2);
    expect(s.tail.planted).toBe(true);
    expect(s.tail.contactId).toBe(3);
    expect(s.nose.planted).toBe(false);
    expect(tel.count('footRebind')).toBeGreaterThan(0);
  });

  it('single-foot lift frees only that role; other stays sticky', () => {
    const t = tracker();
    t.update([frame(0, [c(1, 0.4, 0.5), c(2, 0.6, 0.5)])], 0);
    const s = t.update([frame(8, [c(1, 0.4, 0.5)])], 1); // id2 (nose) lifted
    expect(s.tail.planted).toBe(true);
    expect(s.tail.contactId).toBe(1);
    expect(s.nose.planted).toBe(false);
    expect(s.plantCount).toBe(1);
  });

  it('dual lift reports immediately while retaining identity memory internally', () => {
    const t = tracker();
    t.update([frame(0, [c(1, 0.4, 0.5), c(2, 0.6, 0.5)])], 0);
    // Visual/control state must match the hardware frame immediately.
    t.update([frame(8, [])], 1);
    const lifted = t.update([frame(16, [])], 2);
    expect(lifted.bothPlanted).toBe(false);
    expect(lifted.plantCount).toBe(0);

    // Feed empty frames past ballisticPredictMs (200 ms) → cleared.
    let tp = 16;
    let s = lifted;
    for (let i = 0; i < 40; i++) {
      tp += 8;
      s = t.update([frame(tp, [])], 3 + i);
    }
    expect(s.bothPlanted).toBe(false);
    expect(s.plantCount).toBe(0);
  });
});

describe('FootTracker robustness', () => {
  it('clamps to two gameplay feet when >2 contacts arrive (logs a drop)', () => {
    const tel = new Telemetry();
    const t = tracker({}, tel);
    const s = t.update([frame(0, [c(1, 0.3, 0.5), c(2, 0.5, 0.5), c(3, 0.7, 0.5)])], 0);
    expect(s.plantCount).toBe(2);
    const drops = tel
      .snapshot()
      .events.filter((e) => e.type === 'footRebind' && (e as { reason?: string }).reason === 'overflow-drop');
    expect(drops.length).toBeGreaterThan(0);
  });

  it('ignores palm contacts (confidence=false)', () => {
    const t = tracker();
    const s = t.update([frame(0, [c(1, 0.4, 0.5), c(2, 0.6, 0.5, true, false)])], 0);
    expect(s.plantCount).toBe(1); // only the confident contact became a foot
  });

  it('never binds more than two logical feet', () => {
    const t = tracker();
    const s = t.update([frame(0, [c(1, 0.2, 0.5), c(2, 0.4, 0.5), c(3, 0.6, 0.5), c(4, 0.8, 0.5)])], 0);
    expect(s.plantCount).toBeLessThanOrEqual(2);
  });
});

describe('FootTracker padYawOffset camera invariance (KEY)', () => {
  it('a stream rotated by θ with padYawOffset=θ matches the unrotated stream with padYawOffset=0', () => {
    const theta = 25; // degrees
    // Raw contact pairs over frames: rotate + spread + drift near pad center.
    const raw: Array<[Contact, Contact]> = [];
    for (let k = 0; k < 10; k++) {
      const ang = (k * 3 * Math.PI) / 180; // segment slowly rotates
      const half = 0.15 + k * 0.003; // spread grows (lengthRatio changes)
      const mx = 0.5 + k * 0.004; // midpoint drifts (midpointVel)
      const my = 0.5;
      const nx = mx + Math.cos(ang) * half;
      const ny = my + Math.sin(ang) * half;
      const tx = mx - Math.cos(ang) * half;
      const ty = my - Math.sin(ang) * half;
      raw.push([c(1, nx, ny), c(2, tx, ty)]);
    }

    const plain = tracker({ padYawOffset: 0 });
    const rotated = tracker({ padYawOffset: theta });

    let plainState = plain.update([frame(0, raw[0]!)], 0);
    let rotState = rotated.update([frame(0, rotatePair(raw[0]!, theta))], 0);
    for (let k = 1; k < raw.length; k++) {
      plainState = plain.update([frame(k * 8, raw[k]!)], k);
      rotState = rotated.update([frame(k * 8, rotatePair(raw[k]!, theta))], k);
    }

    const tol = 1e-6;
    expect(rotState.segment.angle).toBeCloseTo(plainState.segment.angle, 6);
    expect(rotState.segment.angleFromRest).toBeCloseTo(plainState.segment.angleFromRest, 6);
    expect(rotState.segment.angVel).toBeCloseTo(plainState.segment.angVel, 6);
    expect(rotState.segment.lengthRatio).toBeCloseTo(plainState.segment.lengthRatio, 6);
    expect(rotState.segment.midpointOffsetFromRest.x).toBeCloseTo(plainState.segment.midpointOffsetFromRest.x, 6);
    expect(rotState.segment.midpointOffsetFromRest.y).toBeCloseTo(plainState.segment.midpointOffsetFromRest.y, 6);
    expect(rotState.segment.midpointVel.x).toBeCloseTo(plainState.segment.midpointVel.x, 6);
    expect(rotState.segment.midpointVel.y).toBeCloseTo(plainState.segment.midpointVel.y, 6);
    expect(rotState.nose.offsetFromRest.x).toBeCloseTo(plainState.nose.offsetFromRest.x, 6);
    expect(rotState.nose.offsetFromRest.y).toBeCloseTo(plainState.nose.offsetFromRest.y, 6);
    expect(rotState.tail.offsetFromRest.x).toBeCloseTo(plainState.tail.offsetFromRest.x, 6);
    // Sanity: the stream actually produced non-trivial rotation.
    expect(Math.abs(plainState.segment.angleFromRest)).toBeGreaterThan(0.1);
    void tol;
  });
});

function rotatePair(pair: [Contact, Contact], deg: number): [Contact, Contact] {
  return pair.map((p) => {
    const r = rotateAboutCenter(p.x, p.y, deg);
    return { ...p, x: r.x, y: r.y };
  }) as [Contact, Contact];
}
