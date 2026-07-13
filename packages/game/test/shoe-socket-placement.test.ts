import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { DEFAULT_SIM_CONFIG, type ManeuverPhase, type ObserveState } from '@slackpad/shared';
import { ShoeAnimator } from '../src/render/ShoeAnimator';

type ShoeSocketPlacementApi = typeof ShoeAnimator & {
  placeAtSockets(
    shoeNose: THREE.Object3D,
    shoeTail: THREE.Object3D,
    socketNose: THREE.Vector3,
    socketTail: THREE.Vector3,
    stance?: 'regular' | 'goofy',
  ): void;
};

describe('shoe socket placement', () => {
  it('places the pair fore and aft on the board sockets instead of preserving the authored lateral preview spread', () => {
    const shoeNose = new THREE.Group();
    const shoeTail = new THREE.Group();
    shoeNose.position.set(-0.075, 0, 0);
    shoeTail.position.set(0.075, 0, 0);
    shoeNose.rotation.set(0.1, 0.2, 0.3);
    shoeTail.rotation.set(-0.2, 0.4, -0.1);

    const noseSocket = new THREE.Vector3(0, 0.012, 0.215);
    const tailSocket = new THREE.Vector3(0, 0.012, -0.215);
    const placement = ShoeAnimator as ShoeSocketPlacementApi;

    expect(typeof placement.placeAtSockets).toBe('function');
    placement.placeAtSockets(shoeNose, shoeTail, noseSocket, tailSocket);

    expect(shoeNose.position).toEqual(noseSocket);
    expect(shoeTail.position).toEqual(tailSocket);
    expect(Math.abs(shoeNose.position.z - shoeTail.position.z)).toBeGreaterThan(0.4);
    expect(Math.abs(shoeNose.position.x - shoeTail.position.x)).toBeLessThan(1e-9);
    // Authored +Z toes are turned across the deck toward +X for regular.
    const noseToe = new THREE.Vector3(0, 0, 1).applyQuaternion(shoeNose.quaternion);
    const tailToe = new THREE.Vector3(0, 0, 1).applyQuaternion(shoeTail.quaternion);
    expect(noseToe.x).toBeGreaterThan(0.75);
    expect(tailToe.x).toBeGreaterThan(0.75);
  });

  it('mirrors both toe directions for goofy stance', () => {
    const nose = new THREE.Group();
    const tail = new THREE.Group();
    ShoeAnimator.placeAtSockets(nose, tail, new THREE.Vector3(), new THREE.Vector3(), 'goofy');
    expect(new THREE.Vector3(0, 0, 1).applyQuaternion(nose.quaternion).x).toBeLessThan(-0.99);
    expect(new THREE.Vector3(0, 0, 1).applyQuaternion(tail.quaternion).x).toBeLessThan(-0.99);
  });

  it('keeps every planted shoe sole above its live deck contact through ground, pop, air, and catch', () => {
    const deckTop = 0.027;
    const noseSocket = new THREE.Vector3(0, deckTop, 0.25);
    const tailSocket = new THREE.Vector3(0, deckTop, -0.25);

    const makeShoe = (): THREE.Group => {
      const shoe = new THREE.Group();
      const soleUpGeometry = new THREE.BoxGeometry(0.104, 0.06, 0.29);
      // Shoe assets are authored with the sole plane at local y=0.
      soleUpGeometry.translate(0, 0.03, 0);
      shoe.add(new THREE.Mesh(soleUpGeometry, new THREE.MeshBasicMaterial()));
      return shoe;
    };

    const pose = {
      p: { x: 0, y: 0.12, z: 0 },
      q: { x: 0, y: 0, z: 0, w: 1 },
    };
    const observation = (phase: ManeuverPhase): ObserveState => ({
      step: 1,
      seed: 1,
      board: {
        p: pose.p,
        q: pose.q,
        lv: { x: 0, y: phase === 'catch' ? -0.2 : 0.5, z: 2 },
        // Exercise the maximum cosmetic air lean that previously drove one
        // end of a planted sole through the deck.
        av: { x: 0, y: 0, z: 20 },
      },
      phase,
      label: 'ollie',
      assistLevel: 1,
      feet: {
        nose: { planted: true, offset: { x: 0, y: 0.025, z: 0.25 } },
        tail: { planted: true, offset: { x: 0, y: 0.025, z: -0.25 } },
      },
      grind: null,
      score: 0,
      lastFailReason: null,
      inputSource: null,
    });

    for (const phase of ['ground', 'pop', 'air', 'catch'] as const) {
      const nose = makeShoe();
      const tail = makeShoe();
      ShoeAnimator.placeAtSockets(nose, tail, noseSocket, tailSocket, 'regular');
      const animator = new ShoeAnimator(nose, tail, DEFAULT_SIM_CONFIG.presentation, {
        deckTopY: 0.025,
        noseZ: 0.25,
        tailZ: -0.25,
      });

      for (let frame = 0; frame < 30; frame++) animator.update(pose, observation(phase), 1 / 60);

      for (const [role, shoe, socket] of [
        ['nose', nose, noseSocket],
        ['tail', tail, tailSocket],
      ] as const) {
        shoe.updateMatrixWorld(true);
        const soleY = new THREE.Box3().setFromObject(shoe).min.y;
        expect(soleY, `${phase} ${role} sole`).toBeGreaterThanOrEqual(socket.y - 1e-6);
      }

      // Both shoes remain a readable fore/aft, cross-deck stance.
      expect(nose.position.z).toBeGreaterThan(tail.position.z);
      expect(new THREE.Vector3(0, 0, 1).applyQuaternion(nose.quaternion).x).toBeGreaterThan(0.75);
      expect(new THREE.Vector3(0, 0, 1).applyQuaternion(tail.quaternion).x).toBeGreaterThan(0.75);
      expect(new THREE.Vector3(0, 1, 0).applyQuaternion(nose.quaternion).y).toBeGreaterThan(0.99);
      expect(new THREE.Vector3(0, 1, 0).applyQuaternion(tail.quaternion).y).toBeGreaterThan(0.99);
    }
  });

  it('pins a planted pair to stable deck sockets through hardware jitter, crossed contacts, and dropouts', () => {
    const deckTop = 0.027;
    const noseSocket = new THREE.Vector3(0, deckTop, 0.215);
    const tailSocket = new THREE.Vector3(0, deckTop, -0.215);
    const makeShoe = (): THREE.Group => {
      const shoe = new THREE.Group();
      const geometry = new THREE.BoxGeometry(0.104, 0.06, 0.29);
      geometry.translate(0, 0.03, 0);
      shoe.add(new THREE.Mesh(geometry, new THREE.MeshBasicMaterial()));
      return shoe;
    };
    const nose = makeShoe();
    const tail = makeShoe();
    ShoeAnimator.placeAtSockets(nose, tail, noseSocket, tailSocket, 'regular');
    const animator = new ShoeAnimator(nose, tail, DEFAULT_SIM_CONFIG.presentation, {
      deckTopY: deckTop,
      noseZ: noseSocket.z,
      tailZ: tailSocket.z,
    });
    const pose = {
      p: { x: 0, y: 0.12, z: 0 },
      q: { x: 0, y: 0, z: 0, w: 1 },
    };
    const hardwareLike = [
      { nose: { planted: true, offset: { x: 0, y: deckTop, z: noseSocket.z } }, tail: { planted: true, offset: { x: 0, y: deckTop, z: tailSocket.z } } },
      // A one-frame hardware spike that used to throw both shoes off the deck.
      { nose: { planted: true, offset: { x: -2, y: -1, z: -3 } }, tail: { planted: true, offset: { x: 2, y: 1, z: 3 } } },
      // Contact ids/positions may briefly cross before the tracker settles.
      { nose: { planted: true, offset: { x: 0.8, y: deckTop, z: -0.4 } }, tail: { planted: true, offset: { x: -0.8, y: deckTop, z: 0.4 } } },
      // Native devices can omit one or both contacts for a frame. Grounded
      // presentation must not make the shoes jump or seize in response.
      { nose: { planted: false, offset: { x: 0, y: deckTop, z: noseSocket.z } }, tail: { planted: true, offset: { x: 0, y: deckTop, z: tailSocket.z } } },
      { nose: { planted: false, offset: { x: 0, y: deckTop, z: noseSocket.z } }, tail: { planted: false, offset: { x: 0, y: deckTop, z: tailSocket.z } } },
    ] as const;

    for (let i = 0; i < 120; i++) {
      const feet = hardwareLike[i % hardwareLike.length]!;
      const obs: ObserveState = {
        step: i,
        seed: 1,
        board: {
          p: pose.p,
          q: pose.q,
          lv: { x: 0, y: 0, z: 2 },
          av: { x: 0, y: 0, z: i % 2 === 0 ? 30 : -30 },
        },
        phase: 'ground',
        label: null,
        assistLevel: 1,
        feet,
        grind: null,
        score: 0,
        lastFailReason: null,
        inputSource: 'hardware',
      };
      animator.update(pose, obs, 1 / 120);

      expect(nose.position.x).toBeCloseTo(noseSocket.x, 6);
      expect(nose.position.y).toBeCloseTo(noseSocket.y, 6);
      expect(nose.position.z).toBeCloseTo(noseSocket.z, 6);
      expect(tail.position.x).toBeCloseTo(tailSocket.x, 6);
      expect(tail.position.y).toBeCloseTo(tailSocket.y, 6);
      expect(tail.position.z).toBeCloseTo(tailSocket.z, 6);
      expect(new THREE.Box3().setFromObject(nose).min.y).toBeGreaterThanOrEqual(deckTop - 1e-6);
      expect(new THREE.Box3().setFromObject(tail).min.y).toBeGreaterThanOrEqual(deckTop - 1e-6);
    }
  });

  it('keeps lifted trick-animation soles above the deck even at maximum cosmetic lean', () => {
    const deckTop = 0.027;
    const makeShoe = (): THREE.Group => {
      const shoe = new THREE.Group();
      const geometry = new THREE.BoxGeometry(0.104, 0.06, 0.29);
      geometry.translate(0, 0.03, 0);
      shoe.add(new THREE.Mesh(geometry, new THREE.MeshBasicMaterial()));
      return shoe;
    };
    const nose = makeShoe();
    const tail = makeShoe();
    ShoeAnimator.placeAtSockets(
      nose,
      tail,
      new THREE.Vector3(0, deckTop, 0.215),
      new THREE.Vector3(0, deckTop, -0.215),
      'regular',
    );
    const animator = new ShoeAnimator(nose, tail, DEFAULT_SIM_CONFIG.presentation, {
      deckTopY: deckTop,
      noseZ: 0.215,
      tailZ: -0.215,
    });
    const pose = { p: { x: 0, y: 0.12, z: 0 }, q: { x: 0, y: 0, z: 0, w: 1 } };
    const obs: ObserveState = {
      step: 1,
      seed: 1,
      board: { p: pose.p, q: pose.q, lv: { x: 0, y: 1, z: 2 }, av: { x: 0, y: 0, z: 100 } },
      phase: 'air',
      label: 'ollie',
      assistLevel: 1,
      feet: {
        nose: { planted: false, offset: { x: 0, y: deckTop, z: 0.215 } },
        tail: { planted: false, offset: { x: 0, y: deckTop, z: -0.215 } },
      },
      grind: null,
      score: 0,
      lastFailReason: null,
      inputSource: 'hardware',
    };

    for (let frame = 0; frame < 60; frame++) {
      animator.update(pose, obs, 1 / 60);
      expect(new THREE.Box3().setFromObject(nose).min.y).toBeGreaterThanOrEqual(deckTop - 1e-6);
      expect(new THREE.Box3().setFromObject(tail).min.y).toBeGreaterThanOrEqual(deckTop - 1e-6);
    }
  });
});
