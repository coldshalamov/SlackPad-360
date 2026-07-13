/**
 * AgentHarness — the ONLY privileged automation surface (architecture §3.4,
 * §7; observability §6). Everything the agent can do goes through the same
 * InputHub → drain → step path as hardware. There is deliberately NO
 * setBoardPose / forceTrick / applyImpulse — the agent injects ContactFrames
 * and observes; it cannot shortcut the sim. The agent-contract test asserts the
 * absence of those members AND that the raw physics world is unreachable at
 * runtime (ECMAScript #private fields, not TypeScript-only privacy).
 *
 * Step orchestration (the M2-chosen frame-consumption policy): each step drains
 * ALL pending ordered frames, runs the recognizer/assist pipeline (M3 ground
 * locomotion + M4 maneuver FSM), steps the world once, then snapshots.
 *
 * Determinism note (G4): frames are canonicalized (quantized + rebuilt) at
 * InputHub intake, so the sim consumes bit-identical values live and on
 * replay. Checkpoint hashes fold in a running digest of every consumed frame,
 * making record/replay divergence in the INPUT path detectable even while
 * frames do not yet drive physics.
 */

import {
  CONTACT_FRAME_SCHEMA_VERSION,
  DEFAULT_INPUT_PROFILE,
  DEFAULT_SIM_CONFIG,
  REPLAY_VERSION,
  deepFreezeConfig,
  fnv1a,
} from "@slackpad/shared";
import type {
  ContactFrame,
  ContactFrameSource,
  InputProfile,
  ObserveState,
  ReplayCheckpoint,
  ReplayHeader,
  SessionTrace,
  SimConfig,
} from "@slackpad/shared";
import { SimWorld } from "../sim/SimWorld";
import type { BoardPose, RenderPose } from "../sim/SimWorld";
import { InputHub } from "../input/InputHub";
import { Telemetry } from "../telemetry/Telemetry";
import { FootTracker } from "../input/FootTracker";
import type { FeetState } from "../input/FootTracker";
import { BoardController } from "../control/BoardController";
import { KickArbiter } from "../control/KickArbiter";
import { GestureFSM } from "../control/GestureFSM";
import { ManeuverAssist } from "../control/ManeuverAssist";
import { DEFAULT_LEVEL_ID } from "../sim/levels/index";

/** Reads the current InputProfile snapshot on each reset (dev ProfileStore). */
export type ProfileProvider = () => InputProfile;

/** Pinned versions recorded in replay headers (must match package.json). */
export const GAME_VERSION = "0.1.0";
export const RAPIER_VERSION = "0.19.3";

/** Pose hashing precision: round to 1e-6 before hashing (micrometer / µquat). */
const HASH_QUANT = 1_000_000;

/** Digest seed for the consumed-frame input digest (FNV offset basis, hex). */
const INPUT_DIGEST_SEED = "811c9dc5";

/** A frame the agent may inject; `source` is optional and defaults to 'agent'. */
export type InjectableFrame = Omit<ContactFrame, "source"> & {
  source?: ContactFrameSource;
};

/** Optional renderer-supplied screenshot capability (arch §3.4). */
export type ScreenshotProvider = () => Promise<string | null> | string | null;

/**
 * Stable checkpoint hash over quantized board pose + maneuver phase + the
 * consumed-input digest. Positions and quaternion components are rounded to
 * integers at HASH_QUANT so tiny float noise never changes the hash while
 * genuine divergence always does.
 */
export function checkpointHash(
  pose: BoardPose | RenderPose,
  phase: string,
  inputDigest = "",
): string {
  const { p, q } = pose;
  const parts = [p.x, p.y, p.z, q.x, q.y, q.z, q.w].map((v) =>
    Math.round(v * HASH_QUANT).toString(),
  );
  return fnv1a(`${parts.join(",")}|${phase}|${inputDigest}`);
}

export class AgentHarness {
  // ECMAScript #private: unreachable at runtime, even via `as any` casts.
  #world: SimWorld;
  #inputHub: InputHub;
  #telemetry: Telemetry;
  #config: SimConfig;

  // M3/M4 recognizer/controller pipeline (runs inside #advance, single-step
  // auth): FootTracker → KickArbiter → GestureFSM → ManeuverAssist +
  // BoardController → SimWorld command application.
  #profileProvider: ProfileProvider | null;
  #profile: InputProfile;
  #footTracker: FootTracker;
  #boardController: BoardController;
  #kickArbiter: KickArbiter;
  #fsm: GestureFSM;
  #assist: ManeuverAssist;
  #feetState: FeetState | null = null;

  #assistLevel: 0 | 1 | 2;
  #lastInputSource: ContactFrameSource | null = null;
  #score = 0;

  /** Running FNV-chain digest over every frame consumed since reset. */
  #inputDigest = INPUT_DIGEST_SEED;

  // Recording state.
  #recording = false;
  #recordHeader: ReplayHeader | null = null;
  #recordedFrames: Array<{ step: number; frame: ContactFrame }> = [];
  #recordedCheckpoints: ReplayCheckpoint[] = [];

  #screenshotProvider: ScreenshotProvider | null = null;

  constructor(
    config: SimConfig = DEFAULT_SIM_CONFIG,
    profileProvider: ProfileProvider | null = null,
  ) {
    this.#config = config;
    this.#telemetry = new Telemetry(config.runtime.telemetry.ringCapacity);
    this.#telemetry.subscribe((event) => {
      if (event.type === "trickCompleted") {
        const label = String(event.label);
        const base = /flip|heel/i.test(label)
          ? 300
          : /shuv/i.test(label)
            ? 250
            : 100;
        const clean = event.cleanliness === "clean" ? 1.5 : 1;
        const flips =
          typeof event.flipRotations === "number" ? event.flipRotations : 0;
        const shuv =
          typeof event.shuvDegrees === "number" ? event.shuvDegrees : 0;
        const rotation = Math.round(
          Math.abs(flips) * 100 + Math.abs(shuv) * 0.5,
        );
        this.#score += Math.round(base * clean) + rotation;
      } else if (event.type === "grindCompleted") {
        const cleanFraction =
          typeof event.cleanFraction === "number" ? event.cleanFraction : 0;
        const durationSteps =
          typeof event.durationSteps === "number" ? event.durationSteps : 0;
        const quality = 0.5 + 0.5 * cleanFraction;
        this.#score += Math.max(25, Math.round(durationSteps * 5 * quality));
      }
    });
    this.#world = new SimWorld(config);
    this.#inputHub = new InputHub(this.#telemetry);
    this.#profileProvider = profileProvider;
    // Init from DEFAULT here; the provider (if any) is read on reset() only, so
    // construction never depends on a store that is wired up after the harness.
    this.#profile = deepFreezeConfig(structuredClone(DEFAULT_INPUT_PROFILE));
    this.#assistLevel = this.#profile.assistLevel;
    this.#footTracker = this.#makeFootTracker();
    this.#boardController = this.#makeBoardController();
    this.#kickArbiter = this.#makeKickArbiter();
    this.#fsm = this.#makeGestureFsm();
    this.#assist = new ManeuverAssist(
      this.#config,
      this.#assistLevel,
      this.#telemetry,
    );
  }

  /** Deep-frozen private copy of the current profile — trackers only read it. */
  #snapshotProfile(): InputProfile {
    const src = this.#profileProvider
      ? this.#profileProvider()
      : DEFAULT_INPUT_PROFILE;
    return deepFreezeConfig(structuredClone(src));
  }

  #makeFootTracker(): FootTracker {
    return new FootTracker(
      this.#config.footTracker,
      this.#config.recognition.plantSpeedEps,
      this.#profile,
      this.#telemetry,
    );
  }

  #makeBoardController(): BoardController {
    return new BoardController(
      this.#config.locomotion,
      this.#config.physics,
      this.#profile,
      this.#telemetry,
    );
  }

  #makeKickArbiter(): KickArbiter {
    return new KickArbiter(this.#config, this.#profile, this.#telemetry);
  }

  #makeGestureFsm(): GestureFSM {
    return new GestureFSM(
      this.#config,
      this.#assistLevel,
      this.#profile.stance,
      this.#telemetry,
    );
  }

  /** One-time engine init (idempotent). reset() also awaits this. */
  init(): Promise<void> {
    return this.#world.init();
  }

  /** Rebuild the sim from (seed, levelId) and clear all per-run state. */
  async reset(seed: number, levelId: string = DEFAULT_LEVEL_ID): Promise<void> {
    await this.#world.reset(seed, levelId);
    this.#inputHub.clear();
    this.#telemetry.clear();
    this.#inputHub.registerSource("agent");
    this.#recording = false;
    this.#recordHeader = null;
    this.#recordedFrames = [];
    this.#recordedCheckpoints = [];
    this.#lastInputSource = null;
    this.#score = 0;
    this.#inputDigest = INPUT_DIGEST_SEED;
    // Re-read the profile immutably and rebuild the recognizer/controller so a
    // dev profile edit (stance/calibration/assist) applies from step 0.
    this.#profile = this.#snapshotProfile();
    this.#assistLevel = this.#profile.assistLevel;
    this.#footTracker = this.#makeFootTracker();
    this.#boardController = this.#makeBoardController();
    this.#kickArbiter = this.#makeKickArbiter();
    this.#fsm = this.#makeGestureFsm();
    this.#assist = new ManeuverAssist(
      this.#config,
      this.#assistLevel,
      this.#telemetry,
    );
    this.#feetState = null;
    this.#telemetry.log({ type: "reset", step: 0, seed, levelId });
  }

  /**
   * Inject one or more ContactFrames. Frames are stamped `source: 'agent'` when
   * unset (on a copy — the caller's object is never mutated) and go through the
   * same InputHub validation + canonicalization path as every other source.
   */
  injectContactFrame(input: InjectableFrame | InjectableFrame[]): void {
    const frames = Array.isArray(input) ? input : [input];
    let accepted = 0;
    for (const f of frames) {
      const stamped: ContactFrame = {
        ...f,
        source: f.source ?? "agent",
      } as ContactFrame;
      if (this.#inputHub.push(stamped)) accepted += 1;
    }
    this.#telemetry.log({
      type: "frameInjected",
      source: "agent",
      count: accepted,
    });
  }

  /**
   * Drop every live control latch without resetting the run. Native focus loss
   * can otherwise leave the last two contacts planted indefinitely because no
   * further hardware frame is guaranteed to arrive while the window is idle.
   */
  releaseInputs(reason = "focus-lost"): void {
    this.#inputHub.setPaused(true);
    this.#inputHub.setPaused(false);
    this.#footTracker = this.#makeFootTracker();
    this.#boardController = this.#makeBoardController();
    this.#kickArbiter = this.#makeKickArbiter();
    this.#feetState = null;
    this.#lastInputSource = null;
    this.#telemetry.log({
      type: "inputReleased",
      reason,
      step: this.#world.getStep(),
    });
  }

  /** Advance the sim by n fixed steps (default 1). */
  step(n = 1): void {
    for (let i = 0; i < n; i++) this.#advance();
  }

  /** observe(): read-only, deep-copied ObserveState (exact shared shape). */
  observe(): ObserveState {
    const pose = this.#world.boardPose();
    return {
      step: this.#world.getStep(),
      seed: this.#world.getSeed(),
      board: {
        p: { x: pose.p.x, y: pose.p.y, z: pose.p.z },
        q: { x: pose.q.x, y: pose.q.y, z: pose.q.z, w: pose.q.w },
        lv: { x: pose.lv.x, y: pose.lv.y, z: pose.lv.z },
        av: { x: pose.av.x, y: pose.av.y, z: pose.av.z },
      },
      phase: this.#fsm.phase,
      label: this.#fsm.label?.label ?? null,
      assistLevel: this.#assistLevel,
      feet: {
        nose: this.#footObservation("nose"),
        tail: this.#footObservation("tail"),
      },
      grind: this.#fsm.grindObservation(),
      score: this.#score,
      lastFailReason: this.#fsm.lastFailReason,
      inputSource: this.#lastInputSource,
    };
  }

  /**
   * Project the internal FeetState onto the ObserveState.feet contract — ONLY
   * {planted, board-local socket offset}. The rich FeetState (velocity, segment,
   * offsetFromRest) stays internal; leaking extra keys would break the agent
   * contract. Calibrated pad offset-from-rest maps to a board-local socket
   * offset by locomotion.padToBoardScale (presentation only).
   */
  #footObservation(role: "nose" | "tail"): {
    planted: boolean;
    offset: { x: number; y: number; z: number };
  } {
    const inset = this.#config.physics.truckInsetZ;
    const deckTop = this.#config.physics.deckThickness / 2;
    const baseZ = role === "nose" ? inset : -inset;
    const foot = this.#feetState ? this.#feetState[role] : null;
    if (!foot || !foot.planted) {
      return { planted: false, offset: { x: 0, y: deckTop, z: baseZ } };
    }
    const scale = this.#config.locomotion.padToBoardScale;
    return {
      planted: true,
      offset: {
        x: scale * foot.offsetFromRest.x,
        y: deckTop,
        // Native pad Y grows toward the player's palm; board +Z points toward
        // the nose/screen. Invert it so sliding a finger forward moves the
        // matching virtual foot forward instead of backward.
        z: baseZ - scale * foot.offsetFromRest.y,
      },
    };
  }

  /**
   * Begin recording a SessionTrace. v1 traces are FULL-SESSION: recording must
   * start at step 0 (immediately after reset). A mid-run trace could never
   * replay faithfully — the frames consumed before recording began would be
   * missing from the stream — so it is rejected loudly rather than producing a
   * trace that silently fails G4 later.
   */
  startRecording(): void {
    if (this.#world.getStep() !== 0) {
      throw new Error(
        `startRecording() requires step 0 (full-session trace); current step is ` +
          `${this.#world.getStep()}. Call reset() first.`,
      );
    }
    this.#recordHeader = {
      replayVersion: REPLAY_VERSION,
      gameVersion: GAME_VERSION,
      rapierVersion: RAPIER_VERSION,
      hz: this.#config.physics.hz,
      seed: this.#world.getSeed(),
      levelId: this.#world.getLevelId(),
      // Trace authoring metadata only — never fed into any hash, so wall clock
      // here does not affect determinism.
      createdAt: new Date().toISOString(),
      contactFrameSchema: CONTACT_FRAME_SCHEMA_VERSION,
      profile: {
        stance: DEFAULT_INPUT_PROFILE.stance,
        padYawOffset: DEFAULT_INPUT_PROFILE.padYawOffset,
        assistLevel: DEFAULT_INPUT_PROFILE.assistLevel,
      },
    };
    this.#recordedFrames = [];
    this.#recordedCheckpoints = [];
    this.#recording = true;
    this.#telemetry.log({
      type: "recordingStarted",
      step: this.#world.getStep(),
    });
  }

  /** Stop recording and return the accumulated SessionTrace (deep-copied). */
  stopRecording(): SessionTrace {
    if (!this.#recordHeader) {
      throw new Error("stopRecording() called without startRecording()");
    }
    // Frames were canonicalized (quantized) at intake, so the stored stream is
    // exactly what the sim consumed — no re-quantization step to diverge from.
    const trace: SessionTrace = {
      header: { ...this.#recordHeader },
      frames: this.#recordedFrames.map((r) => ({
        step: r.step,
        frame: structuredClone(r.frame),
      })),
      checkpoints: this.#recordedCheckpoints.map((c) => ({ ...c })),
    };
    this.#recording = false;
    this.#telemetry.log({
      type: "recordingStopped",
      step: this.#world.getStep(),
      frames: trace.frames.length,
      checkpoints: trace.checkpoints.length,
    });
    return trace;
  }

  /**
   * Replay a trace: fresh reset from the header, re-inject the recorded frames
   * at their recorded consumption steps, and recompute the checkpoints. With a
   * deterministic sim these equal the recorded checkpoints (G4).
   *
   * The header is validated against this runtime first — replaying a trace
   * recorded under a different schema/hz/engine build would produce divergence
   * that says nothing about determinism (false alarm) or, worse, accidental
   * agreement (false confidence). Frames recorded after the final checkpoint
   * are ignored by design: nothing after that point is verifiable.
   */
  async replay(trace: SessionTrace): Promise<ReplayCheckpoint[]> {
    this.#validateReplayHeader(trace);

    await this.reset(trace.header.seed, trace.header.levelId);
    const every = this.#config.runtime.replay.checkpointEverySteps;

    const framesByStep = new Map<number, ContactFrame[]>();
    for (const { step, frame } of trace.frames) {
      const bucket = framesByStep.get(step);
      if (bucket) bucket.push(frame);
      else framesByStep.set(step, [frame]);
    }

    const lastCheckpointStep = trace.checkpoints.reduce(
      (m, c) => Math.max(m, c.step),
      0,
    );
    const out: ReplayCheckpoint[] = [];

    while (this.#world.getStep() < lastCheckpointStep) {
      const s = this.#world.getStep();
      const due = framesByStep.get(s);
      if (due) {
        for (const frame of due) {
          // Re-inject preserving the recorded source (do not re-stamp 'agent').
          if (!this.#inputHub.push(frame)) {
            throw new Error(
              `replay: recorded frame (step ${s}, frameId ${frame.frameId}) was ` +
                `rejected by InputHub — the trace cannot reproduce faithfully`,
            );
          }
        }
      }
      this.#advance();
      const ns = this.#world.getStep();
      if (ns % every === 0) {
        out.push({ step: ns, hash: this.#checkpointHash() });
      }
    }
    return out;
  }

  /** Append a diagnostic/telemetry event. */
  log(event: Parameters<Telemetry["log"]>[0]): void {
    this.#telemetry.log(event);
  }

  /**
   * Capture a screenshot via the renderer-registered provider (arch §3.4).
   * Returns a data URL, or null when no renderer is attached (headless tests).
   */
  async captureScreenshot(): Promise<string | null> {
    const provider = this.#screenshotProvider;
    const result = provider ? await provider() : null;
    this.#telemetry.log({ type: "screenshot", captured: result !== null });
    return result;
  }

  /** App-layer wiring: the renderer registers its capture capability here. */
  setScreenshotProvider(provider: ScreenshotProvider | null): void {
    this.#screenshotProvider = provider;
  }

  // --- Accessors for the app layer (loop/renderer/tests) -----------------
  getStep(): number {
    return this.#world.getStep();
  }

  interpolatedRenderPose(alpha: number): RenderPose {
    return this.#world.interpolatedRenderPose(alpha);
  }

  getTelemetry(): Telemetry {
    return this.#telemetry;
  }

  getInputHub(): InputHub {
    return this.#inputHub;
  }

  // --- Core single-step path (shared by step() and replay()) -------------
  #advance(): void {
    const consumeStep = this.#world.getStep();
    const frames = this.#inputHub.drainForStep();

    for (const frame of frames) {
      // Fold every consumed frame into the running digest. JSON order is
      // deterministic here because InputHub canonicalization rebuilds frames
      // with a fixed field order.
      this.#inputDigest = fnv1a(
        `${this.#inputDigest}|${JSON.stringify(frame)}`,
      );
      if (this.#recording)
        this.#recordedFrames.push({ step: consumeStep, frame });
    }

    this.#runRecognizer(frames);
    const worldStep = this.#world.step();
    if (worldStep.recovery) {
      this.#fsm.recoverFromWorld(worldStep.recovery, this.#world.getStep());
    }

    const newStep = this.#world.getStep();
    if (
      this.#recording &&
      newStep % this.#config.runtime.replay.checkpointEverySteps === 0
    ) {
      const hash = this.#checkpointHash();
      this.#recordedCheckpoints.push({ step: newStep, hash });
      this.#telemetry.log({ type: "checkpoint", step: newStep, hash });
    }

    this.#telemetry.log({ type: "stepped", step: newStep });
  }

  /**
   * THE checkpoint hash (M4): pose + the REAL maneuver phase + input digest.
   * One helper shared by #advance (record) and replay() so the two paths can
   * never diverge on what goes into the hash.
   */
  #checkpointHash(): string {
    return checkpointHash(
      this.#world.boardPose(),
      this.#fsm.phase,
      this.#inputDigest,
    );
  }

  /**
   * The per-step recognizer/controller pipeline (M3 ground + M4 maneuvers),
   * run between drain and world.step() (single-step authority):
   *
   *   FootTracker.update(frames)                 — feet + click attribution
   *   → KickArbiter                              — push-vs-ollie in ONE place
   *   → GestureFSM                               — phase machine + labels
   *   → ManeuverAssist                           — clamped maneuver commands
   *   → BoardController (ground phase only)      — locomotion command
   *   → SimWorld.applyGroundForces/applyManeuver — clamps + impulses
   *
   * Impulses apply before the step so they integrate this tick. Nothing here
   * writes board pose — SimWorld validates and clamps every command component.
   */
  #runRecognizer(frames: ContactFrame[]): void {
    if (frames.length > 0) {
      const last = frames[frames.length - 1];
      if (last) this.#lastInputSource = last.source;
    }
    const step = this.#world.getStep();
    const feet = this.#footTracker.update(frames, step);
    const kicks = this.#footTracker.drainKicks();
    const grounded = this.#world.isGrounded();
    const pose = this.#world.boardPose();
    const contactImpulse = this.#world.lastContactImpulseMagnitude();
    const supportContactImpulse =
      this.#world.lastSupportContactImpulseMagnitude();
    const railProximity = this.#world.railProximity();
    // Impact observability (deterministic — derived from sim state only).
    // Normal rolling stays well under 0.5 N·s per step; landings + wall hits
    // show up here, which is what interrupt tuning reads.
    if (contactImpulse > 0.5) {
      this.#telemetry.log({
        type: "contactImpulse",
        step,
        impulse: contactImpulse,
        grounded,
      });
    }

    // Arbitrate kicks against the PREVIOUS step's phase (the FSM gate): pop
    // paths open from riding-on-ground recognition OR mid-grind (the ollie-out
    // hop the KickArbiter explicitly reserves — "mid-maneuver kicks ... e.g.
    // grind hop"). buttonSide attribution routes a mid-grind click straight to a
    // pop with no locomotion leak.
    const popAllowed =
      this.#fsm.phase === "ground" || this.#fsm.phase === "grind";
    const arb = this.#kickArbiter.update(feet, kicks, popAllowed, step);

    const fsmResult = this.#fsm.update({
      feet,
      pops: arb.pops,
      grounded,
      pose,
      contactImpulse,
      supportContactImpulse,
      railProximity,
      step,
    });

    // A generic side-rest fallback must never preempt an active maneuver's
    // physical landing classification. It is eligible only after the FSM says
    // the board is idle/riding (the screenshot failure was ground → none).
    this.#world.setUnrideableRecoveryEnabled(
      fsmResult.phase === "none" || fsmResult.phase === "ground",
    );

    const maneuverCmds = this.#assist.update(fsmResult, step, feet);

    // Ground locomotion runs only while riding on the ground — no drive/steer
    // during pop/air/catch/bail (kicks the arbiter released come through here).
    const groundControlActive = grounded && fsmResult.phase === "ground";
    const cmd = this.#boardController.applyGroundControl(
      feet,
      arb.locomotion,
      groundControlActive,
      step,
    );
    this.#world.applyGroundForces(cmd);
    for (const mc of maneuverCmds) this.#world.applyManeuver(mc);

    this.#feetState = feet;
  }

  #validateReplayHeader(trace: SessionTrace): void {
    const h = trace.header;
    const problems: string[] = [];
    if (h.replayVersion !== REPLAY_VERSION) {
      problems.push(`replayVersion ${h.replayVersion} != ${REPLAY_VERSION}`);
    }
    if (h.contactFrameSchema !== CONTACT_FRAME_SCHEMA_VERSION) {
      problems.push(
        `contactFrameSchema ${h.contactFrameSchema} != ${CONTACT_FRAME_SCHEMA_VERSION}`,
      );
    }
    if (h.hz !== this.#config.physics.hz) {
      problems.push(`hz ${h.hz} != runtime ${this.#config.physics.hz}`);
    }
    if (h.rapierVersion !== RAPIER_VERSION) {
      problems.push(`rapierVersion ${h.rapierVersion} != ${RAPIER_VERSION}`);
    }
    if (h.gameVersion !== GAME_VERSION) {
      problems.push(`gameVersion ${h.gameVersion} != ${GAME_VERSION}`);
    }
    const every = this.#config.runtime.replay.checkpointEverySteps;
    for (const c of trace.checkpoints) {
      if (c.step % every !== 0) {
        problems.push(
          `checkpoint at step ${c.step} off the runtime cadence (${every}) — ` +
            `trace was recorded under a different replay config`,
        );
        break;
      }
    }
    if (problems.length > 0) {
      throw new Error(
        `replay: incompatible trace header — ${problems.join("; ")}`,
      );
    }
  }
}
