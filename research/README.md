# SlackPad 360 — Research Summary & Committed Recommendation

**Access date:** 2026-07-10
**Status:** Architecture and feasibility research complete. Production game code not started.
**Scope:** Two-finger laptop trackpad skateboarding/fingerboarding (Three.js + Rapier direction per root README).

---

## Committed recommendation

### Feasibility verdict

**Conditionally feasible — go for gated prototypes.**

Hardware and Windows Precision Touchpad (PTP) stacks can report independent multi-contact IDs, absolute X/Y, tip-switch (plant/lift), scan time, contact count, and button state. Browsers **do not** expose raw multi-contact trackpad coordinates as first-class multi-pointer streams suitable for two independent feet. Therefore the concept is **not** shippable as pure web-only input on Windows laptops, but **is** viable with a **native input adapter** feeding a normalized `ContactFrame` into a Three.js/Rapier simulation.

| Layer | Can do two persistent contacts + independent lift + click? | Label |
| --- | --- | --- |
| Hardware (this laptop: Synaptics VEN_06CB I2C HID touchpad) | Expected yes if device is PTP-class (≥3 contacts mandatory for PTP) | **Inference** (device present; PTP report fields confirmed for class; per-device HLK cert not re-run here) |
| Windows (PTP HID + Raw Input / pointer path) | Yes in principle: Contact ID, X/Y, Tip, Scan Time, Contact Count, Button 1 | **Confirmed fact** (Microsoft PTP docs) |
| Browser (Pointer Events / Touch Events / WebHID) | No reliable multi-contact trackpad foot stream | **Confirmed fact** (W3C gap + Edge/Chromium history + WebHID digitizer blocking) |
| Application (native bridge → ContactFrame → sim) | Yes, by design | **Recommendation** |

### Unproven assumptions (must be killed or confirmed in prototype phase)

1. This specific Synaptics HID path reports **stable contact IDs** across two concurrent fingers for ≥30–60 s of continuous play (**hypothesis**).
2. **Click (Button 1)** can be sampled in the same frame stream as contacts without aliasing to OS click/gesture (**hypothesis**).
3. OS two-finger scroll/pinch can be suppressed or avoided so game gestures win while the window is focused (**hypothesis**).
4. Two-finger ergonomics remain comfortable for 10–15 minute sessions without excessive arm/hand fatigue (**hypothesis**).
5. Hybrid assisted physics feels fair (player skill > automation) for ollie → flip → catch → land + one rail (**hypothesis**).
6. Integrated-GPU machines hold 60 FPS with professional lighting/shadows on a small park (**hypothesis**).

### Follow-up sprint (2026-07-10)

See `input-attribution.md` (click→foot, retracking, **relative** control), `trick-primitive-matrix.md`, `reuse-audit.md`, `ergonomics-evidence.md`, `followup-decisions.json`.
**Control model correction:** pad is **not** a finite world map; board-local relative rest-pose control is required.

### Minimum first hardware/input experiment (do this before any park content)

**P0 — Contact identity probe (native; try Win11 pointer path first):**

1. **P0-A (preferred on Windows 11):** `RegisterTouchpadCapableWindow` → `WM_POINTER` → `GetPointerFrameTouchpadInfo` / `GetPointerTouchpadInfo`. Log per-contact **himetric** positions (not screen pixel fields—those stay at gesture-start cursor per Microsoft docs).
2. **P0-B (fallback):** Raw Input HID Touch Pad (`0x0D` / `0x05`) for Contact ID, tip, X/Y, Button 1, Scan Time.

- Display live: contact count, per-contact ID, tip/lift, normalized pad X/Y, button edge, inter-frame Δt; log Button1 with plant-count 0/1/2; log ID order after dual-lift cycles; note pressure/mech-force presence.
- **Accept:** two contacts with stable IDs for ≥60 s; independent lift; continuous free dual-plant (not only OS pan/zoom); button edge on physical click; median frame interval ≤16 ms (or documented ≥60 Hz effective).
- **Abandon / pivot:** neither path yields two independent positions with lift; IDs thrash every frame; only mouse deltas available.
- Full P0 measure list + playtest-deferred list: `followup-decisions.json` → `p0MustMeasure` / `deferToPlaytest`.

Until P0 passes, do **not** invest in levels, art, or full gesture ML.

### Recommended camera and hand mapping

| Concern | Decision | Rationale |
| --- | --- | --- |
| Default camera | **Low three-quarter chase** (slightly above and behind board, look-ahead bias) | Reads gaps/rails and board rotation; better than pure side or overhead for 3D lines |
| Alternate cameras | Side (debug/teach), overhead (grind alignment assist toggle), free look (pause only) | Side for trick training; overhead optional assist, not default |
| Input space | **Pad-relative continuous controls**, mapped through stance → **board-relative** forces | Trackpad coords are not screen pixels; feet map to board axes after stance transform |
| Hand mapping | **Dominant-hand index = front foot role after stance**, middle = back foot role; calibrate “left contact / right contact” by pad X at plant, then bind to board nose/tail via regular/goofy | Separates handedness from stance from camera |
| Click | Global pad button → **kick/pop discrete event**, not “which foot clicked” (hardware usually cannot) | PTP Button 1 is report-level, not per-contact |

### Initial trick vocabulary

Ship order (assisted hybrid, not pure rigid-body freestyle):

1. **Push / cruise** — both planted + optional click pulse for accel
2. **Steer / carve** — two-contact yaw of the contact segment
3. **Ollie / nollie** — back- or front-plant + lift of other + click-centered pop window
4. **Shuvit / 180 body** — yaw sweep during pop airtime
5. **Kickflip / heelflip** — front-foot lateral flick after pop
6. **Catch** — re-plant timing window that damps over/under-rotate
7. **Land / bail** — velocity + board up-vector thresholds
8. **Grind entry** — air→rail contact with snap assist + balance meter

Primitives (not tricks): `contact`, `lift`, `plant`, `kick`, `flick`, `sweep`, `hold`, `catch`.

### Physics / assistance model

**Hybrid assisted physics (Skate “Flick-It” philosophy, trackpad grammar):**

- Ground: continuous forces/torques from contact segment (heading, steer rate, push).
- Tricks: **forgiving gesture recognition** opens a maneuver; **physics still owns** air velocity, collisions, grind contacts, and failure.
- Not pure canned animation (too automatic). Not pure free rigid-body finger micro-control (too unfair / high failure).
- Catch and landing: soft angular damping + snap windows; bail when thresholds exceeded.
- Grinds: detection volume + optional rail snap on entry; balance continuous; collision can interrupt.

### Explicit go / no-go before production

| Gate | Go | No-go |
| --- | --- | --- |
| **G1 Input** | P0 accept criteria met on target laptop class | Cannot obtain dual contact + lift + click stream |
| **G2 Feel** | 5 playtesters complete push→ollie→land without documentation after 10 min tutorial; ≥3 rate “fun” ≥4/5 | Majority abandon or report “broken / random” |
| **G3 Latency** | Motion-to-photon for contact move ≤50 ms typical (instrumented); click-to-pop visual ≤80 ms | Persistent mushy >100 ms or desync |
| **G4 Determinism** | Same ContactFrame recording → same sim events across two runs on same machine | Replay diverges on non-visual state |
| **G5 Performance** | 60 FPS p95 on target integrated GPU for milestone park | Sustained <45 FPS after budgeted art |
| **G6 Agent** | Agent injects ContactFrames only; cannot set board pose; golden traces pass | Cheating path or non-reproducible agent scores |

**Production begins only when G1–G4 pass.** G5–G6 may slip slightly but must pass before content lock.

---

## Recommended runtime architecture (single path)

**Primary recommendation:** **Native Win32 + WebView2 host** with a **Windows touchpad input bridge** that emits `ContactFrame` into the page (or shared memory / localhost IPC). Simulation and rendering remain **TypeScript + Three.js + Rapier** (fixed step).

**Bridge implementation order:**

1. **Win11 first:** `RegisterTouchpadCapableWindow` + `GetPointerFrameTouchpadInfo` (official multi-contact `WM_POINTER` path; himetric device coords).
2. **Fallback:** Raw Input HID PTP parse when pointer path cannot sustain free dual-foot plant/lift/click.

**Why this path (not a menu):**

1. **Browser alone cannot** supply the dual-foot stream (confirmed architectural gap; see `input-feasibility.md`).
2. **WebView2** keeps Chromium rendering for Three.js while the host owns focus, Win11 touchpad pointer registration / HID, and gesture policy — lighter than full Electron for v1.
3. **Electron + N-API** is the **fallback packaging path** if distribution needs multi-platform shell later; same ContactFrame contract.
4. **Tauri/Rust** is attractive for a Rust HID crate but adds dual-language UI friction for a Three.js-first game; re-evaluate only if WebView2 packaging fails.
5. **Standalone input bridge** (separate process → WebSocket) is useful for **research probes** but not the preferred shipped architecture (focus, security, latency).

Aligns with root README: Three.js / Vite / Rapier / ContactFrame / native bridge if browser insufficient.

---

## Document map

| File | Contents |
| --- | --- |
| [input-feasibility.md](./input-feasibility.md) | Hardware / Windows / browser / app layers |
| [control-grammar.md](./control-grammar.md) | Primitives, states, gestures, stance, calibration |
| [physics-and-game-feel.md](./physics-and-game-feel.md) | Tricks, landing, grinds, assistance |
| [camera-and-ergonomics.md](./camera-and-ergonomics.md) | Hands, cameras, mapping, test protocol |
| [agent-observability.md](./agent-observability.md) | ContactFrame, agent API, replay, testing |
| [technology-and-assets.md](./technology-and-assets.md) | Stack, performance, deps, licenses |
| [risk-register.md](./risk-register.md) | Failure modes with severity and experiments |
| [prototype-roadmap.md](./prototype-roadmap.md) | Ordered experiments + abandon criteria |
| [sources.json](./sources.json) | Source catalog |
| [decisions.json](./decisions.json) | Decision records |
| [probes/](./probes/) | Minimal research probes only |

---

## Method notes

- Prefer primary sources (Microsoft Learn, W3C, Rapier docs, official product notes).
- Labels: **confirmed fact**, **inference**, **recommendation**, **hypothesis**, **unresolved**.
- No driver installs, no OS touchpad setting changes, no production game tree.
- Local hardware probe (PnP): `HID-compliant touch pad` + `I2C HID Device` with `VEN_06CB` (Synaptics) observed on the research machine (2026-07-10).

---

## One-paragraph strategy

Treat the trackpad as a **two-foot digitizer**, not a mouse. Normalize every sample into `ContactFrame`. Recognize **forgiving, click-centered gestures** that trigger **assisted but interruptible physics**. Use a **low three-quarter chase camera** and **board-relative** mapping after stance calibration. Prove dual-contact identity on this laptop **first**; only then build ollie→flip→grind and agent golden traces. If dual-contact fails, the product concept as stated is **no-go** for trackpad-primary control (controller/gamepad would be a different product).
