#!/usr/bin/env node
/**
 * package:win — produce a double-click-to-play Windows bundle.
 *
 * Steps:
 *   1. Build the game bundle           (npm run build -w @slackpad/game)
 *   2. Publish the native host         (dotnet publish -c Release -r win-x64, FDD)
 *   3. Stage the game dist as GameDist/ next to the published exe
 *   4. Write README.txt (run instructions + WebView2 Evergreen note)
 *   5. Zip -> dist-release/SlackPad360-win-x64.zip
 *
 * Honesty rule (M10): if the toolchain is missing or any step fails, write a
 * pause-packet to preproduction/evidence/impl/m10-packaging/pause-packet.json
 * and exit non-zero. NEVER fabricate a zip or claim success.
 */
import { execSync } from 'node:child_process';
import { existsSync, mkdirSync, rmSync, cpSync, writeFileSync, statSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const evidenceDir = path.join(repoRoot, 'preproduction', 'evidence', 'impl', 'm10-packaging');
const distReleaseDir = path.join(repoRoot, 'dist-release');
const stageName = 'SlackPad360-win-x64';
const stageDir = path.join(distReleaseDir, stageName);
const zipPath = path.join(distReleaseDir, `${stageName}.zip`);
const gameDist = path.join(repoRoot, 'packages', 'game', 'dist');

function log(msg) {
  process.stdout.write(`[package:win] ${msg}\n`);
}

/** Write a pause-packet and abort. The bundle is NOT produced. */
function pause(reason, detail) {
  mkdirSync(evidenceDir, { recursive: true });
  const packet = {
    milestone: 'M10-packaging',
    status: 'paused',
    reason,
    detail: detail ?? null,
    at: new Date().toISOString(),
    checked: {
      node: process.version,
      dotnet: safeExec('dotnet --version') ?? 'not found',
      dotnetSdks: safeExec('dotnet --list-sdks') ?? 'not found',
    },
    note: 'No zip was produced. Fix the item above and re-run `npm run package:win`.',
  };
  writeFileSync(path.join(evidenceDir, 'pause-packet.json'), JSON.stringify(packet, null, 2));
  process.stderr.write(`\n[package:win] PAUSED: ${reason}\n${detail ?? ''}\n`);
  process.stderr.write(`[package:win] wrote ${path.relative(repoRoot, path.join(evidenceDir, 'pause-packet.json'))}\n`);
  process.exit(1);
}

function safeExec(cmd) {
  try {
    return execSync(cmd, { encoding: 'utf8' }).trim();
  } catch {
    return null;
  }
}

function run(name, cmd, opts = {}) {
  log(`${name} ...`);
  try {
    execSync(cmd, { stdio: 'inherit', cwd: repoRoot, ...opts });
  } catch (err) {
    pause(`step failed: ${name}`, `${cmd}\n${err?.message ?? err}`);
  }
}

function dirSizeBytes(dir) {
  let total = 0;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    total += entry.isDirectory() ? dirSizeBytes(full) : statSync(full).size;
  }
  return total;
}

function mb(bytes) {
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// --- 0. Preflight: toolchain -------------------------------------------------
if (!safeExec('node --version')) pause('Node.js not found on PATH');
const dotnetVersion = safeExec('dotnet --version');
if (!dotnetVersion) pause('.NET SDK not found on PATH', 'Install the .NET 10 SDK.');
const sdks = safeExec('dotnet --list-sdks') ?? '';
if (!/^10\./m.test(sdks)) {
  pause('.NET 10 SDK not found', `Installed SDKs:\n${sdks}\nInstall the .NET 10 SDK from https://dotnet.microsoft.com/download`);
}

// --- 1. Clean stage ----------------------------------------------------------
mkdirSync(distReleaseDir, { recursive: true });
if (existsSync(stageDir)) rmSync(stageDir, { recursive: true, force: true });
if (existsSync(zipPath)) rmSync(zipPath, { force: true });
mkdirSync(stageDir, { recursive: true });

// --- 2. Build the game -------------------------------------------------------
run('build game', 'npm run build -w @slackpad/game');
if (!existsSync(path.join(gameDist, 'index.html'))) {
  pause('game dist missing after build', `expected ${path.relative(repoRoot, path.join(gameDist, 'index.html'))}`);
}

// --- 3. Publish the native host (framework-dependent, win-x64) ---------------
run(
  'publish host',
  `dotnet publish host/SlackPad.Host/SlackPad.Host.csproj -c Release -r win-x64 --self-contained false -o "${stageDir}" --nologo`,
);
const exePath = path.join(stageDir, 'SlackPad.Host.exe');
if (!existsSync(exePath)) {
  pause('published host exe missing', `expected ${path.relative(repoRoot, exePath)}`);
}

// --- 4. Stage the game dist as GameDist/ -------------------------------------
const stagedGameDist = path.join(stageDir, 'GameDist');
cpSync(gameDist, stagedGameDist, { recursive: true });
if (!existsSync(path.join(stagedGameDist, 'index.html'))) {
  pause('GameDist staging failed', 'index.html not found after copy');
}

// --- 5. README ---------------------------------------------------------------
const readme = `SlackPad 360 - Windows build
============================

TO PLAY
  1. Extract this whole "${stageName}" folder anywhere (keep the files together).
  2. Double-click SlackPad.Host.exe.
  3. Plant TWO fingers on your Precision Touchpad to ride. Press F11 for fullscreen.
     Rotate the two-finger line to set the board heading.
     Lift + retap the rear finger for ollie; lift + retap front for nollie.
     Hold Ctrl to accelerate. Swipe after a pop for flip/shuv intent.
     Press V for the optional route camera. Press F8 for the Flick-It Lab.
     Close the window to quit.

REQUIREMENTS
  - Windows 10 / 11 (x64) with a Precision Touchpad (PTP).
  - Microsoft Edge WebView2 Runtime (Evergreen). It ships with Windows 11 and
    current Windows 10. If SlackPad reports it is missing, install it (free) from:
        https://developer.microsoft.com/microsoft-edge/webview2/
  - .NET 10 Desktop Runtime (x64). If SlackPad will not start, install it (free):
        https://dotnet.microsoft.com/download/dotnet/10.0
        (choose ".NET Desktop Runtime 10.x", x64)

NOTES
  - The game (GameDist/) is served locally to the host from a virtual origin
    (https://slackpad.game). No internet connection is needed to play.
  - Command-line flags: SlackPad.Host.exe --spike  (M1 input diagnostic window)
                        SlackPad.Host.exe --devtools (enable WebView2 dev tools)
`;
writeFileSync(path.join(stageDir, 'README.txt'), readme);

// --- 6. Zip (Windows ships bsdtar as tar.exe; avoid the optional and sometimes
//         broken Microsoft.PowerShell.Archive module) -------------------------
run(
  'zip bundle',
  `tar.exe -a -c -f "${zipPath}" -C "${distReleaseDir}" "${stageName}"`,
);
if (!existsSync(zipPath)) pause('zip not produced', `expected ${path.relative(repoRoot, zipPath)}`);

// A successful retry supersedes any prior honest pause packet.
rmSync(path.join(evidenceDir, 'pause-packet.json'), { force: true });

// --- 7. Inventory ------------------------------------------------------------
const zipSize = statSync(zipPath).size;
const stageSize = dirSizeBytes(stageDir);
log('');
log('BUNDLE OK');
log(`  staged folder : ${path.relative(repoRoot, stageDir)}  (${mb(stageSize)})`);
log(`  zip           : ${path.relative(repoRoot, zipPath)}  (${mb(zipSize)})`);
log(`  exe           : SlackPad.Host.exe`);
log(`  game          : GameDist/index.html + assets`);
log('  first run     : extract, double-click SlackPad.Host.exe, plant two fingers, F11 = fullscreen');
