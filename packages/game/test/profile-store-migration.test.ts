import { afterEach, describe, expect, it, vi } from 'vitest';
import { PROFILE_STORAGE_KEY, ProfileStore } from '../src/input/ProfileStore';

class MemoryStorage {
  readonly values = new Map<string, string>();
  getItem(key: string): string | null { return this.values.get(key) ?? null; }
  setItem(key: string, value: string): void { this.values.set(key, value); }
}

afterEach(() => vi.unstubAllGlobals());

describe('shipping profile migration', () => {
  it('cannot resurrect a click mapping from persisted data', () => {
    const storage = new MemoryStorage();
    storage.setItem(PROFILE_STORAGE_KEY, JSON.stringify({
      kickAttribution: 'plantMask',
      bothClickMeans: 'ignore',
      tapToClickIsKick: false,
    }));
    vi.stubGlobal('localStorage', storage);

    const profile = new ProfileStore().get();

    expect(profile.kickAttribution).toBe('motionTap');
    expect(profile.bothClickMeans).toBe('ollie');
  });

  it('does not allow a runtime profile patch to restore a click mapping', () => {
    const storage = new MemoryStorage();
    vi.stubGlobal('localStorage', storage);
    const store = new ProfileStore();

    store.update({ kickAttribution: 'plantMask', bothClickMeans: 'ignore' });

    expect(store.get().kickAttribution).toBe('motionTap');
    expect(store.get().bothClickMeans).toBe('ollie');
  });
});
