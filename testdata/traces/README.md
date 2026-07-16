# Trace corpus

Recorded full-session control traces (`SessionTrace` v1: ContactFrame stream +
replay checkpoints + ControlTrace events). One recorded human session becomes a
permanent, full-granularity, deterministic input that agents can test against
forever — recognizer and feel changes get judged against real hands, not only
synthetic scripts (reviews/03 §Stage 0.3).

## Recording (native host)

1. Launch the native build (`play.bat`) and confirm TRACKPAD LIVE.
2. Press **R** — the world resets (traces are full-session) and `● REC` shows
   on the HUD.
3. Play the thing you want to capture.
4. Press **R** again — the trace is validated by the host and written HERE as
   `YYYYMMDD-session.trace.json` (Documents\SlackPad 360\traces when the host
   is not running from a repo checkout).

## Labeling convention

Rename the file so the label says what the hands did:

```
YYYYMMDD-<label>.trace.json
```

Labels are short kebab-case action descriptions, e.g. `turn-left-slow`,
`ratchet-90-right`, `hard-ollie`, `nollie-battery`, `kickflip-attempt-1`,
`neutral-resting-noise`. One behavior per trace beats one long mixed session.

## Using traces in tests

`packages/game/test/helpers/traceCorpus.ts`:

- `corpusTraceFiles()` — every `*.trace.json` in this directory (empty until
  humans record; nothing here is synthetic by policy).
- `loadSessionTrace(path)` — parse + shape-check one trace.
- `replaySessionTrace(trace)` — replay through a fresh AgentHarness and return
  recorded vs replayed checkpoints (they must be equal — G4).

The corpus ships EMPTY: recording is a human act (Checkpoint 01 seeds it).
A trace that stops replaying identically after an intentional physics change
is stale evidence — regenerate or retire it deliberately, like a golden.
