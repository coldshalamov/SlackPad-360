/**
 * G6 — Agent contract. The harness is inject-only: no pose/trick/impulse
 * shortcuts, observe() has exactly the ObserveState shape, reset is
 * deterministic, and injected frames carry source 'agent'.
 */
import { describe, expect, it } from 'vitest';
import { AgentHarness } from '../src/agent/AgentHarness';
import * as AgentModule from '../src/agent/AgentHarness';
import type { InjectableFrame } from '../src/agent/AgentHarness';
import { CONTACT_FRAME_SCHEMA_VERSION, DEFAULT_SIM_CONFIG } from '@slackpad/shared';

const FORBIDDEN = ['setBoardPose', 'forceTrick', 'applyImpulse'] as const;

/**
 * The complete public surface of AgentHarness. Anything beyond this list is a
 * contract regression — additions must be reviewed against G6 before landing.
 */
const HARNESS_ALLOWLIST = [
  'constructor',
  'init',
  'reset',
  'injectContactFrame',
  'releaseInputs',
  'step',
  'observe',
  'startRecording',
  'stopRecording',
  'replay',
  'log',
  'captureScreenshot',
  'setScreenshotProvider',
  'recordRenderSample',
  'getStep',
  'interpolatedRenderPose',
  'getTelemetry',
  'getInputHub',
];

const OBSERVE_KEYS = [
  'step',
  'seed',
  'board',
  'phase',
  'label',
  'intent',
  'assistLevel',
  'feet',
  'grind',
  'score',
  'lastFailReason',
  'inputSource',
];

function plantFrame(frameId: number, tPerfMs: number): InjectableFrame {
  // source deliberately omitted → must be stamped 'agent'.
  return {
    schemaVersion: CONTACT_FRAME_SCHEMA_VERSION,
    frameId,
    tPerfMs,
    contacts: [
      { id: 1, tip: true, x: 0.4, y: 0.55, confidence: true },
      { id: 2, tip: true, x: 0.6, y: 0.55, confidence: true },
    ],
    buttons: { primary: false, secondary: false, auxiliary: false },
  };
}

describe('agent contract (G6)', () => {
  it('exposes no setBoardPose / forceTrick / applyImpulse (own or prototype)', async () => {
    const harness = new AgentHarness();
    await harness.reset(1, 'flat-dev');
    for (const name of FORBIDDEN) {
      expect(name in harness).toBe(false); // walks the prototype chain
      expect((harness as unknown as Record<string, unknown>)[name]).toBeUndefined();
    }
    // Nothing forbidden is exported from the agent module either.
    for (const name of FORBIDDEN) {
      expect(name in AgentModule).toBe(false);
    }
  });

  it('observe() returns exactly the ObserveState keys (recursively)', async () => {
    const harness = new AgentHarness();
    await harness.reset(1, 'flat-dev');
    harness.step(5);
    const obs = harness.observe();

    expect(Object.keys(obs).sort()).toEqual([...OBSERVE_KEYS].sort());
    expect(Object.keys(obs.board).sort()).toEqual(['av', 'lv', 'p', 'q']);
    expect(Object.keys(obs.board.p).sort()).toEqual(['x', 'y', 'z']);
    expect(Object.keys(obs.board.q).sort()).toEqual(['w', 'x', 'y', 'z']);
    expect(Object.keys(obs.board.lv).sort()).toEqual(['x', 'y', 'z']);
    expect(Object.keys(obs.board.av).sort()).toEqual(['x', 'y', 'z']);
    expect(Object.keys(obs.feet).sort()).toEqual(['nose', 'tail']);
    for (const foot of [obs.feet.nose, obs.feet.tail]) {
      expect(Object.keys(foot).sort()).toEqual(['offset', 'planted']);
      expect(Object.keys(foot.offset).sort()).toEqual(['x', 'y', 'z']);
    }
    // grind is null in M2 (no extra/missing keys to leak).
    expect(obs.grind).toBeNull();
    expect(obs.phase).toBe('none');
    expect(obs.label).toBeNull();
  });

  it('reset(seed, level) is deterministic across two fresh harnesses', async () => {
    const a = new AgentHarness();
    const b = new AgentHarness();
    await a.reset(1234, 'flat-dev');
    await b.reset(1234, 'flat-dev');
    a.step(90);
    b.step(90);
    expect(b.observe().board).toEqual(a.observe().board);
  });

  it('injected frames appear with source "agent" in the recorded trace', async () => {
    const harness = new AgentHarness();
    await harness.reset(7, 'flat-dev');
    harness.startRecording();
    for (let i = 0; i < 60; i++) {
      if (i % 15 === 0) harness.injectContactFrame(plantFrame(i, i * (1000 / 60)));
      harness.step(1);
    }
    const trace = harness.stopRecording();
    expect(trace.frames.length).toBeGreaterThan(0);
    for (const entry of trace.frames) {
      expect(entry.frame.source).toBe('agent');
    }
  });

  it('injectContactFrame does not mutate the caller frame', async () => {
    const harness = new AgentHarness();
    await harness.reset(1, 'flat-dev');
    const frame = plantFrame(0, 0);
    harness.injectContactFrame(frame);
    expect('source' in frame).toBe(false); // caller object untouched
  });

  it('internal sim state is unreachable at runtime (#private, not TS-only)', async () => {
    const harness = new AgentHarness();
    await harness.reset(1, 'flat-dev');
    // ECMAScript #private fields never appear as own properties, so a compliant
    // harness has NO runtime-reachable instance state at all.
    expect(Object.getOwnPropertyNames(harness)).toEqual([]);
    const anyHarness = harness as unknown as Record<string, unknown>;
    for (const name of ['world', 'board', 'config', 'recordedFrames', 'recording']) {
      expect(anyHarness[name]).toBeUndefined();
    }
    // The public method surface is exactly the allowlist — nothing extra.
    const proto = Object.getPrototypeOf(harness) as object;
    expect(Object.getOwnPropertyNames(proto).sort()).toEqual([...HARNESS_ALLOWLIST].sort());
  });

  it('shared default config is deep-frozen (tampering throws)', () => {
    expect(Object.isFrozen(DEFAULT_SIM_CONFIG)).toBe(true);
    expect(Object.isFrozen(DEFAULT_SIM_CONFIG.physics)).toBe(true);
    expect(() => {
      (DEFAULT_SIM_CONFIG.physics.gravity as { y: number }).y = 5;
    }).toThrow();
    expect(DEFAULT_SIM_CONFIG.physics.gravity.y).toBe(-9.81);
  });

  it('post-push mutation of a caller frame cannot corrupt the queued/recorded stream', async () => {
    const harness = new AgentHarness();
    await harness.reset(11, 'flat-dev');
    harness.startRecording();
    const frame = plantFrame(0, 0);
    harness.injectContactFrame(frame);
    // Hostile caller mutates AFTER acceptance; the hub stored a canonical copy.
    frame.contacts[0]!.x = 0.999;
    (frame.buttons as { primary: boolean }).primary = true;
    harness.step(30);
    const trace = harness.stopRecording();
    expect(trace.frames.length).toBe(1);
    const stored = trace.frames[0]!.frame;
    expect(stored.contacts[0]!.x).toBeCloseTo(0.4, 4);
    expect(stored.buttons.primary).toBe(false);
  });

  it('observe() returns plain data only — no functions, no live objects', async () => {
    const harness = new AgentHarness();
    await harness.reset(1, 'flat-dev');
    harness.step(3);
    const obs = harness.observe();
    const walk = (v: unknown): void => {
      expect(typeof v).not.toBe('function');
      if (v && typeof v === 'object') {
        for (const child of Object.values(v as Record<string, unknown>)) walk(child);
      }
    };
    walk(obs);
    // Mutating the observation must not affect the sim.
    obs.board.p.y = 999;
    expect(harness.observe().board.p.y).not.toBe(999);
  });

  it('captureScreenshot() returns null headless and never throws', async () => {
    const harness = new AgentHarness();
    await harness.reset(1, 'flat-dev');
    await expect(harness.captureScreenshot()).resolves.toBeNull();
  });
});
