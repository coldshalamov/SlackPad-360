# Control Grammar — Primitives, States, Gestures, Stance

**Access date:** 2026-07-10
**Philosophy:** EA Skate “Flick-It”: steering and flip/board adjustments via gestural flicks; forgiving recognition triggers rich maneuvers while player focuses on lines (EA skate. control guide, 2025-09-16). Adapted to **two trackpad contacts = two feet**, not dual analog sticks.

Labels: **confirmed fact** | **inference** | **recommendation** | **hypothesis** | **unresolved**

---

## 1. Separation of concerns

| Axis | What it answers | Independent of |
| --- | --- | --- |
| **Handedness** | Which physical hand rests on the pad; index vs middle roles | Stance, camera |
| **Stance** | Regular (left foot forward) vs goofy (right foot forward) | Handedness, camera |
| **Pad orientation** | Which pad edge is “nose-forward” after calibration | Camera |
| **Camera orientation** | How the player views the 3D world | Pad axes (after mapping) |
| **Board heading** | World yaw of the deck | Input pad space |

**Recommendation:** Never bake “screen up = board nose.” Always: pad sample → calibrate → stance bind → board-relative forces → world.

---

## 2. Input primitives

Primitives are **what the hardware adapter guarantees** after normalization.

| Primitive | Type | Definition | Source |
| --- | --- | --- | --- |
| `contact` | Continuous + discrete lifecycle | Finger on pad: id, x, y, tip | HID tip + coords |
| `lift` | Event | tip 1→0 for a tracked id | Tip switch |
| `plant` | Event | tip 0→1 or re-down after lift | Tip switch |
| `move` | Continuous | Δx, Δy, velocity of contact | Differentiated X/Y |
| `kick` | Trigger event | Rising edge of Button 1 (primary click) | Report-level button |
| `flick` | Categorical gesture | Short high-velocity path then lift or stop | Derived |
| `sweep` | Categorical gesture | Longer arc / sustained lateral or yaw motion | Derived |
| `hold` | Continuous state | Contact planted with speed below threshold for duration | Derived |
| `catch` | Triggered window action | Re-plant during air + optional click within catch window | Derived + rules |

### Continuous vs discrete vs categorical

| Kind | Examples | Notes |
| --- | --- | --- |
| **Continuous controls** | Contact positions, segment yaw rate, push pressure proxy (plant count + hold), grind lean | Drive physics every step |
| **Triggered events** | `kick`, `lift`, `plant`, `catch` edge | Open recognition windows |
| **Categorical gestures** | ollie, nollie, kickflip, heelflip, shuvit, push-stride | Labels for scoring + assist mode select |
| **Quantized modifiers** | Spin 0/180/360 buckets; flip 0/1/2 rotations | Optional post-recognize quantize for fairness |

**Recommendation:** Core movement continuous; trick **initiation** categorical-from-rules; air **outcome** continuous physics with assist clamps.

---

## 3. Foot identity model

### 3.1 Layers

1. **Hardware contact ID** — opaque, stable while tip down (HID Contact Identifier).
2. **Pad role** — `padLeft` / `padRight` assigned by **calibration plant** (smaller pad-X = left, or user swap).
3. **Board foot** — `noseFoot` / `tailFoot` via stance:
   - Regular: left pad → nose, right pad → tail (if skater faces “into” pad forward)
   - Or after rotation calibration: user sets which pad contact is nose.

**Recommendation:** First-run wizard:

1. Place two fingers naturally.
2. Press “set stance” (regular/goofy).
3. Optional: rotate pad mapping 0/90/180/270 if laptop approach angle differs.
4. Confirm with on-screen foot ghosts.

### 3.2 Click identity

**Confirmed fact:** Click is not per-finger on PTP Button 1.

**Recommendation:** Pop ownership rules:

- If only tail planted → kick = tail pop (ollie family).
- If only nose planted → kick = nose pop (nollie family).
- If both planted → kick = **push pulse** or **prep** (not flip), configurable.
- If neither planted → kick ignored or grind hop (later).

---

## 4. Board contact segment (board-local / relative — not pad→world)

**Recommendation (follow-up sprint):** Do **not** map absolute pad coordinates to world position (finite pad→plaza teleport). Pad samples drive **board-local** quantities relative to a calibrated **rest pose**. See `input-attribution.md` §3.

When two tips down:

- **Midpoint delta / velocity vs rest** → lean and optional lateral force (not world XY teleport).
- **Segment angular velocity** (primary) / angle error vs rest → **yaw rate** steering.
- **Segment length vs rest** → stance width (lean/stability modifier).
- **Soft recenter** when both planted and nearly still; dual plant after dual lift redefines rest.

When one tip down:

- That foot is the **pivot plant**; other foot free for flick after pop.

When zero tips down:

- Board free in air / rolling with last velocity; no new ground steer until plant.

**Alignment with README:** Line between two contacts determines **heading control** (rate / relative), not absolute world pose from pad pixels; both accelerate when held; lift front with back planted → ollie; lift back with front planted → nollie; front flick contributes roll; motion during pop contributes pitch/roll/yaw.

**Nuance (recommendation):** Prefer **gesture-triggered assist** over pure continuous free-body for flips so failures are readable; continuous motion still **modulates** assist targets.

**Click→foot:** Report-level Button 1 attributed via planted-state rules (tail-only / nose-only / both), not hardware per-finger click — `input-attribution.md`.

---

## 5. Trick decomposition (physical → primitives)

| Trick family | Real / fingerboard idea | Primitive sequence | Assist |
| --- | --- | --- | --- |
| **Push** | Back foot push stroke | both plant + kick pulse OR rear sweep while front plant | Impulse along board forward |
| **Ollie** | Tail pop, slide front | tail plant, nose lift, kick in window, optional front slide | Vertical impulse + pitch |
| **Nollie** | Nose pop | nose plant, tail lift, kick | Same mirrored |
| **Kickflip** | Front flick **heelside** | ollie window + front lateral flick toward heels (heel-side edge) | Roll target + catch window |
| **Heelflip** | Front flick **toeside** | ollie + front heel flick toward toes | Roll target opposite |
| **Shuvit / 360 shuv** | Board yaw under feet | pop + yaw sweep of free or both feet | Yaw target quantize |
| **Body spin** | Skater yaw | reserved; may map from pad rotate both contacts while planted (carve) vs air (spin) | Careful conflict rules |
| **Catch** | Feet re-pin deck | plant(s) in air after flip threshold | Angular damping to level |
| **Grind** | Lock truck to rail | air→rail collision + low relative lateral vel | Snap + balance |
| **Bail** | Miss catch / bad land | timeout or bad up-vector / speed | Ragdoll / reset |

Fingerboarding note (**inference** from technique culture, not a formal standard): players already treat fingers as feet with pop + flick; SlackPad should feel like **Tech Deck immediacy** with game-scale lines.

---

## 6. Gesture recognition approach

### 6.1 Chosen method

**Recommendation:** **Rule-based temporal state machine + click-centered recognition windows.**

| Method | Pros | Cons | Use? |
| --- | --- | --- | --- |
| Rule FSM + windows | Explainable, calibratable, replayable, low latency | Hand-tuned thresholds | **Primary** |
| Template / DTW | Handles shape variation | Costly, harder to debug mid-air | Secondary for flicks later |
| Statistical / ML | Flexible | Opaque, data-hungry, nondeterministic risk | Offline research only until need proven |
| Pure continuous physics | “Realistic” | High fail rate, micro-optimization hell | Reject as sole model |

### 6.2 Click-centered windows

**Hypothesis:** Many players click slightly before/after ideal pop.

**Recommendation:** On `kick` rising edge:

- Look back 40–80 ms and forward 40–80 ms of contact state.
- Classify: push vs ollie vs nollie vs grind hop.
- Open **air trick window** (e.g., 250–400 ms) for flick/sweep classification.
- Then freeze categorical label; physics continues.

### 6.3 False positive control

| Conflict | Rule |
| --- | --- |
| Scroll vs steer | Native exclusive path; in browser mock, `preventDefault` where applicable |
| Push vs ollie | Require intentional nose lift velocity for ollie; both planted + kick = push |
| Flick vs steer | Flicks only valid in air trick window or with free foot lifted |
| Catch vs re-grab grind | Phase tags: GROUND / AIR / GRIND exclusive |
| Palm rejection | Honor HID Confidence; ignore non-confident contacts |
| Third finger | Ignore contacts beyond two gameplay feet (or map to camera later) |

### 6.4 Intensity

| Signal | Useful? | Recommendation |
| --- | --- | --- |
| Flick speed | Yes | Scales flip angular velocity within clamps |
| Click force / pressure | Rarely | Do not gate success; optional juice if stable |
| Pop timing quality | Yes | Affects height within min/max |
| Perfect land timing | Yes | Score/juice, not binary survival if within wide window |

**Recommendation:** Intensity improves **expression** and **score**, not basic success, until advanced difficulty toggles.

---

## 7. State machine (high level)

```
IDLE → GROUND_READY → PUSHING / CARVING
         ↓ kick+lift rules
       POP_WINDOW → AIR_TRICK → CATCH_WINDOW → LAND_CHECK
         ↓ rail
       GRIND_BALANCE → EXIT_AIR or BAIL
```

Phases emit telemetry events for observability (see `agent-observability.md`).

---

## 8. Calibration parameters (tunable, recorded in replay header)

| Param | Unit | Purpose |
| --- | --- | --- |
| `stance` | enum | regular / goofy |
| `padYawOffset` | deg | hand approach angle |
| `swapFeet` | bool | left/right pad swap |
| `plantSpeedEps` | 1/s | hold vs move |
| `flickSpeedMin` | 1/s | flick detect |
| `popLookbackMs` / `popLookaheadMs` | ms | kick window |
| `catchWindowMs` | ms | re-plant assist |
| `assistLevel` | 0–2 | snap strength |

---

## 9. Initial ship vocabulary (v0)

Must feel good before expanding:

1. Plant both / cruise
2. Steer (segment yaw)
3. Push (both + kick)
4. Ollie
5. Nollie
6. Kickflip & heelflip (one rotation)
7. Front/back shuv 180
8. Catch + land
9. Manual optional later
10. 50-50 grind on one rail

Scoring may name tricks from outcome; **control path** remains primitives → FSM → assist targets.

---

## 10. Alignment note vs pure continuous README wording

Root README emphasizes continuous forces and naming from resulting motion. Research **recommendation** refines this: continuous forces for **ground and modulation**; **categorical initiation** for flips so the game stays approachable (Skate philosophy). Record this refinement in `decisions.json` (DEC-GRAMMAR-HYBRID). Not a product vision rewrite—implementation strategy for fairness.

**Follow-up:** Relative board-local mapping and click attribution details live in `input-attribution.md` and `followup-decisions.json`.

---

## 11. Primary sources (grammar-relevant)

- EA skate. Flick-It control overview: https://www.ea.com/games/skate/skate/news/get-control (**confirmed fact** for franchise gesture philosophy; access 2026-07-10)
- Microsoft PTP contact ID / tip / button semantics (click is report-level): https://learn.microsoft.com/en-us/windows-hardware/design/component-guidelines/touchpad-windows-precision-touchpad-collection
- W3C Pointer Events (web multi-pointer model; not trackpad dual-feet): https://www.w3.org/TR/pointerevents3/
- Raw multi-touch trackpad web gap: https://github.com/w3c/pointerevents/issues/206
