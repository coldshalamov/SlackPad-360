# World, UI, and Audio Spec — Cycle 2

**Access date:** 2026-07-10
**Extends:** cycle-1 world-ui-audio-spec without editing it

---

## 1. Plaza world

| Element | Vertical slice | First ship |
| --- | --- | --- |
| Footprint | One compact module (~40–80 m span hyp) | Same + density |
| Line loops | ≥1 enjoyable | ≥3 |
| Rails | ≥1 grindable | Multiple heights |
| Ledges / curbs | ≥1 | Modular set |
| Stairs | Optional | Required |
| Bank / QP | Optional | Required |
| Checkpoints | 1 respawn | Multiple |
| Kill planes | Yes | Yes |
| Art quality | Proxy OK if flagged | Professional materials + lighting |

Collision tags: `ground`, `grindable`, `ledge`, `trigger_checkpoint`, `kill`.

---

## 2. UI / HUD (minimal)

| Element | Purpose |
| --- | --- |
| Speed (optional subtle) | Feedback |
| Trick name toast | Scoring only after outcome |
| Stance / feet diagram | Calibration + teach |
| Assist level | 0–2 |
| Pause / settings | Input, audio, accessibility |
| Debug (dev) | ContactFrame dots, phase, FPS |

No score-gated free skate. No skill tree required for first ship.

### Onboarding

1. Stance select (regular/goofy)
2. Hand-angle calibrate
3. Plant both → push
4. Ollie
5. First grind

---

## 3. Accessibility

- Assist level 2
- Colorblind-safe rail highlights option
- Remappable UI keys (not feet)
- Reduce camera motion option
- Subtitles for tutorial text

---

## 4. Audio policy

| Bus | Content | License rule |
| --- | --- | --- |
| Board | roll, push, pop, catch, land, bail | CC0/original/project-owned |
| Grind | metal scrape loop | CC0 candidate Freesound 655371 (verify at download) |
| Surface | concrete/wood swaps | |
| Ambience | soft outdoor | opt-in level |
| UI | clicks | |
| Music | **opt-in only**; licensed or original — no unlicensed tracks | |

**This cycle:** no audio binaries downloaded (auth/friction). Catalog candidate recorded. Implementation pass acquires with full provenance.

---

## 5. Input theater

Optional translucent pad overlay showing two contacts and kick flash — training only, toggleable.
