/**
 * Tail-strike SFX accent (Sprint 02 S4, reviews/03 Stage 2). Plays ONE
 * vendored CC0 wood-hit one-shot on `popRecognized` — a cheap,
 * disproportionate feel gain. NON-FINAL mapping: the real audio pass is M9's
 * (event-map.json is the authority there); this wires exactly one accent so
 * the pop stops being silent.
 *
 * Presentation only: subscribes to telemetry, never touches input or sim.
 * Autoplay policies can reject play() before the first user gesture —
 * failures are swallowed (an accent must never break the game).
 */

import type { Telemetry } from '../telemetry/Telemetry';

const POP_SFX_URL = '/runtime-audio/pop-tail-strike.ogg';
/** +2 semitones for nollie (event-map note), approximated by playbackRate. */
const NOLLIE_RATE = 2 ** (2 / 12);

export class PopSfx {
  readonly #unsubscribe: () => void;
  #pool: HTMLAudioElement[] = [];
  #next = 0;

  constructor(telemetry: Telemetry, poolSize = 3) {
    if (typeof Audio !== 'undefined') {
      for (let i = 0; i < poolSize; i++) {
        const audio = new Audio(POP_SFX_URL);
        audio.preload = 'auto';
        audio.volume = 0.8;
        this.#pool.push(audio);
      }
    }
    this.#unsubscribe = telemetry.subscribe((event) => {
      if (event.type === 'popRecognized') {
        this.#play(event.label === 'nollie');
      }
    });
  }

  #play(nollie: boolean): void {
    const audio = this.#pool[this.#next];
    if (!audio) return;
    this.#next = (this.#next + 1) % this.#pool.length;
    try {
      audio.currentTime = 0;
      audio.playbackRate = nollie ? NOLLIE_RATE : 1;
      void audio.play().catch(() => {
        /* pre-gesture autoplay rejection — accent silently skipped */
      });
    } catch {
      /* media element unavailable (headless) — accent silently skipped */
    }
  }

  dispose(): void {
    this.#unsubscribe();
    this.#pool = [];
  }
}
