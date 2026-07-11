# Asset Manifest

**Verdict:** `asset-gap`
**Runtime:** `assets/runtime/` is **empty** (correct).
Machine ledger: `preproduction/cycles/03-production/asset-readiness.json`
Catalog: `assets/catalog/assets.json`

## Acquired (selected-source, not runtime-ready)

| ID | Role | SHA-256 (prefix) |
| --- | --- | --- |
| ph-kloppenheim-05-puresky | HDRI | 9da5a7f9… |
| acg-concrete-040 | Ground PBR | 24af2b68… |
| acg-metal-006 | Metal PBR | 6b836315… |
| acg-wood-floor-043 | Wood PBR | 0bd1309b… |
| acg-rubber-004 | Rubber sole | d8933e73… |
| kenney-interface-sounds | UI SFX | f2193d07… |
| kenney-impact-sounds | Impact proxies | 029d734a… |
| oga-100-cc0-metal-wood-sfx | Metal/wood SFX (author: rubberduck) | be6eba63… |
| oga-100-cc0-sfx-2 | Ambience/foley (author: rubberduck) | 0fc61b44… |

All have LICENSE + SOURCE.md sidecars under `assets/source/vendor/`.
OGA packs: canonical OpenGameArt Author/uploader is **rubberduck** (not OwlishMedia).

## Rejected as final look

| ID | Reason |
| --- | --- |
| kenney-mini-skate | Blockout only; mini aesthetic ≠ professional ship |

## Bespoke (required)

| ID | Role |
| --- | --- |
| gap-hero-board | Detailed unbranded board/trucks/wheels |
| gap-shoes-feet | Disembodied unbranded shoes |
| gap-modular-plaza | Professional modular plaza pieces |
| gap-grip-tape-material | Grip (procedural dark grit OK if quality holds) |

Blender contract: `final-art-assets-world-audio-spec.md` (ownership preflight mandatory).

## Deferred / auth-gated

| ID | Reason |
| --- | --- |
| cand-fs-grind-655371 | Freesound login required |

## Runtime-ready

**None.** Do not promote until quality + license + runtime-format review evidence exists.
