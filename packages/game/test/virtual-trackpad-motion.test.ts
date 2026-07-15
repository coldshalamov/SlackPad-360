import { afterEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_INPUT_PROFILE, DEFAULT_SIM_CONFIG, type ContactFrame } from "@slackpad/shared";
import { FootTracker } from "../src/input/FootTracker";
import { VirtualTrackpad } from "../src/input/VirtualTrackpad";
import type { InputHub } from "../src/input/InputHub";
import type { ProfileStore } from "../src/input/ProfileStore";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("VirtualTrackpad motion-only device edges", () => {
  it("emits lift and fresh-id replant samples immediately instead of waiting for its timer", () => {
    const emitted: ContactFrame[] = [];
    const ctx = {
      setTransform: vi.fn(),
      clearRect: vi.fn(),
      beginPath: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      stroke: vi.fn(),
      fillText: vi.fn(),
      arc: vi.fn(),
      fill: vi.fn(),
    } as unknown as CanvasRenderingContext2D;
    const canvas = {
      width: 0,
      height: 0,
      style: {},
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      getContext: vi.fn(() => ctx),
      getBoundingClientRect: vi.fn(() => ({ left: 0, top: 0, width: 260, height: 180 })),
      remove: vi.fn(),
    } as unknown as HTMLCanvasElement;
    const windowStub = {
      devicePixelRatio: 1,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    };
    vi.stubGlobal("window", windowStub);
    vi.stubGlobal("document", { createElement: vi.fn(() => canvas) });
    vi.stubGlobal("setInterval", vi.fn(() => 1));
    vi.stubGlobal("clearInterval", vi.fn());
    vi.spyOn(performance, "now")
      .mockReturnValueOnce(0)
      .mockReturnValueOnce(10)
      .mockReturnValueOnce(100)
      .mockReturnValueOnce(180);

    const inputHub = { push: vi.fn((frame: ContactFrame) => emitted.push(frame)) };
    const profile = {
      get: vi.fn(() => DEFAULT_INPUT_PROFILE),
      toggleStance: vi.fn(),
      setPadYawOffset: vi.fn(),
      toggleSwapFeet: vi.fn(),
      setAssistLevel: vi.fn(),
    };
    const pad = new VirtualTrackpad(
      { appendChild: vi.fn() } as unknown as HTMLElement,
      inputHub as unknown as InputHub,
      profile as unknown as ProfileStore,
    ) as unknown as {
      onKeyDown(event: Pick<KeyboardEvent, "key" | "preventDefault">): void;
      onKeyUp(event: Pick<KeyboardEvent, "key">): void;
      onMouseDown(event: Pick<MouseEvent, "button" | "clientX" | "clientY" | "preventDefault">): void;
      dispose(): void;
    };

    pad.onKeyDown({ key: "Shift", preventDefault: vi.fn() });
    pad.onMouseDown({ button: 0, clientX: 65, clientY: 90, preventDefault: vi.fn() });
    const planted = emitted.at(-1)!;
    expect(planted.contacts).toHaveLength(2);

    pad.onKeyDown({ key: "x", preventDefault: vi.fn() });
    const lifted = emitted.at(-1)!;
    expect(lifted.contacts).toHaveLength(1);

    pad.onKeyUp({ key: "x" });
    const replanted = emitted.at(-1)!;
    expect(replanted.contacts).toHaveLength(2);
    expect(replanted.contacts[0]!.id).not.toBe(planted.contacts[0]!.id);
    expect(replanted.buttons.primary).toBe(false);
    expect(replanted.buttons.secondary).toBe(false);

    const tracker = new FootTracker(
      DEFAULT_SIM_CONFIG.footTracker,
      DEFAULT_SIM_CONFIG.recognition.plantSpeedEps,
      DEFAULT_INPUT_PROFILE,
    );
    tracker.update(emitted, 12);
    expect(tracker.drainKicks()).toEqual([
      expect.objectContaining({ source: "motionTap", tapRole: "tail", tapDurationMs: 80 }),
    ]);

    pad.dispose();
  });
});
