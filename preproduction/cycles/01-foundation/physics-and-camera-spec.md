# Physics and Camera Spec — Cycle 1

**Status:** Normative architecture; numeric values labeled **hypothesis** until prototype measurement
**Access date:** 2026-07-10
**Engine:** `@dimforge/rapier3d-deterministic` + Three.js presentation
**Docs:** https://rapier.rs/docs/user_guides/javascript/getting_started_js/ · https://rapier.rs/docs/user_guides/javascript/determinism/

---

## 1. Hybrid maneuver controller

```
ContactFrame → FootTracker → GestureFSM → ManeuverSpec
                                      ↓
                         BoardController (impulses / PD torques)
                                      ↓
                              Rapier world.step()
                                      ↓
                    interrupts: collision, grind latch, bail thresholds
```

| Layer | Authority |
| --- | --- |
| GestureFSM | Opens/closes assist windows; emits labels |
| BoardController | Applies forces/torques within clamps |
| Rapier | Integration, contacts, friction, joints |
| Scoring | Names outcomes from board state |

**Agent rule:** inject ContactFrames only — never ManeuverSpec or pose.

### ManeuverSpec (conceptual fields)

```
{
  kind: "none" | "push" | "pop" | "flip" | "shuv" | "catch" | "grind",
  linearImpulse: vec3,      // world or board local; documented per kind
  angularVelocityTarget: vec3, // PD target ω
  torqueGain: number,
  durationSteps: number,
  catchAssist: number,      // 0..1 scaled by assist level
  interruptible: true
}
```

---

## 2. Units, board dimensions, mass

**World units:** 1 unit = 1 meter (**recommendation**).

**Board-local axes (normative, matches asset pipeline):** right **+X**, up **+Y**, nose/forward **+Z**. Heel→toe is −X→+X; tail→nose is −Z→+Z. Rolling resistance is low along **+Z**; lateral grip is higher along **±X**.

### Visual vs playable scale

| Mode | Description | Recommendation |
| --- | --- | --- |
| **Playable plaza scale** | Skater-scale ~1.7 m stand-in; board ~0.80 × 0.20 m | **Default fantasy** for gaps/rails readability |
| **Toy fingerboard literal** | ~10 cm board | Reject for plaza lines (camera/feel wrong) |

Use **playable skate scale** with fingerboard *control metaphor* (feet = fingers).

### Board body (hypothesis — tune in P3)

| Property | v0 hypothesis | Notes |
| --- | --- | --- |
| Deck length | 0.80 m | visual mesh may differ slightly |
| Deck width | 0.20 m | |
| Deck thickness collider | 0.04 m box or convex | |
| Wheel radius | 0.03 m | |
| Truck width | ~0.15 m axle | |
| Mass | 3.5–4.5 kg board-only **or** 65–75 kg skater+board aggregate | **Choose aggregate single body v0** |
| Inertia | Rapier computed from colliders + density | Avoid hand-zero inertia |

**v0 body model:** **Single dynamic rigid body** for board (+ invisible mass for skater COM bias). Skater mesh animated/cosmetic. Multi-body ragdoll **deferred**.

---

## 3. Collider model

| Part | Collider | Dynamic? |
| --- | --- | --- |
| Deck | Box or convex hull (simplified) | part of board body |
| Trucks | Two small boxes/capsules under axles | same body or fixed children |
| Wheels | 4 spheres or capsules **or** raycast wheel approx | prefer raycast/sphere for rolling |
| Rails | Capsule/thin box static, tag `grindable` | static |
| Ledges | Box static + grind edge child | static |
| Ramps/banks | Mesh or trimesh static (convex decomposition preferred) | static |
| Kill volumes | Sensors | static |

**Recommendation:** Rapier owns collision. three-mesh-bvh only for **render** raycasts / tools — not second physics authority.

---

## 4. Rolling, friction, trucks

| Behavior | Approach | Label |
| --- | --- | --- |
| Forward roll | Low rolling resistance along board **+Z** (nose) | Hypothesis anisotropy |
| Lateral grip | Higher friction along board **±X** (heel/toe) | Hypothesis |
| Truck turn | Steer rate from input → yaw torque; optional lean roll | Recommendation |
| Wheel model | Raycasts at 4 corners: suspension spring + friction cone | P3 probe |
| Simple fallback | Single hull + anisotropic friction | If raycast unstable |

**Must measure in P3:** max stable steer at speed; ramp energy loss; tip-over threshold.

---

## 5. Ground locomotion forces

| Input | Force |
| --- | --- |
| Both plant hold | Continuous forward force clamped by max speed |
| Push pulse (both+kick) | Impulse forward |
| Steer yaw rate | Torque about up axis; speed-sensitive gain |
| Brake (deferred) | Reverse friction / heel drag later |

Max speed soft cap (**hypothesis** 8–12 m/s plaza) to keep lines readable.

---

## 6. Air control, pop, flip, shuv

### Pop (ollie/nollie)

1. Impulse up at tail/nose offset → pitch.
2. Brief pitch assist to clear deck height, then dynamic.
3. Pop height scales with timing quality within [h_min, h_max] — intensity affects expression, not binary success at Assist 2.

### Flip

- Set roll-axis ω target from flick sign × speed, clamped.
- Assist may soft-quantize toward N×2π.
- Under/over rotate remains possible → catch/bail.

### Shuv

- Yaw ω target from sweep integral.
- Soft quantize to 180° at Assist 1–2.

### Air steer

- Limited yaw/pitch rate from residual planted contact motion (**bounded**); cannot invert unfairly mid-flip at Assist 0.

---

## 7. Catch and landing cones

| Cone | Purpose | Hypothesis half-angle |
| --- | --- | --- |
| Survive | Stay upright | pitch/roll ≤ 35–45° |
| Clean | Score bonus | pitch/roll ≤ 12–18° |

Catch: PD damp ω toward identity wheels-down while feet planted in window; gain × assist.

Bail causes (normative list):

1. Land outside survive cone
2. Vertical impact speed > `impactBail`
3. Grind balance ≤ 0
4. High impulse collision while unstable
5. Catch timeout with |ω| still high at ground contact

---

## 8. Grind system (50-50 family)

### Detection

- Shapecast / contact events on truck colliders vs `grindable` tag.
- Candidate if: airborne or `recentPop`, alignment angle < θ, lateral speed relative rail < v_lat.

### Snap

| Assist | Snap |
| --- | --- |
| 0 | Physics lock only / tiny radius |
| 1 | Soft lateral spring to rail centerline within R_soft |
| 2 | Stronger reposition within R_strong |

Show **snap volume feedback** (subtle highlight) so magnetism is honest.

### Balance

- Continuous meter 0–1 from foot midpoint offset vs rail.
- Decay on high speed wobble; recover with centered lean.
- Collision with obstacle → interrupt exit to air/bail.

### Exit

- Pop/jump impulse off rail
- Rail end → air with remaining velocity
- Balance fail → slip off

**Snap limits:** never pull from > R_strong; never rotate board > snapAngleMax on entry.

---

## 9. Fixed-step schedule

```
native sample → ContactFrame ring buffer (timestamped)
while accumulator >= dt:
  consume frames with t <= stepTime
  gesture.tick(dt)
  boardController.tick(dt)
  world.step()
  record telemetry
  accumulator -= dt
render: interpolate board pose
```

| Clock | Rate | Notes |
| --- | --- | --- |
| Physics | **120 Hz preferred**, 60 Hz minimum | `dt = 1/120` or `1/60` fixed |
| Render | 60 FPS target | independent |
| Input | device ~100 Hz class | **hypothesis** until measured |

**Rapier package:** `@dimforge/rapier3d-deterministic` for golden traces (**confirmed fact** package exists for cross-platform determinism; pin version at implement time). License Apache-2.0 (verify package LICENSE at pin) — https://www.npmjs.com/package/@dimforge/rapier3d-deterministic-compat

---

## 10. Camera — low three-quarter chase

### Default pose (hypothesis constants)

| Param | Value |
| --- | --- |
| Follow distance | 3–5 board lengths |
| Height | 1.2–1.8 m |
| Lateral bias | slight, opposite turn |
| Look-ahead | board pos + vel × 0.15–0.35 s |
| FOV | 50–60° vertical |
| Ground follow lag | tight (low lag) |
| Air follow lag | looser; pull back + tilt up for flip read |
| Grind blend | 10–20% toward overhead |
| Landing | damp shock; no violent snap |

### State transitions

| From | To | Trigger | Blend |
| --- | --- | --- | --- |
| GROUND | AIR | board leave ground | 150–250 ms |
| AIR | GROUND | land | 100–200 ms |
| * | GRIND | grind enter | 200 ms + overhead blend |
| GRIND | AIR/GROUND | grind exit | 200 ms |
| * | BAIL | bail | settle then soft follow |
| * | RESET | respawn | cut or 100 ms fade |

### Occlusion

- Spring-arm sphere cast from board to camera; push-in on hit.
- Never clip below ground plane.
- Prefer transparent occluders only if art supports; else push-in.

### Board-relative input invariant

**Camera never rewrites foot→board mapping.** Orbit/photo mode does not change stance axes during gameplay.

### Alternates

| Mode | Use |
| --- | --- |
| Side | Training / flip profile |
| Overhead assist | Optional grind toggle |
| Free look | Pause / photo only |

---

## 11. Prototype measurement list (do not guess)

| ID | Measure | Phase |
| --- | --- | --- |
| M-PH-1 | Stable max speed and steer authority | P3 |
| M-PH-2 | Pop height distribution vs timing | P4 |
| M-PH-3 | Land cone success vs assist | P4 |
| M-PH-4 | Flip catch agency survey | P5 |
| M-PH-5 | Grind entry rate vs snap radius | P6 |
| M-PH-6 | Physics step CPU ms p95 | P3/P8 |
| M-CAM-1 | Occlusion complaint rate | playtest |
| M-CAM-2 | Motion discomfort rate | E6 |
| M-CAM-3 | Preferred camera forced choice | A/B |

---

## 12. Unresolved physics choices

- Final mass aggregate vs board-only.
- Raycast wheels vs hull.
- 120 vs 60 Hz final default on iGPU.
- Exact cone degrees and snap meters.

All converted to experiments in `open-questions.md`.
