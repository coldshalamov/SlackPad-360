# Ergonomics Evidence — Two-Finger Trackpad Play

**Access date:** 2026-07-10
Prefer ISO / peer-reviewed / institutional guidance over pure intuition.

Labels: **confirmed fact** | **inference** | **recommendation** | **prototype hypothesis** | **unresolved**

---

## 1. Relevant standards and findings

### 1.1 ISO 9241 family (pointing devices)

**Confirmed fact:** ISO 9241 (ergonomics of human–system interaction) is the primary standards family for computer pointing devices. Design literature summarizing ISO 9241 for mice emphasizes:

- Wrists and forearms near **neutral** postures; avoid sustained extreme wrist extension and ulnar deviation.
- Prefer finger postures that are **slightly flexed**, not hyperextended.
- Device design should minimize static load on finger extensors and awkward holds.

Citation example: Lourenço et al., *Int. J. Environ. Res. Public Health* 2022, compile ISO 9241-derived mouse design requirements (neutral wrist, reduce finger extension strain) — https://pmc.ncbi.nlm.nih.gov/articles/PMC9265546/

**Inference for trackpad skate:** Two-finger continuous plant + frequent **click** resembles high-frequency buttoning; risk vectors are wrist extension over laptop edge, static finger abduction (index–middle spread), and click force repetition.

### 1.2 Trackpad-specific RSI narrative in literature

**Confirmed fact / reported:** Secondary literature on computer input notes trackpad use often involves a **flat, pronated** hand and repetitive click/drag, associated with overuse risk patterns (e.g. discussion of trackpad effects in Dhengre et al. 2024 review on mouse/RSI impact — https://catalog.lib.kyushu-u.ac.jp/opac_download_md/7236843/p1940-1955.pdf ).

**Label carefully:** Association ≠ measured SlackPad session risk; treat as **risk hypothesis** to playtest.

### 1.3 Centered input and shoulder load

**Confirmed fact (directional):** Studies comparing mouse placement find **centered** devices (in front of keyboard body midline) often reduce undesirable shoulder/forearm load versus extended side mouse (see industry whitepaper citing Dennerlein et al. ergonomics work; Mousetrapper summary PDF https://us.mousetrapper.com/wp-content/uploads/2021/09/220102_Mousetrapper_Whitepaper_Centered.pdf ).

**Inference:** Laptop trackpad is already **midline-centered** — good for shoulder vs side mouse — but encourages **neck flexion** toward screen if laptop is low.

### 1.4 Click force and hinge

**Confirmed fact (Microsoft PTP):** Mechanical click-pads have non-uniform feel by location; haptic pads give uniform click without hinge travel (PTP collection haptic section).
**Inference:** Deep mechanical clicks at high rate increase finger/wrist load vs light haptic clicks.

---

## 2. Natural placement, handedness, arm angle

| Topic | Evidence-based statement | Label |
| --- | --- | --- |
| Index + middle as primary digits | Common precision multi-touch pattern; ISO guidance favors slight flexion | **inference** from HCI pointing norms |
| Sustained finger abduction | Spreading fingers away from each other increases static load | **inference** from ISO neutral posture principles |
| Right-hand dominance prevalence | Most users will use dominant hand on pad | **inference** demographic; still support left |
| Arm angle to pad | Laptop pad below keyboard encourages wrist extension if elbows unsupported | **inference** from desk ergonomics practice + ISO neutral wrist |
| Resting heel of hand on chassis | Stabilizes aiming but may trigger palm rejection / confidence low | **prototype hypothesis** for this product |

**Recommendation:** Calibration wizard captures **natural dual plant** without forcing parallel-to-edge orientation; rest-angle offset absorbs arm approach angle (`control-grammar.md` / `input-attribution.md`).

**Recommendation:** Support left-hand play and stance independently (no forced RH-only).

---

## 3. Click fatigue mitigations

| Mitigation | Rationale | Label |
| --- | --- | --- |
| Prefer short click pulses, not held click for power | Reduces sustained force | **recommendation** |
| Push without click (hold both) as primary accel | Lowers click rate | **recommendation** |
| Assist levels reduce failed-pop spam | Fewer rage clicks | **recommendation** |
| Haptic-pad users: document lower force | Hardware variance | **recommendation** |
| Session break reminder after 15–20 min | Overuse risk hypothesis | **prototype hypothesis** |

---

## 4. Camera interaction and neck/eyes

| Issue | Guidance | Label |
| --- | --- | --- |
| Chase cam + pad eyes-down conflict | Player watches screen, hands on pad — standard; keep HUD sparse | **inference** |
| Fast camera yaw inducing disorientation | Prefer damped low three-quarter chase (prior research) | **recommendation** |
| Screen below eye level | Raise laptop or external monitor for long sessions | **recommendation** (general ergonomics) |
| Split attention pad surface vs 3D | On-screen foot ghosts reduce looking down at fingers | **recommendation** |

Prior camera choice (low three-quarter chase, board-relative input) remains; this doc adds **neck/eye** framing from general HCI posture guidance.

---

## 5. Test protocol (evidence-oriented)

Reuse E1–E6 from `camera-and-ergonomics.md`, adding:

- **Pain map:** wrist, finger, forearm, shoulder, neck (0–5) pre/post.
- **Click count** telemetry vs pain delta.
- **Handedness × stance** balanced if possible.
- Stop criteria: any pain ≥4/5 → stop session.

**Abandon product stance if** majority cannot complete 15 min without pain ≥3 after mapping mitigations — **prototype hypothesis** threshold for redesign (external controller hybrid).

---

## 6. What remains intuition (do not overclaim)

- Exact optimal index/middle spacing in mm for fingerboard metaphor.
- Optimal pad size class for skate game.
- Whether goofy skaters systematically prefer different finger roles.

Mark these **unresolved** until playtests.

---

## Primary sources

- https://pmc.ncbi.nlm.nih.gov/articles/PMC9265546/ (ISO 9241-informed mouse ergonomics)
- https://catalog.lib.kyushu-u.ac.jp/opac_download_md/7236843/p1940-1955.pdf (mouse/trackpad RSI discussion)
- https://learn.microsoft.com/en-us/windows-hardware/design/component-guidelines/touchpad-windows-precision-touchpad-collection (haptic vs mechanical click)
- https://us.mousetrapper.com/wp-content/uploads/2021/09/220102_Mousetrapper_Whitepaper_Centered.pdf (centered pointing load; secondary summary of ergonomics studies)
