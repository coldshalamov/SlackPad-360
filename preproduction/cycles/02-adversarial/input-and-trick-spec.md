# Input and Trick Spec — Cycle 2 Adversarial

**Status:** Normative revision of cycle-1 input/trick contract
**Access date:** 2026-07-10
**Schema:** `research/probes/contact-frame.schema.json` v1 (unchanged)
**ContactFrame pipeline:** sole path for hardware, agent, replay, synthetic

---

## 1. ContactFrame (unchanged)

Adapters emit ContactFrame v1. Foot roles live in `InputProfile`, not in the frame. Agent injects frames only — never `ManeuverSpec` or pose.

---

## 2. Primitive vocabulary

| Primitive | Definition | What matters | Continuous vs categorical |
| --- | --- | --- | --- |
| **plant** | tip false→true | **Occurrence** + position | Edge event; position continuous |
| **lift** | tip true→false | **Occurrence** + last position/velocity | Edge event |
| **click/kick** | primary false→true | **Occurrence** + plant mask + timing window | Discrete intent |
| **slow translate** | both plant, low speed midpoint motion | **Direction + magnitude** | Continuous board force/lean |
| **slow rotate** | both plant, segment yaw rate | **Direction + magnitude** | Continuous steer |
| **flick** | free-foot short high-speed path + stop/lift | **Direction + magnitude + timing** | Categorical open + continuous ω scale |
| **sweep** | free-foot longer arc / yaw path | **Direction + integrated angle + timing** | Categorical shuv-like + continuous |
| **catch/replant** | tip down during air/catch window on foot slots | **Occurrence + timing**; position within **catch volume** (generous) | Discrete assist damp |
| **sustained bias** | held offset from rest while planted | **Direction + duration + magnitude** | Continuous push/lean |

### 2.1 Magnitude / direction / duration / timing / occurrence matrix

| Primitive | Magnitude | Direction | Duration | Timing | Occurrence alone |
| --- | --- | --- | --- | --- | --- |
| plant | — | — | — | pairs with kick | **Yes** |
| lift | exit speed optional | — | — | prep for pop | **Yes** |
| kick | — | — | — | window with plant | **Yes** |
| slow translate | **Yes** | **Yes** | while held | — | No |
| slow rotate | **Yes** | **Yes** | while held | — | No |
| flick | **Yes** (ω scale) | **Yes** (heel/toe) | short | in air window | No |
| sweep | integrated | **Yes** | medium | in air window | No |
| catch | soft | — | window length | after pop | **Yes** + volume |
| sustained bias | **Yes** | **Yes** | **Yes** | — | No |

---

## 3. Recognition policy

### 3.1 Confidence

Each categorical recognition emits:

```
{ label, confidence: 0..1, contributors: [...], openStep, expireStep }
```

Open maneuver only if `confidence ≥ c_enter` (hypothesis 0.55).
Stay open while `confidence ≥ c_exit` (hypothesis 0.40) — **hysteresis**.

### 3.2 Hysteresis and cancellation

| Event | Effect |
| --- | --- |
| New stronger label same family | Replace if confidence higher by margin δ (hyp 0.15) |
| Collision / bail threshold | Interrupt assist; physics continues |
| Dual lift mid-recognition | Hold logical feet predict; cancel if both lost > timeout |
| Player opposite flick | May reverse ω target within clamp |
| Ground contact during air assist | Land check overrides flip assist |

### 3.3 Conflicts (v0)

| Conflict | Winner | Feedback |
| --- | --- | --- |
| Push vs ollie | Nose prep lift + tail plant + kick → ollie; both plant + kick → push | HUD micro-icon optional |
| Flick vs steer | Flick only if air window open or free foot lifted with pop | Ignore flick on ground |
| Shuv vs flip | Dominant free-foot axis: lateral=flip, yaw/arc=shuv | Thresholds hypothesis |
| Boardslide entry vs air shuv | If grind candidate + lateral board yaw near rail → grind path | |
| Catch vs grind regrab | Phase exclusive | |
| Failed recognition | No silent success: small “no-trick” tele + audio tick optional | Never auto-pick wrong trick for scoring without state |

### 3.4 Failed-recognition feedback

- No score popup for false tricks
- Board still responds continuously to slow motion
- Optional coach ring if N consecutive failed intended pops (hypothesis)
- Adaptive calibration: only thresholds in profile; **limits** ±20% from defaults without developer unlock

### 3.5 Discrete intent vs continuous outcome

| Layer | Owns |
| --- | --- |
| GestureFSM | Discrete labels + windows |
| BoardController | Bounded impulses/torques from ManeuverSpec |
| Rapier | Continuous pose, collisions, fails |
| Scoring | Names outcomes from board state history |

Recognition **must not** teleport board to “perfect kickflip pose.”

---

## 4. Adversarial attack on cycle-1 v0 sequences

| Sequence | Ambiguity / ergonomic cost | Cycle-2 mitigation |
| --- | --- | --- |
| Push hold vs push pulse | Both accelerate; accidental clicks | Separate continuous plant force vs pulse; false-pop suppress option |
| Ollie prep lift | Fatigues finger if long hold | Short prep OK; motion lookback; optional longer explicit prep fallback |
| Kickflip vs heelflip | Axis after hand angle | padYawOffset calib + larger deadzone fallback |
| Shuv vs flip | Shared free-foot motion | Axis dominance + confidence hysteresis |
| 50-50 only | Sideways grind desired | Boardslide first-ship; 50-50 slice-first |
| Catch mm precision | Impossible with fat fingers | Catch **volumes**, not shoe mesh contact |
| Both+click push forever | Advanced may want ollie | Profile `bothClickMeans` |

---

## 5. Minimum enjoyable launch vocabulary

### 5.1 Vertical slice (post-G1)

Push, steer, ollie, nollie, kickflip, heelflip, FS/BS shuv 180, catch, land, bail, **50-50 grind family**.

### 5.2 First ship additions

**Boardslide / lipslide family** (sideways board yaw into rail), expanded plaza lines. Manuals/powerslides/reverts still post-ship unless G2 demands one.

---

## 6. Failure and partial outcomes (must not be undefined)

| Situation | Behavior | Assist role |
| --- | --- | --- |
| Partial flip | Board keeps ω; scoring “under/over rotated” | Assist may quantize toward nearest full flip only at assist≥2 and only if within cone |
| Missed catch | No catch damp; landing harder; possible deck hit bail | Assist 0–1 light upright bias only if within upright cone |
| Upside-down foot plant | Plant contacts accepted; if deck inverted beyond fail cone → bail | No magic flip-up unless assist 2 recovery window |
| Over/under rotation | Land on wrong face → bail or ugly stick; score penalty | Cones define “clean” vs “dirty” vs bail |
| Rail collision bad angle | Bounce/scrape; no auto grind | Grind latch requires approach envelope |
| Bail | Enter BAIL state; board free-ish tumble with damping; checkpoint respawn | Clear player-readable fail |

**Assisted but defined:** every failure path has a state, telemetry event, and recovery.

---

## 7. Visual feet vs required finger precision

| Concern | Policy |
| --- | --- |
| Shoe mesh contact | **Cosmetic** |
| Catch success | Board-local **catch volumes** at nose/tail (hypothesis radius ~0.12–0.18 m playable scale) |
| Foot animation | Procedural attach to volumes / board sockets; lerp during air |
| Player skill | Timing + direction of flick/kick, not millimeter shoe alignment |
| Upside-down catch | Allowed if volume hit and phase open; may be dirty land |

---

## 8. Stance and push rule

- Both planted + grounded → continuous forward force along board +Z, speed-capped
- Both + kick → push pulse (default)
- Regular/goofy flips nose/tail binding
- Soft recenter when still

---

## 9. Adaptive calibration limits

Allowed auto-adjust (within session, logged):

- flickSpeedMin, pop lookback L, catch window W: ±20% of defaults
- Not allowed without explicit user: stance invert, assist level change, mapping invert

---

## 10. Agent / replay

Same primitives derived from ContactFrames. No `forceTrick("kickflip")` API.
