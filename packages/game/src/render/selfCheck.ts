/**
 * Visual self-check (M7) — the pragmatic stand-in for the spec's "screenshot
 * framing tests; no HUD overlap". A browser render can't be driven headlessly
 * without a browser driver, so instead of a CI test we run an in-page check
 * after the first real frame and expose an on-demand rubric-shot saver:
 *
 *   - center pixels non-blank (something actually rendered, not a clear frame);
 *   - the HUD cluster's bounding box does NOT overlap the board's on-screen
 *     projection (art rubric S7 / camera spec: no HUD over the board centre);
 *   - a `visualSelfCheck` telemetry event carries the pass/fail + numbers;
 *   - `window.__slackpad.visualCheck()` saves the rubric shots (S2 planted, S3
 *     air, S6 bail, S7 1366×768 + 1920×1080 framings, S8 perf still) through the
 *     /__shot dev sink into preproduction/evidence/impl/m7-visual/.
 *
 * Presentation-only; reads the renderer + HUD DOM, never the sim.
 */

import type { GameRenderer } from './GameRenderer';
import type { DebugHud } from './DebugHud';
import type { Telemetry } from '../telemetry/Telemetry';
import type { ObserveState } from '@slackpad/shared';

const EVIDENCE_DIR = 'm7-visual';

export interface SelfCheckResult {
  centerLuma: number;
  centerNonblank: boolean;
  hudRect: { x: number; y: number; w: number; h: number } | null;
  boardScreen: { x: number; y: number } | null;
  hudOverlapsBoard: boolean;
  shotMode: string;
  pass: boolean;
}

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

function intersects(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

/** Run the non-blank + no-overlap check and log a `visualSelfCheck` event. */
export function runSelfCheck(renderer: GameRenderer, hud: DebugHud, telemetry: Telemetry): SelfCheckResult {
  const center = renderer.readbackCenter();
  const boardScreen = renderer.projectBoardCenter();
  const domRect = hud.element.getBoundingClientRect();
  const hudRect: Rect = { x: domRect.left, y: domRect.top, w: domRect.width, h: domRect.height };

  let hudOverlapsBoard = false;
  if (boardScreen) {
    // Approximate the board's on-screen footprint as a box around its centre.
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const half = Math.min(vw, vh) * 0.15;
    const boardBox: Rect = { x: boardScreen.x - half, y: boardScreen.y - half, w: half * 2, h: half * 2 };
    hudOverlapsBoard = intersects(hudRect, boardBox);
  }

  const pass = center.nonblank && !hudOverlapsBoard;
  const result: SelfCheckResult = {
    centerLuma: Math.round(center.luma * 10) / 10,
    centerNonblank: center.nonblank,
    hudRect,
    boardScreen: boardScreen ? { x: Math.round(boardScreen.x), y: Math.round(boardScreen.y) } : null,
    hudOverlapsBoard,
    shotMode: renderer.shotMode,
    pass,
  };
  telemetry.log({ type: 'visualSelfCheck', ...result });
  return result;
}

async function postShot(name: string, dataUrl: string | null): Promise<string | null> {
  if (!dataUrl) return null;
  try {
    const res = await fetch('/__shot', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name, dir: EVIDENCE_DIR, dataUrl }),
    });
    const json = (await res.json()) as { ok: boolean; file?: string };
    return json.ok ? (json.file ?? name) : null;
  } catch {
    return null;
  }
}

/** Auto-name the "current state" shot by phase (covers S2 / S3 / S6). */
function stateShotName(obs: ObserveState): string {
  if (obs.phase === 'bail') return 's6-bail';
  if (obs.phase === 'air' || obs.phase === 'catch') return 's3-air';
  if ((obs.phase === 'ground' || obs.phase === 'none') && obs.feet.nose.planted && obs.feet.tail.planted) {
    return 's2-planted';
  }
  return `state-${obs.phase}`;
}

export interface VisualCheckReport extends SelfCheckResult {
  saved: string[];
}

/**
 * On-demand: run the self-check AND save the rubric shots. The orchestrator
 * calls this from the browser after driving the board into each state.
 */
export async function visualCheck(
  renderer: GameRenderer,
  hud: DebugHud,
  telemetry: Telemetry,
  observe: () => ObserveState,
): Promise<VisualCheckReport> {
  const result = runSelfCheck(renderer, hud, telemetry);
  const saved: string[] = [];
  const obs = observe();

  // Current state + a perf-still at the live resolution.
  renderer.settleAndRender();
  saved.push((await postShot(stateShotName(obs), renderer.captureScreenshot())) ?? '');
  saved.push((await postShot('s8-perf-still', renderer.captureScreenshot())) ?? '');

  // S7 framing safety at both desktop resolutions.
  for (const [w, h] of [
    [1366, 768],
    [1920, 1080],
  ] as const) {
    renderer.setViewport(w, h);
    renderer.settleAndRender();
    saved.push((await postShot(`s7-${w}x${h}`, renderer.captureScreenshot())) ?? '');
  }
  renderer.resize(); // restore live viewport

  return { ...result, saved: saved.filter(Boolean) };
}
