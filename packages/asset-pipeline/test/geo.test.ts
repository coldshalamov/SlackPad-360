import { describe, it, expect } from 'vitest';
// The pipeline is plain ESM (.mjs); tests import the modules directly. Vitest
// transforms this .ts file via esbuild — no typecheck coupling to the root
// tsc build (which only covers packages/shared + packages/game).
import { MeshBuilder } from '../src/geo/mesh.mjs';
import { roundedBox } from '../src/geo/box.mjs';
import { cylinderX, lathe } from '../src/geo/lathe.mjs';
import { buildDeckParts, buildWheel, BOARD } from '../src/build-board.mjs';

function normalsAreUnit(mb: any, eps = 1e-3) {
  for (let i = 0; i < mb.normals.length; i += 3) {
    const l = Math.hypot(mb.normals[i], mb.normals[i + 1], mb.normals[i + 2]);
    if (Math.abs(l - 1) > eps) return false;
  }
  return true;
}

describe('geometry toolkit', () => {
  it('roundedBox has correct AABB, non-zero tris, unit normals', () => {
    const mb = roundedBox({ size: [0.2, 0.1, 0.4], radius: 0.02, bevelSegments: 3 });
    const b = mb.bounds();
    expect(b.size[0]).toBeCloseTo(0.2, 3);
    expect(b.size[1]).toBeCloseTo(0.1, 3);
    expect(b.size[2]).toBeCloseTo(0.4, 3);
    expect(mb.triCount()).toBeGreaterThan(100);
    expect(normalsAreUnit(mb)).toBe(true);
  });

  it('cylinderX spans the requested axial range at the requested radius', () => {
    const mb = cylinderX({ x0: -0.15, x1: 0.15, r: 0.025, segments: 16 });
    const b = mb.bounds();
    expect(b.size[0]).toBeCloseTo(0.3, 3); // X span
    expect(b.size[1]).toBeCloseTo(0.05, 3); // diameter
    expect(b.size[2]).toBeCloseTo(0.05, 3);
  });

  it('lathe revolves a closed profile into a solid', () => {
    const mb = lathe({
      profile: [
        { x: -0.01, r: 0.005 }, { x: -0.01, r: 0.02 },
        { x: 0.01, r: 0.02 }, { x: 0.01, r: 0.005 },
      ],
      segments: 20,
      closed: true,
    });
    expect(mb.triCount()).toBeGreaterThan(0);
    const b = mb.bounds();
    expect(b.size[1]).toBeCloseTo(0.04, 3); // 2 * outer radius
  });

  it('recomputeNormals yields unit-length normals', () => {
    const mb = new MeshBuilder();
    const a = mb.vertex(0, 0, 0, 0, 0, 0, 0, 0);
    const b = mb.vertex(1, 0, 0, 0, 0, 0, 0, 0);
    const c = mb.vertex(0, 1, 0, 0, 0, 0, 0, 0);
    mb.tri(a, b, c);
    mb.recomputeNormals(40);
    expect(normalsAreUnit(mb)).toBe(true);
  });
});

describe('hero board geometry (brief dimensions)', () => {
  it('deck is 0.20 (X) x 0.80 (Z) with ~0.013 base thickness', () => {
    const { top, bottom } = buildDeckParts(0);
    const bt = top.bounds();
    const bb = bottom.bounds();
    expect(bt.size[0]).toBeCloseTo(0.2, 2); // width X
    expect(bt.size[2]).toBeCloseTo(0.8, 3); // length Z
    // base thickness = top-center minus bottom-center at the flat middle
    expect(bt.min[1] - bb.min[1]).toBeCloseTo(BOARD.thickness, 3);
  });

  it('wheel diameter lands mid-window 0.054–0.060 m', () => {
    const w = buildWheel(0).bounds();
    expect(w.size[1]).toBeGreaterThanOrEqual(0.054);
    expect(w.size[1]).toBeLessThanOrEqual(0.06);
  });

  it('LOD tri budgets: deck 4-8k / ~2k / <1k', () => {
    const counts = [0, 1, 2].map((lod) => {
      const d = buildDeckParts(lod);
      return d.top.triCount() + d.bottom.triCount() + d.rim.triCount();
    });
    expect(counts[0]).toBeGreaterThanOrEqual(4000);
    expect(counts[0]).toBeLessThanOrEqual(8000);
    expect(counts[1]).toBeLessThanOrEqual(2600);
    expect(counts[2]).toBeLessThanOrEqual(1000);
  });
});
