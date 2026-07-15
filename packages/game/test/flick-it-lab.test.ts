import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_INPUT_PROFILE } from '@slackpad/shared';
import type { SessionTrace } from '@slackpad/shared';
import { FlickItLabController } from '../src/ui/FlickItLab';

function trace(label: 'ollie' | 'kickflip'): SessionTrace {
  return {
    header: {
      replayVersion: 1,
      gameVersion: '0.1.0',
      rapierVersion: '0.19.3',
      hz: 60,
      seed: 1,
      levelId: 'playable-park',
      createdAt: '2026-07-14T00:00:00Z',
      contactFrameSchema: 1,
      profile: DEFAULT_INPUT_PROFILE,
    },
    frames: [],
    checkpoints: [{ step: 30, hash: label === 'kickflip' ? 'flip-hash' : 'ollie-hash' }],
    controlTrace: {
      version: 2,
      profile: DEFAULT_INPUT_PROFILE,
      events: [{
        kind: 'intent',
        step: 5,
        intent: {
          version: 1,
          attemptId: '5:tail',
          popSide: 'tail',
          base: 'ollie',
          family: label === 'kickflip' ? 'flip' : 'ollie',
          direction: label === 'kickflip' ? 'heelside' : 'none',
          label,
          gestureSpeed: label === 'kickflip' ? 0.8 : 0,
          gestureAccuracy: label === 'kickflip' ? 0.9 : 1,
          confidence: label === 'kickflip' ? 0.85 : 1,
          fallback: label === 'ollie',
          stance: 'regular',
          source: { popStep: 5, recognizedStep: label === 'kickflip' ? 7 : null },
        },
      }],
    },
  };
}

describe('native Flick-It Lab controller', () => {
  it('labels an attempt, exports the full trace, and builds a confusion report', async () => {
    const beginCapture = vi.fn(async () => {});
    const exportTrace = vi.fn(() => true);
    const controller = new FlickItLabController({
      beginCapture,
      endCapture: () => trace('kickflip'),
      replay: vi.fn(async () => []),
      exportTrace,
    });

    await controller.start('kickflip');
    const result = controller.stopAndExport();

    expect(beginCapture).toHaveBeenCalledOnce();
    expect(result).toMatchObject({ expected: 'kickflip', recognized: 'kickflip', correct: true });
    expect(result.trace.controlTrace?.attempts).toEqual([
      { expected: 'kickflip', recognized: 'kickflip', correct: true, fallback: false },
    ]);
    expect(result.trace.controlTrace?.metrics).toEqual({
      confusion: { 'kickflip->kickflip': 1 },
    });
    expect(exportTrace).toHaveBeenCalledWith(result.trace, 'kickflip--kickflip');
    expect(controller.confusionReport()).toEqual({ 'kickflip->kickflip': 1 });
  });

  it('reports ambiguous input as a safe base-pop fallback and can compare traces', async () => {
    const traces = [trace('ollie'), trace('ollie')];
    const controller = new FlickItLabController({
      beginCapture: async () => {},
      endCapture: () => traces.shift()!,
      replay: async () => [],
      exportTrace: () => true,
    });

    await controller.start('kickflip');
    const first = controller.stopAndExport();
    await controller.start('kickflip');
    const second = controller.stopAndExport();

    expect(first).toMatchObject({ recognized: 'ollie', correct: false, fallback: true });
    expect(controller.compareLastTwo()).toMatchObject({ matches: true });
    expect(second.trace.controlTrace?.attempts?.[0]?.recognized).toBe('ollie');
  });
});
