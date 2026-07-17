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

import {
  DEFAULT_INPUT_PROFILE,
  DEFAULT_POP_PITCH_PRESET,
  DEFAULT_SIM_CONFIG,
  popFlightSteps,
  samplePitchCurve,
} from '@slackpad/shared';
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
import { trickBattery } from '../test/feel/trick-scenarios';
import type { TrickLabel, TrickRunResult } from '../test/feel/trick-scenarios';
import {
  envelopeCell,
  envelopeMap,
  grindHoldProbe,
  grindRecoveryProbe,
} from '../test/feel/grind-scenarios';
import type { EnvelopeMapResult } from '../test/feel/grind-scenarios';
import type {
  FlickRunResult,
  PopRunResult,
  SteerSample,
  SteerScenarioResult,
} from '../test/feel/scenarios';

const HZ = DEFAULT_SIM_CONFIG.physics.hz;
const DT_MS = 1000 / HZ;

/**
 * The ACTIVE authored pitch silhouette: config pop.pitchCurves under the
 * default profile's preset — the exact curve the runtime tracker plays (S4).
 * The 'crisp' control points are byte-identical to the S0 reference, so the
 * committed baseline RMS stays comparable.
 */
const ACTIVE_PITCH_PRESET =
  DEFAULT_INPUT_PROFILE.popPitchPreset ?? DEFAULT_POP_PITCH_PRESET;
const ACTIVE_PITCH_CURVE =
  DEFAULT_SIM_CONFIG.pop.pitchCurves[ACTIVE_PITCH_PRESET];
// The batteries pop via motionTap (constant q), so the runtime's per-pop
// silhouette timeline is a constant too — mirror it exactly.
const CURVE_DURATION_STEPS = popFlightSteps(
  DEFAULT_SIM_CONFIG.pop.jMin +
    DEFAULT_SIM_CONFIG.pop.baseQuality *
      (DEFAULT_SIM_CONFIG.pop.jMax - DEFAULT_SIM_CONFIG.pop.jMin),
  DEFAULT_SIM_CONFIG.physics.boardMass + DEFAULT_SIM_CONFIG.physics.riderMass,
  DEFAULT_SIM_CONFIG.physics.hz,
);

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

/**
 * GATED metric (S4): RMS of measured nose-up pitch vs the ACTIVE authored
 * curve on the curve's OWN timeline — tNorm = (step − kick)/curveDurationSteps
 * — exactly how the runtime tracker plays it (landing early truncates the
 * performance; it never time-stretches). Samples run kick → min(resolve,
 * kick + duration).
 */
export function silhouetteRmsDeg(run: PopRunResult, noseUpSign: 1 | -1): number | null {
  if (run.resolveStep == null || run.resolveStep <= run.kickStep) return null;
  const end = Math.min(run.resolveStep, run.kickStep + CURVE_DURATION_STEPS);
  const errs: number[] = [];
  for (const s of run.pitchSamples) {
    if (s.step < run.kickStep || s.step > end) continue;
    const tNorm = (s.step - run.kickStep) / CURVE_DURATION_STEPS;
    const ref = noseUpSign * samplePitchCurve(ACTIVE_PITCH_CURVE, tNorm);
    errs.push(s.pitchDeg - ref);
  }
  if (errs.length === 0) return null;
  return Math.sqrt(mean(errs.map((e) => e * e)));
}

/**
 * LEGACY S0 metric definition (kick→land normalization) kept verbatim so the
 * committed untouched-build baseline (16.9° RMS) stays directly comparable in
 * the S6 delta table.
 */
export function silhouetteRmsLandNormDeg(
  run: PopRunResult,
  noseUpSign: 1 | -1,
): number | null {
  if (run.resolveStep == null || run.resolveStep <= run.kickStep) return null;
  const span = run.resolveStep - run.kickStep;
  const errs: number[] = [];
  for (const s of run.pitchSamples) {
    if (s.step < run.kickStep || s.step > run.resolveStep) continue;
    const tNorm = (s.step - run.kickStep) / span;
    const ref = noseUpSign * samplePitchCurve(ACTIVE_PITCH_CURVE, tNorm);
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
  const measured = run.pitchSamples
    .filter((s) => s.step >= run.kickStep)
    .map((s) => ({ x: (s.step - run.kickStep) * DT_MS, y: s.pitchDeg }));
  const reference = run.pitchSamples
    .filter((s) => s.step >= run.kickStep && s.step <= run.kickStep + CURVE_DURATION_STEPS)
    .map((s) => ({
      x: (s.step - run.kickStep) * DT_MS,
      y:
        noseUpSign *
        samplePitchCurve(ACTIVE_PITCH_CURVE, (s.step - run.kickStep) / CURVE_DURATION_STEPS),
    }));
  return svgPlot(title, 't since kick (ms)', 'nose-up pitch (deg)', [
    { label: 'measured pitch', color: '#d62728', points: measured },
    { label: `authored silhouette (${ACTIVE_PITCH_PRESET})`, color: '#1f77b4', points: reference },
  ]);
}

// ---------------------------------------------------------------------------
// Gates
// ---------------------------------------------------------------------------

export type GateGroup = 'steer' | 'pop' | 'nav' | 'trick' | 'grind';

export interface FeelGate {
  id: string;
  group: GateGroup;
  description: string;
  value: number | null;
  op: '<' | '<=' | '>=' | '==';
  threshold: number;
  pass: boolean;
  /** Sprint stage whose exit this gate belongs to. */
  stage: 'S2' | 'S4' | 'T2' | 'T3';
}

function gate(
  id: string,
  group: GateGroup,
  stage: FeelGate['stage'],
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
    thetaDeg: round(r.thetaDeg, 2),
    impactSpeedMps: round(r.impactSpeedMps, 2),
    headingErrDeg: round(r.headingErrDeg, 2),
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

function quantile(xs: number[], q: number): number | null {
  if (xs.length === 0) return null;
  const sorted = [...xs].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.floor(q * sorted.length));
  return sorted[idx]!;
}

function landedRate(runs: TrickRunResult[]): number {
  const landed = runs.filter((r) => r.outcome === 'clean' || r.outcome === 'dirty').length;
  return landed / Math.max(1, runs.length);
}

function caughtLandedCount(runs: TrickRunResult[]): number {
  return runs.filter((r) => r.caught && (r.outcome === 'clean' || r.outcome === 'dirty')).length;
}

function trickRows(runs: TrickRunResult[]): Array<Record<string, unknown>> {
  return runs.map((r) => ({
    seed: r.seed,
    assist: r.assistLevel,
    recogLagMs: round(r.recogLagMs, 2),
    torqueLagMs: round(r.torqueLagMs, 2),
    completionTurns: round(r.completionTurns),
    completionDeg: round(r.completionDeg, 1),
    catchResidualDeg: round(r.catchResidualDeg, 2),
    catchResidual4Deg: round(r.catchResidual4Deg, 2),
    catchTiltDeg: round(r.catchTiltDeg, 2),
    caught: r.caught,
    recLabel: r.recLabel,
    label: r.label,
    outcome: r.outcome,
    bailReason: r.bailReason,
  }));
}

/** Latch-success heatmap (green latched / red missed), speed rows × angle cols. */
function envelopeSvg(map: EnvelopeMapResult): string {
  const cellW = 88;
  const cellH = 46;
  const left = 84;
  const top = 44;
  const W = left + map.angles.length * cellW + 16;
  const H = top + map.speeds.length * cellH + 30;
  const parts: string[] = [];
  parts.push(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" font-family="monospace" font-size="12">`,
  );
  parts.push(`<rect x="0" y="0" width="${W}" height="${H}" fill="white"/>`);
  parts.push(`<text x="${left}" y="18" font-size="14">grind latch envelope — approach speed × angle (L1)</text>`);
  map.angles.forEach((a, i) => {
    parts.push(`<text x="${left + i * cellW + cellW / 2 - 14}" y="${top - 8}">${a}°</text>`);
  });
  map.speeds.forEach((s, i) => {
    parts.push(`<text x="8" y="${top + i * cellH + cellH / 2 + 4}">${s.toFixed(2)} m/s</text>`);
  });
  map.cells.forEach((row, si) => {
    row.forEach((cell, ai) => {
      const x = left + ai * cellW;
      const y = top + si * cellH;
      const fill = cell.latched ? '#2ca02c' : cell.popped ? '#d62728' : '#999999';
      parts.push(
        `<rect x="${x + 2}" y="${y + 2}" width="${cellW - 4}" height="${cellH - 4}" fill="${fill}" fill-opacity="0.75"/>`,
      );
      const tag = cell.latched ? (cell.family === 'boardslide' ? 'BS' : '50-50') : cell.popped ? 'miss' : 'no-pop';
      parts.push(`<text x="${x + 8}" y="${y + cellH / 2 + 4}" fill="white">${tag}</text>`);
    });
  });
  parts.push('</svg>');
  return parts.join('\n');
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

  // --- Sprint 03 T0: trick batteries -------------------------------------
  const kickflips = await trickBattery('kickflip', 20, 0x7a100, 1);
  const shuvs = await trickBattery('bs-shuv', 20, 0x7a200, 1);
  const rateLabels: TrickLabel[] = ['kickflip', 'heelflip', 'bs-shuv', 'fs-shuv'];
  const rateBatteries: Record<string, TrickRunResult[]> = {};
  for (const label of rateLabels) {
    for (const level of [0, 1, 2] as const) {
      rateBatteries[`${label}@L${level}`] = await trickBattery(
        label,
        8,
        0x7b000 + rateLabels.indexOf(label) * 256 + level * 32,
        level,
      );
    }
  }

  // --- Sprint 03 T0: grind envelope + probes -----------------------------
  const grindMap = await envelopeMap(1);
  // Central cells (valid speed, near-envelope angles): the T3 latch gate runs
  // 10 seeds on the middle of the map.
  const centralRuns = [] as Array<{ latched: boolean }>;
  for (let i = 0; i < 10; i++) {
    centralRuns.push(await envelopeCell(0, 3.5, 0x9f100 + i, 1));
  }
  const grindHold = await grindHoldProbe(0x9f200, 1);
  const recovery = await grindRecoveryProbe(0x9f300, 1);

  // --- Bail histogram across every battery --------------------------------
  const bailHistogram: Record<string, number> = {};
  const addBail = (reason: string | null): void => {
    if (!reason) return;
    bailHistogram[reason] = (bailHistogram[reason] ?? 0) + 1;
  };
  for (const runs of [kickflips, shuvs, ...Object.values(rateBatteries)]) {
    for (const r of runs) addBail(r.outcome === 'bail' ? (r.bailReason ?? 'unknown') : null);
  }

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
  const ollieRmsLegacy = ollies
    .map((r) => silhouetteRmsLandNormDeg(r, 1))
    .filter((v): v is number => v != null);
  const ollieCounts = outcomeCounts(ollies);
  const nollieCounts = outcomeCounts(nollies);
  const nollieLatencies = nollies.map((r) => r.latencyMs).filter((v): v is number => v != null);
  const cleanRate = ollieCounts.clean! / Math.max(1, ollies.length);
  const popLatencyMs = ollieLatencies.length === ollies.length ? max(ollieLatencies) : null;
  const popRms = ollieRms.length === ollies.length ? max(ollieRms) : null;

  const flickRecognized = flicks.filter((f) => f.recLabel === 'kickflip').length;

  // --- Sprint 03 trick metrics --------------------------------------------
  const recogLags = kickflips
    .concat(shuvs)
    .map((r) => r.recogLagMs)
    .filter((v): v is number => v != null);
  const torqueLags = kickflips
    .concat(shuvs)
    .map((r) => r.torqueLagMs)
    .filter((v): v is number => v != null);
  const trickRecogLagMs =
    recogLags.length === kickflips.length + shuvs.length ? max(recogLags) : null;
  const trickTorqueLagMs =
    torqueLags.length === kickflips.length + shuvs.length ? max(torqueLags) : null;
  const flipCompletions = kickflips
    .map((r) => r.completionTurns)
    .filter((v): v is number => v != null);
  const shuvCompletions = shuvs
    .map((r) => r.completionDeg)
    .filter((v): v is number => v != null);
  const catchResiduals = kickflips
    .concat(shuvs)
    .map((r) => r.catchResidualDeg)
    .filter((v): v is number => v != null);
  const catchResiduals4 = kickflips
    .concat(shuvs)
    .map((r) => r.catchResidual4Deg)
    .filter((v): v is number => v != null);
  const centralLatched = centralRuns.filter((r) => r.latched).length;

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
    gate('trick.recogLagMs', 'trick', 'T2', 'gesture start → recognized, worst of kickflip+shuv batteries', trickRecogLagMs, '<=', 50),
    gate('trick.torqueLagMs', 'trick', 'T2', 'recognized → on-axis ω response, worst of batteries', trickTorqueLagMs, '<=', 33.4),
    gate('trick.kickflipBattery', 'trick', 'T2', 'caught+landed of 10 kickflips at L1 (first 10 of battery)', caughtLandedCount(kickflips.slice(0, 10)), '>=', 9),
    gate('trick.shuvBattery', 'trick', 'T2', 'caught+landed of 10 bs-shuvs at L1 (first 10 of battery)', caughtLandedCount(shuvs.slice(0, 10)), '>=', 8),
    gate('trick.catchResidualP90Deg', 'trick', 'T2', 'p90 deck tilt one step after catch (L1 batteries)', quantile(catchResiduals, 0.9), '<=', 8),
    gate('grind.centralLatch', 'grind', 'T3', 'central envelope cell latches, of 10 seeds at L1', centralLatched, '>=', 10),
    gate('grind.holdSeconds', 'grind', 'T3', 'neutral-input balance hold on the straight ledge', grindHold.holdSeconds, '>=', 3),
    gate('grind.recoveryOk', 'grind', 'T3', 'slip → cooldown respected → rideable recovery', recovery.slipped && recovery.cooldownRespected && recovery.recovered ? 1 : 0, '==', 1),
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
        silhouettePreset: ACTIVE_PITCH_PRESET,
        silhouetteRmsDeg: round(popRms),
        silhouetteRmsMedianDeg: round(median(ollieRms)),
        // Legacy S0 kick→land normalization — comparable to the committed
        // untouched-build baseline (16.9°).
        silhouetteRmsLandNormDeg: round(
          ollieRmsLegacy.length === ollies.length ? max(ollieRmsLegacy) : null,
        ),
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
      trick: {
        recogLagMs: round(trickRecogLagMs, 2),
        recogLagMedianMs: round(median(recogLags), 2),
        torqueLagMs: round(trickTorqueLagMs, 2),
        flipCompletion: {
          target: 1,
          min: round(flipCompletions.length ? Math.min(...flipCompletions) : null),
          median: round(median(flipCompletions)),
          max: round(max(flipCompletions)),
          n: flipCompletions.length,
        },
        shuvCompletionDeg: {
          target: DEFAULT_SIM_CONFIG.recognition.shuvTargetDeg,
          min: round(shuvCompletions.length ? Math.min(...shuvCompletions) : null, 1),
          median: round(median(shuvCompletions), 1),
          max: round(max(shuvCompletions), 1),
          n: shuvCompletions.length,
        },
        catchResidualP90Deg: round(quantile(catchResiduals, 0.9), 2),
        catchResidualMedianDeg: round(median(catchResiduals), 2),
        catchResidual4P90Deg: round(quantile(catchResiduals4, 0.9), 2),
        catchResidual4MedianDeg: round(median(catchResiduals4), 2),
        batteryRate: Object.fromEntries(
          Object.entries(rateBatteries).map(([key, runs]) => [key, round(landedRate(runs))]),
        ),
      },
      grind: {
        envelope: {
          angles: grindMap.angles,
          speeds: grindMap.speeds,
          latched: grindMap.cells.map((row) => row.map((c) => (c.latched ? 1 : 0))),
          families: grindMap.cells.map((row) => row.map((c) => c.family ?? '-')),
        },
        centralLatchOf10: centralLatched,
        holdSeconds: grindHold.holdSeconds,
        holdExitReason: grindHold.exitReason,
        recovery: {
          slipped: recovery.slipped,
          cooldownRespected: recovery.cooldownRespected,
          recovered: recovery.recovered,
          exitReason: recovery.exitReason,
        },
      },
      bailHistogram,
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
      kickflipL1: trickRows(kickflips),
      bsShuvL1: trickRows(shuvs),
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
    'grind-envelope.svg': envelopeSvg(grindMap),
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
  lines.push('## Tricks (Sprint 03)');
  lines.push('');
  lines.push('| metric | value |');
  lines.push('| --- | --- |');
  for (const [k, v] of Object.entries(m.trick!)) {
    lines.push(`| trick.${k} | ${typeof v === 'object' ? JSON.stringify(v) : fmt(v)} |`);
  }
  lines.push('');
  lines.push('## Grind (Sprint 03)');
  lines.push('');
  lines.push('| metric | value |');
  lines.push('| --- | --- |');
  const grindM = m.grind as Record<string, unknown>;
  lines.push(`| grind.centralLatchOf10 | ${fmt(grindM.centralLatchOf10)} |`);
  lines.push(`| grind.holdSeconds | ${fmt(grindM.holdSeconds)} (exit: ${fmt(grindM.holdExitReason)}) |`);
  lines.push(`| grind.recovery | ${JSON.stringify(grindM.recovery)} |`);
  lines.push(`| grind.envelope | see plots/grind-envelope.svg |`);
  lines.push(`| bail.histogram | ${JSON.stringify(m.bailHistogram)} |`);
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
  lines.push('- plots/grind-envelope.svg — latch success over approach speed × angle');
  lines.push('');
  return lines.join('\n');
}
