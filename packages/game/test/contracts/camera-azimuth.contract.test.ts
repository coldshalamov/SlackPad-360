/**
 * S1 perceptual contract — camera reads the heading (reviews/03 §2.3, §3.6).
 *
 * While grounded, the settled route camera must sit BEHIND the board: the
 * flattened camera→board direction within 15° of the board heading. The
 * shipped config frames from the side (chaseSide −1.25 vs chaseDistance 1.2 ≈
 * 46° off at rest; ~15.1° at speed), so these land RED by design.
 *
 * NEW-BEHAVIOR CONTRACT — marked `it.fails` until S3 retunes the camera
 * defaults; S3 flips these to plain `it` (the `.fails` marker starts failing
 * the moment the behavior is fixed, forcing the flip in the same commit).
 */

import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { DEFAULT_SIM_CONFIG, type ObserveState } from '@slackpad/shared';
import { CameraRig } from '../../src/render/CameraRig';

function groundedObs(speedZ: number): ObserveState {
  return {
    step: 1,
    seed: 1,
    board: {
      p: { x: 0, y: 0.05, z: 0 },
      q: { x: 0, y: 0, z: 0, w: 1 },
      lv: { x: 0, y: 0, z: speedZ },
      av: { x: 0, y: 0, z: 0 },
    },
    phase: 'ground',
    label: null,
    intent: null,
    assistLevel: 1,
    feet: {
      nose: { planted: true, offset: { x: 0, y: 0.012, z: 0.215 } },
      tail: { planted: true, offset: { x: 0, y: 0.012, z: -0.215 } },
    },
    grind: null,
    score: 0,
    lastFailReason: null,
    inputSource: 'synthetic',
  };
}

/** Angle between flattened camera→board direction and board heading, deg. */
function azimuthErrorDeg(obs: ObserveState): number {
  const rig = new CameraRig(DEFAULT_SIM_CONFIG.camera, 16 / 9);
  const pose = { p: obs.board.p, q: obs.board.q };
  rig.settle(pose, obs, 600);
  const camToBoard = new THREE.Vector3(
    obs.board.p.x - rig.camera.position.x,
    0,
    obs.board.p.z - rig.camera.position.z,
  ).normalize();
  const heading = new THREE.Vector3(0, 0, 1)
    .applyQuaternion(new THREE.Quaternion(obs.board.q.x, obs.board.q.y, obs.board.q.z, obs.board.q.w));
  heading.y = 0;
  heading.normalize();
  const dot = Math.max(-1, Math.min(1, camToBoard.dot(heading)));
  return (Math.acos(dot) * 180) / Math.PI;
}

describe('contract: camera azimuth reads the heading while grounded', () => {
  // S3 flips these two to `it` when the behind-the-board defaults land.
  it.fails('at rest the settled route camera is within 15° of heading (S3)', () => {
    expect(azimuthErrorDeg(groundedObs(0))).toBeLessThan(15);
  });

  it.fails('at cruise speed the settled route camera is within 15° of heading (S3)', () => {
    expect(azimuthErrorDeg(groundedObs(4))).toBeLessThan(15);
  });
});
