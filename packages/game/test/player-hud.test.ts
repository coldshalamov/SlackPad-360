import { describe, expect, it } from 'vitest';
import type { ObserveState } from '@slackpad/shared';
import { hudStatsText } from '../src/render/DebugHud';

const observation = {
  step: 120,
  score: 420,
  assistLevel: 1,
  inputSource: 'hardware',
  board: { lv: { x: 0, y: 0, z: 3 } },
  feet: { nose: { planted: true }, tail: { planted: false } },
} as ObserveState;

describe('player-facing HUD projection', () => {
  it('keeps only useful play information and omits developer state', () => {
    expect(hudStatsText(observation, 'player')).toBe('score 420   3.00 m/s');
    expect(hudStatsText(observation, 'player')).not.toMatch(/step|src|feet|L1/);
  });

  it('retains full telemetry projection in browser debug mode', () => {
    expect(hudStatsText(observation, 'debug')).toContain('step 120');
    expect(hudStatsText(observation, 'debug')).toContain('src hardware   L1');
  });
});
