/**
 * LevelStatics — visible meshes for a level's static obstacles (rails, ledges).
 *
 * The M6 grind system made rails PHYSICAL (sim colliders + grindable tags) but
 * render/* was out of its scope, so without this the player would be grinding
 * invisible geometry — which fails the game's own fairness bar ("invisible
 * snap volumes → magnetism", research/physics-and-game-feel §6.4). This module
 * draws exactly what the sim collides with, from the SAME exported descriptors
 * the level builders use (single source of truth; presentation-only — it never
 * touches physics).
 *
 * Looks per the art rubric (§S4 "rail metal vs concrete contrast"): ledges are
 * concrete blocks with a metal capping plate; rails are galvanized flat-bar on
 * square posts.
 */

import * as THREE from 'three';
import { FLAT_DEV_LEDGE, FLAT_DEV_RAIL } from '../sim/levels/flat-dev';
import { LEDGE as LAB_LEDGE, RAIL as LAB_RAIL } from '../sim/levels/grind-lab';
import {
  PLAYABLE_PARK_LAYOUT,
  type ParkPieceDescriptor,
} from '../sim/levels/playable-park';

interface ObstacleDesc {
  kind: 'ledge' | 'rail';
  cx: number;
  topY: number;
  halfWidth: number;
  z0: number;
  z1: number;
}

const LEVEL_OBSTACLES: Record<string, ObstacleDesc[]> = {
  'flat-dev': [
    { kind: 'ledge', ...FLAT_DEV_LEDGE },
    { kind: 'rail', ...FLAT_DEV_RAIL },
  ],
  'grind-lab': [
    { kind: 'ledge', ...LAB_LEDGE },
    { kind: 'rail', ...LAB_RAIL },
  ],
};

const CONCRETE_TINT = 0xb9bcb6;
const METAL_COLOR = 0x9aa0a6;
const RAIL_BAR_HALF_Y = 0.02; // matches the sim collider half-height
const POST_SPACING_M = 2.6;
const POST_SIDE_M = 0.05;
const CAP_THICKNESS = 0.012;

function metalMaterial(): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color: METAL_COLOR,
    metalness: 0.9,
    roughness: 0.42,
  });
}

function concreteMaterial(): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color: CONCRETE_TINT,
    metalness: 0.0,
    roughness: 0.92,
  });
}

/** Build and return a group of visible obstacle meshes for `levelId` (empty if none). */
export function buildLevelStatics(levelId: string): THREE.Group {
  const group = new THREE.Group();
  group.name = `LevelStatics_${levelId}`;
  if (levelId === PLAYABLE_PARK_LAYOUT.id) {
    buildPlayableParkStatics(group, PLAYABLE_PARK_LAYOUT.pieces);
    return group;
  }
  const obstacles = LEVEL_OBSTACLES[levelId] ?? [];

  for (const o of obstacles) {
    const length = o.z1 - o.z0;
    const zMid = (o.z0 + o.z1) / 2;

    if (o.kind === 'ledge') {
      // Concrete block from ground to just under the metal cap.
      const bodyH = Math.max(0.02, o.topY - CAP_THICKNESS);
      const body = new THREE.Mesh(
        new THREE.BoxGeometry(o.halfWidth * 2, bodyH, length),
        concreteMaterial(),
      );
      body.position.set(o.cx, bodyH / 2, zMid);
      body.castShadow = true;
      body.receiveShadow = true;
      group.add(body);

      // Metal capping plate (the grind surface — slight overhang for read).
      const cap = new THREE.Mesh(
        new THREE.BoxGeometry(o.halfWidth * 2 + 0.02, CAP_THICKNESS, length),
        metalMaterial(),
      );
      cap.position.set(o.cx, o.topY - CAP_THICKNESS / 2, zMid);
      cap.castShadow = true;
      cap.receiveShadow = true;
      group.add(cap);
    } else {
      // Flat-bar rail matching the collider box.
      const bar = new THREE.Mesh(
        new THREE.BoxGeometry(o.halfWidth * 2, RAIL_BAR_HALF_Y * 2, length),
        metalMaterial(),
      );
      bar.position.set(o.cx, o.topY - RAIL_BAR_HALF_Y, zMid);
      bar.castShadow = true;
      bar.receiveShadow = true;
      group.add(bar);

      // Square posts down to the ground.
      const postH = o.topY - RAIL_BAR_HALF_Y * 2;
      if (postH > 0.05) {
        const count = Math.max(2, Math.round(length / POST_SPACING_M) + 1);
        const postGeo = new THREE.BoxGeometry(POST_SIDE_M, postH, POST_SIDE_M);
        const postMat = metalMaterial();
        for (let i = 0; i < count; i++) {
          const z = o.z0 + (length * i) / (count - 1);
          const post = new THREE.Mesh(postGeo, postMat);
          post.position.set(o.cx, postH / 2, z);
          post.castShadow = true;
          post.receiveShadow = true;
          group.add(post);
        }
      }
    }
  }

  return group;
}

function buildPlayableParkStatics(
  group: THREE.Group,
  pieces: readonly ParkPieceDescriptor[],
): void {
  for (const piece of pieces) {
    const material = piece.kind === 'rail' || piece.kind === 'support'
      ? metalMaterial()
      : concreteMaterial();
    const [sx, sy, sz] = piece.size;
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), material);
    mesh.name = `ParkPiece_${piece.id}`;
    mesh.position.set(...piece.center);
    mesh.rotation.set(
      piece.rotation?.x ?? 0,
      piece.rotation?.y ?? 0,
      piece.rotation?.z ?? 0,
      'XYZ',
    );
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.userData.parkColliderPieceId = piece.id;
    group.add(mesh);

  }
}
