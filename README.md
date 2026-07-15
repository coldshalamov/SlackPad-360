# SlackPad 360

SlackPad 360 is a native Windows Precision Touchpad finger-skateboarding game.
Its target is the immediacy of a Tech Deck with the readable lines and forgiving
physicality of an arcade skateboarding game. The supported product path is the
WebView2 build launched by `play.bat`; browser input is only a synthetic
development fixture, not a substitute for independent trackpad contacts.

## Core controls

- Hold index and middle finger side-by-side, both pointing toward the screen.
  In the default right-hand regular stance, the index finger on pad-left is the
  rear/tail foot and the middle finger on pad-right is the front/nose foot;
  goofy stance swaps them.
- The two contacts select the logical front and rear controls, but raw hardware
  jitter does not puppeteer the shoe meshes. While attached, both shoes remain
  planted at fixed deck sockets; only the physical board moves under them.
- The line between the two contacts is the absolute heading target. Rotating the
  pair 90 degrees targets a 90-degree board turn; translating both contacts
  together does not steer, and holding the angle holds heading.
- Ctrl is the only acceleration input. Release it for predictable physical
  wheel braking; finger motion by itself never creates phantom speed.
- Lift the tail finger briefly and tap it back near its previous position for an
  ollie. Lift and retap the nose finger for a nollie. The other finger stays
  planted, initial contact is never a pop, and a distant or slow replant is
  rejected. Physical LMB/RMB clicks are not gameplay inputs.
- The retap is deliberately binary and supplies a dependable base pop. No fake
  click pressure or hidden gesture intensity is invented.
- A short relative swipe after the pop selects kickflip/heelflip direction; a
  curved relative swipe selects frontside/backside shuv. Weak or ambiguous
  motion safely remains an ollie/nollie instead of guessing the wrong trick.
- Gesture speed, accuracy, and confidence grade the rotation and assistance
  within bounded bands. They do not decide whether the retap was allowed to pop.

All presets share that grammar. **Classic** is the default; **Streamlined** adds
recognition tolerance, stabilization, catch help, and landing forgiveness, while
**Experienced** minimizes those aids. Presets change explicit parameter bundles,
not hidden gestures.

## Technical direction

- Three.js, TypeScript, and Vite render the locally hosted WebView2 game.
- Rapier supplies rigid bodies, collision queries, and contact resolution.
- A 60 Hz fixed simulation uses a skateboard-specific four-wheel/truck contact
  solver. Wheel load, suspension, grip, board lean, speed, and truck geometry
  produce support and carving; the old car-oriented vehicle controller is gone.
- The dynamic body uses board geometry plus an effective rider mass/inertia
  proxy. Pop comes from lift plus a downward nose/tail point impulse, and trick,
  catch, landing, and grind responses use bounded impulses/torques rather than
  scripted pose or velocity rewrites.
- A normalized contact-frame input API shared by hardware, replay, and agent
  control.
- A native Windows Precision Touchpad bridge that streams every acquired contact
  sample into the same control pipeline. Button state is retained only as input
  truth for diagnostics and explicit legacy tests; normal play ignores it.
- GLB/glTF assets for the board, shoes, environment, and obstacles.

## Observability

Press `F8` in the native build to open the Flick-It Lab. It records raw contact
frames, lift/retap events, raw button truth, calibrated feet, recognizer phases, `TrickIntentV1`,
rigid-body/contact and camera state, outcomes, and input/simulation/render timing
on one timeline. Attempts can be labeled, replayed, compared, and exported to
`Documents\SlackPad 360\traces`; the report accumulates recognition confusions.

An agent-facing test API will inject the same contact frames as the physical
input adapter. It may reset, step, observe, record, and replay the simulation,
but it will not move the board through a privileged game-only interface.

## Current playable slice

The default level is a dense plaza loop with flat ground, return banks, funbox,
manual pad, stairs and gap, ledges, handrail, seven grind lines, and an alternate
return route. The default camera is a tactile side-on fingerboard view so the
hand, virtual feet, and deck share one readable orientation; press `V` for the
optional route camera.
`flat-dev` and `grind-lab` remain deterministic test levels.

## Development setup

Prerequisites: Node `^20.19.0 || >=22.12.0` (22 LTS recommended) and the
.NET 10 SDK for the Windows host. Pinned versions live in
`preproduction/cycles/03-production/dependency-lock.json`.

```
npm install                # workspaces: packages/shared, packages/game, packages/asset-pipeline
npm run package:win        # verified offline Windows folder + zip
npm run dev                # Vite dev server for the game (browser dev mode, synthetic input)
npm test                   # Vitest unit/golden suites
npm run typecheck          # tsc project references
npm run ci:smoke           # validators + tests + production build (+ host build when SDK present)
dotnet build host/SlackPad.sln   # native WebView2 host (net10.0-windows)
```

For normal play, double-click `play.bat`. It refreshes both the production game
bundle and native host before launch so source changes cannot leave a stale build
on the primary test path.

Repository layout: `packages/shared` (ContactFrame v1 + replay + config
contracts), `packages/game` (Three.js + Rapier game), `packages/asset-pipeline`
(offline GLB authoring/optimization), `host/` (C# WebView2 + touchpad
adapters), `preproduction/` (planning — read-only), `research/` (schemas and
probes). Implementation evidence lands under `preproduction/evidence/impl/`.
