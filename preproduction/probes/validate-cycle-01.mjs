/**
 * Cycle-01 foundation validator for SlackPad 360.
 * Reads real files on disk — no hard-coded pass without checks.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..', '..');
const cycleDir = path.join(repoRoot, 'preproduction', 'cycles', '01-foundation');
const assetsDir = path.join(repoRoot, 'assets');
const catalogDir = path.join(assetsDir, 'catalog');
const runtimeDir = path.join(assetsDir, 'runtime');

const REQUIRED_CYCLE_FILES = [
  'README.md',
  'product-vision.md',
  'game-design-spec.md',
  'input-and-trick-spec.md',
  'physics-and-camera-spec.md',
  'technical-architecture.md',
  'art-direction.md',
  'world-ui-audio-spec.md',
  'asset-acquisition-and-pipeline.md',
  'reuse-and-dependency-audit.md',
  'observability-and-verification.md',
  'risk-register.md',
  'decisions.json',
  'sources.json',
  'open-questions.md',
  'review-checklist.md',
];

const ASSET_RECORD_FIELDS = [
  'id',
  'description',
  'sourceUrl',
  'author',
  'license',
  'retrievalDate',
  'originalFilename',
  'checksum',
  'allowedUses',
  'attributionRequirement',
  'modificationStatus',
  'runtimeIntent',
  'reviewStatus',
];

const DECISION_THEMES = [
  'product',
  'input',
  'physics',
  'camera',
  'runtime',
  'art',
  'world',
  'verification',
  'reuse',
];

/** Paths that would indicate production game implementation started early. */
const FORBIDDEN_PRODUCTION_GLOBS = [
  'src/game',
  'src/main.ts',
  'game/src',
  'app/src',
  'host/bin',
  'packages/game/src',
];

const SPEC_MARKERS = {
  'input-and-trick-spec.md': [
    /ContactFrame/i,
    /kickflip/i,
    /heelflip/i,
    /heelside/i,
    /toeside/i,
    /50-50|50\s*\/\s*50/i,
    /planted/i,
  ],
  'physics-and-camera-spec.md': [
    /Rapier/i,
    /hybrid/i,
    /three-quarter|chase/i,
    /grind/i,
    /catch/i,
  ],
  'technical-architecture.md': [
    /WebView2/i,
    /ContactFrame/i,
    /Raw Input|RawInput/i,
    /GetPointerFrameTouchpadInfo|RegisterTouchpadCapable/i,
  ],
  'reuse-and-dependency-audit.md': [
    /RawInput\.Touchpad|emoacht/i,
    /adopt|study|reject/i,
    /three-mesh-bvh/i,
    /fast-check/i,
    /Spector/i,
  ],
  'observability-and-verification.md': [
    /G1|determinism|golden/i,
    /agent/i,
    /playtest/i,
  ],
  'product-vision.md': [
    /PQ-|measurable|non-goal/i,
    /assist/i,
  ],
};

let failures = 0;

function fail(msg) {
  console.error('FAIL:', msg);
  failures += 1;
}

function ok(msg) {
  console.log('OK:', msg);
}

function exists(p) {
  return fs.existsSync(p);
}

function read(p) {
  return fs.readFileSync(p, 'utf8');
}

function readJson(p) {
  return JSON.parse(read(p));
}

function nonEmptyLines(text) {
  return text.split(/\r?\n/).filter((l) => l.trim().length > 0).length;
}

console.log('Repo root:', repoRoot);
console.log('Cycle dir:', cycleDir);

// 1) Required cycle files
if (!exists(cycleDir)) {
  fail('missing preproduction/cycles/01-foundation/');
} else {
  ok('cycle directory exists');
  for (const name of REQUIRED_CYCLE_FILES) {
    const p = path.join(cycleDir, name);
    if (!exists(p)) {
      fail(`missing cycle file: ${name}`);
      continue;
    }
    const text = read(p);
    const n = nonEmptyLines(text);
    if (n < 20) fail(`${name} too short (${n} non-empty lines)`);
    else ok(`${name} present (${n} non-empty lines)`);
  }
}

// 2) Spec content markers
for (const [file, markers] of Object.entries(SPEC_MARKERS)) {
  const p = path.join(cycleDir, file);
  if (!exists(p)) continue;
  const text = read(p);
  for (const re of markers) {
    if (!re.test(text)) fail(`${file} missing marker ${re}`);
    else ok(`${file} marker ${re}`);
  }
}

// 3) decisions.json shape + theme coverage
{
  const p = path.join(cycleDir, 'decisions.json');
  if (exists(p)) {
    let data;
    try {
      data = readJson(p);
      ok('decisions.json parses');
    } catch (e) {
      fail(`decisions.json parse error: ${e.message}`);
      data = null;
    }
    if (data) {
      if (!Array.isArray(data.decisions) || data.decisions.length < 8) {
        fail(`decisions.json expected >=8 decisions, got ${data.decisions?.length}`);
      } else {
        ok(`decisions.json has ${data.decisions.length} decisions`);
      }
      const themes = new Set();
      for (const d of data.decisions || []) {
        for (const f of ['id', 'title', 'decision', 'status']) {
          if (d[f] == null || d[f] === '') fail(`decision missing ${f}: ${d.id || '?'}`);
        }
        if (!Array.isArray(d.evidence)) fail(`decision ${d.id} missing evidence array`);
        if (!Array.isArray(d.alternatives)) fail(`decision ${d.id} missing alternatives array`);
        if (d.theme) themes.add(String(d.theme).toLowerCase());
        // also infer from id
        const id = String(d.id || '').toUpperCase();
        if (id.includes('PRODUCT') || id.includes('PHYSICS-QUALITY')) themes.add('product');
        if (id.includes('INPUT') || id.includes('TRICK') || id.includes('CONTACT')) themes.add('input');
        if (id.includes('PHYSICS') && !id.includes('QUALITY')) themes.add('physics');
        if (id.includes('CAMERA')) themes.add('camera');
        if (id.includes('RUNTIME') || id.includes('HOST')) themes.add('runtime');
        if (id.includes('ART') || id.includes('ASSET')) themes.add('art');
        if (id.includes('WORLD') || id.includes('UI') || id.includes('AUDIO')) themes.add('world');
        if (id.includes('VERIF') || id.includes('GATE') || id.includes('AGENT')) themes.add('verification');
        if (id.includes('REUSE') || id.includes('DEP')) themes.add('reuse');
      }
      for (const t of DECISION_THEMES) {
        if (!themes.has(t)) fail(`decision theme coverage missing: ${t}`);
        else ok(`decision theme covered: ${t}`);
      }
    }
  }
}

// 4) sources.json shape + URLs
{
  const p = path.join(cycleDir, 'sources.json');
  if (exists(p)) {
    let data;
    try {
      data = readJson(p);
      ok('sources.json parses');
    } catch (e) {
      fail(`sources.json parse error: ${e.message}`);
      data = null;
    }
    if (data) {
      if (!Array.isArray(data.sources) || data.sources.length < 10) {
        fail(`sources.json expected >=10 sources, got ${data.sources?.length}`);
      } else {
        ok(`sources.json has ${data.sources.length} sources`);
      }
      let urlCount = 0;
      for (const s of data.sources || []) {
        for (const f of ['id', 'title', 'url', 'accessedDate']) {
          if (s[f] == null || s[f] === '') fail(`source missing ${f}: ${s.id || '?'}`);
        }
        if (typeof s.url === 'string' && (s.url.startsWith('http') || s.url.startsWith('file://'))) {
          urlCount += 1;
        } else {
          fail(`source ${s.id} url not http(s) or file://`);
        }
        if (!s.license && !s.licenseNote) {
          // license field required by objective
          fail(`source ${s.id} missing license field`);
        }
      }
      if (urlCount < 10) fail(`sources with URLs: ${urlCount}`);
      else ok(`sources with URLs: ${urlCount}`);
    }
  }
}

// 5) assets catalog
{
  for (const name of ['assets.json', 'licenses.json', 'dependencies.json']) {
    const p = path.join(catalogDir, name);
    if (!exists(p)) {
      fail(`missing assets/catalog/${name}`);
      continue;
    }
    try {
      const data = readJson(p);
      ok(`assets/catalog/${name} parses`);
      if (name === 'assets.json') {
        if (!Array.isArray(data.assets)) fail('assets.json missing assets array');
        else {
          ok(`assets.json has ${data.assets.length} records`);
          for (const a of data.assets) {
            for (const f of ASSET_RECORD_FIELDS) {
              if (!(f in a)) fail(`asset ${a.id || '?'} missing field ${f}`);
            }
            if (a.runtimeIntent === 'shipping' && a.reviewStatus !== 'approved') {
              fail(`asset ${a.id} runtimeIntent shipping without approved review`);
            }
          }
        }
      }
      if (name === 'licenses.json') {
        if (!Array.isArray(data.licenses) || data.licenses.length < 1) {
          fail('licenses.json empty');
        } else ok(`licenses.json has ${data.licenses.length} licenses`);
      }
      if (name === 'dependencies.json') {
        if (!Array.isArray(data.dependencies) || data.dependencies.length < 5) {
          fail('dependencies.json expected multiple deps');
        } else {
          ok(`dependencies.json has ${data.dependencies.length} deps`);
          for (const d of data.dependencies) {
            for (const f of ['id', 'name', 'sourceUrl', 'license', 'decision', 'ownershipBoundary']) {
              if (d[f] == null || d[f] === '') fail(`dependency missing ${f}: ${d.id || '?'}`);
            }
          }
        }
      }
    } catch (e) {
      fail(`assets/catalog/${name} parse error: ${e.message}`);
    }
  }

  const assetsReadme = path.join(assetsDir, 'README.md');
  if (!exists(assetsReadme) || nonEmptyLines(read(assetsReadme)) < 15) {
    fail('assets/README.md missing or stub');
  } else ok('assets/README.md present');
}

// 6) assets/runtime must not contain unreviewed shipping candidates
{
  if (!exists(runtimeDir)) {
    // create not required; empty is fine
    ok('assets/runtime/ absent (treated as empty)');
  } else {
    const entries = fs.readdirSync(runtimeDir).filter((n) => n !== '.gitkeep' && n !== '.DS_Store');
    if (entries.length === 0) {
      ok('assets/runtime/ has no candidate files');
    } else {
      // If files exist, they must be cataloged as approved shipping
      let assetsData = { assets: [] };
      const ap = path.join(catalogDir, 'assets.json');
      if (exists(ap)) {
        try {
          assetsData = readJson(ap);
        } catch {
          /* already failed above */
        }
      }
      for (const ent of entries) {
        const rel = `assets/runtime/${ent}`.replace(/\\/g, '/');
        const rec = (assetsData.assets || []).find(
          (a) => a.path && String(a.path).replace(/\\/g, '/').includes(ent),
        );
        if (!rec) {
          fail(`unreviewed runtime file without catalog entry: ${rel}`);
        } else if (rec.reviewStatus !== 'approved' || rec.runtimeIntent !== 'shipping') {
          fail(
            `runtime file not approved shipping: ${rel} (reviewStatus=${rec.reviewStatus}, runtimeIntent=${rec.runtimeIntent})`,
          );
        } else {
          ok(`runtime file approved: ${rel}`);
        }
      }
    }
  }
}

// 7) Forbidden production paths
{
  for (const rel of FORBIDDEN_PRODUCTION_GLOBS) {
    const p = path.join(repoRoot, ...rel.split('/'));
    if (exists(p)) {
      fail(`forbidden production path exists: ${rel}`);
    } else {
      ok(`no forbidden path: ${rel}`);
    }
  }
  // Ensure research still exists
  const researchReadme = path.join(repoRoot, 'research', 'README.md');
  if (!exists(researchReadme) || nonEmptyLines(read(researchReadme)) < 30) {
    fail('research/README.md missing or emptied');
  } else ok('research/README.md preserved substantive');
}

// 8) Cycle README markers
{
  const p = path.join(cycleDir, 'README.md');
  if (exists(p)) {
    const text = read(p);
    for (const re of [/committed recommendation/i, /unresolved gate/i, /ContactFrame/i, /WebView2/i]) {
      if (!re.test(text)) fail(`cycle README missing ${re}`);
      else ok(`cycle README marker ${re}`);
    }
  }
}

// 9) open-questions has accept/reject/fallback
{
  const p = path.join(cycleDir, 'open-questions.md');
  if (exists(p)) {
    const text = read(p);
    if (!/Accept/i.test(text) || !/Reject/i.test(text) || !/Fallback/i.test(text)) {
      fail('open-questions.md missing Accept/Reject/Fallback structure');
    } else ok('open-questions has Accept/Reject/Fallback');
  }
}

// Summary
console.log('');
if (failures > 0) {
  console.error(`Cycle-01 validation FAILED with ${failures} issue(s).`);
  process.exit(1);
}
console.log('All cycle-01 foundation validations passed.');
process.exit(0);
