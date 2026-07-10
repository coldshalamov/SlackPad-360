# Game Design Spec — Cycle 1

**Status:** Normative design for first shipping scope
**Access date:** 2026-07-10
**Depends on:** `product-vision.md`, `input-and-trick-spec.md`, `world-ui-audio-spec.md`

---

## 1. Design pillars (operational)

1. **Feet first** — Every meaningful action starts from ContactFrame primitives.
2. **Forgiving start, owned end** — Recognition opens the door; landing/grind/fail close it.
3. **Lines over menus** — Time-to-skate < 30 s from launch (after first calibration).
4. **Readable failure** — Player always knows *why* they bailed.
5. **Small vocabulary, deep combination** — Ollie + flip + shuv + 50-50 compose lines.

---

## 2. Session structure

| Phase | Duration | Content |
| --- | --- | --- |
| Cold start | ≤90 s first run | Stance + rest pose + click test + one ollie gate |
| Warm start | ≤15 s | Spawn in plaza, last profile loaded |
| Free skate | 5–15 min typical | Core product |
| Challenge (optional) | 1–3 min | Score / combo / objective card |
| Replay theater | optional | Input ghosts + board path |

---

## 3. Scoring (v0)

**Recommendation:** Score is **juice and challenge**, not career XP.

| Event | Base | Multipliers |
| --- | --- | --- |
| Ollie / nollie | low | height quality |
| Flip / shuv | medium | rotation completeness, catch timing |
| Grind | per meter + balance quality | switch entry later |
| Combo | chain window ~2.5 s between events | broken on bail or long ground cruise |
| Clean land | bonus | survive cone without clean → no bonus, no bail |

**Do not** require score for free skate enjoyment.

---

## 4. Trick vocabulary v0 (design scope)

| Trick | Role in lines | Unlock |
| --- | --- | --- |
| Push / cruise | Locomotion | start |
| Steer / carve | Pathing | start |
| Ollie / nollie | Gap entry, flip base | start |
| Kickflip / heelflip | Style + score | after ollie tutorial |
| Frontside / backside shuv 180 | Spin + stance change feel | after ollie |
| Catch | Skill expression | automatic window |
| Land / bail | Outcome | automatic |
| 50-50 grind | Rail lines | after land tutorial |

**Deferred post-G2:** manuals, powerslides, reverts, boardslides, nosegrinds, grabs, lip tricks, manuals into grinds.

Exact gesture sequences: `input-and-trick-spec.md`.

---

## 5. Difficulty / assist (design contract)

Assist changes **help radii and damping**, not available tricks.

| Parameter | Assist 0 | Assist 1 | Assist 2 |
| --- | --- | --- | --- |
| Catch angular damping | low | medium | high |
| Land survive cone | narrow | medium | wide |
| Flip ω clamp | player-scaled | mild quantize optional | stronger quantize |
| Grind snap | off/tight | soft | strong |
| False-pop suppression | strict posture | standard | lenient |

Telemetry must log `assistLevel` and each assist intervention (catch damping applied, snap applied) so agency surveys can correlate with truth.

---

## 6. Failure/recovery loop (design)

```
BAIL_DETECT → tag reason → short tumble (≤1.2 s) → control lock
  → optional tip string → RESPAWN at:
      (a) plaza spawn, or
      (b) last grounded checkpoint ring (preferred for line practice)
  → fade-in ≤0.3 s → control restore
```

**Recommendation:** Default respawn = **last checkpoint ring** while free skating; hold button for full plaza reset.

---

## 7. Onboarding beats

1. Rest dual plant (ghost feet align).
2. Steer figure-8 on flat.
3. Hold-push acceleration.
4. Ollie over low curb.
5. Kickflip on flat with catch ghost.
6. Approach tutorial rail for 50-50.
7. Free skate with challenge card offer.

Skip-all available after beat 1 for returning players.

---

## 8. Meta and persistence

| Data | Storage | Notes |
| --- | --- | --- |
| InputProfile | local user config | stance, swap, offsets, thresholds |
| Settings | local | assist, camera, audio, a11y |
| Cosmetics unlock | local | post-G2 |
| High scores | local | per challenge id |
| Recordings | local user folder | opt-in size cap |

No account server in v0.

---

## 9. Explicit design non-goals

- Narrative career, NPCs, shops with economy loops.
- Real-world city recreation of branded spots.
- Photo mode as ship blocker (nice-to-have after G2).
- Mobile touchscreen as primary (different product).
- Always-perfect auto-catch (kills PQ-4 agency).

---

## 10. Verification mapping

| Design claim | Verification |
| --- | --- |
| Time-to-skate ≤30 s warm | Stopwatch playtest |
| Bail ≤1.5 s to control | Telemetry `bail_to_control_ms` |
| v0 vocab complete | Input golden suite + design checklist |
| Progression-light | No mandatory XP gate in free skate |
| PQ bars | `product-vision.md` §7 + observability doc |
