/**
 * GT-malformed — a battery of malformed frames pushed through the real intake
 * path. Nothing throws, every malformed frame is rejected + counted in
 * telemetry, nothing is queued, and the sim still steps afterward.
 */
import { describe, expect, it } from 'vitest';
import { AgentHarness } from '../src/agent/AgentHarness';
import type { InjectableFrame } from '../src/agent/AgentHarness';
import type { ContactFrame } from '@slackpad/shared';
import { CONTACT_FRAME_SCHEMA_VERSION } from '@slackpad/shared';

/** A canonical valid frame to mutate into malformed variants. */
function base(): ContactFrame {
  return {
    schemaVersion: CONTACT_FRAME_SCHEMA_VERSION,
    frameId: 0,
    tPerfMs: 0,
    source: 'synthetic',
    contacts: [{ id: 1, tip: true, x: 0.5, y: 0.5, confidence: true }],
    buttons: { primary: false, secondary: false, auxiliary: false },
  };
}

// Cast helper: the tests intentionally push values that violate the type.
const bad = (v: unknown): ContactFrame => v as ContactFrame;

const MALFORMED: ContactFrame[] = [
  bad({ ...base(), schemaVersion: 2 }), // wrong schema version
  bad({ ...base(), contacts: [{ id: 1, tip: true, x: Number.NaN, y: 0.5, confidence: true }] }), // NaN coord
  bad({ ...base(), contacts: [{ id: 1, tip: true, x: 1.5, y: 0.5, confidence: true }] }), // x out of range
  bad({ ...base(), contacts: [{ id: 1, tip: true, x: 0.5, y: -0.2, confidence: true }] }), // y out of range
  bad({ ...base(), source: 'telepathy' }), // bad source
  bad({ schemaVersion: 1, frameId: 0, tPerfMs: 0, source: 'synthetic', contacts: [] }), // missing buttons
  bad({
    ...base(),
    contacts: Array.from({ length: 6 }, (_, i) => ({ id: i, tip: true, x: 0.5, y: 0.5, confidence: true })),
  }), // contacts > 5
  bad({ ...base(), frameId: -1 }), // negative frameId
  bad({ ...base(), tPerfMs: Number.NaN }), // NaN timestamp
  bad({ ...base(), contacts: 'nope' }), // contacts wrong type
  bad(42), // junk: number
  bad('frame'), // junk: string
  bad(null), // junk: null
  bad([1, 2, 3]), // junk: array
  bad({ ...base(), contacts: [{ id: 1, tip: 'yes', x: 0.5, y: 0.5, confidence: 'no' }] }), // wrong booleans
  // Hostile objects: property access itself throws. "NEVER throws" must hold
  // for these too — the intake boundary guards, not just field validation.
  bad(
    Object.defineProperty({ ...base() }, 'contacts', {
      get() {
        throw new Error('booby-trapped getter');
      },
    }),
  ),
  bad(
    new Proxy(base(), {
      get(target, prop, receiver) {
        if (prop === 'buttons') throw new Error('proxy trap');
        return Reflect.get(target, prop, receiver);
      },
    }),
  ),
];

describe('GT-malformed', () => {
  it('rejects every malformed frame without throwing, counts them, and keeps stepping', async () => {
    const harness = new AgentHarness();
    await harness.reset(1, 'flat-dev'); // clears telemetry for a clean count
    const hub = harness.getInputHub();
    const telemetry = harness.getTelemetry();

    expect(() => {
      for (const frame of MALFORMED) hub.push(frame);
    }).not.toThrow();

    // All rejected → none queued, reject count matches battery size.
    expect(hub.pendingCount()).toBe(0);
    expect(telemetry.count('frameRejected')).toBe(MALFORMED.length);
    expect(telemetry.count('frameAccepted')).toBe(0);

    // Malformed injection through the agent path is also rejected, never thrown.
    const before = telemetry.count('frameRejected');
    expect(() => {
      harness.injectContactFrame(
        bad({ ...base(), contacts: [{ id: 1, tip: true, x: Number.NaN, y: 0.5, confidence: true }] }) as InjectableFrame,
      );
    }).not.toThrow();
    expect(telemetry.count('frameRejected')).toBe(before + 1);
    expect(hub.pendingCount()).toBe(0);

    // Sim still advances deterministically after all the garbage.
    const startStep = harness.getStep();
    harness.step(10);
    expect(harness.getStep()).toBe(startStep + 10);
    const obs = harness.observe();
    expect(Number.isFinite(obs.board.p.y)).toBe(true);
  });

  it('a valid frame still passes after the malformed battery', async () => {
    const harness = new AgentHarness();
    await harness.reset(1, 'flat-dev');
    const hub = harness.getInputHub();
    for (const frame of MALFORMED) hub.push(frame);
    expect(hub.push(base())).toBe(true);
    expect(hub.pendingCount()).toBe(1);
    expect(hub.drainForStep()).toHaveLength(1);
  });
});
