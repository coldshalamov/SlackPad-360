import { describe, expect, it } from "vitest";
import { AgentHarness } from "../src/agent/AgentHarness";

describe("AgentHarness input release", () => {
  it("clears planted feet and queued input without resetting the world", async () => {
    const harness = new AgentHarness();
    await harness.reset(0x10f0, "flat-dev");
    harness.injectContactFrame({
      schemaVersion: 1,
      frameId: 1,
      tPerfMs: 1,
      contacts: [
        { id: 10, tip: true, x: 0.4, y: 0.5, confidence: true },
        { id: 11, tip: true, x: 0.6, y: 0.5, confidence: true },
      ],
      buttons: { primary: false, secondary: false, auxiliary: true },
    });
    harness.step(1);
    expect(harness.observe().feet.nose.planted).toBe(true);
    expect(harness.observe().feet.tail.planted).toBe(true);
    const step = harness.getStep();

    harness.injectContactFrame({
      schemaVersion: 1,
      frameId: 2,
      tPerfMs: 2,
      contacts: [],
      buttons: { primary: false, secondary: false, auxiliary: false },
    });
    harness.releaseInputs("test-focus-loss");

    expect(harness.getStep()).toBe(step);
    expect(harness.getInputHub().pendingCount()).toBe(0);
    expect(harness.observe().feet.nose.planted).toBe(false);
    expect(harness.observe().feet.tail.planted).toBe(false);
    expect(harness.observe().inputSource).toBeNull();
    expect(harness.getTelemetry().count("inputReleased")).toBe(1);
  });
});
