import { PerspectiveCamera, Scene, WebGLRenderer } from 'three';
import ProceduralWorld from '../classes/Worlds/ProceduralWorld';
import Player from '../classes/Player';
import PlayerInteraction from '../classes/PlayerInteraction';

let renderer: WebGLRenderer;
let scene: Scene;
let camera: PerspectiveCamera;
let world: ProceduralWorld;
let player: Player;
let interaction: PlayerInteraction;
let isStarted = false;

const init = (canvas: OffscreenCanvas, width: number, height: number, pixelRatio: number) => {
  renderer = new WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setSize(width, height, false);
  renderer.setPixelRatio(pixelRatio);
  renderer.info.autoReset = true;

  scene = new Scene();
  camera = new PerspectiveCamera(75, width / height, 0.1, 5000);

  world = new ProceduralWorld({ chunkSize: 16, chunkHeight: 32, renderDistance: 8, verticalRenderDistance: 4, camera });
  scene.add(world);

  player = new Player({ camera, world, mode: 'debug' });
  interaction = new PlayerInteraction(camera, world);

  const loop = () => {
    if (isStarted) {
        player.update();
        world.tick();
    }
    renderer.render(scene, camera);

    // Send stats back to main thread
    if (isStarted) {
        self.postMessage({
          type: 'stats',
          stats: {
            x: camera.position.x,
            y: camera.position.y,
            z: camera.position.z,
            geometries: renderer.info.memory.geometries,
            textures: renderer.info.memory.textures,
            frame: renderer.info.render.frame,
            calls: renderer.info.render.calls,
            triangles: renderer.info.render.triangles,
            isUnderwater: world.isUnderwater
          }
        });
    }

    requestAnimationFrame(loop);
  };

  requestAnimationFrame(loop);
};

self.onmessage = (e: MessageEvent) => {
  const { type, payload } = e.data;

  if (type === 'init') {
    init(payload.canvas, payload.width, payload.height, payload.pixelRatio);
  } else if (type === 'resize') {
    if (camera && renderer) {
      camera.aspect = payload.width / payload.height;
      camera.updateProjectionMatrix();
      renderer.setSize(payload.width, payload.height, false);
    }
  } else if (type === 'keydown') {
    player?.onKeyDown(payload.key);
  } else if (type === 'keyup') {
    player?.onKeyUp(payload.key);
  } else if (type === 'mousemove') {
    player?.onMouseMove(payload.movementX, payload.movementY);
  } else if (type === 'mousedown') {
    interaction?.triggerClick();
  } else if (type === 'lock_state') {
    player?.setLock(payload.isLocked);
  } else if (type === 'command') {
    handleCommand(payload.command, payload.args);
  }
};

function handleCommand(cmd: string, args: string[]) {
  if (!player || !world) return;
  switch (cmd) {
    case '/start':
      isStarted = true;
      break;
    case '/time':
      world.setTime(args[0] || 'noon');
      break;
    case '/creative':
      player.setMode('debug');
      break;
    case '/survival':
      player.setMode('normal');
      break;
    case '/shaders':
      world.toggleShaders(args[0]?.toLowerCase() === 'on');
      break;
    case '/wireframe':
      world.toggleWireframe(args[0] === 'on' ? true : args[0] === 'off' ? false : undefined);
      break;
    case '/tp':
      if (args.length === 3) player.teleport(parseFloat(args[0]), parseFloat(args[1]), parseFloat(args[2]));
      break;
    case '/spawn':
      player.teleport(0, 40, 0);
      break;
    case '/regen':
      isStarted = true;
      const worldType = args[0] as any;
      world.reset(worldType ? { worldType } : undefined);
      player.teleport(0, 40, 0);
      break;
    case '/set':
      if (args[0] === 'chunk' && args[1] === 'height' && args[2]) {
          const h = parseInt(args[2]);
          world.setChunkHeight(h);
          world.reset();
          player.teleport(0, Math.max(40, h + 5), 0);
      } else if (args[0] === 'render' && args[1] === 'distance' && args[2]) {
          const d = parseInt(args[2]);
          world.setRenderDistance(d);
      } else if (args[0] === 'player' && args[1] === 'gravity' && args[2]) {
          const g = parseFloat(args[2]);
          player.setGravity(g);
      }
      break;
  }
}
