# Art Direction and Shot Rubric — Cycle 2

**Access date:** 2026-07-10
**Preserves:** Professional tactile direction from cycle 1; rejects permanent low-poly prototype look.

---

## 1. Direction pillars

| Pillar | Intent |
| --- | --- |
| Tactile | Board and shoes feel physical — grip grit, metal trucks, urethane wheels |
| Coherent plaza | Daylight, consistent scale, readable materials |
| Readability | Foot placement, board rotation, rails always legible |
| Restrained FX | Prefer solid sim/anim over spark spam |
| Performance | Budgets and LOD — not permanent unlit ugly |

**Kenney Mini Skate:** layout reference only — **fails** professional pillar as final look.

---

## 2. Inspectable references (this cycle)

| Reference | Path / URL | Use |
| --- | --- | --- |
| Daylight HDRI preview | `assets/generated/previews/ph-kloppenheim-05-puresky/tonemapped.jpg` | Lighting mood |
| Concrete | `assets/generated/previews/acg-concrete-040/color.jpg` | Ground material |
| Metal | `assets/generated/previews/acg-metal-006/color.jpg` | Rails |
| Wood | `assets/generated/previews/acg-wood-floor-043/color.jpg` | Props |
| Kenney colormap | `assets/generated/previews/kenney-mini-skate/colormap.png` | Blockout contrast (negative example for final) |
| Contact sheet index | `assets/generated/previews/CONTACT_SHEET.md` | Navigation |

Hero board/shoe targets: briefs in asset-selection-and-gap-plan (renders deferred to Blender pass).

---

## 3. Shot-based acceptance rubric

Each shot: **Pass / Fail / N/A**. Fail blocks runtime promotion.

### S1 — Hero board three-quarter

- [ ] Deck silhouette reads as skateboard not plank
- [ ] Grip vs wood separation
- [ ] Trucks/wheels distinct
- [ ] No brand logos
- [ ] PBR responds to HDRI

### S2 — Shoes planted

- [ ] Both shoes readable against deck
- [ ] Left/right distinct
- [ ] No logo trademarks
- [ ] Contact with deck believable (even if volume-based)

### S3 — Air flip readability

- [ ] Top vs bottom of deck clear mid-flip
- [ ] Rotation direction readable in ≤0.5 s of video
- [ ] Shoes do not obscure board axis

### S4 — Grind approach

- [ ] Rail metal vs concrete contrast
- [ ] Board yaw vs rail axis clear
- [ ] Shadow does not hide contact

### S5 — Plaza establishing

- [ ] ≥1 readable line path
- [ ] Depth without fog soup
- [ ] Materials coherent (not random kitbash chaos)
- [ ] Background props support scale

### S6 — Bail

- [ ] Failure state distinct from land
- [ ] Not comedic ragdoll mandatory; must be clear

### S7 — Desktop framing

- [ ] 1920×1080 and 1366×768 safe action
- [ ] HUD does not cover shoes/board

### S8 — Performance still

- [ ] Nonblank canvas
- [ ] No obvious z-fight
- [ ] Shadow/readability OK on medium settings

---

## 4. Material philosophy

| Surface | Look |
| --- | --- |
| Concrete | Slightly rough, warm grey daylight |
| Metal rail | Specular streak, not chrome mirror overload |
| Wood | Soft grain, not plastic |
| Grip | Near-black, high roughness |
| Wheels | Soft specular urethane |

---

## 5. Lighting

Primary: outdoor daylight HDRI (Kloppenheim 05 Pure Sky candidate) + soft sun fill. Avoid night neon as default. Exposure target: board midtones readable without crushing grip black.

---

## 6. Temporary proxies

Allowed with watermark/debug flag `art.proxy=true`. Must not be marketed as ship look. Kenney blockout = proxy.
