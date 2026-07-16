# HUMAN_TEST — Sprint 02/03 Checkpoint 01 (≈10 minutes)

You are the instrument now. Agents measured everything they can measure —
lag, tracking error, silhouettes, probe batteries — and every gate passes.
**Whether it feels good is yours to say.** Notes go to
`preproduction/evidence/checkpoint-01/HUMAN_FINDINGS.md` (bullet points are
fine; blunt beats polite).

## 0. Launch (30 s)

1. Double-click `play.bat` (builds game + host, launches the native window).
2. Confirm the HUD shows **TRACKPAD LIVE** (real contacts, not the dev pad).
3. HUD bottom line shows `pitch [P] crisp` — preset readout + hotkeys work.

## 1. Steering floor (2 min)

- Plant two fingers, hold **Ctrl** to push, release, and just RIDE.
- **Ratchet a ~90° turn to the right**: rotate your finger line ~45°, lift,
  re-grip at neutral, rotate ~45° again. Then do the same to the left.
  *Expected: the board follows your fingers NOW, and the re-grip never snaps
  or drifts back.*
- **Standstill pivot**: stop completely, rotate your planted fingers.
  *Expected: the deck pivots in place, camera swings with it.*
- Carve a few S-turns at speed, then snap one hard 90° at speed.
  *Expected: slow rotation carves (speed survives); the hard snap powerslides
  and scrubs speed.*
- ❓ Does heading feel 1:1 with your fingers? Any mush left? Any twitchiness
  from tiny finger noise (see §5)?

## 2. Ride a lap (1 min)

- One lap of the park: push, carve, cross the funbox line if you like.
- ❓ Does the behind-the-board camera read the route? Is the follow tight
  without jitter at rest?

## 3. Ollies + nollies (2 min)

- ~20 ollies at various speeds: lift the TAIL finger, retap near its spot.
- A few nollies (lift + retap the NOSE finger).
- **Try soft vs hard taps deliberately** — they should feel IDENTICAL
  (fixed-strength pop by design; intensity is a gated future experiment).
- ❓ Does the pop read as tail-strike → rise → level → land? Latency
  complaints? Does the wood-hit accent + camera dip help or annoy?

## 4. Pitch presets (1 min)

- Press **P** to cycle `crisp → floaty → aggressive` (HUD shows the active
  one). Do a few ollies on each.
- ❓ Which preset should be the default? Write it down.

## 5. The wiggle question (1 min)

- Rest both fingers, jiggle them slightly WITHOUT meaning to steer, and watch
  the deck. Then make a tiny deliberate pre-tap adjustment and pop.
- ❓ Instruments show pre-tap finger motion now genuinely steers (that's the
  direct authority working). From real hands: is it responsiveness or
  twitchiness? Should tiny rotations get a micro-deadband?

## 6. Tricks + grinds quick pass (1.5 min)

- A few kickflips/heelflips (post-pop flick) and shuvs (post-pop sweep).
- One or two 50-50s on the ledge; try a boardslide if you're feeling brave
  (known knife-edge — Sprint 03 owns grind feel; a bail there is data, not
  failure).
- ❓ Do tricks read in motion without watching the HUD?

## 7. Record 3–5 labeled traces (1.5 min)

These seed the permanent corpus (`testdata/traces/README.md` has the naming
convention — rename the files after the session):

1. Press **R** (world resets, `● REC` appears) → do ONE behavior → press
   **R** again. Repeat for:
   - a slow left ratchet turn → `YYYYMMDD-turn-left-slow.trace.json`
   - a standstill 90° pivot → `…-pivot-standstill.trace.json`
   - a hard ollie → `…-hard-ollie.trace.json`
   - a kickflip attempt → `…-kickflip-attempt-1.trace.json`
   - ~30 s of neutral resting/jiggling (recognizer false-trigger data) →
     `…-neutral-resting-noise.trace.json`
2. Files land in `testdata/traces/` (or `Documents\SlackPad 360\traces` if
   the host isn't running from the repo — move them over). Commit them.

## If X feels wrong → tune Y (no code required)

All keys in `packages/shared/src/config.ts`; presets via HUD hotkeys.

| Feels wrong | Tune |
| --- | --- |
| Steering too eager / too lazy | `locomotion.steerDirectGain` (1.1) |
| Board trails fast rotations | `locomotion.steerTrackGain` (24), `steerServoGain` (180) |
| Carves scrub too much / slide too little | `locomotion.gripRate` (8), `gripSlipSpeed` (1.2) |
| Ollie shape wrong | press **P**; then edit `pop.pitchCurves` control points |
| Pop feels weak/strong | `pop.jMin/jMax` (trajectory), `pop.pitchTorqueScale` (snap) |
| Camera too close/far/side-on | `camera.chaseDistance` (2.2), `chaseSide` (−0.35) |
| Camera swings too fast/slow on pivots | `camera.headingRateDegPerSec` (240), `headingDeadbandDeg` (2) |
| Tail-strike accent too loud/soft | `PopSfx` volume in `packages/game/src/app/PopSfx.ts` (0.8) — SFX mapping is non-final by design |

## Done

Save findings to `preproduction/evidence/checkpoint-01/HUMAN_FINDINGS.md`,
commit the traces, and re-run the goal prompt from
`preproduction/final/SPRINT-RUNBOOK.md` — Sprint 04 fills its template from
your findings.
