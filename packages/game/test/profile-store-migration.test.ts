import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  LEGACY_PROFILE_STORAGE_KEY,
  PROFILE_STORAGE_KEY,
  ProfileStore,
} from '../src/input/ProfileStore';

class MemoryStorage {
  readonly values = new Map<string, string>();
  getItem(key: string): string | null { return this.values.get(key) ?? null; }
  setItem(key: string, value: string): void { this.values.set(key, value); }
}

afterEach(() => vi.unstubAllGlobals());

describe('shipping profile migration', () => {
  it('migrates v5 settings to v6 but clears yaw from the old coordinate space', () => {
    const storage = new MemoryStorage();
    storage.setItem(LEGACY_PROFILE_STORAGE_KEY, JSON.stringify({
      stance: 'goofy',
      padYawOffset: 37,
      swapFeet: true,
      assistLevel: 2,
      accessibility: { reducedMotion: true, highContrastHud: true },
    }));
    vi.stubGlobal('localStorage', storage);

    const profile = new ProfileStore().get();

    expect(profile).toMatchObject({
      stance: 'goofy',
      padYawOffset: 0,
      flickSensitivity: 1,
      swapFeet: true,
      assistLevel: 2,
      assistPreset: 'streamlined',
      accessibility: { reducedMotion: true, highContrastHud: true },
    });
    expect(JSON.parse(storage.getItem(PROFILE_STORAGE_KEY)!)).toMatchObject(profile);
  });

  it('keeps v6 yaw and sensitivity, with sensitivity clamped on writes', () => {
    const storage = new MemoryStorage();
    storage.setItem(PROFILE_STORAGE_KEY, JSON.stringify({
      padYawOffset: -22,
      flickSensitivity: 1.35,
    }));
    vi.stubGlobal('localStorage', storage);

    const store = new ProfileStore();
    expect(store.get()).toMatchObject({ padYawOffset: -22, flickSensitivity: 1.35 });

    store.setFlickSensitivity(99);
    expect(store.get().flickSensitivity).toBe(1.6);
    expect(JSON.parse(storage.getItem(PROFILE_STORAGE_KEY)!).flickSensitivity).toBe(1.6);

    store.setFlickSensitivity(-99);
    expect(store.get().flickSensitivity).toBe(0.6);
  });

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
