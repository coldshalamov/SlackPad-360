# Cycle 2 Adversarial Review Checklist

Use this checklist to critique cycle 1 without reconstructing reasoning from a transcript. Mark Pass / Fail / Needs data.

---

## Package integrity

- [ ] All required files present under `preproduction/cycles/01-foundation/`
- [ ] `validate-cycle-01.mjs` exits 0
- [ ] Research validators still exit 0
- [ ] `research/` not gutted; `mcps/` untouched
- [ ] No production game implementation tree introduced
- [ ] `assets/runtime/` has no unreviewed shipping candidates
- [ ] Claim labels used (fact / inference / recommendation / hypothesis / unresolved)
- [ ] Primary URLs present beside key API/deps claims

---

## Product

- [ ] Fantasy and non-goals clear
- [ ] “Skate/THUG2 quality” defined as measurable bars (PQ/EX), not AAA brag
- [ ] Session length and progression-light sandbox consistent with game-design-spec
- [ ] Accessibility / assist modes defined

---

## Input / tricks

- [ ] ContactFrame v1 matches research schema or documents bump
- [ ] Foot tracker + dual-lift reassignment specified
- [ ] Click attribution planted-state rules complete
- [ ] Relative board-local control (no pad→world teleport)
- [ ] v0 sequences: push, steer, ollie, nollie, kickflip, heelflip, shuv, catch, land, bail, 50-50
- [ ] Kickflip heelside / heelflip toeside correct
- [ ] Conflict table covers push vs ollie, flip vs shuv, flick vs steer
- [ ] Guaranteed vs inferred vs hypothesis separated
- [ ] Thresholds labeled hypothesis

---

## Physics / camera

- [ ] Hybrid interruptible controller specified
- [ ] Rapier body/collider model + units
- [ ] Grind snap/balance/exit
- [ ] Catch/land cones + bail causes
- [ ] Camera transitions + occlusion + board-relative invariant
- [ ] Measurement list present (not all numbers claimed proven)

---

## Architecture

- [ ] Single primary: host + WebView2 + ContactFrame → TS game
- [ ] Input fallback Raw Input; packaging fallback Electron
- [ ] Transport, fixed step, context loss, security, packaging covered
- [ ] Host language committed with re-eval path

---

## Reuse / deps

- [ ] RawInput.Touchpad, WebView2Samples, Rapier, three, fast-check, three-mesh-bvh, gltf tools, KTX2, SpectorJS audited
- [ ] Each has ownership boundary and reject reason where applicable
- [ ] OSS skate candidates listed with adopt/study/reject
- [ ] AbsoluteTouchEx rejected
- [ ] No fashionable deps without need

---

## Art / assets / world

- [ ] Professional tactile direction (not permanent ugly)
- [ ] Pipeline units/axes/LOD/KTX2/meshopt
- [ ] Catalog fields complete; licenses ledger
- [ ] Plaza features and line loops specified
- [ ] Audio policy and UI/onboarding specified

---

## Observability

- [ ] Determinism + goldens + agent restrictions
- [ ] Hardware matrix + playtest protocol
- [ ] Every major requirement maps to verification method
- [ ] G1–G6 restated with criteria

---

## Risks / open questions

- [ ] Risk register has severity, likelihood, mitigation, validation
- [ ] Open questions have accept / reject / fallback experiments
- [ ] Cycle README unresolved gates match open-questions / risks
- [ ] No hidden “we proved feel/hardware” claims without measures

---

## Consistency cross-checks

- [ ] Same v0 trick list everywhere
- [ ] Same primary architecture everywhere
- [ ] Same camera default everywhere
- [ ] Same agent inject-only rule everywhere
- [ ] decisions.json covers product, input, physics/camera, runtime, art, world/audio/UI, verification, reuse themes

---

## Suggested cycle-2 attack angles

1. C# vs Rust host
2. 120 vs 60 Hz
3. Soft snap magnetism
4. Win11 API pre-release risk → Raw Input primary?
5. Hybrid vs README continuous wording tension
6. Art bar vs CC0 kit reality
7. Whether G2 n≥5 is enough
