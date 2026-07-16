import { describe, expect, it } from 'vitest';
import {
  ASSIST_LEVEL_BY_PRESET,
  DEFAULT_INPUT_PROFILE,
  DEFAULT_SIM_CONFIG,
} from '@slackpad/shared';
import type {
  AssistPreset,
  ControlTraceV3,
  InputProfile,
  TrickIntentV1,
} from '@slackpad/shared';
import { AgentHarness } from '../src/agent/AgentHarness';
import { PadDriver, scriptOllie } from './helpers/maneuver';

describe('control rebuild public contracts', () => {
  it('exposes the three named assist presets with Classic as the default', () => {
    const presets: AssistPreset[] = ['experienced', 'classic', 'streamlined'];
    expect(presets.map((preset) => ASSIST_LEVEL_BY_PRESET[preset])).toEqual([0, 1, 2]);
    expect(DEFAULT_INPUT_PROFILE.assistPreset).toBe('classic');
    expect(DEFAULT_INPUT_PROFILE.assistLevel).toBe(1);
  });

  it('defines a versioned categorical trick intent without privileged physics data', () => {
    const intent: TrickIntentV1 = {
      version: 1,
      attemptId: '120:ollie',
      popSide: 'tail',
      base: 'ollie',
      family: 'flip',
      direction: 'heelside',
      label: 'kickflip',
      gestureSpeed: 0.8,
      gestureAccuracy: 0.9,
      confidence: 0.85,
      fallback: false,
      stance: 'regular',
      source: { popStep: 120, recognizedStep: 122 },
    };
    expect(intent).not.toHaveProperty('pose');
    expect(intent).not.toHaveProperty('force');
    expect(intent).not.toHaveProperty('torque');
  });

  it('records the active profile and a version-3 control trace with physics observability', async () => {
    const profile: InputProfile = {
      ...DEFAULT_INPUT_PROFILE,
      stance: 'goofy',
      padYawOffset: 17,
      assistPreset: 'streamlined',
      assistLevel: 2,
    };
    const harness = new AgentHarness(DEFAULT_SIM_CONFIG, () => profile);
    await harness.reset(0xc0117, 'flat-dev');
    harness.startRecording();
    harness.recordRenderSample(12.5, 101.25, {
      p: { x: 1, y: 2, z: 3 },
      target: { x: 4, y: 5, z: 6 },
    });
    const contacts = [
      { id: 1, tip: true, x: 0.4, y: 0.5, confidence: true },
      { id: 2, tip: true, x: 0.6, y: 0.5, confidence: true },
    ];
    harness.injectContactFrame([
      {
        schemaVersion: 1,
        frameId: 0,
        tPerfMs: 1,
        contacts,
        buttons: { primary: false, secondary: false, auxiliary: false },
      },
      {
        schemaVersion: 1,
        frameId: 1,
        tPerfMs: 41,
        contacts,
        buttons: { primary: true, secondary: false, auxiliary: false },
      },
    ]);
    harness.step(2);
    harness.getTelemetry().log({ type: 'bail', step: 2, reason: 'trace-contract' });
    const trace = harness.stopRecording();

    expect(trace.header.profile).toEqual(profile);
    const controlTrace: ControlTraceV3 | undefined = trace.controlTrace?.version === 3
      ? trace.controlTrace
      : undefined;
    expect(controlTrace?.version).toBe(3);
    expect(controlTrace?.profile).toEqual(profile);
    expect(controlTrace?.events.some((event) => event.kind === 'sim')).toBe(true);
    expect(controlTrace?.events).toContainEqual(expect.objectContaining({
      kind: 'sim',
      physics: expect.objectContaining({
        version: 1,
        body: expect.objectContaining({ boardMassKg: DEFAULT_SIM_CONFIG.physics.boardMass }),
        solver: {
          totalMassKg: expect.any(Number),
          physicsSubsteps: DEFAULT_SIM_CONFIG.physics.physicsSubsteps,
          internalHz:
            DEFAULT_SIM_CONFIG.physics.hz * DEFAULT_SIM_CONFIG.physics.physicsSubsteps,
          ccdEnabled: true,
        },
        contactImpulses: {
          totalNs: expect.any(Number),
          supportNs: expect.any(Number),
          impactNs: expect.any(Number),
        },
        wheelContacts: expect.arrayContaining([
          expect.objectContaining({ wheel: 'frontLeft' }),
          expect.objectContaining({ wheel: 'rearRight' }),
        ]),
      }),
    }));
    const recordedSolver = controlTrace?.events.find((event) => event.kind === 'sim')
      ?.physics?.solver;
    expect(recordedSolver?.totalMassKg).toBeCloseTo(
      DEFAULT_SIM_CONFIG.physics.boardMass + DEFAULT_SIM_CONFIG.physics.riderMass,
      4,
    );
    expect(controlTrace?.events).toContainEqual(expect.objectContaining({
      kind: 'control',
      step: 0,
      clickEdges: [],
      samples: [
        expect.objectContaining({ frameId: 0, tPerfMs: 1 }),
        expect.objectContaining({ frameId: 1, tPerfMs: 41 }),
      ],
    }));
    expect(controlTrace?.events).toContainEqual({
      kind: 'outcome',
      step: 2,
      type: 'bail',
      payload: { reason: 'trace-contract' },
    });
    expect(controlTrace?.events).toContainEqual({
      kind: 'render',
      step: 0,
      tPerfMs: 101.25,
      frameMs: 12.5,
      camera: {
        p: { x: 1, y: 2, z: 3 },
        target: { x: 4, y: 5, z: 6 },
      },
    });
  });

  it('records only assists that physically acted, with their measured impulses', async () => {
    const idleHarness = new AgentHarness();
    await idleHarness.reset(0xc0119, 'flat-dev');
    idleHarness.startRecording();
    idleHarness.step(1);
    const idleTrace = idleHarness.stopRecording();
    if (idleTrace.controlTrace?.version !== 3) throw new Error('expected ControlTrace V3');
    const idleAssists = idleTrace.controlTrace.events.flatMap((event) =>
      event.kind === 'sim' ? event.physics?.assists ?? [] : [],
    );
    expect(idleAssists).toEqual([]);

    const popHarness = new AgentHarness();
    await popHarness.reset(0xc0120, 'flat-dev');
    popHarness.startRecording();
    popHarness.step(60);
    const driver = new PadDriver(popHarness);
    scriptOllie(driver);
    const popTrace = driver.harness.stopRecording();
    if (popTrace.controlTrace?.version !== 3) throw new Error('expected ControlTrace V3');
    const assists = popTrace.controlTrace.events.flatMap((event) =>
      event.kind === 'sim' ? event.physics?.assists ?? [] : [],
    );
    const pop = assists.find((assist) => assist.kind === 'pop');

    expect(pop).toEqual(expect.objectContaining({
      active: true,
      strength: expect.any(Number),
      impulseNs: expect.objectContaining({ y: expect.any(Number) }),
      torqueImpulseNms: expect.objectContaining({
        x: expect.any(Number),
        z: expect.any(Number),
      }),
    }));
    expect(Math.hypot(
      pop?.impulseNs?.x ?? 0,
      pop?.impulseNs?.y ?? 0,
      pop?.impulseNs?.z ?? 0,
    )).toBeGreaterThan(0);
    expect(Math.hypot(
      pop?.torqueImpulseNms?.x ?? 0,
      pop?.torqueImpulseNms?.y ?? 0,
      pop?.torqueImpulseNms?.z ?? 0,
    )).toBeGreaterThan(0);
    expect(assists.every((assist) => assist.active)).toBe(true);
  });

  it('replays with the recorded calibration and assist preset, not the receiver profile', async () => {
    const recordedProfile: InputProfile = {
      ...DEFAULT_INPUT_PROFILE,
      stance: 'goofy',
      padYawOffset: 23,
      assistPreset: 'streamlined',
      assistLevel: 2,
    };
    const receiverProfile: InputProfile = {
      ...DEFAULT_INPUT_PROFILE,
      stance: 'regular',
      padYawOffset: -31,
      assistPreset: 'experienced',
      assistLevel: 0,
    };
    const recorder = new AgentHarness(DEFAULT_SIM_CONFIG, () => recordedProfile);
    await recorder.reset(0xc0118, 'flat-dev');
    recorder.startRecording();
    recorder.step(60);
    const trace = recorder.stopRecording();

    const receiver = new AgentHarness(DEFAULT_SIM_CONFIG, () => receiverProfile);
    const replayed = await receiver.replay(trace);

    expect(replayed).toEqual(trace.checkpoints);
    expect(receiver.observe().assistLevel).toBe(2);
  });
});
