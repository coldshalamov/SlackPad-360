# Final Product and Scope Spec

**Status:** Normative
**Authority:** Cycle 3 final package
**Access date:** 2026-07-10

---

## 1. Product fantasy (non-negotiable without evidence)

SlackPad 360 is a **Windows-first** 3D skateboarding/fingerboarding game.

| Pillar | Norm |
| --- | --- |
| Feet | Two trackpad contacts = two feet |
| Kick/pop | Physical click is discrete kick/pop primitive |
| Vocabulary | plant, lift, slow translation/rotation, flick, sweep, sustained bias, catch/replant |
| Continuous vs categorical | Slow motion continuous; fast gestures categorical intent |
| Stance | Regular/goofy + hand-angle calibration first-class |
| Maneuvers | Hybrid, interruptible: recognition commits intent/impulse envelopes |
| Physics truth | Collision, approach, catch, landing, grind entry, over/under-rotation, failure remain physical and observable |
| Visual body | Disembodied detailed shoes/feet + detailed unbranded board OK; full humanoid not required |
| Look | Professional tactile visuals; compact line-rich plaza; stable 60 FPS on target laptop class |
| Quality policy | **No permanent low-quality art strategy** |
| Grind | **50-50** in first vertical slice; **boardslide family** in first ship |
| Agents | Human hardware, replay, synthetic, agents share ContactFrame-derived pipeline; **no direct trick/pose API** |
| Host | Pure browser is **not** the human dual-foot product; native Windows + WebView2 owns hardware input |

---

## 2. Audience and platform

| Field | Value |
| --- | --- |
| Primary | Windows 11 laptop with Precision Touchpad |
| Secondary packaging | Electron only if WebView2 packaging fails |
| Browser-only dual foot | Rejected for human play |
| Target performance | Stable 60 FPS on target laptop iGPU class |

---

## 3. Scope layers

### 3.1 P0 — Hardware truth (no content)

Prove dual-contact ContactFrame stream (both adapters instrumented).

### 3.2 Vertical slice (post-G1)

Push, steer, ollie, nollie, kickflip, heelflip, FS/BS shuv 180, catch, land, bail, **50-50 grind**, small modular plaza (Kenney layout OK if labeled non-final), proxy board/shoes allowed if labeled.

### 3.3 First ship

Slice + **boardslide family**, professional materials/lighting with runtime-approved assets, hero board + unbranded shoes, expanded plaza (≥3 loops), rails/ledges/stairs/bank/QP, onboarding, audio bed, accessibility baseline, assist 0–2, packaged installer.

### 3.4 Non-goals (first ship)

Open-world city, career encyclopedia, full humanoid, multiplayer, controller-primary product, brand-licensed decks/shoes.

---

## 4. Success definition for implementation

**Done** = playable packaged first-ship scope meeting acceptance matrix — **not** a code scaffold.
Fun/fairness claims require G2 formative evidence. Dual-foot claims require G1 hardware evidence.
