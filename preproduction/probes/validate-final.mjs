/**
 * Final package + AUTONOMOUS_BUILD_GOAL validator for SlackPad 360.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..', '..');
const finalDir = path.join(repoRoot, 'preproduction', 'final');
const cycle3Dir = path.join(repoRoot, 'preproduction', 'cycles', '03-production');

const REQUIRED_FINAL = [
  'README.md',
  'AUTONOMOUS_BUILD_GOAL.md',
  'IMPLEMENTATION_PLAN.md',
  'ACCEPTANCE_MATRIX.md',
  'ASSET_MANIFEST.md',
  'ARCHITECTURE.md',
  'RISK_AND_GATES.md',
];

const FORBIDDEN_PRODUCTION = [
  'src/game',
  'src/main.ts',
  'game/src',
  'app/src',
  'host/bin',
  'packages/game/src',
];

let failures = 0;
let checks = 0;

function ok(msg) {
  checks++;
  console.log(`OK: ${msg}`);
}

function fail(msg) {
  failures++;
  checks++;
  console.error(`FAIL: ${msg}`);
}

function readText(p) {
  return fs.readFileSync(p, 'utf8');
}

function exists(p) {
  return fs.existsSync(p);
}

function nonEmptyLines(text) {
  return text.split(/\r?\n/).filter((l) => l.trim().length > 0).length;
}

console.log('Repo root:', repoRoot);
console.log('Final dir:', finalDir);

if (!exists(finalDir)) fail('preproduction/final missing');
else ok('final directory exists');

for (const f of REQUIRED_FINAL) {
  const p = path.join(finalDir, f);
  if (!exists(p)) fail(`missing final deliverable: ${f}`);
  else {
    const n = nonEmptyLines(readText(p));
    if (n < 8) fail(`${f} too thin (${n} lines)`);
    else ok(`${f} present (${n} non-empty lines)`);
  }
}

// --- AUTONOMOUS_BUILD_GOAL required content ---
const goalPath = path.join(finalDir, 'AUTONOMOUS_BUILD_GOAL.md');
const goal = readText(goalPath);
const firstNonEmpty = goal.split(/\r?\n/).find((l) => l.trim().length > 0) || '';
if (!firstNonEmpty.startsWith('/goal')) {
  fail('AUTONOMOUS_BUILD_GOAL.md must start with /goal');
} else ok('AUTONOMOUS_BUILD_GOAL starts with /goal');

const goalRules = [
  { name: 'G1-first', re: /G1[- ].*first|G1-first|hardware spike.*before|before expensive content/i },
  { name: 'ContactFrame-only agent', re: /ContactFrame/i },
  { name: 'no direct trick/pose', re: /no direct trick|forceTrick|setBoardPose|pose API/i },
  { name: 'Blender ownership', re: /foreign Blender|Blender ownership|G-BLENDER/i },
  { name: 'milestone commits', re: /commit after|Commit boundary|chore\(m0\)|feat\(m/i },
  { name: 'synthetic cannot claim G1/G2/G5', re: /Never claim G1\/G2\/G5|synthetic tests alone/i },
  { name: 'professional visuals', re: /Professional visuals|professional tactile|No permanent low-quality/i },
  { name: 'stop/pause resume', re: /pause-packet|Pause only|resumable/i },
  { name: 'packaged first-ship done', re: /packaged first-ship|playable packaged/i },
  { name: 'dirty tree preserve', re: /dirty tree|Preserve unrelated/i },
  { name: 'verification', re: /Vitest|golden|screenshot|canvas-pixel|determinist/i },
  { name: 'net10 host', re: /net10\.0-windows/i },
];

for (const r of goalRules) {
  if (!r.re.test(goal)) fail(`AUTONOMOUS_BUILD_GOAL missing rule: ${r.name}`);
  else ok(`goal has ${r.name}`);
}

// must not select .NET 8 as final host
if (/TargetFramework.*net8|primary host.*\.NET 8|TFM.*net8\.0-windows/i.test(goal) && !/not.*\.NET 8|supersede|\.NET 8 as/i.test(goal)) {
  fail('goal appears to select .NET 8 as host');
} else ok('goal does not select .NET 8 as final host');

// --- final README readiness ---
const readme = readText(path.join(finalDir, 'README.md'));
if (!/asset-gap|Readiness/i.test(readme)) fail('final README missing readiness verdict');
else ok('final README has readiness verdict');

// --- architecture mentions net10 and ContactFrame ---
const arch = readText(path.join(finalDir, 'ARCHITECTURE.md'));
if (!/net10\.0-windows/i.test(arch)) fail('ARCHITECTURE missing net10.0-windows');
else ok('ARCHITECTURE has net10.0-windows');
if (!/ContactFrame/i.test(arch)) fail('ARCHITECTURE missing ContactFrame');
else ok('ARCHITECTURE has ContactFrame');

// --- asset manifest honest ---
const am = readText(path.join(finalDir, 'ASSET_MANIFEST.md'));
if (!/asset-gap/i.test(am)) fail('ASSET_MANIFEST missing asset-gap');
else ok('ASSET_MANIFEST has asset-gap');
if (!/Runtime-ready|runtime/i.test(am)) fail('ASSET_MANIFEST missing runtime section');
else ok('ASSET_MANIFEST has runtime section');
if (!/hero|bespoke/i.test(am)) fail('ASSET_MANIFEST missing hero/bespoke');
else ok('ASSET_MANIFEST has bespoke gaps');
if (!/audio|kenney-interface|impact/i.test(am)) fail('ASSET_MANIFEST missing audio disposition');
else ok('ASSET_MANIFEST has audio');

// --- risk and gates ---
const risk = readText(path.join(finalDir, 'RISK_AND_GATES.md'));
for (const m of [/G1/i, /Stop|stop/i, /pivot/i, /synthetic/i]) {
  if (!m.test(risk)) fail(`RISK_AND_GATES missing ${m}`);
  else ok(`RISK_AND_GATES has ${m}`);
}

// --- acceptance matrix ---
const acc = readText(path.join(finalDir, 'ACCEPTANCE_MATRIX.md'));
if (!/G1/i.test(acc) || !/ContactFrame/i.test(acc)) fail('ACCEPTANCE_MATRIX incomplete');
else ok('ACCEPTANCE_MATRIX has G1 and ContactFrame');

// --- implementation plan M0-M10 ---
const plan = readText(path.join(finalDir, 'IMPLEMENTATION_PLAN.md'));
for (const m of ['M0', 'M1', 'M10', 'G1']) {
  if (!plan.includes(m)) fail(`IMPLEMENTATION_PLAN missing ${m}`);
  else ok(`IMPLEMENTATION_PLAN has ${m}`);
}

// --- cycle3 must exist (authoritative deep package) ---
if (!exists(cycle3Dir)) fail('cycle-03-production missing (final depends on it)');
else ok('cycle-03-production exists');

// --- cycles 1/2 unmodified ---
try {
  const dirty = execSync(
    'git status --porcelain -- preproduction/cycles/01-foundation preproduction/cycles/02-adversarial',
    { cwd: repoRoot, encoding: 'utf8' },
  ).trim();
  if (dirty) fail(`cycle-1 or cycle-2 modified:\n${dirty}`);
  else ok('cycles 1–2 unmodified');
} catch (e) {
  fail(`git status failed: ${e.message}`);
}

// --- dependency lock host ---
const lockPath = path.join(cycle3Dir, 'dependency-lock.json');
if (!exists(lockPath)) fail('dependency-lock.json missing');
else {
  const lock = JSON.parse(readText(lockPath));
  if (lock.host?.tfm !== 'net10.0-windows') fail('final package dependency-lock not net10.0-windows');
  else ok('dependency-lock TFM net10.0-windows');
  const se = JSON.stringify(lock.smokeEvidence || {});
  if (!/vite-build-smoke/i.test(se)) fail('dependency-lock smokeEvidence must reference vite-build-smoke');
  else ok('dependency-lock references Vite production build evidence');
}

// --- Vite build evidence required ---
const viteMd = path.join(repoRoot, 'preproduction', 'evidence', 'cycle-03', 'vite-build-smoke.md');
if (!exists(viteMd)) fail('missing preproduction/evidence/cycle-03/vite-build-smoke.md');
else ok('vite-build-smoke.md present for final package');

// --- OGA author rubberduck in manifest ---
if (!/rubberduck/i.test(am)) fail('ASSET_MANIFEST missing rubberduck OGA author');
else ok('ASSET_MANIFEST names rubberduck');

// --- no production game paths (preproduction freeze only) ---
// Once the autonomous build has begun (evidence under preproduction/evidence/impl/),
// production paths are expected; the freeze check applied only before that point.
const implStarted = exists(path.join(repoRoot, 'preproduction', 'evidence', 'impl'));
if (implStarted) {
  ok('implementation era detected (evidence/impl exists); production-path freeze not applicable');
} else {
  for (const rel of FORBIDDEN_PRODUCTION) {
    if (exists(path.join(repoRoot, rel))) fail(`forbidden production path: ${rel}`);
    else ok(`no forbidden path: ${rel}`);
  }
}

// --- no root scratch ---
for (const name of fs.readdirSync(repoRoot)) {
  if (/^(tmp|temp|scratch)/i.test(name) && fs.statSync(path.join(repoRoot, name)).isDirectory()) {
    fail(`scratch folder at repo root: ${name}`);
  }
}
ok('no scratch folders at repo root');

// --- AUTONOMOUS goal references final package paths ---
if (!/preproduction\/final\//.test(goal) && !/ARCHITECTURE\.md/.test(goal)) {
  fail('goal should reference final package files');
} else ok('goal references final package');

console.log('');
if (failures > 0) {
  console.error(`Final package validation FAILED: ${failures} failure(s), ${checks} checks`);
  process.exit(1);
}
console.log(`All final package validations passed (${checks} checks).`);
process.exit(0);
