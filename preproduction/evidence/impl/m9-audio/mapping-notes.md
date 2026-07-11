# Audio proxy mapping — objective pass (M9 prep)

Date: 2026-07-11
Status: **proxy-pending-listen-pass** (per final-art-assets-world-audio-spec §3
none of these are runtime-ready until a human listen pass; this pass is the
objective half of that review)

## Method

1. `scripts/audio-inventory.mjs` — unzipped the four acquired CC0 packs to
   `assets/generated/audio/unpacked/` and measured all **430 clips** with
   ffmpeg 8.1.1: duration (ffprobe), overall Peak dB and RMS dB (astats).
   Integrated LUFS (ebur128) was measured first but gates to −70 on
   sub-second SFX, so astats peak/RMS is the recorded measure.
2. `scripts/audio-event-map.mjs` — selected variants per game event by
   name/duration/transient class and computed per-variant
   `gainDb = targetPeakDb − measuredPeakDb` so each event class lands at a
   coherent mix position. Output: `assets/generated/audio/event-map.json`
   (mapVersion 1).

## Event → source summary

| Event | Strategy | Source | Variants |
| --- | --- | --- | --- |
| roll | procedural (runtime filtered-noise loop) | — | 0 (by design) |
| push | one-shot variants @ −8 dB peak | kenney footstep_concrete | 5 |
| pop | one-shot variants @ −3 dB peak | kenney impactWood_medium | 5 |
| catch | one-shot @ −9 dB | kenney impactGeneric_light | 5 |
| land | one-shot @ −3 dB (dirty layers wood_hit −6) | kenney impactWood_heavy + oga wood_hit | 9 |
| bail | layered cluster @ −2 dB | punch_heavy + soft_heavy + wood_falling | 13 |
| grind-metal | granular retrigger + machine-loop bed | oga metal_hit + sfx2 loop_machine | 6 |
| grind-ledge | granular retrigger @ −9 dB | oga wood_misc | 5 |
| ambience | loop bed @ −16 dB | sfx2 loop_ambient + loop_highway | 5 |
| ui-* / score-pop | UI one-shots @ −8..−10 dB | kenney-interface | 18 |

## Known gaps / deferred

- True skate grind field recording remains auth-gated (Freesound 655371) —
  granular metal-hit retrigger is the documented proxy strategy.
- Roll loop is procedural until a field recording exists.
- Subjective listen pass + loudness fine-tune belongs to the M9 milestone and
  the G2 session; nothing is promoted to `assets/runtime/`.

## License

All four packs are CC0 with LICENSE + SOURCE.md sidecars under
`assets/source/vendor/` (OGA packs author: rubberduck). Unpacked copies under
`assets/generated/audio/unpacked/` inherit those licenses.
