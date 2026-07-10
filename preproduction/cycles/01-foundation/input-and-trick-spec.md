# Input and Trick Spec — Normative Contract

**Status:** Cycle-1 normative
**Access date:** 2026-07-10
**Schema reference:** `research/probes/contact-frame.schema.json` (v1)
**Research basis:** `control-grammar.md`, `input-attribution.md`, `trick-primitive-matrix.md`, `input-feasibility.md`

---

## 0. Claim classes (read this first)

| Class | Meaning | Example |
| --- | --- | --- |
| **Guaranteed hardware** | Specified by PTP/Windows contract when device is PTP-class | Contact ID, X/Y, tip, scan time, contact count; Button 1 if present |
| **Inferred intent** | Application interprets signals | “Player wants ollie” |
| **Tunable threshold** | Numeric gate, recorded in profile/replay header | `flickSpeedMin` |
| **Categorical trigger** | FSM fires discrete maneuver open | `POP_OLLIE` |
| **Bounded continuous modifier** | Scales intensity within clamps | flick speed → roll ω target |
| **Playtest-only hypothesis** | Must not ship as fixed truth without measurement | 60 ms pop lookback |

---

## 1. Normative ContactFrame (v1)

Adapters (hardware, agent, replay, synthetic) **must** emit this shape. Foot roles are **not** in the frame.

```json
{
  "schemaVersion": 1,
  "frameId": 0,
  "tPerfMs": 0.0,
  "tScanUs": null,
  "source": "hardware",
  "contacts": [
    {
      "id": 1,
      "tip": true,
      "x": 0.42,
      "y": 0.61,
      "confidence": true,
      "pressure": null,
      "width": null,
      "height": null
    }
  ],
  "buttons": {
    "primary": false,
    "secondary": false,
    "auxiliary": false
  },
  "meta": {
    "deviceId": "optional-string",
    "contactCountRaw": 2
  }
}
```

### Field norms

| Field | Norm | Class |
| --- | --- | --- |
| `x`,`y` | float 0–1; (0,0) top-left pad space (PTP convention) | Guaranteed after normalize |
| `tip` | surface contact | Guaranteed (tip switch) |
| `id` | stable while contact alive; may reuse after lift | Guaranteed while down |
| `confidence` | intentional contact | Guaranteed field; policy app-side |
| `tPerfMs` | host monotonic ms | Host guarantee |
| `tScanUs` | HID scan × 100 µs if available | Optional hardware |
| `buttons.primary` | kick/click (Button 1) | Common; not per-finger |
| `pressure` / size | optional | Device-specific |

**Batching:** Multiple frames per physics step allowed; consume ordered by `(tPerfMs, frameId)`.

**Primary sources:** Microsoft PTP collection — https://learn.microsoft.com/en-us/windows-hardware/design/component-guidelines/touchpad-windows-precision-touchpad-collection

---

## 2. Signal inventory

### 2.1 Guaranteed / class-level (PTP)

- Per-contact: ID, X, Y, Tip, Confidence (**confirmed fact**, MS docs).
- Report: Scan Time, Contact Count (**confirmed fact**).
- Button 1 report-level, **not** per-contact (**confirmed fact**, buttons report-level usages).

### 2.2 Not guaranteed

- Per-finger click identity.
- Pressure, width, height, azimuth, mechanical force.
- Browser multi-contact absolute pad stream for system trackpad (**confirmed fact**: PE3 does not provide dual-foot trackpad feet; issue history + Edge pan collapse — research).

### 2.3 Application-derived

| Derived | From | Class |
| --- | --- | --- |
| `plant` / `lift` edges | tip 0↔1 | Inferred edge |
| Contact velocity | Δx,Δy / Δt | Derived continuous |
| Segment angle / yaw rate | two plants | Derived continuous |
| `kick` edge | primary false→true | Trigger |
| `flick` / `sweep` | path geometry + speed | Categorical |
| Foot roles nose/tail | tracker + stance | Inferred |

---

## 3. Logical foot tracker

### 3.1 Layers

```
HID contact id  →  logical padLeft/padRight  →  board noseFoot/tailFoot (stance)
```

`InputProfile` (not in ContactFrame): `stance`, `swapFeet`, `padYawOffset`, thresholds.

### 3.2 Match algorithm (**recommendation**)

On each frame with ≤2 confident tips:

1. Cost for pairing contact i to logical foot f:
   `w_p‖p−p̂‖² + w_v‖v−v̂‖² + w_s·spatialPrior`
2. Greedy lock lowest costs (deterministic; n≤2).
3. Birth: free slot by pad-X order after yaw offset.
4. Death: tip up → lifted; ballistic predict ≤150–250 ms (**hypothesis**).
5. Dual-lift >400–600 ms (**hypothesis**): clear predict; next dual plant spatial-only.
6. **No mid-trick rebind** while trick window open unless both contacts lost.
7. Tie-break: previous binding, then lower HID id.

### 3.3 Click → foot attribution (**normative**)

Hardware cannot name which finger clicked. Attribute on **primary rising edge**:

| Planted state | Attribution | Maneuver family |
| --- | --- | --- |
| Tail only | Kick → tail | Ollie pop |
| Nose only | Kick → nose | Nollie pop |
| Both | Kick → **push pulse** (default) | Push / prep |
| Neither | Ignore (or future grind hop) | — |

Always combine with motion lookback/lookahead window (**hypothesis** default 60 ms either side; tune in P1/P4).

**Sources:** https://learn.microsoft.com/en-us/windows-hardware/design/component-guidelines/touchpad-buttons-report-level-usages

---

## 4. Relative board-local control (normative)

**Reject** finite pad→world position teleport (AbsoluteTouch-style).

When two tips down:

| Signal | Maps to |
| --- | --- |
| Segment angular velocity vs rest | Steer yaw rate |
| Segment angle error vs rest | Soft straighten / lean |
| Midpoint velocity vs rest | Lateral lean / slight side force |
| Length vs rest | Stance width stability modifier |
| Both hold low speed | Soft recenter rest pose |

When one tip: planted = pivot; free foot may flick in air window.
When zero tips: no new ground steer; coast/air physics.

**Edge behavior:** Clamp foot offsets in board-local deck space; sliding along pad edge does **not** teleport board in world. Optional edge haptic/visual warning.

**Recentering:** Soft blend rest when both planted and nearly still for `recenterHoldMs` (**hypothesis** ~250–400 ms). Dual plant after dual lift redefines rest.

---

## 5. Gesture state machine (normative phases)

```
IDLE
  → GROUND_READY (one or two plants, grounded board)
  → PUSHING / CARVING (both plant + motion rules)
  → POP_WINDOW (kick+lift pattern; duration ~ lookback+lookahead+pop)
  → AIR_TRICK (categorize flick/sweep; freeze label; physics continues)
  → CATCH_WINDOW (re-plant damps ω)
  → LAND_CHECK → GROUND_READY | BAIL
  → GRIND_BALANCE (from air/rail latch) → EXIT_AIR | BAIL
```

Phases emit telemetry events: `pop`, `trick_recognized`, `catch`, `land`, `bail`, `grind_enter`, `grind_exit`.

### 5.1 Click-centered recognition

On `kick` rising edge:

1. Snapshot plant mask + velocities over [t−L, t+L].
2. Classify push vs ollie vs nollie.
3. If pop: open **air trick window** W (**hypothesis** 250–400 ms) for flick/sweep.
4. Lock categorical trick label; continuous modifiers already applied to `ManeuverSpec`.
5. Physics never paused solely for recognition.

### 5.2 False-positive policy

| Conflict | Rule |
| --- | --- |
| OS scroll/pinch vs game | Native exclusive focus sink; P1 validation |
| Push vs ollie | Both plant + kick → push; nose lift + tail plant + kick → ollie |
| Flick vs steer | Flick only in AIR_TRICK or free-foot lifted with pop open |
| Shuv vs flip | Dominant free-foot axis: lateral → flip; yaw/circular → shuv (**hypothesis** thresholds) |
| Catch vs grind regrab | Phase exclusive GROUND/AIR/GRIND |
| Palm / third finger | Ignore `confidence=false`; ignore contacts beyond 2 gameplay feet |
| High ground speed + accidental click | Optional suppress pop if no lift prep (**hypothesis**) |

---

## 6. v0 gesture sequences (exact)

Notation:

- `T` = tail foot, `N` = nose foot
- `↓` plant, `↑` lift, `•` hold, `→` move, `⚡` kick primary edge
- Times are **hypotheses** unless marked measured
- Board outcome is hybrid assist target, not canned animation sole authority

### 6.1 Push / accelerate

| Step | Sequence |
| --- | --- |
| 1 | `T↓ N↓` both planted |
| 2a | Hold both (speed < plantSpeedEps) → continuous push force along board forward **or** |
| 2b | `⚡` while both planted → push pulse impulse |
| Conflict | `⚡` + N↑ prep → prefer ollie over push |

### 6.2 Steer / carve

| Step | Sequence |
| --- | --- |
| 1 | `T↓ N↓` |
| 2 | Segment yaw rate vs rest → board yaw torque / rate |
| 3 | Optional midpoint offset → lean visual + slight carve |

### 6.3 Ollie

| Step | Sequence |
| --- | --- |
| 1 | Grounded; `T↓` |
| 2 | `N↑` or N slide toward nose + upward prep (lift velocity) |
| 3 | `⚡` within window while tail planted (Method A) |
| 4 | Enter POP_WINDOW → vertical + pitch impulse (tail offset) |
| 5 | Optional N slide modulates height/level |
| 6 | AIR_TRICK may stay “ollie only” if no flick |

### 6.4 Nollie

Mirror of ollie: `N↓`, `T↑`, `⚡` → nose pop.

### 6.5 Kickflip

| Step | Sequence |
| --- | --- |
| 1–4 | Ollie sequence opens air window |
| 5 | Free **nose** foot lateral **heelside** flick (short high speed + stop/lift) |
| 6 | Roll ω target heelside × speed (clamped); optional 1×360 quantize by assist |
| 7 | Catch required for clean (see §6.10) |

**Heelside definition (board-local):** toward heel edge after stance bind — **confirmed fact** for real kickflip direction from instructional sources (WikiHow Kickflip); pad axis after `padYawOffset` is **hypothesis** until P2.

### 6.6 Heelflip

As kickflip but nose flick **toeside** (opposite roll).

### 6.7 Front shuv 180 / back shuv 180

| Step | Sequence |
| --- | --- |
| 1–4 | Pop (ollie family default) |
| 5 | Yaw **sweep** of free foot or dual-contact yaw during window |
| 6 | Yaw ω target; quantize toward 180° (front vs back from sweep sign relative board) |
| 7 | Catch optional but recommended |

**360 shuv:** same with higher integrated yaw; **defer hard requirement** if recognition unstable — still allow continuous overspin with catch.

### 6.8 180 modifiers (body / board)

v0 scores **board yaw**. Cosmetic skater body may lag. Full body-varial pad signal is **unresolved** (see open questions); do not block shuv 180.

### 6.9 Catch

| Step | Sequence |
| --- | --- |
| 1 | Phase AIR; |ω| above epsilon **or** trick labeled |
| 2 | Re-plant N and/or T within catch window |
| 3 | Soft PD angular damping toward wheels-down (assist-scaled) |
| 4 | Optional `⚡` ignored or minor boost — **do not require click for catch** |

### 6.10 Landing / bail

| Outcome | Conditions (normative intent; numbers hypothesis) |
| --- | --- |
| Clean land | Ground contact + up-vector within **clean cone** + speed impact < soft max |
| Survive land | Within wider **survive cone**; no clean bonus |
| Bail | Outside survive cone, or vertical impact over hard max, or timeout unstable |

### 6.11 Bail (explicit)

Triggers: land fail, mid-air obstacle faceplant, grind balance break, interrupt collision. Emits `bail` with reason tag.

### 6.12 Initial grind family: 50-50

| Step | Sequence |
| --- | --- |
| 1 | Air (or recent pop) with board roughly aligned to rail |
| 2 | Truck detection volume contacts rail tag |
| 3 | Soft snap (Assist 1) toward centerline if within radius |
| 4 | Both trucks lock-ish; balance from midpoint lean / foot bias |
| 5 | Exit: jump (`⚡` or lift pattern) or end of rail or balance fail |

**Boardslide / 5-0:** deferred post-G2 (architecture may tag rails generically).

---

## 7. Conflict resolution table (v0)

| A | B | Winner | Rule |
| --- | --- | --- | --- |
| Push | Ollie | Ollie if nose lift vel > thresh else push | Method A+C |
| Nollie | Ollie | Which plant remains + kick attribution | Exclusive |
| Kickflip | Heelflip | Flick lateral sign | Exclusive |
| Flip | Shuv | Dominant axis of free-foot motion | Hypothesis thresholds |
| Steer | Flick | Flick only if air window or free foot | Phase gate |
| Catch | Early plant | Catch if AIR + ω | Phase |
| Grind | Manual | Rail tag proximity + height | Manual deferred |
| Dual flick noise | — | Require min path length + speed | Thresholds |

---

## 8. Calibration & stance

**First-run wizard (required):**

1. Handedness optional note.
2. Stance regular/goofy.
3. Natural dual plant 2 s → rest pose + padYawOffset.
4. Swap feet toggle.
5. Click test ×3 in tail-only, nose-only, both.
6. Confirm ghost feet on board diagram.

**Always available:** rebind feet, swap, stance, threshold presets (tight/standard/loose).

---

## 9. Default thresholds (hypotheses — record in replay header)

| Param | Default hypothesis | Unit |
| --- | --- | --- |
| `plantSpeedEps` | 0.15 | pad-norm / s |
| `flickSpeedMin` | 1.2 | pad-norm / s |
| `flickMaxDurationMs` | 120 | ms |
| `sweepMinDurationMs` | 100 | ms |
| `popLookbackMs` | 60 | ms |
| `popLookaheadMs` | 60 | ms |
| `airTrickWindowMs` | 320 | ms |
| `catchWindowMs` | 400 | ms |
| `recenterHoldMs` | 300 | ms |
| `dualLiftResetMs` | 500 | ms |
| `predictHorizonMs` | 200 | ms |

---

## 10. What must be measured (not guessed)

| Measure | Phase |
| --- | --- |
| Dual ID stability ≥60 s | P0 |
| Free dual-plant vs pan/zoom-only on Win11 path | P0-A |
| Button1 with plant count 0/1/2 | P0/P1 |
| ID reorder rate after dual lift | P0 |
| False pop rate | P4 / E2 |
| Flick axis after natural hand angle | P2/P5 |
| Threshold comfort | playtests |

---

## 11. Agent / replay invariant

Human hardware adapter, replay file, synthetic generator, and agent `injectContacts` share **one** pipeline into the foot tracker and FSM. Agent **must not** set foot roles, ManeuverSpec, or board pose.
