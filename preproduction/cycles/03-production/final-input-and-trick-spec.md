# Final Input and Trick Spec

**Status:** Normative
**Schema:** `research/probes/contact-frame.schema.json` v1
**Pipeline:** ContactFrame is the sole path for hardware, agent, replay, synthetic

---

## 1. ContactFrame contract

Adapters emit ContactFrame v1 JSON. Foot roles live in `InputProfile`, not in the frame.
Agent injects frames only — never `ManeuverSpec`, pose, or `forceTrick`.

### 1.1 Logical feet

| Field | Rule |
| --- | --- |
| Max plants | 2 logical feet (nose/tail by stance) |
| ID reassignment | On dual lift or timeout, rebind by spatial heuristics; log event |
| Stance | Regular/goofy flips nose/tail binding |
| Hand angle | `padYawOffset` calibration maps pad axes → board local |

---

## 2. Primitive vocabulary

| Primitive | Definition | Occurrence vs continuous |
| --- | --- | --- |
| plant | tip false→true | Occurrence + position |
| lift | tip true→false | Occurrence + exit velocity optional |
| click/kick | primary false→true | Occurrence + plant mask + timing |
| slow translate | both plant, low speed midpoint | Direction + magnitude continuous |
| slow rotate | both plant, segment yaw rate | Direction + magnitude continuous |
| flick | free-foot short high-speed path | Direction + magnitude + timing (categorical open + ω scale) |
| sweep | free-foot longer arc/yaw | Integrated angle + timing |
| catch/replant | tip down in catch window on volumes | Occurrence + volume hit |
| sustained bias | held offset while planted | Direction + duration + magnitude |

### 2.1 Recognition occurrence vs intensity-dependent output

| Layer | Owns |
| --- | --- |
| GestureFSM | Discrete labels + confidence windows (occurrence of intent) |
| BoardController | Intensity → impulse/ω scale within clamps |
| Rapier | Continuous pose, collisions, fails |
| Scoring | Names outcomes from board state history |

Recognition **must not** teleport the board to a perfect trick pose. Intensity scales envelopes; collisions can still fail the trick.

---

## 3. Recognition policy

```
{ label, confidence: 0..1, contributors, openStep, expireStep }
```

- Open if `confidence ≥ c_enter` (**hypothesis** 0.55)
- Stay open while `confidence ≥ c_exit` (**hypothesis** 0.40) — hysteresis
- Replace same-family label if new confidence higher by margin δ (**hypothesis** 0.15)

All thresholds live in `InputProfile` / `SimConfig` and are tunable; do not hard-code as physics laws.

### 3.1 Conflicts (v0)

| Conflict | Winner | Feedback |
| --- | --- | --- |
| Push vs ollie | Nose prep lift + tail plant + kick → ollie; both plant + kick → push | Optional HUD micro-icon |
| Flick vs steer | Flick only if air window or free foot lifted with pop | Ignore flick on ground |
| Shuv vs flip | Dominant free-foot axis: lateral=flip, yaw/arc=shuv | Thresholds hypothesis |
| Boardslide entry vs air shuv | Grind candidate + lateral board yaw near rail → grind path | Phase exclusive |
| Catch vs grind regrab | Phase exclusive | |
| Failed recognition | No silent score success | Continuous control remains |

---

## 4. Device-mode matrix (binding)

| Mode / condition | Supported | Behavior |
| --- | --- | --- |
| Precision Touchpad dual contacts | Target | Free dual-plant required for G1 |
| Report-level Button 1 | Yes | Kick edge; not per-finger |
| Spatial click zones | Advisory only | Never sole authority for foot kick |
| Tap-to-click | Profile toggle | May generate primary; suppress false pop option |
| Clickpad (physical buttons) | Supported if Button 1 visible | Same kick FSM |
| Haptic-only feedback | Optional | Not required for control |
| Single contact only | Degraded | Tutorial prompt; no dual-foot claims |
| 3+ OS contacts | Clamp to 2 logical | Log drop |
| No pressure/force | Expected | Do not require force for pop |
| Dual lift mid-trick | Predict brief; cancel if timeout | ID reassignment event |
| Win11 pointer pan/zoom-only stream | Co-spike | Accept only if free dual-plant proven |
| Raw Input HID 0x0D/0x05 | Production ranking primary | Until pointer proves free dual-plant |
| Browser system trackpad dual-foot | Rejected for human product | Dev synthetic only |

### 4.1 Click attribution (plant mask)

| Plant mask at kick | Default mapping |
| --- | --- |
| Tail only | Ollie pop path |
| Nose only | Nollie pop path |
| Both | Push pulse (`bothClickMeans` profile; advanced may map to ollie) |
| None | Ignore or soft suppress |

---

## 5. Trick grammar (first ship)

| Trick | Primitives / sequence | Notes |
| --- | --- | --- |
| Push | Both plant + continuous forward / both+kick pulse | Speed capped |
| Steer | Both plant slow rotate / lean translate | Board local |
| Ollie | Tail plant, nose lift prep, kick, air | Pop impulse + pitch bias |
| Nollie | Nose plant, tail lift, kick | Mirrored |
| Kickflip | Pop + free-foot **heelside** flick | ω about board long axis |
| Heelflip | Pop + free-foot **toeside** flick | Opposite sign |
| FS/BS shuv 180 | Pop + free-foot sweep yaw | 180 target; 360 deferred |
| Catch | Replant into catch volumes during air/catch window | Generous volumes |
| Land | Ground contact + upright cone | Clean/dirty/bail |
| Bail | Fail cone / hard collision / inverted deck | Readable fail state |
| 50-50 | Approach along rail, trucks on rail, small yaw | Slice-first grind |
| Boardslide | Sideways yaw entry, deck on rail | First ship required |

---

## 6. Stance, calibration, adaptive limits

- Regular/goofy invert nose/tail binding
- Soft recenter when still
- Auto-adjust allowed ±20% of defaults: flickSpeedMin, pop lookback, catch window
- Not auto without user: stance invert, assist level, mapping invert

---

## 7. Failure and partial outcomes

| Situation | Behavior |
| --- | --- |
| Partial flip | Keep ω; score under/over rotated |
| Missed catch | No catch damp; harder land |
| Over/under rotation | Dirty land or bail by cone |
| Bad rail angle | Bounce/scrape; no auto grind |
| Bail | BAIL state, damping, checkpoint respawn |

Every failure has state + telemetry; never undefined.
