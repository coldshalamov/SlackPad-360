import { buildBoard } from './board';
import type { LevelBuilder } from './types';
import type { RailDescriptor } from '../rails';
import { RAIL_FRICTION } from './grind-lab';
import {
  GRINDABLE_COLLISION_GROUPS,
  ORDINARY_WORLD_COLLISION_GROUPS,
} from '../collisionGroups';

export type ParkPieceKind =
  | 'ramp'
  | 'platform'
  | 'stair'
  | 'rail'
  | 'ledge'
  | 'support';

export interface ParkPieceDescriptor {
  id: string;
  kind: ParkPieceKind;
  /** World-space collider centre, metres. */
  center: readonly [number, number, number];
  /** Full collider size in local X/Y/Z, metres. */
  size: readonly [number, number, number];
  /** XYZ Euler rotation in radians. */
  rotation?: Readonly<{ x?: number; y?: number; z?: number }>;
  grind?: Readonly<{ ledge: boolean }>;
}

export interface PlayableParkLayout {
  id: 'playable-park';
  groundCollider: 'halfspace';
  bounds: Readonly<{ halfX: number; halfZ: number; safeMargin: number }>;
  pieces: readonly ParkPieceDescriptor[];
  /** A readable spawn-to-runout line: bank → deck → bank → flatbar. */
  featuredLine: readonly string[];
}

const FUNBOX_RISE = 0.3;
const FUNBOX_RUN = 6;
const FUNBOX_TILT = Math.atan(FUNBOX_RISE / FUNBOX_RUN);
const FUNBOX_LENGTH = Math.hypot(FUNBOX_RUN, FUNBOX_RISE);
const FUNBOX_THICKNESS = 0.12;
const FUNBOX_CENTER_Y =
  FUNBOX_RISE / 2 - Math.cos(FUNBOX_TILT) * FUNBOX_THICKNESS / 2;
const KICKER_RISE = 0.45;
const KICKER_RUN = 3;
const KICKER_TILT = Math.atan(0.45 / 3);
const KICKER_LENGTH = Math.hypot(KICKER_RUN, KICKER_RISE);
const KICKER_THICKNESS = 0.1;
const KICKER_CENTER_Y =
  KICKER_RISE / 2 - Math.cos(KICKER_TILT) * KICKER_THICKNESS / 2;
const SIDE_BANK_RISE = 0.75;
const SIDE_BANK_RUN = 6;
const SIDE_BANK_TILT = Math.atan(SIDE_BANK_RISE / SIDE_BANK_RUN);
const SIDE_BANK_LENGTH = Math.hypot(SIDE_BANK_RUN, SIDE_BANK_RISE);
const SIDE_BANK_THICKNESS = 0.12;
const SIDE_BANK_CENTER_Y =
  SIDE_BANK_RISE / 2 - Math.cos(SIDE_BANK_TILT) * SIDE_BANK_THICKNESS / 2;

/**
 * One plain-data source for BOTH Rapier and Three.js. The centre lane gives a
 * new player a complete bank/funbox/flatbar line without steering. Side lanes
 * offer progressively harder rails, ledges, a kicker, bank, and stair set.
 */
const PLAYABLE_PARK_CORE_PIECES: readonly ParkPieceDescriptor[] = [
    // Centre tutorial line: six metres of approach, then a complete funbox.
    {
      id: 'funbox-entry',
      kind: 'ramp',
      center: [0, FUNBOX_CENTER_Y, 6],
      size: [3.2, FUNBOX_THICKNESS, FUNBOX_LENGTH],
      rotation: { x: -FUNBOX_TILT },
    },
    {
      id: 'funbox-deck',
      kind: 'platform',
      center: [0, FUNBOX_RISE / 2, 10],
      size: [3.2, FUNBOX_RISE, 2.4],
    },
    {
      id: 'funbox-exit',
      kind: 'ramp',
      center: [0, FUNBOX_CENTER_Y, 14],
      size: [3.2, FUNBOX_THICKNESS, FUNBOX_LENGTH],
      rotation: { x: FUNBOX_TILT },
    },
    {
      id: 'centre-flatbar',
      kind: 'rail',
      center: [1.1, 0.28, 22],
      size: [0.08, 0.04, 10],
      grind: { ledge: false },
    },

    // Left lane: early low rail, accessible kicker, then a long ledge.
    {
      id: 'left-low-rail',
      kind: 'rail',
      center: [-4, 0.26, 9],
      size: [0.08, 0.04, 10],
      grind: { ledge: false },
    },
    {
      id: 'left-kicker',
      kind: 'ramp',
      center: [-8, KICKER_CENTER_Y, 7],
      size: [2.4, KICKER_THICKNESS, KICKER_LENGTH],
      rotation: { x: -KICKER_TILT },
    },
    {
      id: 'left-long-ledge',
      kind: 'ledge',
      center: [-7, 0.2, 25],
      size: [0.5, 0.4, 12],
      grind: { ledge: true },
    },

    // Right lane: broad bank, forgiving ledge, long high rail and stair set.
    {
      id: 'right-ledge',
      kind: 'ledge',
      center: [4, 0.15, 9],
      size: [0.5, 0.3, 10],
      grind: { ledge: true },
    },
    {
      id: 'right-bank',
      kind: 'ramp',
      center: [8, SIDE_BANK_CENTER_Y, 23.5],
      size: [3.2, SIDE_BANK_THICKNESS, SIDE_BANK_LENGTH],
      rotation: { x: -SIDE_BANK_TILT },
    },
    {
      id: 'right-long-rail',
      kind: 'rail',
      center: [5.2, 0.42, 24],
      size: [0.08, 0.04, 12],
      grind: { ledge: false },
    },
    {
      id: 'stair-platform',
      kind: 'platform',
      center: [8, SIDE_BANK_RISE / 2, 27.4],
      size: [3.2, SIDE_BANK_RISE, 2.4],
    },
    ...[0, 1, 2, 3, 4].map((step): ParkPieceDescriptor => {
      const height = SIDE_BANK_RISE - step * 0.15;
      return {
        id: `stair-${step + 1}`,
        kind: 'stair',
        center: [8, height / 2, 28.875 + step * 0.75],
        size: [3.2, height, 0.75],
      };
    }),
    {
      id: 'stair-handrail',
      kind: 'rail',
      center: [8, 0.760247, 30.375],
      size: [0.07, 0.04, Math.hypot(3.75, 0.6)],
      rotation: { x: Math.atan(0.6 / 3.75) },
    },

    // Cross-plaza closer makes the space loopable instead of one long corridor.
    {
      id: 'cross-plaza-rail',
      kind: 'rail',
      center: [0, 0.34, 35],
      size: [0.08, 0.04, 12],
      rotation: { y: Math.PI / 2 },
      grind: { ledge: false },
    },
];

function railSupports(piece: ParkPieceDescriptor): ParkPieceDescriptor[] {
  if (piece.kind !== 'rail') return [];
  const pitch = piece.rotation?.x ?? 0;
  const yaw = piece.rotation?.y ?? 0;
  const cosPitch = Math.cos(pitch);
  const direction = {
    x: Math.sin(yaw) * cosPitch,
    y: -Math.sin(pitch),
    z: Math.cos(yaw) * cosPitch,
  };
  const length = piece.size[2];
  const offsets = length >= 7 ? [-0.38 * length, 0, 0.38 * length] : [-0.34 * length, 0.34 * length];
  return offsets.flatMap((offset, index): ParkPieceDescriptor[] => {
    const barBottomY = piece.center[1] + direction.y * offset - piece.size[1] / 2;
    if (barBottomY <= 0.03) return [];
    return [{
      id: `${piece.id}-support-${index + 1}`,
      kind: 'support',
      center: [
        piece.center[0] + direction.x * offset,
        barBottomY / 2,
        piece.center[2] + direction.z * offset,
      ],
      size: [0.06, barBottomY, 0.06],
    }];
  });
}

const PLAYABLE_PARK_PIECES: readonly ParkPieceDescriptor[] =
  PLAYABLE_PARK_CORE_PIECES.flatMap((piece) => [piece, ...railSupports(piece)]);

export const PLAYABLE_PARK_LAYOUT: PlayableParkLayout = {
  id: 'playable-park',
  groundCollider: 'halfspace',
  bounds: { halfX: 20, halfZ: 46, safeMargin: 3 },
  featuredLine: ['funbox-entry', 'funbox-deck', 'funbox-exit', 'centre-flatbar'],
  pieces: PLAYABLE_PARK_PIECES,
};

/** Quaternion equivalent of Three.js Euler XYZ, kept dependency-free for sim. */
export function parkPieceQuaternion(piece: ParkPieceDescriptor): {
  x: number;
  y: number;
  z: number;
  w: number;
} {
  const x = piece.rotation?.x ?? 0;
  const y = piece.rotation?.y ?? 0;
  const z = piece.rotation?.z ?? 0;
  const c1 = Math.cos(x / 2);
  const c2 = Math.cos(y / 2);
  const c3 = Math.cos(z / 2);
  const s1 = Math.sin(x / 2);
  const s2 = Math.sin(y / 2);
  const s3 = Math.sin(z / 2);
  return {
    x: s1 * c2 * c3 + c1 * s2 * s3,
    y: c1 * s2 * c3 - s1 * c2 * s3,
    z: c1 * c2 * s3 + s1 * s2 * c3,
    w: c1 * c2 * c3 - s1 * s2 * s3,
  };
}

export const PLAYABLE_PARK_RAILS: readonly RailDescriptor[] =
  PLAYABLE_PARK_LAYOUT.pieces.flatMap((piece): RailDescriptor[] => {
    if (!piece.grind) return [];
    const yaw = piece.rotation?.y ?? 0;
    const halfLength = piece.size[2] / 2;
    const dx = Math.sin(yaw) * halfLength;
    const dz = Math.cos(yaw) * halfLength;
    return [{
      id: piece.id,
      topY: piece.center[1] + piece.size[1] / 2,
      ax: piece.center[0] - dx,
      az: piece.center[2] - dz,
      bx: piece.center[0] + dx,
      bz: piece.center[2] + dz,
      ledge: piece.grind.ledge,
    }];
  });

/** Shipping free-skate level. Park geometry is added from the layout contract. */
export const playablePark: LevelBuilder = (rapier, world, config, rng) => {
  const ground = config.physics.ground;
  world.createCollider(
    new rapier.ColliderDesc(new rapier.HalfSpace({ x: 0, y: 1, z: 0 }))
      .setFriction(ground.friction)
      .setCollisionGroups(ORDINARY_WORLD_COLLISION_GROUPS),
  );

  const built = buildBoard(rapier, world, config, rng);

  for (const piece of PLAYABLE_PARK_LAYOUT.pieces) {
    const [sx, sy, sz] = piece.size;
    const [x, y, z] = piece.center;
    const desc = rapier.ColliderDesc.cuboid(sx / 2, sy / 2, sz / 2)
      .setTranslation(x, y, z)
      .setRotation(parkPieceQuaternion(piece))
      .setFriction(piece.grind ? RAIL_FRICTION : ground.friction)
      .setCollisionGroups(
        piece.grind ? GRINDABLE_COLLISION_GROUPS : ORDINARY_WORLD_COLLISION_GROUPS,
      );
    if (piece.grind) {
      desc.setFrictionCombineRule(rapier.CoefficientCombineRule.Min);
    }
    world.createCollider(desc);
  }

  return { ...built, rails: PLAYABLE_PARK_RAILS.map((rail) => ({ ...rail })) };
};
