# Physics and Game Feel

**Access date:** 2026-07-10

Labels: **confirmed fact** | **inference** | **recommendation** | **hypothesis** | **unresolved**

---

## 1. Engine choice

**Confirmed fact** (Rapier docs):

- `@dimforge/rapier3d` provides WASM 3D rigid bodies, colliders, joints; async init; `world.step()`.
- **Local determinism** by default on same machine/build; **cross-platform determinism** requires `enhanced-determinism` / `@dimforge/rapier3d-deterministic` and careful math (no ad-hoc `Math.sin` for init state).
- Dual license culture of dimforge ecosystem is Apache-2.0 / MIT (verify package LICENSE at pin time).

**Recommendation:** Use **`@dimforge/rapier3d-deterministic`** for agent golden traces and replay; accept SIMD tradeoff. Fixed timestep (60 or 120 Hz) independent of render (`requestAnimationFrame` interpolates).

**Three.js integration pattern (recommendation):**

- Rapier owns simulation transforms.
- Three.js meshes follow via copy translation/rotation each frame (or interpolated).
- Do not use Three.js mesh transforms as physics authority.
- Colliders: simplified capsules/boxes/convex hulls for board/trucks; mesh colliders only for static park where needed.
- Debug: `world.debugRender()` lines into Three.js `LineSegments` during development.

---

## 2. Control–physics coupling models

| Model | Description | Fairness | Feel | Verdict |
| --- | --- | --- | --- | --- |
| **Fully physical tricks** | Fingers apply only forces; flips emerge | Harsh | “Sim” | Reject as sole v1 |
| **Canned animation** | Gesture → clip; physics paused | Low skill depth | Arcade | Reject as sole |
| **Kinematic control** | Directly set board pose from input | Cheatable, agent-risk | Sticky | UI only |
| **Torque-target controller** | PD/torque toward target orient/ω | Good | Responsive | Use in air |
| **Hybrid assisted physics** | Gesture sets targets + impulses; collisions real | Best balance | Skate-like | **Choose** |

### Hybrid pipeline (recommended)

```
ContactFrame → Gesture FSM → ManeuverSpec {impulse, ω_target, duration, catch}
                ↓
         BoardController applies impulses / PD torques on dynamic rigid body
                ↓
         Rapier step: gravity, contacts, rails, walls
                ↓
         Interrupts: hard collision, grind latch, bail thresholds
                ↓
         Scoring labels from outcomes (optional)
```

**Agent rule:** Agent may only inject ContactFrames; never set `ManeuverSpec` or board pose directly.

---

## 3. Ground locomotion

| Behavior | Implementation sketch |
| --- | --- |
| Roll | Dynamic body, low friction wheels approximation (raycasts or capsule + friction anisotropy) |
| Steer | Torque / angular damping toward segment yaw |
| Push | Forward impulse when both planted + kick or hold-push |
| Brake | Optional heel drag (both plant + reverse flick later) |
| Slope | Rapier contacts on ramps; max climb angle soft clamp |

**Hypothesis:** Anisotropic friction (low rolling resistance forward, higher lateral) sells “skate” better than isotropic box friction.

---

## 4. Pop, flip, spin

### 4.1 Pop (ollie / nollie)

1. Enter POP when kick window + plant/lift pattern matches.
2. Apply upward impulse at tail/nose offset (creates pitch).
3. Brief kinematic assist on pitch to clear deck height, then pure dynamic.
4. Front foot slide (if present) modulates horizontal and pitch.

### 4.2 Flips

- Kickflip/heelflip: set roll-axis ω target from flick direction × speed (clamped).
- Optional quantize to N×360° for lower assist levels.
- Under-rotate / over-rotate remains possible → catch window saves or bail.

### 4.3 Shuvs / spins

- Yaw ω target from sweep.
- Body spin (skater mesh) can lag board for style (visual only) without affecting collider if single board body.

---

## 5. Catch, land, bail

| Event | Fair assist | Unfair / too auto | Too harsh |
| --- | --- | --- | --- |
| **Catch** | Soft PD toward wheels-down when feet re-plant in window | Instant perfect level always | No damping; 1° error = bail |
| **Land** | Accept pitch/roll within cone; speed-scale cone | Always stick any orientation | Pixel-perfect |
| **Bail** | Exceed cone, or high vertical impact, or rail face-plant | Random ragdoll | Inescapable death loops |

**Recommendation:** Two landing cones—**survive** (wide) and **clean** (narrow, for score). Bails are cinematic but quick reset (Skate-like, not sim pain).

---

## 6. Grinds

### 6.1 Detection

- Thin colliders or shapecasts along truck line.
- Candidate when: airborne or recent pop, relative velocity aligned, contact with rail tag.

### 6.2 Rail snapping

| Level | Behavior |
| --- | --- |
| 0 Off | Pure physics lock only |
| 1 Soft | Lateral spring toward rail centerline on entry |
| 2 Strong | Reposition trucks to rail if within radius (arcade) |

**Recommendation:** Default **soft snap (1)**; show icon when in snap volume so player trusts system. Strong snap only in “casual” assist.

### 6.3 Balance

- Continuous lean from contact midpoint offset or single-foot bias.
- Balance meter; exceed → slip off.
- Collision with obstacle mid-grind → interrupt to bail/air.

### 6.4 Frustration risks

- Invisible snap volumes → “magnetism.”
- No snap + high precision → “why won’t it grind?”
- Camera hides rail → approach errors.

**Mitigation:** Readable rail materials, optional overhead blend, ghost landing guide on long rails.

---

## 7. Ramps, gaps, collisions

- Ramps: static colliders; maintain speed with low energy loss.
- Gaps: no special case—trajectory from pop + speed; optional subtle updraft is **too auto** (avoid).
- Walls: bounce damping high to avoid pinball.
- Moving objects: later; determinism harder.

---

## 8. Camera coupling to feel

- Camera lag creates perceived input lag—keep follow tight on ground, looser in air.
- Never correct board with camera.
- Landing camera dip should not hide bail reason.

---

## 9. What feels unfair vs automatic

| Unfair (player blames game) | Automatic (player bored) |
| --- | --- |
| Gesture recognized wrong without feedback | Every flick is perfect kickflip |
| Snap to grind from far away invisibly | Auto-catch always levels board |
| Bail after “clean” visual | No fail state |
| Input latency &gt;100 ms | Steering without player input |
| Nondeterministic replays | — |

**Recommendation:** Always show **recognizer debug** in prototype (ghost feet, gesture name, window timers). Ship with optional input theater for learning.

---

## 10. Fixed-step schedule

**Recommendation:**

```
input sample (native) → ContactFrame buffer
for each fixed step:
  consume frames up to step time
  gesture.tick(dt)
  boardController.tick(dt)
  world.step()
  emit events / record
render interpolates board state
```

Physics rate: **120 Hz** preferred if CPU allows; else **60 Hz**. Input should not be bound to render only—buffer timestamps from Scan Time / QPC.

---

## 11. Unresolved

- Exact board mass/inertia for “Tech Deck toy” vs “full skate” fantasy scale (**design choice**).
- Whether skater ragdoll is separate multi-body or animated mesh only (**recommendation:** animated mesh v1, ragdoll later).
- Wheel path vs single hull for grind fidelity (**probe in P3**).
