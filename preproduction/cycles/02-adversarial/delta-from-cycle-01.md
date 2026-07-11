# Delta From Cycle 01

**Immutable baseline:** `preproduction/cycles/01-foundation/` @ `53b3f14`
**Rule:** Corrections live here and in cycle-2 specs only. Do not edit cycle 1.

---

## Added

| Item | Cycle-1 reference | Cycle-2 location |
| --- | --- | --- |
| Exact Rapier install/import/bundler strategy + determinism caveats | C1-PHYSICS-HYBRID, `dependencies.json` dep-rapier3d-deterministic | C2-RAPIER-PACKAGE, `assets/catalog/dependencies.json` |
| P0 native spike (files, trace format, gestures, metrics, A/R/F) | OQ-INPUT-01/02 (high-level) | `input-platform-and-device-spec.md` §P0 |
| Device-mode matrix (clickpad, haptic, tap-to-click, zones, contact counts, lifts, ID reassignment, no pressure) | Partial in input-and-trick-spec | `input-platform-and-device-spec.md` §matrix |
| Primitive vocabulary table (plant, lift, kick, slow translate/rotate, flick, sweep, catch, sustained bias) | Sequences only | `input-and-trick-spec.md` §primitives |
| Three physics representation comparison | Single-body commitment without full compare | `physics-animation-and-camera-spec.md` §comparison |
| Maneuver-assist implementable math (state, ω targets, cones, interrupt) | Conceptual ManeuverSpec | `physics-animation-and-camera-spec.md` §assist |
| Feet/shoes visual vs catch volume separation | Cosmetic shoes note | C2-FEET-VISUAL, physics/animation spec |
| Camera shot/transition contract | Chase camera defaults | physics/animation/camera §camera |
| 60 vs 120 Hz as benchmark plan | 120 preferred | C2-HZ-PLAN |
| Host-language switch trigger (C# vs Rust) | C# primary, Rust “re-evaluate” | C2-HOST-LANG |
| Evidence level taxonomy (6 levels) | Mixed n≥5 | C2-EVIDENCE-LEVELS |
| Gate-aware autonomy stop/continue/pivot | Gates listed | `autonomy-and-gate-plan.md` |
| Downloaded vendor assets + hashes + previews | Catalog-only candidates | `assets/source/vendor/*`, catalogs |
| Blender-ready hero board & shoe briefs | Pipeline prose | `asset-selection-and-gap-plan.md` |
| Boardslide as first-ship grind family | Deferred / 50-50 only | C2-BOARD-SLIDE-SCOPE |
| Internet stop log | — | `internet-stop-log.md` |
| Named OSS skate/vehicle source inspections (Godot_Skate, GEVP) with commit+license+algorithms | High-level “study Godot/Unity” only | physics §2.4, reuse §5, sources `oss-godot-skate` / `oss-gevp-vehicle` |
| Cycle-2 validator | cycle-01 validator | `preproduction/probes/validate-cycle-02.mjs` |

---

## Changed

| Item | From (cycle 1) | To (cycle 2) | Why |
| --- | --- | --- | --- |
| Rapier package identity | `@dimforge/rapier3d-deterministic` (URL pointed at -compat) | **Primary:** `@dimforge/rapier3d-deterministic-compat@0.19.3` | Registry evidence + Vite/WebView2 WASM strategy |
| Input API ranking for first executable | Win11 pointer primary, Raw fallback | **Both spiked**; Raw ranked primary for free dual-plant until pointer proves it | MS docs only guarantee pan/zoom WM_POINTER |
| Physics Hz | 120 preferred | **60 default**, 120 quality benchmark | Unmeasured 120 on iGPU |
| Grind scope | v0 50-50 family; boardslide deferred | **Slice:** 50-50 first; **first ship:** boardslide family required | User sideways grind intent |
| Asset catalog | 3 candidates, no files | Selected downloads + gap records | Audit P1 |
| Dependency pins | pin-at-implement only | Exact npm versions as of 2026-07-10 + pin-at-implement rule | Audit P1 |
| Evidence of playtests | n≥5 near ship language | Formative only; separate release confidence | Audit P2 |
| Host language | C# primary | C# primary + **explicit Rust switch trigger** | Adversarial question D5 |

---

## Rejected

| Item | Cycle-1 or alternative | Rejection reason |
| --- | --- | --- |
| Pure browser dual-foot product | Listed alt | Confirmed insufficient (research + PE3 scope) |
| Absolute pad→world control | Rejected in C1 | Reaffirmed |
| AbsoluteTouchEx adoption | Rejected in C1 | Reaffirmed security-hostile |
| Kenney Mini Skate as final visual | Implicit risk in C1 | **Explicit reject-as-final-look** |
| Full articulated rider multi-body for first ship | Alt in physics audit | Cost/stability |
| cannon-es primary | Rejected in C1 | Reaffirmed |
| Shipping assets to `runtime/` this cycle | Policy | Reaffirmed |
| Treating dual-contact as solved by docs | Risk | Explicitly rejected |

---

## Deferred

| Item | Why deferred | Resume condition |
| --- | --- | --- |
| Blender hero board/shoes authoring | Shared Blender process owned by unrelated work | Cycle 3 isolated Blender pass or alternate source |
| Freesound audio downloads | Auth/friction; catalog candidates only | Audio implementation pass with full provenance |
| Production game / host binary | Preproduction cycles incomplete | After cycle 3 + G1 path |
| Soft grind snap constants | Playtest | G2 tuning |
| SharedBuffer transport | Optimization | G3 fail on JSON messaging |
| 360 shuv hard requirement | Recognition risk | After flip/shuv confusion matrix |
| third_party/reference copies | Not uniquely required beyond study links | If spike needs vendored minimal snippets |

---

## Cycle-1 decisions status (reference only)

| Cycle-1 ID | Cycle-2 treatment |
| --- | --- |
| C1-PRODUCT | Preserved + boardslide first-ship delta |
| C1-PHYSICS-QUALITY-BARS | Preserved |
| C1-INPUT-CONTACTFRAME | Preserved |
| C1-INPUT-RELATIVE | Preserved |
| C1-INPUT-CLICK-FSM | Preserved + device matrix |
| C1-TRICK-V0 | Changed grind ship scope |
| C1-PHYSICS-HYBRID | Preserved hybrid; refined body model + Hz |
| C1-CAMERA | Preserved + shot contract |
| C1-RUNTIME | Preserved WebView2; API ranking changed; host switch trigger |
| C1-ART | Preserved quality bar; assets acquired |
| C1-WORLD-UI-AUDIO | Preserved |
| C1-VERIFICATION | Evidence levels refined |
| C1-REUSE-DEPS | Exact pins + Rapier fix |
