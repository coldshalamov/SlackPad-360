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
import { HostInputSource } from './input/HostInputSource';
import { PauseMenu } from './ui/PauseMenu';
import { ControlGuide } from './ui/ControlGuide';
import { DEFAULT_LEVEL_ID } from './sim/levels/index';

const BOOT_SEED = 0x5eed;

async function boot(): Promise<void> {
  const config = deepFreezeConfig(structuredClone(DEFAULT_SIM_CONFIG));

  const app = document.getElementById('app');
  if (!app) throw new Error('missing #app');

  // `harness` reads the profile via the provider on reset() only (not at
  // construction), so `profileStore` is safely assigned before the first reset.
  let profileStore: ProfileStore;
  const harness = new AgentHarness(config, () => profileStore.get());
  profileStore = new ProfileStore(harness.getTelemetry());
  await harness.reset(BOOT_SEED, DEFAULT_LEVEL_ID);
  harness.getInputHub().registerSource('synthetic');

  const bootProfile = profileStore.get();
  const renderer = await GameRenderer.create(app, config, {
    stance: bootProfile.stance,
    reducedMotion: bootProfile.accessibility.reducedMotion,
    levelId: DEFAULT_LEVEL_ID,
  });
  harness.setScreenshotProvider(renderer.captureScreenshot);

  const hud = new DebugHud(app, harness.getTelemetry(), {
    reducedMotion: bootProfile.accessibility.reducedMotion,
    highContrast: bootProfile.accessibility.highContrastHud,
    vignetteMs: config.presentation.bailVignetteMs,
    respawnFadeMs: config.presentation.respawnFadeMs,
  });

  // Native host bridge: when running inside the WebView2 GameForm, REAL trackpad
  // frames stream in through the SAME InputHub. In a plain browser this is inert
  // (window.chrome.webview is absent), so browser behavior is unchanged.
  const hostSource = new HostInputSource(
    harness.getInputHub(),
    harness.getTelemetry(),
    (focused) => {
      if (!focused) harness.releaseInputs('host-focus-lost');
    },
  );
  const underHost = hostSource.active;
  if (underHost) hostSource.attach();
  const controlGuide = underHost ? new ControlGuide(app, bootProfile) : undefined;

  // DEV PAD: the browser input device. Frames flow through the real InputHub.
  // Under the native host the real trackpad is live, so the DEV PAD is hidden by
  // default (its synthetic frames would race the hardware stream through one
  // InputHub) — opt back in with ?devpad=1 for debugging.
  const showDevPad = !underHost || new URLSearchParams(window.location.search).has('devpad');
  const virtualPad = showDevPad
    ? new VirtualTrackpad(app, harness.getInputHub(), profileStore)
    : undefined;

  // A profile change (stance/calibration/assist) is read immutably by the
  // harness on reset — re-reset so the dev edit applies immediately from step 0.
  // reducedMotion is also pushed live to the camera rig (cheap); stance→shoe
  // L/R re-mapping needs a renderer reload (deferred — boot-time stance stands).
  let resetPromise: Promise<void> | null = null;
  const resetWorld = (): Promise<void> => {
    if (resetPromise) return resetPromise;
    resetPromise = harness.reset(BOOT_SEED, DEFAULT_LEVEL_ID).finally(() => {
      resetPromise = null;
    });
    return resetPromise;
  };
  profileStore.subscribe(() => {
    const profile = profileStore.get();
    renderer.cameraRig.setReducedMotion(profile.accessibility.reducedMotion);
    controlGuide?.setProfile(profile);
    void resetWorld();
  });

  let firstRenderDone = false;
  const loop = new GameLoop(
    {
      onStep: () => {
        harness.step(1);
      },
      onRender: (alpha, frameDeltaSeconds) => {
        const obs = harness.observe();
        renderer.render(harness.interpolatedRenderPose(alpha), obs, frameDeltaSeconds);
        hud.update(obs);
        controlGuide?.update(obs);
        if (!firstRenderDone) {
          firstRenderDone = true;
          // Run the visual self-check once a real frame is on screen.
          requestAnimationFrame(() => runSelfCheck(renderer, hud, harness.getTelemetry()));
        }
      },
    },
    config,
  );

  const pauseMenu = new PauseMenu(app, {
    onPause: () => {
      harness.getInputHub().setPaused(true);
      loop.stop();
    },
    onResume: () => {
      harness.getInputHub().setPaused(false);
      loop.start();
    },
    onRestart: resetWorld,
    onQuit: () => {
      if (!hostSource.quit()) window.close();
    },
  });

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
      pauseMenu,
      controlGuide,
      renderNow: (alpha = 1) => renderer.render(harness.interpolatedRenderPose(alpha), harness.observe()),
      selfCheck: () => runSelfCheck(renderer, hud, harness.getTelemetry()),
      visualCheck: () => visualCheck(renderer, hud, harness.getTelemetry(), () => harness.observe()),
    };
  }

  console.info(
    `[slackpad m7] boot ok — contactFrame v${CONTACT_FRAME_SCHEMA_VERSION}, ` +
      `sim @${config.physics.hz}Hz, level=${DEFAULT_LEVEL_ID}, seed=${BOOT_SEED}. ` +
      `STAGED ART (pending promotion). DEV PAD: LMB=footA, Shift=footB, Space=kick, ` +
      `S/C/0-1-2 = stance/calibrate/assist. window.__slackpad.visualCheck() saves rubric shots.`,
  );
}

void boot();
