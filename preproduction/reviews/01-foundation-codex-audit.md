# Codex Audit - Cycle 01 Foundation

**Audit date:** 2026-07-10
**Baseline commit:** `53b3f14`
**Verdict:** Accept as a foundation, not as the final build contract.

Cycle 1 is internally coherent after its self-check, preserves the earlier research, labels measured facts separately from hypotheses, and gives cycle 2 a useful target. It does not yet satisfy the user's stronger request to have the selected assets, exact dependencies, and major implementation risks settled in one place.

## Findings

### P1 - The selected Rapier package name is not exact

Cycle 1 repeatedly commits to `@dimforge/rapier3d-deterministic`, while its own source URL and the currently published npm package use `@dimforge/rapier3d-deterministic-compat`.

- Baseline evidence: `assets/catalog/dependencies.json` lines 20-30 and `physics-and-camera-spec.md` lines 5 and 218.
- Current primary evidence: https://www.npmjs.com/package/@dimforge/rapier3d-deterministic-compat
- Upstream determinism constraints: https://rapier.rs/docs/user_guides/javascript/determinism/

**Cycle-2 requirement:** verify the exact package/export/bundler choice, pin a tested version or a deterministic selection rule, and explain whether ordinary Rapier WASM is already deterministic enough for this architecture. Do not preserve a convenient but nonexistent package name.

### P1 - The asset workspace is a policy shell, not an execution-ready asset library

The catalog contains three broad candidates, no selected per-asset URLs, no downloaded files, no checksums, no captured license texts, no previews, no hero board/shoes source, and no audio selection. Keeping `assets/runtime/` clean was correct for cycle 1, but it does not meet the final preproduction objective.

**Cycle-2 requirement:** identify exact assets, verify each asset page and license, acquire only approved redistributable source files, record hashes and provenance, generate previews, and explicitly identify what must be authored in Blender. A generic Kenney kit cannot silently become the final look.

### P1 - The physical input gate cannot be researched away

Microsoft currently documents Windows 11 touchpad-capable APIs, but the documentation says registered windows receive touchpad `WM_POINTER` messages for two-finger pans and zooms. It does not prove that the target laptop exposes the free, independent two-foot stream the game needs. The pre-release disclaimer also remains current.

- Primary evidence: https://learn.microsoft.com/en-us/windows/win32/input-precisiontouchpad/registertouchpadcapable
- Baseline correctly retains G1 and a Raw Input fallback.

**Cycle-2 requirement:** define the smallest native hardware spike and its exact accept/reject traces. The final autonomous goal must run this before expensive content work and must include a Raw Input branch. This is an empirical gate, not an internet-research TODO.

### P1 - The single-body physics recommendation needs a harsher fidelity audit

Cycle 1 selects one dynamic board body with cosmetic shoes and an invisible mass bias. That is a sensible prototype simplification, but it has not established that the model can deliver convincing truck lean, wheel contact, coping/rail interaction, catches, off-axis landings, and readable failed tricks at the requested Skate/THUG2 feel bar.

**Cycle-2 requirement:** compare at least three candidate physical representations, including a single-body assisted model, constrained wheel/truck contacts, and a more articulated alternative. Specify which phenomena are simulated, assisted, animated, or deliberately omitted. Use open-source implementations only where their code and licenses are actually inspectable.

### P1 - Autonomy must be gate-aware

An agent can build and test deterministic mechanics through ContactFrame injection, but it cannot certify the target trackpad's contact stream, ergonomics, or human fun by simulation. A single prompt that continues blindly after G1 or feel failure would spend heavily on the wrong product.

**Cycle-2 requirement:** define stop/continue/pivot semantics and the evidence bundle the autonomous agent must leave at each gate. Human/device gates should pause with a concise test request; everything else should continue autonomously.

### P2 - The prototype and ship evidence levels are conflated

`n >= 5` is reasonable for an early formative playtest, but too weak as a general shipping-quality claim. Some thresholds also encode arbitrary percentages before baseline data exists.

**Cycle-2 requirement:** separate smoke, formative, tuning, and release evidence levels; include confidence intervals or repeated-trial rules where they add value; mark provisional thresholds as calibration targets rather than facts.

### P2 - The click grammar needs a device-specific fallback table

Cycle 1 correctly treats Button 1 as report-level and infers the kicking foot from planted state. It still needs a complete behavior table for mechanical clickpads, haptic clickpads, tap-to-click, Windows left/right click zones, zero/one/two contacts, simultaneous lift, and ambiguous attribution.

**Cycle-2 requirement:** make those modes explicit and decide which are supported, configurable, ignored, or rejected.

### P2 - Visual quality needs inspectable reference targets

The art direction is verbal and measurable at a high level, but there is no mood board, hero-board material study, shoe silhouette target, plaza composition reference, or representative frame budget proof.

**Cycle-2 requirement:** create legally retainable references/previews and a shot-based visual acceptance rubric. Bespoke Blender work must wait for an isolated pass because another repository currently owns the active Blender process; cycle 2 should produce the exact modeling brief without touching that process.

## Validation Performed

- `node preproduction/probes/validate-cycle-01.mjs` - pass
- `node research/probes/validate-deliverables.mjs` - pass
- `node research/probes/validate-followup.mjs` - pass
- `git diff --check` before commit - pass
- JSON manifests parsed and counts inspected
- Primary-source spot checks for Rapier determinism/package identity and Windows 11 touchpad-capable registration

## Cycle-2 Exit Standard

Cycle 2 should not claim that all unknowns are gone. It should demonstrate that every remaining unknown is one of:

1. resolved with cited evidence;
2. resolved by a selected and locally retained asset/dependency;
3. assigned to a cheap executable probe with accept/reject/fallback criteria; or
4. inherently human/device empirical and placed at the correct stop gate.
