/**
 * FootTracker — Contact-ID → logical foot binding (M3).
 *
 * Owns logical feet, stance, and the padYawOffset calibration (architecture §2:
 * FootTracker owns "Logical feet, stance, padYawOffset"; must not own
 * rendering). It consumes the ContactFrames drained for one sim step and emits a
 * per-step FeetState plus lift/retap (or explicit legacy click) KickEvents. It NEVER touches the
 * physics body — BoardController turns FeetState into intents downstream.
 *
 * Coordinate pipeline (research/control-grammar §3, input-platform-spec §6):
 *   raw pad [0,1]² --physical aspect correction-->
 *   isotropic pad units --rotate(-padYawOffset about (0.5,0.5))--> CALIBRATED.
 * Everything below works in calibrated space; the camera never affects mapping.
 *
 * Determinism (arch §4): gesture timing math uses ONLY differences between
 * frame timestamps (tPerfMs), never a wall clock; no Math.random. dt<=0 is
 * guarded everywhere so a stale/duplicate timestamp can never inject NaN.
 */

import type { ContactFrame } from "@slackpad/shared";
import type { FootTrackerConfig, InputProfile } from "@slackpad/shared";
import type { Telemetry } from "../telemetry/Telemetry";

export type FootRole = "nose" | "tail";
export type PlantMask = "nose" | "tail" | "both" | "none";

export interface Vec2 {
  x: number;
  y: number;
}

/** Per-foot output (calibrated pad space). */
export interface FootState {
  role: FootRole;
  planted: boolean;
  /** Calibrated pad position [0,1]² (last known while planted/held). */
  pos: Vec2;
  /** Calibrated pad velocity, units/s (EMA-smoothed finite difference). */
  vel: Vec2;
  /** Offset of pos from the captured rest pose, calibrated units. */
  offsetFromRest: Vec2;
  /** Hardware contact id currently bound, or null. */
  contactId: number | null;
}

/** Board-contact segment (valid only while both feet are planted). */
export interface SegmentState {
  valid: boolean;
  /** Segment angle atan2(nose.y-tail.y, nose.x-tail.x), rad (calibrated space). */
  angle: number;
  /** angle − restAngle, wrapped to (−π, π]. */
  angleFromRest: number;
  /** d(angle)/dt, rad/s (EMA-smoothed) — the primary steering signal. */
  angVel: number;
  /** Segment midpoint, calibrated units. */
  midpoint: Vec2;
  /** midpoint − restMidpoint, calibrated units. */
  midpointOffsetFromRest: Vec2;
  /** d(midpoint)/dt, units/s (EMA-smoothed). */
  midpointVel: Vec2;
  /** |segment| / restLength. */
  lengthRatio: number;
}

export interface FeetState {
  nose: FootState;
  tail: FootState;
  segment: SegmentState;
  bothPlanted: boolean;
  plantCount: number;
  /** Deterministic explicit propulsion action (native Ctrl / DEV Ctrl). */
  accelerating?: boolean;
}

/**
 * One calibrated tracker result for one accepted ContactFrame. Physics still
 * advances at its fixed rate, but gesture recognition consumes this complete
 * higher-rate sequence so an 8 ms flick is not flattened into one 16.7 ms
 * endpoint.
 */
export interface FeetSample {
  frameId: number;
  tPerfMs: number;
  /** Time since the preceding accepted hardware sample, seconds. */
  dtSeconds: number;
  state: FeetState;
}

/** A physical-button edge (legacy) or a lift-and-retap kick gesture. */
export interface KickEvent {
  step: number;
  mask: PlantMask;
  /**
   * Compatibility side channel used by the legacy arbiter and trace schema.
   * Motion taps also map tail/nose to primary/secondary, while `source` and
   * `tapRole` remain the authoritative shipping fields.
   */
  button: "primary" | "secondary";
  source?: "button" | "motionTap";
  tapRole?: FootRole;
  tapDurationMs?: number;
  tapDistance?: number;
}

interface PendingMotionTap {
  liftedAtMs: number;
  from: Vec2;
}

interface RestPose {
  nose: Vec2;
  tail: Vec2;
  angle: number;
  length: number;
  midpoint: Vec2;
}

interface RoleSlot {
  role: FootRole;
  boundId: number | null;
  planted: boolean;
  pos: Vec2;
  vel: Vec2;
  /** Last frame timestamp at which this slot updated a planted position. */
  lastTPerfMs: number | null;
  /** True once this slot has a usable last position for proximity rebinding. */
  hasMemory: boolean;
}

const EPS_DT = 1e-6; // seconds; below this a frame delta is treated as "no time"
const PAD_CENTER = 0.5;

function invalidSegment(): SegmentState {
  return {
    valid: false,
    angle: 0,
    angleFromRest: 0,
    angVel: 0,
    midpoint: { x: PAD_CENTER, y: PAD_CENTER },
    midpointOffsetFromRest: { x: 0, y: 0 },
    midpointVel: { x: 0, y: 0 },
    lengthRatio: 1,
  };
}

/** Rotate (x,y) by `deg` degrees about the pad center (0.5, 0.5). */
export function rotateAboutCenter(x: number, y: number, deg: number): Vec2 {
  const r = (deg * Math.PI) / 180;
  const c = Math.cos(r);
  const s = Math.sin(r);
  const dx = x - PAD_CENTER;
  const dy = y - PAD_CENTER;
  return {
    x: PAD_CENTER + dx * c - dy * s,
    y: PAD_CENTER + dx * s + dy * c,
  };
}

/**
 * Convert separately normalized X/Y into isotropic physical-distance units.
 * Coordinates remain centered at 0.5; the longer hardware axis may extend
 * outside [0,1], which is intentional and never crosses the ContactFrame wire
 * boundary. Missing/malformed metadata preserves legacy unit-square behavior.
 */
export function physicalizePadPoint(
  x: number,
  y: number,
  physicalAspectRatio: unknown,
): Vec2 {
  const aspect = typeof physicalAspectRatio === 'number'
    && Number.isFinite(physicalAspectRatio)
    && physicalAspectRatio >= 0.25
    && physicalAspectRatio <= 4
      ? physicalAspectRatio
      : 1;
  return aspect >= 1
    ? { x: PAD_CENTER + (x - PAD_CENTER) * aspect, y }
    : { x, y: PAD_CENTER + (y - PAD_CENTER) / aspect };
}

/** Wrap an angle to (−π, π]. */
function wrapPi(a: number): number {
  let x = a;
  while (x > Math.PI) x -= 2 * Math.PI;
  while (x <= -Math.PI) x += 2 * Math.PI;
  return x;
}

function ema(prev: number, sample: number, alpha: number): number {
  return prev + (sample - prev) * alpha;
}

function dist2(a: Vec2, b: Vec2): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return dx * dx + dy * dy;
}

interface CalPoint {
  id: number;
  x: number;
  y: number;
}

export class FootTracker {
  private readonly cfg: FootTrackerConfig;
  private readonly plantSpeedEps: number;
  private stance: InputProfile["stance"];
  private padYawOffset: number;
  private swapFeet: boolean;
  private kickAttribution: InputProfile["kickAttribution"];

  private readonly roles: Record<FootRole, RoleSlot> = {
    nose: this.freshSlot("nose"),
    tail: this.freshSlot("tail"),
  };

  private rest: RestPose | null = null;

  // Segment derivative state.
  private segPrevAngle = 0;
  private segPrevMid: Vec2 = { x: PAD_CENTER, y: PAD_CENTER };
  private segLastTPerfMs: number | null = null;
  private angVelEma = 0;
  private midVelEma: Vec2 = { x: 0, y: 0 };
  private curSegment: SegmentState = invalidSegment();

  // Frame/edge bookkeeping.
  private lastFrameTPerfMs: number | null = null;
  private prevPrimary = false;
  private prevSecondary = false;
  private prevBoth = false;
  private accelerating = false;

  // Dual-lift identity memory. This never lies about live plant state: it only
  // keeps recent positions internally so fresh hardware ids can rebind.
  private dualLiftMs: number | null = null;

  // Soft recenter.
  private recenterStillMs = 0;
  private recenterActive = false;

  private pendingKicks: KickEvent[] = [];
  private readonly pendingMotionTaps: Partial<Record<FootRole, PendingMotionTap>> = {};
  private pendingSamples: FeetSample[] = [];
  private currentState: FeetState;

  constructor(
    cfg: FootTrackerConfig,
    plantSpeedEps: number,
    profile: Pick<InputProfile, "stance" | "padYawOffset" | "swapFeet"> &
      Partial<Pick<InputProfile, "kickAttribution">>,
    private readonly telemetry?: Telemetry,
  ) {
    this.cfg = cfg;
    this.plantSpeedEps = plantSpeedEps;
    this.stance = profile.stance;
    this.padYawOffset = profile.padYawOffset;
    this.swapFeet = profile.swapFeet;
    // Direct low-level tracker tests that predate the shipping motion profile
    // keep the legacy button edge behavior. Product profiles always provide it.
    this.kickAttribution = profile.kickAttribution ?? "buttonSide";
    this.currentState = this.buildLiveState();
  }

  private freshSlot(role: FootRole): RoleSlot {
    return {
      role,
      boundId: null,
      planted: false,
      pos: { x: PAD_CENTER, y: PAD_CENTER },
      vel: { x: 0, y: 0 },
      lastTPerfMs: null,
      hasMemory: false,
    };
  }

  /** Consume the frames drained for `step`; return the post-frame FeetState. */
  update(frames: ContactFrame[], step: number): FeetState {
    for (const frame of frames) {
      const previousTPerfMs = this.lastFrameTPerfMs;
      this.processFrame(frame, step);
      this.pendingSamples.push({
        frameId: frame.frameId,
        tPerfMs: frame.tPerfMs,
        dtSeconds:
          previousTPerfMs == null
            ? 0
            : Math.max(0, frame.tPerfMs - previousTPerfMs) / 1000,
        state: this.buildOutputState(),
      });
    }
    this.currentState = this.buildOutputState();
    return this.currentState;
  }

  /** Latest FeetState without consuming frames (steps with no input). */
  state(): FeetState {
    return this.currentState;
  }

  /** Remove and return KickEvents produced since the last drain. */
  drainKicks(): KickEvent[] {
    if (this.pendingKicks.length === 0) return [];
    const out = this.pendingKicks;
    this.pendingKicks = [];
    return out;
  }

  /** Remove and return every per-frame calibrated sample since the last drain. */
  drainSamples(): FeetSample[] {
    if (this.pendingSamples.length === 0) return [];
    const out = this.pendingSamples;
    this.pendingSamples = [];
    return out;
  }

  // --- per-frame pipeline -------------------------------------------------
  private processFrame(frame: ContactFrame, step: number): void {
    const t = frame.tPerfMs;
    const dtMs = this.lastFrameTPerfMs == null ? 0 : t - this.lastFrameTPerfMs;
    const dt = dtMs / 1000;

    // 1. Calibrate confident, planted contacts into calibrated pad space.
    let pts: CalPoint[] = [];
    for (const c of frame.contacts) {
      if (!c.confidence) continue; // palm rejection (HID confidence)
      if (!c.tip) continue; // finger lifted → not a planted contact
      const physical = physicalizePadPoint(
        c.x,
        c.y,
        frame.meta?.physicalAspectRatio,
      );
      const cal = rotateAboutCenter(physical.x, physical.y, -this.padYawOffset);
      pts.push({ id: c.id, x: cal.x, y: cal.y });
    }

    // 2. Clamp to two gameplay feet.
    if (pts.length > 2) pts = this.selectTwo(pts, step);

    // 3. Assign contacts to roles.
    const assign = this.assignRoles(pts, step);

    // 4. Update role slots (position, velocity, plant/lift). Capture the
    // previous state first so a new hardware contact id can still complete a
    // tap for the logical role selected by proximity rebinding.
    const wasBoth = this.roles.nose.planted && this.roles.tail.planted;
    const wasPlanted: Record<FootRole, boolean> = {
      nose: this.roles.nose.planted,
      tail: this.roles.tail.planted,
    };
    const previousPos: Record<FootRole, Vec2> = {
      nose: { ...this.roles.nose.pos },
      tail: { ...this.roles.tail.pos },
    };
    for (const role of ["nose", "tail"] as const) {
      const R = this.roles[role];
      const pt = assign.get(role);
      if (pt) {
        if (R.planted && R.lastTPerfMs != null && dt > EPS_DT) {
          const inst = { x: (pt.x - R.pos.x) / dt, y: (pt.y - R.pos.y) / dt };
          R.vel = {
            x: ema(R.vel.x, inst.x, this.cfg.velEmaAlpha),
            y: ema(R.vel.y, inst.y, this.cfg.velEmaAlpha),
          };
        } else {
          R.vel = { x: 0, y: 0 };
        }
        R.pos = { x: pt.x, y: pt.y };
        R.boundId = pt.id;
        R.planted = true;
        R.lastTPerfMs = t;
        R.hasMemory = true;
      } else if (R.planted) {
        // Was planted, now lifted: keep pos as proximity memory, drop the id.
        R.planted = false;
        R.boundId = null;
        R.vel = { x: 0, y: 0 };
      }
    }

    // A deliberate kick is the only meaningful 3D-like motion available
    // without constraining hand rotation to a click zone: one role leaves the
    // pad, then returns near its own socket while the other role stays planted.
    for (const role of ["nose", "tail"] as const) {
      const nowPlanted = this.roles[role].planted;
      if (wasPlanted[role] && !nowPlanted && wasBoth) {
        this.pendingMotionTaps[role] = { liftedAtMs: t, from: previousPos[role] };
      } else if (!wasPlanted[role] && nowPlanted) {
        const pending = this.pendingMotionTaps[role];
        delete this.pendingMotionTaps[role];
        if (!pending || this.kickAttribution !== "motionTap") continue;
        const duration = t - pending.liftedAtMs;
        const distance = Math.sqrt(dist2(pending.from, this.roles[role].pos));
        const other: FootRole = role === "nose" ? "tail" : "nose";
        if (
          this.roles[other].planted &&
          duration >= this.cfg.motionTapMinLiftMs &&
          duration <= this.cfg.motionTapMaxLiftMs &&
          distance <= this.cfg.motionTapReplantRadius
        ) {
          const kick: KickEvent = {
            step,
            mask: "both",
            button: role === "tail" ? "primary" : "secondary",
            source: "motionTap",
            tapRole: role,
            tapDurationMs: duration,
            tapDistance: distance,
          };
          this.pendingKicks.push(kick);
          this.telemetry?.log({
            type: "kick",
            step,
            mask: "both",
            button: kick.button,
            source: "motionTap",
            role,
            durationMs: duration,
            distance,
          });
        }
      }
      const pending = this.pendingMotionTaps[role];
      if (pending && t - pending.liftedAtMs > this.cfg.motionTapMaxLiftMs) {
        delete this.pendingMotionTaps[role];
      }
    }

    // 5. Segment + rest + recenter.
    const both = this.roles.nose.planted && this.roles.tail.planted;
    if (both) this.updateSegment(t, dt);
    else {
      this.curSegment = invalidSegment();
      this.resetRecenter();
    }

    // 6. Dual-lift ballistic hold / clear.
    this.updateDualLift(both, dtMs);

    // 7. Physical buttons remain available only to explicit legacy profiles.
    // The shipping motionTap profile deliberately ignores them.
    if (this.kickAttribution !== "motionTap" && !this.prevPrimary && frame.buttons.primary) {
      const mask = this.plantMask();
      this.pendingKicks.push({ step, mask, button: "primary" });
      this.telemetry?.log({ type: "kick", step, mask, button: "primary" });
    }
    if (this.kickAttribution !== "motionTap" && !this.prevSecondary && frame.buttons.secondary) {
      const mask = this.plantMask();
      this.pendingKicks.push({ step, mask, button: "secondary" });
      this.telemetry?.log({ type: "kick", step, mask, button: "secondary" });
    }

    this.prevPrimary = frame.buttons.primary;
    this.prevSecondary = frame.buttons.secondary;
    this.accelerating = frame.buttons.auxiliary;
    this.prevBoth = both;
    this.lastFrameTPerfMs = t;
  }

  private updateSegment(t: number, dt: number): void {
    const nose = this.roles.nose.pos;
    const tail = this.roles.tail.pos;
    const seg = { x: nose.x - tail.x, y: nose.y - tail.y };
    const angle = Math.atan2(seg.y, seg.x);
    const length = Math.hypot(seg.x, seg.y);
    const midpoint = { x: (nose.x + tail.x) / 2, y: (nose.y + tail.y) / 2 };

    if (this.rest == null) {
      // Fresh dual plant → capture rest and zero the derivatives (no spurious ω).
      this.rest = {
        nose: { ...nose },
        tail: { ...tail },
        angle,
        length: length || 1e-6,
        midpoint: { ...midpoint },
      };
      this.angVelEma = 0;
      this.midVelEma = { x: 0, y: 0 };
      this.telemetry?.log({ type: "recenter", reason: "rest-capture" });
    } else if (this.prevBoth && this.segLastTPerfMs != null && dt > EPS_DT) {
      const aInst = wrapPi(angle - this.segPrevAngle) / dt;
      this.angVelEma = ema(this.angVelEma, aInst, this.cfg.velEmaAlpha);
      const mInst = {
        x: (midpoint.x - this.segPrevMid.x) / dt,
        y: (midpoint.y - this.segPrevMid.y) / dt,
      };
      this.midVelEma = {
        x: ema(this.midVelEma.x, mInst.x, this.cfg.velEmaAlpha),
        y: ema(this.midVelEma.y, mInst.y, this.cfg.velEmaAlpha),
      };
    } else {
      // Rising edge with an existing rest (e.g. single-foot re-plant): reset ω.
      this.angVelEma = 0;
      this.midVelEma = { x: 0, y: 0 };
    }

    this.segPrevAngle = angle;
    this.segPrevMid = { ...midpoint };
    this.segLastTPerfMs = t;

    const rest = this.rest;
    this.curSegment = {
      valid: true,
      angle,
      angleFromRest: wrapPi(angle - rest.angle),
      angVel: this.angVelEma,
      midpoint,
      midpointOffsetFromRest: {
        x: midpoint.x - rest.midpoint.x,
        y: midpoint.y - rest.midpoint.y,
      },
      midpointVel: this.midVelEma,
      lengthRatio: length / rest.length,
    };

    this.updateRecenter(dt);
  }

  /** Soft recenter: ease rest toward current while both planted and nearly still. */
  private updateRecenter(dt: number): void {
    if (this.rest == null) return;
    // A held common-mode offset is an analog steering command, not sensor
    // drift. Only absorb tiny near-neutral offsets; otherwise a steady carve
    // fades after recenterHoldMs and feels like a broken analog stick.
    const commonOffset = Math.hypot(
      this.curSegment.midpointOffsetFromRest.x,
      this.curSegment.midpointOffsetFromRest.y,
    );
    if (commonOffset > 0.025) {
      this.recenterStillMs = 0;
      this.recenterActive = false;
      return;
    }
    const still =
      Math.hypot(this.roles.nose.vel.x, this.roles.nose.vel.y) <
        this.plantSpeedEps &&
      Math.hypot(this.roles.tail.vel.x, this.roles.tail.vel.y) <
        this.plantSpeedEps;
    if (!still) {
      this.recenterStillMs = 0;
      this.recenterActive = false;
      return;
    }
    this.recenterStillMs += Math.max(0, dt) * 1000;
    if (this.recenterStillMs < this.cfg.recenterHoldMs) return;

    if (!this.recenterActive) {
      this.recenterActive = true;
      this.telemetry?.log({ type: "recenter", reason: "soft-drift" });
    }
    const k = Math.max(0, Math.min(1, this.cfg.recenterRateHz * dt));
    const drift = (from: Vec2, to: Vec2): Vec2 => ({
      x: from.x + (to.x - from.x) * k,
      y: from.y + (to.y - from.y) * k,
    });
    const nose = this.roles.nose.pos;
    const tail = this.roles.tail.pos;
    this.rest.nose = drift(this.rest.nose, nose);
    this.rest.tail = drift(this.rest.tail, tail);
    const seg = {
      x: this.rest.nose.x - this.rest.tail.x,
      y: this.rest.nose.y - this.rest.tail.y,
    };
    this.rest.angle = Math.atan2(seg.y, seg.x);
    this.rest.length = Math.hypot(seg.x, seg.y) || 1e-6;
    this.rest.midpoint = {
      x: (this.rest.nose.x + this.rest.tail.x) / 2,
      y: (this.rest.nose.y + this.rest.tail.y) / 2,
    };
  }

  private resetRecenter(): void {
    this.recenterStillMs = 0;
    this.recenterActive = false;
  }

  private updateDualLift(both: boolean, dtMs: number): void {
    const plantedCount =
      (this.roles.nose.planted ? 1 : 0) + (this.roles.tail.planted ? 1 : 0);
    if (plantedCount > 0) {
      this.dualLiftMs = null;
      return;
    }
    // Zero feet planted.
    if (this.dualLiftMs == null) this.dualLiftMs = 0;
    else this.dualLiftMs += Math.max(0, dtMs);

    if (this.dualLiftMs >= this.cfg.ballisticPredictMs) {
      // Prediction window expired → clear: forget the rest pose so the next
      // dual plant redefines it. Memory persists for proximity rebind until the
      // longer clear window, after which the ids are considered fresh.
      if (this.rest != null) {
        this.rest = null;
        this.telemetry?.log({ type: "footRebind", reason: "dual-lift-clear" });
      }
      if (this.dualLiftMs >= this.cfg.dualLiftClearMs) {
        this.roles.nose.hasMemory = false;
        this.roles.tail.hasMemory = false;
      }
    }
    void both;
  }

  private plantMask(): PlantMask {
    const n = this.roles.nose.planted;
    const t = this.roles.tail.planted;
    if (n && t) return "both";
    if (n) return "nose";
    if (t) return "tail";
    return "none";
  }

  // --- assignment ---------------------------------------------------------
  private assignRoles(pts: CalPoint[], step: number): Map<FootRole, CalPoint> {
    const out = new Map<FootRole, CalPoint>();
    const used = new Set<number>();

    // (a) Sticky: a contact whose id equals a role's bound id keeps that role.
    for (const role of ["nose", "tail"] as const) {
      const R = this.roles[role];
      if (R.boundId == null || !R.planted) continue;
      const pt = pts.find((p) => p.id === R.boundId);
      if (pt) {
        out.set(role, pt);
        used.add(pt.id);
      }
    }

    const freeRoles = (["nose", "tail"] as const).filter((r) => !out.has(r));
    const freePts = pts.filter((p) => !used.has(p.id));
    if (freePts.length === 0 || freeRoles.length === 0) return out;

    // (b) Fresh dual plant: two contacts, both roles free, no usable memory →
    // pad-left rule (smaller calibrated x = padLeft), then stance/swap → role.
    if (freePts.length === 2 && freeRoles.length === 2) {
      const anyMemory = freeRoles.some((r) => this.roles[r].hasMemory);
      if (!anyMemory) {
        const [a, b] = freePts as [CalPoint, CalPoint];
        const roleOf = this.padRolesFor(a, b);
        out.set("nose", roleOf.nose);
        out.set("tail", roleOf.tail);
        this.telemetry?.log({ type: "footRebind", reason: "fresh-dual", step });
        return out;
      }
      // Both free but with memory → proximity pairing (rebind after dual lift).
      return this.proximityPair(freePts, freeRoles, out, step);
    }

    // (c) One free point (single re-plant / one foot down): nearest memory role
    // within radius rebinds; else the sole free role; else provisional 'tail'.
    if (freePts.length === 1) {
      const pt = freePts[0] as CalPoint;
      const mem = freeRoles
        .filter((r) => this.roles[r].hasMemory)
        .map((r) => ({ r, d: dist2(pt, this.roles[r].pos) }))
        .sort((x, y) => x.d - y.d)[0];
      const radius2 = this.cfg.rebindRadius * this.cfg.rebindRadius;
      if (mem && mem.d <= radius2) {
        out.set(mem.r, pt);
        this.telemetry?.log({
          type: "footRebind",
          reason: "proximity",
          role: mem.r,
          step,
        });
      } else if (freeRoles.length === 1) {
        const r = freeRoles[0] as FootRole;
        out.set(r, pt);
        this.telemetry?.log({
          type: "footRebind",
          reason: "fresh-single",
          role: r,
          step,
        });
      } else {
        out.set("tail", pt); // provisional per input spec (1-contact mode)
        this.telemetry?.log({
          type: "footRebind",
          reason: "provisional-tail",
          step,
        });
      }
      return out;
    }

    // (d) Two free points but only one free role: proximity pick the closer.
    return this.proximityPair(freePts, freeRoles, out, step);
  }

  private proximityPair(
    freePts: CalPoint[],
    freeRoles: readonly FootRole[],
    out: Map<FootRole, CalPoint>,
    step: number,
  ): Map<FootRole, CalPoint> {
    const roles = [...freeRoles];
    const pts = [...freePts];
    // Greedy min-distance matching against remembered role positions.
    while (roles.length > 0 && pts.length > 0) {
      let best: { ri: number; pi: number; d: number } | null = null;
      for (let ri = 0; ri < roles.length; ri++) {
        for (let pi = 0; pi < pts.length; pi++) {
          const d = dist2(
            pts[pi] as CalPoint,
            this.roles[roles[ri] as FootRole].pos,
          );
          if (!best || d < best.d) best = { ri, pi, d };
        }
      }
      if (!best) break;
      const role = roles[best.ri] as FootRole;
      const pt = pts[best.pi] as CalPoint;
      out.set(role, pt);
      this.telemetry?.log({
        type: "footRebind",
        reason: "proximity",
        role,
        step,
      });
      roles.splice(best.ri, 1);
      pts.splice(best.pi, 1);
    }
    return out;
  }

  /** Apply pad-left rule + stance + swapFeet to map two contacts to roles. */
  private padRolesFor(
    a: CalPoint,
    b: CalPoint,
  ): { nose: CalPoint; tail: CalPoint } {
    let padLeft: CalPoint;
    let padRight: CalPoint;
    if (a.x <= b.x) {
      padLeft = a;
      padRight = b;
    } else {
      padLeft = b;
      padRight = a;
    }
    if (this.swapFeet) {
      const tmp = padLeft;
      padLeft = padRight;
      padRight = tmp;
    }
    // Right-hand regular stance: index/pad-left is the back foot on the tail;
    // middle/pad-right is the front foot on the nose. Goofy mirrors it.
    return this.stance === "regular"
      ? { nose: padRight, tail: padLeft }
      : { nose: padLeft, tail: padRight };
  }

  /** Keep the two best contacts when >2 are present; log the drop. */
  private selectTwo(pts: CalPoint[], step: number): CalPoint[] {
    const boundIds = new Set(
      (["nose", "tail"] as const)
        .map((r) => this.roles[r].boundId)
        .filter((id): id is number => id != null),
    );
    const scored = pts.map((p) => {
      let rank = 2; // fresh contact
      if (boundIds.has(p.id))
        rank = 0; // already a gameplay foot → keep
      else {
        // Prefer contacts near an existing role position (history).
        for (const r of ["nose", "tail"] as const) {
          if (
            this.roles[r].hasMemory &&
            dist2(p, this.roles[r].pos) <=
              this.cfg.rebindRadius * this.cfg.rebindRadius
          ) {
            rank = 1;
            break;
          }
        }
      }
      return { p, rank };
    });
    scored.sort((x, y) =>
      x.rank !== y.rank ? x.rank - y.rank : x.p.id - y.p.id,
    );
    const kept = scored.slice(0, 2).map((s) => s.p);
    const droppedCount = pts.length - kept.length;
    this.telemetry?.log({
      type: "footRebind",
      reason: "overflow-drop",
      dropped: droppedCount,
      step,
    });
    return kept;
  }

  // --- output -------------------------------------------------------------
  private footStateFor(role: FootRole): FootState {
    const R = this.roles[role];
    const restPos = this.rest ? this.rest[role] : R.pos;
    return {
      role,
      planted: R.planted,
      pos: { ...R.pos },
      vel: { ...R.vel },
      offsetFromRest: { x: R.pos.x - restPos.x, y: R.pos.y - restPos.y },
      contactId: R.boundId,
    };
  }

  private buildLiveState(): FeetState {
    const nose = this.footStateFor("nose");
    const tail = this.footStateFor("tail");
    const plantCount = (nose.planted ? 1 : 0) + (tail.planted ? 1 : 0);
    return {
      nose,
      tail,
      segment: { ...this.curSegment },
      bothPlanted: nose.planted && tail.planted,
      plantCount,
      accelerating: this.accelerating,
    };
  }

  private buildOutputState(): FeetState {
    // Output is always the current hardware truth. The prediction window above
    // exists only for ID reassignment; returning a cached planted state made
    // lifted fingers remain visibly glued to the board for up to 200 ms.
    return this.buildLiveState();
  }
}
