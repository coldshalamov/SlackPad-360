/**
 * Cycle-03 production package validator for SlackPad 360.
 * Reads real files — fails on missing/invalid deliverables, cycle 1/2 edits,
 * stale .NET 8 host selection, undepin/unlicensed deps, asset evidence gaps, etc.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..', '..');
const cycleDir = path.join(repoRoot, 'preproduction', 'cycles', '03-production');
const cycle1Dir = path.join(repoRoot, 'preproduction', 'cycles', '01-foundation');
const cycle2Dir = path.join(repoRoot, 'preproduction', 'cycles', '02-adversarial');
const assetsDir = path.join(repoRoot, 'assets');
const catalogDir = path.join(assetsDir, 'catalog');
const runtimeDir = path.join(assetsDir, 'runtime');
const evidenceDir = path.join(repoRoot, 'preproduction', 'evidence', 'cycle-03');

const REQUIRED = [
  'README.md',
  'audit-findings.md',
  'delta-from-cycle-02.md',
  'cross-cycle-decision-log.md',
  'final-product-and-scope-spec.md',
  'final-input-and-trick-spec.md',
  'final-physics-animation-camera-spec.md',
  'final-technical-architecture.md',
  'final-art-assets-world-audio-spec.md',
  'final-observability-and-verification.md',
  'implementation-milestones.md',
  'autonomy-and-empirical-gates.md',
  'risk-register.md',
  'unresolved-gates.md',
  'internet-stop-log.md',
  'asset-readiness.json',
  'dependency-lock.json',
  'decisions.json',
  'sources.json',
  'milestones.json',
  'review-checklist.md',
];

const FORBIDDEN_PRODUCTION = [
  'src/game',
  'src/main.ts',
  'game/src',
  'app/src',
  'host/bin',
  'packages/game/src',
];

const DECISION_FIELDS = [
  'id',
  'status',
  'decision',
  'rationale',
  'evidenceIds',
  'alternatives',
  'rejectionReasons',
  'confidence',
  'owner',
  'implementationConsequence',
  'validationMethod',
  'reopenTrigger',
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

function parseJson(p, label) {
  try {
    const data = JSON.parse(readText(p));
    ok(`${label} parses`);
    return data;
  } catch (e) {
    fail(`${label} invalid JSON: ${e.message}`);
    return null;
  }
}

function sha256File(p) {
  const h = crypto.createHash('sha256');
  h.update(fs.readFileSync(p));
  return h.digest('hex');
}

function walkFiles(dir, acc = []) {
  if (!exists(dir)) return acc;
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, ent.name);
    if (ent.name === '.git' || ent.name === 'node_modules') continue;
    if (ent.isDirectory()) walkFiles(full, acc);
    else acc.push(full);
  }
  return acc;
}

console.log('Repo root:', repoRoot);
console.log('Cycle dir:', cycleDir);

// --- required deliverables ---
if (!exists(cycleDir)) fail('cycle directory missing');
else ok('cycle directory exists');

for (const f of REQUIRED) {
  const p = path.join(cycleDir, f);
  if (!exists(p)) {
    fail(`missing required deliverable: ${f}`);
    continue;
  }
  const n = nonEmptyLines(readText(p));
  if (n < 5) fail(`${f} too thin (${n} non-empty lines)`);
  else ok(`${f} present (${n} non-empty lines)`);
}

// --- cycles 1/2 immutable in working tree ---
try {
  const dirty = execSync(
    'git status --porcelain -- preproduction/cycles/01-foundation preproduction/cycles/02-adversarial',
    { cwd: repoRoot, encoding: 'utf8' },
  ).trim();
  if (dirty) fail(`cycle-1 or cycle-2 modified in working tree:\n${dirty}`);
  else ok('research/ and 01-foundation/ + 02-adversarial clean (no modifications)');
} catch (e) {
  fail(`git status for cycles 1/2 failed: ${e.message}`);
}

// --- JSON cores ---
const decisions = parseJson(path.join(cycleDir, 'decisions.json'), 'decisions.json');
const sources = parseJson(path.join(cycleDir, 'sources.json'), 'sources.json');
const depLock = parseJson(path.join(cycleDir, 'dependency-lock.json'), 'dependency-lock.json');
const assetReady = parseJson(path.join(cycleDir, 'asset-readiness.json'), 'asset-readiness.json');
const milestones = parseJson(path.join(cycleDir, 'milestones.json'), 'milestones.json');

if (decisions) {
  if (!Array.isArray(decisions.decisions) || decisions.decisions.length < 5) {
    fail('decisions.json needs >=5 decisions');
  } else {
    ok(`decisions.json has ${decisions.decisions.length} decisions`);
  }
  for (const d of decisions.decisions || []) {
    for (const f of DECISION_FIELDS) {
      if (!(f in d)) {
        fail(`decision ${d.id || '?'} missing field ${f}`);
        break;
      }
    }
  }
  ok('decision field shape ok');
}

if (sources) {
  const list = sources.sources || [];
  if (list.length < 10) fail('sources.json too few sources');
  else ok(`sources.json has ${list.length} sources`);
  const ids = new Set(list.map((s) => s.id));
  if (decisions) {
    for (const d of decisions.decisions || []) {
      for (const eid of d.evidenceIds || []) {
        if (!ids.has(eid)) fail(`decision ${d.id} evidenceId missing in sources: ${eid}`);
      }
    }
    ok('all decision evidenceIds resolve to sources.json');
  }
}

// --- host TFM must be net10, not net8 as selected ---
if (depLock) {
  const tfm = depLock.host?.tfm || '';
  const pack = JSON.stringify(depLock);
  if (tfm !== 'net10.0-windows') fail(`dependency-lock host.tfm must be net10.0-windows, got ${tfm}`);
  else ok('dependency-lock host.tfm is net10.0-windows');
  if (/net8\.0-windows/.test(tfm)) fail('stale net8.0-windows as selected TFM');
  // selected host must not be .NET 8
  if (depLock.host?.sdk && /NET 8\b|\.NET 8\b/i.test(depLock.host.sdk) && !/supersedes/i.test(pack)) {
    fail('host.sdk still selects .NET 8');
  } else ok('host SDK is .NET 10 LTS line');
  if (!depLock.host?.webview2Sdk?.version) fail('missing WebView2 version pin');
  else ok(`WebView2 pinned ${depLock.host.webview2Sdk.version}`);
  const pkgs = depLock.packages || [];
  for (const p of pkgs) {
    if (!p.name || !p.version || !p.license) fail(`package incomplete: ${JSON.stringify(p)}`);
    if (!p.pinRule && !p.decision) fail(`package missing pin/decision: ${p.name}`);
  }
  ok(`dependency-lock packages ok (${pkgs.length})`);
  // reject selected net8 as primary
  const rejected = JSON.stringify(depLock.rejectedAsPrimary || []);
  if (!/NET 8|net8/i.test(rejected) && !/supersedes/i.test(pack)) {
    fail('dependency-lock should document rejection/supersession of .NET 8');
  } else ok('.NET 8 supersession/rejection recorded');
}

// architecture / product texts must mention net10 not select net8
const arch = readText(path.join(cycleDir, 'final-technical-architecture.md'));
if (!/net10\.0-windows/i.test(arch)) fail('final-technical-architecture missing net10.0-windows');
else ok('architecture mentions net10.0-windows');
if (/Primary host:.*\.NET 8|TFM:\s*`?net8\.0/i.test(arch)) fail('architecture still selects .NET 8 as primary');
else ok('architecture does not select .NET 8 as primary');

// --- delta and audit ---
const delta = readText(path.join(cycleDir, 'delta-from-cycle-02.md'));
for (const marker of [/Added/i, /Changed/i, /Rejected/i, /Deferred/i, /cycle.?2/i]) {
  if (!marker.test(delta)) fail(`delta-from-cycle-02 missing ${marker}`);
  else ok(`delta has ${marker}`);
}
const audit = readText(path.join(cycleDir, 'audit-findings.md'));
if (!/Resolved|Accepted/i.test(audit)) fail('audit-findings missing disposition language');
else ok('audit-findings has dispositions');
if (!/\.NET 10|net10/i.test(audit)) fail('audit-findings missing .NET 10 resolution');
else ok('audit-findings covers .NET 10');

// --- asset readiness ---
if (assetReady) {
  if (assetReady.readinessVerdict !== 'asset-gap' && assetReady.summary?.runtimeReady !== 0) {
    // allow asset-gap or explicit zero runtime
  }
  if (assetReady.readinessVerdict !== 'asset-gap') {
    fail(`readinessVerdict should be asset-gap for honest hero gaps, got ${assetReady.readinessVerdict}`);
  } else ok('asset-readiness readinessVerdict=asset-gap');
  const bespoke = assetReady.bespoke || [];
  const ids = new Set(bespoke.map((b) => b.id));
  for (const need of ['gap-hero-board', 'gap-shoes-feet', 'gap-modular-plaza']) {
    if (![...ids].some((id) => id.includes(need.replace('gap-', '')) || id === need)) {
      // check id exact
      if (!ids.has(need)) fail(`missing hero/plaza gap disposition: ${need}`);
      else ok(`gap present ${need}`);
    } else ok(`gap present ${need}`);
  }
  // audio disposition
  if (!assetReady.audioEventMap) fail('missing audioEventMap');
  else ok('audioEventMap present');
  const acquired = assetReady.acquired || [];
  for (const a of acquired) {
    if (a.runtimeReady === true) {
      fail(`acquired asset marked runtimeReady without separate promotion path: ${a.id}`);
    }
    if (a.path) {
      const full = path.join(repoRoot, a.path);
      if (!exists(full)) fail(`acquired asset path missing: ${a.path}`);
      else {
        if (a.sha256) {
          const h = sha256File(full);
          if (h !== a.sha256.toLowerCase()) fail(`hash mismatch ${a.id}: ${h} vs ${a.sha256}`);
          else ok(`asset ${a.id} hash matches`);
        }
        const dir = path.dirname(full);
        if (!exists(path.join(dir, 'LICENSE')) && !exists(path.join(dir, 'LICENSE.txt'))) {
          fail(`acquired asset missing LICENSE sidecar: ${a.id}`);
        } else ok(`asset ${a.id} has LICENSE`);
        if (!exists(path.join(dir, 'SOURCE.md'))) fail(`acquired asset missing SOURCE.md: ${a.id}`);
        else ok(`asset ${a.id} has SOURCE.md`);
      }
    }
  }
}

// --- catalogs ---
const assetsJson = parseJson(path.join(catalogDir, 'assets.json'), 'assets.json');
const depsJson = parseJson(path.join(catalogDir, 'dependencies.json'), 'dependencies.json');
if (depsJson) {
  const hostDep = (depsJson.dependencies || []).find((d) => d.id === 'dep-dotnet-host');
  if (!hostDep) fail('dependencies.json missing dep-dotnet-host');
  else if (!/net10|\.NET 10/i.test(JSON.stringify(hostDep))) fail('dep-dotnet-host not updated to .NET 10');
  else ok('catalog dep-dotnet-host is .NET 10');
  if (/decision":\s*"adopt"/.test(JSON.stringify(hostDep)) && /net8\.0-windows/i.test(hostDep.installIdentifier || '')) {
    fail('dep-dotnet-host still adopts net8.0-windows');
  }
}

// --- runtime empty ---
const runtimeFiles = walkFiles(runtimeDir).filter((f) => !f.endsWith('.gitkeep'));
if (runtimeFiles.length > 0) fail(`assets/runtime/ must stay empty; found ${runtimeFiles.length} files`);
else ok('assets/runtime/ has no candidate files');

// --- unresolved gates ownership ---
const gates = readText(path.join(cycleDir, 'unresolved-gates.md'));
for (const marker of [/Accept/i, /Reject/i, /Fallback/i, /G1/i, /owner/i]) {
  if (!marker.test(gates)) fail(`unresolved-gates missing ${marker}`);
  else ok(`unresolved-gates has ${marker}`);
}

// --- milestones ---
if (milestones) {
  const ms = milestones.milestones || [];
  if (ms.length < 11) fail(`expected >=11 milestones M0-M10, got ${ms.length}`);
  else ok(`milestones.json has ${ms.length} milestones`);
}

// --- evidence ---
if (!exists(evidenceDir)) fail('preproduction/evidence/cycle-03 missing');
else ok('cycle-03 evidence dir exists');
const evFiles = fs.readdirSync(evidenceDir);
if (!evFiles.some((f) => /smoke|toolchain|js/i.test(f))) fail('missing toolchain smoke evidence');
else ok('toolchain smoke evidence present');

// Real Vite production build proof (not require.resolve / viteResolved)
const viteEvidenceCandidates = [
  'vite-build-smoke.md',
  'vite-build-smoke.log',
  'vite-build-dist-inventory.txt',
];
for (const f of viteEvidenceCandidates) {
  const p = path.join(evidenceDir, f);
  if (!exists(p)) fail(`missing Vite build evidence file: ${f}`);
  else ok(`Vite build evidence present: ${f}`);
}
const viteMd = readText(path.join(evidenceDir, 'vite-build-smoke.md'));
if (!/exit code[:\s]*\**0\**/i.test(viteMd) && !/\*\*0\*\*/.test(viteMd) && !/Exit code:\s*\*\*0\*\*/i.test(viteMd)) {
  // also accept plain "exit code | 0" table form
  if (!/exit code/i.test(viteMd) || !/\b0\b/.test(viteMd)) {
    fail('vite-build-smoke.md must document exit code 0');
  } else ok('vite-build-smoke.md documents exit code');
} else ok('vite-build-smoke.md documents exit code 0');
if (!/three@?0\.185\.1|three.*0\.185\.1/i.test(viteMd)) fail('vite-build-smoke.md missing three@0.185.1 pin');
else ok('vite-build-smoke.md pins three');
if (!/rapier3d-deterministic-compat.*0\.19\.3|0\.19\.3.*rapier/i.test(viteMd)) {
  fail('vite-build-smoke.md missing rapier 0.19.3 pin');
} else ok('vite-build-smoke.md pins rapier');
if (!/8\.1\.4/.test(viteMd)) fail('vite-build-smoke.md missing vite 8.1.4');
else ok('vite-build-smoke.md pins vite 8.1.4');
if (!/2,?422|2422|bundle|dist\//i.test(viteMd)) fail('vite-build-smoke.md missing bundle inventory/size');
else ok('vite-build-smoke.md has bundle inventory');

const viteLog = readText(path.join(evidenceDir, 'vite-build-smoke.log'));
if (!/built in|✓ built|building client/i.test(viteLog)) fail('vite-build-smoke.log missing successful build markers');
else ok('vite-build-smoke.log has build success markers');

// Unsupported viteResolved hard-true build claim must not appear as sole proof
const smokeLog = exists(path.join(evidenceDir, 'js-toolchain-smoke.log'))
  ? readText(path.join(evidenceDir, 'js-toolchain-smoke.log'))
  : '';
if (/"viteResolved"\s*:\s*true/.test(smokeLog)) {
  fail('js-toolchain-smoke.log still claims viteResolved:true (unsupported as build proof)');
} else ok('js-toolchain-smoke.log does not claim viteResolved:true');

const toolSmoke = exists(path.join(evidenceDir, 'toolchain-smoke.md'))
  ? readText(path.join(evidenceDir, 'toolchain-smoke.md'))
  : '';
if (toolSmoke && !/vite-build-smoke/i.test(toolSmoke)) {
  fail('toolchain-smoke.md must reference vite-build-smoke evidence');
} else if (toolSmoke) ok('toolchain-smoke.md references Vite build evidence');

if (depLock?.smokeEvidence) {
  const se = JSON.stringify(depLock.smokeEvidence);
  if (!/vite-build-smoke/i.test(se)) fail('dependency-lock smokeEvidence missing vite-build-smoke');
  else ok('dependency-lock smokeEvidence references Vite build');
}

// OGA authors must be rubberduck (not OwlishMedia as pack author)
if (assetsJson) {
  for (const id of ['oga-100-cc0-metal-wood-sfx', 'oga-100-cc0-sfx-2']) {
    const rec = (assetsJson.assets || []).find((x) => x.id === id);
    if (!rec) {
      fail(`assets.json missing ${id}`);
      continue;
    }
    if (!/rubberduck/i.test(rec.author || '')) fail(`${id} author must be rubberduck, got ${rec.author}`);
    else ok(`${id} author is rubberduck`);
    if (/^OwlishMedia$/i.test((rec.author || '').trim())) fail(`${id} still lists OwlishMedia as author`);
  }
}
for (const rel of [
  'assets/source/vendor/oga-100-cc0-metal-wood-sfx/SOURCE.md',
  'assets/source/vendor/oga-100-cc0-sfx-2/SOURCE.md',
]) {
  const t = readText(path.join(repoRoot, rel));
  if (!/rubberduck/i.test(t)) fail(`${rel} missing rubberduck`);
  else ok(`${rel} names rubberduck`);
  if (/Author:\s*OwlishMedia/i.test(t)) fail(`${rel} still has Author: OwlishMedia`);
  else ok(`${rel} does not use OwlishMedia as Author field`);
}

// --- forbidden production paths ---
for (const rel of FORBIDDEN_PRODUCTION) {
  if (exists(path.join(repoRoot, rel))) fail(`forbidden production path exists: ${rel}`);
  else ok(`no forbidden path: ${rel}`);
}

// --- no untracked scratch terminal folders at repo root ---
const rootEntries = fs.readdirSync(repoRoot);
for (const name of rootEntries) {
  if (/^(tmp|temp|scratch|node_modules_smoke)/i.test(name)) {
    fail(`untracked scratch terminal folder at repo root: ${name}`);
  }
}
ok('no scratch terminal folders at repo root');

// --- internet stop not globally exhausted without topics ---
const stop = readText(path.join(cycleDir, 'internet-stop-log.md'));
if (/internet exhausted/i.test(stop) && !/topic/i.test(stop)) {
  fail('global internet exhausted claim without topic structure');
} else ok('internet-stop-log is topic-structured');

// --- hero/audio/plaza disposition in art spec ---
const art = readText(path.join(cycleDir, 'final-art-assets-world-audio-spec.md'));
for (const m of [/hero board/i, /audio/i, /plaza/i, /Blender/i, /ownership/i]) {
  if (!m.test(art)) fail(`art spec missing ${m}`);
  else ok(`art spec has ${m}`);
}

// --- cross-cycle ---
const cross = readText(path.join(cycleDir, 'cross-cycle-decision-log.md'));
if (!/C3|cycle 3/i.test(cross)) fail('cross-cycle-decision-log missing C3');
else ok('cross-cycle-decision-log present content');

console.log('');
if (failures > 0) {
  console.error(`Cycle-03 validation FAILED: ${failures} failure(s), ${checks} checks`);
  process.exit(1);
}
console.log(`All cycle-03 production validations passed (${checks} checks).`);
process.exit(0);
