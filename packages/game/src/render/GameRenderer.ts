/**
 * GameRenderer (M7) — the presentation renderer. Replaces DebugRenderer as the
 * runtime view (DebugRenderer is KEPT for headless tests). It READS interpolated
 * board poses + ObserveState handed in each frame and draws them; it NEVER steps
 * physics and NEVER writes sim state (architecture module-ownership: "Renderer/
 * camera: three meshes, camera rig, materials; must not own a second physics
 * world").
 *
 * Scene: Kloppenheim 05 Pure Sky HDRI (PMREM env + background, ACES tone map,
 * sRGB output), ONE directional sun with soft shadows tuned for the plaza scale,
 * a tiled concrete ground plane, the STAGED hero board GLB driven by the
 * interpolated pose (wheels spun visually by ground speed), and the STAGED shoes
 * driven by ShoeAnimator. Camera framing is delegated to CameraRig.
 *
 * Performance guardrails (G5, iGPU 60fps target): pixelRatio ≤ 2, shadow map
 * ≤ 2048, exactly one directional light + env, no post-processing.
 */

import * as THREE from 'three';
import { HDRLoader } from 'three/addons/loaders/HDRLoader.js';
import type { SimConfig, ObserveState, Stance } from '@slackpad/shared';
import type { RenderPose } from '../sim/SimWorld';
import { AssetLoader, type WheelHandle } from './AssetLoader';
import { CameraRig } from './CameraRig';
import { ShoeAnimator } from './ShoeAnimator';
import { buildLevelStatics } from './LevelStatics';

const HDRI_URL = '/env/kloppenheim_05_puresky_1k.hdr';
const CONCRETE_BASE = '/textures/concrete/';

/**
 * Ground tint (multiplies the concrete albedo). The raw acg-concrete map reads
 * cream/warm-yellow; this cool-neutral grey neutralises the yellow so the plaza
 * floor reads as a daylight warm-grey concrete (art rubric §4).
 */
const GROUND_TINT = 0x9aa0a4;
/** Concrete tile size, m (albedo repeats every this many metres). */
const GROUND_TILE_M = 2.0;

export interface GameRendererOptions {
  stance: Stance;
  reducedMotion: boolean;
  /** Level whose static obstacles (rails/ledges) should be drawn. */
  levelId?: string;
}

export class GameRenderer {
  readonly #renderer: THREE.WebGLRenderer;
  readonly #scene: THREE.Scene;
  readonly #rig: CameraRig;
  readonly #config: SimConfig;
  readonly #container: HTMLElement;

  readonly #boardGroup = new THREE.Group();
  #wheels: WheelHandle[] = [];
  #shoeAnimator: ShoeAnimator | null = null;
  #ground: THREE.Mesh | null = null;
  #sun: THREE.DirectionalLight;

  #lastPose: RenderPose | null = null;
  #lastObs: ObserveState | null = null;
  #ready = false;

  // Scratch.
  readonly #forward = new THREE.Vector3();
  readonly #proj = new THREE.Vector3();

  private constructor(container: HTMLElement, config: SimConfig, opts: GameRendererOptions) {
    this.#config = config;
    this.#container = container;

    const w = container.clientWidth || window.innerWidth;
    const h = container.clientHeight || window.innerHeight;

    this.#renderer = new THREE.WebGLRenderer({ antialias: true });
    this.#renderer.setSize(w, h);
    this.#renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.#renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.#renderer.toneMappingExposure = 1.0;
    this.#renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.#renderer.shadowMap.enabled = true;
    this.#renderer.shadowMap.type = THREE.PCFShadowMap;
    container.appendChild(this.#renderer.domElement);

    this.#scene = new THREE.Scene();
    this.#scene.background = new THREE.Color(0x8fa6c0); // sky fallback until HDRI

    this.#rig = new CameraRig(config.camera, w / Math.max(1, h), opts.reducedMotion);

    // Exactly one directional sun (env provides the rest of the IBL).
    this.#sun = new THREE.DirectionalLight(0xfff2e0, 2.0);
    this.#sun.position.set(6, 10, 4);
    this.#sun.castShadow = true;
    this.#sun.shadow.mapSize.set(2048, 2048);
    const sc = this.#sun.shadow.camera;
    sc.near = 0.5;
    sc.far = 40;
    sc.left = -10;
    sc.right = 10;
    sc.top = 10;
    sc.bottom = -10;
    this.#sun.shadow.bias = -0.0004;
    this.#sun.shadow.normalBias = 0.02;
    this.#sun.shadow.radius = 3;
    this.#scene.add(this.#sun, this.#sun.target);
    this.#scene.add(this.#boardGroup);
  }

  /** Async factory: build the scene, then load env + staged GLBs + textures. */
  static async create(
    container: HTMLElement,
    config: SimConfig,
    opts: GameRendererOptions,
  ): Promise<GameRenderer> {
    const r = new GameRenderer(container, config, opts);
    await r.#init(opts.stance, opts.levelId);
    return r;
  }

  async #init(stance: Stance, levelId?: string): Promise<void> {
    this.#buildGround();
    if (levelId) this.#scene.add(buildLevelStatics(levelId));
    await Promise.all([this.#loadEnv(), this.#loadHero(stance)]);
    this.#installResize();
    this.#ready = true;
  }

  // --- Environment (HDRI → PMREM) ---------------------------------------
  async #loadEnv(): Promise<void> {
    try {
      const hdr = await new HDRLoader().loadAsync(HDRI_URL);
      hdr.mapping = THREE.EquirectangularReflectionMapping;
      const pmrem = new THREE.PMREMGenerator(this.#renderer);
      pmrem.compileEquirectangularShader();
      const envRT = pmrem.fromEquirectangular(hdr);
      this.#scene.environment = envRT.texture;
      this.#scene.background = hdr;
      this.#scene.backgroundBlurriness = 0.0;
      pmrem.dispose();
    } catch (err) {
      console.warn('[m7] HDRI load failed; using flat sky', err);
    }
  }

  // --- Ground (tiled concrete PBR) --------------------------------------
  #buildGround(): void {
    // The render floor and Rapier floor must share their extents. A visible
    // floor beyond the collider makes the player appear to fall through solid
    // concrete before they ever reach the map boundary.
    const bounds = this.#config.physics.ground.halfExtents;
    const sizeX = bounds.x * 2;
    const sizeZ = bounds.z * 2;
    const geo = new THREE.PlaneGeometry(sizeX, sizeZ, 1, 1);
    geo.rotateX(-Math.PI / 2);
    // aoMap needs a second UV set; PlaneGeometry ships only uv.
    geo.setAttribute('uv2', new THREE.BufferAttribute((geo.attributes.uv as THREE.BufferAttribute).array, 2));

    const tex = new THREE.TextureLoader();
    const repsX = sizeX / GROUND_TILE_M;
    const repsZ = sizeZ / GROUND_TILE_M;
    const wrap = (t: THREE.Texture, srgb: boolean): THREE.Texture => {
      t.wrapS = THREE.RepeatWrapping;
      t.wrapT = THREE.RepeatWrapping;
      t.repeat.set(repsX, repsZ);
      t.anisotropy = Math.min(8, this.#renderer.capabilities.getMaxAnisotropy());
      if (srgb) t.colorSpace = THREE.SRGBColorSpace;
      return t;
    };
    const color = wrap(tex.load(CONCRETE_BASE + 'Color.jpg'), true);
    const normal = wrap(tex.load(CONCRETE_BASE + 'NormalGL.jpg'), false);
    const rough = wrap(tex.load(CONCRETE_BASE + 'Roughness.jpg'), false);
    const ao = wrap(tex.load(CONCRETE_BASE + 'AmbientOcclusion.jpg'), false);

    const mat = new THREE.MeshStandardMaterial({
      map: color,
      normalMap: normal,
      roughnessMap: rough,
      aoMap: ao,
      color: new THREE.Color(GROUND_TINT),
      roughness: 1.0,
      metalness: 0.0,
    });
    const ground = new THREE.Mesh(geo, mat);
    ground.receiveShadow = true;
    ground.position.y = 0; // static collider top surface sits at world y=0
    this.#scene.add(ground);
    this.#ground = ground;
    // The occlusion spring-arm only needs to avoid clipping the floor.
    this.#rig.setOccluders([ground]);
  }

  // --- Hero board + shoes ------------------------------------------------
  async #loadHero(stance: Stance): Promise<void> {
    const phys = this.#config.physics;
    const base = {
      deckTopY: phys.deckThickness / 2,
      noseZ: phys.truckInsetZ,
      tailZ: -phys.truckInsetZ,
    };
    const loader = new AssetLoader();
    const [board, shoes] = await Promise.all([
      loader.loadBoard(base, this.#config.presentation.wheelRadiusFallback),
      loader.loadShoes(),
    ]);

    this.#boardGroup.add(board.root);
    this.#wheels = board.wheels;

    // Diagnostics: confirm board scale + socket provenance (advisor note).
    const bbox = new THREE.Box3().setFromObject(board.root);
    const dim = new THREE.Vector3();
    bbox.getSize(dim);
    console.info(
      `[m7] hero board loaded: bbox=${dim.x.toFixed(2)}×${dim.y.toFixed(2)}×${dim.z.toFixed(2)} m ` +
        `(expected long axis ≈ ${phys.boardLength} m), wheels=${this.#wheels.length}, ` +
        `sockets ${board.socketsFromGlb ? 'from GLB' : 'fallback→harness rest'}.`,
    );

    // Parent both shoes under the board group at their authored board-local
    // transforms (attach preserves world), then map L/R → nose/tail by stance.
    this.#boardGroup.add(shoes.root);
    this.#boardGroup.updateMatrixWorld(true);
    const roles = ShoeAnimator.roleOfShoe(stance);
    const noseShoe = roles.nose === 'L' ? shoes.shoeL : shoes.shoeR;
    const tailShoe = roles.tail === 'L' ? shoes.shoeL : shoes.shoeR;
    this.#boardGroup.attach(noseShoe);
    this.#boardGroup.attach(tailShoe);
    this.#boardGroup.remove(shoes.root);

    // AssetLoader returns sockets in board.root local space; convert them into
    // boardGroup local space before assigning the reparented shoes. This avoids
    // treating the GLB's lateral review-pair offsets as gameplay stance data.
    const noseSocket = this.#boardGroup.worldToLocal(board.root.localToWorld(board.socketNose.clone()));
    const tailSocket = this.#boardGroup.worldToLocal(board.root.localToWorld(board.socketTail.clone()));
    ShoeAnimator.placeAtSockets(noseShoe, tailShoe, noseSocket, tailSocket, stance);

    this.#shoeAnimator = new ShoeAnimator(noseShoe, tailShoe, this.#config.presentation, base);
  }

  // --- Per-frame render --------------------------------------------------
  /** Draw one frame from an interpolated pose + observation. Reads only. */
  render(pose: RenderPose, obs: ObserveState, frameDeltaSeconds = 1 / 60): void {
    const dt = Number.isFinite(frameDeltaSeconds)
      ? Math.min(2 / this.#config.physics.hz, Math.max(0, frameDeltaSeconds))
      : 1 / this.#config.physics.hz;
    this.#lastPose = pose;
    this.#lastObs = obs;

    // Board group follows the interpolated sim pose.
    this.#boardGroup.position.set(pose.p.x, pose.p.y, pose.p.z);
    this.#boardGroup.quaternion.set(pose.q.x, pose.q.y, pose.q.z, pose.q.w);

    // Wheels spin visually, proportional to forward ground speed (accumulated).
    this.#forward.set(0, 0, 1).applyQuaternion(this.#boardGroup.quaternion);
    const vForward =
      obs.board.lv.x * this.#forward.x + obs.board.lv.y * this.#forward.y + obs.board.lv.z * this.#forward.z;
    const spinFactor = this.#config.presentation.wheelSpinFactor;
    for (const wheel of this.#wheels) {
      const delta = (vForward / Math.max(1e-3, wheel.radius)) * dt * spinFactor;
      wheel.node.rotateX(delta);
    }

    // Keep the sun shadow frustum centred on the board (plaza-scale tightness).
    this.#sun.target.position.set(pose.p.x, 0, pose.p.z);
    this.#sun.position.set(pose.p.x + 6, 10, pose.p.z + 4);

    this.#shoeAnimator?.update(pose, obs, dt);
    this.#rig.update(pose, obs, dt);
    this.#renderer.render(this.#scene, this.#rig.camera);
  }

  /**
   * Screenshot provider for AgentHarness / self-check: re-render the last frame
   * (WebGL buffers don't persist without preserveDrawingBuffer, which we avoid
   * for perf) and return a PNG data URL. Synchronous render-then-read.
   */
  captureScreenshot = (): string | null => {
    if (!this.#lastPose) return null;
    this.#renderer.render(this.#scene, this.#rig.camera);
    return this.#renderer.domElement.toDataURL('image/png');
  };

  /** Settle the camera then re-render (still framing for rubric shots). */
  settleAndRender(): void {
    if (this.#lastPose && this.#lastObs) {
      this.#rig.settle(this.#lastPose, this.#lastObs);
      this.#shoeAnimator?.update(this.#lastPose, this.#lastObs, 1 / 60);
    }
    this.#renderer.render(this.#scene, this.#rig.camera);
  }

  /** Sample center pixels post-render → average luma + nonblank flag. */
  readbackCenter(block = 8): { luma: number; nonblank: boolean } {
    this.#renderer.render(this.#scene, this.#rig.camera);
    const gl = this.#renderer.getContext();
    const dpr = this.#renderer.getPixelRatio();
    const cw = Math.floor(this.#container.clientWidth * dpr);
    const ch = Math.floor(this.#container.clientHeight * dpr);
    const x = Math.max(0, Math.floor(cw / 2 - block / 2));
    const y = Math.max(0, Math.floor(ch / 2 - block / 2));
    const px = new Uint8Array(block * block * 4);
    gl.readPixels(x, y, block, block, gl.RGBA, gl.UNSIGNED_BYTE, px);
    let sum = 0;
    for (let i = 0; i < px.length; i += 4) {
      sum += 0.2126 * px[i]! + 0.7152 * px[i + 1]! + 0.0722 * px[i + 2]!;
    }
    const luma = sum / (block * block);
    // Nonblank = the canvas drew a real frame (a cleared/lost context reads ~0).
    // A bright uniform daylight-sky centre is a legitimate render, so brightness
    // alone — not variance — is the signal.
    return { luma, nonblank: luma > 3 };
  }

  /** Project the board centre to CSS pixel coordinates (for HUD overlap). */
  projectBoardCenter(): { x: number; y: number } | null {
    if (!this.#lastPose) return null;
    this.#proj.set(this.#lastPose.p.x, this.#lastPose.p.y, this.#lastPose.p.z).project(this.#rig.camera);
    const w = this.#container.clientWidth;
    const h = this.#container.clientHeight;
    return { x: (this.#proj.x * 0.5 + 0.5) * w, y: (-this.#proj.y * 0.5 + 0.5) * h };
  }

  /** Resize to explicit dimensions (S7 framing shots); restores via resize(). */
  setViewport(width: number, height: number): void {
    this.#renderer.setSize(width, height, false);
    this.#rig.setAspect(width / Math.max(1, height));
  }

  /** Reset the viewport to the live container size. */
  resize = (): void => {
    const w = this.#container.clientWidth || window.innerWidth;
    const h = this.#container.clientHeight || window.innerHeight;
    this.#renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.#renderer.setSize(w, h);
    this.#rig.setAspect(w / Math.max(1, h));
  };

  #installResize(): void {
    window.addEventListener('resize', this.resize);
    if (typeof ResizeObserver !== 'undefined') {
      new ResizeObserver(this.resize).observe(this.#container);
    }
  }

  get camera(): THREE.PerspectiveCamera {
    return this.#rig.camera;
  }
  get cameraRig(): CameraRig {
    return this.#rig;
  }
  get domElement(): HTMLCanvasElement {
    return this.#renderer.domElement;
  }
  get isReady(): boolean {
    return this.#ready;
  }
  get shotMode(): string {
    return this.#rig.mode;
  }

  dispose(): void {
    window.removeEventListener('resize', this.resize);
    this.#renderer.dispose();
    this.#renderer.domElement.remove();
  }
}
