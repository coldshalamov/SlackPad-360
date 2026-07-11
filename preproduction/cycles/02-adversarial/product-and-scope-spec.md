# Product and Scope Spec — Cycle 2

**Status:** Committed product intent with slice vs ship separation
**Access date:** 2026-07-10
**Preserves:** root README fantasy; cycle-1 product vision

---

## 1. Product fantasy (must survive)

SlackPad 360 is a **Windows-first** 3D skateboarding/fingerboarding game.

| Pillar | Norm |
| --- | --- |
| Feet | Two trackpad contacts = two feet |
| Kick/pop | Physical click is discrete kick/pop primitive |
| Other primitives | Lift, plant, relative motion, flick, sweep |
| Push | Board accelerates while both feet planted (ergonomic push rule) |
| Stance | Regular and goofy; foot swap supported |
| Feel target | Defensible browser-rendered analogue of **Skate-style gestural initiation** + **THUG2-style compact line exploration** |
| Not | Microscopic fingerboard simulator |
| Not | Canned trick menu / animation playlist |
| Recognition | May commit **interruptible maneuver envelope** |
| Physics truth | Collision, approach, catch, landing, grind entry, under/over-rotation, failure still matter |
| Look | Intentional, professional; low-detail kits prove layout only |
| Agents | Same ContactFrame pipeline; **no** direct pose/trick calls |

**Claim class:** Product intent = **recommendation** from project charter; not empirically proven fun (**unresolved** until G2).

---

## 2. Audience and platform

| Field | Value | Label |
| --- | --- | --- |
| Primary platform | Windows 11 laptop with Precision Touchpad | Confirmed product constraint |
| Secondary | Future packaging (Electron) only if host needs | Recommendation |
| Browser-only dual foot | Rejected for human play | Confirmed research |
| Input skill | Learnable in short tutorial; depth in lines | Hypothesis until G2 |

---

## 3. Scope layers (critical separation)

### 3.1 P0 — Hardware truth (no content)

Prove dual-contact ContactFrame stream on target device.

### 3.2 Vertical slice (post-G1)

Minimum enjoyable loop:

- Push, steer/carve
- Ollie, nollie
- Kickflip, heelflip (heelside/toeside)
- Front/back shuv 180
- Catch, land, bail
- **One grind family first:** 50-50 (easier approach angle)
- One small modular plaza blockout (Kenney OK for layout)
- Hero board/shoes may still be proxy meshes **labeled non-final** if Blender not yet run

### 3.3 First ship

Everything in vertical slice **plus**:

- **Boardslide family** (sideways yaw into grind) — user intent
- Professional materials/lighting path with approved runtime assets
- Detailed hero board + unbranded shoes
- Expanded plaza loops (≥3), rails, ledges, stairs, bank, QP
- Full onboarding, audio bed, accessibility baseline
- Assist levels 0–2 exposed

### 3.4 Explicit non-goals (first ship)

- Open-world city / career mode encyclopedia
- Full skater humanoid simulation
- Online multiplayer
- Controller-primary product (may exist later as alt adapter emitting ContactFrames)
- Brand licensed decks/shoes graphics

---

## 4. Boardslide decision

| Question | Decision | Label |
| --- | --- | --- |
| Must first vertical slice include boardslide? | **No** — 50-50 first | Recommendation |
| Must first ship include boardslide? | **Yes** | Recommendation (C2-BOARD-SLIDE-SCOPE) |
| Why not slice? | Sideways entry raises rail latch false-fail rate before G2 | Inference |
| Why ship? | User explicitly wants turning sideways into grind | Confirmed product intent |

---

## 5. Quality bars (surviving cycle 1, refined)

Physics/feel bars PQ-1..PQ-8 and exploration EX-1..EX-3 from cycle 1 remain.
**Change:** Do not claim release confidence from formative `n≥5` alone (see evidence levels).

| Bar | Meaning |
| --- | --- |
| Continuity | Slow motion continuous; fast motion categorical without hard stop |
| Interruptibility | Collisions and player input can break assist envelopes |
| Landing fairness | Assisted cones, not free-for-all or magnet-to-perfect |
| Failure clarity | Bail reads as player-caused when possible |
| Grind skill band | Entry requires approach skill; assist does not auto-snap from arbitrary pose |
| Determinism tools | Replays and goldens exist |

---

## 6. Performance vs quality policy

**Do not** permanently lower the visible-quality target to hit FPS.
Use budgets, LOD, meshopt, KTX2, and plaza density control. Proxy art may be temporary and must be labeled.

---

## 7. Success definition for cycle 2 itself

Cycle 2 succeeds if planning + assets + gates are execution-ready — **not** if the game is fun. Fun is G2.
