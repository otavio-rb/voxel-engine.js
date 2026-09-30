import { PerspectiveCamera, Scene, WebGLRenderer } from 'three';
import ProceduralWorld from '../world/ProceduralWorld';
import Player from '../player/Player';
import PlayerInteraction from '../player/PlayerInteraction';
import { GameLoop } from '../core/GameLoop';
import { VoxelParticles } from '../effects/VoxelParticles';
import { EventEmitter } from '../core/EventEmitter';
import { BlockPosition, WorldConfig } from '../types';
import { CommandRegistry } from './CommandRegistry';
import { registerCoreCommands } from './coreCommands';

/**
 * A slice of game logic that runs inside the engine worker.
 * `setup` is called once, after the world, player and renderer exist.
 */
export interface EnginePlugin {
  readonly name: string;
  setup(ctx: EngineContext): void;
}

export interface EngineWorkerOptions {
  /** Spawns a chunk worker; its entry must call `runChunkWorker`. */
  createChunkWorker: () => Worker;
  /** Runs before the world is created. Register blocks, dimensions and entities here. */
  setup?: () => void;
  plugins?: EnginePlugin[];
  world?: Partial<WorldConfig> & { initialDimension?: string };
  /** Block IDs bound to the number keys / mouse wheel. */
  hotbar?: number[];
  spawnPoint?: BlockPosition;
  targetTps?: number;
}

export interface FixedUpdateEvent {
  deltaMs: number;
  dtScale: number;
}

export interface RenderEvent {
  alpha: number;
  frameDeltaMs: number;
}

export interface BlockInteractionEvent {
  position: BlockPosition;
  normal: BlockPosition;
  blockType?: number;
}

/**
 * Everything a plugin can reach inside the engine worker.
 *
 * Local hooks (subscribe with `ctx.on`): `start`, `fixedUpdate` (FixedUpdateEvent),
 * `render` (RenderEvent), `keydown` / `keyup` (key string), `block:break` / `block:place`
 * (BlockInteractionEvent).
 */
export class EngineContext extends EventEmitter {
  /** False until `/start`; the simulation and interaction are paused while false. */
  public started = false;
  public readonly commands = new CommandRegistry();

  constructor(
    public readonly renderer: WebGLRenderer,
    public readonly scene: Scene,
    public readonly camera: PerspectiveCamera,
    public readonly world: ProceduralWorld,
    public readonly player: Player,
    public readonly interaction: PlayerInteraction,
    public readonly spawnPoint: BlockPosition,
    /** Shared particle pool, simulated by the engine; plugins decide what to emit. */
    public readonly particles: VoxelParticles
  ) {
    super();
  }

  /** Sends an event to the main thread, where `VoxelEngine` re-emits it under the same name. */
  public emitToMain<T = unknown>(event: string, payload?: T): void {
    self.postMessage({ type: 'event', event, payload });
  }

  /** Handles messages sent from the main thread with `VoxelEngine.send(name, payload)`. */
  public onMessage<T = unknown>(name: string, handler: (payload: T) => void): () => void {
    return this.on<T>(`message:${name}`, handler);
  }

  public executeCommand(command: string, args: string[] = []): boolean {
    return this.commands.execute(command, args, this);
  }

  public teleportToSpawn(): void {
    this.player.teleport(this.spawnPoint.x, this.spawnPoint.y, this.spawnPoint.z);
  }
}

interface InitPayload {
  canvas: OffscreenCanvas;
  width: number;
  height: number;
  pixelRatio: number;
}

/** Entry point for the engine worker. The game's worker file calls this once. */
export function runEngineWorker(options: EngineWorkerOptions): void {
  let ctx: EngineContext | null = null;

  self.onmessage = (e: MessageEvent) => {
    const { type, payload } = e.data;

    if (type === 'init') {
      ctx = createContext(options, payload as InitPayload);
      return;
    }
    if (!ctx) return;

    const { camera, renderer, player, interaction } = ctx;
    switch (type) {
      case 'resize':
        camera.aspect = payload.width / payload.height;
        camera.updateProjectionMatrix();
        renderer.setSize(payload.width, payload.height, false);
        break;
      case 'keydown':
        player.onKeyDown(payload.key);
        interaction.onKeyDown(payload.key);
        ctx.emit('keydown', payload.key);
        break;
      case 'keyup':
        player.onKeyUp(payload.key);
        ctx.emit('keyup', payload.key);
        break;
      case 'mousemove':
        player.onMouseMove(payload.movementX, payload.movementY);
        break;
      case 'mousedown':
        interaction.triggerClick(payload.button);
        break;
      case 'lock_state':
        player.setLock(payload.isLocked);
        interaction.setLock(payload.isLocked);
        break;
      case 'select_block':
        interaction.setSelectedBlockType(payload.type);
        break;
      case 'select_slot':
        interaction.selectSlot(payload.index);
        break;
      case 'wheel':
        interaction.onWheel(payload.direction);
        break;
      case 'command':
        ctx.executeCommand(payload.command, payload.args);
        break;
      case 'message':
        ctx.emit(`message:${payload.name}`, payload.data);
        break;
    }
  };
}

function createContext(options: EngineWorkerOptions, init: InitPayload): EngineContext {
  options.setup?.();

  const renderer = new WebGLRenderer({ canvas: init.canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setSize(init.width, init.height, false);
  renderer.setPixelRatio(init.pixelRatio);
  renderer.info.autoReset = true;

  const scene = new Scene();
  const camera = new PerspectiveCamera(75, init.width / init.height, 0.1, 5000);

  const world = new ProceduralWorld({
    chunkSize: 16,
    chunkHeight: 32,
    renderDistance: 8,
    verticalRenderDistance: 6,
    ...options.world,
    camera,
    createChunkWorker: options.createChunkWorker
  });
  scene.add(world);

  const player = new Player({ camera, world, mode: 'debug' });
  const interaction = new PlayerInteraction(camera, world);
  if (options.hotbar) interaction.setHotbar(options.hotbar);

  const ctx = new EngineContext(
    renderer, scene, camera, world, player, interaction,
    options.spawnPoint ?? { x: 0, y: 40, z: 0 },
    new VoxelParticles(scene, world)
  );

  interaction.onBlockDestroyed = (pos, normal, blockType) => {
    const event: BlockInteractionEvent = {
      position: { x: pos.x, y: pos.y, z: pos.z },
      normal: { x: normal.x, y: normal.y, z: normal.z },
      blockType
    };
    ctx.emit('block:break', event);
    ctx.emitToMain('block:break', event);
  };
  interaction.onBlockPlaced = (pos, normal, blockType) => {
    const event: BlockInteractionEvent = {
      position: { x: pos.x, y: pos.y, z: pos.z },
      normal: { x: normal.x, y: normal.y, z: normal.z },
      blockType
    };
    ctx.emit('block:place', event);
    ctx.emitToMain('block:place', event);
  };
  interaction.onSelectionChange = (type) => {
    self.postMessage({ type: 'selection_change', payload: { type } });
  };

  registerCoreCommands(ctx);
  for (const plugin of options.plugins ?? []) {
    plugin.setup(ctx);
  }

  const targetTps = options.targetTps ?? 60;
  const loop = new GameLoop({
    targetTps,
    onFixedUpdate: (deltaMs, dtScale) => {
      if (!ctx.started) return;
      player.update(deltaMs);
      world.tick(deltaMs);
      ctx.particles.update(deltaMs);
      ctx.emit<FixedUpdateEvent>('fixedUpdate', { deltaMs, dtScale });
    },
    onRender: (alpha, frameDeltaMs) => {
      if (ctx.started) {
        player.render(alpha * (1000 / targetTps), frameDeltaMs);
        interaction.update();
        ctx.emit<RenderEvent>('render', { alpha, frameDeltaMs });
      }
      if (ctx.started) player.applyViewEffects();
      renderer.render(scene, camera);
      player.clearViewEffects();

      if (ctx.started) {
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
  loop.start();

  return ctx;
}
