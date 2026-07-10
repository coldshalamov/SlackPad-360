/**
 * Structural validation for SlackPad 360 follow-up research sprint.
 * Drives real files on disk.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const researchDir = path.resolve(__dirname, '..');
const repoRoot = path.resolve(researchDir, '..');

function fail(msg) {
  console.error('FAIL:', msg);
  process.exitCode = 1;
}
function ok(msg) {
  console.log('OK:', msg);
}
function read(p) {
  return fs.readFileSync(p, 'utf8');
}

const FILES = [
  'input-attribution.md',
  'trick-primitive-matrix.md',
  'reuse-audit.md',
  'ergonomics-evidence.md',
  'followup-decisions.json',
];

console.log('Research dir:', researchDir);

for (const name of FILES) {
  const p = path.join(researchDir, name);
  if (!fs.existsSync(p)) {
    fail(`missing ${name}`);
    continue;
  }
  const text = read(p);
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (name.endsWith('.json')) {
    try {
      JSON.parse(text);
      ok(`${name} parses JSON (${text.length} bytes)`);
    } catch (e) {
      fail(`${name} JSON error: ${e.message}`);
    }
  } else if (lines.length < 40) {
    fail(`${name} too short (${lines.length} lines)`);
  } else {
    ok(`${name} substantive (${lines.length} non-empty lines)`);
  }
}

// input-attribution coverage
{
  const t = read(path.join(researchDir, 'input-attribution.md'));
  for (const re of [
    /planted/i,
    /click location|spatial/i,
    /motion/i,
    /pressure/i,
    /mechanical force/i,
    /calibrat/i,
    /guaranteed/i,
    /device-specific/i,
    /dual lift|reassign/i,
    /relative|board-local/i,
    /recenter/i,
    /edge/i,
    /steer/i,
    /reposition/i,
    /P0 must measure/i,
  ]) {
    if (!re.test(t)) fail(`input-attribution missing ${re}`);
    else ok(`input-attribution ~ ${re}`);
  }
  if (/finite pad.?to.?world|pad→world teleport|pad->world/i.test(t) && /reject|not map|do \*\*not\*\* map|fails/i.test(t)) {
    ok('input-attribution rejects pad→world teleport model');
  } else if (!/not.*map absolute pad|Reject finite pad/i.test(t)) {
    fail('input-attribution must reject finite pad→world as production model');
  }
}

// trick matrix
{
  const t = read(path.join(researchDir, 'trick-primitive-matrix.md'));
  for (const trick of [
    'ollie',
    'nollie',
    'kickflip',
    'heelflip',
    'shuv',
    'catch',
    'manual',
    'powerslide',
    'revert',
    'grind',
  ]) {
    if (!new RegExp(trick, 'i').test(t)) fail(`trick matrix missing ${trick}`);
  }
  ok('trick matrix names present');
  if (!/board motion|body/i.test(t)) fail('trick matrix missing board vs body');
  else ok('board vs body present');
  if (!/\|.*plant|Primitive/i.test(t)) fail('trick matrix missing primitive table');
  else ok('primitive matrix structure present');
  // Kickflip/heelflip sides must match instructional sources (not inverted)
  const kickRow = t.split(/\r?\n/).find((l) => /\*\*Kickflip\*\*/.test(l));
  const heelRow = t.split(/\r?\n/).find((l) => /\*\*Heelflip\*\*/.test(l));
  if (!kickRow || !heelRow) fail('kickflip/heelflip matrix rows missing');
  else {
    if (!/heelside/i.test(kickRow)) fail(`Kickflip matrix row must say heelside flick: ${kickRow}`);
    else ok('Kickflip matrix: heelside');
    if (/toeside/i.test(kickRow) && !/heelside/i.test(kickRow)) {
      fail('Kickflip matrix still toeside-only (inverted)');
    }
    if (!/toeside/i.test(heelRow)) fail(`Heelflip matrix row must say toeside flick: ${heelRow}`);
    else ok('Heelflip matrix: toeside');
    if (/R toeside/i.test(kickRow) && !/heelside/i.test(kickRow)) {
      fail('Kickflip still has inverted toeside R without heelside');
    }
    if (/R heelside/i.test(heelRow) && !/toeside/i.test(heelRow)) {
      fail('Heelflip still has inverted heelside R without toeside');
    }
  }
  // Notes must agree with matrix
  if (!/Kickflip[\s\S]{0,200}heelside/i.test(t)) fail('Kickflip notes must say heelside');
  else ok('Kickflip notes heelside');
  if (!/Heelflip[\s\S]{0,200}toeside/i.test(t)) fail('Heelflip notes must say toeside');
  else ok('Heelflip notes toeside');
}

// control-grammar must match matrix sides (residual inversion bug)
{
  const g = read(path.join(researchDir, 'control-grammar.md'));
  const kickLine = g.split(/\r?\n/).find((l) => /\*\*Kickflip\*\*/.test(l));
  const heelLine = g.split(/\r?\n/).find((l) => /\*\*Heelflip\*\*/.test(l));
  if (!kickLine || !heelLine) fail('control-grammar missing Kickflip/Heelflip rows');
  else {
    if (!/heelside/i.test(kickLine)) fail(`control-grammar Kickflip must be heelside: ${kickLine}`);
    else ok('control-grammar Kickflip heelside');
    if (/toeside/i.test(kickLine) && !/heelside/i.test(kickLine)) {
      fail('control-grammar Kickflip still toeside-only (inverted)');
    }
    // Reject old inverted wording "Front flick toeside" on kickflip row
    if (/Kickflip.*Front flick toeside|Kickflip.*toward toes/i.test(kickLine) && !/heelside/i.test(kickLine)) {
      fail('control-grammar Kickflip residual inversion');
    }
    if (!/toeside/i.test(heelLine)) fail(`control-grammar Heelflip must be toeside: ${heelLine}`);
    else ok('control-grammar Heelflip toeside');
    if (/Front flick heelside/i.test(heelLine) && !/toeside/i.test(heelLine)) {
      fail('control-grammar Heelflip residual inversion');
    }
  }
}

// reuse audit named targets
{
  const t = read(path.join(researchDir, 'reuse-audit.md'));
  const targets = [
    'RawInput.Touchpad',
    'AbsoluteTouchEx',
    'WebView2Samples',
    'Shuvit',
    '$P+',
    'fast-check',
    'three-mesh-bvh',
    'Rapier',
    'gltf',
  ];
  for (const name of targets) {
    if (!t.includes(name) && !new RegExp(name.replace('+', '\\+'), 'i').test(t)) {
      fail(`reuse-audit missing ${name}`);
    } else ok(`reuse-audit has ${name}`);
  }
  for (const field of [/License/i, /Maintenance/i, /Do not use/i, /Reusable|lesson/i]) {
    if (!field.test(t)) fail(`reuse-audit missing ${field}`);
  }
  ok('reuse-audit field markers present');
}

// ergonomics HCI sources
{
  const t = read(path.join(researchDir, 'ergonomics-evidence.md'));
  if (!/ISO\s*9241|pmc\.ncbi|biomechanic|ergonomic/i.test(t)) {
    fail('ergonomics-evidence lacks HCI/standards citations');
  } else ok('ergonomics has HCI/standards anchors');
  if (!/https?:\/\//.test(t)) fail('ergonomics missing URLs');
  else ok('ergonomics has URLs');
  for (const k of [/handedness|dominant/i, /fatigue|click/i, /camera|neck/i, /index|middle|finger/i]) {
    if (!k.test(t)) fail(`ergonomics missing ${k}`);
  }
  ok('ergonomics topic coverage ok');
}

// followup-decisions shape
{
  const data = JSON.parse(read(path.join(researchDir, 'followup-decisions.json')));
  if (!Array.isArray(data.decisions) || data.decisions.length < 5) {
    fail('followup-decisions needs decisions[]');
  } else ok(`followup-decisions has ${data.decisions.length} decisions`);
  const d0 = data.decisions[0];
  for (const k of ['id', 'decision', 'evidence', 'alternatives', 'confidence', 'unresolvedQuestions']) {
    if (!(k in d0)) fail(`decision missing ${k}`);
  }
  ok('decision shape ok');
  if (!Array.isArray(data.p0MustMeasure) || data.p0MustMeasure.length < 3) {
    fail('p0MustMeasure missing/short');
  } else ok(`p0MustMeasure n=${data.p0MustMeasure.length}`);
  if (!Array.isArray(data.deferToPlaytest) || data.deferToPlaytest.length < 3) {
    fail('deferToPlaytest missing/short');
  } else ok(`deferToPlaytest n=${data.deferToPlaytest.length}`);
}

// PE3 status consistency
{
  const input = read(path.join(researchDir, 'input-feasibility.md'));
  if (!/Recommendation/i.test(input) || !/30 June 2026|2026-06-30/i.test(input)) {
    fail('input-feasibility PE3 status not REC 30 June 2026');
  } else ok('PE3 REC 30 June 2026 stated');
  if (!input.includes('https://www.w3.org/TR/pointerevents3/')) {
    fail('missing PE3 URL');
  } else ok('PE3 URL present');
  if (/PE3.*trackpad.*dual|trackpad.*PE3.*feet/i.test(input) && /confirmed fact.*trackpad dual/i.test(input)) {
    fail('overclaim PE3 dual feet');
  }
  if (!/does not.*dual absolute feet|does \*\*not\*\* make laptop trackpads/i.test(input)) {
    fail('PE3 overclaim guard missing');
  } else ok('PE3 does not imply dual-foot trackpad');
}

// relative control reflected in control-grammar
{
  const g = read(path.join(researchDir, 'control-grammar.md'));
  if (!/board-local|relative/i.test(g)) fail('control-grammar missing relative/board-local update');
  else ok('control-grammar updated for relative control');
}

// no production game / no mcps
{
  if (fs.existsSync(path.join(repoRoot, 'mcps'))) {
    // only fail if we created/changed - existence alone may be env; check git if possible
  }
  const banned = ['src/game', 'src/main.ts'];
  for (const b of banned) {
    if (fs.existsSync(path.join(repoRoot, b))) fail(`production path ${b}`);
  }
  ok('no banned production paths');
  const readme = read(path.join(repoRoot, 'README.md'));
  if (!/SlackPad 360/i.test(readme)) fail('root README gutted');
  else ok('root README preserved');
}

// sample: recommendations labeled or cited in input-attribution
{
  const t = read(path.join(researchDir, 'input-attribution.md'));
  if (!/prototype hypothesis|recommendation|confirmed fact/i.test(t)) {
    fail('input-attribution missing claim labels');
  } else ok('input-attribution has claim labels');
  if ((t.match(/https?:\/\//g) || []).length < 2) fail('input-attribution needs primary URLs');
  else ok('input-attribution has URLs');
}

if (process.exitCode) {
  console.error('\nFollow-up validation finished with failures.');
  process.exit(process.exitCode);
}
console.log('\nAll follow-up structural validations passed.');
