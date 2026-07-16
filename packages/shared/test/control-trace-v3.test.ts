import { describe, expect, it } from 'vitest';
import * as shared from '../src/index';
import { DEFAULT_INPUT_PROFILE, validateControlTrace } from '../src/index';
import type { ControlTraceV3 } from '../src/index';

describe('ControlTraceV3 contract', () => {
  it('exports a runtime validator for trace imports', () => {
    expect(typeof Reflect.get(shared, 'validateControlTrace')).toBe('function');
  });

  it('continues to accept a version-2 trace', () => {
    expect(validateControlTrace({
      version: 2,
      profile: DEFAULT_INPUT_PROFILE,
      events: [],
    })).toEqual({ ok: true, version: 2, errors: [] });
  });

  it('publishes version 3 without changing the version-2 constant', () => {
    expect(shared.CONTROL_TRACE_VERSION).toBe(2);
    expect(Reflect.get(shared, 'CONTROL_TRACE_V3_VERSION')).toBe(3);
  });

  it('accepts optional mass, wheel-contact, and assist diagnostics in version 3', () => {
    const trace: ControlTraceV3 = {
      version: 3,
      profile: DEFAULT_INPUT_PROFILE,
      events: [{
        kind: 'sim',
        step: 12,
        board: {
          p: { x: 0, y: 0.2, z: 1 },
          q: { x: 0, y: 0, z: 0, w: 1 },
          lv: { x: 0, y: 0, z: 4 },
          av: { x: 0, y: 0.3, z: 0 },
        },
        phase: 'ground',
        intent: null,
        physics: {
          version: 1,
          body: {
            boardMassKg: 2.4,
            riderProxyMassKg: 72,
            centerOfMassLocalM: { x: 0, y: 0.85, z: 0 },
            inertiaKgM2: { x: 4.1, y: 0.8, z: 4.2 },
          },
          solver: {
            totalMassKg: 74.4,
            physicsSubsteps: 2,
            internalHz: 120,
            ccdEnabled: true,
          },
          wheelContacts: [{
            wheel: 'frontLeft',
            grounded: true,
            point: { x: -0.11, y: 0, z: 0.32 },
            normal: { x: 0, y: 1, z: 0 },
            normalLoadN: 190,
            suspensionCompressionM: 0.008,
            longitudinalSlipMps: 0.02,
            lateralSlipMps: 0.08,
          }],
          assists: [{
            kind: 'stability',
            active: true,
            strength: 0.25,
            forceN: { x: 0, y: 8, z: 0 },
            torqueNm: { x: 0, y: 0, z: -1.2 },
            reason: 'classic-ground-stability',
          }],
          contactImpulses: { totalNs: 8, supportNs: 8, impactNs: 0 },
        },
      }],
    };
    const result = validateControlTrace(trace);

    expect(result).toEqual({ ok: true, version: 3, errors: [] });
  });

  it('rejects non-physical or non-finite version-3 diagnostics', () => {
    const result = validateControlTrace({
      version: 3,
      profile: DEFAULT_INPUT_PROFILE,
      events: [{
        kind: 'sim',
        step: 1,
        physics: {
          version: 1,
          body: {
            boardMassKg: 0,
            riderProxyMassKg: -1,
            centerOfMassLocalM: { x: 0, y: Number.NaN, z: 0 },
          },
          solver: {
            totalMassKg: 0,
            physicsSubsteps: 0,
            internalHz: Number.NaN,
            ccdEnabled: 'yes',
          },
          wheelContacts: [{
            wheel: 'middle',
            grounded: true,
            normalLoadN: -5,
            suspensionCompressionM: -0.1,
            longitudinalSlipMps: Number.POSITIVE_INFINITY,
            lateralSlipMps: 0,
          }],
          assists: [{
            kind: 'teleport',
            active: true,
            strength: 1.5,
          }],
          contactImpulses: { totalNs: -1, supportNs: 0, impactNs: 0 },
        },
      }],
    });

    expect(result.ok).toBe(false);
    expect(result.version).toBe(3);
    expect(result.errors).toEqual(expect.arrayContaining([
      'events[0].physics.body.boardMassKg must be greater than 0',
      'events[0].physics.body.riderProxyMassKg must be non-negative',
      'events[0].physics.body.centerOfMassLocalM.y must be a finite number',
      'events[0].physics.solver.totalMassKg must be greater than 0',
      'events[0].physics.solver.physicsSubsteps must be a positive integer',
      'events[0].physics.solver.internalHz must be greater than 0',
      'events[0].physics.solver.ccdEnabled must be boolean',
      'events[0].physics.wheelContacts[0].wheel must identify a board wheel',
      'events[0].physics.wheelContacts[0].normalLoadN must be non-negative',
      'events[0].physics.wheelContacts[0].suspensionCompressionM must be non-negative',
      'events[0].physics.wheelContacts[0].longitudinalSlipMps must be a finite number',
      'events[0].physics.assists[0].kind is not supported',
      'events[0].physics.assists[0].strength must be in [0,1]',
      'events[0].physics.contactImpulses.totalNs must be non-negative',
    ]));
  });

  it('rejects malformed event envelopes before a reader consumes them', () => {
    const result = validateControlTrace({
      version: 3,
      profile: DEFAULT_INPUT_PROFILE,
      events: [
        { kind: 'warp', step: 1 },
        {
          kind: 'sim',
          step: -2,
          board: {
            p: { x: 0, y: 0, z: 0 },
            q: { x: 0, y: 0, z: 0, w: 1 },
            lv: { x: 0, y: 0, z: 0 },
            av: { x: 0, y: 0, z: 0 },
          },
          phase: 'ground',
          intent: null,
        },
        null,
      ],
    });

    expect(result).toEqual({
      ok: false,
      version: 3,
      errors: [
        'events[0].kind is not supported',
        'events[1].step must be a non-negative integer',
        'events[2] must be an object',
      ],
    });
  });

  it('rejects partial profiles and partial sim events at the import boundary', () => {
    const result = validateControlTrace({
      version: 3,
      profile: { assistPreset: 'classic' },
      events: [{ kind: 'sim', step: 1, physics: { version: 1 } }],
    });

    expect(result.ok).toBe(false);
    expect(result.errors).toEqual(expect.arrayContaining([
      'profile.stance must be regular or goofy',
      'profile.padYawOffset must be a finite number',
      'profile.accessibility must be an object',
      'events[0].board must be an object',
      'events[0].phase must be a supported maneuver phase',
      'events[0].intent must be an object or null',
    ]));
  });
});
