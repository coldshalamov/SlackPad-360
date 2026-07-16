/**
 * Feel-report vitest entry (Sprint 02 S0). Skipped in the ordinary suite;
 * scripts/run-feel-report.mjs (npm run feel:report) sets FEEL_REPORT_DIR to
 * activate it. FEEL_GATES selects which gate groups are ENFORCED ('steer,pop'
 * — empty/unset means report-only, the --no-gates baseline mode).
 *
 * The S0 determinism gate is asserted on every invocation: the full scenario
 * battery runs twice and the two reports (JSON + SVGs + markdown) must be
 * byte-identical.
 */

import { describe, expect, it } from 'vitest';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { runFeelReport } from '../../scripts/feel-report';
import type { FeelGate, GateGroup } from '../../scripts/feel-report';

const OUT_DIR = process.env.FEEL_REPORT_DIR;
const GATE_GROUPS = (process.env.FEEL_GATES ?? '')
  .split(',')
  .map((s) => s.trim())
  .filter((s): s is GateGroup => s === 'steer' || s === 'pop');

describe.skipIf(!OUT_DIR)('feel report (S0)', () => {
  it(
    'produces a byte-identical report on two consecutive runs and writes artifacts',
    async () => {
      const first = await runFeelReport();
      const second = await runFeelReport();

      const firstJson = JSON.stringify(first.report, null, 2);
      const secondJson = JSON.stringify(second.report, null, 2);
      // S0 hard gate: determinism. Two runs of the same build must agree bit-for-bit.
      expect(secondJson).toBe(firstJson);
      expect(second.markdown).toBe(first.markdown);
      for (const [name, svg] of Object.entries(first.svgs)) {
        expect(second.svgs[name]).toBe(svg);
      }

      const dir = OUT_DIR!;
      mkdirSync(join(dir, 'plots'), { recursive: true });
      writeFileSync(join(dir, 'report.json'), `${firstJson}\n`);
      writeFileSync(join(dir, 'report.md'), first.markdown);
      for (const [name, svg] of Object.entries(first.svgs)) {
        writeFileSync(join(dir, 'plots', name), svg);
      }

      const gates = first.report.gates as FeelGate[];
      const enforced = gates.filter((g) => GATE_GROUPS.includes(g.group));
      for (const g of enforced) {
        expect
          .soft(g.pass, `${g.id} ${g.description}: ${g.value} !${g.op} ${g.threshold}`)
          .toBe(true);
      }
    },
    600_000,
  );
});
