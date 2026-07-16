import { DEFAULT_SIM_CONFIG } from '@slackpad/shared';
import { describe, expect, it } from 'vitest';

import { DEFAULT_LEVEL_ID, getLevelBuilder } from '../src/sim/levels/index';
import * as parkModule from '../src/sim/levels/playable-park';
import { buildLevelStatics } from '../src/render/LevelStatics';
import { SimWorld } from '../src/sim/SimWorld';
import { rotateAboutCenter } from '../src/input/FootTracker';
import {
  NOSE_POS,
  TAIL_POS,
  eventsOf,
  scriptOllie,
  settledProfiled,
} from './helpers/maneuver';

interface TestPiece {
  id: string;
  kind: string;
  center: readonly [number, number, number];
  size: readonly [number, number, number];
  rotation?: { x?: number; y?: number; z?: number };
  grind?: { ledge: boolean };
}

interface TestLayout {
  id: string;
  groundCollider?: string;
  bounds: { halfX: number; halfZ: number; safeMargin: number };
  pieces: readonly TestPiece[];
  featuredLine: readonly string[];
  returnRoutes: readonly (readonly string[])[];
}

function layout(): TestLayout {
  const value = (parkModule as unknown as { PLAYABLE_PARK_LAYOUT?: TestLayout })
    .PLAYABLE_PARK_LAYOUT;
  expect(value, 'playable park must expose one shared layout descriptor').toBeDefined();
  return value!;
}

describe('playable-park default level contract', () => {
  it('ships the skatepark as the default while retaining flat-dev explicitly', () => {
    expect(DEFAULT_LEVEL_ID).toBe('playable-park');
    expect(() => getLevelBuilder('playable-park')).not.toThrow();
    expect(() => getLevelBuilder('flat-dev')).not.toThrow();
  });

  it('contains a real skatepark vocabulary instead of two isolated rails', () => {
    const pieces = layout().pieces;
    const grinds = pieces.filter((piece) => piece.grind);
    const transitions = pieces.filter((piece) => piece.kind === 'ramp');

    expect(new Set(grinds.map((piece) => piece.id)).size).toBeGreaterThanOrEqual(6);
    expect(transitions.length).toBeGreaterThanOrEqual(3);
    expect(grinds.some((piece) => piece.grind?.ledge)).toBe(true);
    expect(grinds.some((piece) => !piece.grind?.ledge)).toBe(true);
  });

  it('defines a short, ordered featured line with open approach and runout', () => {
    const park = layout();
    const byId = new Map(park.pieces.map((piece) => [piece.id, piece]));
    const line = park.featuredLine.map((id) => byId.get(id));

    expect(line.length).toBeGreaterThanOrEqual(4);
    expect(line.every(Boolean)).toBe(true);
    const z = line.map((piece) => piece!.center[2]);
    expect(z).toEqual([...z].sort((a, b) => a - b));
    expect(z[0]).toBeGreaterThanOrEqual(5);
    expect(park.bounds.halfZ - z.at(-1)!).toBeGreaterThanOrEqual(5);
  });

  it('provides a dense repeatable plaza loop with a manual pad and two return choices', () => {
    const park = layout();
    const byId = new Map(park.pieces.map((piece) => [piece.id, piece]));
    const required = [
      'manual-pad',
      'right-ledge',
      'stair-platform',
      'stair-handrail',
      'north-return-bank',
      'west-return-bank',
    ];
    expect(required.every((id) => byId.has(id))).toBe(true);
    expect(park.returnRoutes).toHaveLength(2);
    for (const route of park.returnRoutes) {
      expect(route.length).toBeGreaterThanOrEqual(3);
      expect(route.every((id) => byId.has(id))).toBe(true);
    }
    expect(new Set(park.returnRoutes.flat()).size).toBeGreaterThanOrEqual(5);
  });

  it('keeps every obstacle and its runout well inside an effectively endless floor', () => {
    const park = layout();
    expect(park.groundCollider, 'default park uses an infinite physics floor').toBe('halfspace');
    for (const piece of park.pieces) {
      const [x, , z] = piece.center;
      // Rotation can swap X/Z, so the conservative enclosing radius is used.
      const radius = Math.hypot(piece.size[0], piece.size[2]) / 2;
      expect(Math.abs(x) + radius + park.bounds.safeMargin).toBeLessThanOrEqual(
        park.bounds.halfX,
      );
      expect(Math.abs(z) + radius + park.bounds.safeMargin).toBeLessThanOrEqual(
        park.bounds.halfZ,
      );
    }

    const ground = DEFAULT_SIM_CONFIG.physics.ground.halfExtents;
    expect(ground.x).toBeGreaterThanOrEqual(park.bounds.halfX + 100);
    expect(ground.z).toBeGreaterThanOrEqual(park.bounds.halfZ + 100);
  });

  it('joins every bank to the ground instead of leaving floating collider lips', () => {
    const ramps = layout().pieces.filter((piece) => piece.kind === 'ramp');
    for (const ramp of ramps) {
      const rotation = (ramp as TestPiece & { rotation?: { x?: number } }).rotation;
      const angle = rotation?.x ?? 0;
      const halfY = ramp.size[1] / 2;
      const halfZ = ramp.size[2] / 2;
      const topAt = (localZ: number): number =>
        ramp.center[1] + Math.cos(angle) * halfY - Math.sin(angle) * localZ;
      const ends = [topAt(-halfZ), topAt(halfZ)];
      expect(Math.min(...ends), `${ramp.id} ground seam`).toBeCloseTo(0, 3);
      expect(Math.max(...ends), `${ramp.id} must rise`).toBeGreaterThan(0.25);
    }

    const byId = new Map(layout().pieces.map((piece) => [piece.id, piece]));
    const entry = byId.get('funbox-entry')!;
    const deck = byId.get('funbox-deck')!;
    const entryAngle = (entry as TestPiece & { rotation?: { x?: number } }).rotation?.x ?? 0;
    const entryHigh =
      entry.center[1] + Math.cos(entryAngle) * entry.size[1] / 2
      - Math.sin(entryAngle) * entry.size[2] / 2;
    expect(entryHigh).toBeCloseTo(deck.center[1] + deck.size[1] / 2, 3);
  });

  it('a live full-drive board traverses the complete funbox and reaches its runout', async () => {
    const world = new SimWorld(structuredClone(DEFAULT_SIM_CONFIG));
    await world.reset(0x5eed, 'playable-park');
    for (let i = 0; i < 90; i++) world.step();

    let sawEntry = false;
    let sawDeck = false;
    let sawExit = false;
    let maxZ = -Infinity;
    let maxWheelY = -Infinity;
    for (let i = 0; i < 720 && world.boardPose().p.z < 19; i++) {
      world.applyGroundForces({
        active: true,
        driveForce: DEFAULT_SIM_CONFIG.locomotion.cruiseDriveForce,
        brakeForce: 0,
        pushImpulse: 0,
        targetYawRate: 0,
        steerAngle: null,
        rollTorque: 0,
      });
      world.step();
      const pose = world.boardPose();
      maxZ = Math.max(maxZ, pose.p.z);
      const contacts = world.wheelObservations()
        .map((wheel) => wheel.contactPoint)
        .filter((point) => point !== null);
      for (const point of contacts) maxWheelY = Math.max(maxWheelY, point.y);
      if (pose.p.z > 4 && pose.p.z < 9.7 && contacts.some((point) => point.y > 0.05)) {
        sawEntry = true;
      }
      if (pose.p.z >= 8.8 && pose.p.z <= 11.2 && contacts.some((point) => point.y > 0.25)) {
        sawDeck = true;
      }
      if (pose.p.z > 11.5 && pose.p.z < 17.5 && contacts.some((point) => point.y > 0.05)) {
        sawExit = true;
      }
    }

    expect(sawEntry, 'wheels climbed the entry bank').toBe(true);
    expect(sawDeck, `wheels crossed the funbox deck (maxZ=${maxZ.toFixed(3)}, maxWheelY=${maxWheelY.toFixed(3)})`).toBe(true);
    expect(sawExit, 'wheels descended the exit bank').toBe(true);
    expect(world.boardPose().p.z, 'board reached open runout').toBeGreaterThan(19);
    expect(world.isGrounded()).toBe(true);
    world.free();
  });

  it('reaches and rides up the north return transition at the end of the line', async () => {
    const world = new SimWorld(structuredClone(DEFAULT_SIM_CONFIG));
    await world.reset(0x1a57, DEFAULT_LEVEL_ID);
    for (let i = 0; i < 90; i++) world.step();
    for (let i = 0; i < 1800 && world.boardPose().p.z < 38.3; i++) {
      const pose = world.boardPose();
      // The north bank is 4 m wide, so x=2 is its exact side edge. Aim one
      // metre inside the transition so this verifies the ride and lip, rather
      // than a deterministic roll-off from a physically invalid test line.
      const targetX = pose.p.z < 28 ? -0.75 : 1;
      const targetHeading = Math.atan2(targetX - pose.p.x, 5);
      world.applyGroundForces({
        active: true,
        driveForce: DEFAULT_SIM_CONFIG.locomotion.cruiseDriveForce,
        brakeForce: 0,
        pushImpulse: 0,
        targetYawRate: 0,
        steerAngle: targetHeading,
        rollTorque: 0,
      });
      world.step();
    }
    expect(
      world.boardPose().p.z,
      `direct line stopped at ${JSON.stringify(world.boardPose())}`,
    ).toBeGreaterThanOrEqual(38.3);
    let maxZ = world.boardPose().p.z;
    let maxY = world.boardPose().p.y;
    let sawLipLaunch = false;
    for (let i = 0; i < 180; i++) {
      world.step();
      maxZ = Math.max(maxZ, world.boardPose().p.z);
      maxY = Math.max(maxY, world.boardPose().p.y);
      if (world.lastTransitionAssist()?.kind === 'lip-launch') sawLipLaunch = true;
    }
    expect(maxZ).toBeGreaterThan(41);
    expect(maxY, 'the bank visibly redirects line speed upward').toBeGreaterThan(0.45);
    expect(sawLipLaunch, 'the interior bank line receives one physical lip launch').toBe(true);
    world.free();
  });

  it('can approach, latch, ride, and dismount the centre flatbar through real controls', async () => {
    const d = await settledProfiled(0x5eed, {
      levelId: 'playable-park',
      assistLevel: 1,
      kickAttribution: 'motionTap',
    });
    const h = d.harness;

    // Establish the neutral two-finger heading, then make a small, continuous
    // carve toward the offset beginner flatbar while Ctrl remains held.
    d.cruise(5);
    for (let i = 0; i < 600 && h.observe().board.p.z < 14.5; i++) {
      const errorX = 1.1 - h.observe().board.p.x;
      // Pad Y grows toward the player. A rightward world carve therefore uses
      // the opposite signed pad angle at the physical input boundary.
      const degrees = -Math.max(-10, Math.min(10, errorX * 8));
      d.drive({
        nose: rotateAboutCenter(NOSE_POS.x, NOSE_POS.y, degrees),
        tail: rotateAboutCenter(TAIL_POS.x, TAIL_POS.y, degrees),
        auxiliary: true,
      });
    }
    expect(h.observe().board.p.z).toBeGreaterThanOrEqual(14.5);
    expect(Math.abs(h.observe().board.p.x - 1.1)).toBeLessThan(0.35);

    scriptOllie(d, {});
    let sawCentreGrind = false;
    let groundedAfter = false;
    for (let i = 0; i < 300; i++) {
      d.drive({ nose: NOSE_POS, tail: TAIL_POS });
      const observation = h.observe();
      if (
        observation.phase === 'grind'
        && eventsOf(h, 'grindLatched').some((event) => event.railId === 'centre-flatbar')
      ) {
        sawCentreGrind = true;
      }
      if (sawCentreGrind && observation.phase === 'ground') groundedAfter = true;
    }

    const centreLatch = eventsOf(h, 'grindLatched').find(
      (event) => event.railId === 'centre-flatbar' && event.family === 'fifty-fifty',
    );
    expect(
      centreLatch,
      `final=${JSON.stringify(h.observe().board)} pops=${JSON.stringify(eventsOf(h, 'pop'))} arbitration=${JSON.stringify(eventsOf(h, 'kickArbitrated'))} candidate=${JSON.stringify(eventsOf(h, 'grindCandidate'))} exits=${JSON.stringify(eventsOf(h, 'grindExit'))}`,
    ).toBeDefined();
    expect(sawCentreGrind).toBe(true);
    expect(eventsOf(h, 'grindExit').length).toBeGreaterThan(0);
    expect(groundedAfter).toBe(true);
  });

  it('builds a descending stair set from an upper platform with a sloped handrail', () => {
    const pieces = layout().pieces;
    const platform = pieces.find((piece) => piece.id === 'stair-platform');
    const steps = pieces
      .filter((piece) => piece.kind === 'stair')
      .sort((a, b) => a.center[2] - b.center[2]);
    const handrail = pieces.find((piece) => piece.id === 'stair-handrail');

    expect(platform).toBeDefined();
    expect(steps.length).toBeGreaterThanOrEqual(4);
    expect(handrail).toBeDefined();
    expect(platform!.center[2]).toBeLessThan(steps[0]!.center[2]);
    const tops = steps.map((step) => step.center[1] + step.size[1] / 2);
    expect(tops[0]).toBeCloseTo(platform!.center[1] + platform!.size[1] / 2, 3);
    expect(tops.every((top, index) => index === 0 || top < tops[index - 1]!)).toBe(true);

    const angle = handrail!.rotation?.x ?? 0;
    expect(angle).toBeGreaterThan(0.05);
    const halfLength = handrail!.size[2] / 2;
    const startY = handrail!.center[1] + Math.sin(angle) * halfLength;
    const endY = handrail!.center[1] - Math.sin(angle) * halfLength;
    expect(startY - endY).toBeGreaterThan(0.3);
    expect(steps.at(-1)!.center[2] + steps.at(-1)!.size[2] / 2).toBeLessThan(
      layout().bounds.halfZ - layout().bounds.safeMargin,
    );
  });

  it('renders exactly one collider-aligned primary mesh for every park piece', () => {
    const park = layout();
    const group = buildLevelStatics('playable-park');
    const primaryIds: string[] = [];
    group.traverse((node) => {
      const id = node.userData.parkColliderPieceId;
      if (typeof id === 'string') primaryIds.push(id);
    });

    expect(primaryIds.sort()).toEqual(park.pieces.map((piece) => piece.id).sort());
  });

  it('models rail supports as physical pieces and has no decorative ghost posts', () => {
    const park = layout();
    const rails = park.pieces.filter((piece) => piece.kind === 'rail');
    const supports = park.pieces.filter((piece) => piece.kind === 'support');
    expect(supports.length).toBeGreaterThanOrEqual(rails.length * 2);

    const group = buildLevelStatics('playable-park');
    const ghostPosts: string[] = [];
    group.traverse((node) => {
      if (node.name.startsWith('ParkRailPost_')) ghostPosts.push(node.name);
    });
    expect(ghostPosts).toEqual([]);
  });
});
