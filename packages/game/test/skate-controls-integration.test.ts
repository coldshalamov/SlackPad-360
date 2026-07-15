import { describe, expect, it } from 'vitest';
import { eventsOf, lastEventOf, NOSE_POS, settled, TAIL_POS } from './helpers/maneuver';

async function plantedRetapSwipe(seed: number) {
  const d = await settled(seed);
  d.cruise(90);

  // Tail finger lifts briefly, retaps its prior socket, then both riding
  // fingers remain down for the gesture and assisted catch.
  d.drive({ nose: NOSE_POS, tail: null });
  d.drive({ nose: NOSE_POS, tail: null });
  d.drive({ nose: NOSE_POS, tail: TAIL_POS });
  for (let i = 0; i < 20 && d.harness.observe().phase !== 'air'; i++) {
    d.drive({ nose: NOSE_POS, tail: TAIL_POS });
  }
  expect(d.harness.observe().phase).toBe('air');

  // A modest, smooth post-pop swipe should be enough; no precision flick.
  for (let i = 1; i <= 6; i++) {
    d.drive({
      nose: { x: NOSE_POS.x, y: NOSE_POS.y + 0.025 * i },
      tail: TAIL_POS,
    });
  }

  for (let i = 0; i < 200; i++) {
    d.drive({ nose: NOSE_POS, tail: TAIL_POS });
    if (lastEventOf(d.harness, 'trickCompleted') || lastEventOf(d.harness, 'bail')) break;
  }
  return d;
}

describe('Skate-like pop, swipe and assist contract', () => {
  it('recognizes a forgiving planted swipe during the post-pop air window', async () => {
    const d = await plantedRetapSwipe(0x5a7e1);
    expect(eventsOf(d.harness, 'flipRecognized')).toHaveLength(1);
  });

  it('automatically catches and cleanly lands with both riding fingers still planted', async () => {
    const d = await plantedRetapSwipe(0x5a7e2);
    expect(eventsOf(d.harness, 'catch')).toHaveLength(1);
    const completed = lastEventOf(d.harness, 'trickCompleted');
    expect(completed).toBeDefined();
    expect(completed!.cleanliness).toBe('clean');
    expect(lastEventOf(d.harness, 'bail')).toBeUndefined();
  });
});
