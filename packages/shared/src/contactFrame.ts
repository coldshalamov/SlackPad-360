/**
 * ContactFrame v1 — the sole input contract for hardware, synthetic, agent,
 * and replay sources. Mirrors research/probes/contact-frame.schema.json.
 *
 * Adapters emit ContactFrames; nothing downstream of InputHub may know where
 * a frame came from except via `source` (used for telemetry, never gameplay
 * branching).
 */

export const CONTACT_FRAME_SCHEMA_VERSION = 1 as const;

export type ContactFrameSource = 'hardware' | 'agent' | 'replay' | 'synthetic';

export interface Contact {
  /** Hardware/synthetic contact identifier — opaque, stable while tip down. */
  id: number;
  /** Tip switch: true while the finger is on the pad. */
  tip: boolean;
  /** Normalized pad X in [0, 1]. */
  x: number;
  /** Normalized pad Y in [0, 1]. */
  y: number;
  /** HID confidence — false means likely palm; such contacts are ignored. */
  confidence: boolean;
  pressure?: number | null;
  width?: number | null;
  height?: number | null;
}

export interface ContactFrameButtons {
  /** Report-level primary click (Button 1). Not per-finger. */
  primary: boolean;
  secondary: boolean;
  auxiliary: boolean;
}

export interface ContactFrameMeta {
  deviceId?: string;
  contactCountRaw?: number;
  [key: string]: unknown;
}

export interface ContactFrame {
  schemaVersion: typeof CONTACT_FRAME_SCHEMA_VERSION;
  /** Monotonic per-source frame counter. */
  frameId: number;
  /** Host QueryPerformanceCounter-derived milliseconds (or synthetic clock). */
  tPerfMs: number;
  /** HID scan time in microseconds when available. */
  tScanUs?: number | null;
  source: ContactFrameSource;
  contacts: Contact[];
  buttons: ContactFrameButtons;
  meta?: ContactFrameMeta;
}

export const CONTACT_FRAME_SOURCES: readonly ContactFrameSource[] = [
  'hardware',
  'agent',
  'replay',
  'synthetic',
];

export const MAX_CONTACTS_PER_FRAME = 5;

export interface ContactFrameValidationResult {
  ok: boolean;
  errors: string[];
}

function isFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

/**
 * Runtime validation equivalent to contact-frame.schema.json v1.
 * Malformed frames must be rejected (and logged) — never thrown past InputHub.
 */
export function validateContactFrame(value: unknown): ContactFrameValidationResult {
  const errors: string[] = [];
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return { ok: false, errors: ['frame is not an object'] };
  }
  const f = value as Record<string, unknown>;

  if (f.schemaVersion !== CONTACT_FRAME_SCHEMA_VERSION) {
    errors.push(`schemaVersion must be ${CONTACT_FRAME_SCHEMA_VERSION}`);
  }
  if (!Number.isInteger(f.frameId) || (f.frameId as number) < 0) {
    errors.push('frameId must be a non-negative integer');
  }
  if (!isFiniteNumber(f.tPerfMs)) {
    errors.push('tPerfMs must be a finite number');
  }
  if (f.tScanUs !== undefined && f.tScanUs !== null && !Number.isInteger(f.tScanUs)) {
    errors.push('tScanUs must be an integer or null');
  }
  if (!CONTACT_FRAME_SOURCES.includes(f.source as ContactFrameSource)) {
    errors.push(`source must be one of ${CONTACT_FRAME_SOURCES.join('|')}`);
  }

  if (!Array.isArray(f.contacts)) {
    errors.push('contacts must be an array');
  } else {
    if (f.contacts.length > MAX_CONTACTS_PER_FRAME) {
      errors.push(`contacts exceeds max ${MAX_CONTACTS_PER_FRAME}`);
    }
    f.contacts.forEach((c, i) => {
      if (typeof c !== 'object' || c === null) {
        errors.push(`contacts[${i}] not an object`);
        return;
      }
      const ct = c as Record<string, unknown>;
      if (!Number.isInteger(ct.id) || (ct.id as number) < 0) {
        errors.push(`contacts[${i}].id must be a non-negative integer`);
      }
      if (typeof ct.tip !== 'boolean') errors.push(`contacts[${i}].tip must be boolean`);
      if (!isFiniteNumber(ct.x) || ct.x < 0 || ct.x > 1) {
        errors.push(`contacts[${i}].x must be in [0,1]`);
      }
      if (!isFiniteNumber(ct.y) || ct.y < 0 || ct.y > 1) {
        errors.push(`contacts[${i}].y must be in [0,1]`);
      }
      if (typeof ct.confidence !== 'boolean') {
        errors.push(`contacts[${i}].confidence must be boolean`);
      }
      if (ct.pressure !== undefined && ct.pressure !== null) {
        if (!isFiniteNumber(ct.pressure) || ct.pressure < 0 || ct.pressure > 1) {
          errors.push(`contacts[${i}].pressure must be in [0,1] or null`);
        }
      }
    });
  }

  const buttons = f.buttons as Record<string, unknown> | undefined;
  if (typeof buttons !== 'object' || buttons === null) {
    errors.push('buttons must be an object');
  } else {
    for (const key of ['primary', 'secondary', 'auxiliary'] as const) {
      if (typeof buttons[key] !== 'boolean') errors.push(`buttons.${key} must be boolean`);
    }
  }

  return { ok: errors.length === 0, errors };
}

/**
 * Quantize a frame for replay storage so recorded and re-injected streams are
 * bit-identical. Positions quantize to 1/65535 (16-bit pad resolution class),
 * timestamps to 10 µs.
 */
export function quantizeContactFrame(frame: ContactFrame): ContactFrame {
  const q = (v: number) => Math.round(v * 65535) / 65535;
  return {
    ...frame,
    tPerfMs: Math.round(frame.tPerfMs * 100) / 100,
    contacts: frame.contacts.map((c) => ({
      ...c,
      x: q(c.x),
      y: q(c.y),
      pressure: c.pressure == null ? c.pressure : q(c.pressure),
    })),
  };
}
