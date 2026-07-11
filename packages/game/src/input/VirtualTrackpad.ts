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
 *  - Hold SHIFT (with LMB) = foot B, mirrored across the pad vertical center, so
 *    dragging + rotating the pair steers. Hold CTRL to LOCK B for independent A.
 *  - SPACE = primary click (kick) while held.
 *  - S toggle stance · C capture padYawOffset from the current segment ·
 *    0/1/2 set assist level (all via ProfileStore, persisted to localStorage).
 *
 * Frames emit at ~120 Hz on a UI-side wall clock — legitimate here because this
 * is an input DEVICE; those timestamps simply become tPerfMs downstream.
 */

import type { ContactFrame } from '@slackpad/shared';
import type { InputHub } from './InputHub';
import type { ProfileStore } from './ProfileStore';

const PANEL_W = 260;
const PANEL_H = 180;
const EMIT_HZ = 120;

interface Vec2 {
  x: number;
  y: number;
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
  private bId = 0;
  private bPos: Vec2 = { x: 0.5, y: 0.5 };
  private primary = false;

  constructor(
    container: HTMLElement,
    private readonly inputHub: InputHub,
    private readonly profile: ProfileStore,
  ) {
    const canvas = document.createElement('canvas');
    canvas.width = PANEL_W * (window.devicePixelRatio || 1);
    canvas.height = PANEL_H * (window.devicePixelRatio || 1);
    Object.assign(canvas.style, {
      position: 'fixed',
      left: '16px',
      bottom: '16px',
      width: `${PANEL_W}px`,
      height: `${PANEL_H}px`,
      borderRadius: '12px',
      background: 'rgba(12,16,22,0.82)',
      boxShadow: '0 6px 24px rgba(0,0,0,0.45)',
      cursor: 'crosshair',
      touchAction: 'none',
      zIndex: '10',
    });
    container.appendChild(canvas);
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('VirtualTrackpad: 2D canvas context unavailable');
    this.canvas = canvas;
    this.ctx = ctx;

    canvas.addEventListener('mousedown', this.onMouseDown);
    window.addEventListener('mousemove', this.onMouseMove);
    window.addEventListener('mouseup', this.onMouseUp);
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);

    this.emitTimer = setInterval(this.emit, 1000 / EMIT_HZ);
    this.draw();
  }

  dispose(): void {
    clearInterval(this.emitTimer);
    this.canvas.removeEventListener('mousedown', this.onMouseDown);
    window.removeEventListener('mousemove', this.onMouseMove);
    window.removeEventListener('mouseup', this.onMouseUp);
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
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
    if (e.button !== 0) return;
    e.preventDefault();
    this.aDown = true;
    this.aId = this.nextContactId++;
    this.aPos = this.toPad(e.clientX, e.clientY);
    if (this.shiftHeld) this.plantB();
  };

  private onMouseMove = (e: MouseEvent): void => {
    if (!this.aDown) return;
    this.aPos = this.toPad(e.clientX, e.clientY);
    if (this.bId && !this.ctrlHeld) this.bPos = this.mirror(this.aPos);
  };

  private onMouseUp = (e: MouseEvent): void => {
    if (e.button !== 0) return;
    this.aDown = false;
    this.aId = 0;
    this.bId = 0; // B needs LMB held too
  };

  private plantB(): void {
    if (this.bId) return;
    this.bId = this.nextContactId++;
    this.bPos = this.ctrlHeld ? this.bPos : this.mirror(this.aPos);
  }

  private onKeyDown = (e: KeyboardEvent): void => {
    if (e.key === 'Shift') {
      this.shiftHeld = true;
      if (this.aDown) this.plantB();
      return;
    }
    if (e.key === 'Control') {
      this.ctrlHeld = true;
      return;
    }
    if (e.code === 'Space') {
      this.primary = true;
      e.preventDefault();
      return;
    }
    switch (e.key.toLowerCase()) {
      case 's':
        this.profile.toggleStance();
        break;
      case 'c':
        this.captureCalibration();
        break;
      case 'f':
        this.profile.toggleSwapFeet();
        break;
      case '0':
        this.profile.setAssistLevel(0);
        break;
      case '1':
        this.profile.setAssistLevel(1);
        break;
      case '2':
        this.profile.setAssistLevel(2);
        break;
      default:
        break;
    }
  };

  private onKeyUp = (e: KeyboardEvent): void => {
    if (e.key === 'Shift') {
      this.shiftHeld = false;
      this.bId = 0; // releasing SHIFT lifts foot B
    } else if (e.key === 'Control') {
      this.ctrlHeld = false;
    } else if (e.code === 'Space') {
      this.primary = false;
    }
  };

  /** C: set padYawOffset from the current raw segment angle (both feet down). */
  private captureCalibration(): void {
    if (!this.aDown || !this.bId) return;
    const deg = (Math.atan2(this.bPos.y - this.aPos.y, this.bPos.x - this.aPos.x) * 180) / Math.PI;
    this.profile.setPadYawOffset(deg);
  }

  // --- 120 Hz frame emission ----------------------------------------------
  private emit = (): void => {
    const contacts: ContactFrame['contacts'] = [];
    if (this.aDown) contacts.push({ id: this.aId, tip: true, x: this.aPos.x, y: this.aPos.y, confidence: true });
    if (this.bId) contacts.push({ id: this.bId, tip: true, x: this.bPos.x, y: this.bPos.y, confidence: true });
    const frame: ContactFrame = {
      schemaVersion: 1,
      frameId: this.frameCounter++,
      tPerfMs: performance.now(),
      source: 'synthetic',
      contacts,
      buttons: { primary: this.primary, secondary: false, auxiliary: false },
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
    ctx.strokeStyle = 'rgba(90,120,150,0.18)';
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
    ctx.strokeStyle = 'rgba(120,150,180,0.35)';
    ctx.beginPath();
    ctx.moveTo(PANEL_W / 2, 0);
    ctx.lineTo(PANEL_W / 2, PANEL_H);
    ctx.stroke();

    const prof = this.profile.get();
    ctx.fillStyle = 'rgba(200,220,240,0.9)';
    ctx.font = '11px system-ui, sans-serif';
    ctx.fillText('DEV PAD (non-representative)', 8, 15);
    ctx.fillStyle = 'rgba(150,175,200,0.85)';
    ctx.fillText(
      `stance ${prof.stance}  swap ${prof.swapFeet ? 'on' : 'off'}  yaw ${prof.padYawOffset.toFixed(0)}°  assist ${prof.assistLevel}`,
      8,
      PANEL_H - 22,
    );
    ctx.fillStyle = 'rgba(120,145,170,0.7)';
    ctx.fillText('LMB=A · Shift=B · Ctrl=lockB · Space=click', 8, PANEL_H - 8);

    // Segment line between the two feet.
    if (this.aDown && this.bId) {
      ctx.strokeStyle = this.primary ? 'rgba(255,120,90,0.9)' : 'rgba(120,200,160,0.8)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(this.aPos.x * PANEL_W, this.aPos.y * PANEL_H);
      ctx.lineTo(this.bPos.x * PANEL_W, this.bPos.y * PANEL_H);
      ctx.stroke();
    }
    if (this.aDown) this.drawContact(this.aPos, '#4aa3ff', 'A');
    if (this.bId) this.drawContact(this.bPos, '#4ade80', 'B');
  }

  private drawContact(p: Vec2, color: string, label: string): void {
    const ctx = this.ctx;
    const x = p.x * PANEL_W;
    const y = p.y * PANEL_H;
    ctx.beginPath();
    ctx.fillStyle = this.primary ? '#ff785a' : color;
    ctx.arc(x, y, 9, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#0b0d10';
    ctx.font = 'bold 10px system-ui, sans-serif';
    ctx.fillText(label, x - 3, y + 3);
  }
}
