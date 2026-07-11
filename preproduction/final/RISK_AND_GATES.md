# Risk and Gates

Full risk table: `preproduction/cycles/03-production/risk-register.md`
Full gate ownership: `preproduction/cycles/03-production/unresolved-gates.md`

## Stop / continue / pivot (binding)

| Condition | Action |
| --- | --- |
| G1 accept | Continue slice + later content |
| G1 reject | **Stop expensive content**; input pivot only |
| G2 formative fail (fixable) | Retune assist; retest; no city content |
| G2 structural fail | Pivot grammar; freeze features |
| G3 fail | SharedBuffer / denser framing |
| G4 fail | Fix nondeterminism; block ship |
| G5 fail | LOD/budgets; **never** permanent quality cut as strategy |
| Foreign Blender active | Pause M8; do not touch foreign process |
| .NET 10 SDK missing | Pause host compile; install SDK; do not force net8 as “success” without interop evidence |

## Never claim from synthetic alone

- G1 dual-foot hardware
- G2 fun/fair
- G5 target-machine performance

## Pause packet

Save resumable `pause-packet.json` under `preproduction/evidence/impl/<gate>/` with user actions, continue_when, artifacts, resume_commit.
