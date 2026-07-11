/**
 * DebugRenderer — debug-quality three.js presentation for M2.
 *
 * The renderer NEVER steps physics and NEVER writes sim state (architecture §1,
 * module-ownership table). It only reads interpolated poses handed to it by the
 * loop and draws them. Camera is a simple fixed 3/4 chase; meshes are boxes.
 */

import * as THREE from 'three';
import type { SimConfig } from '@slackpad/shared';
import type { RenderPose } from '../sim/SimWorld';

export class DebugRenderer {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene: THREE.Scene;
  private readonly camera: THREE.PerspectiveCamera;
  private readonly boardGroup: THREE.Group;
  private readonly resizeHandler: () => void;
  private readonly resizeObserver: ResizeObserver | null = null;
  private lastPose: RenderPose | null = null;

  constructor(container: HTMLElement, config: SimConfig) {
    const phys = config.physics;

    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setSize(container.clientWidth || window.innerWidth, container.clientHeight || window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0b0d10);

    this.camera = new THREE.PerspectiveCamera(
      55,
      this.aspect(container),
      0.05,
      200,
    );
    // Fixed low 3/4 chase looking at the spawn area.
    this.camera.position.set(1.1, 0.9, 1.8);
    this.camera.lookAt(0, phys.spawnHeight * 0.4, 0);

    // Lights.
    const key = new THREE.DirectionalLight(0xffffff, 2.4);
    key.position.set(2, 5, 3);
    this.scene.add(key, new THREE.AmbientLight(0x8899aa, 0.65));

    // Ground plane + grid at y = 0 (matches the static collider top surface).
    const groundGeo = new THREE.PlaneGeometry(
      phys.ground.halfExtents.x * 2,
      phys.ground.halfExtents.z * 2,
    );
    groundGeo.rotateX(-Math.PI / 2);
    const ground = new THREE.Mesh(
      groundGeo,
      new THREE.MeshStandardMaterial({ color: 0x1a2028, roughness: 0.95 }),
    );
    this.scene.add(ground);
    const grid = new THREE.GridHelper(20, 40, 0x335577, 0x22303c);
    (grid.material as THREE.Material).opacity = 0.5;
    (grid.material as THREE.Material).transparent = true;
    this.scene.add(grid);

    // Board group: deck cuboid + two truck boxes (mirrors the collider layout).
    this.boardGroup = new THREE.Group();
    const deck = new THREE.Mesh(
      new THREE.BoxGeometry(phys.boardWidth, phys.deckThickness, phys.boardLength),
      new THREE.MeshStandardMaterial({ color: 0xcc5522, roughness: 0.6 }),
    );
    this.boardGroup.add(deck);
    const truckMat = new THREE.MeshStandardMaterial({ color: 0x888c92, roughness: 0.4, metalness: 0.6 });
    const t = phys.truckHalfExtents;
    for (const insetZ of [phys.truckInsetZ, -phys.truckInsetZ]) {
      const truck = new THREE.Mesh(new THREE.BoxGeometry(t.x * 2, t.y * 2, t.z * 2), truckMat);
      truck.position.set(0, -phys.truckDropY, insetZ);
      this.boardGroup.add(truck);
    }
    this.scene.add(this.boardGroup);

    this.resizeHandler = () => {
      this.camera.aspect = this.aspect(container);
      this.camera.updateProjectionMatrix();
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      this.renderer.setSize(
        container.clientWidth || window.innerWidth,
        container.clientHeight || window.innerHeight,
      );
    };
    window.addEventListener('resize', this.resizeHandler);
    // Container-driven resizes (panel layout changes) don't fire window resize.
    if (typeof ResizeObserver !== 'undefined') {
      this.resizeObserver = new ResizeObserver(this.resizeHandler);
      this.resizeObserver.observe(container);
    }
  }

  /** Draw one frame from an interpolated board pose. Reads only; never writes sim. */
  render(pose: RenderPose): void {
    this.lastPose = pose;
    this.boardGroup.position.set(pose.p.x, pose.p.y, pose.p.z);
    this.boardGroup.quaternion.set(pose.q.x, pose.q.y, pose.q.z, pose.q.w);
    this.renderer.render(this.scene, this.camera);
  }

  /**
   * Screenshot provider for AgentHarness.captureScreenshot(): re-renders the
   * last pose (WebGL buffers don't persist across tasks) and returns a PNG
   * data URL, or null before the first frame.
   */
  captureScreenshot = (): string | null => {
    if (!this.lastPose) return null;
    this.render(this.lastPose);
    return this.renderer.domElement.toDataURL('image/png');
  };

  dispose(): void {
    window.removeEventListener('resize', this.resizeHandler);
    this.resizeObserver?.disconnect();
    this.scene.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (mesh.geometry) mesh.geometry.dispose();
      const mat = mesh.material as THREE.Material | THREE.Material[] | undefined;
      if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
      else mat?.dispose();
    });
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }

  private aspect(container: HTMLElement): number {
    const w = container.clientWidth || window.innerWidth;
    const h = container.clientHeight || window.innerHeight || 1;
    return w / h;
  }
}
