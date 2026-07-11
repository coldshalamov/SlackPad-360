/**
 * DebugHud — dev-only text overlay (M3): step, board speed, per-foot plant
 * glyphs, and the last kick mask. It only READS: an ObserveState handed in each
 * frame plus telemetry 'kick' events. It never writes sim state.
 */

import type { ObserveState } from '@slackpad/shared';
import type { Telemetry } from '../telemetry/Telemetry';

export class DebugHud {
  private readonly el: HTMLDivElement;
  private lastKickMask = '—';
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

    this.unsubscribe = telemetry.subscribe((e) => {
      if (e.type !== 'kick') return;
      const mask = (e as Record<string, unknown>).mask;
      if (typeof mask === 'string') this.lastKickMask = mask;
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
      `src ${obs.inputSource ?? 'none'}`;
  }

  dispose(): void {
    this.unsubscribe();
    this.el.remove();
  }
}
