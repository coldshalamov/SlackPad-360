/**
 * M0 toolchain smoke entry. Proves three + rapier-deterministic-compat wire
 * up under Vite. Replaced by the real game bootstrap in M2+.
 */
import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-deterministic-compat';
import { CONTACT_FRAME_SCHEMA_VERSION, DEFAULT_SIM_CONFIG } from '@slackpad/shared';

async function boot(): Promise<void> {
  await RAPIER.init();
  const world = new RAPIER.World(DEFAULT_SIM_CONFIG.physics.gravity);
  world.timestep = 1 / DEFAULT_SIM_CONFIG.physics.hz;

  const app = document.getElementById('app');
  if (!app) throw new Error('missing #app');

  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  app.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x10141a);
  const camera = new THREE.PerspectiveCamera(
    60,
    window.innerWidth / window.innerHeight,
    0.1,
    100,
  );
  camera.position.set(0, 1.2, 2.4);
  camera.lookAt(0, 0.2, 0);

  const light = new THREE.DirectionalLight(0xffffff, 2.2);
  light.position.set(2, 4, 3);
  scene.add(light, new THREE.AmbientLight(0x8899aa, 0.6));

  const board = new THREE.Mesh(
    new THREE.BoxGeometry(
      DEFAULT_SIM_CONFIG.physics.boardWidth,
      0.05,
      DEFAULT_SIM_CONFIG.physics.boardLength,
    ),
    new THREE.MeshStandardMaterial({ color: 0xcc5522, roughness: 0.7 }),
  );
  board.position.y = 0.2;
  scene.add(board);

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  renderer.setAnimationLoop((tMs) => {
    board.rotation.y = tMs * 0.0006;
    renderer.render(scene, camera);
  });

  console.info(
    `[slackpad] m0 smoke ok — contactFrame v${CONTACT_FRAME_SCHEMA_VERSION}, rapier world @${DEFAULT_SIM_CONFIG.physics.hz}Hz`,
  );
}

void boot();
