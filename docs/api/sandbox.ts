/**
 * Os sandboxes das demos.
 *
 * Três níveis, do mais barato ao mais completo:
 *
 *  - `createViewer`   — uma cena Three.js com órbita, para malhar volumes à mão.
 *  - `createWorld`    — um `ProceduralWorld` DE VERDADE na main thread da página, com
 *                       chunk workers reais, luz, água, sombras e (opcional) o `Player`.
 *  - `createEngine`   — a engine inteira: `VoxelEngine` + engine worker + chunk workers,
 *                       com o canvas transferido por OffscreenCanvas, como num jogo.
 *
 * Nada aqui simula a engine: tudo o que aparece na tela saiu dos módulos de `engine/`.
 */
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

import ProceduralWorld, { type ProceduralWorldOptions } from '../../engine/world/ProceduralWorld';
import ChunkData from '../../engine/chunk/ChunkData';
import ChunkGeometry from '../../engine/chunk/ChunkGeometry';
import Sky from '../../engine/world/Sky';
import { blockRegistry } from '../../engine/blocks/BlockRegistry';
import { worldGeneratorRegistry } from '../../engine/world/WorldGeneratorRegistry';
import type { ChunkContext } from '../../engine/world/WorldGenerator';
import Player from '../../engine/player/Player';
import PlayerInteraction from '../../engine/player/PlayerInteraction';
import { GameLoop } from '../../engine/core/GameLoop';
import { VoxelParticles } from '../../engine/effects/VoxelParticles';
import { PostProcessor } from '../../engine/render/PostProcessor';
import { ShaderPipeline, type ShaderQuality } from '../../engine/render/ShaderPipeline';
import { VoxelEngine } from '../../engine/core/VoxelEngine';
import { dimensionRegistry } from '../../engine/dimension/DimensionRegistry';
import { DEFAULT_DIMENSION } from '../../engine/dimension/Dimension';
import { registerDocsContent, DOCS_BLOCKS } from './content';

export interface RunHandle {
  stops: Array<() => void>;
  cancelled: boolean;
}

/** O palco de uma demo: o canvas e o HUD que o sandbox escreve. */
export interface Stage {
  element: HTMLElement;
  canvas: HTMLCanvasElement;
  hud: HTMLElement;
  show(): void;
  /** Largura/altura em CSS px já aplicadas ao canvas. */
  resize(aspect?: number): { width: number; height: number };
}

// ─── Geometria de chunk → Mesh ──────────────────────────────────────────────
export type GeometryLike = {
  positions: Float32Array;
  normals: Float32Array;
  colors: Float32Array;
  uvs?: Float32Array;
  ao?: Float32Array;
  vertices: Uint32Array;
};

/** Converte a saída de `ChunkGeometry` num Mesh, com o AO aplicado na cor do vértice. */
export function voxelMesh(
  data: GeometryLike,
  options: { transparent?: boolean; opacity?: number; wireframe?: boolean } = {}
): THREE.Mesh {
  const geometry = new THREE.BufferGeometry();
  const colors = new Float32Array(data.colors);

  if (data.ao && data.ao.length === colors.length / 3) {
    for (let v = 0; v < data.ao.length; v++) {
      const shade = 0.45 + 0.55 * data.ao[v];
      colors[v * 3] *= shade;
      colors[v * 3 + 1] *= shade;
      colors[v * 3 + 2] *= shade;
    }
  }

  geometry.setAttribute('position', new THREE.BufferAttribute(data.positions, 3));
  geometry.setAttribute('normal', new THREE.BufferAttribute(data.normals, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  if (data.uvs) geometry.setAttribute('uv', new THREE.BufferAttribute(data.uvs, 2));
  geometry.setIndex(new THREE.BufferAttribute(data.vertices, 1));
  geometry.computeBoundingSphere();

  return new THREE.Mesh(
    geometry,
    new THREE.MeshLambertMaterial({
      vertexColors: true,
      transparent: options.transparent ?? false,
      opacity: options.opacity ?? 1,
      wireframe: options.wireframe ?? false,
      side: options.transparent ? THREE.DoubleSide : THREE.FrontSide
    })
  );
}

function disposeScene(scene: THREE.Object3D): void {
  scene.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    mesh.geometry?.dispose?.();
    const material = mesh.material as THREE.Material | THREE.Material[] | undefined;
    if (Array.isArray(material)) material.forEach((m) => m.dispose());
    else material?.dispose?.();
  });
}

// ─── Visualizador simples ───────────────────────────────────────────────────
export interface Viewer {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  renderer: THREE.WebGLRenderer;
  controls: OrbitControls;
  add(object: THREE.Object3D): void;
  remove(object: THREE.Object3D): void;
  onFrame(cb: (deltaMs: number) => void): void;
  hud(text: string): void;
  clear(): void;
}

export function createViewer(
  stage: Stage,
  handle: RunHandle,
  options: { target?: number[]; distance?: number; autoRotate?: boolean; background?: number } = {}
): Viewer {
  stage.show();
  const { width, height } = stage.resize();

  const renderer = new THREE.WebGLRenderer({ canvas: stage.canvas, antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setSize(width, height, false);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(options.background ?? 0x0b1220);

  const camera = new THREE.PerspectiveCamera(55, width / height, 0.1, 4000);
  const [tx, ty, tz] = options.target ?? [0, 0, 0];
  const distance = options.distance ?? 40;
  camera.position.set(tx + distance * 0.72, ty + distance * 0.5, tz + distance * 0.72);

  const controls = new OrbitControls(camera, stage.canvas);
  controls.target.set(tx, ty, tz);
  controls.enableDamping = true;
  controls.autoRotate = options.autoRotate ?? true;
  controls.autoRotateSpeed = 0.55;
  controls.update();

  scene.add(new THREE.HemisphereLight(0xcfe8ff, 0x1b222c, 1.2));
  const sun = new THREE.DirectionalLight(0xfff2d8, 1.45);
  sun.position.set(1, 1.5, 0.7);
  scene.add(sun);

  const user = new THREE.Group();
  scene.add(user);

  const frameCbs: Array<(deltaMs: number) => void> = [];
  let last = performance.now();
  let raf = 0;

  const tick = (now: number) => {
    if (handle.cancelled) return;
    const dt = Math.min(now - last, 100);
    last = now;
    for (const cb of frameCbs) cb(dt);
    controls.update();
    renderer.render(scene, camera);
    raf = requestAnimationFrame(tick);
  };
  raf = requestAnimationFrame(tick);

  handle.stops.push(() => {
    cancelAnimationFrame(raf);
    controls.dispose();
    disposeScene(scene);
    renderer.dispose();
  });

  return {
    scene,
    camera,
    renderer,
    controls,
    add: (object) => user.add(object),
    remove: (object) => user.remove(object),
    onFrame: (cb) => frameCbs.push(cb),
    hud: (text) => {
      stage.hud.textContent = text;
    },
    clear: () => {
      disposeScene(user);
      user.clear();
    }
  };
}

// ─── Volumes de voxel construídos pela própria engine ───────────────────────
let inlineId = 0;

/**
 * Registra um gerador anônimo e devolve o volume pronto.
 *
 * Todo "cubo" desta documentação nasce daqui: um `ChunkData` preenchido e passado
 * pelo `ChunkGeometry`. Caixa do Three.js seria mais curto de escrever e mentiria
 * sobre o que a engine faz — o trabalho dela é exatamente virar voxel em malha.
 */
export function voxelVolume(size: number, fill: (ctx: ChunkContext) => void, seed = 1): ChunkData {
  const id = `docs-inline-${++inlineId}`;
  worldGeneratorRegistry.register({ id, generate: fill });
  return new ChunkData({
    size,
    height: size,
    startX: 0, endX: size,
    startY: 0, endY: size,
    startZ: 0, endZ: size,
    worldParams: {
      seed,
      worldType: id,
      terrain: { scale: 40, magnitude: 8, offset: 6, octaves: 4, persistence: 0.5 }
    }
  });
}

/** Um objeto pequeno, malhado pelo greedy mesher da engine. Centrado na origem. */
export function voxelObject(
  size: number,
  fill: (ctx: ChunkContext) => void,
  options: { center?: boolean; transparent?: boolean; opacity?: number } = {}
): THREE.Mesh {
  const chunk = voxelVolume(size, fill);
  const geo = new ChunkGeometry(chunk.getData()).getData();
  const mesh = voxelMesh(geo.opaque, options);
  if (options.center !== false) mesh.geometry.translate(-size / 2, -size / 2, -size / 2);
  return mesh;
}

/**
 * Um chunk worker avulso, para falar o protocolo de job direto.
 * Encerrado quando o exemplo é parado ou reexecutado.
 */
export function createChunkWorkerHandle(handle: RunHandle): Worker {
  registerDocsContent();
  const worker = new Worker(new URL('./workers/chunk.worker.ts', import.meta.url), { type: 'module' });
  handle.stops.push(() => worker.terminate());
  return worker;
}

// ─── Cena de voxels: o volume da engine, sem streaming ──────────────────────
export interface VoxelSceneOptions {
  /** Lado do volume, em voxels (padrão 48). */
  size?: number;
  seed?: number;
  /** Gerador registrado a usar; ignorado quando `fill` é passado. */
  worldType?: string;
  fill?: (ctx: ChunkContext) => void;
  target?: [number, number, number];
  distance?: number;
  /** Monta a pilha de shaders da engine sobre esta cena. */
  shaders?: ShaderQuality | false;
  /** Usa o `Sky` da engine como iluminação e atmosfera (padrão true). */
  sky?: boolean;
  dimension?: string;
  targetTps?: number;
}

export interface VoxelSceneWorld {
  readonly chunkSize: number;
  getBlock(x: number, y: number, z: number): number;
  isBlockSolid(x: number, y: number, z: number): boolean;
  setBlockFast(x: number, y: number, z: number, type: number): boolean;
  flushDirtyChunks(): void;
}

export interface VoxelScene {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  renderer: THREE.WebGLRenderer;
  controls: OrbitControls;
  sky: Sky | null;
  postProcessor: PostProcessor;
  shaders: ShaderPipeline | null;
  chunk: ChunkData;
  /** Adaptador do volume: serve de `VoxelColliderWorld` e de `VoxelWorldReader`. */
  world: VoxelSceneWorld;
  /** Escreve no volume e agenda o remesh do quadro. */
  setBlock(x: number, y: number, z: number, type: number): void;
  /** Força o remesh agora (normalmente desnecessário: `setBlock` já agenda). */
  rebuild(): void;
  add(object: THREE.Object3D): void;
  remove(object: THREE.Object3D): void;
  onFrame(cb: (deltaMs: number) => void): void;
  onTick(cb: (deltaMs: number) => void): void;
  hud(text: string): void;
}

/**
 * Uma cena com um volume de voxels real — gerado por `ChunkData`, malhado por
 * `ChunkGeometry`, iluminado pelo `Sky` da engine — e nada mais.
 *
 * É o sandbox certo para o que só precisa de voxels em cena: colisão, raycast,
 * partículas, passes de tela. Subir `ProceduralWorld` com chunk workers nesses casos
 * demonstraria o streaming, não o módulo em questão.
 */
export function createVoxelScene(stage: Stage, handle: RunHandle, options: VoxelSceneOptions = {}): VoxelScene {
  registerDocsContent();
  stage.show();
  const { width, height } = stage.resize();

  const size = options.size ?? 48;
  const renderer = new THREE.WebGLRenderer({ canvas: stage.canvas, antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setSize(width, height, false);
  renderer.info.autoReset = true;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(60, width / height, 0.1, 6000);

  const chunk = options.fill
    ? voxelVolume(size, options.fill, options.seed ?? 1)
    : new ChunkData({
        size, height: size,
        startX: 0, endX: size,
        startY: 0, endY: size,
        startZ: 0, endZ: size,
        worldParams: {
          seed: options.seed ?? 7,
          worldType: options.worldType ?? 'docs-terreno',
          terrain: { scale: 46, magnitude: 8, offset: 6, octaves: 4, persistence: 0.5 }
        }
      });

  let opaco: THREE.Mesh | null = null;
  let agua: THREE.Mesh | null = null;
  let sujo = false;

  const rebuild = () => {
    const dados = new ChunkGeometry(chunk.getData()).getData();
    for (const antigo of [opaco, agua]) {
      if (!antigo) continue;
      scene.remove(antigo);
      antigo.geometry.dispose();
      (antigo.material as THREE.Material).dispose();
    }
    opaco = voxelMesh(dados.opaque);
    agua = voxelMesh(dados.water, { transparent: true, opacity: 0.6 });
    scene.add(opaco, agua);
    sujo = false;
  };
  rebuild();

  const alvo = options.target ?? [size / 2, size * 0.35, size / 2];
  const distancia = options.distance ?? size * 2;
  camera.position.set(alvo[0] + distancia * 0.5, alvo[1] + distancia * 0.4, alvo[2] + distancia * 0.5);

  const controls = new OrbitControls(camera, stage.canvas);
  controls.target.set(alvo[0], alvo[1], alvo[2]);
  controls.enableDamping = true;
  controls.autoRotate = true;
  controls.autoRotateSpeed = 0.5;
  controls.update();

  let sky: Sky | null = null;
  if (options.sky !== false) {
    sky = new Sky();
    sky.setDimension(dimensionRegistry.get(options.dimension ?? 'docs-overworld') ?? DEFAULT_DIMENSION);
    scene.add(sky);
  } else {
    scene.background = new THREE.Color(0x0b1220);
    scene.add(new THREE.HemisphereLight(0xcfe8ff, 0x1b222c, 1.2));
    const sol = new THREE.DirectionalLight(0xfff2d8, 1.4);
    sol.position.set(1, 1.5, 0.7);
    scene.add(sol);
  }

  const postProcessor = new PostProcessor(renderer);
  let shaders: ShaderPipeline | null = null;
  if (options.shaders && options.shaders !== 'off') {
    shaders = new ShaderPipeline(postProcessor, { worldScale: 1 });
    shaders.setQuality(options.shaders);
  } else {
    postProcessor.enabled = false;
  }

  const world: VoxelSceneWorld = {
    chunkSize: size,
    getBlock: (x, y, z) => chunk.getBlock(Math.floor(x), Math.floor(y), Math.floor(z)),
    isBlockSolid: (x, y, z) => blockRegistry.isSolid(chunk.getBlock(Math.floor(x), Math.floor(y), Math.floor(z))),
    setBlockFast: (x, y, z, type) => {
      const antes = chunk.getBlock(x, y, z);
      if (antes === type) return false;
      chunk.setBlock(x, y, z, type);
      sujo = true;
      return true;
    },
    flushDirtyChunks: () => {
      sujo = true;
    }
  };

  const tickCbs: Array<(deltaMs: number) => void> = [];
  const frameCbs: Array<(deltaMs: number) => void> = [];
  const sunDirection = new THREE.Vector3();
  const sunColor = new THREE.Color();
  const skyColor = new THREE.Color();

  const loop = new GameLoop({
    targetTps: options.targetTps ?? 20,
    onFixedUpdate: (deltaMs) => {
      if (handle.cancelled) return;
      for (const cb of tickCbs) cb(deltaMs);
    },
    onRender: (_alpha, frameDeltaMs) => {
      if (handle.cancelled) return;
      for (const cb of frameCbs) cb(frameDeltaMs);
      if (sujo) rebuild(); // um remesh por quadro, por mais escritas que tenham entrado
      sky?.tick(camera, frameDeltaMs);
      controls.update();

      if (postProcessor.enabled && shaders) {
        if (sky) {
          sunDirection.copy(sky.directional.position).normalize();
          sunColor.copy(sky.directional.color);
          skyColor.copy(sky.ambient.color);
        }
        shaders.update({
          camera,
          sunDirection,
          sunColor,
          skyColor,
          daylight: sky ? sky.daylight : 1,
          underwater: false,
          wetness: 0,
          deltaSeconds: frameDeltaMs / 1000
        });
        postProcessor.render(scene, camera);
      } else {
        renderer.render(scene, camera);
      }
    }
  });
  loop.start();

  handle.stops.push(() => {
    loop.stop();
    shaders?.dispose();
    postProcessor.dispose();
    controls.dispose();
    disposeScene(scene);
    renderer.dispose();
  });

  return {
    scene,
    camera,
    renderer,
    controls,
    sky,
    postProcessor,
    shaders,
    chunk,
    world,
    setBlock: (x, y, z, type) => {
      chunk.setBlock(x, y, z, type);
      sujo = true;
    },
    rebuild,
    add: (object) => scene.add(object),
    remove: (object) => scene.remove(object),
    onFrame: (cb) => frameCbs.push(cb),
    onTick: (cb) => tickCbs.push(cb),
    hud: (text) => {
      stage.hud.textContent = text;
    }
  };
}

// ─── Mundo real (main thread + chunk workers) ───────────────────────────────
export interface WorldSandboxOptions {
  world?: Partial<Omit<ProceduralWorldOptions, 'camera' | 'createChunkWorker'>>;
  /** 'orbit' (padrão) sobrevoa; 'player' entrega WASD + mouse com o Player real. */
  controls?: 'orbit' | 'player';
  spawn?: [number, number, number];
  lookAt?: [number, number, number];
  distance?: number;
  shadows?: boolean;
  /** Liga o ShaderPipeline (SSAO, volumétrica, bloom, tonemap, FXAA). */
  shaders?: ShaderQuality | false;
  hotbar?: number[];
  /** Passos de simulação por segundo (padrão 20, como o jogo). */
  targetTps?: number;
  /**
   * Gerador escrito na própria página — uma função de verdade, não uma string: `.toString()`
   * extrai o código-fonte, que é enviado para cada chunk worker e reconstituído lá (é a
   * thread que gera terreno, não esta — função não atravessa `postMessage`, texto sim).
   * `generate` tem a MESMA assinatura de `WorldGenerator.generate(ctx)`; `BLOCKS` e `GEN`
   * (a abstração de geração procedural) já existem como variáveis livres no escopo do worker.
   */
  generator?: { id: string; generate: (ctx: any) => void };
}

export interface WorldSandbox {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  renderer: THREE.WebGLRenderer;
  world: ProceduralWorld;
  particles: VoxelParticles;
  postProcessor: PostProcessor;
  shaders: ShaderPipeline;
  player: Player | null;
  interaction: PlayerInteraction | null;
  controls: OrbitControls | null;
  /** Chamado a cada tick fixo da simulação. */
  onTick(cb: (deltaMs: number) => void): void;
  /** Chamado a cada frame, antes do desenho. */
  onFrame(cb: (deltaMs: number) => void): void;
  /** Texto da faixa de status sob o canvas. */
  hud(text: string): void;
  add(object: THREE.Object3D): void;
  /** Resolve quando os primeiros chunks ao redor da câmera chegaram dos workers. */
  ready(): Promise<void>;
}

export function createWorld(stage: Stage, handle: RunHandle, options: WorldSandboxOptions = {}): WorldSandbox {
  registerDocsContent();
  stage.show();
  const { width, height } = stage.resize();

  const renderer = new THREE.WebGLRenderer({ canvas: stage.canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setSize(width, height, false);
  renderer.info.autoReset = true;

  const voxelsPerBlock = options.world?.voxelsPerBlock ?? 1;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(
    70,
    width / height,
    Math.min(0.05, 0.05 * voxelsPerBlock),
    4000 * voxelsPerBlock
  );

  // O sandbox cria os workers, então ele também os encerra: sem isto, cada reexecução
  // deixaria um pool inteiro de chunk workers vivo na aba.
  const spawnedWorkers: Worker[] = [];
  const createChunkWorker = () => {
    const worker = new Worker(new URL('./workers/chunk.worker.ts', import.meta.url), { type: 'module' });
    // O gerador do leitor precisa existir no worker ANTES do primeiro job.
    if (options.generator) {
      worker.postMessage({ type: 'docs:generator', id: options.generator.id, code: options.generator.generate.toString() });
    }
    spawnedWorkers.push(worker);
    return worker;
  };

  if (options.generator) {
    // Uma dimensão temporária amarra o gerador do leitor ao mundo desta demo.
    dimensionRegistry.register({
      ...DEFAULT_DIMENSION,
      id: `docs-live-${options.generator.id}`,
      name: options.generator.id,
      generatorId: options.generator.id
    });
  }

  const world = new ProceduralWorld({
    chunkSize: 32,
    chunkHeight: 32,
    renderDistance: 5,
    // 2 em vez dos 3 do jogo: uma demo de documentação não deve gastar o
    // orçamento dos workers carregando céu e subsolo que ninguém vai ver.
    verticalRenderDistance: 2,
    initialDimension: options.generator ? `docs-live-${options.generator.id}` : 'docs-overworld',
    workerCount: Math.max(2, Math.min(4, (navigator.hardwareConcurrency || 4) - 1)),
    ...options.world,
    camera,
    createChunkWorker
  });
  scene.add(world);
  world.attachRenderer(renderer);

  const particles = new VoxelParticles(scene, world);
  world.fluidCA.particles = particles;

  const postProcessor = new PostProcessor(renderer);
  const shaders = new ShaderPipeline(postProcessor, { worldScale: voxelsPerBlock });
  shaders.setQuality(options.shaders === false ? 'off' : (options.shaders ?? 'medium'));
  postProcessor.enabled = options.shaders !== false;

  world.setShadows(options.shadows ?? true, { resolution: 2048 });

  const spawn = options.spawn ?? [0, 42, 0];
  camera.position.set(spawn[0], spawn[1], spawn[2]);

  let player: Player | null = null;
  let interaction: PlayerInteraction | null = null;
  let controls: OrbitControls | null = null;

  if (options.controls === 'player') {
    player = new Player({ camera, world, mode: 'debug', voxelsPerBlock, scale: 1 });
    player.teleport(spawn[0], spawn[1], spawn[2]);
    interaction = new PlayerInteraction(camera, world);
    interaction.setHotbar(options.hotbar ?? [DOCS_BLOCKS.grass, DOCS_BLOCKS.stone, DOCS_BLOCKS.glass, DOCS_BLOCKS.glowstone, DOCS_BLOCKS.water]);
    attachPlayerInput(stage, handle, player, interaction);
  } else {
    const look = options.lookAt ?? [spawn[0], spawn[1] - 8, spawn[2]];
    const distance = options.distance ?? 70 * voxelsPerBlock;
    // A câmera é o centro do streaming: perto do relevo os primeiros chunks que
    // chegam já são os que aparecem, em vez de um bloco de céu vazio.
    camera.position.set(look[0] + distance * 0.45, look[1] + distance * 0.3, look[2] + distance * 0.45);
    controls = new OrbitControls(camera, stage.canvas);
    controls.minDistance = 8 * voxelsPerBlock;
    controls.maxDistance = distance * 2;
    controls.target.set(look[0], look[1], look[2]);
    controls.enableDamping = true;
    controls.autoRotate = true;
    controls.autoRotateSpeed = 0.35;
    controls.maxPolarAngle = Math.PI * 0.495;
    controls.update();
  }

  // Dispara o primeiro carregamento de chunks em volta da câmera.
  world.setRenderDistance(options.world?.renderDistance ?? 5);

  const tickCbs: Array<(deltaMs: number) => void> = [];
  const frameCbs: Array<(deltaMs: number) => void> = [];
  const sunDirection = new THREE.Vector3();
  const sunColor = new THREE.Color();
  const skyColor = new THREE.Color();
  const targetTps = options.targetTps ?? 20;

  const loop = new GameLoop({
    targetTps,
    onFixedUpdate: (deltaMs) => {
      if (handle.cancelled) return;
      player?.update(deltaMs);
      world.tick(deltaMs);
      particles.update(deltaMs);
      for (const cb of tickCbs) cb(deltaMs);
    },
    onRender: (alpha, frameDeltaMs) => {
      if (handle.cancelled) return;
      player?.render(alpha * (1000 / targetTps), frameDeltaMs);
      interaction?.update(frameDeltaMs);
      controls?.update();
      for (const cb of frameCbs) cb(frameDeltaMs);

      world.renderShadows(renderer, scene);
      player?.applyViewEffects();

      if (postProcessor.enabled) {
        shaders.update({
          camera,
          sunDirection: world.getShadowLightDirection(sunDirection),
          sunColor: world.getSunLightColor(sunColor),
          skyColor: world.getAtmosphereColor(skyColor),
          daylight: world.daylight,
          underwater: world.isUnderwater,
          wetness: world.wetness,
          deltaSeconds: frameDeltaMs / 1000
        });
        postProcessor.render(scene, camera);
      } else {
        renderer.render(scene, camera);
      }

      player?.clearViewEffects();
    }
  });
  loop.start();

  handle.stops.push(() => {
    loop.stop();
    world.disposeShadows();
    particles.dispose();
    shaders.dispose();
    postProcessor.dispose();
    scene.remove(world);
    disposeScene(scene);
    renderer.dispose();
    for (const worker of spawnedWorkers) worker.terminate();
  });

  return {
    scene,
    camera,
    renderer,
    world,
    particles,
    postProcessor,
    shaders,
    player,
    interaction,
    controls,
    onTick: (cb) => tickCbs.push(cb),
    onFrame: (cb) => frameCbs.push(cb),
    hud: (text) => {
      stage.hud.textContent = text;
    },
    add: (object) => scene.add(object),
    ready: () =>
      new Promise<void>((resolve) => {
        const alvo = Math.min(8, (options.world?.renderDistance ?? 5) * 2);
        const timer = window.setInterval(() => {
          if (handle.cancelled || world.getLoadedChunkCount() >= alvo) {
            window.clearInterval(timer);
            resolve();
          }
        }, 120);
        handle.stops.push(() => window.clearInterval(timer));
      })
  };
}

/** Teclado e mouse do modo 'player', escopados ao canvas (o editor continua digitável). */
function attachPlayerInput(stage: Stage, handle: RunHandle, player: Player, interaction: PlayerInteraction): void {
  const canvas = stage.canvas;
  let locked = false;

  const onKeyDown = (e: KeyboardEvent) => {
    if (!locked) return;
    e.preventDefault();
    player.onKeyDown(e.key);
    interaction.onKeyDown(e.key);
  };
  const onKeyUp = (e: KeyboardEvent) => {
    if (!locked) return;
    player.onKeyUp(e.key);
  };
  const onMouseMove = (e: MouseEvent) => {
    if (!locked) return;
    player.onMouseMove(e.movementX, e.movementY);
  };
  const onMouseDown = (e: MouseEvent) => {
    if (!locked) return;
    interaction.onMouseDown(e.button);
    if (e.button === 2) e.preventDefault();
  };
  const onMouseUp = (e: MouseEvent) => interaction.onMouseUp(e.button);
  const onContextMenu = (e: MouseEvent) => {
    if (locked) e.preventDefault();
  };
  const onClick = () => {
    if (!locked) void canvas.requestPointerLock();
  };
  const onLockChange = () => {
    locked = document.pointerLockElement === canvas;
    player.setLock(locked);
    interaction.setLock(locked);
    stage.element.classList.toggle('locked', locked);
  };

  document.addEventListener('keydown', onKeyDown);
  document.addEventListener('keyup', onKeyUp);
  document.addEventListener('mousemove', onMouseMove);
  document.addEventListener('mousedown', onMouseDown);
  document.addEventListener('mouseup', onMouseUp);
  document.addEventListener('contextmenu', onContextMenu);
  document.addEventListener('pointerlockchange', onLockChange);
  canvas.addEventListener('click', onClick);

  handle.stops.push(() => {
    document.removeEventListener('keydown', onKeyDown);
    document.removeEventListener('keyup', onKeyUp);
    document.removeEventListener('mousemove', onMouseMove);
    document.removeEventListener('mousedown', onMouseDown);
    document.removeEventListener('mouseup', onMouseUp);
    document.removeEventListener('contextmenu', onContextMenu);
    document.removeEventListener('pointerlockchange', onLockChange);
    canvas.removeEventListener('click', onClick);
    if (document.pointerLockElement === canvas) document.exitPointerLock();
  });
}

// ─── Engine completa (VoxelEngine + engine worker) ──────────────────────────
export interface EngineSandboxOptions {
  world?: Record<string, unknown>;
  spawnPoint?: { x: number; y: number; z: number };
  hotbar?: number[];
  targetTps?: number;
  playerScale?: number;
  /** Chama `engine.start(...)` assim que o worker sobe (padrão: true). */
  autoStart?: boolean;
}

export interface EngineSandbox {
  engine: VoxelEngine;
  /** Último `EngineStats` recebido do worker. */
  stats: () => Record<string, unknown> | null;
  /** Injeta código de plugin dentro do engine worker, com o EngineContext real. */
  plugin: (code: string) => void;
  hud: (text: string) => void;
  onStats(cb: (stats: Record<string, unknown>) => void): void;
  onLog(cb: (line: string) => void): void;
}

export function createEngine(stage: Stage, handle: RunHandle, options: EngineSandboxOptions = {}): EngineSandbox {
  stage.show();
  // A engine renderiza na proporção da janela (é o que ela manda no `init`), então o
  // palco adota a mesma proporção: sem isso o canvas apareceria esticado.
  stage.resize(window.innerWidth / window.innerHeight);

  const worker = new Worker(new URL('./workers/engine.worker.ts', import.meta.url), { type: 'module' });

  // O boot precisa chegar ANTES do `init` que o construtor do VoxelEngine envia.
  worker.postMessage({
    type: 'docs:boot',
    payload: {
      world: options.world,
      spawnPoint: options.spawnPoint,
      hotbar: options.hotbar,
      targetTps: options.targetTps,
      playerScale: options.playerScale
    }
  });

  const engine = new VoxelEngine({ canvas: stage.canvas, worker });

  // O teclado só vai para a engine quando o ponteiro está travado no canvas —
  // senão digitar no editor viraria comando de jogo.
  engine.setInputBlocked(true);
  engine.on('lock_change', ({ isLocked }: { isLocked: boolean }) => {
    engine.setInputBlocked(!isLocked);
    stage.element.classList.toggle('locked', isLocked);
  });

  let lastStats: Record<string, unknown> | null = null;
  const statsCbs: Array<(s: Record<string, unknown>) => void> = [];
  const logCbs: Array<(line: string) => void> = [];

  engine.on('stats', (s: Record<string, unknown>) => {
    lastStats = s;
    for (const cb of statsCbs) cb(s);
  });
  engine.on('docs:log', (line: string) => {
    for (const cb of logCbs) cb(line);
  });
  engine.on('docs:error', (line: string) => {
    for (const cb of logCbs) cb(`erro no worker: ${line}`);
  });
  engine.on('fatal_error', (payload: unknown) => {
    for (const cb of logCbs) cb(`fatal no worker: ${JSON.stringify(payload)}`);
  });

  if (options.autoStart !== false) {
    engine.start({ flight: true, shaders: true });
  }

  // `destroy` já solta o ponteiro, remove os listeners e encerra o worker da engine
  // (que, por sua vez, encerra o pool de chunk workers que ele abriu).
  handle.stops.push(() => engine.destroy());

  return {
    engine,
    stats: () => lastStats,
    plugin: (code: string) => engine.send('docs:plugin', { code }),
    hud: (text: string) => {
      stage.hud.textContent = text;
    },
    onStats: (cb) => statsCbs.push(cb),
    onLog: (cb) => logCbs.push(cb)
  };
}

export { DOCS_BLOCKS };
