# Input Feasibility — Trackpad Layers

**Access date:** 2026-07-10
**Target hardware context:** Windows laptop with Synaptics-class I2C HID touchpad (`VEN_06CB` observed on research machine).

Labels: **confirmed fact** | **inference** | **recommendation** | **hypothesis** | **unresolved**

---

## 1. Capability stack (summary)

```
┌─────────────────────────────────────────────────────────────┐
│ Application: ContactFrame adapter, gesture FSM, sim        │  ← designable
├─────────────────────────────────────────────────────────────┤
│ Browser / WebView JS: Pointer/Touch/Wheel — NOT dual feet  │  ← insufficient alone
├─────────────────────────────────────────────────────────────┤
│ Host process: Raw Input HID parse OR WM_POINTER frame API  │  ← required path
├─────────────────────────────────────────────────────────────┤
│ Windows PTP stack: HID digitizer touchpad TLC              │  ← capable
├─────────────────────────────────────────────────────────────┤
│ Hardware: multi-touch sensor + click mechanism             │  ← typically capable
└─────────────────────────────────────────────────────────────┘
```

---

## 2. Hardware capability

### 2.1 Observed on research machine

**Confirmed fact (local enumeration, 2026-07-10):**

- `HID-compliant touch pad` — Instance contains `VEN_06CB` (Synaptics vendor ID commonly used for Synaptics HID devices).
- `I2C HID Device` — `ACPI\VEN_06CB\...`
- Companion `HID-compliant mouse` collection from same vendor (expected PTP dual-mode mouse TLC).

### 2.2 Precision Touchpad class expectations

**Confirmed fact** (Microsoft PTP collection docs, updated 2026-05-01; sample descriptors 2024-01-29):

Windows Precision Touchpad devices report as HID Digitizer **Touch Pad** (Usage Page `0x0D`, Usage `0x05`).

**Per-contact (mandatory for PTP input):**

| Field | HID | Meaning for SlackPad |
| --- | --- | --- |
| Contact Identifier | `0x0D:0x51` | Persistent ID while contact alive |
| X | `0x01:0x30` | Absolute pad X (0,0 = top-left of pad) |
| Y | `0x01:0x31` | Absolute pad Y |
| Tip switch | `0x0D:0x42` | On surface vs lifted (plant/lift) |
| Confidence | `0x0D:0x47` | Intentional vs accidental/large contact |

**Report-level (mandatory):**

| Field | HID | Meaning |
| --- | --- | --- |
| Scan Time | `0x0D:0x56` | Relative time in **100 µs** units |
| Contact Count | `0x0D:0x54` | Contacts in this report |

**Buttons (optional but typical clickpad):**

| Field | Meaning |
| --- | --- |
| Button 1 | Integrated digitizer click (primary) |
| Button 2/3 | External buttons if present |

**Optional (do not design core gameplay to require):**

- Per-contact **Pressure** (`0x0D:0x30`)
- **Width/Height** bounding box
- **Azimuth**
- **Mechanical Force** (total force, Usage Page Sensor `0x20`, Usage `0x494` in docs)
- Latency mode feature, haptics (haptic pads have no mechanical hinge)

**Contact count maximum:** PTP should support **minimum 3**, maximum **5** concurrent contacts (**confirmed fact**, Microsoft device capabilities feature report guidance).

**Tip-switch lift semantics:** When tip clears, last (X,Y) should be held; independent contacts can lift at different times (**confirmed fact**, Microsoft lift example table).

**Button types:** click-pad (depressible), pressure-pad, or discrete-pad (**confirmed fact**).

### 2.3 Scan rate, latency, force

| Topic | Finding | Label |
| --- | --- | --- |
| Scan Time unit | 100 µs ticks; rolls over 16-bit | Confirmed fact |
| Report rate | Implementation-defined; many laptop pads target ~100–125 Hz class; not guaranteed by app without measurement | Unresolved on this unit without probe |
| End-to-end latency | Hardware + firmware + OS + app; game must measure | Unresolved |
| Mechanical force / pressure | Optional; may be absent or low-resolution | Confirmed fact (optional) |
| Click force | Mechanical hinge or haptic force threshold; not per-finger identity | Inference |

**Recommendation:** Treat **pressure/force as optional diagnostics only** until a probe proves useful, stable signal for gameplay.

### 2.4 What this Synaptics device “theoretically” exposes

**Inference:** As an I2C HID “HID-compliant touch pad” under Windows, if it is a certified PTP, the OS already consumes PTP-shaped reports (Contact ID, X/Y, Tip, Scan Time, Contact Count, buttons). Vendor may also expose proprietary collections; **do not depend** on vendor-specific APIs.

**Unresolved without probe:** Exact Contact Count Maximum, presence of Pressure/Width, whether Button 1 is mechanical or haptic, actual scan rate, and ID reuse policy under palm rejection.

---

## 3. Windows capability

### 3.1 PTP as OS-managed digitizer

**Confirmed fact:** PTP co-development moved interpretation of multi-touch pad data into Windows so vendors report standard HID and Windows generates gestures and window messages (Firefox Windows pointing-device docs summarize Synaptics/Microsoft PTP model; Microsoft docs define the HID contract).

### 3.2 Application-facing APIs

#### A. Win11 Precision Touchpad pointer path — `RegisterTouchpadCapableWindow` + `GetPointerTouchpadInfo*` (**P0-A first probe**)

**Confirmed fact** (Microsoft Learn Precision Touchpad Input portal + API refs, `ms.date` 2026-03-28, page updated 2026-04-15; docs carry a **pre-released product** disclaimer):

| API | Role |
| --- | --- |
| `RegisterTouchpadCapableWindow` / `RegisterTouchpadCapableThread` | Opt window/thread into touchpad-capable mode |
| `GetPointerTouchpadInfo` | Single-pointer touchpad info → `POINTER_TOUCH_INFO` |
| `GetPointerTouchpadInfoHistory` | Coalesced history for one pointer |
| `GetPointerFrameTouchpadInfo` | **Entire frame** of active contacts → `POINTER_TOUCH_INFO[]` |
| `GetPointerFrameTouchpadInfoHistory` | Frame history |

**Requirements (confirmed fact):**

- **Minimum client: Windows 11** (desktop apps only); no server support listed.
- Call only while processing **`WM_POINTER`** for touchpad input **after** registering as touchpad-capable.
- Header `Winuser.h`; `User32.dll` (docs list ordinals for the new exports).

**Behavioral details (confirmed fact from `GetPointerTouchpadInfo` remarks):**

- Touchpad pointer **pixel** locations (`ptPixelLocation` / raw) stay at the **mouse pointer position when the gesture began** and **do not track** each finger on screen.
- **Device-relative** positions live in `ptHimetricLocation` / raw (contact vs device).
- `GetPointerDeviceRects`: screen rect = virtual desktop; device rect = touchpad dimensions; **no direct geometric mapping** between the two (unlike touchscreens).
- Disambiguation may **drop early frames** and later **synthesize** a `POINTER_FLAG_DOWN` frame—apps must avoid content “jumping.”
- Portal: by default apps **do not** receive gesturing touchpad input; after register, window gets **`WM_POINTER` for two-finger gestures (pans and zooms)**; forwarding to `DefWindowProc` becomes wheel messages.

**Caveats for SlackPad (inference + unresolved):**

- Docs emphasize **two-finger pan/zoom gestures**, not free dual-foot digitizer mode. **Unresolved:** whether continuous two-finger plant/steer/lift outside pan/zoom classification still streams `WM_POINTER` frames on Win11.
- Single-finger likely remains **mouse** path unless other APIs intervene.
- **Pre-release disclaimer** on Learn pages: APIs may change before commercial finality.
- Still need **Button 1 / click** and **tip lifecycle** proven in probe (fields via `POINTER_TOUCH_INFO` / `POINTER_INFO` flags).

**Recommendation:** On Windows 11 hosts, implement **P0-A** with this path first (official multi-contact frame API). If dual independent himetric contacts + independent lift fail or only fire during OS pan/zoom, fall through to Raw Input (**P0-B**).

Primary URLs:

- https://learn.microsoft.com/en-us/windows/win32/input-precisiontouchpad/getpointertouchpadinfo
- https://learn.microsoft.com/en-us/windows/win32/input-precisiontouchpad/registertouchpadcapable
- https://learn.microsoft.com/en-us/windows/win32/input-precisiontouchpad/precision-touchpad-portal

#### B. Raw Input + HID parse (**P0-B fallback / continuous HID authority**)

**Confirmed fact** (Microsoft Raw Input overview / `RegisterRawInputDevices`):

- Apps register HID top-level collections to receive `WM_INPUT`.
- Digitizer touchpad TLC: Usage Page **0x0D**, Usage **0x05** (Touch Pad).
- Application parses report bytes using HID preparsed data (`HidP_*`) for Contact ID, tip, X/Y, buttons, scan time.

**Inference:** Most complete access to **mandatory PTP report fields** (including report-level Button 1 and Scan Time) independent of OS gesture classification. Prefer when Win11 pointer path is insufficient or for Win10-class machines (if ever in matrix).

**Caveats (hypothesis/unresolved until probe):**

- May compete with system use of the same device.
- Focus and registration flags affect whether input arrives when unfocused.
- Exclusive access patterns differ for some digitizers (WebHID discussions note Windows Raw Input Manager opens digitizers).

#### C. Generic WM_POINTER / `GetPointerFrameInfo` (not touchpad-specific)

**Confirmed fact** (`GetPointerFrameInfo`, Windows 8+ desktop):

- Retrieves **entire pointer frame** for multi-pointer devices reporting parallel contacts.
- Associated with most recent pointer message on the calling thread; history via `GetPointerFrameInfoHistory` for coalesced `WM_POINTERUPDATE`.
- Frame only includes pointers owned by the same window.

**Recommendation:** Use **touchpad-specific** `GetPointerFrameTouchpadInfo` after `RegisterTouchpadCapableWindow` rather than assuming generic `GetPointerFrameInfo` alone unlocks trackpad dual feet. Generic APIs remain useful for touchscreens and shared pointer plumbing.

#### D. OS gestures

Windows synthesizes two-finger scroll, pinch zoom, three/four-finger system gestures. These can **steal** or **reinterpret** contacts before or while the app sees them.

**Confirmed fact:** Registering as touchpad-capable changes delivery so two-finger gestures become `WM_POINTER` instead of default wheel path (portal + `RegisterTouchpadCapable*` remarks).

**Recommendation:** Focused game window; register touchpad-capable; do not forward gameplay `WM_POINTER` to `DefWindowProc` if that would reintroduce wheel scrolling; avoid three-finger system gestures for core feet control.

---

## 4. Browser capability

### 4.1 Pointer Events (W3C)

**Confirmed fact** (Pointer Events Level 3 = **W3C Recommendation**, dated **30 June 2026**; dated TR: https://www.w3.org/TR/2026/REC-pointerevents3-20260630/ ; publication history: https://www.w3.org/standards/history/pointerevents3/ — CR/CRD through May 2026, then REC):

- Unified model for mouse, pen, touch: `pointerId`, `pointerType`, pressure, geometry; PE3 adds/clarifies `altitudeAngle`/`azimuthAngle`, `pointerrawupdate`, coalesced events, predicted events.
- Multi-touch **touchscreen** contacts map to multiple active pointers with distinct `pointerId`.
- Spec **does not** define a trackpad-as-digitizer coordinate space separate from screen targeting.
- **Do not overclaim:** Recommendation status ≠ universal browser feature parity (e.g. `getCoalescedEvents` support differs by engine per MDN notes in the TR). PE3 **does not** make laptop trackpads expose dual absolute feet in Chrome/Edge/Firefox.

**Confirmed fact** (W3C pointerevents issue #206, opened 2017, closed; labeled historical interest):

- Explicit request for **raw trackpad multi-touch coordinates** as a future pointer type.
- Never became a shipped standard requirement for dual absolute pad contacts.

### 4.2 Historical Edge PTP Pointer Events

**Confirmed fact** (Microsoft Edge blog, 2017-12-07, EdgeHTML 17):

- Edge fired Pointer Events with `pointerType: "touch"` for some PTP gestures.
- **Two-finger panning** was converted to a **single** contact at the cursor with scaled deltas — **not** two independent feet.
- Pinch used two contacts at scaled distance from cursor; not pad-absolute dual feet for free play.

**Inference:** Even the best historical browser PTP exposure optimized **web gestures** (pan/zoom/rotate), not **fingerboard dual feet**.

### 4.3 Chromium / current browsers

**Inference (strong):** Desktop Chrome/Edge/Firefox on Windows typically expose laptop trackpads as:

- Relative **mouse** movement and buttons
- **Wheel** / pinch-as-ctrl-wheel hacks
- Optional gesture events

They do **not** reliably provide two simultaneous absolute pad contacts with independent lift for arbitrary canvas games.

**Confirmed fact** (WebHID issue discussions): Digitizers/touchpads on Windows are often blocked or exclusive to Raw Input Manager; WebHID is not a portable dual-foot solution for system touchpads.

### 4.4 Browser capability vs need

| Need | Browser | Label |
| --- | --- | --- |
| Two absolute positions | No (reliable) | Confirmed gap |
| Persistent contact IDs | No (trackpad) | Confirmed gap |
| Independent lift | No (trackpad) | Confirmed gap |
| Physical click | Partial (mousedown / pointer with mouse type) | Confirmed fact |
| High-rate motion | Partial (`pointerrawupdate` for real pointers) | Confirmed fact |
| Wheel/pinch gestures | Yes (not dual feet) | Confirmed fact |

**Recommendation:** Treat pure browser input as **dev mock** (mouse/touchscreen emulation) and **agent injection** path only—not the production human trackpad path.

---

## 5. Application capability

### 5.1 What the app must own

1. **Adapter** from native HID/pointer → `ContactFrame` (normalized 0–1 pad space, tip, id, buttons, timestamps).
2. **Foot identity layer** (HID contact ID → left/right foot roles → stance-bound nose/tail).
3. **Gesture FSM** consuming ContactFrames (never bypassable by agents).
4. **Recording/replay** of ContactFrames (not board teleports).

### 5.2 Click / kick semantics

**Confirmed fact:** Button 1 is a **report-level** usage, not per-contact.

**Recommendation:** Model click as `buttons.primary` on the frame; associate pop with the planted “kick foot” via stance rules (e.g., tail plant + click = ollie pop), not hardware which-finger-clicked.

### 5.3 Latency budget (design targets)

| Segment | Target | Label |
| --- | --- | --- |
| HID report period | ≤10 ms typical | Hypothesis |
| Native → JS ContactFrame | ≤2–4 ms | Hypothesis |
| Gesture recognize | ≤1 frame (fixed 1/120 or 1/60 s) | Recommendation |
| Physics step | Fixed 1/60 or 1/120 | Recommendation |
| Render | 60 FPS | Recommendation |
| Total contact-move feel | ≤50 ms | Recommendation gate |

---

## 6. Layer comparison table

| Capability | Hardware | Windows PTP | Browser | Native app bridge |
| --- | --- | --- | --- | --- |
| Multi-contact absolute X/Y | Yes (class) | Yes | No (trackpad) | Yes |
| Contact ID lifecycle | Yes | Yes | No | Yes |
| Tip / lift | Yes | Yes | No | Yes |
| Scan time | Yes | Yes | No | Yes |
| Button click | Yes (type-dependent) | Yes | As mouse click | Yes |
| Per-contact pressure | Optional | Optional | Rare/N/A | Optional |
| Suppress OS scroll | N/A | Partial | CSS touch-action limited for pads | Best chance |
| Portable macOS/Linux | Device-dependent | N/A | Same browser gap | Separate backends |

---

## 7. Feasibility conclusion

**Confirmed fact:** PTP HID defines everything SlackPad needs for dual-foot plant/move/lift/click at the OS/hardware contract.

**Confirmed fact:** Windows 11 documents an application path: `RegisterTouchpadCapableWindow` + `GetPointerFrameTouchpadInfo` / `GetPointerTouchpadInfo` (pre-release disclaimer; Win11-only).

**Confirmed fact:** The open web does not standardize or ship raw dual-contact trackpad feet.

**Recommendation:** Feasible **only** with a native Windows input path into ContactFrame. Cheapest invalidating experiments (ordered):

1. **P0-A** Win11 touchpad-capable `WM_POINTER` + `GetPointerFrameTouchpadInfo` (himetric dual contacts).
2. **P0-B** Raw Input HID Touch Pad `0x0D/0x05` if P0-A fails continuous dual-foot needs.

---

## Primary sources

- https://learn.microsoft.com/en-us/windows-hardware/design/component-guidelines/touchpad-windows-precision-touchpad-collection
- https://learn.microsoft.com/en-us/windows-hardware/design/component-guidelines/touchpad-sample-report-descriptors
- https://learn.microsoft.com/en-us/windows-hardware/design/component-guidelines/touchpad-required-hid-top-level-collections
- https://learn.microsoft.com/en-us/windows/win32/input-precisiontouchpad/getpointertouchpadinfo
- https://learn.microsoft.com/en-us/windows/win32/input-precisiontouchpad/registertouchpadcapable
- https://learn.microsoft.com/en-us/windows/win32/input-precisiontouchpad/precision-touchpad-portal
- https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-getpointerframeinfo
- https://learn.microsoft.com/en-us/windows/win32/inputdev/about-raw-input
- https://www.w3.org/TR/pointerevents3/
- https://github.com/w3c/pointerevents/issues/206
- https://blogs.windows.com/msedgedev/2017/12/07/better-precision-touchpad-experience-ptp-pointer-events/
- https://github.com/WICG/webhid/issues/125
