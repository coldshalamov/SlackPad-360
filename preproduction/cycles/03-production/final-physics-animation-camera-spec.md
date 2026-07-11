# Final Physics, Animation, and Camera Spec

**Status:** Normative
**Engine:** `@dimforge/rapier3d-deterministic-compat@0.19.3` (Apache-2.0)
**Default step:** 60 Hz (`dt = 1/60`); 120 Hz quality benchmark only

---

## 1. Body representation

### Model A (v0 adopt)

Single dynamic board rigid body + cosmetic rider mass bias + assisted ManeuverSpec impulses/torques.
Colliders: deck convex/box + truck boxes on same body. Wheels visual spin. Grind = latch constraint after geometric entry.

### Model B (probe)

Raycast/constrained truck-wheel contacts if G2 shows unfair rails/lean. Map GEVP-style spring-damper concepts to Rapier impulses; do not vendor GDScript.

### Model C (reject first ship)

Articulated multi-body rider + full joints.

**Cycle-3 confirmation:** OSS study still supports Model A first (Godot_Skate = kinematic latch study only; GEVP = Model B probe pattern).

---

## 2. Determinism policy

```ts
import RAPIER from '@dimforge/rapier3d-deterministic-compat';
await RAPIER.init();
const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
// fixed world.step() only; same construction order; same seed; no wall-clock in sim
```

- Avoid `Math.sin/cos` for sim inputs; use deterministic tables or fixed seeds
- ContactFrames quantized for replay
- Upgrade Rapier ⇒ re-run G4 goldens

---

## 3. ManeuverAssist (implementable)

### 3.1 State

```
AssistState = {
  phase: 'none'|'pop'|'air'|'catch'|'grind'|'bail',
  label: string|null,
  assistLevel: 0|1|2,
  openStep: int,
  expireStep: int,
  omegaTarget: Vec3,
  impulseQueued: Vec3,
  catchGain: float,
  grindAxis: Vec3|null,
  grindAnchor: Vec3|null,
  interruptible: true
}
```

### 3.2 Equations (parameterized — hypothesis defaults)

Flip PD torque:

```
omegaTarget_axis = clamp(s * sign * omegaFlipMax, -omegaFlipMax, omegaFlipMax)
// omegaFlipMax ~ 12–18 rad/s; s = normalize(flickSpeed)
tau = Kp*(omegaTarget - omega) - Kd*omega
|tau| ≤ tauMax(assistLevel)
```

Pop impulse:

```
J = (0, jY, 0) + pitchBias * (boardRight × up)
jY ∈ [jMin, jMax] from prep quality
```

Shuv: `omegaTarget` about up from sweep integral.

Catch damping (volume hit in window):

```
omega *= (1 - catchGain * assistScale)
// assistScale L0=0.35, L1=0.55, L2=0.75
```

Landing cones (board up vs world up angle θ):

| θ | Result |
| --- | --- |
| ≤ θ_clean (~25°) | Clean land |
| ≤ θ_dirty (~45°) | Dirty land |
| > θ_dirty | Bail |

### 3.3 Interrupt

On hard collision > T_col, opposite primitive, bail threshold, grind latch fail:

```
clear omegaTarget/quantize; phase → appropriate; physics continues
```

### 3.4 Assist levels

| Level | Snap | Quantize flips | Catch gain |
| --- | --- | --- | --- |
| 0 | Minimal | Off | Low |
| 1 | Default | Soft if close | Medium |
| 2 | Stronger | On if in cone | High |

Assist never opens without ContactFrame-derived recognition.

---

## 4. Grind system

### Entry

- Near grindable edge sensor
- Relative speed ∈ [vMin, vMax]
- Approach angle within family envelope

| Family | Approach envelope |
| --- | --- |
| 50-50 | Board forward near parallel to rail; trucks down |
| Boardslide | Board yaw near 90° to rail; deck toward rail |

### Latch

```
// soft constraint: project velocity along rail tangent
// cancel separation if assist≥1 within r_snap (L0 small/0)
// require geometric contact — no teleport from far
```

### Balance / exit / interrupt

- Balance meter from lateral lean / contact offset (**hypothesis** fail if |balance| > limit)
- Exit: hop ollie, speed end, player lift, or fail angle → EXIT_AIR/BAIL
- Collision interruption: high impulse off-axis clears latch

---

## 5. Feet / shoes animation

Disembodied shoes; catch uses **board-local catch volumes** (hypothesis radius ~0.12–0.18 m playable scale), **not** millimeter shoe mesh contact.

| Phase | Placement |
| --- | --- |
| Ground both | Nose/tail sockets, slight squash |
| One plant | Planted locked; free follows offset |
| Air | Last offsets + procedural flip lean |
| Catch | Lerp to sockets over damp time |
| Bail | Detach ballistic; reattach on respawn |

---

## 6. Camera (never changes board-local input frame)

| Shot | When | Goal |
| --- | --- | --- |
| Chase low 3/4 | Ground | Feet + 2–4 m ahead |
| Air pull-back | Air | Full rotation readable |
| Grind overhead blend | Grind | Rail path + board yaw |
| Bail wide | Bail | Failure readable |
| Tutorial close | Calib | Pad diagram + shoes |
| Replay | Playback | Same rules; optional free orbit debug |

Transitions: critically damped spring; angular rate clamp. Occlusion: spring-arm sphere cast (optional three-mesh-bvh; not physics authority).

---

## 7. Units and colliders

1 unit = 1 m; board ~0.8 × 0.2 m.
Rails: static capsules `grindable`. Kill volumes: sensors.
