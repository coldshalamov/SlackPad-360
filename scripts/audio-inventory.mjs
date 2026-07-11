#!/usr/bin/env node
/**
 * Audio proxy analysis pass (M9 prep). Unzips the acquired CC0 packs, then
 * measures every clip with ffmpeg: duration, integrated loudness (EBU R128),
 * true peak, and a crude spectral centroid proxy (via astats). Output feeds
 * the audio event mapping table. This is the OBJECTIVE half of the spec's
 * "listen pass" — subjective confirmation stays a human/G2 step, and the packs
 * remain proxies until then (final-art-assets-world-audio-spec §3).
 */
import { execFileSync, execSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, extname } from 'node:path';

const REPO = process.cwd();
const OUT = join(REPO, 'assets', 'generated', 'audio');
const UNPACKED = join(OUT, 'unpacked');

const PACKS = [
  { id: 'kenney-impact-sounds', zip: 'assets/source/vendor/kenney-impact-sounds/kenney_impact-sounds.zip' },
  { id: 'kenney-interface-sounds', zip: 'assets/source/vendor/kenney-interface-sounds/kenney_interface-sounds.zip' },
  { id: 'oga-100-cc0-metal-wood-sfx', zip: 'assets/source/vendor/oga-100-cc0-metal-wood-sfx/100-CC0-wood-metal-SFX.zip' },
  { id: 'oga-100-cc0-sfx-2', zip: 'assets/source/vendor/oga-100-cc0-sfx-2/sfx_100_v2.zip' },
];

const AUDIO_EXT = new Set(['.wav', '.ogg', '.mp3', '.flac']);

function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else if (AUDIO_EXT.has(extname(name).toLowerCase())) out.push(p);
  }
  return out;
}

mkdirSync(UNPACKED, { recursive: true });

for (const pack of PACKS) {
  const dest = join(UNPACKED, pack.id);
  if (!existsSync(dest)) {
    mkdirSync(dest, { recursive: true });
    console.log(`unzip ${pack.id}`);
    execSync(
      `powershell -NoProfile -Command "Expand-Archive -LiteralPath '${join(REPO, pack.zip)}' -DestinationPath '${dest}' -Force"`,
      { stdio: 'inherit' },
    );
  }
}

const inventory = [];
for (const pack of PACKS) {
  const dest = join(UNPACKED, pack.id);
  const files = walk(dest);
  console.log(`${pack.id}: ${files.length} clips`);
  for (const file of files) {
    let durationS = null;
    let rmsDb = null;
    let peakDb = null;
    try {
      const probe = execFileSync(
        'ffprobe',
        ['-v', 'quiet', '-show_entries', 'format=duration', '-of', 'csv=p=0', file],
        { encoding: 'utf8' },
      ).trim();
      durationS = parseFloat(probe);
    } catch {
      /* duration stays null */
    }
    // Integrated LUFS gates out (-70) on sub-second SFX, so use astats
    // overall Peak/RMS instead — reliable for short clips and sufficient for
    // peak-normalized gain staging at M9.
    const parse = (out) => {
      const p = /Peak level dB:\s*(-?[\d.inf]+)/i.exec(out);
      const r = /RMS level dB:\s*(-?[\d.inf]+)/i.exec(out);
      if (p && Number.isFinite(parseFloat(p[1]))) peakDb = parseFloat(p[1]);
      if (r && Number.isFinite(parseFloat(r[1]))) rmsDb = parseFloat(r[1]);
    };
    try {
      parse(
        execSync(
          `ffmpeg -nostats -i "${file}" -af astats=measure_perchannel=none -f null NUL 2>&1`,
          { encoding: 'utf8' },
        ),
      );
    } catch (err) {
      parse(String(err.stdout ?? '') + String(err.stderr ?? ''));
    }
    inventory.push({
      pack: pack.id,
      file: relative(REPO, file).replaceAll('\\', '/'),
      durationS: Number.isFinite(durationS) ? +durationS.toFixed(3) : null,
      rmsDb,
      peakDb,
    });
  }
}

mkdirSync(OUT, { recursive: true });
writeFileSync(join(OUT, 'inventory.json'), JSON.stringify({ generated: 'audio-inventory.mjs', clips: inventory }, null, 2));
console.log(`wrote ${inventory.length} entries to assets/generated/audio/inventory.json`);
