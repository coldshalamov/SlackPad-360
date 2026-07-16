# SlackPad 360 — feel report

Deterministic headless run of the canonical feel scenarios (reviews/03 §Stage 0.2).
Metrics are instrument readings, not feel verdicts — feel is judged by a human.

## Gates

| gate | stage | value | target | pass |
| --- | --- | --- | --- | --- |
| steer.lagMs — finger→board yaw lag (45° @200°/s, worst dir) | S2 | 0 | < 50 | PASS |
| steer.trackErrDeg — max |commanded−actual| during turn (worst dir) | S2 | 1.523 | < 5 | PASS |
| steer.pivotDeg — yaw achieved by 1 s standstill rotation | S2 | 220.002 | >= 80 | PASS |
| pop.latencyMs — replant→first airborne step, worst of battery | S4 | 66.667 | <= 80 | PASS |
| pop.silhouetteRmsDeg — pitch vs authored curve RMS, worst of battery | S4 | 3.062 | < 4 | PASS |
| pop.bails — ollie battery bail count | S4 | 0 | == 0 | PASS |
| nav.slalom — 5-gate slalom, closed-loop wrist-range bot | S2 | 1 | == 1 | PASS |
| nav.pivot90 — standstill 90° in ≤1.5 s (two grips) | S2 | 1 | == 1 | PASS |

## Steering

| metric | value |
| --- | --- |
| steer.lagMs | 0 |
| steer.lagCorr | 0.991 |
| steer.trackErrDeg | 1.523 |
| steer.pivotDeg | 220.002 |
| steer.pivotCommandedDeg | 200 |
| steer.ratchetCommandedDeg | 99.00000000000001 |
| steer.ratchetAchievedDeg | 99.137 |
| steer.holdYawDriftDeg | 0.017 |
| steer.holdPosDriftM | 0.099 |
| steer.cruiseTurnLagMs | 0 |
| steer.cruiseTurnErrDeg | 1.376 |
| steer.turnSpeedMps | 3.113 |

## Pop / landing

| metric | value |
| --- | --- |
| pop.latencyMs | 66.67 |
| pop.latencyMedianMs | 50 |
| pop.liftoffFailures | 0 |
| pop.silhouettePreset | crisp |
| pop.silhouetteRmsDeg | 3.062 |
| pop.silhouetteRmsMedianDeg | 1.963 |
| pop.silhouetteRmsLandNormDeg | 3.643 |
| land.cleanRate | 0.65 |
| land.counts | {"clean":13,"dirty":7,"bail":0,"none":0} |
| nollie.latencyMs | 66.67 |
| nollie.counts | {"clean":13,"dirty":7,"bail":0,"none":0} |
| flick.recognizedKickflipRate | 1 |

## Playability probes (nav.*)

| probe | success | time (s) | detail |
| --- | --- | --- | --- |
| nav.rideStraight | PASS | 5.933 | {"travelledM":20.058,"maxLateralDevM":0.068} |
| nav.slalom | PASS | 12.317 | {"gatesPassed":5,"gatesCrossed":5,"gateErrorsM":[0.013,0.028,0.03,0.033,0.006]} |
| nav.pivot90 | PASS | 0.917 | {"achievedDeg":99.191,"commandedDeg":99} |
| nav.ollieBattery | PASS | — | {"landed":10,"total":10,"outcomes":["dirty","clean","dirty","dirty","dirty","dirty","clean","clean","clean","clean"]} |
| nav.popOverObstacle | PASS | — | {"popped":true,"crossedCurbWindow":true,"minLiftCrossingM":0.46,"curbHeightM":0.25,"outcome":"clean"} |

## Config echo

| key | value |
| --- | --- |
| locomotion.steerDirectGain | 1.1 |
| locomotion.steerTrackGain | 24 |
| locomotion.steerServoGain | 180 |
| locomotion.steerMaxTorque | 900 |
| locomotion.gripRate | 8 |
| locomotion.gripSlipSpeed | 1.2 |
| physics.steerYawRateMax | 12 |
| physics.boardMass | 2.4 |
| physics.riderMass | 72 |
| pop.baseQuality | 0.6 |
| pop.jMin | 180 |
| pop.jMax | 300 |
| camera.chaseSide | -0.35 |
| camera.chaseDistance | 2.2 |

## Plots

- plots/steer-turn-plus.svg / steer-turn-minus.svg — fingers vs board during the 45° turn
- plots/steer-pivot.svg — standstill pivot
- plots/steer-ratchet.svg — 2×45° re-grip staircase
- plots/ollie-pitch.svg / nollie-pitch.svg — pitch vs reference silhouette
