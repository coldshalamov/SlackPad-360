# G2 — Formative human test: does grinding feel fair?

**Gate:** G2 (fun / fairness). **Milestone under test:** M6 grinds (50-50 + boardslide).
**Blocks:** M9 (scoring + HUD). See `pause-packet.json` for the machine-readable gate.

Grinds are the part of SlackPad most at risk of feeling "difficult, confusing, and
broken." Green tests prove the grind system is **deterministic** and **structurally
fair** (no teleport, visible candidate, forgiving balance, explicit rejection) — but
they cannot prove it *feels* fair. That is what this human pass establishes, and it
**cannot be claimed from synthetic runs** (final-observability §1).

## Prerequisite (do not skip)

The rail obstacles must be **visible** before testing. Grinding an invisible rail is
itself an automatic fairness failure ("camera hides rail → approach errors",
research §6.4). The colliders + geometry exist; the render layer must draw:

- `FLAT_DEV_LEDGE` — wide forgiving ledge, **+X side**, top y = 0.15, z = 2..30
- `FLAT_DEV_RAIL` — thin rail, **−X side**, top y = 0.4, z = 2..30

(both exported from `packages/game/src/sim/levels/flat-dev.ts`).

## Run it

1. Double-click **`play.bat`** at the repo root (native trackpad, WebView2 host).
2. Plant **two fingers** to ride; cruise forward; steer left/right toward an obstacle;
   ollie onto it; ride; hop or slip off.
3. Try assist **0 / 1 / 2** (default 1). L0 = pure physics (land dead-on); L2 = stronger snap.
4. **n ≥ 5 players.** ~20–30 min each. Light framing only — do **not** coach the entry.

## Survey (each player, after their session)

Rate 1–5 (1 = strongly disagree, 5 = strongly agree) and add a sentence:

| # | Question |
| - | -------- |
| 1 | Grinding felt **fair** — when I locked on, stayed on, or slipped off, I understood why. |
| 2 | The snap felt **trustworthy**, not magnetic — it never grabbed a rail I didn't mean to grind, and never refused one I lined up. |
| 3 | Coming off a grind (hop / slip / bail) was **readable** — I knew why it ended. |
| 4 | Catching / landing tricks felt **skillful**, not automatic or random. |
| 5 | Steering onto the rail felt **intuitive**. |

Free text (capture verbatim):

- Any moment you thought **"why did it grind?"** or **"why won't it grind?"** — what were you doing?
- Anything that felt **unfair** or **broken**?
- Did it deliver the **"mindlessly grinding back in time to childhood"** Tech-Deck feel?

## Verdict → `survey-summary.md`

Aggregate the ≥ 5 responses into `survey-summary.md` in this folder: per-question
score distribution, the verbatim frustration quotes, and a **PASS** or **REVISE** verdict.

- **PASS** → resume at M9. Record the resume commit.
- **REVISE** → retune `GrindConfig` (see `pause-packet.json` → notes for the exact knobs:
  `candidateVolumeRadius`, `rSnap`, `latchLateralSpring`, balance gains, envelopes,
  speed window) and re-run this pass. Do **not** proceed to M9 on a failing verdict.
