import { PerspectiveCamera, Scene, Vector3, WebGLRenderer } from 'three';
import ProceduralWorld from '../classes/Worlds/ProceduralWorld';
import Player from '../classes/Player';
import PlayerInteraction from '../classes/PlayerInteraction';
import NetworkClient from '../classes/Network/NetworkClient';
import { blockRegistry } from '../core/BlockRegistry';
import { syncBlockTypes } from '../constants/block-types';
import { GameLoop } from '../core/loop/GameLoop';
import { BlackHoleManager } from '../classes/Effects/BlackHoleManager';
import { ExplosionManager } from '../classes/Effects/ExplosionManager';
import { BeamManager } from '../classes/Effects/BeamManager';
import { CelestialManager } from '../classes/Celestial/CelestialManager';
import { StarType } from '../classes/Celestial/Star';
import { PlanetType } from '../classes/Celestial/Planet';
import { raycastVoxel } from '../core/physics/VoxelRaycaster';
import { getVolcanoInCell } from '../classes/Worlds/generators/StandardWorldGenerator';
import { DimensionManager } from '../classes/Dimensions/DimensionManager';
import { dimensionRegistry } from '../core/dimension/DimensionRegistry';

let renderer: WebGLRenderer;
let scene: Scene;
let camera: PerspectiveCamera;
let world: ProceduralWorld;
let player: Player;
let interaction: PlayerInteraction;
let networkClient: NetworkClient;
let blackHoleManager: BlackHoleManager;
let explosionManager: ExplosionManager;
let beamManager: BeamManager;
let celestialManager: CelestialManager;
let dimensionManager: DimensionManager;
let isStarted = false;

const init = (canvas: OffscreenCanvas, width: number, height: number, pixelRatio: number) => {
  renderer = new WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setSize(width, height, false);
  renderer.setPixelRatio(pixelRatio);
  renderer.info.autoReset = true;

  scene = new Scene();
  camera = new PerspectiveCamera(75, width / height, 0.1, 5000);

  world = new ProceduralWorld({ chunkSize: 16, chunkHeight: 32, renderDistance: 8, verticalRenderDistance: 6, camera });
  scene.add(world);

  player = new Player({ camera, world, mode: 'debug' });
  interaction = new PlayerInteraction(
    camera,
    world,
    (pos, normal, blockType) => {
      if (networkClient) {
        networkClient.broadcastBlockBreak(pos.x, pos.y, pos.z);
      }
      self.postMessage({
        type: 'event',
        event: 'block:break',
        payload: {
          position: { x: pos.x, y: pos.y, z: pos.z },
          normal: { x: normal.x, y: normal.y, z: normal.z },
          blockType
        }
      });
    },
    (pos, normal, type) => {
      if (networkClient) {
        networkClient.broadcastBlockPlace(pos.x, pos.y, pos.z, type);
      }
      self.postMessage({
        type: 'event',
        event: 'block:place',
        payload: {
          position: { x: pos.x, y: pos.y, z: pos.z },
          normal: { x: normal.x, y: normal.y, z: normal.z },
          blockType: type
        }
      });
    },
    (type: number) => {
      self.postMessage({ type: 'selection_change', payload: { type } });
    }
  );

  networkClient = new NetworkClient(world, player);

  networkClient.onWorldInit = (config) => {
    self.postMessage({ type: 'world_init', config });
  };

  networkClient.onWorldRegen = (config) => {
    self.postMessage({ type: 'world_regen', config });
  };

  blackHoleManager = new BlackHoleManager(scene);
  blackHoleManager.onChatMessage = (text: string) => {
    self.postMessage({
      type: 'event',
      event: 'chat:message',
      payload: { text }
    });
  };
  blackHoleManager.onMerger = (pos, newRadius) => {
    self.postMessage({
      type: 'event',
      event: 'blackhole:merger',
      payload: { x: pos.x, y: pos.y, z: pos.z, radius: newRadius }
    });
  };

  explosionManager = new ExplosionManager(scene);
  explosionManager.onExplosion = (info) => {
    self.postMessage({
      type: 'event',
      event: 'explosion:occurred',
      payload: info
    });
  };

  beamManager = new BeamManager(scene);
  beamManager.onBeamFired = (info) => {
    self.postMessage({
      type: 'event',
      event: 'beam:fired',
      payload: info
    });
  };
  beamManager.onChatMessage = (text: string) => {
    self.postMessage({
      type: 'event',
      event: 'chat:message',
      payload: { text }
    });
  };

  celestialManager = new CelestialManager(scene);
  celestialManager.onChatMessage = (text: string) => {
    self.postMessage({
      type: 'event',
      event: 'chat:message',
      payload: { text }
    });
  };

  dimensionManager = new DimensionManager();
  dimensionManager.onChatMessage = (text: string) => {
    self.postMessage({
      type: 'event',
      event: 'chat:message',
      payload: { text }
    });
  };
  dimensionManager.onAbsorptionProgress = (progress, targetDimId, colorHex) => {
    self.postMessage({
      type: 'event',
      event: 'portal:absorption',
      payload: { progress, targetDimId, colorHex }
    });
  };

  const gameLoop = new GameLoop({
    targetTps: 60,
    onFixedUpdate: (fixedDelta, dtScale) => {
      if (isStarted) {
        player.update(dtScale);
        world.tick(fixedDelta);
        dimensionManager?.update(fixedDelta / 1000, world, player);
        blackHoleManager?.update(fixedDelta, player, world);
        celestialManager?.update(fixedDelta, blackHoleManager);
        explosionManager?.update(fixedDelta);
        beamManager?.update(fixedDelta);
        networkClient.update(performance.now(), fixedDelta);
      }
    },
    onRender: (_alpha, _frameDelta) => {
      if (isStarted) {
        interaction?.update();
      }
      renderer.render(scene, camera);

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
    }
  });

  gameLoop.start();
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
    interaction?.onKeyDown(payload.key);

    // Quick trigger: pressionar 'r' solta um raio divino onde o jogador estiver olhando
    if (payload.key?.toLowerCase() === 'r' && isStarted) {
      beamManager?.fireFromPlayer(player, world, explosionManager, 'lightning', 5.0);
    }
  } else if (type === 'keyup') {
    player?.onKeyUp(payload.key);
  } else if (type === 'mousemove') {
    player?.onMouseMove(payload.movementX, payload.movementY);
  } else if (type === 'mousedown') {
    interaction?.triggerClick(payload.button);
  } else if (type === 'lock_state') {
    player?.setLock(payload.isLocked);
    interaction?.setLock(payload.isLocked);
  } else if (type === 'select_block') {
    interaction?.setSelectedBlockType(payload.type);
  } else if (type === 'select_slot') {
    interaction?.selectSlot(payload.index);
  } else if (type === 'wheel') {
    interaction?.onWheel(payload.direction);
  } else if (type === 'register_block') {
    blockRegistry.register(payload);
    syncBlockTypes();
  } else if (type === 'command') {
    handleCommand(payload.command, payload.args);
  }
};

function handleCommand(cmd: string, args: string[]) {
  if (!player || !world) return;
  switch (cmd) {
    case '/start':
      isStarted = true;
      const protocol = self.location.protocol === 'https:' ? 'wss:' : 'ws:';
      networkClient.connect(`${protocol}//${self.location.host}/ws`);
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
    case '/volcano':
    case '/vulcao': {
      const cellX = Math.floor(player.camera.position.x / 192);
      const cellZ = Math.floor(player.camera.position.z / 192);
      let nearestV = getVolcanoInCell(0, 0);
      let minD = 999999;
      for (let dx = -2; dx <= 2; dx++) {
        for (let dz = -2; dz <= 2; dz++) {
          const v = getVolcanoInCell(cellX + dx, cellZ + dz);
          if (!v.exists) continue;
          const d = Math.sqrt((player.camera.position.x - v.x) ** 2 + (player.camera.position.z - v.z) ** 2);
          if (d < minD) {
            minD = d;
            nearestV = v;
          }
        }
      }
      player.teleport(nearestV.x + nearestV.craterR, 36 + nearestV.height + 4, nearestV.z);
      self.postMessage({
        type: 'event',
        event: 'chat:message',
        payload: { text: `🌋 Teleportado para o topo do vulcão em (${nearestV.x}, ${nearestV.z})!` }
      });
      break;
    }
    case '/dim':
    case '/dimension': {
      const sub = args[0]?.toLowerCase();
      if (!sub || sub === 'list') {
        const all = dimensionRegistry.getAll();
        const listText = all.map(d => `• ${d.id}: ${d.name} (${(d.physics.gravity / 0.008).toFixed(2)}G)`).join('\n');
        self.postMessage({
          type: 'event',
          event: 'chat:message',
          payload: { text: `🌌 Dimensões disponíveis na Engine:\n${listText}\nComandos: /dim <id> (ex: /dim nether, /dim lunar, /dim void) ou /portal [id]` }
        });
        break;
      }

      if (sub === 'info') {
        const cur = dimensionManager.currentDimension;
        self.postMessage({
          type: 'event',
          event: 'chat:message',
          payload: { text: `📍 Dimensão Atual: ${cur.name} [${cur.id}]\n• Gravidade: ${(cur.physics.gravity / 0.008).toFixed(2)}G\n• Escala Coordenadas: 1:${cur.coordinateScale ?? 1}\n• Gerador: ${cur.generatorId}\n• ${cur.description ?? ''}` }
        });
        break;
      }

      isStarted = true;
      dimensionManager.travelTo(sub, world, player, {
        createReturnPortal: true,
        useCoordinateScaling: true
      });
      break;
    }
    case '/rift':
    case '/portal':
    case '/fenda': {
      const targetDim = args[0]?.toLowerCase() || (dimensionManager.currentId === 'nether' ? 'overworld' : 'nether');
      const dir = new Vector3();
      camera.getWorldDirection(dir);
      const spawnPos = camera.position.clone().add(dir.multiplyScalar(3.8));
      spawnPos.y = Math.max(player.camera.position.y - 0.2, 5);

      dimensionManager.spawnDimensionalRift(world, spawnPos, targetDim);
      break;
    }
    case '/regen':
      isStarted = true;
      const worldType = args[0] as any;
      if (worldType && dimensionRegistry.has(worldType.toLowerCase())) {
        dimensionManager.travelTo(worldType.toLowerCase(), world, player, { createReturnPortal: false });
      } else {
        world.reset(worldType ? { worldType } : undefined);
        player.teleport(0, 40, 0);
      }
      networkClient.broadcastWorldConfig({ type: worldType || 'standard' });
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
    case '/blackhole':
    case '/buraconegro':
    case '/bh': {
      if (args[0] === 'clear' || args[0] === 'remove' || args[0] === 'limpar') {
        blackHoleManager?.clear();
        break;
      }

      // Default position: 16 blocks directly ahead of the player's gaze
      const dir = new Vector3();
      camera.getWorldDirection(dir);
      const spawnPos = camera.position.clone().add(dir.multiplyScalar(16));

      let radius = 3.0;
      let lifetime = 45;

      if (args[0] === 'spawn' && args.length >= 4) {
        spawnPos.set(parseFloat(args[1]), parseFloat(args[2]), parseFloat(args[3]));
        if (args[4]) radius = parseFloat(args[4]);
        if (args[5]) lifetime = parseFloat(args[5]);
      } else {
        if (args[0] && !isNaN(parseFloat(args[0]))) {
          radius = parseFloat(args[0]);
        }
        if (args[1] && !isNaN(parseFloat(args[1]))) {
          lifetime = parseFloat(args[1]);
        }
      }

      blackHoleManager?.spawn({
        position: spawnPos,
        radius,
        lifetime
      });
      break;
    }
    case '/raio':
    case '/lightning':
    case '/beam': {
      const radius = args[0] ? parseFloat(args[0]) : 5.5;
      beamManager?.fireFromPlayer(player, world, explosionManager, 'lightning', isNaN(radius) ? 5.5 : radius);
      break;
    }
    case '/laser': {
      const radius = args[0] ? parseFloat(args[0]) : 4.5;
      beamManager?.fireFromPlayer(player, world, explosionManager, 'laser', isNaN(radius) ? 4.5 : radius);
      break;
    }
    case '/orbital': {
      const radius = args[0] ? parseFloat(args[0]) : 11.0;
      beamManager?.fireFromPlayer(player, world, explosionManager, 'orbital', isNaN(radius) ? 11.0 : radius);
      break;
    }
    case '/explode':
    case '/boom': {
      const radius = args[0] ? parseFloat(args[0]) : 6.0;
      const dir = new Vector3();
      camera.getWorldDirection(dir);
      const hit = raycastVoxel(world, camera.position, dir, 120);
      const targetPos = hit ? hit.point : camera.position.clone().add(dir.multiplyScalar(25));
      explosionManager?.createExplosion({ position: targetPos, radius: isNaN(radius) ? 6.0 : radius }, world, player);
      break;
    }
    case '/nuke':
    case '/nuclear':
    case '/cogumelo': {
      const radius = args[0] ? parseFloat(args[0]) : 18.0;
      const height = args[1] ? parseFloat(args[1]) : 75.0;
      const dir = new Vector3();
      camera.getWorldDirection(dir);
      const hit = raycastVoxel(world, camera.position, dir, 160);
      const targetPos = hit ? hit.point : camera.position.clone().add(dir.multiplyScalar(40));

      explosionManager?.createNuclearExplosion({
        position: targetPos,
        radius: isNaN(radius) ? 18.0 : radius,
        cloudHeight: isNaN(height) ? 75.0 : height
      }, world, player);

      self.postMessage({
        type: 'event',
        event: 'chat:message',
        payload: { text: `☢️ DETONAÇÃO NUCLEAR! Cogumelo atômico se erguendo em [${Math.round(targetPos.x)}, ${Math.round(targetPos.y)}, ${Math.round(targetPos.z)}]!` }
      });
      break;
    }
    case '/star':
    case '/estrela': {
      if (args[0] === 'clear' || args[0] === 'limpar') {
        celestialManager?.clear();
        break;
      }

      const dir = new Vector3();
      camera.getWorldDirection(dir);
      const spawnPos = camera.position.clone().add(dir.multiplyScalar(30));

      let type: StarType = 'sol';
      let radius: number | undefined = undefined;

      for (const arg of args) {
        const lower = arg.toLowerCase();
        if (['sol', 'sun', 'amarela', 'yellow'].includes(lower)) type = 'sol';
        else if (['blue', 'azul', 'rigel'].includes(lower)) type = 'blue';
        else if (['red', 'vermelha', 'betelgeuse', 'giant'].includes(lower)) type = 'red';
        else if (['neutron', 'neutrons', 'pulsar'].includes(lower)) type = 'neutron';
        else {
          const num = parseFloat(arg);
          if (!isNaN(num) && num > 0) radius = num;
        }
      }

      celestialManager?.spawnStar({
        position: spawnPos,
        type,
        radius
      }, blackHoleManager?.getBlackHoles());
      break;
    }
    case '/planet':
    case '/planeta': {
      if (args[0] === 'clear' || args[0] === 'limpar') {
        celestialManager?.clear();
        break;
      }

      const dir = new Vector3();
      camera.getWorldDirection(dir);
      const spawnPos = camera.position.clone().add(dir.multiplyScalar(24));

      let type: PlanetType = 'earth';
      let radius: number | undefined = undefined;

      for (const arg of args) {
        const lower = arg.toLowerCase();
        if (['earth', 'terra', 'mundo'].includes(lower)) type = 'earth';
        else if (['gas', 'gas_giant', 'gasoso', 'saturno', 'jupiter'].includes(lower)) type = 'gas_giant';
        else if (['lava', 'magma', 'fogo'].includes(lower)) type = 'lava';
        else if (['ice', 'gelo', 'neve'].includes(lower)) type = 'ice';
        else {
          const num = parseFloat(arg);
          if (!isNaN(num) && num > 0) radius = num;
        }
      }

      celestialManager?.spawnPlanet(
        {
          position: spawnPos,
          type,
          radius
        },
        undefined,
        blackHoleManager?.getBlackHoles()
      );
      break;
    }
    case '/celestial': {
      if (args[0] === 'clear' || args[0] === 'limpar') {
        celestialManager?.clear();
      }
      break;
    }
  }
}
