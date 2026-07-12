/**
 * AssetLoader (M7) — loads the STAGED hero GLBs (board + shoes) for the game
 * renderer. Meshopt-compressed (EXT_meshopt_compression) so the GLTFLoader is
 * wired to three's MeshoptDecoder. Responsibilities:
 *
 *   - resolve named nodes the presentation layer needs (foot sockets, wheels);
 *   - hide the COL_* collision proxies (physics owns collision, not the mesh);
 *   - flag every visible mesh castShadow + receiveShadow;
 *   - cache by URL so a re-load is free.
 *
 * These assets are STAGED ("pending promotion") — served from the repo `assets/`
 * tree via the dev-assets vite plugin at `/staged-assets/…`, not yet promoted to
 * `assets/runtime`. The renderer labels them as such in the HUD fine print.
 *
 * Nothing here touches the sim; it is pure presentation IO.
 */

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';

/** Base URL for staged assets (see vite-plugin-dev-assets). */
export const STAGED_BASE = '/staged-assets/';

/** A wheel node plus its measured radius + spin axle axis (board-local). */
export interface WheelHandle {
  node: THREE.Object3D;
  /** Measured wheel radius, m (bbox-derived; fallback applied by the loader). */
  radius: number;
}

export interface BoardAssets {
  root: THREE.Group;
  wheels: WheelHandle[];
  /** Board-local rest position of the nose-foot socket (validated, never null). */
  socketNose: THREE.Vector3;
  socketTail: THREE.Vector3;
  /** Whether the GLB actually carried non-origin socket transforms. */
  socketsFromGlb: boolean;
}

export interface ShoesAssets {
  root: THREE.Group;
  shoeL: THREE.Object3D;
  shoeR: THREE.Object3D;
}

/** Board-local socket fallback if the GLB empties sit at the origin. */
export interface SocketFallback {
  deckTopY: number;
  noseZ: number;
  tailZ: number;
}

function isCollisionProxy(name: string): boolean {
  return name.startsWith('COL_') || /_Col_\d*$/.test(name) || /_Col$/.test(name);
}

/** Hide collision proxies; flag real meshes for shadow cast/receive. */
function dressMeshes(root: THREE.Object3D): void {
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    if (isCollisionProxy(o.name)) {
      mesh.visible = false;
      return;
    }
    mesh.castShadow = true;
    mesh.receiveShadow = true;
  });
}

/** Half of the largest non-axle bbox extent ≈ wheel radius (axle is board X). */
function measureWheelRadius(node: THREE.Object3D, fallback: number): number {
  const box = new THREE.Box3().setFromObject(node);
  if (box.isEmpty()) return fallback;
  const size = new THREE.Vector3();
  box.getSize(size);
  // Axle runs along board X (deck width); the wheel disc lives in the Y–Z plane.
  const r = Math.max(size.y, size.z) / 2;
  return Number.isFinite(r) && r > 1e-4 ? r : fallback;
}

export class AssetLoader {
  readonly #loader: GLTFLoader;
  readonly #cache = new Map<string, Promise<THREE.Group>>();

  constructor(private readonly base: string = STAGED_BASE) {
    this.#loader = new GLTFLoader();
    this.#loader.setMeshoptDecoder(MeshoptDecoder);
  }

  #load(file: string): Promise<THREE.Group> {
    const url = this.base + file;
    const hit = this.#cache.get(url);
    if (hit) return hit;
    const p = this.#loader.loadAsync(url).then((gltf) => gltf.scene);
    this.#cache.set(url, p);
    return p;
  }

  /**
   * Load the hero board. Clones the cached scene so multiple mounts are safe and
   * so per-node transforms (wheel spin) never mutate the cache.
   */
  async loadBoard(
    fallback: SocketFallback,
    wheelRadiusFallback = 0.026,
    file = 'hero-board.lod0.glb',
  ): Promise<BoardAssets> {
    const root = (await this.#load(file)).clone(true);
    dressMeshes(root);

    const wheelNames = ['Wheel_FR', 'Wheel_FL', 'Wheel_RR', 'Wheel_RL'];
    const wheels: WheelHandle[] = [];
    for (const name of wheelNames) {
      const node = root.getObjectByName(name);
      if (node) wheels.push({ node, radius: measureWheelRadius(node, wheelRadiusFallback) });
    }

    // Sockets: prefer the GLB empties, but verify they carry a real transform —
    // exporters sometimes bake empties at the origin (advisor note). Fall back
    // to the harness rest offsets when the socket is ~(0,0,0).
    const local = new THREE.Vector3();
    const readSocket = (name: string, fallbackZ: number): { v: THREE.Vector3; real: boolean } => {
      const node = root.getObjectByName(name);
      if (node) {
        node.getWorldPosition(local);
        root.worldToLocal(local);
        if (local.lengthSq() > 1e-6) return { v: local.clone(), real: true };
      }
      return { v: new THREE.Vector3(0, fallback.deckTopY, fallbackZ), real: false };
    };
    const nose = readSocket('Socket_NoseFoot', fallback.noseZ);
    const tail = readSocket('Socket_TailFoot', fallback.tailZ);

    return {
      root,
      wheels,
      socketNose: nose.v,
      socketTail: tail.v,
      socketsFromGlb: nose.real || tail.real,
    };
  }

  async loadShoes(file = 'shoes.lod0.glb'): Promise<ShoesAssets> {
    const root = (await this.#load(file)).clone(true);
    dressMeshes(root);
    const shoeL = root.getObjectByName('Shoe_L') ?? root;
    const shoeR = root.getObjectByName('Shoe_R') ?? root;
    return { root, shoeL, shoeR };
  }
}
