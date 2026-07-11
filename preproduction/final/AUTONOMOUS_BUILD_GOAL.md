/goal

# SlackPad 360 — Autonomous First-Ship Build

You are an autonomous implementation agent. Execute this goal from the **repository root** of SlackPad 360 without needing the preproduction conversation history.

## Authoritative references (read first)

1. `preproduction/final/README.md` — navigation + readiness verdict
2. `preproduction/final/ARCHITECTURE.md`
3. `preproduction/final/IMPLEMENTATION_PLAN.md`
4. `preproduction/final/ACCEPTANCE_MATRIX.md`
5. `preproduction/final/ASSET_MANIFEST.md`
6. `preproduction/final/RISK_AND_GATES.md`
7. `preproduction/cycles/03-production/final-*.md` (full normative specs)
8. `preproduction/cycles/03-production/dependency-lock.json`
9. `preproduction/cycles/03-production/asset-readiness.json`
10. `preproduction/cycles/03-production/milestones.json`
11. `research/probes/contact-frame.schema.json`
12. `assets/catalog/*`

**Supersession:** `preproduction/final/` and cycle-03 win over cycles 1–2. Do not rewrite cycle-1 or cycle-2 files.

---

## 0. Bootstrap (mandatory before coding)

1. `git status` and `git rev-parse HEAD`. Record dirty tree. **Preserve unrelated work**; do not wipe user changes.
2. Run existing validators under `research/probes/` and `preproduction/probes/`.
3. Confirm no foreign Blender ownership conflict before any art milestone (see §Blender).
4. Install prerequisites if missing (do not half-implement around them silently):
   - Node engines `^20.19.0 || >=22.12.0` (prefer 22 LTS)
   - .NET **10** SDK (`net10.0-windows`) — **not** .NET 8 as the selected final host
   - WebView2 Evergreen runtime; NuGet `Microsoft.Web.WebView2` **1.0.4078.44**
5. Pin JS packages per `dependency-lock.json` (three 0.185.1, rapier deterministic-compat 0.19.3, vite 8.1.4, typescript 5.9.3, vitest 4.1.10, fast-check 4.9.0, etc.).

---

## 1. Product contract (non-negotiable)

- Windows-first 3D skate/fingerboard game.
- Two trackpad contacts = two feet.
- Physical click = discrete kick/pop; plant/lift/slow translate-rotate/flick/sweep/sustained bias/catch complete the vocabulary.
- Slow continuous; fast categorical.
- Regular/goofy + hand-angle calibration first-class.
- Hybrid interruptible maneuvers: recognition opens envelopes; collision/catch/land/grind/failure remain physical.
- Disembodied detailed shoes + detailed unbranded board OK; no full humanoid required.
- Professional tactile visuals; compact line-rich plaza; stable 60 FPS on target laptop class. **No permanent low-quality art strategy.**
- Vertical slice: push/steer/ollie/nollie/flips/shuvs/catch/land/bail + **50-50**.
- First ship: + **boardslide family**, hero art, plaza, UI, audio, packaging.
- Human hardware, replay, synthetic, agents share **ContactFrame-derived** pipeline.
- **No direct trick or pose API** for agents.
- Pure browser is **not** the human dual-foot product; native host + WebView2 owns hardware input.

---

## 2. Architecture you must implement

```
Host (C# net10.0-windows): Raw Input adapter (primary ranking) + Win11 pointer adapter
  → ContactFrame v1 batches via PostWebMessageAsJson
Game (TS/Vite): InputHub → FootTracker → GestureFSM → BoardController/ManeuverAssist
  → Rapier fixed 60 Hz → Three interpolate
  → UI/Audio/Telemetry/Replay/AgentHarness
```

- Rapier package: `@dimforge/rapier3d-deterministic-compat@0.19.3` only as primary.
- Physics Model A: single dynamic board body + assist; Model B raycast wheels only as measured probe if rails fail.
- Public Agent API: `reset`, `injectContactFrame`, `step`, `observe`, recording/replay helpers only.
- Forbidden: `forceTrick`, `setBoardPose`, public `applyImpulse` cheats.
- Replay header versioning per final-technical-architecture.md.
- Empirical constants parameterized in config, not magic undocumented literals only.

Module ownership and envelopes: `preproduction/cycles/03-production/final-technical-architecture.md`.
Input/trick grammar: `final-input-and-trick-spec.md`.
Physics/assist/grind/camera: `final-physics-animation-camera-spec.md`.

---

## 3. Asset rules

- Use acquired licensed sources from `assets/source/vendor/` per catalog.
- **`assets/runtime/` stays empty** until quality + license + runtime-format review evidence.
- Hero board, shoes, pro plaza = **bespoke** (see Blender contract). Kenney mini-skate = blockout only.
- Audio packs are **proxies** until listen/mapping pass.
- Do not lower quality to mark boxes complete.

---

## 4. Milestone order (commit after each accepted milestone)

Execute **M0 → M10** per `IMPLEMENTATION_PLAN.md` / `milestones.json`.

### G1-first rule

- Start with **environment (M0)** then **P0 dual-contact hardware spike (M1)** before expensive content.
- You may build M2–M5 software path with synthetic ContactFrames in parallel **after M0**, but:
  - **Never claim G1/G2/G5 from synthetic tests alone.**
  - **Failed G1 stops expensive content** (do not run M8/M9 content marathons). Synthetic recognizer/sim work may continue only if reusable after an input pivot.
- Prefer G1 accept before human G2 on M6.

### Each milestone must include

Scope from plan; unit/golden/integration tests; agent scenarios via ContactFrames only; visual checks where applicable; commit boundary message from plan.

### Verification each milestone

- Run targeted tests (Vitest/goldens/host contracts as available).
- Browser/WebView2 interaction, screenshots, canvas-pixel nonblank checks when renderer exists.
- Deterministic agent playtests via inject-only API.
- Leave evidence under `preproduction/evidence/impl/<milestone-or-gate>/` in machine-readable JSON where specified.

---

## 5. Pause-only gates (smallest user action)

Continue autonomously through software-verifiable work. **Pause only** at:

| Gate | When | Smallest user action | Artifact |
| --- | --- | --- | --- |
| **G1** | Before dual-foot claim; before expensive content if not accepted | Run P0 gesture script T1–T11 on target laptop; save traces | `metrics.json` + JSONL |
| **G2** | Before fun/fair ship claims | Play 20–30 min; formative survey n≥5 | survey summary |
| **G3** | Before ship latency claims | Instrumented play session | latency histogram |
| **G5** | Before content freeze / ship perf claims | Run slice on target iGPU | FPS p95 log |
| **G-BLENDER** | Before hero art authoring | Confirm no foreign Blender; free ownership | ownership note |

Write resumable `pause-packet.json` (gate, why, user_actions, continue_when, artifacts_needed, resume_commit, next_milestone). Do **not** restart from zero after resume.

---

## 6. Blender ownership rule (hard)

- Do **not** invoke, inspect, control, save, close, or reuse a **foreign** Blender process (e.g. another game).
- Do **not** create a second Blender process that interferes with foreign work.
- Use Blender **only** when: (a) no foreign Blender is active (or user explicitly grants SlackPad-only session), and (b) output paths are explicit under this repo (`assets/source/blender/...`).
- Otherwise **pause M8** without touching the foreign process.
- Follow isolated contract in `final-art-assets-world-audio-spec.md`.

---

## 7. Quality and anti-reward-hacking

- Professional visuals required for ship; temporary proxies must be labeled non-final.
- **Prohibit** performance “wins” via permanent quality reduction. Use LOD, meshopt, KTX2, density control.
- Proven dependencies only per lockfile.
- Done definition: **playable packaged first-ship scope**, not a code scaffold.

---

## 8. Failure / pivot behavior

- G1 reject → stop plaza/hero content; pivot input; save evidence.
- G2 unfun fixable → retune assist; retest; no city-scale content.
- G3 fail → SharedBuffer/denser framing.
- G4 fail → fix nondeterminism; block ship.
- G5 fail → budgets/LOD; never permanent toy look.
- net10 interop fail only with measured evidence may document downgrade; default remains net10.0-windows.

---

## 9. Final report format (when done or paused)

Write `preproduction/evidence/impl/FINAL_REPORT.md`:

```
# SlackPad 360 build report
status: done | paused | pivoted
head: <git sha>
milestones_completed: [M0, ...]
gates:
  G1: accept|reject|pause|untested
  G2: ...
  G3: ...
  G4: ...
  G5: ...
  G6: ...
  G-BLENDER: ...
artifacts: [paths]
known_gaps: [...]
how_to_resume: ...
```

---

## 10. Explicit non-goals during this build

- Do not rewrite preproduction cycles 1–2.
- Do not claim research gates solved by documentation alone.
- Do not scrape authenticated asset sites.
- Do not touch unrelated repositories or foreign Blender assets.

Begin at M0 now.
