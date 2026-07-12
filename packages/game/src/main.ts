/**
 * Dev bootstrap (M3 → M7). Wires SimWorld + InputHub + AgentHarness under a
 * fixed-timestep GameLoop with the M7 GameRenderer (HDRI plaza, staged hero
 * board + shoes, camera rig), the on-screen VirtualTrackpad DEV PAD, a
 * ProfileStore, and the polished debug HUD.
 *
 * The VirtualTrackpad emits SYNTHETIC ContactFrames through the same InputHub as
 * hardware would; the recognizer/controller pipeline (FootTracker →
 * BoardController → SimWorld) runs inside AgentHarness.#advance, so holding both
 * feet cruises, kicking pushes, and rotating steers — all through the one path.
 *
 * The renderer/camera/shoes are PRESENTATION ONLY: they read via the harness
 * accessors (observe / interpolatedRenderPose) and never step physics or write
 * sim/input state. DebugRenderer is retained for headless tests.
 */

import {
  CONTACT_FRAME_SCHEMA_VERSION,
  DEFAULT_SIM_CONFIG,
  deepFreezeConfig,
} from '@slackpad/shared';
import { AgentHarness } from './agent/AgentHarness';
import { GameLoop } from './app/GameLoop';
import { GameRenderer } from './render/GameRenderer';
import { DebugHud } from './render/DebugHud';
import { runSelfCheck, visualCheck } from './render/selfCheck';
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

  const bootProfile = profileStore.get();
  const renderer = await GameRenderer.create(app, config, {
    stance: bootProfile.stance,
    reducedMotion: bootProfile.accessibility.reducedMotion,
  });
  harness.setScreenshotProvider(renderer.captureScreenshot);

  const hud = new DebugHud(app, harness.getTelemetry(), {
    reducedMotion: bootProfile.accessibility.reducedMotion,
    highContrast: bootProfile.accessibility.highContrastHud,
    vignetteMs: config.presentation.bailVignetteMs,
    respawnFadeMs: config.presentation.respawnFadeMs,
  });

  // DEV PAD: the browser input device. Frames flow through the real InputHub.
  const virtualPad = new VirtualTrackpad(app, harness.getInputHub(), profileStore);

  // A profile change (stance/calibration/assist) is read immutably by the
  // harness on reset — re-reset so the dev edit applies immediately from step 0.
  // reducedMotion is also pushed live to the camera rig (cheap); stance→shoe
  // L/R re-mapping needs a renderer reload (deferred — boot-time stance stands).
  let resetting = false;
  profileStore.subscribe(() => {
    renderer.cameraRig.setReducedMotion(profileStore.get().accessibility.reducedMotion);
    if (resetting) return;
    resetting = true;
    void harness.reset(BOOT_SEED, LEVEL_ID).finally(() => {
      resetting = false;
    });
  });

  let firstRenderDone = false;
  const loop = new GameLoop(
    {
      onStep: () => {
        harness.step(1);
      },
      onRender: (alpha) => {
        const obs = harness.observe();
        renderer.render(harness.interpolatedRenderPose(alpha), obs);
        hud.update(obs);
        if (!firstRenderDone) {
          firstRenderDone = true;
          // Run the visual self-check once a real frame is on screen.
          requestAnimationFrame(() => runSelfCheck(renderer, hud, harness.getTelemetry()));
        }
      },
    },
    config,
  );

  loop.start();

  // Dev-only debug handle: M3 (virtualPad/profile) + M7 (renderer/camera/visualCheck).
  if (import.meta.env.DEV) {
    (window as unknown as Record<string, unknown>).__slackpad = {
      harness,
      loop,
      renderer,
      camera: renderer.camera,
      cameraRig: renderer.cameraRig,
      hud,
      virtualPad,
      profile: profileStore,
      renderNow: (alpha = 1) => renderer.render(harness.interpolatedRenderPose(alpha), harness.observe()),
      selfCheck: () => runSelfCheck(renderer, hud, harness.getTelemetry()),
      visualCheck: () => visualCheck(renderer, hud, harness.getTelemetry(), () => harness.observe()),
    };
  }

  console.info(
    `[slackpad m7] boot ok — contactFrame v${CONTACT_FRAME_SCHEMA_VERSION}, ` +
      `sim @${config.physics.hz}Hz, level=${LEVEL_ID}, seed=${BOOT_SEED}. ` +
      `STAGED ART (pending promotion). DEV PAD: LMB=footA, Shift=footB, Space=kick, ` +
      `S/C/0-1-2 = stance/calibrate/assist. window.__slackpad.visualCheck() saves rubric shots.`,
  );
}

void boot();
