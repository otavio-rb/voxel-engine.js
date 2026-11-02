import { Color, PerspectiveCamera, Scene, Vector3, WebGLRenderer } from 'three';
import ProceduralWorld, { type ProceduralWorldOptions } from '../world/ProceduralWorld';
import Player, { type PlayerMode, type PlayerOptions } from '../player/Player';
import PlayerInteraction from '../player/PlayerInteraction';
import { GameLoop } from '../core/GameLoop';
import { VoxelParticles } from '../effects/VoxelParticles';
import { EventEmitter } from '../core/EventEmitter';
import { BlockPosition } from '../types';
import { CommandRegistry } from './CommandRegistry';
import { registerCoreCommands } from './coreCommands';
import { PostProcessor } from '../render/PostProcessor';
import { CinematicPass } from '../render/CinematicPass';
import { ShaderPipeline, type ShaderQuality } from '../render/ShaderPipeline';
import { FrameProfiler } from '../core/FrameProfiler';

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
  /**
   * Configuracao do mundo. Aceita tudo que ProceduralWorld aceita, menos o que o runtime
   * fornece (camera e a fabrica de chunk workers), para que opcoes novas da engine cheguem
   * ao jogo sem precisar de mais uma lista de campos aqui.
   */
  world?: Partial<Omit<ProceduralWorldOptions, 'camera' | 'createChunkWorker'>>;
  /** Block IDs bound to the number keys / mouse wheel. */
  hotbar?: number[];
  spawnPoint?: BlockPosition;
  targetTps?: number;
  /** Escala relativa do jogador (1.0 = normal, 0.35 = miniatura para micro-voxels). */
  playerScale?: number;
  /** Initial player movement mode. Defaults to `'debug'` (flying, no collisions). */
  initialPlayerMode?: PlayerMode;
  /**
   * Optional player physics, dimensions, stepHeight and speed overrides. Pass `false` to run
   * with no player at all — no body, no hotbar, no first-person input wiring — for
   * applications that only need a world and a camera (e.g. a voxel viewer or editor driven
   * by its own camera rig, such as `createOrbitCameraRig`). Defaults to a `Player` being
   * created, which is still the quickest way to get a working first-person rig.
   */
  player?: Partial<Omit<PlayerOptions, 'camera' | 'world'>> | false;
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
 * `render` (RenderEvent), `predraw` / `postdraw` (right before and after the frame is drawn,
 * with view effects applied: camera changes made in `predraw` must be undone in `postdraw`),
 * `shaders` (boolean, after `/shaders on|off`), `keydown` / `keyup` (key string), `block:break` / `block:place`
 * (BlockInteractionEvent).
 */
export class EngineContext extends EventEmitter {
  /** False until `/start`; the simulation and interaction are paused while false. */
  public started = false;
  public readonly commands = new CommandRegistry();
  /** Full-screen shader passes applied to every frame; see `ScreenPass`. */
  public readonly postProcessor: PostProcessor;
  /**
   * Pilha de post-processing da engine: oclusao de ambiente, luz volumetrica, bloom,
   * tonemapping/grading e FXAA, com presets em `setQuality`.
   */
  public readonly shaders: ShaderPipeline;
  /** Tonemapping e color grading. Atalho para `shaders.cinematic`. */
  public readonly cinematicPass: CinematicPass;
  /** Graphics shaders on/off (`/shaders`). Effects should fall back to simple materials when off. */
  public shadersEnabled = true;
  /** Voxels por bloco deste mundo. Multiplique por ele qualquer valor escrito em blocos. */
  public get voxelsPerBlock(): number {
    return this.world.voxelsPerBlock;
  }

  constructor(
    public readonly renderer: WebGLRenderer,
    public readonly scene: Scene,
    public readonly camera: PerspectiveCamera,
    public readonly world: ProceduralWorld,
    /** Null when `EngineWorkerOptions.player` is `false` — see that option's doc comment. */
    public readonly player: Player | null,
    public readonly interaction: PlayerInteraction | null,
    public readonly spawnPoint: BlockPosition,
    /** Shared particle pool, simulated by the engine; plugins decide what to emit. */
    public readonly particles: VoxelParticles
  ) {
    super();
    this.postProcessor = new PostProcessor(renderer);
    this.shaders = new ShaderPipeline(this.postProcessor, {
      worldScale: this.world.voxelsPerBlock
    });
    this.cinematicPass = this.shaders.cinematic;
    // O ShaderPipeline nasce em `high`; alinha o mundo ao mesmo preset.
    this.world.setShadows(true, { resolution: 2048 });
    if (this.world.fluidCA) {
      this.world.fluidCA.particles = this.particles;
    }
  }

  /** Sends an event to the main thread, where `VoxelEngine` re-emits it under the same name. */
  public emitToMain<T = unknown>(event: string, payload?: T): void {
    self.postMessage({ type: 'event', event, payload });
  }

  /** Handles messages sent from the main thread with `VoxelEngine.send(name, payload)`. */
  public onMessage<T = unknown>(name: string, handler: (payload: T) => void): () => void {
    return this.on<T>(`message:${name}`, handler);
  }

  /** Switches world shaders and post-processing, then notifies plugins through `shaders`. */
  public setShadersEnabled(enabled: boolean): void {
    this.shadersEnabled = enabled;
    this.world.toggleShaders(enabled);
    this.world.setShadows(enabled && this.shaders.quality !== 'off' && this.shaders.quality !== 'low'
      && this.shaders.quality !== 'medium');
    this.shaders.setEnabled(enabled);
    this.emit('shaders', enabled);
  }

  /**
   * Preset de custo do post-processing: `off`, `low`, `medium`, `high` ou `ultra`.
   * As sombras direcionais acompanham o preset, porque elas custam um desenho inteiro do
   * terreno a mais por quadro — e a unica parte da pilha que nao e so trabalho de pixel.
   */
  public setShaderQuality(quality: ShaderQuality): void {
    this.shaders.setQuality(quality);
    const shadowRes = quality === 'ultra' ? 3072 : 2048;
    this.world.setShadows(quality === 'high' || quality === 'ultra', { resolution: shadowRes });
    this.emit('shaders:quality', quality);
  }

  public executeCommand(command: string, args: string[] = []): boolean {
    return this.commands.execute(command, args, this);
  }

  /**
   * Quantos ticks ainda tentar encaixar o jogador no chao depois de nascer.
   * Zero = encaixe concluido (ou desistido). Ver `settleSpawn`.
   */
  private spawnSettleTicks = 0;

  public teleportToSpawn(): void {
    if (!this.player) return;
    const dim = this.world.activeDimension;
    const sp = dim?.spawnPoint ?? this.spawnPoint;
    const yaw = (sp as any)?.yaw;
    const pitch = (sp as any)?.pitch;
    this.player.teleport(sp.x, sp.y, sp.z, yaw, pitch);
    // ~8 segundos a 20 tps: tempo de o terreno em volta chegar dos workers.
    this.spawnSettleTicks = 160;
  }

  /**
   * Poe o jogador em terra seca, uma vez que o terreno em volta tenha carregado.
   *
   * O spawn era um ponto fixo `(0, altura, 0)`, e isso so funcionava quando o gerador
   * garantia terra na origem. Num mundo com oceano de verdade -- 25% das colunas abaixo do
   * nivel do mar -- nascer na origem e cair no mar com frequencia, e a primeira impressao
   * do jogo vira boiar. Pior: nao da para saber de antemao, porque a altura do terreno so
   * existe depois que o chunk chega do worker.
   *
   * Entao o encaixe e adiado: a cada tick, enquanto houver orcamento, procura-se a coluna
   * seca mais proxima do ponto de spawn numa espiral quadrada. Na primeira que responder,
   * o jogador e posto um pouco acima dela e o encaixe termina.
   */
  public settleSpawn(): void {
    if (this.spawnSettleTicks <= 0 || !this.player) return;
    this.spawnSettleTicks--;

    const scale = this.player.voxelsPerBlock;
    // O teto da busca acompanha a faixa VERTICAL carregada em volta do jogador, nao um
    // offset arbitrario acima do spawn: comecar acima do que esta carregado fazia toda
    // coluna responder "ainda nao sei" e o encaixe nunca acontecia.
    const topY = Math.round(this.player.body.position.y + 8 * scale);
    const bottomY = Math.round(this.player.body.position.y - 80 * scale);
    const step = Math.max(1, Math.round(3 * scale));

    for (let ring = 0; ring <= 10; ring++) {
      for (let dx = -ring; dx <= ring; dx++) {
        for (let dz = -ring; dz <= ring; dz++) {
          // So a casca do anel: o interior ja foi visto nos aneis anteriores.
          if (ring > 0 && Math.abs(dx) !== ring && Math.abs(dz) !== ring) continue;
          const dim = this.world.activeDimension;
          const sp = dim?.spawnPoint ?? this.spawnPoint;
          const bx = Math.round(sp.x) + dx * step;
          const bz = Math.round(sp.z) + dz * step;
          const y = this.world.drySurfaceAt(bx, bz, topY, bottomY);
          if (y === null) continue;
          const yaw = (sp as any)?.yaw;
          const pitch = (sp as any)?.pitch;
          this.player.teleport(bx + 0.5, y + 1 + this.player.body.eyeHeight, bz + 0.5, yaw, pitch);
          this.spawnSettleTicks = 0;
          return;
        }
      }
    }
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

  self.onerror = (message, source, lineno, colno, error) => {
    console.error('[EngineWorker:UNCAUGHT]', message, 'at', source, lineno, colno, error);
  };

  self.onmessage = (e: MessageEvent) => {
    const { type, payload } = e.data;

    if (type === 'init') {
      try {
        ctx = createContext(options, payload as InitPayload);
      } catch (err: any) {
        console.error('[EngineWorker:INIT_FAIL]', err?.message || err, err?.stack || err);
        self.postMessage({ type: 'fatal_error', payload: String(err?.stack || err) });
      }
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
        player?.onKeyDown(payload.key);
        interaction?.onKeyDown(payload.key);
        ctx.emit('keydown', payload.key);
        break;
      case 'keyup':
        player?.onKeyUp(payload.key);
        ctx.emit('keyup', payload.key);
        break;
      case 'mousemove':
        player?.onMouseMove(payload.movementX, payload.movementY);
        break;
      case 'mousedown':
        interaction?.onMouseDown(payload.button);
        break;
      case 'mouseup':
        interaction?.onMouseUp(payload.button);
        break;
      case 'lock_state':
        player?.setLock(payload.isLocked);
        interaction?.setLock(payload.isLocked);
        break;
      case 'select_block':
        interaction?.setSelectedBlockType(payload.type);
        break;
      case 'select_slot':
        interaction?.selectSlot(payload.index);
        break;
      case 'set_hotbar':
        if (payload?.types && Array.isArray(payload.types)) {
          interaction?.setHotbar(payload.types);
        }
        break;
      case 'wheel':
        interaction?.onWheel(payload.direction);
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

  function detectGpuVram(gpuName: string, gl: WebGLRenderingContext | WebGL2RenderingContext): string {
    try {
      const ext = gl.getExtension('NVX_gpu_memory_info');
      if (ext) {
        const memKb = gl.getParameter(0x9048);
        if (memKb && memKb > 0) {
          const gb = Math.round((memKb / 1048576) * 10) / 10;
          return `${gb} GB`;
        }
      }
    } catch {}

    const nameUpper = gpuName.toUpperCase();
    if (nameUpper.includes('9060 XT') || nameUpper.includes('9060XT')) return '16 GB';
    if (nameUpper.includes('7900 XTX')) return '24 GB';
    if (nameUpper.includes('7900 XT')) return '20 GB';
    if (nameUpper.includes('7900 GRE') || nameUpper.includes('7800 XT') || nameUpper.includes('6950 XT') || nameUpper.includes('6900 XT') || nameUpper.includes('6800 XT') || nameUpper.includes('6800')) return '16 GB';
    if (nameUpper.includes('7700 XT') || nameUpper.includes('6750 XT') || nameUpper.includes('6700 XT')) return '12 GB';
    if (nameUpper.includes('7600 XT')) return '16 GB';
    if (nameUpper.includes('7600') || nameUpper.includes('6650 XT') || nameUpper.includes('6600 XT') || nameUpper.includes('6600') || nameUpper.includes('5700 XT') || nameUpper.includes('5700')) return '8 GB';
    if (nameUpper.includes('4090') || nameUpper.includes('3090')) return '24 GB';
    if (nameUpper.includes('4080')) return '16 GB';
    if (nameUpper.includes('4070') || nameUpper.includes('3080 TI')) return '12 GB';
    if (nameUpper.includes('3080')) return '10 GB';
    if (nameUpper.includes('4060') || nameUpper.includes('3070') || nameUpper.includes('2080') || nameUpper.includes('2070')) return '8 GB';
    if (nameUpper.includes('3060')) return '12 GB';
    if (nameUpper.includes('2060')) return '6 GB';

    if (nameUpper.includes('APPLE') || nameUpper.includes('M1') || nameUpper.includes('M2') || nameUpper.includes('M3') || nameUpper.includes('M4')) {
      const devMem = typeof navigator !== 'undefined' ? (navigator as any).deviceMemory : 16;
      return `${devMem || 16} GB`;
    }

    const explicitMatch = gpuName.match(/(\d+)\s*(?:GB|GIB)/i);
    if (explicitMatch && explicitMatch[1]) {
      return `${explicitMatch[1]} GB`;
    }
    return '';
  }

  let gpuRenderer = 'WebGL Graphics';
  let gpuTotalVram = '';
  try {
    const gl = renderer.getContext();
    const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
    if (debugInfo) {
      const raw = gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL);
      if (raw) {
        const match = raw.match(/ANGLE\s*\([^,]+,\s*([^,]+?)(?:\s+Direct3D|\s+vs_|\s+ps_|\s*\))/i);
        gpuRenderer = match && match[1] ? match[1].trim() : raw.replace(/Direct3D.*$/i, '').trim();
      }
    }
    gpuTotalVram = detectGpuVram(gpuRenderer, gl);
  } catch {}
  const cpuCores = typeof navigator !== 'undefined' ? (navigator.hardwareConcurrency || 4) : 4;
  let rollingFps = 60;
  let lastProfileFps = 60;
  let lastWorstFrameMs = 16.6;

  const scene = new Scene();

  // A cena e medida em voxels. Com minivoxels os mesmos planos de corte, em blocos,
  // viram distancias maiores em unidades, e near escala junto para preservar a
  // precisao do depth buffer (a razao far/near fica igual a do voxel classico).
  const voxelsPerBlock = options.world?.voxelsPerBlock ?? 1;
  const playerScale = options.playerScale ?? 1;
  const camera = new PerspectiveCamera(
    75,
    init.width / init.height,
    Math.min(0.05, 0.05 * voxelsPerBlock * playerScale),
    5000 * voxelsPerBlock
  );
  // Fixado aqui (não só dentro de Player/HeadlessControls) para que yaw/pitch continuem
  // lendo certo em `camera.rotation` mesmo sem jogador nenhum — ver o bloco de stats abaixo.
  camera.rotation.order = 'YXZ';

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
  // O brickmap global so pode alocar as suas texturas 3D depois que existe contexto WebGL.
  // No caminho de malha isto e inofensivo (o mundo nao tem brickmap para ligar).
  world.attachRenderer(renderer);

  const player = options.player === false
    ? null
    : new Player({
        camera,
        world,
        mode: options.initialPlayerMode ?? 'debug',
        voxelsPerBlock,
        scale: playerScale,
        ...(options.player ?? {})
      });
  const interaction = options.player === false ? null : new PlayerInteraction(camera, world);
  if (options.hotbar && interaction) interaction.setHotbar(options.hotbar);

  const ctx = new EngineContext(
    renderer, scene, camera, world, player, interaction,
    options.spawnPoint ?? { x: 0, y: 40, z: 0 },
    new VoxelParticles(scene, world)
  );

  ctx.onMessage<{ scale: number }>('player:set_scale', (data) => {
    if (typeof data?.scale === 'number') {
      player?.setScale(data.scale);
    }
  });

  if (interaction) {
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
    interaction.onSelectionChange = (type, slot) => {
      self.postMessage({ type: 'selection_change', payload: { type, slot } });
    };
  }

  registerCoreCommands(ctx);
  for (const plugin of options.plugins ?? []) {
    plugin.setup(ctx);
  }

  /**
   * Mede a thread que REALMENTE renderiza.
   *
   * O indicador de FPS do jogo rodava na main thread, que so repassa input: o canvas vive aqui
   * como OffscreenCanvas. Por isso "trava mas o FPS esta bom" — o numero vinha de uma thread
   * ociosa. O resumo e enviado uma vez por segundo, nao por quadro.
   */
  const profiler = new FrameProfiler();
  world.profiler = profiler;

  // Reutilizados a cada quadro: o estado do ceu vai para os passes de tela sem alocar.
  const sunDirection = new Vector3();
  const sunColor = new Color();
  const skyColor = new Color();

  const targetTps = options.targetTps ?? 60;
  const loop = new GameLoop({
    targetTps,
    onFixedUpdate: (deltaMs, dtScale) => {
      if (!ctx.started) return;
      if (player) profiler.measure('jogador', () => player.update(deltaMs));
      profiler.measure('mundo:tick', () => world.tick(deltaMs));
      ctx.settleSpawn();
      profiler.measure('particulas', () => ctx.particles.update(deltaMs));
      profiler.measure('plugins:fixed', () => ctx.emit<FixedUpdateEvent>('fixedUpdate', { deltaMs, dtScale }));
    },
    onRender: (alpha, frameDeltaMs) => {
      if (ctx.started) {
        player?.render(alpha * (1000 / targetTps), frameDeltaMs);
        interaction?.update(frameDeltaMs);
        ctx.emit<RenderEvent>('render', { alpha, frameDeltaMs });
      }
      // O shadow map e desenhado antes da cena (o terreno amostra a matriz deste quadro) e
      // antes do applyViewEffects: o balanco de passo mexe a camera em Y, e o mapa seguia
      // esse balanco, fazendo a sombra subir e descer a cada passo. Cosmetica de camera
      // nao deve entrar na conta de onde a luz incide.
      profiler.measure('sombras', () => world.renderShadows(renderer, scene));

      if (ctx.started) {
        player?.applyViewEffects();
        ctx.emit('predraw');
      }
      if (ctx.postProcessor.enabled) {
        ctx.shaders.update({
          camera,
          sunDirection: world.getShadowLightDirection(sunDirection),
          sunColor: world.getSunLightColor(sunColor),
          skyColor: world.getAtmosphereColor(skyColor),
          daylight: world.daylight,
          underwater: world.isUnderwater,
          wetness: world.wetness,
          deltaSeconds: frameDeltaMs / 1000
        });
      }
      let drawDuration = 0;
      profiler.measure('desenho', () => {
        const drawStart = performance.now();
        ctx.postProcessor.render(scene, camera);
        drawDuration = performance.now() - drawStart;
      });
      if (ctx.started) ctx.emit('postdraw');
      player?.clearViewEffects();

      const snapshot = profiler.frame(frameDeltaMs);
      if (snapshot) {
        lastProfileFps = snapshot.fps;
        lastWorstFrameMs = snapshot.worstFrameMs;
        self.postMessage({ type: 'event', event: 'engine:profile', payload: snapshot });
      }

      rollingFps = rollingFps > 0
        ? rollingFps * 0.95 + (1000 / Math.max(1, frameDeltaMs)) * 0.05
        : (1000 / Math.max(1, frameDeltaMs));

      if (ctx.started) {
        try {
          // Lido direto da câmera (não de `player.controls`) para funcionar igual com ou
          // sem jogador — `camera.rotation.order` é 'YXZ' sempre, fixado acima.
          const yaw = camera.rotation.y;
        const pitch = camera.rotation.x;
        const deg = ((yaw * 180 / Math.PI) % 360 + 360) % 360;
        let facing = 'Norte (-Z)';
        if (deg >= 45 && deg < 135) facing = 'Oeste (-X)';
        else if (deg >= 135 && deg < 225) facing = 'Sul (+Z)';
        else if (deg >= 225 && deg < 315) facing = 'Leste (+X)';

        const cs = world.chunkSize || 16;
        const chunkX = Math.floor(camera.position.x / cs);
        const chunkY = Math.floor(camera.position.y / cs);
        const chunkZ = Math.floor(camera.position.z / cs);

        const worldGpuBytes = world.getEstimatedGpuMemoryBytes();
        const canvasBufferBytes = init.width * init.height * 8 * 2;
        const postProcessorBytes = ctx.postProcessor.enabled ? (init.width * init.height * 8 * 2) : 0;
        const textureCount = renderer.info.memory.textures;
        const textureBytes = Math.max(textureCount * 4 * 1024 * 1024, 24 * 1024 * 1024);
        const totalGpuBytes = worldGpuBytes + canvasBufferBytes + postProcessorBytes + textureBytes;
        const gpuMemoryMB = Math.round((totalGpuBytes / (1024 * 1024)) * 10) / 10;
        const voxelRamMB = Math.round((world.getVoxelRamBytes() / (1024 * 1024)) * 10) / 10;

        let workerMemory: { usedMB: number; totalMB: number; limitMB: number } | undefined;
        const wMem = (self.performance as any)?.memory;
        if (wMem) {
          workerMemory = {
            usedMB: Math.round((wMem.usedJSHeapSize / 1048576) * 10) / 10,
            totalMB: Math.round((wMem.totalJSHeapSize / 1048576) * 10) / 10,
            limitMB: Math.round(wMem.jsHeapSizeLimit / 1048576)
          };
        }

        self.postMessage({
          type: 'stats',
          stats: {
            x: camera.position.x,
            y: camera.position.y,
            z: camera.position.z,
            chunkX,
            chunkY,
            chunkZ,
            yaw,
            pitch,
            facing,
            geometries: renderer.info.memory.geometries,
            textures: renderer.info.memory.textures,
            frame: renderer.info.render.frame,
            calls: renderer.info.render.calls,
            triangles: renderer.info.render.triangles,
            isUnderwater: world.isUnderwater,
            fps: Math.round(lastProfileFps || rollingFps),
            frameTimeMs: Math.round(frameDeltaMs * 10) / 10,
            renderTimeMs: Math.round(drawDuration * 10) / 10,
            worstFrameMs: lastWorstFrameMs || Math.round(frameDeltaMs * 10) / 10,
            cores: cpuCores,
            gpuRenderer,
            gpuTotalVram,
            gpuMemoryMB,
            voxelRamMB,
            workerMemory,
            workers: world.getWorkerStats(),
            loadedChunks: world.getLoadedChunkCount(),
            dimension: world.getActiveDimensionName()
          }
        });
        } catch (err) {
          console.error('[EngineRuntime] Error emitting stats:', err);
        }
      }
    }
  });
  loop.start();

  return ctx;
}
