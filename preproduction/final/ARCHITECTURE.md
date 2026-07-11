# Architecture (Normative Summary)

Full detail: `preproduction/cycles/03-production/final-technical-architecture.md`.

## Stack

| Layer | Choice |
| --- | --- |
| Host | C# **`net10.0-windows`** + WebView2 Evergreen |
| WebView2 SDK | **Microsoft.Web.WebView2 1.0.4078.44** |
| Game | TypeScript, Vite **8.1.4**, Three **0.185.1** |
| Physics | **`@dimforge/rapier3d-deterministic-compat@0.19.3`**, fixed **60 Hz** |
| Node | engines `^20.19.0 \|\| >=22.12.0` (recommend 22 LTS) |

## Pipeline

Hardware/Raw+Pointer adapters → **ContactFrame v1** JSON batches → InputHub → FootTracker → GestureFSM → BoardController/ManeuverAssist → Rapier → Three interpolate.
Agent/replay/synthetic share InputHub. **No** direct trick/pose API.

## Ownership (one line each)

- Host: HID only → frames
- GestureFSM: intent labels
- ManeuverAssist: interruptible envelopes
- Rapier: collisions/fails truth
- Three: presentation only
- Agent: inject/observe only

## Clocks

Sim integer step authority; render interpolates; wall clock UI-only.

## Replay

Header: `replayVersion`, gameVersion, rapierVersion, hz, seed, levelId, contactFrameSchema.
Body: ContactFrames + checkpoint hashes.
