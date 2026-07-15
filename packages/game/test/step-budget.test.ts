/**
 * Step-budget smoke — time 600 sim steps and log avg/max step ms. The physics
 * budget is ≤4 ms @ 60 Hz (observability §3). Packaged target-hardware proof
 * remains a release gate, while this catches local regressions at the actual
 * physics budget instead of hiding them behind a multiplier.
 */
import { describe, expect, it } from 'vitest';
import { AgentHarness } from '../src/agent/AgentHarness';

const STEPS = 600;
const BUDGET_MS = 4;

describe('step-budget (perf smoke)', () => {
  it(`keeps average and p95 under ${BUDGET_MS} ms/step over ${STEPS} steps`, async () => {
    const harness = new AgentHarness();
    await harness.reset(0xc0ffee, 'flat-dev');

    // Warm up the WASM/JIT so the timed window is representative.
    harness.step(30);

    const samples: number[] = [];
    for (let i = 0; i < STEPS; i++) {
      const t0 = performance.now();
      harness.step(1);
      samples.push(performance.now() - t0);
    }

    const avg = samples.reduce((a, b) => a + b, 0) / STEPS;
    const sorted = [...samples].sort((a, b) => a - b);
    const p95 = sorted[Math.floor(STEPS * 0.95)] ?? 0;
    const max = sorted[STEPS - 1] ?? 0;
    // eslint-disable-next-line no-console
    console.log(
      `[step-budget] steps=${STEPS} avg=${avg.toFixed(3)}ms p95=${p95.toFixed(3)}ms ` +
        `max=${max.toFixed(3)}ms budget=${BUDGET_MS}ms`,
    );

    expect(harness.getStep()).toBe(STEPS + 30);
    expect(avg).toBeLessThan(BUDGET_MS);
    expect(p95).toBeLessThan(BUDGET_MS);
  });
});
