#!/usr/bin/env node
/**
 * Build the audio event → clip mapping table (M9 prep) from inventory.json.
 * Per final-art-assets-world-audio-spec §3. Every entry stays PROXY quality
 * until the human listen pass; gains are peak-normalization suggestions
 * (gainDb = targetPeakDb − measuredPeakDb) so events sit in a coherent mix.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const REPO = process.cwd();
const inv = JSON.parse(readFileSync(join(REPO, 'assets/generated/audio/inventory.json'), 'utf8')).clips;

const byPattern = (rx) => inv.filter((c) => rx.test(c.file));

/** Event definitions: selection regex + mix targets. */
const EVENTS = {
  roll: {
    strategy: 'procedural',
    notes:
      'Speed-modulated filtered noise loop synthesized at runtime (no suitable field loop in acquired packs; real recording deferred per spec).',
    variants: [],
  },
  push: {
    strategy: 'one-shot-variants',
    targetPeakDb: -8,
    notes: 'Soft scuff for a push stroke; footstep concrete reads as urethane-on-concrete scuff proxy.',
    variants: byPattern(/impact-sounds.*footstep_concrete_\d+/),
  },
  pop: {
    strategy: 'one-shot-variants',
    targetPeakDb: -3,
    notes: 'Crisp tail-snap. impactWood medium has the right transient; pitch +2st at runtime for nollie.',
    variants: byPattern(/impact-sounds.*impactWood_medium_\d+/),
  },
  catch: {
    strategy: 'one-shot-variants',
    targetPeakDb: -9,
    notes: 'Soft tick when feet re-pin the deck mid-air.',
    variants: byPattern(/impact-sounds.*impactGeneric_light_\d+/),
  },
  land: {
    strategy: 'one-shot-variants',
    targetPeakDb: -3,
    notes: 'Clean land = single variant; dirty land layers one wood_hit at −6. Scale gain by impact speed.',
    variants: [
      ...byPattern(/impact-sounds.*impactWood_heavy_\d+/),
      ...byPattern(/metal-wood-sfx.*wood_hit_\d+/).slice(0, 4),
    ],
  },
  bail: {
    strategy: 'cluster',
    targetPeakDb: -2,
    notes: 'Layer punch_heavy + soft_heavy + a delayed wood_falling clatter (~120ms offset).',
    variants: [
      ...byPattern(/impact-sounds.*impactPunch_heavy_\d+/),
      ...byPattern(/impact-sounds.*impactSoft_heavy_\d+/),
      ...byPattern(/metal-wood-sfx.*wood_falling_\d+/).slice(0, 3),
    ],
  },
  'grind-metal': {
    strategy: 'granular-retrigger',
    targetPeakDb: -8,
    notes:
      'PROXY: no true scrape loop acquired (Freesound 655371 auth-gated). Retrigger short metal hits at speed-scaled rate (18–40 Hz jittered) under a low-passed loop_machine bed at −16; crossfade out on exit.',
    variants: [
      ...byPattern(/metal-wood-sfx.*metal_hit_\d+/),
      ...byPattern(/sfx-2.*loop_machine_\d+/).slice(0, 1),
    ],
  },
  'grind-ledge': {
    strategy: 'granular-retrigger',
    targetPeakDb: -9,
    notes: 'Wood/concrete ledge slide proxy: wood_misc shorts retriggered, denser with speed.',
    variants: byPattern(/metal-wood-sfx.*wood_misc_\d+/).slice(0, 5),
  },
  ambience: {
    strategy: 'loop-bed',
    targetPeakDb: -16,
    notes: 'Plaza daylight bed: loop_ambient birds/air + distant highway at −20 for city context.',
    variants: [
      ...byPattern(/sfx-2.*loop_ambient_\d+/),
      ...byPattern(/sfx-2.*loop_highway/),
    ],
  },
  'ui-click': { strategy: 'ui', targetPeakDb: -10, notes: 'Menu navigate.', variants: byPattern(/interface-sounds.*click_\d+/) },
  'ui-confirm': { strategy: 'ui', targetPeakDb: -8, notes: 'Challenge complete / confirm.', variants: byPattern(/interface-sounds.*confirmation_\d+/) },
  'ui-error': { strategy: 'ui', targetPeakDb: -10, notes: 'Invalid / locked.', variants: byPattern(/interface-sounds.*error_00[0-3]/) },
  'ui-select': { strategy: 'ui', targetPeakDb: -10, notes: 'Focus move.', variants: byPattern(/interface-sounds.*select_00[0-3]/) },
  'ui-toggle': { strategy: 'ui', targetPeakDb: -10, notes: 'Settings toggle.', variants: byPattern(/interface-sounds.*toggle_\d+/) },
  'score-pop': { strategy: 'ui', targetPeakDb: -9, notes: 'Trick score toast.', variants: byPattern(/interface-sounds.*tick_\d+/) },
};

const out = {
  mapVersion: 1,
  status: 'proxy-pending-listen-pass',
  method:
    'Objective selection from astats peak/RMS inventory (scripts/audio-inventory.mjs). gainDb = targetPeakDb - peakDb per variant. Subjective listen pass + G2 remain before runtime promotion (final-art-assets-world-audio-spec §3).',
  events: {},
};

for (const [event, def] of Object.entries(EVENTS)) {
  out.events[event] = {
    strategy: def.strategy,
    notes: def.notes,
    ...(def.targetPeakDb !== undefined ? { targetPeakDb: def.targetPeakDb } : {}),
    variants: def.variants.map((v) => ({
      file: v.file,
      durationS: v.durationS,
      peakDb: v.peakDb,
      rmsDb: v.rmsDb,
      gainDb: def.targetPeakDb !== undefined && v.peakDb !== null ? +(def.targetPeakDb - v.peakDb).toFixed(2) : 0,
    })),
  };
}

const target = join(REPO, 'assets/generated/audio/event-map.json');
writeFileSync(target, JSON.stringify(out, null, 2));
const counts = Object.entries(out.events)
  .map(([k, v]) => `${k}:${v.variants.length}`)
  .join(' ');
console.log('wrote event-map.json —', counts);
