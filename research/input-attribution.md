# Input Attribution — Click→Foot, Retracking, Relative Control

**Access date:** 2026-07-10
**Scope:** Follow-up to `input-feasibility.md` / `control-grammar.md`. No production code.

Labels: **confirmed fact** | **inference** | **recommendation** | **prototype hypothesis** | **unresolved**

---

## 1. Report-level click → logical foot

### 1.1 Hardware ground truth

**Confirmed fact** (Microsoft PTP collection + Buttons report-level usages):

- Integrated click is **Button 1** (Usage Page `0x09`, Usage `0x01`), reported at **report level**, not inside a contact collection.
- Button down means activation force crossed threshold (mechanical hinge or pressure-pad / haptic threshold); button up when force falls below threshold.
- Contact tip can remain down while button toggles; button can also fire with **zero capacitive contacts** (non-finger press).
- Buttons 2/3 are external discrete clicks when present—not “which finger.”

**Confirmed fact:** Per-contact **Pressure** and report-level **Mechanical Force** are **optional** PTP fields. Core gameplay cannot require them.

Therefore hardware **never guarantees** “this click belongs to contact ID N.”

### 1.2 Signal inventory

| Signal | Guaranteed on PTP class? | Device-specific? | Can attribute click→foot? |
| --- | --- | --- | --- |
| Button 1 rising edge | Common on clickpads; optional in HID table | Implementation type varies | Trigger only; no foot ID |
| Contact tips + IDs + X/Y at click | Mandatory if dual feet planted | — | **Best guaranteed basis** via planted-state rules |
| Contact count at click | Mandatory | — | Disambiguates 0/1/2-plant cases |
| Confidence bit | Mandatory | Accidental-contact policy varies | Filter palm/large objects |
| Scan Time | Mandatory | Rate varies | Align click with contact history |
| Click **location** (which pad region) | **Not** a separate field; use contact X/Y of planted feet | Hinge bias on mechanical pads | Heuristic: nearest contact to hinge or force centroid |
| Motion ±40–80 ms around click | Derived from X/Y stream | — | Velocity/prep for pop vs push |
| Per-contact pressure | Optional | Many pads omit | Only if capability probe finds stable signal |
| Mechanical force (total) | Optional | Often omit | Global intensity only; not foot ID |
| Calibration profile | Application | — | Stance/swap/rest-angle bind roles before attribution |

### 1.3 Viable attribution methods (ordered)

#### Method A — Planted-contact state machine (**primary, guaranteed-signal path**)

**Recommendation:** Attribute using **which feet are planted**, not which finger “clicked.”

| At click rising edge | Attribution | Maneuver family |
| --- | --- | --- |
| Only **tail** planted (nose tip 0) | Kick → **tail foot** | Ollie pop |
| Only **nose** planted | Kick → **nose foot** | Nollie pop |
| **Both** planted | Kick → **push pulse** (neither flip pop) or prep flag | Push / carve |
| **Neither** planted | Ignore or grind hop (later) | — |
| One planted but tip ambiguous | Use last tip-down within lookback window | **prototype hypothesis** |

**Evidence base:** Report-level Button 1 + mandatory tip/X/Y (**confirmed fact**). Mapping tip→nose/tail after stance is application logic (**recommendation**).

#### Method B — Spatial click association (device-agnostic heuristic)

When both planted: assign pop ownership to contact with **higher downward prep velocity** in lookback, else **rear-most along board axis** (stance-space Y).

| Variant | Rule | Label |
| --- | --- | --- |
| Nearest to pad bottom (user-forward) | Mechanical hinge often top; bottom freer | **prototype hypothesis** |
| Force centroid | Only if pressure/mechanical force present | Device-specific |
| Higher pressure contact | Optional pressure | Device-specific |

**Do not** use Method B alone when Method A is decisive.

#### Method C — Motion window around click

**Recommendation:** On Button 1 edge, open lookback/lookahead (e.g. 40–80 ms) on ContactFrames:

- Nose lift velocity high + tail plant → ollie even if tip timing slightly off click.
- Both low velocity + both plant → push.

**Label:** Window lengths are **prototype hypothesis** (tune in P1/P4).

#### Method D — Pressure / mechanical force

**Recommendation:** Probe in P0; if absent or noisy, **never gate success**. If stable:

- Mechanical force edge correlates with Button 1 (sanity).
- Optional pop *height intensity* within clamps.
- **Not** foot identity (sum force has no per-foot identity unless per-contact pressure exists and is reliable).

#### Method E — Explicit calibration

**Recommendation:** First-run: user plants only left, only right, both, then clicks thrice in each posture. Store:

- `stance`, `swapFeet`, `padYawOffset`
- Preferred pop foot for “both planted + click” (push vs ollie preference)
- Optional “click with both means push” hard rule

### 1.4 What is **not** viable as guaranteed

| Approach | Why it fails |
| --- | --- |
| Hardware “which finger clicked” | Not in PTP button model (**confirmed fact**) |
| Screen pixel under cursor | Trackpad click is pad-local; cursor may be unrelated |
| Assuming pressure always present | Optional field |
| Assuming hinge position always top | OEM-dependent; haptic pads have no hinge |

### 1.5 Committed attribution stack

1. Capability flags from device (`hasPressure`, `hasMechForce`, `buttonType`).
2. Method A rules (always).
3. Method C windows (always).
4. Method B only when A is both-planted and design wants flip from both+click (**hypothesis**: default both+click = push).
5. Method D optional juice.
6. Method E profile overrides.

---

## 2. Contact reassignment after dual lift

### 2.1 Problem

HID **Contact Identifier** is stable while a contact is reported, then **may be reused** after lift (**confirmed fact**, PTP Contact ID semantics). After both fingers leave and return, IDs can swap relative to left/right pad roles → wrong nose/tail if bound only to raw ID.

### 2.2 Deterministic foot-tracking algorithm (**recommendation**)

Maintain soft state separate from HID IDs:

```
LogicalFoot ∈ { padLeft, padRight }  →  BoardFoot ∈ { nose, tail } via stance
```

**On each frame:**

1. **Active set** = contacts with `tip && confidence`.
2. **Match** new/active HID IDs to logical feet with cost:

\[
cost(i,f) = w_p \|p_i - \hat{p}_f\|^2 + w_v \|v_i - \hat{v}_f\|^2 + w_s S(i,f)
\]

- \(\hat{p}_f\): last position of foot \(f\), or **ballistic predict** \(p + v\Delta t\) if recently lifted (hold predict ≤150–250 ms — **hypothesis**).
- \(S\): soft prior that `padLeft` prefers smaller pad-X (after `padYawOffset`).
- Hungarian / greedy bipartite match for ≤2 contacts (deterministic: sort by cost, lock lowest, no random).

3. **Birth:** unmatched tip-down → assign free logical slot by pad-X order (leftmost → padLeft) if both free; if one free, remaining slot.
4. **Death:** tip-up → mark foot `lifted`, freeze last \(p,v\), keep predict timer.
5. **Dual lift timeout:** if both lifted > \(T_{reset}\) (e.g. 400–600 ms — **hypothesis**), clear predict; next dual plant uses **spatial order only** (not last IDs).
6. **Ambiguity:** if costs within ε, prefer stance rest-pose distance from calibration; if still tied, prefer previous binding until clear separation (**deterministic tie-break:** lower HID id).
7. **Never** rebind mid-air during an open trick window unless both contacts lost (**recommendation**).

### 2.3 Explicit recalibration triggers

- User presses “rebind feet.”
- Contact count ≥3 confident (palm) → ignore extras.
- Sustained crossed match (left pad-X > right for >N frames) → optional auto-swap prompt, not silent swap mid-line (**recommendation**).

### 2.4 What P0 must log

- HID id sequence vs logical foot binding across dual lift cycles.
- Swap rate without algorithm vs with algorithm (synthetic + human).

---

## 3. Relative / board-local control (replace pad→world teleport)

### 3.1 Why finite pad→world fails

**Inference:** Pad is a few cm; world is meters. Mapping absolute pad X/Y to world XZ teleports the skater to the pad rectangle, fights camera, and breaks when fingers recentre. AbsoluteTouch-style “pad = screen” is a **cursor** model, not a **skate** model (see `reuse-audit.md`).

**Recommendation:** **Board-local / relative control**. Pad is a **relative force/gesture surface**, not a finite world map.

### 3.2 Control model

| Domain | Meaning |
| --- | --- |
| Pad sample | \(u,v \in [0,1]^2\), tip, buttons |
| Logical feet | After tracking + stance → nose/tail in **board frame** |
| Continuous ground | Segment **yaw rate**, **push**, **lateral lean** from foot motions **relative to rest pose** |
| World pose | Integrates from physics (Rapier), not from absolute pad coords |

**Rest pose:** Calibrated dual-plant midpoint and segment angle = zero steer / zero lean. Motions are **deltas from rest** or **velocities**, not absolute world targets.

### 3.3 Recentering

| Mechanism | Behavior | Label |
| --- | --- | --- |
| Soft rest attract | When both planted and speed of contacts low for \(t_{hold}\), slowly redefine rest to current plant | **recommendation** |
| Explicit recenter | Double-tap both or UI control resets rest | **recommendation** |
| Lift recenter | On dual plant after dual lift, set rest = first stable dual sample | **recommendation** |
| Never hard snap board | Rest changes do not teleport board | **recommendation** |

### 3.4 Pad-edge behavior

| Issue | Policy |
| --- | --- |
| Finger hits pad rim | Clamp position; do not invent world motion from clamp; optional light haptic/juice |
| Edge crawl seeking more range | Soft recenter when velocity ~0 at edge (**hypothesis**) |
| One finger slides off | That foot lifts; other remains plant (tracking rules) |

### 3.5 Steering

- **Primary:** Angular velocity of the two-contact segment in pad space → board yaw rate (after stance transform).
- **Secondary:** Midpoint lateral velocity → carve lean / slight lateral force.
- **Not:** Absolute segment angle as absolute world heading (unless “assist lock” tutorial mode).

### 3.6 Foot repositioning (on deck)

- Sliding a planted contact changes **foot placement offsets** on the virtual deck (affects pop lever, grind balance) without moving world origin.
- Large reposition with low board speed = “setup”; with high speed = steer/lean. Threshold **hypothesis**.

### 3.7 Alignment with prior README

Root README “line between contacts determines heading” remains valid as **desired heading rate / relative heading**, not “pad coordinates equal plaza coordinates.” Update control-grammar hybrid wording accordingly (this sprint).

---

## 4. Closing: P0 measurements vs playtest-deferred

### P0 must measure (block production content)

1. Dual contacts + independent tip with stable IDs (existing G1).
2. Button 1 edges **simultaneous** with 0/1/2 planted contacts; CSV of tips + button.
3. Presence/absence of per-contact pressure and mechanical force.
4. After dual lift + dual plant ×20: does raw HID id order swap? (drives retracking need).
5. Continuous free dual-plant (not only pan/zoom) on Win11 pointer path vs Raw Input.

### Can wait until playtesting

- Exact lookback ms for Method C.
- Soft recenter time constants.
- Whether both+click should ever mean ollie.
- Pressure-based intensity curves.
- Fatigue after 15 minutes (see `ergonomics-evidence.md`).

---

## Primary sources

- https://learn.microsoft.com/en-us/windows-hardware/design/component-guidelines/touchpad-windows-precision-touchpad-collection
- https://learn.microsoft.com/en-us/windows-hardware/design/component-guidelines/touchpad-buttons-report-level-usages
- https://learn.microsoft.com/en-us/windows-hardware/design/component-guidelines/touchpad-sample-report-descriptors
