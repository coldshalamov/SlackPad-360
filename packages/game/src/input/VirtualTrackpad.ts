/**
 * VirtualTrackpad — on-screen DEV PAD (M3). Emits `source:'synthetic'`
 * ContactFrames through the SAME InputHub as hardware would, so the dev/demo
 * path exercises the real FootTracker → BoardController pipeline. This is
 * explicitly NON-REPRESENTATIVE of the native touchpad (the native host owns
 * real dual-contact input); it is a controllable stand-in for browser play and
 * is clearly labelled "DEV PAD".
 *
 * Interaction (bottom-left panel):
 *  - Hold LEFT mouse = foot A planted at the cursor.
 *  - Hold SHIFT (with LMB) = foot B. Dragging rotates the pair around its
 *    midpoint; hold ALT to move A independently for manual trick input.
 *  - X/Z = lift foot A/B; release to retap with a fresh contact id.
 *  - S toggle stance · C capture padYawOffset from the current segment ·
 *    F swap feet · 0/1/2 set assist level (via ProfileStore, persisted).
 *  - M5 air gestures (press AFTER a pop, while airborne): K = kickflip flick,
 *    H = heelflip flick, J = BS shuv sweep, L = FS shuv sweep. Each scripts a
 *    plausible free-foot contact path (a fast lateral slide for flicks, a yaw
 *    arc for shuvs) over ~6 emitted frames through the SAME emitter, so it drives
 *    the real AirGestureClassifier. On the ground the flick is ignored (§3.1).
 *
 * Recipe: hold LMB + SHIFT for two feet, drag to rotate the board line, hold
 * Ctrl to accelerate, and tap X or Z to synthesize one role's lift/retap. Press
 * K/H/J/L after the pop for a forgiving trick.
 *
 * Frames emit at ~120 Hz on a UI-side wall clock — legitimate here because this
 * is an input DEVICE; those timestamps simply become tPerfMs downstream.
 */

import type { ContactFrame } from "@slackpad/shared";
import type { InputHub } from "./InputHub";
import type { ProfileStore } from "./ProfileStore";

const PANEL_W = 260;
const PANEL_H = 180;
const EMIT_HZ = 120;

/** Scripted air-gesture path (M5 dev keys): frames + per-frame magnitude. */
const GESTURE_FRAMES = 6;
/** Lateral pad step per frame for a flick (fast enough to clear flickSpeedMin). */
const FLICK_STEP = 0.05;
/** Yaw-arc radius + sweep span for a shuv. */
const SWEEP_RADIUS = 0.16;
const SWEEP_SPAN = Math.PI * 0.75;

type GestureKind = "kickflip" | "heelflip" | "bs-shuv" | "fs-shuv";

interface Vec2 {
  x: number;
  y: number;
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

export class VirtualTrackpad {
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly emitTimer: ReturnType<typeof setInterval>;

  private frameCounter = 0;
  private nextContactId = 1;

  private aDown = false;
  private aId = 0;
  private aPos: Vec2 = { x: 0.5, y: 0.5 };

  private shiftHeld = false;
  private ctrlHeld = false;
  private altHeld = false;
  /** X held: optional advanced manual lift for foot A. */
  private aSuspended = false;
  /** Z held: synthetic lift for foot B. */
  private bSuspended = false;
  private bId = 0;
  private bPos: Vec2 = { x: 0.5, y: 0.5 };

  /** Active scripted air gesture (K/H/J/L), driving foot A along a path. */
  private gesture: { kind: GestureKind; i: number; base: Vec2 } | null = null;

  constructor(
    container: HTMLElement,
    private readonly inputHub: InputHub,
    private readonly profile: ProfileStore,
  ) {
    const canvas = document.createElement("canvas");
    canvas.width = PANEL_W * (window.devicePixelRatio || 1);
    canvas.height = PANEL_H * (window.devicePixelRatio || 1);
    Object.assign(canvas.style, {
      position: "fixed",
      left: "16px",
      bottom: "16px",
      width: `${PANEL_W}px`,
      height: `${PANEL_H}px`,
      borderRadius: "12px",
      background: "rgba(12,16,22,0.82)",
      boxShadow: "0 6px 24px rgba(0,0,0,0.45)",
      cursor: "crosshair",
      touchAction: "none",
      zIndex: "10",
    });
    container.appendChild(canvas);
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("VirtualTrackpad: 2D canvas context unavailable");
    this.canvas = canvas;
    this.ctx = ctx;

    canvas.addEventListener("mousedown", this.onMouseDown);
    canvas.addEventListener("contextmenu", this.onContextMenu);
    window.addEventListener("mousemove", this.onMouseMove);
    window.addEventListener("mouseup", this.onMouseUp);
    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("keyup", this.onKeyUp);
    window.addEventListener("blur", this.releaseControls);

    this.emitTimer = setInterval(this.emit, 1000 / EMIT_HZ);
    this.draw();
  }

  dispose(): void {
    clearInterval(this.emitTimer);
    this.canvas.removeEventListener("mousedown", this.onMouseDown);
    this.canvas.removeEventListener("contextmenu", this.onContextMenu);
    window.removeEventListener("mousemove", this.onMouseMove);
    window.removeEventListener("mouseup", this.onMouseUp);
    window.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("keyup", this.onKeyUp);
    window.removeEventListener("blur", this.releaseControls);
    this.canvas.remove();
  }

  // --- pointer → pad [0,1] -------------------------------------------------
  private toPad(clientX: number, clientY: number): Vec2 {
    const r = this.canvas.getBoundingClientRect();
    const x = Math.max(0, Math.min(1, (clientX - r.left) / r.width));
    const y = Math.max(0, Math.min(1, (clientY - r.top) / r.height));
    return { x, y };
  }

  private mirror(a: Vec2): Vec2 {
    return { x: 1 - a.x, y: a.y }; // across the pad vertical center
  }

  private onMouseDown = (e: MouseEvent): void => {
    if (e.button === 2) {
      e.preventDefault();
      return;
    }
    if (e.button !== 0) return;
    e.preventDefault();
    this.aDown = true;
    this.aId = this.nextContactId++;
    this.aPos = this.toPad(e.clientX, e.clientY);
    if (this.shiftHeld) this.plantB();
    this.emit();
  };

  private onContextMenu = (e: MouseEvent): void => {
    // Keep the synthetic pad focused on the motion-only control contract. RMB
    // is deliberately ignored instead of becoming a hidden alternate pop.
    e.preventDefault();
  };

  private onMouseMove = (e: MouseEvent): void => {
    if (!this.aDown) return;
    const next = this.toPad(e.clientX, e.clientY);
    if (this.bId && !this.altHeld) {
      // One pointer stands in for a rotating two-finger hand: move A and mirror
      // B around the pair's fixed midpoint. Common translation is deliberately
      // not a steering input in the product contract.
      const mid = {
        x: (this.aPos.x + this.bPos.x) * 0.5,
        y: (this.aPos.y + this.bPos.y) * 0.5,
      };
      const dx = next.x - mid.x;
      const dy = next.y - mid.y;
      const scale = Math.min(
        1,
        Math.abs(dx) > 1e-6 ? Math.min(mid.x / Math.abs(dx), (1 - mid.x) / Math.abs(dx)) : 1,
        Math.abs(dy) > 1e-6 ? Math.min(mid.y / Math.abs(dy), (1 - mid.y) / Math.abs(dy)) : 1,
      );
      this.aPos = { x: mid.x + dx * scale, y: mid.y + dy * scale };
      this.bPos = { x: mid.x - dx * scale, y: mid.y - dy * scale };
    } else {
      this.aPos = next;
    }
    this.emit();
  };

  private onMouseUp = (e: MouseEvent): void => {
    if (e.button === 2) {
      return;
    }
    if (e.button !== 0) return;
    this.aDown = false;
    this.aId = 0;
    this.bId = 0; // B needs LMB held too
    this.emit();
  };

  private plantB(): void {
    if (this.bId) return;
    this.bId = this.nextContactId++;
    this.bPos = this.altHeld ? this.bPos : this.mirror(this.aPos);
  }

  private onKeyDown = (e: KeyboardEvent): void => {
    if (e.key === "Shift") {
      this.shiftHeld = true;
      if (this.aDown) this.plantB();
      this.emit();
      return;
    }
    if (e.key === "Control") {
      this.ctrlHeld = true;
      this.emit();
      return;
    }
    if (e.key === "Alt") {
      this.altHeld = true;
      e.preventDefault();
      return;
    }
    switch (e.key.toLowerCase()) {
      case "x":
        if (!this.aSuspended) {
          this.aSuspended = true;
          // Device edges are samples in their own right. Emitting here keeps a
          // short tap observable even when a background browser throttles the
          // synthetic pad's periodic timer; the native host already reports
          // the corresponding contact disappearance immediately.
          this.emit();
        }
        break;
      case "z":
        if (!this.bSuspended) {
          this.bSuspended = true;
          this.emit();
        }
        break;
      case "s":
        this.profile.toggleStance();
        break;
      case "c":
        this.captureCalibration();
        break;
      case "f":
        this.profile.toggleSwapFeet();
        break;
      case "0":
        this.profile.setAssistLevel(0);
        break;
      case "1":
        this.profile.setAssistLevel(1);
        break;
      case "2":
        this.profile.setAssistLevel(2);
        break;
      // M5 scripted air gestures (perform AFTER a pop, while airborne).
      case "k":
        this.startGesture("kickflip");
        break;
      case "h":
        this.startGesture("heelflip");
        break;
      case "j":
        this.startGesture("bs-shuv");
        break;
      case "l":
        this.startGesture("fs-shuv");
        break;
      default:
        break;
    }
  };

  /** Begin a scripted flick/sweep from foot A's current position. */
  private startGesture(kind: GestureKind): void {
    if (!this.aDown || this.aSuspended) return; // need a live free foot to flick
    this.gesture = { kind, i: 0, base: { ...this.aPos } };
  }

  /**
   * Advance the scripted gesture one emitted frame and return foot A's position,
   * or null when no gesture is active/finished. A flick is a straight fast
   * lateral slide (heelside for kickflip / toeside for heelflip in the default
   * regular frame); a shuv traces a yaw arc so the velocity direction turns.
   */
  private tickGesture(): Vec2 | null {
    const g = this.gesture;
    if (!g) return null;
    const i = g.i + 1;
    let p: Vec2;
    if (g.kind === "kickflip" || g.kind === "heelflip") {
      // Heelside = pad-down (+y) for a regular rider (see AirGestureClassifier).
      const dir = g.kind === "kickflip" ? 1 : -1;
      p = { x: g.base.x, y: clamp01(g.base.y + dir * FLICK_STEP * i) };
    } else {
      const dir = g.kind === "bs-shuv" ? 1 : -1;
      const a0 = -Math.PI / 2;
      const a = a0 + dir * SWEEP_SPAN * (i / GESTURE_FRAMES);
      p = {
        x: clamp01(g.base.x + SWEEP_RADIUS * Math.cos(a)),
        y: clamp01(g.base.y + SWEEP_RADIUS + SWEEP_RADIUS * Math.sin(a)),
      };
    }
    g.i = i;
    if (g.i >= GESTURE_FRAMES) this.gesture = null;
    return p;
  }

  private onKeyUp = (e: KeyboardEvent): void => {
    if (e.key === "Shift") {
      this.shiftHeld = false;
      this.bId = 0; // releasing SHIFT lifts foot B
      this.emit();
    } else if (e.key === "Control") {
      this.ctrlHeld = false;
      this.emit();
    } else if (e.key === "Alt") {
      this.altHeld = false;
    } else if (e.key.toLowerCase() === "x") {
      if (this.aSuspended) {
        this.aSuspended = false;
        // Re-plant is a fresh hardware contact: new id (real pads never reuse).
        if (this.aDown) this.aId = this.nextContactId++;
        this.emit();
      }
    } else if (e.key.toLowerCase() === "z") {
      if (this.bSuspended) {
        this.bSuspended = false;
        if (this.bId) this.bId = this.nextContactId++;
        this.emit();
      }
    }
  };

  /** C: set padYawOffset from the current raw segment angle (both feet down). */
  private captureCalibration(): void {
    if (!this.aDown || !this.bId) return;
    const deg =
      (Math.atan2(this.bPos.y - this.aPos.y, this.bPos.x - this.aPos.x) * 180) /
      Math.PI;
    this.profile.setPadYawOffset(deg);
  }

  // --- 120 Hz frame emission ----------------------------------------------
  private emit = (): void => {
    // A scripted air gesture (K/H/J/L) drives foot A's position this frame.
    const scripted = this.tickGesture();
    if (scripted) {
      this.aPos = scripted;
    }
    const contacts: ContactFrame["contacts"] = [];
    if (this.aDown && !this.aSuspended)
      contacts.push({
        id: this.aId,
        tip: true,
        x: this.aPos.x,
        y: this.aPos.y,
        confidence: true,
      });
    if (this.bId && !this.bSuspended)
      contacts.push({
        id: this.bId,
        tip: true,
        x: this.bPos.x,
        y: this.bPos.y,
        confidence: true,
      });
    const frame: ContactFrame = {
      schemaVersion: 1,
      frameId: this.frameCounter++,
      tPerfMs: performance.now(),
      source: "synthetic",
      contacts,
      buttons: {
        primary: false,
        secondary: false,
        auxiliary: this.ctrlHeld,
      },
    };
    this.inputHub.push(frame);
    this.draw();
  };

  // --- panel drawing -------------------------------------------------------
  private draw(): void {
    const ctx = this.ctx;
    const dpr = window.devicePixelRatio || 1;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, PANEL_W, PANEL_H);

    // Subtle grid.
    ctx.strokeStyle = "rgba(90,120,150,0.18)";
    ctx.lineWidth = 1;
    for (let i = 1; i < 6; i++) {
      const gx = (PANEL_W / 6) * i;
      const gy = (PANEL_H / 6) * i;
      ctx.beginPath();
      ctx.moveTo(gx, 0);
      ctx.lineTo(gx, PANEL_H);
      ctx.moveTo(0, gy);
      ctx.lineTo(PANEL_W, gy);
      ctx.stroke();
    }
    // Vertical center (mirror axis).
    ctx.strokeStyle = "rgba(120,150,180,0.35)";
    ctx.beginPath();
    ctx.moveTo(PANEL_W / 2, 0);
    ctx.lineTo(PANEL_W / 2, PANEL_H);
    ctx.stroke();

    const prof = this.profile.get();
    ctx.fillStyle = "rgba(200,220,240,0.9)";
    ctx.font = "11px system-ui, sans-serif";
    ctx.fillText("DEV PAD (non-representative)", 8, 15);
    ctx.fillStyle = "rgba(150,175,200,0.85)";
    ctx.fillText(
      `stance ${prof.stance}  swap ${prof.swapFeet ? "on" : "off"}  yaw ${prof.padYawOffset.toFixed(0)}°  assist ${prof.assistLevel}`,
      8,
      PANEL_H - 22,
    );
    ctx.fillStyle = "rgba(120,145,170,0.7)";
    ctx.fillText(
      "drag=rotate line · Ctrl=go · X/Z=lift-retap A/B",
      8,
      PANEL_H - 8,
    );
    ctx.fillStyle = this.gesture
      ? "rgba(255,180,90,0.95)"
      : "rgba(120,145,170,0.7)";
    ctx.fillText(
      "after pop: K/H=kick/heelflip · J/L=bs/fs shuv",
      8,
      PANEL_H - 34,
    );

    // Segment line between the two feet.
    if (this.aDown && this.bId) {
      ctx.strokeStyle = "rgba(120,200,160,0.8)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(this.aPos.x * PANEL_W, this.aPos.y * PANEL_H);
      ctx.lineTo(this.bPos.x * PANEL_W, this.bPos.y * PANEL_H);
      ctx.stroke();
    }
    if (this.aDown && !this.aSuspended)
      this.drawContact(this.aPos, "#4aa3ff", "A");
    if (this.bId) this.drawContact(this.bPos, "#4ade80", "B");
  }

  /** Browser focus loss must never leave virtual fingers or buttons latched. */
  private releaseControls = (): void => {
    this.aDown = false;
    this.aId = 0;
    this.bId = 0;
    this.shiftHeld = false;
    this.ctrlHeld = false;
    this.altHeld = false;
    this.aSuspended = false;
    this.bSuspended = false;
    this.gesture = null;
  };

  private drawContact(p: Vec2, color: string, label: string): void {
    const ctx = this.ctx;
    const x = p.x * PANEL_W;
    const y = p.y * PANEL_H;
    ctx.beginPath();
    ctx.fillStyle = color;
    ctx.arc(x, y, 9, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#0b0d10";
    ctx.font = "bold 10px system-ui, sans-serif";
    ctx.fillText(label, x - 3, y + 3);
  }
}
