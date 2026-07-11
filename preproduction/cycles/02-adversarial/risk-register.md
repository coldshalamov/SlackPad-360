# Risk Register — Cycle 2

**Access date:** 2026-07-10
Extends research + cycle-1 risks; does not edit them.

| ID | Risk | Sev | Likely | Evidence | Mitigation | Validation | Evidence level |
| --- | --- | --- | --- | --- | --- | --- | --- |
| R2-01 | Win11 pointer path pan/zoom-only; no free dual-plant | Critical | Med-High | MS RegisterTouchpad docs say pans/zooms | Raw Input primary ranking; dual spike | G1 P0 | Hardware |
| R2-02 | Raw Input HID parse brittle across vendors | High | Med | PTP class variance | Strict field checks; device matrix | G1 multi-device if possible | Hardware |
| R2-03 | Click false positives (tap-to-click) | Med | Med | OS settings | Profile options; suppress rules | Device matrix | Hardware |
| R2-04 | Assist feels magnetic | High | Med | Hybrid design risk | Assist levels; entry envelopes | G2 formative | Formative |
| R2-05 | Single-body fails rails | Med | Med | Physics comparison | Model B probe | P3 | Tuning |
| R2-06 | 120 Hz CPU overruns iGPU | Med | Med | Unmeasured | 60 default | OQ-PHYS-01 | Perf |
| R2-07 | Rapier upgrade breaks goldens | Med | Low | Determinism version pin | Pin 0.19.3; re-golden | G4 | Deterministic |
| R2-08 | Hero art delayed (Blender busy) | High | High | Process ownership | Briefs ready; cycle 3 schedule | Art checklist | Structural |
| R2-09 | Kenney leaks into ship look | Med | Med | Convenience | Explicit reject-as-final | Review | Structural |
| R2-10 | JSON transport misses G3 | Med | Med | Unmeasured | SharedBuffer fallback | G3 | Hardware |
| R2-11 | Flip/shuv/boardslide confusion | High | Med | Shared free-foot cues | Axis dominance; hysteresis | Confusion matrix | Tuning/formative |
| R2-12 | Agent shortcut creeps in | High | Low | API design | Contract tests forbid pose/trick | G6 | Deterministic |
| R2-13 | Autonomy ignores G1 pause | Critical | Med | Process risk | Binding gate plan | Process audit | Structural |
| R2-14 | License mistake on asset | High | Low | Marketplace noise | Catalog sidecars; validator | Provenance checks | Structural |
| R2-15 | WebView2 packaging friction | Med | Low | Platform | Electron fallback | Packaging spike | Structural |

Severity guide: Critical blocks product; High blocks milestone; Med slows; Low cosmetic.
