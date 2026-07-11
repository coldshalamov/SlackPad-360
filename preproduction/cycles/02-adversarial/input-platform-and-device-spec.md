# Input Platform and Device Spec — Cycle 2

**Status:** Normative for P0 spike and host input ranking
**Access date:** 2026-07-10

---

## 0. Documented API shape vs proven free dual-contact

| Layer | Status | Label |
| --- | --- | --- |
| PTP HID fields (ID, X, Y, tip, confidence, scan time, contact count, Button 1 report-level) | Documented device class | **Confirmed fact** (MS PTP collection / buttons) |
| `RegisterTouchpadCapableWindow` / `Thread` | Documented Win11; enables touchpad-capable behavior | **Confirmed fact** (Learn, ms.date 2026-03-28; pre-release disclaimer) |
| Registered window receives WM_POINTER for **two-finger pans and zooms** | Explicit in RegisterTouchpad docs | **Confirmed fact** |
| Free, continuous dual-plant feet stream via pointer APIs on target laptop | Not proven by docs | **Unresolved** (G1) |
| Raw Input HID Digitizer Touch Pad `0x0D/0x05` | Documented OS path; sample apps parse multi-contact | **Confirmed fact** (API); free dual-plant on **target** still **unresolved** |
| Browser dual-foot system trackpad | Insufficient for product | **Confirmed fact** (research/PE3) |

**Inference:** Product-critical free dual-plant is an **empirical gate**, not an internet research outcome.

---

## 1. Re-verified API notes

### 1.1 RegisterTouchpadCapableWindow / Thread

- **Source:** https://learn.microsoft.com/en-us/windows/win32/input-precisiontouchpad/registertouchpadcapable
- **Access:** 2026-07-10
- **Shape:** `BOOL RegisterTouchpadCapableWindow(HWND, BOOL)`; `BOOL RegisterTouchpadCapableThread(BOOL)`
- **Effects (docs):** GetPointerDevices includes touchpads (thread); WM_POINTER for touchpad **two-finger gestures (pans and zooms)**; DefWindowProc → mouse wheel conversion if unhandled
- **Min client:** Windows 11 desktop
- **Disclaimer:** Pre-released product language still present on page

### 1.2 GetPointerTouchpadInfo family

- **Source:** https://learn.microsoft.com/en-us/windows/win32/input-precisiontouchpad/getpointertouchpadinfo
- **Variants:** single, history, **frame**, frame history
- **Critical:** `ptPixelLocation*` freezes at gesture-start mouse position; **`ptHimetricLocation*`** holds contact relative to device
- **Use himetric + GetPointerDeviceRects device rect** for pad-normalized 0–1
- **Call only** while processing touchpad WM_POINTER after registration

### 1.3 PTP HID / Raw Input

- Touch Pad collection Usage Page `0x0D`, Usage `0x05`
- Raw Input: `RegisterRawInputDevices` + preparsed HID parse of contact id, tip, X/Y, scan time, contact count, Button 1
- Study: https://github.com/emoacht/RawInput.Touchpad (MIT, sample — not product library)

### 1.4 WebView2 transport

- **Source:** https://learn.microsoft.com/en-us/microsoft-edge/webview2/how-to/communicate-btwn-web-native
- Host→page: `PostWebMessageAsJson` / AsString
- Page→host: `chrome.webview.postMessage` + `WebMessageReceived` (validate origin)
- Also: `ExecuteScript`, `AddHostObjectToScript`
- **v0 choice:** JSON ContactFrame batches (**recommendation**)
- **If G3 fails:** SharedBuffer or denser binary framing (**fallback**)
- **Latency:** not proven by docs (**unresolved**)

---

## 2. Primary API decision for first executable

**Decision (C2-INPUT-PRIMARY-API):**

1. First executable **implements both** P0-A (Win11 pointer) and P0-B (Raw Input).
2. **Ranking for free dual-plant production path:** Raw Input **primary** until P0-A accepts free dual-plant on target hardware.
3. If P0-A accepts with equal or better latency/stability, **promote pointer path** (reopen trigger).

**Rationale (not aesthetic):** Pointer docs only commit pan/zoom WM_POINTER. Product needs free dual plant. Raw Input is the class path that already has multi-contact sample implementations.

---

## 3. Smallest P0 native hardware spike

### 3.1 Goal

Emit ContactFrame CSV/JSONL and prove dual-contact, lift independence, click edges, free dual-plant.

### 3.2 Modules / files (planned — not implemented this cycle)

```
host/p0-touchpad-spike/   (future)
  Program.cs                 # entry, window, message loop
  TouchpadPointerAdapter.cs  # P0-A
  TouchpadRawInputAdapter.cs # P0-B
  ContactFrameWriter.cs      # normalize + log
  SpikeUi.cs                 # on-screen contact dots (optional)
docs/traces/                 # committed sample traces later
```

**No production game paths.** Spike is host-only + optional blank WebView2 page for message post test.

### 3.3 Trace format (JSONL)

```json
{"schemaVersion":1,"frameId":0,"tPerfMs":123.4,"tScanUs":null,"source":"raw|pointer","adapter":"P0-B","contacts":[{"id":1,"tip":true,"x":0.4,"y":0.5,"confidence":true}],"buttons":{"primary":false,"secondary":false,"auxiliary":false},"meta":{"contactCountRaw":2,"deviceId":"..."}}
```

Also emit a **session header**:

```json
{"type":"session","machine":"...","os":"...","adapter":"P0-A|P0-B","startedAt":"ISO-8601","qpcFreq":...}
```

### 3.4 Test gestures (scripted human protocol)

| ID | Gesture | Duration | Expect |
| --- | --- | --- | --- |
| T1 | Single finger plant/hold/lift | 10 s | Stable ID; tip edges |
| T2 | Dual free plant hold | **≥60 s** | Two IDs; no forced OS desktop pan |
| T3 | Dual plant + slow translate (steer) | 20 s | Continuous himetric motion |
| T4 | Dual plant + slow rotate | 20 s | Segment angle changes |
| T5 | Staggered lifts (L then R) | 10× | Independent tip-up |
| T6 | Simultaneous dual lift | 10× | Both tip-up same frame ±1 |
| T7 | Click while one contact | 20× | primary edge with 1 tip |
| T8 | Click while two contacts | 20× | primary edge with 2 tips |
| T9 | Click with zero contacts (if possible) | 10× | edge or none |
| T10 | Fast dual re-plant after lift | 20× | ID reassignment logged |
| T11 | OS gesture bait (two-finger scroll intent) | 30 s | Game window retains focus sink |

### 3.5 Metrics

| Metric | Definition |
| --- | --- |
| `dual_plant_stable_s` | Longest continuous dual tip-true span |
| `id_thrash_rate` | ID reassignments per minute while tips held |
| `lift_independent` | Fraction of staggered lifts detected as independent |
| `click_edge_detect_rate` | Detected primary rising edges / attempted clicks |
| `frame_dt_p50/p95` | Inter-frame ΔtPerfMs |
| `gap_frames` | Frames with tip discontinuity without lift edge |
| `os_hijack_events` | Count of focus loss / desktop scroll during T2/T11 |

### 3.6 Accept / Reject / Fallback

| Result | Criteria |
| --- | --- |
| **Accept G1 (adapter X)** | `dual_plant_stable_s ≥ 60`; independent lifts on T5; click edges ≥90% attempts on T7/T8; id thrash low enough for tracker (hypothesis: ≤2 reassigns/min while held); no desktop hijack during focused T2 |
| **Reject adapter** | Gesture-only frames; thrashing IDs; no independent lift; click never observed |
| **Fallback** | If P0-A reject and P0-B accept → ship Raw primary. If both reject on device → try alternate PTP laptop list. If class fails → **product pivot** (controller hybrid = different product; stop content) |

---

## 4. Device-mode matrix

| Mode | Support | Behavior | Notes |
| --- | --- | --- | --- |
| Mechanical clickpad | **Supported** | Button 1 rising edge = kick candidate | Baseline |
| Haptic / force clickpad | **Supported** | Same Button 1; no hinge required | Do not require force magnitude |
| Tap-to-click OS setting | **Configurable** | Default: treat OS tap-as-click as kick if primary edges fire; offer disable guidance | May increase false kicks — profile option |
| Windows left/right click zones | **Ignored for feet** | Do not map zones to L/R foot | Feet come from stance+plant, not OS zones |
| 0 contacts + click | **Ignore** (or future grind hop off) | No pop | Matrix logging only |
| 1 contact + click | **Supported** | Attribute to planted foot → ollie/nollie by nose/tail role | |
| 2 contacts + click | **Supported** | Default **push pulse**; profile `bothClickMeans=ollie` optional | |
| Simultaneous lift | **Supported** | Dual lift tracker rules; clear predict after timeout | |
| Staggered lift | **Supported** | Independent tip edges | Critical |
| Contact-ID reassignment | **Handled** | Logical foot tracker rebinds by position/velocity cost | No mid-trick rebind if possible |
| No pressure/force signal | **Supported (default)** | Pressure optional; never required for success | |
| Palm / confidence false | **Ignore contact** | | |
| >2 contacts | **Ignore extras** | Keep two gameplay feet | |

---

## 5. Click attribution → left/right foot mental model

Hardware exposes **report-level** Button 1 (**confirmed fact**).

**Pipeline:**

1. Bind HID contacts → logical padLeft/padRight → board noseFoot/tailFoot via stance (regular/goofy) + `swapFeet`.
2. On primary rising edge, read **plant mask** of nose/tail.
3. Attribute:

| Plant mask | Kick attribution | Player mental model |
| --- | --- | --- |
| Tail only | Tail kick | Back-foot pop (ollie family) |
| Nose only | Nose kick | Front-foot pop (nollie) |
| Both | Neither foot “kicked alone” → push | Both feet down “pump/push” |
| Neither | No gameplay kick | |

4. Motion window `[t−L, t+L]` (hypothesis L≈60 ms) can reclassify push vs pop if prep lift present.
5. Optional spatial bias (which contact closer to click... **unavailable**) — **do not invent**. If only one contact near edge of pad, still use plant mask first.

**Left/right language:** UI may say “left/right finger” after calibration maps padLeft/padRight to player’s physical fingers; board language remains nose/tail.

---

## 6. Calibration: regular/goofy, hand angle, axes, camera invariance

| Calibration | Method | Label |
| --- | --- | --- |
| Stance regular/goofy | Explicit profile toggle; default regular | Recommendation |
| Foot swap | `swapFeet` toggle mid-session | Recommendation |
| Hand-angle `padYawOffset` | Rest pose: both plant, press calibrate; compute angle of segment vs board +Z | Recommendation |
| Rest pose | Soft recenter when both plant nearly still | Preserved C1 |
| Board-local axes | +X right (toe), +Y up, +Z nose | Normative |
| Camera invariance | **Camera never rewrites foot mapping**; mapping uses board local + padYawOffset only | Normative |
| Comfort | Do not require forced “hands parallel to screen edge”; yaw offset absorbs natural angle | Recommendation |

**Hypothesis constants:** recenterHoldMs 250–400; dual-lift clear 400–600; ballistic predict 150–250.

---

## 7. What web research cannot further reduce

- Free dual-plant on **this** laptop
- Click latency and false OS gesture rate
- Ergonomics of 15-minute sessions
- Whether Win11 pointer path is pan/zoom-only in practice

These require the P0 spike (**hardware acceptance** evidence level).
