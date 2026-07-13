import { describe, expect, it, vi } from 'vitest';
import { PauseController } from '../src/ui/PauseMenu';

describe('PauseController', () => {
  it('opens on Escape, resumes on a second Escape, and keeps restart inside the paused flow', async () => {
    const onPause = vi.fn();
    const onResume = vi.fn();
    const onRestart = vi.fn(async () => {});
    const onQuit = vi.fn();
    const menu = new PauseController({ onPause, onResume, onRestart, onQuit });

    expect(menu.isPaused).toBe(false);
    expect(menu.toggle()).toBe(true);
    expect(menu.isPaused).toBe(true);
    expect(onPause).toHaveBeenCalledTimes(1);

    await menu.restart();
    expect(onRestart).toHaveBeenCalledTimes(1);
    expect(menu.isPaused).toBe(true);

    expect(menu.toggle()).toBe(false);
    expect(menu.isPaused).toBe(false);
    expect(onResume).toHaveBeenCalledTimes(1);

    menu.quit();
    expect(onQuit).toHaveBeenCalledTimes(1);
  });
});
