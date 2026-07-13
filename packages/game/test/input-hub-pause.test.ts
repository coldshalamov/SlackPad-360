import { describe, expect, it } from 'vitest';
import type { ContactFrame } from '@slackpad/shared';
import { InputHub } from '../src/input/InputHub';
import { Telemetry } from '../src/telemetry/Telemetry';

function frame(frameId: number): ContactFrame {
  return {
    schemaVersion: 1,
    frameId,
    tPerfMs: frameId,
    source: 'hardware',
    contacts: [{ id: 1, tip: true, x: 0.4, y: 0.5, confidence: true }],
    buttons: { primary: false, secondary: false, auxiliary: false },
  };
}

describe('InputHub pause gate', () => {
  it('drops frames while paused, clears an existing backlog, and keeps the input source registered for resume', () => {
    const hub = new InputHub(new Telemetry());
    hub.registerSource('hardware');
    expect(hub.push(frame(0))).toBe(true);
    expect(hub.pendingCount()).toBe(1);

    hub.setPaused(true);
    expect(hub.pendingCount()).toBe(0);
    expect(hub.push(frame(1))).toBe(false);
    expect(hub.registeredSources()).toContain('hardware');

    hub.setPaused(false);
    expect(hub.push(frame(2))).toBe(true);
    expect(hub.drainForStep().map((entry) => entry.frameId)).toEqual([2]);
  });
});
