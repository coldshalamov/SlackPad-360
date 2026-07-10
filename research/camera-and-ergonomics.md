# Camera and Ergonomics

**Access date:** 2026-07-10

Labels: **confirmed fact** | **inference** | **recommendation** | **hypothesis** | **unresolved**

---

## 1. Ergonomics of two-finger trackpad control

### 1.1 Natural placement

**Inference (biomechanics / common laptop use):**

- **Right-handed players** often rest the right hand’s index and middle fingers on the lower-center of the pad, wrist on palm rest or floating.
- **Left-handed players** mirror; some still use right hand on pad if keyboard hand differs.
- Index and middle are preferred over index+ring for precision and reduced abduction strain.

**Recommendation:** Default assume **index = forward-role candidate**, **middle = rear-role candidate** after stance bind—not hard-coded to nose/tail until calibration.

### 1.2 Clickpad hinge mechanics

**Confirmed fact** (Microsoft PTP / haptic docs):

- **Mechanical click-pads** hinge (often top-hinged): click force and feel vary by press location (stiffer near hinge).
- **Haptic pads** do not move; host/device-driven vibration simulates click; more uniform.

**Implications:**

| Issue | Risk | Mitigation |
| --- | --- | --- |
| Click location bias | Players avoid top of pad | Map gameplay to full pad; don’t require edge clicks |
| Two-finger click | May be harder than one-finger click | Allow pop with one plant + click; both+click = push |
| Fatigue from deep clicks | Wrist strain | Prefer short click pulses; avoid holding click for power |
| Accidental click while steering | False pops | Deadzone: require intentional pop posture (lift prep) or click+context |

### 1.3 Arm fatigue

**Hypothesis:** Sessions >15 minutes with elevated wrist / two-finger precision may fatigue forearm extensors and shoulder if chair/desk height wrong.

**Recommendation:**

- Encourage forearm support in onboarding copy.
- Avoid requiring high-frequency micro-flicks for basic movement (cruise should be calm holds).
- Provide **assist level** and **reduced flick speed thresholds** accessibility options.
- Playtest protocol includes 15-minute fatigue self-report (0–5).

### 1.4 Handedness × stance matrix

| Hand | Stance | Typical mapping after calib |
| --- | --- | --- |
| RH | Regular | Index nearer nose-side after rotate; middle tail |
| RH | Goofy | Same fingers; stance swaps nose/tail binding |
| LH | Regular / Goofy | Mirror pad roles; same stance rules |

**Recommendation:** Always offer **Swap feet** and **stance toggle** without restarting the app. Camera does not flip automatically with stance (optional mirror mode later).

### 1.5 Natural hand angle vs pad axes

Players rarely align fingers parallel to pad Y. Segment angle at rest may be 20–40° off “vertical.”

**Recommendation:** Calibration captures **rest segment angle** as zero-yaw offset so relaxed plant = straight board in local mapping.

---

## 2. Input orientation models

| Model | Definition | Pros | Cons |
| --- | --- | --- | --- |
| **Screen-relative** | Pad up = screen up | Intuitive for cursors | Breaks when camera orbits; fights chase cam |
| **Camera-relative** | Pad up = camera look projected | Good for twin-stick shooters | Board game needs board alignment; confuses flip directions |
| **Board-relative** | Pad axes mapped through stance to board nose/tail/toe/heel | Matches feet-on-deck mental model | Needs calibration; camera independent |

**Recommendation:** **Board-relative** continuous mapping is the production default. Camera-relative only for optional “arcade steer” assist mode. Screen-relative only for UI.

---

## 3. Camera options

### 3.1 Comparison

| Camera | Description | Lines/gaps | Tricks readability | Grinds | Motion sickness | Recommendation |
| --- | --- | --- | --- | --- | --- | --- |
| **Chase (high)** | Far behind, high | Good paths | Board flips small | OK | Low | Secondary |
| **Low three-quarter chase** | Behind, low, slight side bias | Excellent | Excellent | Good | Medium | **Default** |
| **Side** | Orthographic-ish profile | Poor depth | Excellent flip profile | Weak | Low | Training / replay |
| **Overhead** | Top-down | Excellent rails | Poor flips | Excellent | Low | Optional assist toggle |
| **Nose cam** | On-board | Immersive | Poor overall | Hard | High | Do not default |
| **Fixed freecam** | User orbit | Debug | Debug | Debug | N/A | Editor / photo |

### 3.2 Default camera behavior

**Recommendation — Low three-quarter chase:**

- Position: behind board by ~3–5 board lengths, height ~1.2–1.8 m equivalent, slight lateral offset opposite turn.
- Look-at: board position + velocity look-ahead (0.15–0.35 s).
- FOV: ~50–60° vertical (cinematic but readable).
- Collision: spring arm push-in on walls; never clip underground.
- Air: slight pull-back and tilt-up to show flip; return on land.
- Grind: bias overhead blend 10–20% for rail alignment without full top-down.
- Landing: damp camera shock; no violent snaps (unfair feel).

### 3.3 Camera vs input

**Recommendation:** Camera **never** rewrites foot→board mapping mid-trick. If player orbits camera in photo mode, gameplay mapping stays board-relative.

---

## 4. Calibration UX (minimum)

1. **Handedness** (optional auto: first two plants).
2. **Stance** regular/goofy.
3. **Rest pose** capture (2 s hold).
4. **Click test** (3 clicks).
5. **Ollie practice** gated room.
6. Save profile to local storage / user config.

---

## 5. Ergonomics & camera test protocol

### 5.1 Setup

- Same chair/desk as intended play.
- Record ContactFrames + camera mode.
- 5 participants preferred (mix handedness if possible).

### 5.2 Tasks (each 2–3 minutes)

| ID | Task | Metric |
| --- | --- | --- |
| E1 | Hold both contacts, gentle steer S-curves | Tracking error, fatigue 1–5 |
| E2 | 20 ollies | Success rate, false pops |
| E3 | 10 kickflips | Success, over/under rotate |
| E4 | Gap jump line | Camera occlusion complaints |
| E5 | Rail approach grind | Alignment difficulty |
| E6 | 15 min free skate | Fatigue, numbness, pain report |

### 5.3 Camera A/B

For E4–E5, swap default vs side vs overhead; forced-choice preference + objective clear time.

### 5.4 Abandon thresholds

- ≥40% of testers report pain ≥3/5 in E6 → redesign mapping / reduce click force dependence.
- Default camera preferred by &lt;30% → change default.
- Cannot complete E2 after tutorial → grammar/thresholds fail (not only camera).

---

## 6. Unresolved

- Optimal rest-angle auto-calibration algorithm stability across pad sizes (**hypothesis**).
- Whether haptic vs mechanical click changes pop timing distributions (**unresolved** until device survey).
- Left-hand-on-pad + right-hand-on-keyboard hybrid (likely out of scope for v1).

## 7. Follow-up ergonomics evidence

HCI/ISO-backed fatigue, posture, and click-load discussion moved to **`ergonomics-evidence.md`** (2026-07-10 follow-up). This file retains camera A/B and placement matrix; prefer the evidence doc for claim labeling.
