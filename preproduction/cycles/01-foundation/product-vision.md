# Product Vision — SlackPad 360

**Status:** Cycle-1 normative product brief
**Access date:** 2026-07-10
**Labels:** **confirmed fact** | **inference** | **recommendation** | **hypothesis** | **unresolved**

---

## 1. One-line fantasy

Two fingers on a laptop trackpad are two feet on a board: plant, pop, flick, catch, grind, and string lines through a compact plaza with the immediacy of fingerboarding and the exploration of arcade skate games.

---

## 2. Fantasy and emotional pillars

| Pillar | Meaning | Player-facing proof |
| --- | --- | --- |
| **Tactile feet** | Contacts feel like feet, not a cursor | Ghost feet + board response match pad motion |
| **Expressive initiation** | Forgiving gesture opens a maneuver (Skate Flick-It philosophy) | Failed timing still readable; recognition feedback |
| **Owned consequences** | Approach, speed, catch, land, rail contact, bail remain player-owned | Bad line fails honestly; assist does not auto-clear gaps |
| **Line flow** | Immediate restarts and readable obstacles invite “one more line” | Sub-2 s respawn; plaza loops without loading |
| **Professional clarity** | Detailed board/shoe/plaza readable on a laptop screen | No “ugly on purpose” graphics strategy |

**Philosophical references (inspiration only — no IP copy):**

- EA skate. “Get Control” / Flick-It: gestural board control, catch assists culture — https://www.ea.com/games/skate/skate/news/get-control (**confirmed fact** that EA documents stick-based flick control; **not** a license to copy systems).
- Tony Hawk’s Underground 2 culture: dense skatable spaces, line creativity, session energy (**inference** from franchise design reputation; no proprietary content reuse).

---

## 3. Audience

| Segment | Need | Cycle-1 priority |
| --- | --- | --- |
| Laptop skate/fingerboard curious | Novel control fantasy, short sessions | Primary |
| Skate-game veterans | Fair physics + combo expression | Primary for feel gates |
| Accessibility-sensitive players | Assist levels, reduced click rate, remappable stance | Required options |
| Competitive leaderboard / agent trainers | Deterministic replay, inject API | Architecture required day one |
| Pure web-only players (no install) | Cannot get dual-foot trackpad stream | **Non-audience for core product** (**confirmed fact**: browser gap; see input research) |

**Target session:** 5–15 minutes typical; 30–45 minute deep session optional (**hypothesis** until ergonomics playtests).

**Target hardware class:** Windows 11 laptop with Precision Touchpad (research machine: Synaptics-class I2C HID `VEN_06CB` observed 2026-07-10 — **confirmed fact** local PnP; dual-foot stability **unresolved** until P0).

---

## 4. Core loop

```
Spawn / reset → Cruise & carve plaza → Spot line → Approach speed/angle
  → Pop / flip / spin → Catch → Land or bail → Optional grind → Score juice
  → Immediate reset or continue line → Session end / replay theater
```

**Micro-loop (seconds):** push → steer → trick → land.
**Meso-loop (minutes):** invent and refine a plaza line.
**Macro-loop (sessions):** unlock assist confidence, cosmetic board deck, optional challenges — **progression-light**, not RPG grind.

---

## 5. Progression-light sandbox

**Recommendation:** First ship is a **single compact skate plaza** with:

- Optional challenge cards (score, combo, gap, grind time) — not gated story missions.
- Cosmetic unlocks only after G2 feel gate (decks, grip tape, shoe colors).
- No multiplayer, no open world, no career city map in v0.

**Non-goals (explicit):**

| Non-goal | Why |
| --- | --- |
| Microscopic rigid-body fingerboard sim | Unfair micro-fails; wrong fantasy |
| Full trick encyclopedia at launch | Scope and recognizer risk |
| Pure canned animation trick select | Kills ownership and agent honesty |
| Pure browser dual-foot on Windows | API gap (**confirmed fact**) |
| Copy Skate/THUG2 code, art, levels, brands | Legal and creative integrity |
| AAA parity marketing claim | Unfalsifiable; see §7 measurable bars |
| Always-on online services | Offline-first Windows product |

---

## 6. Failure and recovery

| Failure | Player experience | Recovery |
| --- | --- | --- |
| Bail (bad land / missed catch / rail faceplant) | Readable tumble + brief camera settle | Auto or one-click reset to last spawn / trail checkpoint |
| False pop | Telemetry + optional HUD flash | Threshold tune; never silent wrong trick |
| Grind slip | Slide off rail to air or bail | Soft snap default; balance meter |
| Off-map / stuck | Soft kill volume | Instant respawn at plaza spawn |

**Recommendation:** Bails are **cinematic but short** (≤1.5 s to control return). Frustration from long death animations is a design bug.

---

## 7. What “physics at least at Skate or THUG2 quality” means

**Do not** interpret as AAA feature parity, animation budget, or online services.
**Do** interpret as **measurable game-feel bars** for a hybrid arcade-sim skate controller:

| Bar ID | Measurable criterion | Method | Pass |
| --- | --- | --- | --- |
| **PQ-1 Continuity** | Ground speed does not discontinuously teleport from gesture alone | Recording + board velocity series | No pose set by recognizer |
| **PQ-2 Interruptibility** | Collision mid-trick can cancel assist targets within 1 physics step of contact impulse over threshold | Scripted wall hit golden | Maneuver cancelled / bail path |
| **PQ-3 Landing fairness** | After 10 min tutorial, n≥5 playtesters median ollie land success ≥50% at Assist 1 | Protocol E2 | ≥50% |
| **PQ-4 Agency** | Playtesters rate “I caused the trick” ≥4/5 median at Assist 1 | Survey | ≥4/5 |
| **PQ-5 Failure clarity** | ≥80% of bails show correct primary reason tag in post-bail UI (over-rotate, pitch, impact, grind) | Telemetry vs human label | ≥80% |
| **PQ-6 Grind skill band** | Tutorial rail: soft snap Assist 1 → ≥50% entry success in 10 approaches; Assist 0 lower but >0 | Protocol E5 | Band holds |
| **PQ-7 Combo ownership** | Approach speed and direction for gap clear from player cruise, not auto-boost | Golden: insufficient speed fails gap | Fail without speed |
| **PQ-8 Deterministic feel tools** | Same ContactFrame recording yields same trick events on two runs | G4 | Match |

**THUG2-like exploration bar (product, not physics engine):**

| Bar ID | Criterion | Method |
| --- | --- | --- |
| **EX-1** | ≥3 distinct line loops in plaza without loading | Design review + path graph |
| **EX-2** | New player finds a second line within 5 min free skate | Playtest |
| **EX-3** | Verticality: at least one bank/QP path and one stair/rail path | Level checklist |

---

## 8. Accessibility and assistance modes

| Mode | Assist | Intent |
| --- | --- | --- |
| **0 Precision** | Minimal catch damping; soft snap off or tight | Experts, agent skill ceiling |
| **1 Standard (default)** | Soft catch cone; soft grind snap; moderate flip quantize optional | Target ship feel |
| **2 Casual** | Wider catch; stronger snap; slightly larger land cone | Onboarding, fatigue reduction |

Additional options (**recommendation**):

- Reduced flick speed thresholds
- Hold-push without click for accel
- Swap feet / stance without restart
- Colorblind-safe rail/highlight hues
- Motion reduce (camera shake off)
- Foot ghosts always-on toggle

---

## 9. Success definition for first ship

1. G1–G4 pass on target laptop class.
2. v0 trick set playable and combinable in one plaza.
3. Professional visual bar met under G5 budget (not deferred forever).
4. Agent API and replay path green (G6).
5. Players describe it as “finger skate” not “broken mouse game” in open comments.

---

## 10. Open product questions → experiments

See `open-questions.md` **OQ-PROD-01**, **OQ-FEEL-01**, and **OQ-ERG-01**. Do not claim ergonomics comfort or “fun” without G2.
