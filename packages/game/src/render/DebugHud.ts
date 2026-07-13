/**
 * DebugHud (M7 polish) — a minimal top-left dev cluster. It only READS: an
 * ObserveState handed in each frame plus telemetry events. It never writes sim
 * state.
 *
 * Layout rule (art rubric S7 / camera spec): NOTHING covers the board centre.
 * The cluster is anchored at the top-left with an edge margin; the M4 phase
 * banner is folded INTO the cluster (colour pip + label) rather than floating
 * over screen-centre where the chase cam frames the board. Only edge-weighted or
 * transient overlays (bail vignette, respawn fade) ever touch the middle, and
 * the vignette is transparent through its centre by construction.
 *
 * These are STAGED visuals ("pending promotion") — the fine print says so.
 * Bail/respawn presentation honours `reducedMotion` (no vignette, instant cut).
 */

import type { ObserveState } from '@slackpad/shared';
import type { Telemetry } from '../telemetry/Telemetry';

/** Phase → pip colour (readable failure is a design requirement, spec §7). */
const PHASE_COLORS: Record<string, string> = {
  none: 'rgba(150,165,180,0.95)',
  ground: 'rgba(120,200,160,0.98)',
  pop: 'rgba(250,220,120,0.98)',
  air: 'rgba(120,190,255,0.98)',
  catch: 'rgba(190,150,255,0.98)',
  grind: 'rgba(120,230,220,0.98)',
  bail: 'rgba(255,110,90,0.98)',
};

export interface DebugHudOptions {
  reducedMotion?: boolean;
  highContrast?: boolean;
  vignetteMs?: number;
  respawnFadeMs?: number;
}

export class DebugHud {
  readonly #root: HTMLDivElement;
  readonly #pip: HTMLSpanElement;
  readonly #phaseText: HTMLSpanElement;
  readonly #stats: HTMLDivElement;
  readonly #trickChip: HTMLDivElement;
  readonly #failChip: HTMLDivElement;
  readonly #grindChip: HTMLDivElement;
  readonly #grindLabel: HTMLSpanElement;
  readonly #grindNeedle: HTMLDivElement;
  readonly #bailBanner: HTMLDivElement;
  readonly #vignette: HTMLDivElement;
  readonly #fade: HTMLDivElement;

  #lastTrick = '—';
  #lastBailReason = '—';
  readonly #unsubscribe: () => void;
  readonly #opts: Required<DebugHudOptions>;

  constructor(container: HTMLElement, telemetry: Telemetry, opts: DebugHudOptions = {}) {
    this.#opts = {
      reducedMotion: opts.reducedMotion ?? false,
      highContrast: opts.highContrast ?? false,
      vignetteMs: opts.vignetteMs ?? 900,
      respawnFadeMs: opts.respawnFadeMs ?? 250,
    };
    const bgAlpha = this.#opts.highContrast ? 0.9 : 0.62;
    const chipBg = `rgba(12,16,22,${bgAlpha})`;

    // --- Top-left cluster --------------------------------------------------
    const root = document.createElement('div');
    Object.assign(root.style, {
      position: 'fixed',
      top: '12px',
      left: '12px',
      display: 'flex',
      flexDirection: 'column',
      gap: '5px',
      font: '12px ui-monospace, SFMono-Regular, Menlo, monospace',
      color: 'rgba(220,232,244,0.95)',
      pointerEvents: 'none',
      zIndex: '10',
      maxWidth: '260px',
    });
    container.appendChild(root);
    this.#root = root;

    const chip = (): HTMLDivElement => {
      const d = document.createElement('div');
      Object.assign(d.style, {
        padding: '4px 9px',
        background: chipBg,
        borderRadius: '7px',
        whiteSpace: 'pre',
        backdropFilter: 'blur(2px)',
      });
      return d;
    };

    // Phase chip: colour pip + phase label.
    const phaseChip = chip();
    Object.assign(phaseChip.style, { display: 'flex', alignItems: 'center', gap: '7px', fontWeight: '700' });
    const pip = document.createElement('span');
    Object.assign(pip.style, {
      width: '9px',
      height: '9px',
      borderRadius: '50%',
      background: PHASE_COLORS['none'],
      boxShadow: '0 0 6px currentColor',
      flex: '0 0 auto',
    });
    const phaseText = document.createElement('span');
    phaseText.textContent = 'NONE';
    phaseChip.append(pip, phaseText);
    this.#pip = pip;
    this.#phaseText = phaseText;

    const stats = chip();
    stats.textContent = 'step 0';
    this.#stats = stats;

    const trickChip = chip();
    trickChip.textContent = 'trick —';
    this.#trickChip = trickChip;

    const failChip = chip();
    failChip.textContent = 'fail —';
    this.#failChip = failChip;

    // --- Grind trust loop (M6 fairness mandate: VISIBLE snap + balance) ----
    // Hidden unless near/on a rail. Candidate = hollow pip ("in the snap
    // zone"); latched = family label + a balance meter with the clean (±0.45)
    // and slip (±1.0) bands marked.
    const grindChip = chip();
    Object.assign(grindChip.style, { display: 'none', alignItems: 'center', gap: '8px' });
    const grindLabel = document.createElement('span');
    grindLabel.textContent = '◇ RAIL';
    const meterOuter = document.createElement('div');
    Object.assign(meterOuter.style, {
      position: 'relative',
      width: '96px',
      height: '8px',
      borderRadius: '4px',
      background: 'rgba(255,255,255,0.14)',
      overflow: 'hidden',
    });
    // Clean band (inner ±0.45 of ±1.0 range shown).
    const cleanBand = document.createElement('div');
    Object.assign(cleanBand.style, {
      position: 'absolute',
      left: `${50 - 45 / 2}%`,
      width: '45%',
      top: '0',
      bottom: '0',
      background: 'rgba(120,230,220,0.25)',
    });
    const needle = document.createElement('div');
    Object.assign(needle.style, {
      position: 'absolute',
      left: '50%',
      width: '3px',
      top: '0',
      bottom: '0',
      background: 'rgba(255,255,255,0.95)',
      transform: 'translateX(-50%)',
    });
    meterOuter.append(cleanBand, needle);
    grindChip.append(grindLabel, meterOuter);
    this.#grindChip = grindChip;
    this.#grindLabel = grindLabel;
    this.#grindNeedle = needle;

    const fine = chip();
    Object.assign(fine.style, { opacity: '0.72', fontSize: '10px' });
    fine.textContent = 'STAGED ART (pending promotion)';

    root.append(phaseChip, stats, trickChip, failChip, grindChip, fine);

    // --- Bail banner (top edge band — never board centre) ------------------
    const bailBanner = document.createElement('div');
    Object.assign(bailBanner.style, {
      position: 'fixed',
      top: '9%',
      left: '50%',
      transform: 'translateX(-50%)',
      padding: '8px 22px',
      font: '700 22px ui-monospace, SFMono-Regular, Menlo, monospace',
      letterSpacing: '0.04em',
      color: 'rgba(255,225,220,0.98)',
      background: 'rgba(120,20,12,0.72)',
      borderRadius: '10px',
      pointerEvents: 'none',
      opacity: '0',
      transition: 'opacity 140ms ease',
      zIndex: '11',
    });
    container.appendChild(bailBanner);
    this.#bailBanner = bailBanner;

    // --- Red vignette (edge-weighted; transparent centre) ------------------
    const vignette = document.createElement('div');
    Object.assign(vignette.style, {
      position: 'fixed',
      inset: '0',
      pointerEvents: 'none',
      opacity: '0',
      background:
        'radial-gradient(ellipse at center, rgba(180,20,10,0) 45%, rgba(150,15,8,0.28) 78%, rgba(120,10,6,0.5) 100%)',
      zIndex: '9',
    });
    container.appendChild(vignette);
    this.#vignette = vignette;

    // --- Respawn fade-through-black ----------------------------------------
    const fade = document.createElement('div');
    Object.assign(fade.style, {
      position: 'fixed',
      inset: '0',
      pointerEvents: 'none',
      background: '#000',
      opacity: '0',
      zIndex: '12',
    });
    container.appendChild(fade);
    this.#fade = fade;

    this.#unsubscribe = telemetry.subscribe((e) => this.#onEvent(e));
  }

  #onEvent(e: { type: string; [k: string]: unknown }): void {
    if (e.type === 'trickCompleted') {
      this.#lastTrick = `${String(e.label)} (${String(e.cleanliness)}, θ=${Number(e.thetaDeg).toFixed(0)}°)`;
    } else if (e.type === 'bail') {
      this.#lastBailReason = String(e.reason);
      this.#lastTrick = `bail: ${this.#lastBailReason}`;
      this.#showVignette();
    } else if (e.type === 'respawn') {
      this.#showRespawnFade();
    }
  }

  update(obs: ObserveState): void {
    const speed = Math.hypot(obs.board.lv.x, obs.board.lv.z);
    const glyph = (planted: boolean): string => (planted ? '●' : '○');
    const color = PHASE_COLORS[obs.phase] ?? PHASE_COLORS['none']!;

    this.#pip.style.background = color;
    this.#pip.style.color = color; // drives the pip glow (currentColor)
    this.#phaseText.style.color = color;
    this.#phaseText.textContent = `${obs.phase.toUpperCase()}${obs.label ? ` · ${obs.label}` : ''}`;

    this.#stats.textContent =
      `score ${obs.score}   ${speed.toFixed(2)} m/s\n` +
      `step ${obs.step}\n` +
      `feet  nose ${glyph(obs.feet.nose.planted)}   tail ${glyph(obs.feet.tail.planted)}\n` +
      `src ${obs.inputSource ?? 'none'}   L${obs.assistLevel}`;
    this.#trickChip.textContent = `trick ${this.#lastTrick}`;
    this.#failChip.textContent = `fail ${obs.lastFailReason ?? '—'}`;

    // Grind trust loop: candidate pip before latch, balance meter while riding.
    const grind = obs.grind;
    if (grind && (grind.active || grind.candidate)) {
      this.#grindChip.style.display = 'flex';
      if (grind.active) {
        const fam = grind.family === 'fifty-fifty' ? '50-50' : 'BOARDSLIDE';
        this.#grindLabel.textContent = `✦ ${fam}`;
        this.#grindLabel.style.color = 'rgba(120,230,220,0.98)';
      } else {
        this.#grindLabel.textContent = '◇ RAIL ZONE';
        this.#grindLabel.style.color = 'rgba(235,235,235,0.85)';
      }
      // Needle across ±1.0 (the slip band); clean band is drawn at ±0.45.
      const b = Math.max(-1, Math.min(1, grind.balance));
      this.#grindNeedle.style.left = `${50 + b * 50}%`;
    } else {
      this.#grindChip.style.display = 'none';
    }

    // Bail banner tracks the live phase (transient, top-edge).
    if (obs.phase === 'bail') {
      this.#bailBanner.textContent = `BAIL — ${(obs.lastFailReason ?? this.#lastBailReason).toUpperCase()}`;
      this.#bailBanner.style.opacity = '1';
    } else {
      this.#bailBanner.style.opacity = '0';
    }
  }

  /** The persistent top-left cluster element (self-check overlap test). */
  get element(): HTMLDivElement {
    return this.#root;
  }

  #showVignette(): void {
    if (this.#opts.reducedMotion) return;
    this.#vignette.animate(
      [{ opacity: 1 }, { opacity: 1, offset: 0.55 }, { opacity: 0 }],
      { duration: this.#opts.vignetteMs, easing: 'ease-out' },
    );
  }

  #showRespawnFade(): void {
    if (this.#opts.reducedMotion) return; // instant cut
    this.#fade.animate(
      [{ opacity: 0 }, { opacity: 0.92, offset: 0.5 }, { opacity: 0 }],
      { duration: this.#opts.respawnFadeMs, easing: 'ease-in-out' },
    );
  }

  dispose(): void {
    this.#unsubscribe();
    this.#root.remove();
    this.#bailBanner.remove();
    this.#vignette.remove();
    this.#fade.remove();
  }
}
