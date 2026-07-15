/**
 * ProfileStore — dev-only holder of the mutable InputProfile (M3).
 *
 * The AgentHarness reads a profile snapshot immutably on each reset via a
 * ProfileProvider (`() => store.get()`); it never depends on this class. Tests
 * construct `new AgentHarness()` with NO provider, so they use
 * DEFAULT_INPUT_PROFILE and this store — and localStorage — are never touched.
 * Persistence is dev convenience only (guarded for non-browser environments).
 */

import {
  ASSIST_LEVEL_BY_PRESET,
  ASSIST_PRESET_BY_LEVEL,
  DEFAULT_INPUT_PROFILE,
  normalizeInputProfile,
} from '@slackpad/shared';
import type { AssistLevel, AssistPreset, InputProfile, Stance } from '@slackpad/shared';
import type { Telemetry } from '../telemetry/Telemetry';

// v5 installs the all-motion Tech Deck contract for existing local builds:
// lift+retap tail = ollie, lift+retap nose = nollie; clicks are ignored.
export const PROFILE_STORAGE_KEY = 'slackpad.profile.v5';

type Listener = (profile: InputProfile) => void;

function hasLocalStorage(): boolean {
  try {
    return typeof localStorage !== 'undefined';
  } catch {
    return false;
  }
}

export class ProfileStore {
  private profile: InputProfile;
  private readonly listeners = new Set<Listener>();

  constructor(private readonly telemetry?: Telemetry) {
    this.profile = this.load();
  }

  /** Immutable snapshot the harness reads per reset. */
  get(): InputProfile {
    return structuredClone(this.profile);
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  update(patch: Partial<InputProfile>): void {
    const assistLevel =
      patch.assistPreset !== undefined
        ? ASSIST_LEVEL_BY_PRESET[patch.assistPreset]
        : (patch.assistLevel ?? this.profile.assistLevel);
    const assistPreset = patch.assistPreset ?? ASSIST_PRESET_BY_LEVEL[assistLevel];
    this.profile = normalizeInputProfile({
      ...this.profile,
      ...patch,
      assistLevel,
      assistPreset,
      kickAttribution: 'motionTap',
      bothClickMeans: 'ollie',
      accessibility: { ...this.profile.accessibility },
    });
    this.persist();
    this.telemetry?.log({ type: 'profileChanged', patch: { ...patch } });
    for (const l of this.listeners) l(this.get());
  }

  setStance(stance: Stance): void {
    this.update({ stance });
  }

  toggleStance(): void {
    this.setStance(this.profile.stance === 'regular' ? 'goofy' : 'regular');
  }

  setAssistLevel(assistLevel: AssistLevel): void {
    this.update({ assistLevel });
  }

  setAssistPreset(assistPreset: AssistPreset): void {
    this.update({ assistPreset });
  }

  setPadYawOffset(deg: number): void {
    this.update({ padYawOffset: deg });
  }

  toggleSwapFeet(): void {
    this.update({ swapFeet: !this.profile.swapFeet });
  }

  private load(): InputProfile {
    const base = structuredClone(DEFAULT_INPUT_PROFILE);
    if (!hasLocalStorage()) return base;
    try {
      const raw = localStorage.getItem(PROFILE_STORAGE_KEY);
      if (!raw) return base;
      const saved = JSON.parse(raw) as Partial<InputProfile>;
      return normalizeInputProfile({
        ...base,
        ...saved,
        assistPreset:
          saved.assistPreset ??
          ASSIST_PRESET_BY_LEVEL[saved.assistLevel ?? base.assistLevel],
        kickAttribution: 'motionTap',
        bothClickMeans: 'ollie',
        accessibility: { ...base.accessibility, ...saved.accessibility },
      });
    } catch {
      return base;
    }
  }

  private persist(): void {
    if (!hasLocalStorage()) return;
    try {
      localStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(this.profile));
    } catch {
      /* dev-only best effort */
    }
  }
}
