import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { DEFAULT_SIM_CONFIG, type ObserveState } from "@slackpad/shared";
import { CameraRig } from "../src/render/CameraRig";

const OBS: ObserveState = {
  step: 1,
  seed: 1,
  board: {
    p: { x: 0, y: 0.05, z: 0 },
    q: { x: 0, y: 0, z: 0, w: 1 },
    lv: { x: 0, y: 0, z: 4 },
    av: { x: 0, y: 0, z: 0 },
  },
  phase: "ground",
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
  inputSource: "synthetic",
};

describe("CameraRig riding composition", () => {
  it("aims the first smoothed frame at the board instead of easing from the default camera rotation", () => {
    const rig = new CameraRig(DEFAULT_SIM_CONFIG.camera, 16 / 9);
    rig.update({ p: OBS.board.p, q: OBS.board.q }, OBS, 1 / 60);
    rig.camera.updateMatrixWorld(true);

    const board = new THREE.Vector3(
      OBS.board.p.x,
      OBS.board.p.y,
      OBS.board.p.z,
    ).project(rig.camera);
    expect(
      board.z,
      "board is in front of the camera on the first rendered frame",
    ).toBeLessThan(1);
    expect(
      Math.abs(board.x),
      "board is horizontally inside the first rendered frame",
    ).toBeLessThanOrEqual(1);
    expect(
      Math.abs(board.y),
      "board is vertically inside the first rendered frame",
    ).toBeLessThanOrEqual(1);
  });

  it("keeps rate-limiting orientation changes after the opening cut", () => {
    const rig = new CameraRig(DEFAULT_SIM_CONFIG.camera, 16 / 9);
    rig.update({ p: OBS.board.p, q: OBS.board.q }, OBS, 1 / 60);
    const openingRotation = rig.camera.quaternion.clone();

    const reversed = { p: OBS.board.p, q: { x: 0, y: 1, z: 0, w: 0 } };
    rig.update(reversed, OBS, 1 / 60);

    const rotationStep = openingRotation.angleTo(rig.camera.quaternion);
    const maxStep =
      THREE.MathUtils.degToRad(DEFAULT_SIM_CONFIG.camera.maxAngularRateDeg) /
      60;
    expect(rotationStep).toBeGreaterThan(1e-4);
    expect(rotationStep).toBeLessThanOrEqual(maxStep + 1e-6);
  });

  it("still cuts immediately when reduced motion is enabled after startup", () => {
    const rig = new CameraRig(DEFAULT_SIM_CONFIG.camera, 16 / 9);
    rig.update({ p: OBS.board.p, q: OBS.board.q }, OBS, 1 / 60);
    rig.setReducedMotion(true);

    const moved = {
      p: { x: 8, y: OBS.board.p.y, z: 4 },
      q: { x: 0, y: 1, z: 0, w: 0 },
    };
    rig.update(moved, OBS, 1 / 60);
    rig.camera.updateMatrixWorld(true);

    const board = new THREE.Vector3(moved.p.x, moved.p.y, moved.p.z).project(
      rig.camera,
    );
    expect(Math.abs(board.x)).toBeLessThanOrEqual(1);
    expect(Math.abs(board.y)).toBeLessThanOrEqual(1);
    expect(board.z).toBeLessThan(1);
  });

  it("defaults to a side-on fingerboard view at riding speed", () => {
    const rig = new CameraRig(DEFAULT_SIM_CONFIG.camera, 16 / 9, true);
    rig.update({ p: OBS.board.p, q: OBS.board.q }, OBS, 1 / 60);

    const offset = rig.camera.position
      .clone()
      .sub(new THREE.Vector3(0, 0.05, 0));
    const horizontalDistance = Math.hypot(offset.x, offset.z);
    expect(rig.viewMode).toBe("fingerboard");
    expect(horizontalDistance).toBeGreaterThanOrEqual(0.8);
    expect(
      Math.abs(offset.x),
      "camera sits beside the +Z-facing board",
    ).toBeGreaterThan(Math.abs(offset.z) * 3);
  });

  it("regular/right-handed forward travel reads toward screen-right", () => {
    const rig = new CameraRig(DEFAULT_SIM_CONFIG.camera, 16 / 9, true);
    rig.update({ p: OBS.board.p, q: OBS.board.q }, OBS, 1 / 60);
    rig.camera.updateMatrixWorld(true);

    const board = new THREE.Vector3(0, 0.05, 0).project(rig.camera);
    const forward = new THREE.Vector3(0, 0.05, 1).project(rig.camera);
    expect(forward.x).toBeGreaterThan(board.x);
  });

  it("looks across the deck rather than primarily down the route", () => {
    const rig = new CameraRig(DEFAULT_SIM_CONFIG.camera, 16 / 9, true);
    const pose = { p: OBS.board.p, q: OBS.board.q };
    rig.update(pose, OBS, 1 / 60);

    const cameraToBoard = new THREE.Vector3()
      .copy(rig.camera.position)
      .multiplyScalar(-1)
      .normalize();
    const boardForward = new THREE.Vector3(0, 0, 1);

    const routeAlignment = Math.abs(cameraToBoard.dot(boardForward));
    expect(routeAlignment).toBeLessThan(0.35);
  });

  it("keeps the tactile side-on frame in the air", () => {
    const rig = new CameraRig(DEFAULT_SIM_CONFIG.camera, 16 / 9, true);
    const airObs: ObserveState = {
      ...OBS,
      phase: "air",
      board: {
        ...OBS.board,
        p: { x: 0, y: 0.8, z: 0 },
        lv: { x: 0, y: 1, z: 4 },
      },
    };
    rig.update({ p: airObs.board.p, q: airObs.board.q }, airObs, 1 / 60);

    const cameraToBoard = new THREE.Vector3()
      .copy(rig.camera.position)
      .sub(new THREE.Vector3(0, 0.8, 0))
      .multiplyScalar(-1)
      .normalize();
    expect(Math.abs(cameraToBoard.dot(new THREE.Vector3(0, 0, 1)))).toBeLessThan(0.35);
  });

  it("does not turn the default view into a chase camera as speed rises", () => {
    const slowRig = new CameraRig(DEFAULT_SIM_CONFIG.camera, 16 / 9, true);
    const fastRig = new CameraRig(DEFAULT_SIM_CONFIG.camera, 16 / 9, true);
    const slow = { ...OBS, board: { ...OBS.board, lv: { x: 0, y: 0, z: 0.5 } } };
    const fast = { ...OBS, board: { ...OBS.board, lv: { x: 0, y: 0, z: 7 } } };
    slowRig.update({ p: slow.board.p, q: slow.board.q }, slow, 1 / 60);
    fastRig.update({ p: fast.board.p, q: fast.board.q }, fast, 1 / 60);
    expect(Math.abs(fastRig.camera.position.x)).toBeGreaterThan(Math.abs(fastRig.camera.position.z) * 3);
    expect(Math.abs(slowRig.camera.position.x)).toBeGreaterThan(Math.abs(slowRig.camera.position.z) * 3);
  });

  it("offers the route camera only as an explicit alternate view", () => {
    const routeRig = new CameraRig(DEFAULT_SIM_CONFIG.camera, 16 / 9, true);
    const closeRig = new CameraRig(DEFAULT_SIM_CONFIG.camera, 16 / 9, true);
    routeRig.setViewMode("route");
    routeRig.update({ p: OBS.board.p, q: OBS.board.q }, OBS, 1 / 60);
    closeRig.update({ p: OBS.board.p, q: OBS.board.q }, OBS, 1 / 60);

    const routeOffset = routeRig.camera.position.clone().sub(new THREE.Vector3(0, 0.05, 0));
    const closeOffset = closeRig.camera.position.clone().sub(new THREE.Vector3(0, 0.05, 0));
    expect(closeOffset.length()).toBeLessThan(routeOffset.length());
    expect(Math.abs(closeOffset.x)).toBeGreaterThan(Math.abs(closeOffset.z));
    expect(closeRig.viewMode).toBe("fingerboard");
  });
});
