import { PerspectiveCamera, Scene, WebGLRenderer, Color, Fog } from 'three';
import Stats from 'three/examples/jsm/libs/stats.module.js';

export function getCamera(): PerspectiveCamera {
  const camera = new PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 5000);

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    getRendererSingleton()?.setSize(window.innerWidth, window.innerHeight);
  });

  return camera;
}

export function getScene(): Scene {
  const scene = new Scene();
  return scene;
}

let _renderer: WebGLRenderer | null = null;

function getRendererSingleton(): WebGLRenderer | null {
  return _renderer;
}

export function getRenderer(): WebGLRenderer {
  const canvas = document.querySelector<HTMLCanvasElement>('#scene')!;
  const renderer = new WebGLRenderer({ canvas, antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.info.autoReset = true;
  _renderer = renderer;
  return renderer;
}

export function getStats(): Stats {
  const stats = new Stats();
  stats.dom.id = 'stats-overlay';
  document.body.appendChild(stats.dom);
  return stats;
}
