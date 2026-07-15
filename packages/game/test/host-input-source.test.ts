/**
 * HostInputSource — the native-host → InputHub contract. This is the failure
 * mode behind "the trackpad does nothing": if the message→intake wiring is wrong,
 * hardware frames never reach the sim. We fake `window.chrome.webview`, dispatch
 * real `contactBatch` envelopes, and assert the frames land in the InputHub (and
 * that junk is ignored without throwing).
 */

import { afterEach, describe, expect, it } from "vitest";
import { DEFAULT_INPUT_PROFILE, DEFAULT_SIM_CONFIG } from "@slackpad/shared";
import type { ContactFrame, SessionTrace } from "@slackpad/shared";
import { InputHub } from "../src/input/InputHub";
import { FootTracker } from "../src/input/FootTracker";
import { Telemetry } from "../src/telemetry/Telemetry";
import { HostInputSource } from "../src/input/HostInputSource";

type MessageListener = (event: { data: unknown }) => void;

function fakeWebview() {
  const listeners: MessageListener[] = [];
  const posted: unknown[] = [];
  const api = {
    addEventListener: (_type: "message", listener: MessageListener) => {
      listeners.push(listener);
    },
    removeEventListener: (_type: "message", listener: MessageListener) => {
      const i = listeners.indexOf(listener);
      if (i >= 0) listeners.splice(i, 1);
    },
    postMessage: (message: unknown) => {
      posted.push(message);
    },
  };
  return {
    api,
    posted,
    listenerCount: () => listeners.length,
    emit: (data: unknown) => listeners.forEach((l) => l({ data })),
  };
}

function installHost(webviewApi: unknown): void {
  (globalThis as Record<string, unknown>).window = {
    chrome: { webview: webviewApi },
    location: { search: "" },
  };
}

function clearHost(): void {
  delete (globalThis as Record<string, unknown>).window;
  delete (globalThis as Record<string, unknown>).document;
}

afterEach(clearHost);

function hardwareFrame(overrides: Partial<ContactFrame> = {}): ContactFrame {
  return {
    schemaVersion: 1,
    frameId: 0,
    tPerfMs: 1,
    source: "hardware",
    contacts: [{ id: 1, tip: true, x: 0.5, y: 0.5, confidence: true }],
    buttons: { primary: false, secondary: false, auxiliary: false },
    ...overrides,
  };
}

function contactBatch(frames: ContactFrame[]): unknown {
  return {
    v: 1,
    type: "contactBatch",
    source: "hardware",
    hostTPerfMs: 0,
    frames,
  };
}

describe("HostInputSource environment detection", () => {
  it("is false in a plain (no-window) environment", () => {
    expect(HostInputSource.isHostEnvironment()).toBe(false);
  });

  it("is false when window has no chrome.webview", () => {
    (globalThis as Record<string, unknown>).window = {
      location: { search: "" },
    };
    expect(HostInputSource.isHostEnvironment()).toBe(false);
  });

  it("is true when window.chrome.webview exists", () => {
    installHost(fakeWebview().api);
    expect(HostInputSource.isHostEnvironment()).toBe(true);
  });
});

describe("HostInputSource attach + intake", () => {
  it("registers the hardware source and posts a single ready message", () => {
    const wv = fakeWebview();
    installHost(wv.api);
    const telemetry = new Telemetry();
    const hub = new InputHub(telemetry);
    const source = new HostInputSource(hub, telemetry);

    expect(source.attach()).toBe(true);
    expect(hub.registeredSources()).toContain("hardware");
    expect(wv.posted).toEqual([{ v: 1, type: "ready", payload: {} }]);
    expect(wv.listenerCount()).toBe(1);

    // Idempotent: a second attach does not double-subscribe or re-announce.
    expect(source.attach()).toBe(false);
    expect(wv.posted).toHaveLength(1);
  });

  it("exports a labeled trace through the native bridge without a privileged gameplay command", () => {
    const wv = fakeWebview();
    installHost(wv.api);
    const telemetry = new Telemetry();
    const hub = new InputHub(telemetry);
    const source = new HostInputSource(hub, telemetry);
    const trace: SessionTrace = {
      header: {
        replayVersion: 1,
        gameVersion: "0.1.0",
        rapierVersion: "0.19.3",
        hz: 60,
        seed: 1,
        levelId: "flat-dev",
        createdAt: "2026-07-14T00:00:00Z",
        contactFrameSchema: 1,
        profile: DEFAULT_INPUT_PROFILE,
      },
      frames: [],
      checkpoints: [],
      controlTrace: { version: 2, profile: DEFAULT_INPUT_PROFILE, events: [] },
    };

    expect(source.exportControlTrace(trace, "kickflip-clean")).toBe(true);
    expect(wv.posted).toEqual([
      { v: 1, type: "exportControlTrace", payload: { trace, label: "kickflip-clean" } },
    ]);
  });

  it("pushes contactBatch frames into the InputHub", () => {
    const wv = fakeWebview();
    installHost(wv.api);
    const telemetry = new Telemetry();
    const hub = new InputHub(telemetry);
    new HostInputSource(hub, telemetry).attach();

    wv.emit(
      contactBatch([
        hardwareFrame({ frameId: 0 }),
        hardwareFrame({ frameId: 1 }),
      ]),
    );

    expect(hub.pendingCount()).toBe(2);
    expect(telemetry.count("frameAccepted")).toBe(2);
    const drained = hub.drainForStep();
    expect(drained.map((f) => f.source)).toEqual(["hardware", "hardware"]);
  });

  it("exposes the latest confident two-contact line for native calibration", () => {
    const wv = fakeWebview();
    installHost(wv.api);
    const source = new HostInputSource(new InputHub(new Telemetry()), new Telemetry());
    source.attach();
    wv.emit(contactBatch([hardwareFrame({
      contacts: [
        { id: 1, tip: true, x: 0.4, y: 0.4, confidence: true },
        { id: 2, tip: true, x: 0.6, y: 0.6, confidence: true },
      ],
    })]));

    expect(source.currentSegmentAngleDeg()).toBeCloseTo(45, 5);
  });

  it("treats the calibration line as undirected when hardware contact order reverses", () => {
    const wv = fakeWebview();
    installHost(wv.api);
    const source = new HostInputSource(new InputHub(new Telemetry()), new Telemetry());
    source.attach();
    wv.emit(contactBatch([hardwareFrame({
      contacts: [
        { id: 2, tip: true, x: 0.6, y: 0.6, confidence: true },
        { id: 1, tip: true, x: 0.4, y: 0.4, confidence: true },
      ],
    })]));

    expect(source.currentSegmentAngleDeg()).toBeCloseTo(45, 5);
  });

  it("preserves a press and release delivered in one host batch as one kick edge", () => {
    const wv = fakeWebview();
    installHost(wv.api);
    const telemetry = new Telemetry();
    const hub = new InputHub(telemetry);
    new HostInputSource(hub, telemetry).attach();
    const tracker = new FootTracker(
      DEFAULT_SIM_CONFIG.footTracker,
      DEFAULT_SIM_CONFIG.recognition.plantSpeedEps,
      { ...DEFAULT_INPUT_PROFILE, kickAttribution: "buttonSide" },
      telemetry,
    );
    const contacts = [
      { id: 10, tip: true, x: 0.4, y: 0.5, confidence: true },
      { id: 11, tip: true, x: 0.6, y: 0.5, confidence: true },
    ];

    wv.emit(
      contactBatch([hardwareFrame({ frameId: 0, tPerfMs: 1, contacts })]),
    );
    tracker.update(hub.drainForStep(), 0);

    wv.emit(
      contactBatch([
        hardwareFrame({
          frameId: 1,
          tPerfMs: 2,
          contacts,
          buttons: { primary: true, secondary: false, auxiliary: false },
        }),
        hardwareFrame({ frameId: 2, tPerfMs: 3, contacts }),
      ]),
    );
    tracker.update(hub.drainForStep(), 1);

    expect(tracker.drainKicks()).toEqual([
      { step: 1, mask: "both", button: "primary" },
    ]);
  });

  it("ignores non-envelope junk without throwing", () => {
    const wv = fakeWebview();
    installHost(wv.api);
    const telemetry = new Telemetry();
    const hub = new InputHub(telemetry);
    new HostInputSource(hub, telemetry).attach();

    expect(() => wv.emit({ hello: "world" })).not.toThrow();
    expect(() => wv.emit(null)).not.toThrow();
    expect(() => wv.emit("a string")).not.toThrow();
    expect(() =>
      wv.emit({ v: 2, type: "contactBatch", frames: [] }),
    ).not.toThrow();
    // v:1 envelope but frames is not an array — must be guarded, not thrown.
    expect(() =>
      wv.emit({
        v: 1,
        type: "contactBatch",
        source: "hardware",
        hostTPerfMs: 0,
        frames: "nope",
      }),
    ).not.toThrow();
    expect(hub.pendingCount()).toBe(0);
  });

  it("rejects a malformed frame inside a valid envelope (InputHub guard)", () => {
    const wv = fakeWebview();
    installHost(wv.api);
    const telemetry = new Telemetry();
    const hub = new InputHub(telemetry);
    new HostInputSource(hub, telemetry).attach();

    const bad = {
      ...hardwareFrame(),
      contacts: [{ id: 1, tip: true, x: 5, y: 0.5, confidence: true }],
    };
    wv.emit(contactBatch([bad as ContactFrame]));

    expect(hub.pendingCount()).toBe(0);
    expect(telemetry.count("frameRejected")).toBe(1);
  });

  it("logs host focus envelopes to telemetry", () => {
    const wv = fakeWebview();
    installHost(wv.api);
    const telemetry = new Telemetry();
    const hub = new InputHub(telemetry);
    new HostInputSource(hub, telemetry).attach();

    wv.emit({ v: 1, type: "focus", payload: { focused: false } });
    expect(telemetry.count("hostFocus")).toBe(1);
  });

  it("notifies the app so focus loss can release latched controls", () => {
    const wv = fakeWebview();
    installHost(wv.api);
    const telemetry = new Telemetry();
    const hub = new InputHub(telemetry);
    const focusStates: boolean[] = [];
    new HostInputSource(hub, telemetry, (focused) =>
      focusStates.push(focused),
    ).attach();

    wv.emit({ v: 1, type: "focus", payload: { focused: false } });
    wv.emit({ v: 1, type: "focus", payload: { focused: true } });

    expect(focusStates).toEqual([false, true]);
  });

  it("attach() is inert outside the host and pushes nothing", () => {
    const telemetry = new Telemetry();
    const hub = new InputHub(telemetry);
    const source = new HostInputSource(hub, telemetry);
    expect(source.active).toBe(false);
    expect(source.attach()).toBe(false);
  });
});
