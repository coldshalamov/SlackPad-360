/**
 * Dev bootstrap (M2). Wires SimWorld + InputHub + AgentHarness under a
 * fixed-timestep GameLoop with a debug three.js renderer, and drives a small
 * scripted SYNTHETIC ContactFrame sequence (two contacts planting) to
 * demonstrate frames flowing through the real InputHub while the board drops
 * onto the ground and settles.
 *
 * Nothing here is a privileged shortcut: the synthetic frames enter through the
 * same InputHub.push path as hardware would. Recognition is not wired yet (M4),
 * so the frames are consumed and logged but do not yet move the board.
 */

import {
  CONTACT_FRAME_SCHEMA_VERSION,
  DEFAULT_SIM_CONFIG,
  deepFreezeConfig,
} from '@slackpad/shared';
import type { ContactFrame } from '@slackpad/shared';
import { AgentHarness } from './agent/AgentHarness';
import { GameLoop } from './app/GameLoop';
import { DebugRenderer } from './render/DebugRenderer';

const BOOT_SEED = 0x5eed;
const LEVEL_ID = 'flat-dev';

/** Steps at which a synthetic "both feet plant" frame is emitted. */
const PLANT_STEPS = new Set([12, 45, 90]);

function makePlantFrame(step: number, frameId: number, dtMs: number): ContactFrame {
  return {
    schemaVersion: CONTACT_FRAME_SCHEMA_VERSION,
    frameId,
    tPerfMs: step * dtMs,
    source: 'synthetic',
    contacts: [
      { id: 1, tip: true, x: 0.4, y: 0.55, confidence: true },
      { id: 2, tip: true, x: 0.6, y: 0.55, confidence: true },
    ],
    buttons: { primary: false, secondary: false, auxiliary: false },
  };
}

async function boot(): Promise<void> {
  const config = deepFreezeConfig(structuredClone(DEFAULT_SIM_CONFIG));
  const dtMs = 1000 / config.physics.hz;

  const app = document.getElementById('app');
  if (!app) throw new Error('missing #app');

  const harness = new AgentHarness(config);
  await harness.reset(BOOT_SEED, LEVEL_ID);
  harness.getInputHub().registerSource('synthetic');

  const renderer = new DebugRenderer(app, config);
  harness.setScreenshotProvider(renderer.captureScreenshot);

  let frameId = 0;
  const loop = new GameLoop(
    {
      onStep: () => {
        // Enqueue scheduled synthetic frames for the step about to execute, so
        // they are drained by that step (drain-all-then-step-once).
        const step = harness.getStep();
        if (PLANT_STEPS.has(step)) {
          harness.getInputHub().push(makePlantFrame(step, frameId++, dtMs));
        }
        harness.step(1);
      },
      onRender: (alpha) => {
        renderer.render(harness.interpolatedRenderPose(alpha));
      },
    },
    config,
  );

  loop.start();

  // Dev-only debug handle: lets tooling (browser console, automated visual
  // checks) drive the harness and renderer even when rAF is throttled (hidden
  // tabs). Excluded from production builds; ship builds gate the agent API.
  if (import.meta.env.DEV) {
    (window as unknown as Record<string, unknown>).__slackpad = {
      harness,
      loop,
      renderer,
      renderNow: (alpha = 1) => renderer.render(harness.interpolatedRenderPose(alpha)),
    };
  }

  // Lightweight status logging without a wall-clock timer inside the sim.
  const telemetry = harness.getTelemetry();
  setInterval(() => {
    const snap = telemetry.snapshot();
    const obs = harness.observe();
    // eslint-disable-next-line no-console
    console.info(
      `[slackpad m2] step=${obs.step} hz=${config.physics.hz} ` +
        `boardY=${obs.board.p.y.toFixed(3)} frames+=${snap.counts.frameAccepted ?? 0} ` +
        `rejected=${snap.counts.frameRejected ?? 0} inputSrc=${obs.inputSource ?? 'none'}`,
    );
  }, 1000);

  console.info(
    `[slackpad m2] boot ok — contactFrame v${CONTACT_FRAME_SCHEMA_VERSION}, ` +
      `sim @${config.physics.hz}Hz (fixed dt=${dtMs.toFixed(3)}ms), level=${LEVEL_ID}, seed=${BOOT_SEED}`,
  );
}

void boot();
