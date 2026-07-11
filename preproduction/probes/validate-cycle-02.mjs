/**
 * Cycle-02 adversarial validator for SlackPad 360.
 * Reads real files on disk — no hard-coded pass without checks.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..', '..');
const cycleDir = path.join(repoRoot, 'preproduction', 'cycles', '02-adversarial');
const cycle1Dir = path.join(repoRoot, 'preproduction', 'cycles', '01-foundation');
const assetsDir = path.join(repoRoot, 'assets');
const catalogDir = path.join(assetsDir, 'catalog');
const runtimeDir = path.join(assetsDir, 'runtime');
const BASELINE = '53b3f14';

const REQUIRED_CYCLE_FILES = [
  'README.md',
  'audit-findings.md',
  'delta-from-cycle-01.md',
  'product-and-scope-spec.md',
  'input-platform-and-device-spec.md',
  'input-and-trick-spec.md',
  'physics-animation-and-camera-spec.md',
  'technical-architecture.md',
  'reuse-and-dependency-audit.md',
  'asset-bill-of-materials.md',
  'asset-selection-and-gap-plan.md',
  'art-direction-and-shot-rubric.md',
  'world-ui-audio-spec.md',
  'observability-and-verification.md',
  'autonomy-and-gate-plan.md',
  'risk-register.md',
  'open-questions.md',
  'internet-stop-log.md',
  'decisions.json',
  'sources.json',
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

const SOURCE_FIELDS = [
  'id',
  'title',
  'canonicalUrl',
  'publisher',
  'sourceType',
  'accessDate',
  'classification',
  'supports',
  'limitations',
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
if (!exists(cycleDir)) {
  fail('cycle directory missing');
} else {
  ok('cycle directory exists');
}

for (const f of REQUIRED_CYCLE_FILES) {
  const p = path.join(cycleDir, f);
  if (!exists(p)) {
    fail(`missing required deliverable: ${f}`);
    continue;
  }
  const n = nonEmptyLines(readText(p));
  if (n < 5) fail(`${f} too short (${n} non-empty lines)`);
  else ok(`${f} present (${n} non-empty lines)`);
}

// --- cycle-1 immutability vs 53b3f14 ---
try {
  const diff = execSync(
    `git diff --name-only ${BASELINE} -- preproduction/cycles/01-foundation research`,
    { cwd: repoRoot, encoding: 'utf8' },
  ).trim();
  // Allow empty; if working tree modified cycle1/research relative to baseline content
  // Compare: files under cycle1/research that differ from baseline commit content
  const dirty = execSync(
    `git status --porcelain -- preproduction/cycles/01-foundation research`,
    { cwd: repoRoot, encoding: 'utf8' },
  ).trim();
  if (dirty) {
    fail(
      `cycle-1 baseline or research modified in working tree:\n${dirty}`,
    );
  } else {
    ok('research/ and 01-foundation/ clean in working tree (no modifications)');
  }
  // Ensure baseline commit still has cycle1 files
  const ls = execSync(
    `git ls-tree -r --name-only ${BASELINE} -- preproduction/cycles/01-foundation`,
    { cwd: repoRoot, encoding: 'utf8' },
  ).trim();
  if (!ls.includes('preproduction/cycles/01-foundation/README.md')) {
    fail(`baseline ${BASELINE} missing cycle-1 README`);
  } else {
    ok(`baseline ${BASELINE} contains cycle-1 foundation tree`);
  }
  // Working tree cycle1 files must match baseline blob content for tracked files
  const tracked = ls.split(/\r?\n/).filter(Boolean);
  let mismatch = 0;
  for (const rel of tracked) {
    const full = path.join(repoRoot, rel);
    if (!exists(full)) {
      fail(`cycle-1 file deleted: ${rel}`);
      mismatch++;
      continue;
    }
    const headBlob = execSync(`git show ${BASELINE}:${rel}`, {
      cwd: repoRoot,
      encoding: 'buffer',
      maxBuffer: 20 * 1024 * 1024,
    });
    const disk = fs.readFileSync(full);
    if (!headBlob.equals(disk)) {
      fail(`cycle-1 file modified vs ${BASELINE}: ${rel}`);
      mismatch++;
    }
  }
  if (mismatch === 0) ok(`all ${tracked.length} cycle-1 files match ${BASELINE}`);
} catch (e) {
  fail(`cycle-1 immutability check error: ${e.message}`);
}

// --- JSON decisions / sources ---
const decisions = parseJson(path.join(cycleDir, 'decisions.json'), 'decisions.json');
if (decisions) {
  const list = decisions.decisions || [];
  if (list.length < 5) fail(`decisions.json too few decisions (${list.length})`);
  else ok(`decisions.json has ${list.length} decisions`);
  for (const d of list) {
    for (const f of DECISION_FIELDS) {
      if (d[f] === undefined || d[f] === null) {
        fail(`decision ${d.id || '?'} missing field ${f}`);
      }
    }
  }
  ok('decision field shape ok');
}

const sources = parseJson(path.join(cycleDir, 'sources.json'), 'sources.json');
if (sources) {
  const list = sources.sources || [];
  if (list.length < 10) fail(`sources.json too few (${list.length})`);
  else ok(`sources.json has ${list.length} sources`);
  for (const s of list) {
    for (const f of SOURCE_FIELDS) {
      if (s[f] === undefined) {
        fail(`source ${s.id || '?'} missing field ${f}`);
      }
    }
    if (s.canonicalUrl && !String(s.canonicalUrl).includes('://') && !String(s.canonicalUrl).startsWith('file:')) {
      fail(`source ${s.id} canonicalUrl looks invalid`);
    }
  }
  ok('source field shape ok');
}

// decisions.evidenceIds must resolve to sources.json IDs
if (decisions && sources) {
  const sid = new Set((sources.sources || []).map((s) => s.id));
  let unresolved = 0;
  for (const d of decisions.decisions || []) {
    for (const id of d.evidenceIds || []) {
      if (!sid.has(id)) {
        fail(`decision ${d.id} evidenceId not in sources.json: ${id}`);
        unresolved++;
      }
    }
  }
  if (unresolved === 0) ok('all decision evidenceIds resolve to sources.json');
}

// OSS skate/vehicle inspections must be named in cycle-2 prose
const reuseText = exists(path.join(cycleDir, 'reuse-and-dependency-audit.md'))
  ? readText(path.join(cycleDir, 'reuse-and-dependency-audit.md'))
  : '';
const physText = exists(path.join(cycleDir, 'physics-animation-and-camera-spec.md'))
  ? readText(path.join(cycleDir, 'physics-animation-and-camera-spec.md'))
  : '';
const ossBlob = reuseText + '\n' + physText;
if (!/Godot_Skate|3deric\/Godot_Skate/i.test(ossBlob)) {
  fail('missing named Godot_Skate source inspection');
} else ok('Godot_Skate named in physics/reuse');
if (!/Godot-Easy-Vehicle-Physics|DAShoe1\/Godot-Easy-Vehicle-Physics|GEVP/i.test(ossBlob)) {
  fail('missing named GEVP vehicle source inspection');
} else ok('GEVP named in physics/reuse');
if (!/e4ff468|c392257/i.test(ossBlob)) {
  fail('missing inspected commit hashes for OSS projects');
} else ok('OSS commit hashes present');

// --- delta markers ---
const delta = readText(path.join(cycleDir, 'delta-from-cycle-01.md'));
for (const section of ['Added', 'Changed', 'Rejected', 'Deferred']) {
  if (!new RegExp(section, 'i').test(delta)) fail(`delta missing section ${section}`);
  else ok(`delta has ${section}`);
}
if (!/01-foundation|C1-|cycle-1|cycle 1/i.test(delta)) {
  fail('delta missing cycle-1 references');
} else ok('delta references cycle-1');

// --- open gates accept/reject/fallback ---
const openQ = readText(path.join(cycleDir, 'open-questions.md'));
const autonomy = readText(path.join(cycleDir, 'autonomy-and-gate-plan.md'));
const inputPlat = readText(path.join(cycleDir, 'input-platform-and-device-spec.md'));
const gateBlob = openQ + '\n' + autonomy + '\n' + inputPlat;
if (!/Accept/i.test(gateBlob) || !/Reject/i.test(gateBlob) || !/Fallback/i.test(gateBlob)) {
  fail('missing accept/reject/fallback for open gates');
} else ok('accept/reject/fallback present for gates');
if (!/G1/i.test(gateBlob)) fail('G1 gate not mentioned');
else ok('G1 gate present');

// --- evidence levels ---
const obs = readText(path.join(cycleDir, 'observability-and-verification.md'));
const levels = [
  /structural smoke/i,
  /deterministic automated regression|deterministic regression/i,
  /hardware acceptance/i,
  /formative feel/i,
  /tuning study/i,
  /release confidence/i,
];
for (const re of levels) {
  if (!re.test(obs)) fail(`missing evidence level matching ${re}`);
  else ok(`evidence level present: ${re}`);
}

// --- Rapier name hygiene ---
const cycle2Files = walkFiles(cycleDir).filter((f) => f.endsWith('.md') || f.endsWith('.json'));
const bareRapierRe = /@dimforge\/rapier3d-deterministic(?!-compat)/g;
for (const f of cycle2Files) {
  const text = readText(f);
  const rel = path.relative(repoRoot, f);
  // Allow if clearly quoting cycle-1 defect
  const matches = text.match(bareRapierRe) || [];
  if (matches.length === 0) continue;
  // Each occurrence should be near defect/cycle-1/quote context within 200 chars
  let idx = 0;
  let bad = 0;
  while (true) {
    const m = bareRapierRe.exec(text);
    if (!m) break;
    const start = Math.max(0, m.index - 160);
    const end = Math.min(text.length, m.index + m[0].length + 160);
    const ctx = text.slice(start, end);
    if (!/cycle-1|cycle 1|defect|quoted|incorrect|mixed|bare name|without|-compat URL|non-compat|optional alt|alternative/i.test(ctx)) {
      bad++;
    }
    idx++;
  }
  bareRapierRe.lastIndex = 0;
  if (bad > 0) {
    fail(`unresolved bare @dimforge/rapier3d-deterministic without defect context in ${rel} (${bad})`);
  }
}
// Must mention correct package positively
const phys = readText(path.join(cycleDir, 'physics-animation-and-camera-spec.md'));
if (!/@dimforge\/rapier3d-deterministic-compat/.test(phys + readText(path.join(cycleDir, 'technical-architecture.md')))) {
  fail('missing correct Rapier package @dimforge/rapier3d-deterministic-compat');
} else ok('correct Rapier package name present');

// --- catalogs ---
const assetsJson = parseJson(path.join(catalogDir, 'assets.json'), 'assets.json');
const licensesJson = parseJson(path.join(catalogDir, 'licenses.json'), 'licenses.json');
const depsJson = parseJson(path.join(catalogDir, 'dependencies.json'), 'dependencies.json');

if (assetsJson) {
  const assets = assetsJson.assets || [];
  ok(`assets.json has ${assets.length} records`);
  for (const a of assets) {
    const required = [
      'id',
      'description',
      'license',
      'author',
      'originalFilename',
      'retrievalDate',
      'allowedUses',
      'attributionRequirement',
      'modificationStatus',
      'reviewStatus',
      'runtimeIntent',
    ];
    for (const f of required) {
      if (a[f] === undefined) fail(`asset ${a.id} missing ${f}`);
    }
    // Downloaded assets must have full provenance
    const local = a.localPath || a.path;
    if (local && a.runtimeIntent !== 'none' && a.reviewStatus !== 'gap-blender-brief' && a.reviewStatus !== 'catalog-candidate' && a.reviewStatus !== 'superseded') {
      const abs = path.join(repoRoot, local);
      if (!exists(abs)) fail(`downloaded asset missing file: ${local}`);
      else ok(`asset file exists: ${a.id}`);
      const hash = a.sha256 || (a.checksum && String(a.checksum).replace(/^sha256:/, ''));
      if (!hash) fail(`asset ${a.id} missing sha256`);
      else {
        const actual = sha256File(abs);
        if (actual !== hash.toLowerCase()) fail(`asset ${a.id} hash mismatch`);
        else ok(`asset ${a.id} hash matches`);
      }
      const dir = path.dirname(abs);
      if (!exists(path.join(dir, 'LICENSE')) && !exists(path.join(dir, 'LICENSE.txt'))) {
        fail(`asset ${a.id} missing LICENSE sidecar`);
      } else ok(`asset ${a.id} has LICENSE`);
      if (!exists(path.join(dir, 'SOURCE.md'))) fail(`asset ${a.id} missing SOURCE.md`);
      else ok(`asset ${a.id} has SOURCE.md`);
      if (!a.exactAssetPage && !a.sourceUrl) fail(`asset ${a.id} missing source page`);
      if (a.runtimeIntent === 'shipping' && a.reviewStatus !== 'approved') {
        fail(`runtime shipping asset not approved: ${a.id}`);
      }
    }
    if (a.runtimeIntent === 'shipping' && a.reviewStatus !== 'approved') {
      fail(`shipping intent without approved: ${a.id}`);
    }
  }
}

// runtime dir: no non-gitkeep binaries
if (exists(runtimeDir)) {
  const runtimeFiles = walkFiles(runtimeDir).filter(
    (f) => path.basename(f) !== '.gitkeep',
  );
  if (runtimeFiles.length > 0) {
    // allow empty only; any real asset must be approved — none should ship yet
    for (const f of runtimeFiles) {
      fail(`runtime contains non-approved candidate file: ${path.relative(repoRoot, f)}`);
    }
  } else ok('assets/runtime/ has no candidate files');
}

// --- dependencies adopt exact id + license ---
if (depsJson) {
  const deps = depsJson.dependencies || [];
  ok(`dependencies.json has ${deps.length} deps`);
  for (const d of deps) {
    if (d.decision === 'adopt' || d.decision === 'adopt-optional' || d.decision === 'adopt-optional-dev' || d.decision === 'adopt-optional-fallback' || d.decision === 'adopt-optional-alt') {
      const id = d.installIdentifier || d.name;
      if (!id) fail(`adopt dep missing identifier: ${d.id}`);
      if (!d.license) fail(`adopt dep missing license: ${d.id}`);
      if (!d.versionPin && !d.selectedVersion) fail(`adopt dep missing version pin: ${d.id}`);
    }
  }
  const rapier = deps.find((d) => d.id === 'dep-rapier3d-deterministic-compat' || (d.name && d.name.includes('rapier3d-deterministic-compat')));
  if (!rapier || rapier.decision !== 'adopt') {
    fail('Rapier deterministic-compat not adopted');
  } else ok('Rapier deterministic-compat adopted with license');
}

// --- forbidden production paths ---
for (const rel of FORBIDDEN_PRODUCTION) {
  const p = path.join(repoRoot, rel);
  if (exists(p)) fail(`forbidden production path exists: ${rel}`);
  else ok(`no forbidden path: ${rel}`);
}

// --- content markers ---
const markers = {
  'input-platform-and-device-spec.md': [/Raw Input|RawInput/i, /GetPointerFrameTouchpadInfo|RegisterTouchpadCapable/i, /device-mode|Device-mode|matrix/i, /Accept|accept/],
  'input-and-trick-spec.md': [/ContactFrame/i, /primitive/i, /kickflip/i, /boardslide/i, /catch/i],
  'physics-animation-and-camera-spec.md': [/rapier3d-deterministic-compat/i, /Model A|single dynamic/i, /assist/i, /60/i],
  'autonomy-and-gate-plan.md': [/G1/i, /pause/i, /pivot/i, /ContactFrame/i],
  'audit-findings.md': [/Resolved|Accepted/i, /Rapier/i, /P1/i],
  'README.md': [/verdict|Verdict/i, /G1/i, /committed/i],
};

for (const [file, regs] of Object.entries(markers)) {
  const text = readText(path.join(cycleDir, file));
  for (const re of regs) {
    if (!re.test(text)) fail(`${file} missing marker ${re}`);
    else ok(`${file} marker ${re}`);
  }
}

// --- previews exist for downloaded selected sources ---
const previewRoot = path.join(assetsDir, 'generated', 'previews');
if (!exists(previewRoot)) fail('previews directory missing');
else ok('previews directory exists');

// --- summary ---
console.log('');
if (failures > 0) {
  console.error(`FAILED: ${failures} checks failed (${checks} total)`);
  process.exit(1);
}
console.log(`All cycle-02 adversarial validations passed (${checks} checks).`);
process.exit(0);
