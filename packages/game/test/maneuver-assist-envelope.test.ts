import { describe, expect, it } from 'vitest';
import { DEFAULT_SIM_CONFIG } from '@slackpad/shared';
import { ManeuverAssist } from '../src/control/ManeuverAssist';
import type { FsmResult } from '../src/control/GestureFSM';

function airResult(): FsmResult {
  return {
    phase: 'air',
    label: {
      label: 'ollie',
      confidence: 0.9,
      openStep: 4,
      expireStep: 40,
      q: 0.6,
      air: {
        kind: 'flip',
        label: 'kickflip',
        axis: 'long',
        omegaTarget: 12,
        intensity: 0.8,
        accuracy: 0.9,
        confidence: 0.85,
        sign: 1,
        openStep: 10,
      },
    },
    intent: {
      version: 1,
      attemptId: '4:ollie',
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
      source: { popStep: 4, recognizedStep: 10 },
    },
    lastFailReason: null,
    events: [],
    grind: null,
  };
}

describe('bounded physical trick envelope', () => {
  it('emits one flip impulse, then only a decaying assist guide', () => {
    const assist = new ManeuverAssist(DEFAULT_SIM_CONFIG, 1);
    const first = assist.update(airResult(), 10);
    const next = assist.update(airResult(), 11);

    expect(first.filter((command) => command.kind === 'flipImpulse')).toHaveLength(1);
    expect(next.filter((command) => command.kind === 'flipImpulse')).toHaveLength(0);

    const firstGuide = first.find((command) => command.kind === 'flipTorque');
    const nextGuide = next.find((command) => command.kind === 'flipTorque');
    expect(firstGuide?.kind).toBe('flipTorque');
    expect(nextGuide?.kind).toBe('flipTorque');
    if (firstGuide?.kind === 'flipTorque' && nextGuide?.kind === 'flipTorque') {
      expect(nextGuide.tauMax).toBeLessThan(firstGuide.tauMax);
    }
  });
});
