/**
 * Sprint 02 S0 — feel report (reviews/03 §Stage 0.2).
 *
 * One entry point, `runFeelReport()`, executes the canonical scenario scripts
 * headlessly through AgentHarness/PadDriver and reduces them to the feel
 * metrics table. Output is strictly deterministic: no wall clock, no
 * Math.random, stable key order, fixed float formatting in SVG/markdown.
 *
 * Executed via `npm run feel:report` (scripts/run-feel-report.mjs spawns
 * vitest on test/feel/feel-report.test.ts with FEEL_REPORT_DIR set).
 */

import { DEFAULT_SIM_CONFIG } from '@slackpad/shared';
import { GAME_VERSION, RAPIER_VERSION } from '../src/agent/AgentHarness';
import {
  dualPlantHold,
  flickBattery,
  popBattery,
  steerCruiseTurn,
  steerPivot,
  steerRatchet,
  steerTurn,
} from '../test/feel/scenarios';
import { runNavProbes } from '../test/feel/probes';
import type { NavProbes, ProbeResult } from '../test/feel/probes';
import type {
  FlickRunResult,
  PopRunResult,
  SteerSample,
  SteerScenarioResult,
} from '../test/feel/scenarios';

const HZ = DEFAULT_SIM_CONFIG.physics.hz;
const DT_MS = 1000 / HZ;

/**
 * Canonical ollie pitch silhouette (nose-up deg over normalized maneuver
 * time), per reviews/03 §Stage 2: strike → sharp rise, hold, level by apex,
 * slightly nose-down into descent. S4 promotes this exact curve to config as
 * the `crisp` preset default; the report then reads the ACTIVE preset instead.
 * Keeping the S0 reference identical to the S4 default makes the
 * baseline→after RMS delta apples-to-apples.
 */
export const REFERENCE_PITCH_CURVE_CRISP: ReadonlyArray<readonly [number, number]> = [
  [0, 0],
  [0.1, 26],
  [0.3, 24],
  [0.55, 8],
  [0.8, 0],
  [1, -4],
];

export function sampleCurve(
  curve: ReadonlyArray<readonly [number, number]>,
  tNorm: number,
): number {
  const t = Math.max(0, Math.min(1, tNorm));
  let prev = curve[0]!;
  for (const point of curve) {
    if (t <= point[0]) {
      const [t0, v0] = prev;
      const [t1, v1] = point;
      if (t1 === t0) return v1;
      const f = (t - t0) / (t1 - t0);
      return v0 + f * (v1 - v0);
    }
    prev = point;
  }
  return curve[curve.length - 1]![1];
}

// ---------------------------------------------------------------------------
// Metric math
// ---------------------------------------------------------------------------

function diff(series: number[]): number[] {
  const out: number[] = [];
  for (let i = 1; i < series.length; i++) out.push(series[i]! - series[i - 1]!);
  return out;
}

function mean(xs: number[]): number {
  return xs.length === 0 ? 0 : xs.reduce((a, b) => a + b, 0) / xs.length;
}

function std(xs: number[]): number {
  if (xs.length === 0) return 0;
  const m = mean(xs);
  return Math.sqrt(mean(xs.map((x) => (x - m) * (x - m))));
}

export interface LagResult {
  lagMs: number;
  corr: number;
}

/**
 * steer.lagMs — offset of peak normalized cross-correlation between the
 * first-differences of commanded yaw and actual yaw. Positive lag means the
 * board trails the fingers. Returns null when either series is flat
 * (degenerate correlation — e.g. the board never moved).
 */
export function crossCorrLag(
  commanded: number[],
  actual: number[],
  maxLagSteps: number,
): LagResult | null {
  const di = diff(commanded);
  const da = diff(actual);
  if (std(di) < 1e-9 || std(da) < 1e-9) return null;
  let best: LagResult | null = null;
  for (let lag = 0; lag <= maxLagSteps; lag++) {
    const n = Math.min(di.length, da.length - lag);
    if (n < 8) break;
    const a = di.slice(0, n);
    const b = da.slice(lag, lag + n);
    const ma = mean(a);
    const mb = mean(b);
    let num = 0;
    let va = 0;
    let vb = 0;
    for (let i = 0; i < n; i++) {
      const xa = a[i]! - ma;
      const xb = b[i]! - mb;
      num += xa * xb;
      va += xa * xa;
      vb += xb * xb;
    }
    if (va < 1e-12 || vb < 1e-12) continue;
    const corr = num / Math.sqrt(va * vb);
    if (best == null || corr > best.corr) best = { lagMs: lag * DT_MS, corr };
  }
  return best;
}

/**
 * steer.trackErrDeg — max |commandedΔ − actualΔ| from rotation onset, both
 * series re-based at the onset sample.
 */
export function maxTrackingErrorDeg(samples: SteerSample[], fromIndex: number): number {
  const base = samples[fromIndex];
  if (!base) return 0;
  let worst = 0;
  for (let i = fromIndex; i < samples.length; i++) {
    const s = samples[i]!;
    const cmd = s.commandedYawDeg - base.commandedYawDeg;
    const act = s.yawDeg - base.yawDeg;
    worst = Math.max(worst, Math.abs(cmd - act));
  }
  return worst;
}

/** Yaw progress from rotation onset to the end of the scenario, deg. */
export function achievedYawDeg(samples: SteerSample[], fromIndex: number): number {
  const base = samples[fromIndex];
  const last = samples[samples.length - 1];
  if (!base || !last) return 0;
  return Math.abs(last.yawDeg - base.yawDeg);
}

/** RMS of measured nose-up pitch vs the reference curve over the maneuver. */
export function silhouetteRmsDeg(run: PopRunResult, noseUpSign: 1 | -1): number | null {
  if (run.resolveStep == null || run.resolveStep <= run.kickStep) return null;
  const span = run.resolveStep - run.kickStep;
  const errs: number[] = [];
  for (const s of run.pitchSamples) {
    if (s.step < run.kickStep || s.step > run.resolveStep) continue;
    const tNorm = (s.step - run.kickStep) / span;
    const ref = noseUpSign * sampleCurve(REFERENCE_PITCH_CURVE_CRISP, tNorm);
    errs.push(s.pitchDeg - ref);
  }
  if (errs.length === 0) return null;
  return Math.sqrt(mean(errs.map((e) => e * e)));
}

function median(xs: number[]): number | null {
  if (xs.length === 0) return null;
  const sorted = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

function max(xs: number[]): number | null {
  return xs.length === 0 ? null : xs.reduce((a, b) => Math.max(a, b), -Infinity);
}

function round(value: number | null, digits = 3): number | null {
  if (value == null || !Number.isFinite(value)) return value == null ? null : value;
  const f = 10 ** digits;
  return Math.round(value * f) / f;
}

// ---------------------------------------------------------------------------
// SVG plotting (hand-rolled polylines, no dependencies)
// ---------------------------------------------------------------------------

interface PlotSeries {
  label: string;
  color: string;
  points: Array<{ x: number; y: number }>;
}

function svgPlot(title: string, xLabel: string, yLabel: string, series: PlotSeries[]): string {
  const W = 860;
  const H = 320;
  const M = { left: 56, right: 12, top: 28, bottom: 36 };
  const xs = series.flatMap((s) => s.points.map((p) => p.x));
  const ys = series.flatMap((s) => s.points.map((p) => p.y));
  const xMin = Math.min(...xs, 0);
  const xMax = Math.max(...xs, 1);
  const yMin = Math.min(...ys, 0);
  const yMax = Math.max(...ys, 1);
  const xSpan = xMax - xMin || 1;
  const ySpan = yMax - yMin || 1;
  const px = (x: number): string => (M.left + ((x - xMin) / xSpan) * (W - M.left - M.right)).toFixed(2);
  const py = (y: number): string => (H - M.bottom - ((y - yMin) / ySpan) * (H - M.top - M.bottom)).toFixed(2);

  const lines: string[] = [];
  lines.push(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" font-family="monospace" font-size="12">`,
  );
  lines.push(`<rect x="0" y="0" width="${W}" height="${H}" fill="white"/>`);
  lines.push(`<text x="${M.left}" y="16" font-size="14">${title}</text>`);
  // Axes
  lines.push(
    `<line x1="${M.left}" y1="${H - M.bottom}" x2="${W - M.right}" y2="${H - M.bottom}" stroke="#555"/>`,
  );
  lines.push(`<line x1="${M.left}" y1="${M.top}" x2="${M.left}" y2="${H - M.bottom}" stroke="#555"/>`);
  // Zero line when the y-range crosses zero.
  if (yMin < 0 && yMax > 0) {
    lines.push(
      `<line x1="${M.left}" y1="${py(0)}" x2="${W - M.right}" y2="${py(0)}" stroke="#bbb" stroke-dasharray="4 4"/>`,
    );
  }
  lines.push(
    `<text x="${M.left}" y="${H - 8}">${xLabel}: ${xMin.toFixed(1)} … ${xMax.toFixed(1)}</text>`,
  );
  lines.push(
    `<text x="8" y="${M.top + 10}">${yLabel}: ${yMin.toFixed(1)} … ${yMax.toFixed(1)}</text>`,
  );
  series.forEach((s, i) => {
    const pts = s.points.map((p) => `${px(p.x)},${py(p.y)}`).join(' ');
    lines.push(`<polyline points="${pts}" fill="none" stroke="${s.color}" stroke-width="1.5"/>`);
    lines.push(
      `<text x="${W - M.right - 240}" y="${M.top + 14 * (i + 1)}" fill="${s.color}">${s.label}</text>`,
    );
  });
  lines.push('</svg>');
  return lines.join('\n');
}

function steerPlot(title: string, result: SteerScenarioResult): string {
  const t0 = result.samples[0]?.step ?? 0;
  return svgPlot(title, 't (ms)', 'deg', [
    {
      label: 'commanded yaw Δ (fingers)',
      color: '#1f77b4',
      points: result.samples.map((s) => ({
        x: (s.step - t0) * DT_MS,
        y: s.commandedYawDeg - result.samples[0]!.commandedYawDeg,
      })),
    },
    {
      label: 'actual yaw Δ (board)',
      color: '#d62728',
      points: result.samples.map((s) => ({ x: (s.step - t0) * DT_MS, y: s.yawDeg - result.samples[0]!.yawDeg })),
    },
  ]);
}

function pitchPlot(title: string, run: PopRunResult, noseUpSign: 1 | -1): string {
  const span = Math.max(1, (run.resolveStep ?? run.kickStep + 1) - run.kickStep);
  const measured = run.pitchSamples
    .filter((s) => s.step >= run.kickStep)
    .map((s) => ({ x: (s.step - run.kickStep) * DT_MS, y: s.pitchDeg }));
  const reference = run.pitchSamples
    .filter((s) => s.step >= run.kickStep && s.step <= run.kickStep + span)
    .map((s) => ({
      x: (s.step - run.kickStep) * DT_MS,
      y: noseUpSign * sampleCurve(REFERENCE_PITCH_CURVE_CRISP, (s.step - run.kickStep) / span),
    }));
  return svgPlot(title, 't since kick (ms)', 'nose-up pitch (deg)', [
    { label: 'measured pitch', color: '#d62728', points: measured },
    { label: 'reference silhouette (crisp)', color: '#1f77b4', points: reference },
  ]);
}

// ---------------------------------------------------------------------------
// Gates
// ---------------------------------------------------------------------------

export type GateGroup = 'steer' | 'pop' | 'nav';

export interface FeelGate {
  id: string;
  group: GateGroup;
  description: string;
  value: number | null;
  op: '<' | '<=' | '>=' | '==';
  threshold: number;
  pass: boolean;
  /** Sprint stage whose exit this gate belongs to. */
  stage: 'S2' | 'S4';
}

function gate(
  id: string,
  group: GateGroup,
  stage: 'S2' | 'S4',
  description: string,
  value: number | null,
  op: FeelGate['op'],
  threshold: number,
): FeelGate {
  let pass = false;
  if (value != null && Number.isFinite(value)) {
    if (op === '<') pass = value < threshold;
    else if (op === '<=') pass = value <= threshold;
    else if (op === '>=') pass = value >= threshold;
    else pass = value === threshold;
  }
  return { id, group, stage, description, value: round(value), op, threshold, pass };
}

// ---------------------------------------------------------------------------
// Report assembly
// ---------------------------------------------------------------------------

export interface FeelReportBundle {
  report: Record<string, unknown>;
  markdown: string;
  svgs: Record<string, string>;
}

function batteryRows(runs: PopRunResult[], noseUpSign: 1 | -1): Array<Record<string, unknown>> {
  return runs.map((r) => ({
    seed: r.seed,
    gapSteps: r.gapSteps,
    prepMoveFrames: r.prepMoveFrames,
    outcome: r.outcome,
    label: r.label,
    latencyMs: round(r.latencyMs, 2),
    heightM: round(r.heightM),
    airtimeSec: round(r.airtimeSec),
    silhouetteRmsDeg: round(silhouetteRmsDeg(r, noseUpSign)),
  }));
}

function outcomeCounts(runs: Array<{ outcome: string }>): Record<string, number> {
  const counts: Record<string, number> = { clean: 0, dirty: 0, bail: 0, none: 0 };
  for (const r of runs) counts[r.outcome] = (counts[r.outcome] ?? 0) + 1;
  return counts;
}

function probeRow(p: ProbeResult): Record<string, unknown> {
  return { success: p.success, timeSec: p.timeSec, ...p.detail };
}

function navMetrics(nav: NavProbes): Record<string, unknown> {
  return {
    rideStraight: probeRow(nav.rideStraight),
    slalom: probeRow(nav.slalom),
    pivot90: probeRow(nav.pivot90),
    ollieBattery: probeRow(nav.ollieBattery),
    popOverObstacle: probeRow(nav.popOverObstacle),
  };
}

export async function runFeelReport(): Promise<FeelReportBundle> {
  // --- Scenarios (fixed seeds; the numbers ARE the API — never reseed casually)
  const turnPlus = await steerTurn(1, 0x5702a);
  const turnMinus = await steerTurn(-1, 0x5702b);
  const pivot = await steerPivot(0x5702c);
  const ratchet = await steerRatchet(0x5702d);
  const hold = await dualPlantHold(0x5702e);
  const cruiseTurn = await steerCruiseTurn(0x5702f);
  const ollies = await popBattery('ollie', 20, 0x0111e);
  const nollies = await popBattery('nollie', 20, 0x0110e);
  const flicks = await flickBattery(10, 0xf11c0);
  const nav = await runNavProbes();

  // --- Steering metrics
  const lagPlus = crossCorrLag(
    turnPlus.samples.map((s) => s.commandedYawDeg),
    turnPlus.samples.map((s) => s.yawDeg),
    30,
  );
  const lagMinus = crossCorrLag(
    turnMinus.samples.map((s) => s.commandedYawDeg),
    turnMinus.samples.map((s) => s.yawDeg),
    30,
  );
  const lagValues = [lagPlus, lagMinus];
  const steerLagMs = lagValues.some((l) => l == null)
    ? null
    : max(lagValues.map((l) => l!.lagMs));
  const steerTrackErrDeg = max([
    maxTrackingErrorDeg(turnPlus.samples, turnPlus.rotationStartIndex),
    maxTrackingErrorDeg(turnMinus.samples, turnMinus.rotationStartIndex),
  ]);
  const pivotDeg = achievedYawDeg(pivot.samples, pivot.rotationStartIndex);
  const cruiseLag = crossCorrLag(
    cruiseTurn.samples.map((s) => s.commandedYawDeg),
    cruiseTurn.samples.map((s) => s.yawDeg),
    30,
  );

  // --- Pop metrics (ollie battery is the gated one; nollie mirrors)
  const ollieLatencies = ollies.map((r) => r.latencyMs).filter((v): v is number => v != null);
  const ollieRms = ollies
    .map((r) => silhouetteRmsDeg(r, 1))
    .filter((v): v is number => v != null);
  const ollieCounts = outcomeCounts(ollies);
  const nollieCounts = outcomeCounts(nollies);
  const nollieLatencies = nollies.map((r) => r.latencyMs).filter((v): v is number => v != null);
  const cleanRate = ollieCounts.clean! / Math.max(1, ollies.length);
  const popLatencyMs = ollieLatencies.length === ollies.length ? max(ollieLatencies) : null;
  const popRms = ollieRms.length === ollies.length ? max(ollieRms) : null;

  const flickRecognized = flicks.filter((f) => f.recLabel === 'kickflip').length;

  // --- Gates (evaluated always; ENFORCED per group by the caller)
  const gates: FeelGate[] = [
    gate('steer.lagMs', 'steer', 'S2', 'finger→board yaw lag (45° @200°/s, worst dir)', steerLagMs, '<', 50),
    gate('steer.trackErrDeg', 'steer', 'S2', 'max |commanded−actual| during turn (worst dir)', steerTrackErrDeg, '<', 5),
    gate('steer.pivotDeg', 'steer', 'S2', 'yaw achieved by 1 s standstill rotation', pivotDeg, '>=', 80),
    gate('pop.latencyMs', 'pop', 'S4', 'replant→first airborne step, worst of battery', popLatencyMs, '<=', 80),
    gate('pop.silhouetteRmsDeg', 'pop', 'S4', 'pitch vs authored curve RMS, worst of battery', popRms, '<', 4),
    gate('pop.bails', 'pop', 'S4', 'ollie battery bail count', ollieCounts.bail!, '==', 0),
    gate('nav.slalom', 'nav', 'S2', '5-gate slalom, closed-loop wrist-range bot', nav.slalom.success ? 1 : 0, '==', 1),
    gate('nav.pivot90', 'nav', 'S2', 'standstill 90° in ≤1.5 s (two grips)', nav.pivot90.success ? 1 : 0, '==', 1),
  ];

  const cfg = DEFAULT_SIM_CONFIG;
  const report: Record<string, unknown> = {
    schema: 'slackpad-feel-report/1',
    build: { gameVersion: GAME_VERSION, rapierVersion: RAPIER_VERSION, hz: HZ },
    configEcho: {
      'locomotion.steerDirectGain': cfg.locomotion.steerDirectGain,
      'locomotion.steerTrackGain': cfg.locomotion.steerTrackGain,
      'locomotion.steerServoGain': cfg.locomotion.steerServoGain,
      'locomotion.steerMaxTorque': cfg.locomotion.steerMaxTorque,
      'locomotion.gripRate': cfg.locomotion.gripRate,
      'locomotion.gripSlipSpeed': cfg.locomotion.gripSlipSpeed,
      'physics.steerYawRateMax': cfg.physics.steerYawRateMax,
      'physics.boardMass': cfg.physics.boardMass,
      'physics.riderMass': cfg.physics.riderMass,
      'pop.baseQuality': cfg.pop.baseQuality,
      'pop.jMin': cfg.pop.jMin,
      'pop.jMax': cfg.pop.jMax,
      'camera.chaseSide': cfg.camera.chaseSide,
      'camera.chaseDistance': cfg.camera.chaseDistance,
    },
    metrics: {
      steer: {
        lagMs: round(steerLagMs, 2),
        lagCorr: round(lagPlus && lagMinus ? Math.min(lagPlus.corr, lagMinus.corr) : null),
        trackErrDeg: round(steerTrackErrDeg),
        pivotDeg: round(pivotDeg),
        pivotCommandedDeg: 200,
        ratchetCommandedDeg: ratchet.commandedDeg,
        ratchetAchievedDeg: round(ratchet.achievedDeg),
        holdYawDriftDeg: round(hold.yawDriftDeg),
        holdPosDriftM: round(hold.posDriftM),
        cruiseTurnLagMs: round(cruiseLag?.lagMs ?? null, 2),
        cruiseTurnErrDeg: round(maxTrackingErrorDeg(cruiseTurn.samples, cruiseTurn.rotationStartIndex)),
        turnSpeedMps: round((turnPlus.meanSpeedMps + turnMinus.meanSpeedMps) / 2),
      },
      pop: {
        latencyMs: round(popLatencyMs, 2),
        latencyMedianMs: round(median(ollieLatencies), 2),
        liftoffFailures: ollies.length - ollieLatencies.length,
        silhouetteRmsDeg: round(popRms),
        silhouetteRmsMedianDeg: round(median(ollieRms)),
      },
      land: {
        cleanRate: round(cleanRate),
        counts: ollieCounts,
      },
      nollie: {
        latencyMs: round(nollieLatencies.length === nollies.length ? max(nollieLatencies) : null, 2),
        counts: nollieCounts,
      },
      flick: {
        recognizedKickflipRate: round(flickRecognized / Math.max(1, flicks.length)),
        counts: outcomeCounts(flicks),
      },
      nav: navMetrics(nav),
    },
    batteries: {
      ollie: batteryRows(ollies, 1),
      nollie: batteryRows(nollies, -1),
      flick: flicks.map((f: FlickRunResult) => ({
        seed: f.seed,
        recLabel: f.recLabel,
        label: f.label,
        outcome: f.outcome,
        flipRotations: round(f.flipRotations),
      })),
    },
    gates,
  };

  const svgs: Record<string, string> = {
    'steer-turn-plus.svg': steerPlot('45° turn, +dir, coasting: fingers vs board', turnPlus),
    'steer-turn-minus.svg': steerPlot('45° turn, −dir, coasting: fingers vs board', turnMinus),
    'steer-pivot.svg': steerPlot('standstill pivot, 200°/s for 1 s', pivot),
    'steer-ratchet.svg': steerPlot('ratchet 2×45° with re-grip', {
      samples: ratchet.samples,
      rotationStartIndex: 0,
      meanSpeedMps: 0,
    }),
    'ollie-pitch.svg': pitchPlot('ollie #1: pitch vs reference silhouette', ollies[0]!, 1),
    'nollie-pitch.svg': pitchPlot('nollie #1: pitch vs mirrored reference', nollies[0]!, -1),
  };

  return { report, markdown: renderMarkdown(report), svgs };
}

function fmt(v: unknown): string {
  if (v == null) return '—';
  if (typeof v === 'number') return String(v);
  return String(v);
}

function renderMarkdown(report: Record<string, unknown>): string {
  const m = report.metrics as Record<string, Record<string, unknown>>;
  const gates = report.gates as FeelGate[];
  const lines: string[] = [];
  lines.push('# SlackPad 360 — feel report');
  lines.push('');
  lines.push('Deterministic headless run of the canonical feel scenarios (reviews/03 §Stage 0.2).');
  lines.push('Metrics are instrument readings, not feel verdicts — feel is judged by a human.');
  lines.push('');
  lines.push('## Gates');
  lines.push('');
  lines.push('| gate | stage | value | target | pass |');
  lines.push('| --- | --- | --- | --- | --- |');
  for (const g of gates) {
    lines.push(
      `| ${g.id} — ${g.description} | ${g.stage} | ${fmt(g.value)} | ${g.op} ${g.threshold} | ${g.pass ? 'PASS' : 'fail'} |`,
    );
  }
  lines.push('');
  lines.push('## Steering');
  lines.push('');
  lines.push('| metric | value |');
  lines.push('| --- | --- |');
  for (const [k, v] of Object.entries(m.steer!)) lines.push(`| steer.${k} | ${fmt(v)} |`);
  lines.push('');
  lines.push('## Pop / landing');
  lines.push('');
  lines.push('| metric | value |');
  lines.push('| --- | --- |');
  for (const [k, v] of Object.entries(m.pop!)) lines.push(`| pop.${k} | ${fmt(v)} |`);
  lines.push(`| land.cleanRate | ${fmt((m.land as Record<string, unknown>).cleanRate)} |`);
  lines.push(`| land.counts | ${JSON.stringify((m.land as Record<string, unknown>).counts)} |`);
  lines.push(`| nollie.latencyMs | ${fmt((m.nollie as Record<string, unknown>).latencyMs)} |`);
  lines.push(`| nollie.counts | ${JSON.stringify((m.nollie as Record<string, unknown>).counts)} |`);
  lines.push(`| flick.recognizedKickflipRate | ${fmt((m.flick as Record<string, unknown>).recognizedKickflipRate)} |`);
  lines.push('');
  lines.push('## Playability probes (nav.*)');
  lines.push('');
  lines.push('| probe | success | time (s) | detail |');
  lines.push('| --- | --- | --- | --- |');
  for (const [name, row] of Object.entries(m.nav as Record<string, Record<string, unknown>>)) {
    const { success, timeSec, ...detail } = row;
    lines.push(`| nav.${name} | ${success ? 'PASS' : 'fail'} | ${fmt(timeSec)} | ${JSON.stringify(detail)} |`);
  }
  lines.push('');
  lines.push('## Config echo');
  lines.push('');
  lines.push('| key | value |');
  lines.push('| --- | --- |');
  for (const [k, v] of Object.entries(report.configEcho as Record<string, unknown>)) {
    lines.push(`| ${k} | ${fmt(v)} |`);
  }
  lines.push('');
  lines.push('## Plots');
  lines.push('');
  lines.push('- plots/steer-turn-plus.svg / steer-turn-minus.svg — fingers vs board during the 45° turn');
  lines.push('- plots/steer-pivot.svg — standstill pivot');
  lines.push('- plots/steer-ratchet.svg — 2×45° re-grip staircase');
  lines.push('- plots/ollie-pitch.svg / nollie-pitch.svg — pitch vs reference silhouette');
  lines.push('');
  return lines.join('\n');
}
