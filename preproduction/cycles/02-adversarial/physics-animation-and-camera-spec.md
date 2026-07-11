# Physics, Animation, and Camera Spec — Cycle 2

**Status:** Implementable architecture
**Access date:** 2026-07-10
**Engine primary:** `@dimforge/rapier3d-deterministic-compat@0.19.3` (Apache-2.0)
**Docs:** https://rapier.rs/docs/user_guides/javascript/determinism/ · getting started

> Cycle-1 defect quote: specs referred to `@dimforge/rapier3d-deterministic` while linking `-compat`. Both packages exist at 0.19.3; cycle 2 selects **-compat**.

---

## 1. Three physical representations compared

### Model A — Single dynamic board + assisted impulses + cosmetic rider mass

| Criterion | Assessment |
| --- | --- |
| Stability | High (one body) |
| Determinism | High (fewer joints) |
| Rail/coping | Grind via latch constraint + deck/truck colliders; less true truck slide |
| Truck lean | Animated/assisted roll bias |
| Wheel roll | Fake visual spin; friction anisotropic on hull |
| Flip/catch | Assist ω + catch damp |
| Failed landings | Body free response; bail thresholds |
| Animation integration | Easy shoe sockets on board |
| CPU | Lowest |
| Risk | Medium for rail fidelity |
| **v0 decision** | **Adopt** |

### Model B — Board body + constrained/raycast truck & wheel contacts

| Criterion | Assessment |
| --- | --- |
| Stability | Medium (suspension springs) |
| Determinism | Medium (contact order care) |
| Rail/coping | Better wheel/truck edge contact |
| Truck lean | More natural via forces |
| Wheel roll | Realer rolling resistance |
| Flip/catch | Same assist layer |
| Failed landings | Better tip-over |
| Animation | Slightly harder (axle transforms) |
| CPU | Medium |
| Risk | Medium-high tuning |
| **Decision** | **P3 probe** if A fails rails |

### Model C — Articulated board/truck/wheel + rider-foot constraints

| Criterion | Assessment |
| --- | --- |
| Stability | Low without heavy assist |
| Determinism | Harder |
| Rail/coping | Highest fidelity potential |
| Truck lean | Best |
| Wheel roll | Best |
| Flip/catch | Foot constraints fight free flip |
| Failed landings | Spectacular but expensive |
| Animation | Full IK burden |
| CPU | Highest |
| Risk | High for first ship |
| **Decision** | **Reject first ship** |

### Simulated vs assisted vs animated vs omitted (v0 = Model A)

| Phenomenon | Mode |
| --- | --- |
| Board rigid pose | Simulated (Rapier) |
| Deck/rail collisions | Simulated |
| Pop impulse | Assisted |
| Flip/shuv ω | Assisted target + clamps |
| Catch damp | Assisted |
| Landing upright cone | Assisted classification + optional soft torque |
| Grind latch | Assisted constraint when entry OK |
| Grind friction along rail | Simulated under latch |
| Wheel suspension | Omitted (v0) / probe B |
| Rider ragdoll | Omitted |
| Shoe deformation | Animated only |
| Bearing spin | Animated only |

---

## 2. Rapier package, import, determinism

### 2.1 Install

```
npm i @dimforge/rapier3d-deterministic-compat@0.19.3
```

License: **Apache-2.0** (npm 2026-07-10).

### 2.2 Import (compat)

```ts
import RAPIER from '@dimforge/rapier3d-deterministic-compat';
await RAPIER.init();
const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
```

Optional alt (non-compat package): `@dimforge/rapier3d-deterministic` with separate `.wasm` asset pipeline if base64 size becomes an issue.

### 2.3 Determinism caveats (**confirmed fact** from official guide)

- Same Rapier version + same construction/add order + same initial conditions → cross-platform deterministic snapshots
- App must avoid non-deterministic inputs (`Math.sin`/`cos` for sim seeds, uncontrolled float from wall clock inside sim)
- ContactFrame streams must be quantized/replayed identically
- Upgrade Rapier ⇒ re-golden G4

### 2.4 OSS skating / vehicle source inspections (2026-07-10)

Primary inspections of **named** repositories with license + commit + reusable algorithms. Do not infer quality from stars.

#### Project A — `3deric/Godot_Skate` (skate prototype)

| Field | Value |
| --- | --- |
| URL | https://github.com/3deric/Godot_Skate |
| License | **MIT** (LICENSE Copyright 2024 Eric Schubert) |
| Inspected commit | `e4ff4687fa4f03a9cbe3a86d5f6e65607032cc9e` (main HEAD 2026-07-10) |
| Key files | `Skategame/Scripts/character_controller.gd`, rail editor scripts, README |
| Local evidence | Session inspect download of `character_controller.gd` (not vendored; see internet-stop-log) |

**What the code actually does (confirmed from source):**

- Character is a **kinematic CharacterBody-style** controller with enum states: `GROUND`, `AIR`, `PIPESNAP`, `GRIND`, `LIP`, `FALL`, etc. — **not** a free rigid-body skateboard with truck colliders.
- **Grind entry:** Area overlap of bodies in group `rampRail` → resolve closest `Path3D` via `get_closest_offset` → if grind input held and `path_dir != 0`, set `path_vel = velocity.project(curve_tangent).length() * path_dir` and enter `GRIND`.
- **Grind motion:** samples baked curve; advances `path_offset`; balances via `balance_angle` ∈ [−π, π]; falls if `|balance_angle| > π/4`.
- **Pipe snap:** snaps XZ to curve, recomputes up from tangent; detach via `_get_stick_curve`.
- **Park pipeline:** editor `park_setup` requires named meshes `*_Col_Pipe|Floor|Wall` and polyline rails `*_Rail_*X` converted to Path3D — useful **asset workflow idea**, not shipping art.
- **Input:** keyboard/gamepad trick axes (`Grind` action) — **not** dual-foot trackpad; not reusable as product input.

| Adoptable? | Decision |
| --- | --- |
| Path3D/rail-as-curve grind **idea** (tangent project, offset, balance meter) | **Study** — reimplement under project license in Rapier constraint terms |
| Balance-fail bail threshold pattern | **Study** |
| Wholesale controller / MetaHuman-based characters | **Reject** — wrong architecture (kinematic character ≠ board body), wrong input, art/license mix (Kenney textures + Epic-based character note in README) |
| Curve snap as sole grind physics | **Reject as primary** for SlackPad hybrid Rapier model (prefer constraint on rigid board after geometric entry) |

#### Project B — `DAShoe1/Godot-Easy-Vehicle-Physics` (raycast vehicle)

| Field | Value |
| --- | --- |
| URL | https://github.com/DAShoe1/Godot-Easy-Vehicle-Physics |
| License | **MIT** (repo license SPDX MIT) |
| Inspected commit | `c392257f54f6ca537dc10bc5badad0c060f18982` (main HEAD 2026-07-10) |
| Key files | `addons/gevp/scripts/vehicle.gd`, `wheel.gd` (Wheel extends RayCast3D) |
| Local evidence | Session inspect download of `vehicle.gd` / `wheel.gd` (not vendored; see internet-stop-log) |

**What the code actually does (confirmed from source):**

- Four exported `Wheel` nodes as **RayCast3D** children; `process_suspension` computes compression from ray hit distance − tire radius; spring/damper rates derived from mass distribution exports.
- `process_forces`: `force_raycast_update()`; applies `vehicle.apply_force(normal * spring_force, contact)` plus lateral/longitudinal tire force vectors at contact; optional anti-roll.
- Extensive **assists** (stability upright spring, ABS, traction, in-air assist) — arcade-to-simcade knobs.
- README recommends **physics tick ≥120** and notes behavior changes with Hz — supports our **60 vs 120 as benchmark plan**, not a fixed law.
- Acknowledgments cite Dechode Advanced Vehicle patterns; demo car art Kenney Car Kit (CC0) — separate from code MIT.

| Adoptable? | Decision |
| --- | --- |
| Raycast spring-damper + force-at-contact pattern for **Model B** probe | **Study** — map concepts to Rapier impulse API; do not vendor GDScript |
| Assist-layer separation (stability vs drive) | **Study** for ManeuverAssist boundaries |
| Full GEVP package as dependency | **Reject** — Godot/Jolt stack, car gearbox domain, not ContactFrame skate product |
| Copying tire compound math wholesale without re-derive | **Reject** — reimplement only what P3 needs |

#### Other

| Source | Decision |
| --- | --- |
| Rapier official JS docs / determinism | **Adopt APIs** (package decision separate) |
| emoacht RawInput.Touchpad | **Study** input only |
| AbsoluteTouchEx | **Reject** (injection + absolute mapping) |

**Implication for representation choice:** Godot_Skate validates that **curve-latch grinds + balance fail** are implementable and fun in prototypes, but its kinematic body is **not** SlackPad’s hybrid board. GEVP validates **Model B raycast wheels** as a mature open pattern if single-body hull fails rail lean. Neither replaces ManeuverAssist + Rapier board body.

---

## 3. Maneuver-assist controller (implementable)

### 3.1 State

```
AssistState = {
  phase: 'none'|'pop'|'air'|'catch'|'grind'|'bail',
  label: string|null,
  assistLevel: 0|1|2,       // player setting
  openStep: int,
  expireStep: int,
  omegaTarget: Vec3,        // board local or world — document per kind
  impulseQueued: Vec3,
  catchGain: float,         // 0..1
  grindAxis: Vec3|null,
  grindAnchor: Vec3|null,
  interruptible: true
}
```

Fixed step `dt = 1/hz` with `hz ∈ {60,120}`; default **60**.

### 3.2 Target angular velocity / impulse envelopes

For flip (example, **hypothesis** numbers):

```
omegaTarget_x = clamp(s * flickSign * omegaFlipMax, -omegaFlipMax, omegaFlipMax)
// omegaFlipMax ~ 12–18 rad/s; s = normalize(flickSpeed)
// applied as PD torque: tau = Kp*(omegaTarget - omega) - Kd*omega
// |tau| ≤ tauMax(assistLevel)
```

Pop impulse (hypothesis):

```
J = (0, jY, 0) + pitchBias * boardRight×up
jY ∈ [jMin, jMax] from prep quality
```

Shuv: omegaTarget about up axis from sweep integral.

### 3.3 Interruption

On any of: hard collision impulse > T_col; player opposite primitive confidence; bail threshold; grind latch fail:

```
phase → appropriate; omegaTarget ← 0; clear quantize; physics continues
```

### 3.4 Catch damping

When catch volume hit in catch window:

```
omega *= (1 - catchGain * assistScale)
// assistScale: L0=0.35, L1=0.55, L2=0.75 (hypothesis)
// linear velocity slightly reduced vertical only if approaching deck-up
```

### 3.5 Landing cones

Board up vector vs world up: angle θ.

| θ | Result |
| --- | --- |
| θ ≤ θ_clean (hyp ~25°) | Clean land |
| θ_clean < θ ≤ θ_dirty (hyp ~45°) | Dirty land, speed loss, score down |
| θ > θ_dirty | Bail |

Horizontal velocity vs board forward for “roll away” vs “plank stop” (hypothesis).

### 3.6 Fail transitions

```
LAND_CHECK → GROUND_READY | BAIL
BAIL → free body + angular damping; after t_bail or rest → respawn
```

### 3.7 Grind constraints

Entry if:

- board near grindable edge (sensor)
- relative speed in [vMin, vMax]
- approach angle within grind family envelope (50-50 vs boardslide)

On enter:

```
// soft constraint: project velocity along rail tangent; cancel separation if assist≥1 within snap radius r_snap
// L0: r_snap small or 0; L1: default; L2: larger
// still require initial geometric contact — no teleport from far
```

Exit: ollie hop, speed end, or fail angle → BAIL/EXIT_AIR.

### 3.8 Assist-level boundaries

| Level | Snap | Quantize flips | Catch gain | Intent |
| --- | --- | --- | --- | --- |
| 0 | Minimal | Off | Low | Simcade hard |
| 1 | Default soft | Soft nearest if close | Medium | Default |
| 2 | Stronger | On if in cone | High | Accessibility |

Assist never calls tricks without ContactFrame-derived open.

---

## 4. Feet / shoes animation

**Decision:** Disembodied shoes + minimal ankle (no full humanoid v0).

| Phase | Placement |
| --- | --- |
| Ground both plant | Shoes at nose/tail sockets with slight squash |
| One plant | Planted shoe locked; free shoe follows free contact offset in board local *or* air pose |
| Air | Both shoes offset by last contact offsets; procedural flip lean |
| Catch | Lerp shoes to sockets over catch damp time |
| Bail | Detach shoes with simple ballistic/spin; reattach on respawn |

**IK:** Optional 2-bone ankle only; not required if sockets + spring damp look good.

---

## 5. 60 vs 120 Hz benchmark plan

| Mode | Role |
| --- | --- |
| 60 Hz | **Default** develop + first ship candidate |
| 120 Hz | Quality experiment; same goldens re-stepped |

**Accept 120 as default only if:** step CPU p95 within budget (hyp <4 ms) on target iGPU **and** formative feel improves. Else keep 60.

Render always interpolates; input may batch multiple ContactFrames per step.

---

## 6. Camera shot / transition contract

**Invariant:** Camera **never** changes board-local foot mapping or padYawOffset.

| Shot | When | Framing goal |
| --- | --- | --- |
| Chase low three-quarter | Default ground | Feet on board + 2–4 m ahead obstacles |
| Air pull-back | Air time | Full board rotation readable |
| Grind overhead blend 10–20% | Grind | Rail path + board yaw |
| Bail wide | Bail | Failure readable |
| Tutorial close | Calibration | Pad diagram + shoes |

Transitions: critically damped spring on camera rig; max angular rate clamp (hypothesis) for comfort. Occlusion: spring-arm sphere cast (render query; optional three-mesh-bvh — not physics authority).

### Readability checklist (shots)

1. Both shoes distinguishable
2. Deck top vs bottom readable in air
3. Rail silhouette clear before grind
4. No HUD covering board
5. Desktop 16:9 and 16:10 safe

---

## 7. Colliders (v0)

- Deck: box/convex
- Trucks: boxes under axles (same body)
- Wheels: visual only or sphere children without drive
- Rails: capsules static `grindable`
- Kill volumes: sensors

Units: 1 unit = 1 m; playable skate scale (~0.8×0.2 m board).
