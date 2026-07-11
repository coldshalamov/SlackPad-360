import type { ContactFrame } from './contactFrame';

/**
 * Host → page message envelope (WebView2 PostWebMessageAsJson payloads).
 */

export interface ContactBatchEnvelope {
  v: 1;
  type: 'contactBatch';
  source: 'hardware' | 'synthetic';
  hostTPerfMs: number;
  frames: ContactFrame[];
}

export interface HostInfoEnvelope {
  v: 1;
  type: 'hostInfo';
  payload: {
    os?: string;
    machine?: string;
    adapter?: 'raw' | 'pointer';
    qpcFreq?: number;
    hostVersion?: string;
  };
}

export interface FocusEnvelope {
  v: 1;
  type: 'focus';
  payload: { focused: boolean };
}

export interface SettingsEnvelope {
  v: 1;
  type: 'settings';
  payload: Record<string, unknown>;
}

export type HostToPageEnvelope =
  | ContactBatchEnvelope
  | HostInfoEnvelope
  | FocusEnvelope
  | SettingsEnvelope;

/** Page → host messages (chrome.webview.postMessage). */
export interface PageToHostMessage {
  v: 1;
  type: 'ready' | 'quit' | 'settings' | 'requestCalib';
  payload: Record<string, unknown>;
}

export function isHostToPageEnvelope(value: unknown): value is HostToPageEnvelope {
  if (typeof value !== 'object' || value === null) return false;
  const e = value as Record<string, unknown>;
  if (e.v !== 1) return false;
  return (
    e.type === 'contactBatch' ||
    e.type === 'hostInfo' ||
    e.type === 'focus' ||
    e.type === 'settings'
  );
}
