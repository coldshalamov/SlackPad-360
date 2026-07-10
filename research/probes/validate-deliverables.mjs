/**
 * Structural validation for SlackPad 360 research deliverables.
 * Drives real files on disk — no hard-coded pass without reading them.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const researchDir = path.resolve(__dirname, '..');
const repoRoot = path.resolve(researchDir, '..');

const REQUIRED_MD = [
  'README.md',
  'input-feasibility.md',
  'control-grammar.md',
  'physics-and-game-feel.md',
  'camera-and-ergonomics.md',
  'agent-observability.md',
  'technology-and-assets.md',
  'risk-register.md',
  'prototype-roadmap.md',
];

const REQUIRED_JSON = ['sources.json', 'decisions.json'];

const README_MARKERS = [
  /conditionally feasible/i,
  /unproven assumptions/i,
  /minimum first hardware/i,
  /recommended camera/i,
  /initial trick vocabulary/i,
  /physics\s*\/\s*assistance|hybrid assisted physics/i,
  /go\s*\/\s*no-go|G1 Input/i,
];

const LABEL_RE = /confirmed fact|inference|recommendation|hypothesis|unresolved/i;
const URL_RE = /https?:\/\/[^\s)]+/g;

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

console.log('Research dir:', researchDir);

// 1) Required files exist and are non-stub
for (const name of REQUIRED_MD) {
  const p = path.join(researchDir, name);
  if (!fs.existsSync(p)) {
    fail(`missing ${name}`);
    continue;
  }
  const text = read(p);
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 30) {
    fail(`${name} too short (${lines.length} non-empty lines); likely stub`);
  } else {
    ok(`${name} substantive (${lines.length} non-empty lines)`);
  }
}

// 2) README committed conclusion markers
{
  const readme = read(path.join(researchDir, 'README.md'));
  for (const re of README_MARKERS) {
    if (!re.test(readme)) fail(`README.md missing conclusion marker: ${re}`);
    else ok(`README marker ${re}`);
  }
}

// 3) Claim labels + URLs in key docs
for (const name of ['input-feasibility.md', 'technology-and-assets.md', 'control-grammar.md']) {
  const text = read(path.join(researchDir, name));
  if (!LABEL_RE.test(text)) fail(`${name} missing claim labels`);
  else ok(`${name} has claim labels`);
  const urls = text.match(URL_RE) || [];
  if (urls.length < 3) fail(`${name} expected multiple primary URLs, found ${urls.length}`);
  else ok(`${name} has ${urls.length} URLs`);
}

// 3b) Win11 GetPointerTouchpadInfo must be documented (not falsely marked missing)
{
  const input = read(path.join(researchDir, 'input-feasibility.md'));
  if (!/GetPointerTouchpadInfo|GetPointerFrameTouchpadInfo/.test(input)) {
    fail('input-feasibility.md must document GetPointerTouchpadInfo APIs');
  } else {
    ok('input-feasibility documents GetPointerTouchpadInfo family');
  }
  if (!input.includes('https://learn.microsoft.com/en-us/windows/win32/input-precisiontouchpad/getpointertouchpadinfo')) {
    fail('input-feasibility.md missing GetPointerTouchpadInfo Learn URL');
  } else {
    ok('input-feasibility cites GetPointerTouchpadInfo Learn URL');
  }
  if (/GetPointerTouchpadInfo[\s\S]{0,200}404|not found as a public/i.test(input)) {
    fail('input-feasibility.md still claims GetPointerTouchpadInfo is missing/404');
  } else {
    ok('input-feasibility does not claim API 404');
  }
  const sources = JSON.parse(read(path.join(researchDir, 'sources.json')));
  const ids = new Set(sources.sources.map((s) => s.id));
  for (const id of [
    'ms-getpointertouchpadinfo',
    'ms-register-touchpad-capable',
    'ms-ptp-input-portal',
  ]) {
    if (!ids.has(id)) fail(`sources.json missing ${id}`);
    else ok(`sources.json has ${id}`);
  }
  const decisions = JSON.parse(read(path.join(researchDir, 'decisions.json')));
  const inputApi = decisions.decisions.find((d) => d.id === 'DEC-INPUT-API');
  if (!inputApi) fail('DEC-INPUT-API missing');
  else if (/not found in public docs/i.test(JSON.stringify(inputApi))) {
    fail('DEC-INPUT-API still claims API not in public docs');
  } else if (!/GetPointerFrameTouchpadInfo|GetPointerTouchpadInfo/.test(inputApi.decision)) {
    fail('DEC-INPUT-API must rank GetPointerTouchpadInfo path');
  } else {
    ok('DEC-INPUT-API ranks documented Win11 touchpad pointer APIs');
  }
}

// 4) Risk register structure
{
  const risk = read(path.join(researchDir, 'risk-register.md'));
  for (const field of ['Severity', 'Likelihood', 'Evidence', 'Mitigation', 'Validation']) {
    if (!risk.includes(field)) fail(`risk-register.md missing field ${field}`);
    else ok(`risk-register has ${field}`);
  }
}

// 5) Roadmap accept/abandon + P0 first
{
  const road = read(path.join(researchDir, 'prototype-roadmap.md'));
  if (!/P0/i.test(road)) fail('roadmap missing P0');
  else ok('roadmap has P0');
  if (!/Accept/i.test(road) || !/Abandon/i.test(road)) fail('roadmap missing Accept/Abandon');
  else ok('roadmap has Accept/Abandon');
  const p0Idx = road.search(/P0/i);
  const p3Idx = road.search(/P3/i);
  if (p0Idx < 0 || p3Idx < 0 || p0Idx > p3Idx) fail('P0 should appear before later physics prototypes');
  else ok('P0 ordered before P3');
}

// 6) JSON parse + required fields
for (const name of REQUIRED_JSON) {
  const p = path.join(researchDir, name);
  if (!fs.existsSync(p)) {
    fail(`missing ${name}`);
    continue;
  }
  let data;
  try {
    data = JSON.parse(read(p));
    ok(`${name} parses as JSON`);
  } catch (e) {
    fail(`${name} JSON parse error: ${e.message}`);
    continue;
  }
  if (name === 'sources.json') {
    if (!Array.isArray(data.sources) || data.sources.length < 10) {
      fail('sources.json needs sources[] with many entries');
    } else {
      ok(`sources.json has ${data.sources.length} sources`);
    }
    const sample = data.sources[0];
    for (const k of [
      'title',
      'url',
      'publisher',
      'accessedDate',
      'sourceType',
      'license',
      'reliability',
      'supportedClaims',
    ]) {
      if (!(k in sample)) fail(`sources entry missing ${k}`);
    }
    ok('sources entry shape ok');
  }
  if (name === 'decisions.json') {
    if (!Array.isArray(data.decisions) || data.decisions.length < 5) {
      fail('decisions.json needs decisions[]');
    } else {
      ok(`decisions.json has ${data.decisions.length} decisions`);
    }
    const sample = data.decisions[0];
    for (const k of [
      'id',
      'title',
      'decision',
      'evidence',
      'alternatives',
      'confidence',
      'unresolvedQuestions',
    ]) {
      if (!(k in sample)) fail(`decision missing ${k}`);
    }
    ok('decisions entry shape ok');
  }
}

// 7) ContactFrame schema exists and parses
{
  const schemaPath = path.join(researchDir, 'probes', 'contact-frame.schema.json');
  if (!fs.existsSync(schemaPath)) fail('missing contact-frame.schema.json');
  else {
    JSON.parse(read(schemaPath));
    ok('contact-frame.schema.json parses');
  }
}

// 8) No production game tree pollution (soft check)
{
  const banned = ['src/game', 'src/main.ts', 'public/game'];
  for (const b of banned) {
    if (fs.existsSync(path.join(repoRoot, b))) {
      fail(`unexpected production path present: ${b}`);
    }
  }
  ok('no banned production game paths detected');
  const rootReadme = read(path.join(repoRoot, 'README.md'));
  if (!/SlackPad 360/i.test(rootReadme) || !/Three\.js/i.test(rootReadme)) {
    fail('root README appears gutted');
  } else {
    ok('root README preserved');
  }
}

// 9) Validate a synthetic ContactFrame against schema required keys (shipped schema driven)
{
  const schema = JSON.parse(
    read(path.join(researchDir, 'probes', 'contact-frame.schema.json')),
  );
  const frame = {
    schemaVersion: 1,
    frameId: 0,
    tPerfMs: 1.5,
    tScanUs: 100,
    source: 'synthetic',
    contacts: [
      { id: 1, tip: true, x: 0.3, y: 0.4, confidence: true, pressure: null, width: null, height: null },
      { id: 2, tip: true, x: 0.6, y: 0.5, confidence: true, pressure: null, width: null, height: null },
    ],
    buttons: { primary: false, secondary: false, auxiliary: false },
    meta: { contactCountRaw: 2 },
  };
  for (const k of schema.required) {
    if (!(k in frame)) fail(`synthetic frame missing required ${k}`);
  }
  if (frame.schemaVersion !== schema.properties.schemaVersion.const) {
    fail('schemaVersion mismatch');
  }
  ok('synthetic ContactFrame satisfies schema required keys and version');
}

if (process.exitCode) {
  console.error('\nValidation finished with failures.');
  process.exit(process.exitCode);
}
console.log('\nAll structural validations passed.');
