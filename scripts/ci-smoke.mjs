#!/usr/bin/env node
/**
 * CI smoke: structural validators + unit tests + production build.
 * Host build runs only when a .NET 10 SDK is present (G-DOTNET10-SDK).
 */
import { execSync } from 'node:child_process';

const steps = [];

function run(name, cmd, opts = {}) {
  process.stdout.write(`\n=== ${name} ===\n`);
  try {
    execSync(cmd, { stdio: 'inherit', ...opts });
    steps.push({ name, ok: true });
  } catch (err) {
    steps.push({ name, ok: false });
    if (!opts.allowFail) {
      summarize();
      process.exit(1);
    }
  }
}

function summarize() {
  process.stdout.write('\n=== ci-smoke summary ===\n');
  for (const s of steps) {
    process.stdout.write(`${s.ok ? 'PASS' : 'FAIL'}  ${s.name}\n`);
  }
}

run('validators: research deliverables', 'node research/probes/validate-deliverables.mjs');
run('validators: research followup', 'node research/probes/validate-followup.mjs');
run('validators: final package', 'node preproduction/probes/validate-final.mjs');
run('typecheck', 'npm run typecheck');
run('unit tests', 'npx vitest run');
run('golden reports (G4 evidence)', 'node scripts/run-goldens.mjs');
run('asset pipeline build + validate', 'npx vitest run packages/asset-pipeline', {
  env: { ...process.env, RUN_ASSET_PIPELINE: '1' },
});
run('game production build', 'npm run build -w @slackpad/game');

let hasNet10 = false;
try {
  const sdks = execSync('dotnet --list-sdks', { encoding: 'utf8' });
  hasNet10 = /^10\./m.test(sdks);
} catch {
  // dotnet missing entirely
}
if (hasNet10) {
  run('host build (net10.0-windows)', 'dotnet build host/SlackPad.sln -c Release --nologo -v minimal');
} else {
  process.stdout.write('\n(skip) host build — .NET 10 SDK not installed (G-DOTNET10-SDK)\n');
}

summarize();
const failed = steps.some((s) => !s.ok);
process.exit(failed ? 1 : 0);
