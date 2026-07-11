/**
 * Run the M2 golden suites with GOLDEN_REPORT_DIR set so they emit
 * machine-readable reports (final-observability §4.1) into
 * preproduction/evidence/impl/m2-goldens/.
 *
 * Kept deliberately simple: set the env var, spawn vitest for the golden
 * file(s), inherit stdio, and propagate the exit code.
 */
import { spawnSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const reportDir = resolve(root, 'preproduction/evidence/impl/m2-goldens');
mkdirSync(reportDir, { recursive: true });

const result = spawnSync(
  'npx',
  ['vitest', 'run', 'packages/game/test/replay-hash.golden.test.ts'],
  {
    cwd: root,
    stdio: 'inherit',
    shell: true, // resolve npx(.cmd) on Windows
    env: { ...process.env, GOLDEN_REPORT_DIR: reportDir },
  },
);

if (result.error) {
  console.error(result.error);
  process.exit(1);
}
process.exit(result.status ?? 1);
