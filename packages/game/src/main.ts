/**
 * Dev bootstrap (M3). Wires SimWorld + InputHub + AgentHarness under a
 * fixed-timestep GameLoop with the debug three.js renderer, the on-screen
 * VirtualTrackpad DEV PAD (the browser way to play), a ProfileStore, and a
 * debug text HUD.
 *
 * The VirtualTrackpad emits SYNTHETIC ContactFrames through the same InputHub as
 * hardware would; the M3 recognizer/controller pipeline (FootTracker →
 * BoardController → SimWorld) runs inside AgentHarness.#advance, so holding both
 * feet cruises, kicking pushes, and rotating steers — all through the one path.
 */

import {
  CONTACT_FRAME_SCHEMA_VERSION,
  DEFAULT_SIM_CONFIG,
  deepFreezeConfig,
} from '@slackpad/shared';
import { AgentHarness } from './agent/AgentHarness';
import { GameLoop } from './app/GameLoop';
import { DebugRenderer } from './render/DebugRenderer';
import { DebugHud } from './render/DebugHud';
import { ProfileStore } from './input/ProfileStore';
import { VirtualTrackpad } from './input/VirtualTrackpad';

const BOOT_SEED = 0x5eed;
const LEVEL_ID = 'flat-dev';

async function boot(): Promise<void> {
  const config = deepFreezeConfig(structuredClone(DEFAULT_SIM_CONFIG));

  const app = document.getElementById('app');
  if (!app) throw new Error('missing #app');

  // `harness` reads the profile via the provider on reset() only (not at
  // construction), so `profileStore` is safely assigned before the first reset.
  let profileStore: ProfileStore;
  const harness = new AgentHarness(config, () => profileStore.get());
  profileStore = new ProfileStore(harness.getTelemetry());
  await harness.reset(BOOT_SEED, LEVEL_ID);
  harness.getInputHub().registerSource('synthetic');

  const renderer = new DebugRenderer(app, config);
  harness.setScreenshotProvider(renderer.captureScreenshot);
  const hud = new DebugHud(app, harness.getTelemetry());

  // DEV PAD: the browser input device. Frames flow through the real InputHub.
  const virtualPad = new VirtualTrackpad(app, harness.getInputHub(), profileStore);

  // A profile change (stance/calibration/assist) is read immutably by the
  // harness on reset — re-reset so the dev edit applies immediately from step 0.
  let resetting = false;
  profileStore.subscribe(() => {
    if (resetting) return;
    resetting = true;
    void harness.reset(BOOT_SEED, LEVEL_ID).finally(() => {
      resetting = false;
    });
  });

  const loop = new GameLoop(
    {
      onStep: () => {
        harness.step(1);
      },
      onRender: (alpha) => {
        renderer.render(harness.interpolatedRenderPose(alpha));
        hud.update(harness.observe());
      },
    },
    config,
  );

  loop.start();

  // Dev-only debug handle: adds `virtualPad` and `profile` per the M3 brief.
  if (import.meta.env.DEV) {
    (window as unknown as Record<string, unknown>).__slackpad = {
      harness,
      loop,
      renderer,
      hud,
      virtualPad,
      profile: profileStore,
      renderNow: (alpha = 1) => renderer.render(harness.interpolatedRenderPose(alpha)),
    };
  }

  console.info(
    `[slackpad m3] boot ok — contactFrame v${CONTACT_FRAME_SCHEMA_VERSION}, ` +
      `sim @${config.physics.hz}Hz, level=${LEVEL_ID}, seed=${BOOT_SEED}. ` +
      `DEV PAD: LMB=footA, Shift=footB, Space=kick, S/C/0-1-2 = stance/calibrate/assist.`,
  );
}

void boot();
