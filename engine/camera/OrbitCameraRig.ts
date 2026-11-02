import { PerspectiveCamera } from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

/**
 * A ready-made third-person/orbit camera for voxel scenes — the same `PerspectiveCamera` +
 * `OrbitControls` setup (target, damping, auto-rotate, distance clamps, a polar-angle clamp
 * so the camera can't dip below the ground) that used to be hand-rolled three separate times
 * in the docs playground. Main-thread only: `OrbitControls` listens to real DOM pointer
 * events on `canvas`, so this doesn't work inside the `runEngineWorker` OffscreenCanvas path —
 * it's for applications that use engine primitives (`ProceduralWorld`, `ChunkGeometry`, ...)
 * directly in a page-owned Three.js scene, the way `docs/api/sandbox.ts` does, or that build
 * their own first-person-free viewer/editor with no `Player` at all.
 */
export interface OrbitCameraRigOptions {
  /** World-space point the camera orbits around. Defaults to the origin. */
  target?: [number, number, number];
  /** Initial distance from `target`. Defaults to 40. */
  distance?: number;
  minDistance?: number;
  maxDistance?: number;
  /** Clamps how far the camera can tilt below the horizon (radians). Defaults to just under 90°. */
  maxPolarAngle?: number;
  /** Defaults to true. */
  enableDamping?: boolean;
  /** Defaults to false. */
  autoRotate?: boolean;
  autoRotateSpeed?: number;
  fov?: number;
  near?: number;
  far?: number;
}

export interface OrbitCameraRig {
  readonly camera: PerspectiveCamera;
  readonly controls: OrbitControls;
  /** Call once per frame, before rendering — advances damping/auto-rotate. */
  update(): void;
  /** Call on canvas resize. */
  setAspect(width: number, height: number): void;
  dispose(): void;
}

export function createOrbitCameraRig(canvas: HTMLCanvasElement, options: OrbitCameraRigOptions = {}): OrbitCameraRig {
  const [tx, ty, tz] = options.target ?? [0, 0, 0];
  const distance = options.distance ?? 40;

  const camera = new PerspectiveCamera(
    options.fov ?? 55,
    canvas.clientWidth / Math.max(1, canvas.clientHeight),
    options.near ?? 0.1,
    options.far ?? 4000
  );
  camera.position.set(tx + distance * 0.72, ty + distance * 0.5, tz + distance * 0.72);

  const controls = new OrbitControls(camera, canvas);
  controls.target.set(tx, ty, tz);
  controls.enableDamping = options.enableDamping ?? true;
  controls.autoRotate = options.autoRotate ?? false;
  controls.autoRotateSpeed = options.autoRotateSpeed ?? 0.5;
  if (options.minDistance !== undefined) controls.minDistance = options.minDistance;
  if (options.maxDistance !== undefined) controls.maxDistance = options.maxDistance;
  controls.maxPolarAngle = options.maxPolarAngle ?? Math.PI * 0.495;
  controls.update();

  return {
    camera,
    controls,
    update: () => controls.update(),
    setAspect: (width, height) => {
      camera.aspect = width / Math.max(1, height);
      camera.updateProjectionMatrix();
    },
    dispose: () => controls.dispose()
  };
}
