# Trick ↔ Primitive Matrix

**Access date:** 2026-07-10
Labels: **confirmed fact** (technique descriptions from cited how-to/wiki references) | **inference** | **recommendation** | **prototype hypothesis**

Technique sources prioritize instructional references of record (WikiHow skate tutorials; Skateboarding Wiki technique pages), not SEO blogs. Fingerboard mapping is **inference** from shared foot-role metaphor (index/middle as feet).

---

## 1. Board motion vs body motion

| Layer | What moves | SlackPad ownership |
| --- | --- | --- |
| **Board motion** | Deck translate; pitch (pop); roll (flip); yaw (shuv / spin); truck lock on grind | Physics body + assist targets from gestures |
| **Body / skater motion** | Crouch, shoulder turn, weight shift, grabs | Mostly **visual** in v0; optional lean affects grind balance |
| **Foot contact motion** | Plant, slide, flick, catch | ContactFrame primitives |

**Recommendation:** Score and fail from **board state** + foot plants. Body animation follows board; do not require separate “body stick” (unlike dual-analog Skate) until later.

**Confirmed fact (EA skate. Flick-It):** franchise maps left stick to steering/body path and right stick to board flip gestures — dual feet on one pad collapse both into two contacts + click ([EA Get Control](https://www.ea.com/games/skate/skate/news/get-control)).

---

## 2. Primitive legend

| Primitive | Kind | Meaning on pad |
| --- | --- | --- |
| `plant` | event | tip down |
| `lift` | event | tip up |
| `hold` | continuous | tip down, low speed |
| `kick` | trigger | Button 1 rising |
| `flick` | categorical | short high-speed path + stop/lift |
| `sweep` | categorical | longer arc / sustained lateral or yaw |
| `slide` | continuous | plant + translate along board axis |
| `catch` | windowed | re-plant in air within window |
| `lean` | continuous | midpoint offset / unequal pressure |

---

## 3. Primitive-by-trick matrix

Legend: **R** = required · **O** = optional / intensity · **—** = not used · **B** = board outcome · **K** = body/cosmetic

| Trick | plant tail | plant nose | lift nose | lift tail | kick | flick nose | flick tail | sweep yaw | slide nose | catch | hold both | lean | Board motion (B) | Body (K) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| **Push / accelerate** | R | R | — | O | O | — | O | — | — | — | R | O | Forward impulse | Push leg anim |
| **Steer / carve** | R | R | — | — | — | — | — | O | — | — | R | R | Yaw rate / lean | Shoulder bank |
| **Ollie** | R | O→lift | R | — | R | O | — | O | O | O | — | — | Pop pitch up, level | Crouch→extend |
| **Nollie** | O→lift | R | — | R | R | — | O | O | O | O | — | — | Nose pop pitch | Crouch→extend |
| **Kickflip** | R | R→flick | R | — | R | R heelside | — | O | O | R | — | — | Pop + roll (heelside flick) | Same as ollie |
| **Heelflip** | R | R→flick | R | — | R | R toeside | — | O | O | R | — | — | Pop + roll (toeside heel flick) | Same |
| **Pop shuvit** | R | O | O | — | R | — | O scoop | R | — | R | — | — | Pop + yaw 180 | Minimal |
| **360 shuv** | R | O | O | — | R | — | O | R | — | R | — | — | Pop + yaw 360 | Minimal |
| **Catch** | O | O | — | — | O | — | — | — | — | R | — | — | Damp ω toward level | Feet pin deck |
| **Manual** | O one truck | O | — | — | — | — | — | O | — | — | O | R | Balance pitch about truck | Arms out |
| **Powerslide** | R | R | — | — | O | — | — | R | R | — | R | R | Yaw slide, speed loss | Rotate shoulders |
| **Revert** | R | R | — | — | O | — | — | R | — | — | O | R | 180 yaw to switch | Body 180 |
| **50-50 grind** | air→both | air→both | — | — | O | — | — | O | — | O | O | R | Lock both trucks | Balance |
| **5-0 / nosegrind** | air selective | air selective | — | — | O | — | — | O | — | O | O | R | One truck lock | Weight shift |
| **Boardslide / lipslide** | air | air | — | — | O | — | — | R | — | O | O | R | Deck on rail, 90° | Hips square/open |
| **Failed landing / bail** | mistimed | mistimed | — | — | — | — | — | — | — | miss | — | — | Unstable contact | Ragdoll anim |

### Technique notes (board vs feet)

**Ollie** — Back foot on tail pops board; front foot slides up and levels (**confirmed fact** instructional: [WikiHow Ollie](https://www.wikihow.com/Ollie)). Pad: tail plant + kick + nose lift/slide.

**Nollie** — Roles reversed: nose pops, rear guides (**confirmed fact** nollie role reversal: [Skateboarding Wiki Ollie / related](https://skateboarding.fandom.com/wiki/Ollie)).

**Kickflip** — Ollie + front foot flicks **heelside** edge (toward heels) so the board rolls; matrix `flick nose` = **heelside** (**confirmed fact**: [WikiHow Kickflip](https://www.wikihow.com/Kickflip-on-a-Skateboard) — slide front foot to front heel-side edge; [Wiki Kickflip](https://skateboarding.fandom.com/wiki/Kickflip)).

**Heelflip** — Ollie + front **heel** flicks **toeside** edge (opposite roll to kickflip); matrix `flick nose` = **toeside** (**confirmed fact**: [WikiHow Heel Flip](https://www.wikihow.com/Heel-Flip)).

**Shuvit / pop shuvit** — Board yaws under feet; pop optional but common; body may stay facing (**inference** from standard definitions; board yaw primary).

**Catch** — Feet re-pin rotating board before land; timing skill (**inference** / skate culture; game maps to re-plant window).

**Manual** — Balance on two wheels; continuous pitch control (**inference** standard trick).

**Powerslide** — Intentional sideways slide to scrub speed; board yaw + friction (**inference**).

**Revert** — 180° to reverse direction, often from transition (**inference**).

**Grinds** — Trucks or deck lock to edge; entry from air or 50-50 approach; balance continuous (**inference** + prior hybrid physics design).

### Fingerboard mapping (**inference**)

Index ≈ front foot, middle ≈ back foot (or reverse after stance). Pop = rear press + click; flick = front finger lateral snap. No separate “shoulders” — body spin may be omitted or mapped from dual-contact rotate while airborne (**prototype hypothesis**).

---

## 4. Recognition priority (v0 ship set)

1. Push, steer
2. Ollie / nollie
3. Kickflip / heelflip (1×)
4. Pop shuv 180
5. Catch + land/bail
6. 50-50 grind

Defer: manuals, powerslide, revert, complex grind catalog — after G2 feel gate.

---

## 5. Conflict rules (gesture FSM)

| Conflict | Resolution |
| --- | --- |
| Push vs ollie | Both plant + kick → push; nose lift + tail plant + kick → ollie |
| Flick vs steer | Flick valid only in air trick window or free foot lifted |
| Shuv vs flip | Dominant axis of free-foot motion (lateral vs circular) — **hypothesis** thresholds |
| Manual vs grind | Height + rail proximity; manual is ground pitch hold without rail tag |
| Catch vs early plant | Phase = AIR and ω above epsilon |

---

## 6. Unresolved / playtest

- Exact flick direction axes after natural hand angle.
- Whether body varial needs any pad signal in v0.
- Grind family expansion list.
