/**
 * DebugHud — dev-only text overlay (M3+M4): step, board speed, per-foot plant
 * glyphs, the last kick mask, and the M4 maneuver readout (phase, open label,
 * last trick result, last fail reason). It only READS: an ObserveState handed
 * in each frame plus telemetry events. It never writes sim state.
 */

import type { ObserveState } from '@slackpad/shared';
import type { Telemetry } from '../telemetry/Telemetry';

/** Phase → HUD color: readable failure is a design requirement (spec §7). */
const PHASE_COLORS: Record<string, string> = {
  none: 'rgba(150,165,180,0.9)',
  ground: 'rgba(120,200,160,0.95)',
  pop: 'rgba(250,220,120,0.95)',
  air: 'rgba(120,190,255,0.95)',
  catch: 'rgba(190,150,255,0.95)',
  bail: 'rgba(255,110,90,0.95)',
};

export class DebugHud {
  private readonly el: HTMLDivElement;
  private readonly phaseEl: HTMLDivElement;
  private lastKickMask = '—';
  private lastTrick = '—';
  private readonly unsubscribe: () => void;

  constructor(container: HTMLElement, telemetry: Telemetry) {
    const el = document.createElement('div');
    Object.assign(el.style, {
      position: 'fixed',
      top: '12px',
      left: '12px',
      padding: '8px 12px',
      font: '12px ui-monospace, SFMono-Regular, Menlo, monospace',
      color: 'rgba(210,225,240,0.92)',
      background: 'rgba(12,16,22,0.7)',
      borderRadius: '8px',
      whiteSpace: 'pre',
      pointerEvents: 'none',
      zIndex: '10',
    });
    container.appendChild(el);
    this.el = el;

    // M4 phase banner: big + color-coded so pop/air/catch/bail reads at a glance.
    const phaseEl = document.createElement('div');
    Object.assign(phaseEl.style, {
      position: 'fixed',
      top: '12px',
      left: '50%',
      transform: 'translateX(-50%)',
      padding: '6px 18px',
      font: 'bold 16px ui-monospace, SFMono-Regular, Menlo, monospace',
      background: 'rgba(12,16,22,0.7)',
      borderRadius: '8px',
      pointerEvents: 'none',
      zIndex: '10',
    });
    container.appendChild(phaseEl);
    this.phaseEl = phaseEl;

    this.unsubscribe = telemetry.subscribe((e) => {
      if (e.type === 'kick') {
        const mask = (e as Record<string, unknown>).mask;
        if (typeof mask === 'string') this.lastKickMask = mask;
      } else if (e.type === 'trickCompleted') {
        const ev = e as Record<string, unknown>;
        this.lastTrick = `${String(ev.label)} (${String(ev.cleanliness)}, θ=${Number(ev.thetaDeg).toFixed(0)}°)`;
      } else if (e.type === 'bail') {
        this.lastTrick = `bail: ${String((e as Record<string, unknown>).reason)}`;
      }
    });
  }

  update(obs: ObserveState): void {
    const speed = Math.hypot(obs.board.lv.x, obs.board.lv.z);
    const glyph = (planted: boolean): string => (planted ? '●' : '○');
    this.el.textContent =
      `step ${obs.step}\n` +
      `speed ${speed.toFixed(2)} m/s\n` +
      `feet nose ${glyph(obs.feet.nose.planted)}  tail ${glyph(obs.feet.tail.planted)}\n` +
      `last kick ${this.lastKickMask}\n` +
      `last trick ${this.lastTrick}\n` +
      `fail ${obs.lastFailReason ?? '—'}\n` +
      `src ${obs.inputSource ?? 'none'}`;

    const phase = obs.phase;
    const label = obs.label ? ` · ${obs.label}` : '';
    this.phaseEl.textContent = `${phase.toUpperCase()}${label}`;
    this.phaseEl.style.color = PHASE_COLORS[phase] ?? PHASE_COLORS['none']!;
  }

  dispose(): void {
    this.unsubscribe();
    this.el.remove();
    this.phaseEl.remove();
  }
}
