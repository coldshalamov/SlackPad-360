# World, UI, and Audio Spec — Cycle 1

**Access date:** 2026-07-10

---

## 1. Plaza design goals

Compact, exploration-rich, modular, performance-aware.

### Required features (v0 plaza)

| Feature | Count / notes |
| --- | --- |
| Flat cruise pads | ≥2 connected zones |
| Stairs | ≥1 set with grindable hubba optional |
| Ledges | ≥2 heights |
| Rails | ≥2 (one straight tutorial, one kinked or down) |
| Banks | ≥1 |
| Quarter pipe or mini ramp | ≥1 |
| Gap | ≥1 clearable at mid speed + ollie |
| Line loops | ≥3 distinct closed or figure paths (EX-1) |
| Recoverable falloff | soft kill → respawn |
| Spawn | safe flat facing first line |
| Tutorial affordances | ghost arrows / soft highlights, dismissible |

### Layout principles

- Sightlines from spawn show at least one rail and one bank.
- Failure drops player to flat, not soft-lock pits.
- Modular tiles: 4–8 m modules for streaming later (single GLB OK for milestone).
- Collision proxies simpler than visual mesh.

### Performance modularity

- One plaza package < ~25 MB compressed target (**hypothesis**).
- Instanced repeat props.
- LODs on perimeter buildings.
- No interior rooms in v0.

---

## 2. Spawn and reset

| Action | Behavior |
| --- | --- |
| Initial spawn | Plaza spawn transform + zero vel |
| Soft reset | Last grounded checkpoint ring |
| Hard reset | Plaza spawn |
| Bail auto | Checkpoint default |
| Out of bounds | Soft reset |

Checkpoint rings: invisible sensors on major flats; last-triggered stored.

---

## 3. UI / HUD

### In-run HUD (minimal)

| Element | Default |
| --- | --- |
| Score / combo | on |
| Trick name toast | on (fade 1 s) |
| Balance meter | only in grind |
| Speed | optional off |
| Foot ghosts | toggle; on during tutorial |
| Assist interventions | debug/prototype on; ship optional “input theater” |
| FPS | debug only |

### Menus

- Main: Free Skate, Challenges, Calibration, Settings, Replay
- Pause: resume, reset, settings, quit
- Settings: assist, camera mode, audio, a11y, input thresholds presets

### Onboarding

See `game-design-spec.md` beats; UI steps with skip.

### Calibration screens

Dual-foot diagram, rest capture progress, click test checklist, success confirmation.

### Replay / input theater

- Playback ContactFrames → same sim path
- Ghost feet overlay
- Timeline scrub for debug builds

### Accessibility UI

- High contrast HUD option
- Larger text
- Reduce motion
- Colorblind rail highlight modes
- Hold-to-push emphasis (reduce click dependency copy)

---

## 4. Visual feedback for gestures and assists

| Event | Feedback |
| --- | --- |
| Recognized pop | Brief toast + subtle deck squash juice |
| Flip label | Name when categorical lock |
| Catch success | Soft damp VFX (restrained) |
| False suppress | Optional debug flash only |
| Snap volume near rail | Edge highlight ramp-in |
| Assist catch damping | Telemetry; optional “assist” pip in theater mode |

Never spam full-screen flashes.

---

## 5. Audio design

### Categories

| Bus | Content |
| --- | --- |
| Board | roll loop (speed pitch), push scuff |
| Surface | concrete / metal / wood variants |
| Impacts | land soft/hard, bail |
| Tricks | pop, flip whoosh (light), catch slap |
| Grind | metal loop + grit; exit chirp |
| UI | soft clicks, success stingers |
| Ambience | plaza air, distant city low |
| Music | optional; **policy:** licensed or original only; default off or low bed |

### Music policy

- v0: ambience primary; music opt-in.
- No unlicensed commercial tracks.
- CC0 / original / properly licensed only; ledger in `assets/catalog`.

### Implementation notes

- ≤32 voices budget (`technology-and-assets.md`).
- Distance attenuate grind/roll.
- Determinism: audio may desync cosmetically; **must not** drive gameplay RNG.

### Candidate SFX sources (catalog before use)

- Kenney UI/sounds CC0: https://kenney.nl/
- Freesound: per-file license check — https://freesound.org/

---

## 6. Verification

| Requirement | Method |
| --- | --- |
| ≥3 line loops | Path graph design review |
| Tutorial completion | Playtest protocol |
| HUD clutter | 15 min free skate complaint rate |
| Audio license | catalog entry per file |
| Respawn <2 s | Telemetry |
