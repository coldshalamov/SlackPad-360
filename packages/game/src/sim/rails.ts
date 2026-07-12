/**
 * Grindable rail geometry (M6) — plain-data descriptors + the pure proximity
 * query that backs SimWorld.railProximity().
 *
 * A rail is a STATIC capsule (thin) or ledge (wide box) tagged `grindable`
 * (final-physics-animation-camera-spec §7: "Rails: static capsules grindable";
 * 1 unit = 1 m). The physical collider (built by the level) provides vertical
 * support + bounce/scrape for bad approaches; this module carries only the
 * DATA the control layer needs — the rail centre-line and top height — so the
 * grind system can compute a candidate/latch decision without ever touching a
 * body. `railProximity()` returns a fresh plain-data RailProximity; there is no
 * body/collider leak (G6 anti-cheat hardening — mirrors isGrounded()).
 *
 * All maths is horizontal (XZ) point-to-segment projection: rails run along the
 * ground plane and the vertical (ride-height) test lives in GrindSystem where
 * the per-family ride height is known.
 */

import type { Vec3 } from '@slackpad/shared';

/** Static grindable-rail descriptor (level data; not agent-reachable). */
export interface RailDescriptor {
  id: string;
  /** Rail TOP surface height, world Y — where board contact rests. */
  topY: number;
  /** Centre-line endpoints A and B (world horizontal position). */
  ax: number;
  az: number;
  bx: number;
  bz: number;
  /** True = wide ledge (forgiving, full support); false = thin rail. */
  ledge: boolean;
}

/** Nearest-rail proximity readout (fresh plain data; no body reference). */
export interface RailProximity {
  railId: string;
  /** Closest point on the rail centre-line (y = topY). */
  anchor: Vec3;
  /** Unit rail tangent (horizontal, y = 0). */
  tangent: Vec3;
  /** Unit rail-perpendicular (horizontal, y = 0); lateralOffset is along this. */
  perp: Vec3;
  /** Rail top height, world Y. */
  topY: number;
  /** Signed lateral offset of the board centre from the centre-line, m. */
  lateralOffset: number;
  /** Horizontal distance board-centre → closest centre-line point, m (≥ |lateralOffset|). */
  lateralDist: number;
  /** Position along the segment in [0, 1] (for end-of-rail detection). */
  along: number;
  /** True when the nearest rail is a wide ledge. */
  ledge: boolean;
}

/**
 * Nearest grindable rail to a board-centre position, or null when there are no
 * rails. Ranks purely by horizontal distance to the centre-line (rails are long
 * horizontal spans; the vertical ride-height contact test is applied downstream
 * in GrindSystem with the per-family ride height). Deterministic: pure maths on
 * plain data, stable tie-break by descriptor order.
 */
export function nearestRail(
  rails: readonly RailDescriptor[],
  px: number,
  pz: number,
): RailProximity | null {
  let best: RailProximity | null = null;
  let bestDist = Infinity;
  for (const r of rails) {
    const dx = r.bx - r.ax;
    const dz = r.bz - r.az;
    const len2 = dx * dx + dz * dz;
    // Degenerate (zero-length) rail: treat the single point as the anchor.
    const t = len2 > 1e-9 ? clamp01(((px - r.ax) * dx + (pz - r.az) * dz) / len2) : 0;
    const anchorX = r.ax + t * dx;
    const anchorZ = r.az + t * dz;
    const lateralDist = Math.hypot(px - anchorX, pz - anchorZ);
    if (lateralDist >= bestDist) continue;
    const invLen = len2 > 1e-9 ? 1 / Math.sqrt(len2) : 0;
    const tx = dx * invLen;
    const tz = dz * invLen;
    // Horizontal perpendicular (rotate tangent −90° about world up).
    const px2 = tz;
    const pz2 = -tx;
    const lateralOffset = (px - anchorX) * px2 + (pz - anchorZ) * pz2;
    bestDist = lateralDist;
    best = {
      railId: r.id,
      anchor: { x: anchorX, y: r.topY, z: anchorZ },
      tangent: { x: tx, y: 0, z: tz },
      perp: { x: px2, y: 0, z: pz2 },
      topY: r.topY,
      lateralOffset,
      lateralDist,
      along: t,
      ledge: r.ledge,
    };
  }
  return best;
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}
