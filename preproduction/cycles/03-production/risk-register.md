# Risk Register — Cycle 3 Final

| ID | Risk | Severity | Likelihood | Mitigation | Validation | Owner |
| --- | --- | --- | --- | --- | --- | --- |
| R1 | Free dual-plant fails on target PTP | Critical | Medium | Dual adapters; G1 stop content | M1 metrics | platform |
| R2 | Click/false pop unusable | High | Medium | Device matrix; suppress options | Hardware matrix | input |
| R3 | Assist feels magnetic/unfair | High | Medium | Assist levels; interrupt goldens; G2 | Formative + goldens | physics |
| R4 | Boardslide vs flip yaw confusion | Medium | Medium | Conflict table; hysteresis | GT-recog-conflict | design |
| R5 | Single-body rail fidelity fail | Medium | Medium | Model B probe | P3 metrics | physics |
| R6 | Determinism break | High | Low | Pin Rapier; fixed step; goldens | G4 | eng |
| R7 | Latency > budgets | Medium | Medium | SharedBuffer fallback | G3 | platform |
| R8 | Hero art delayed (Blender ownership) | High | High | Isolated contract; proxy labeled non-final | M8 pause packets | art |
| R9 | Audio feels wrong (proxies) | Medium | High | Listen pass; field audio later | Audio map review | audio |
| R10 | Perf miss on iGPU | High | Medium | LOD/budgets not permanent quality cut | G5 | eng |
| R11 | .NET 10 SDK missing on builders | Medium | Medium | Document install; M0 gate | `dotnet --list-sdks` | platform |
| R12 | Scope creep city content | Medium | Medium | Milestone freeze; G1 stop rule | Process review | product |
| R13 | Agent cheat path | High | Low | Contract tests; no pose API | G6 | eng |
| R14 | WebView2 packaging weight | Medium | Medium | Evergreen; Electron fallback | Package size log | platform |
