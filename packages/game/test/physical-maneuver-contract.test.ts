/// <reference types="node" />
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

function simWorldSource(): string {
  const path = fileURLToPath(new URL('../src/sim/SimWorld.ts', import.meta.url));
  return readFileSync(path, 'utf8');
}

function maneuverImplementation(): string {
  const source = simWorldSource();
  const start = source.indexOf('  applyManeuver(cmd: ManeuverCommand): void {');
  const end = source.indexOf('  interpolatedRenderPose(', start);
  expect(start).toBeGreaterThanOrEqual(0);
  expect(end).toBeGreaterThan(start);
  return source.slice(start, end);
}

describe('physical maneuver implementation contract', () => {
  it('never writes linear or angular velocity during normal maneuvers', () => {
    const source = maneuverImplementation();
    expect(source).not.toContain('.setAngvel(');
    expect(source).not.toContain('.setLinvel(');
  });

  it('applies the kick at a physical nose or tail point', () => {
    const source = simWorldSource();
    expect(source).toContain('.applyImpulseAtPoint(');
    expect(source).toContain('cmd.popSide');
    expect(source).toContain('envelope.popSide');
  });
});
