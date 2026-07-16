/**
 * Feel-report runner (Sprint 02 S0) — same shape as run-goldens.mjs: set the
 * output env vars and spawn vitest on the feel-report entry.
 *
 *   npm run feel:report                        # gates OFF (baseline mode)
 *   npm run feel:report -- --gates steer       # enforce the S2 steering gates
 *   npm run feel:report -- --gates steer,pop   # enforce S2+S4 gates
 *   npm run feel:report -- --out <dir>         # artifact dir (default: .../feel/latest)
 *
 * Exit code: nonzero when an ENFORCED gate fails (vitest assertion) or the
 * report is nondeterministic; zero otherwise.
 */
import { spawnSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const args = process.argv.slice(2);
let gates = '';
let out = resolve(root, 'preproduction/evidence/impl/sprint-02/feel/latest');
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a === '--gates' && args[i + 1]) {
    gates = args[++i];
  } else if (a === '--no-gates') {
    gates = '';
  } else if (a === '--out' && args[i + 1]) {
    out = resolve(root, args[++i]);
  } else {
    console.error(`unknown argument: ${a}`);
    process.exit(2);
  }
}

mkdirSync(out, { recursive: true });

const result = spawnSync(
  'npx',
  ['vitest', 'run', 'packages/game/test/feel/feel-report.test.ts'],
  {
    cwd: root,
    stdio: 'inherit',
    shell: true, // resolve npx(.cmd) on Windows
    env: { ...process.env, FEEL_REPORT_DIR: out, FEEL_GATES: gates },
  },
);

if (result.error) {
  console.error(result.error);
  process.exit(1);
}
process.exit(result.status ?? 1);
