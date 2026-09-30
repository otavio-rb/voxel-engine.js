import { 
  Group, 
  Vector3, 
  Mesh, 
  BufferGeometry, 
  BufferAttribute, 
  ShaderMaterial,
  MeshBasicMaterial,
  LineBasicMaterial,
  LineSegments,
  EdgesGeometry,
  BoxGeometry,
  PerspectiveCamera, 
  WebGLRenderer,
  Scene,
  Color
} from 'three';
import WorkerPool from './WorkerPool';
import Sky from './Sky';
import WaterSimulator, { WorldWaterAccess } from '../physics/WaterSimulator';
import { blockRegistry } from '../blocks/BlockRegistry';
import { 
  WorldParams, 
  ChunkDataResult, 
  WorkerResponse, 
  GeometryData, 
  WorldConfig, 
  ChunkBorders 
} from '../types';
import { EventEmitter } from '../core/EventEmitter';
import { EntityManager } from '../entities/EntityManager';
import { DimensionDefinition, DEFAULT_DIMENSION } from '../dimension/Dimension';
import { dimensionRegistry } from '../dimension/DimensionRegistry';
import { LightChunk, LightEngine } from './LightEngine';

export interface ProceduralWorldOptions extends WorldConfig {
  camera: PerspectiveCamera;
  /** Spawns a chunk generation worker (usually the game's own chunk worker entry). */
  createChunkWorker: () => Worker;
  /** ID of a registered dimension to start in. Defaults to the first registered one. */
  initialDimension?: string;
  workerCount?: number;
  /**
   * A chunk with nothing loaded above is lit as open sky only if it sits at or above this Y
   * (deeper chunks stay dark until real light reaches them). Default 0.
   */
  openSkyMinY?: number;
}

/** Payload of the `chunk:ready` event, fired the first time a chunk gets a mesh. */
export interface ChunkReadyEvent {
  key: string;
  data: ChunkDataResult;
  chunkSize: number;
}

interface LoadedChunk extends LightChunk {
  key: string;
  /** Block data kept in memory so destroyed blocks can be applied and the mesh rebuilt. */
  data: ChunkDataResult;
  /** Pre-computed border slices for O(1) neighbour-border lookup. */
  borders: ChunkBorders;
  /** Individual Three.js meshes for this chunk. */
  opaqueMesh: Mesh | null;
  waterMesh: Mesh | null;
  hasAnimated?: boolean;
  animationStartTime?: number;
  readyNotified?: boolean;
}

export default class ProceduralWorld extends Group {
  private readonly chunkSize: number;
  private chunkHeight: number;
  private renderDistance: number;
  private verticalRenderDistance: number;
  private readonly camera: PerspectiveCamera;
  private readonly pool: WorkerPool;
  private readonly rebuildPool: WorkerPool;

  // ─── Chunk state ──────────────────────────────────────────────────────────
  private readonly loadedChunks      = new Map<string, LoadedChunk>();
  private readonly pendingChunks     = new Set<string>();

  // ─── Queues ───────────────────────────────────────────────────────────────
  private readonly meshQueue: WorkerResponse[] = [];
  private readonly rebuildMeshQueue: WorkerResponse[] = [];
  private readonly rebuildQueue: string[] = [];
  private readonly rebuildSet           = new Set<string>();
  private readonly pendingRebuildChunks = new Set<string>();
  /** Chunks that changed while their mesh job was in flight; rebuilt again when it returns. */
  private readonly staleRebuildChunks = new Set<string>();

  // ─── Voxel lighting ───────────────────────────────────────────────────────
  private readonly light: LightEngine;
  private readonly openSkyMinY: number;

  private readonly opaqueMaterial: ShaderMaterial;
  private readonly waterMaterial: ShaderMaterial;
  private wireframeEnabled = false;
  private readonly sky: Sky;

  // ─── Water Simulation (Scalar Field) ──────────────────────────────────────
  private readonly activeWaterChunks = new Set<string>();
  private waterTickTimer = 0;

  // Hot Cache for collision optimization
  private lastChunk: LoadedChunk | null = null;
  private lastChunkKey: string | null   = null;

  private lastPlayerChunkX = Infinity;
  private lastPlayerChunkY = Infinity;
  private lastPlayerChunkZ = Infinity;
  private lastUpdatePos    = new Vector3();
  private elapsedTime      = 0;
  public isUnderwater     = false;
  private isTimePaused    = false;
  private isDebugMode     = true;  // player starts in debug, no occlusion culling
  private occlusionTick   = 0;
  private occlusionDirty  = false; // set to true whenever mode or chunks change
  private readonly blockOutline:    Mesh;
  private readonly blockOutlineMat: MeshBasicMaterial;
  private readonly blockEdge:       LineSegments;   // black border edge lines
  private readonly blockEdgeMat:    LineBasicMaterial;
  private readonly entityManager: EntityManager;
  public activeDimension: DimensionDefinition;

  /** World lifecycle hooks, e.g. `chunk:ready` (payload: ChunkReadyEvent). */
  public readonly events = new EventEmitter();

  readonly params: WorldParams = {
    seed: Math.floor(Math.random() * 100_000),
    worldType: DEFAULT_DIMENSION.generatorId,
    terrain: {
      scale:       64,
      magnitude:   0.7,
      offset:      0.4,
      octaves:     4,
      persistence: 0.5,
    },
  };

  constructor(config: ProceduralWorldOptions) {
    super();

    this.chunkSize      = config.chunkSize;
    this.chunkHeight    = config.chunkHeight; // Kept for backwards compatibility but not used for mesh height
    this.renderDistance = config.renderDistance;
    this.verticalRenderDistance = config.verticalRenderDistance;
    this.camera         = config.camera;

    this.activeDimension =
      (config.initialDimension ? dimensionRegistry.get(config.initialDimension) : undefined) ??
      dimensionRegistry.getAll()[0] ??
      DEFAULT_DIMENSION;
    this.params.worldType = this.activeDimension.generatorId;

    const cores = navigator.hardwareConcurrency || 4;
    const workerCount = config.workerCount ?? Math.max(2, cores - 1);
    this.pool = new WorkerPool(workerCount, config.createChunkWorker);
    // Reuse the same pool for rebuilds to allow 100% core utilization for the intensive meshing step
    this.rebuildPool = this.pool;
    
    this.entityManager = new EntityManager(this);
    this.light = new LightEngine(this.chunkSize);
    this.openSkyMinY = config.openSkyMinY ?? 0;

    this.opaqueMaterial = new ShaderMaterial({
      uniforms: {
        uTime:           { value: 0 },
        uSkyColor:       { value: new Color(0x87CEEB) },
        uSunDirection:   { value: new Vector3(1, 1, 1).normalize() },
        uShadersEnabled: { value: 1.0 },
        uFogNear:        { value: 128.0 },
        uFogFar:         { value: 256.0 },
        uDaylight:       { value: 1.0 },
        uMinLight:       { value: 0.03 },
        uBlockLightColor: { value: new Color(1.0, 0.85, 0.65) },
      },
      vertexShader: `
        attribute float creationTime;
        attribute float ao;
        attribute vec2 light;
        varying vec3 vNormal;
        varying vec3 vColor;
        varying vec2 vUv;
        varying vec3 vWorldPos;
        varying float vCreationTime;
        varying float vAo;
        varying vec2 vLight;
        uniform float uTime;
        void main() {
          vNormal = normal;
          vColor = color;
          vUv = uv;
          vCreationTime = creationTime;
          vAo = ao;
          vLight = light;

          vec3 pos = position;

          // Per-chunk rise animation from below (quadratic ease-out)
          float age = uTime - creationTime;
          float riseDuration = 1.0;
          float riseOffset = clamp(1.0 - (age / riseDuration), 0.0, 1.0);
          pos.y -= pow(riseOffset, 2.0) * 25.0;

          vWorldPos = (modelMatrix * vec4(pos, 1.0)).xyz;

          gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
        }
      `,
      fragmentShader: `
        uniform vec3 uSkyColor;
        uniform vec3 uSunDirection;
        uniform float uShadersEnabled;
        uniform float uFogNear;
        uniform float uFogFar;
        uniform float uTime;
        uniform float uDaylight;
        uniform float uMinLight;
        uniform vec3 uBlockLightColor;
        varying vec3 vNormal;
        varying vec3 vColor;
        varying vec3 vWorldPos;
        varying float vAo;
        varying vec2 vLight;

        // Lightmap do Minecraft: brilho = l / (4 - 3l), com luz de bloco em tom quente
        vec3 voxelLight(vec3 normal, float sunDiffuse) {
          float sky = vLight.x * uDaylight;
          float blk = vLight.y;
          float skyB = sky / (4.0 - 3.0 * sky);
          float blkB = blk / (4.0 - 3.0 * blk);
          float face = normal.y > 0.5 ? 1.0 : (normal.y < -0.5 ? 0.5 : (abs(normal.x) > 0.5 ? 0.7 : 0.85));
          float skyShade = face * mix(1.0, 0.8 + 0.3 * sunDiffuse, uDaylight);
          vec3 light = max(vec3(skyB * skyShade), uBlockLightColor * blkB * face);
          return max(light, vec3(uMinLight * face));
        }

        void main() {
          float aoMultiplier = 0.2 + 0.8 * vAo;
          if (uShadersEnabled < 0.5) {
            gl_FragColor = vec4(vColor * aoMultiplier * voxelLight(vec3(0.0, 1.0, 0.0), 0.0), 1.0);
            return;
          }

          vec3 sunDir = normalize(uSunDirection);
          float diffuse = max(dot(vNormal, sunDir), 0.0);

          vec3 lighting = vColor * voxelLight(vNormal, diffuse) * aoMultiplier * 1.1;

          // Magma emissive heat: if color matches magma block, emits warm fiery glow
          if (vColor.r > 0.7 && vColor.b < 0.15 && vColor.g > 0.15 && vColor.g < 0.35) {
            float heatGlow = 0.45 + 0.25 * sin(uTime * 3.0 + vWorldPos.x * 2.0 + vWorldPos.y * 2.0 + vWorldPos.z * 2.0);
            lighting = max(lighting, vColor * (1.1 + heatGlow));
          }

          float dist = length(vWorldPos - cameraPosition);
          float fog = smoothstep(uFogNear, uFogFar, dist);
          
          gl_FragColor = vec4(mix(lighting, uSkyColor, fog), 1.0);
        }
      `,
      vertexColors: true,
    });

    this.waterMaterial = new ShaderMaterial({
      uniforms: {
        uTime:           { value: 0 },
        uSkyColor:       { value: new Color(0x87CEEB) },
        uSunDirection:   { value: new Vector3(1, 1, 1).normalize() },
        uShadersEnabled: { value: 1.0 },
        uFogNear:        { value: 128.0 },
        uFogFar:         { value: 256.0 },
        uDaylight:       { value: 1.0 },
        uMinLight:       { value: 0.03 },
        uBlockLightColor: { value: new Color(1.0, 0.85, 0.65) },
      },
      vertexShader: `
        attribute float creationTime;
        attribute float ao;
        attribute vec2 light;
        varying vec3 vNormal;
        varying vec3 vColor;
        varying vec3 vWorldPos;
        varying float vAo;
        varying vec2 vLight;
        uniform float uTime;

        void main() {
          vNormal = normal;
          vColor = color;
          vAo = ao;
          vLight = light;
          
          vec3 pos = position;

          // Per-chunk rise animation from below (quadratic ease-out)
          float age = uTime - creationTime;
          float riseDuration = 1.0;
          float riseOffset = clamp(1.0 - (age / riseDuration), 0.0, 1.0);
          pos.y -= pow(riseOffset, 2.0) * 25.0;

          vWorldPos = (modelMatrix * vec4(pos, 1.0)).xyz;
          
          // Use world coordinates so waves align across chunk borders (lava moves slower and thicker)
          bool isLava = (vColor.r > 0.6 && vColor.b < 0.2);
          float waveSpeed = isLava ? 0.8 : 2.0;
          float waveAmp = isLava ? 0.04 : 0.1;
          pos.y += sin(uTime * waveSpeed + vWorldPos.x * 0.5) * waveAmp;
          pos.y += cos(uTime * (waveSpeed * 0.75) + vWorldPos.z * 0.5) * waveAmp;
          
          gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
        }
      `,
      fragmentShader: `
        uniform vec3 uSkyColor;
        uniform float uFogNear;
        uniform float uFogFar;
        uniform float uTime;
        uniform float uDaylight;
        uniform float uMinLight;
        uniform vec3 uBlockLightColor;
        varying vec3 vNormal;
        varying vec3 vColor;
        varying vec3 vWorldPos;
        varying vec2 vLight;

        // Lightmap do Minecraft: brilho = l / (4 - 3l), com luz de bloco em tom quente
        vec3 voxelLight(vec3 normal, float sunDiffuse) {
          float sky = vLight.x * uDaylight;
          float blk = vLight.y;
          float skyB = sky / (4.0 - 3.0 * sky);
          float blkB = blk / (4.0 - 3.0 * blk);
          float face = normal.y > 0.5 ? 1.0 : (normal.y < -0.5 ? 0.5 : (abs(normal.x) > 0.5 ? 0.7 : 0.85));
          float skyShade = face * mix(1.0, 0.8 + 0.3 * sunDiffuse, uDaylight);
          vec3 light = max(vec3(skyB * skyShade), uBlockLightColor * blkB * face);
          return max(light, vec3(uMinLight * face));
        }

        void main() {
          float dist = length(vWorldPos - cameraPosition);
          float fog = smoothstep(uFogNear, uFogFar, dist);
          
          bool isLava = (vColor.r > 0.6 && vColor.b < 0.2);
          if (isLava) {
            float pulse = sin(uTime * 2.5 + vWorldPos.x * 1.5 + vWorldPos.z * 1.5) * 0.5 + 0.5;
            float slow = cos(uTime * 1.2 - vWorldPos.x * 0.8 + vWorldPos.z * 0.8) * 0.5 + 0.5;
            vec3 coreHeat = vec3(1.0, 0.75, 0.1);
            vec3 darkCrust = vec3(0.85, 0.15, 0.02);
            vec3 lavaBase = mix(darkCrust, coreHeat, pulse * 0.4 + slow * 0.3);
            gl_FragColor = vec4(mix(lavaBase, uSkyColor, fog * 0.8), 1.0);
          } else {
            vec3 waterBase = mix(vColor, vec3(0.0, 0.4, 0.8), 0.3) * voxelLight(vNormal, 0.0) * 1.1;
            gl_FragColor = vec4(mix(waterBase, uSkyColor, fog), 0.7);
          }
        }
      `,
      vertexColors: true,
      transparent: true,
      depthWrite: false,
    });

    this.sky = new Sky();
    this.sky.setDimension(this.activeDimension);
    this.add(this.sky);

    // ── Block outline: two-layer inset (shadow + main) ─────────────────────
    //  Shadow layer  (0.992) — slightly larger, dark-gray, low opacity
    //    creates the inset "pressed" shadow illusion
    //  Main  layer   (0.968) — pure black, higher opacity, renders on top
    //  Both use depthTest:false so they sit on top of the block faces.
    // ── Block face highlight ────────────────────────────────────────────────
    //  A semi-transparent dark face overlay rendered on top of the targeted block.
    //  polygonOffset pushes it just in front of the chunk faces to avoid z-fighting.
    this.blockOutlineMat = new MeshBasicMaterial({
      color: 0x000000,
      transparent: true,
      opacity: 0.25,
      depthTest: true,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -4,
    });
    this.blockOutline = new Mesh(new BoxGeometry(1, 1, 1), this.blockOutlineMat);
    this.blockOutline.renderOrder = 1;
    this.blockOutline.visible = false;
    this.add(this.blockOutline);

    // Black border edges rendered on top of the face highlight
    this.blockEdgeMat = new LineBasicMaterial({
      color: 0x000000,
      transparent: true,
      opacity: 0.9,
      depthTest: false,
    });
    this.blockEdge = new LineSegments(
      new EdgesGeometry(new BoxGeometry(1.001, 1.001, 1.001)),
      this.blockEdgeMat
    );
    this.blockEdge.renderOrder = 2;
    this.blockEdge.visible = false;
    this.add(this.blockEdge);
  }

  public setChunkHeight(height: number): void {
    this.chunkHeight = height;
  }

  public setRenderDistance(distance: number): void {
    this.renderDistance = distance;
    this.updateChunks(true);
  }

  public toggleShaders(enabled: boolean): void {
    const val = enabled ? 1.0 : 0.0;
    this.opaqueMaterial.uniforms.uShadersEnabled.value = val;
    this.waterMaterial.uniforms.uShadersEnabled.value  = val;
  }

  public toggleWireframe(force?: boolean): boolean {
    this.wireframeEnabled = force !== undefined ? force : !this.wireframeEnabled;
    this.opaqueMaterial.wireframe = this.wireframeEnabled;
    this.waterMaterial.wireframe  = this.wireframeEnabled;
    return this.wireframeEnabled;
  }

  public setUnderwater(underwater: boolean): void {
    if (this.isUnderwater === underwater) return;
    this.isUnderwater = underwater;
    
    let color: Color;
    if (underwater) {
        color = new Color(this.activeDimension.atmosphere.underwaterFogColor ?? 0x001133);
    } else {
        color = this.sky.ambient.color;
    }

    const fogStart = underwater ? 2.0 : 128.0;
    const fogEnd = underwater ? 32.0 : 256.0;

    this.opaqueMaterial.uniforms.uSkyColor.value.copy(color);
    this.waterMaterial.uniforms.uSkyColor.value.copy(color);
    
    this.opaqueMaterial.uniforms.uFogNear.value = fogStart;
    this.opaqueMaterial.uniforms.uFogFar.value = fogEnd;
    this.waterMaterial.uniforms.uFogNear.value = fogStart;
    this.waterMaterial.uniforms.uFogFar.value = fogEnd;
  }

  public setTime(phase: string): void {
    if (phase === 'stop') {
        this.isTimePaused = true;
    } else if (phase === 'start') {
        this.isTimePaused = false;
    } else {
        this.sky.setTime(phase);
    }
  }

  public switchDimension(dimension: DimensionDefinition, targetPosition?: Vector3): void {
    this.activeDimension = dimension;
    this.params.worldType = dimension.generatorId;
    this.sky.setDimension(dimension);

    // Configura névoa e cores atmosféricas da dimensão
    const fogNear = dimension.atmosphere.fogNear ?? 128.0;
    const fogFar = dimension.atmosphere.fogFar ?? 256.0;
    this.opaqueMaterial.uniforms.uFogNear.value = fogNear;
    this.opaqueMaterial.uniforms.uFogFar.value = fogFar;
    this.waterMaterial.uniforms.uFogNear.value = fogNear;
    this.waterMaterial.uniforms.uFogFar.value = fogFar;

    const fogColor = new Color(dimension.atmosphere.fogColor ?? dimension.atmosphere.horizonColor);
    this.opaqueMaterial.uniforms.uSkyColor.value.copy(fogColor);
    this.waterMaterial.uniforms.uSkyColor.value.copy(fogColor);

    this.disposeAll();
    this.loadedChunks.clear();
    this.pendingChunks.clear();
    this.meshQueue.length = 0;
    this.rebuildMeshQueue.length = 0;
    this.rebuildQueue.length = 0;
    this.rebuildSet.clear();
    this.pendingRebuildChunks.clear();
    this.staleRebuildChunks.clear();
    this.light.dirty.clear();
    this.activeWaterChunks.clear();
    this.waterTickTimer   = 0;
    this.lastChunk = null;
    this.lastChunkKey = null;
    this.lastPlayerChunkX = Infinity;
    this.lastPlayerChunkY = Infinity;
    this.lastPlayerChunkZ = Infinity;
    this.elapsedTime      = 0;

    if (targetPosition) {
      this.lastUpdatePos.copy(targetPosition);
    }
    this.updateChunks(true);
  }

  public reset(newParams?: Partial<WorldParams>): void {
    if (newParams) {
        if (newParams.seed !== undefined) this.params.seed = newParams.seed;
        if (newParams.worldType !== undefined) {
          this.params.worldType = newParams.worldType;
          const matchedDim = dimensionRegistry.get(String(newParams.worldType).toLowerCase());
          if (matchedDim) {
            this.activeDimension = matchedDim;
            this.sky.setDimension(matchedDim);
          }
        }
        if (newParams.terrain) Object.assign(this.params.terrain, newParams.terrain);
    }
    this.disposeAll();
    this.loadedChunks.clear();
    this.pendingChunks.clear();
    this.meshQueue.length = 0;
    this.rebuildMeshQueue.length = 0;
    this.rebuildQueue.length = 0;
    this.rebuildSet.clear();
    this.pendingRebuildChunks.clear();
    this.staleRebuildChunks.clear();
    this.light.dirty.clear();
    this.activeWaterChunks.clear();
    this.waterTickTimer   = 0;
    this.lastChunk = null;
    this.lastChunkKey = null;
    this.lastPlayerChunkX = Infinity;
    this.lastPlayerChunkY = Infinity;
    this.lastPlayerChunkZ = Infinity;
    this.elapsedTime      = 0;
    this.sky.setDimension(this.activeDimension);
    this.updateChunks(true);
  }

  private disposeAll(): void {
    for (const chunk of this.loadedChunks.values()) {
        this.destroyChunkMeshes(chunk);
    }
  }

  warmUp(renderer: WebGLRenderer, scene: Scene): void {
    const dummy = new Mesh(new BufferGeometry(), this.opaqueMaterial);
    scene.add(dummy);
    renderer.compile(scene, this.camera);
    scene.remove(dummy);
    dummy.geometry.dispose();
  }

  tick(delta: number = 16.6667): void {
    [this.opaqueMaterial, this.waterMaterial].forEach(mat => {
        mat.uniforms.uTime.value = this.elapsedTime;
        if (!this.isUnderwater) {
          mat.uniforms.uSkyColor.value.copy(this.sky.ambient.color);
        }
        mat.uniforms.uSunDirection.value.copy(this.sky.directional.position).normalize();
        mat.uniforms.uDaylight.value = this.sky.daylight;
        mat.uniforms.uMinLight.value = this.activeDimension.atmosphere.minLight ?? 0.03;
        if (this.activeDimension.atmosphere.alwaysLit) {
            mat.uniforms.uShadersEnabled.value = 1.0;
        }
    });

    // ── Block highlight animation ──────────────────────────────────────────────
    if (this.blockOutline.visible) {
      // Breaking state has higher base opacity
      const isBreaking = this.blockOutlineMat.opacity >= 0.5; 
      const speed = isBreaking ? 15.0 : 5.0;
      const pulse = (Math.sin(this.elapsedTime * speed) + 1.0) * 0.5;
      
      if (isBreaking) {
          // ... (position reset and jitter)
          const bx = Math.floor(this.blockOutline.position.x);
          const by = Math.floor(this.blockOutline.position.y);
          const bz = Math.floor(this.blockOutline.position.z);
          
          this.blockOutline.position.set(bx + 0.5, by + 0.5, bz + 0.5);
          this.blockEdge.position.set(bx + 0.5, by + 0.5, bz + 0.5);

          const jitter = 0.02;
          const jx = (Math.random() - 0.5) * jitter;
          const jy = (Math.random() - 0.5) * jitter;
          const jz = (Math.random() - 0.5) * jitter;

          this.blockOutline.position.x += jx;
          this.blockOutline.position.y += jy;
          this.blockOutline.position.z += jz;
          this.blockEdge.position.x += jx;
          this.blockEdge.position.y += jy;
          this.blockEdge.position.z += jz;

          this.blockOutlineMat.opacity = 0.5 + 0.3 * pulse; // 0.5 to 0.8
          this.blockEdgeMat.opacity    = 0.7 + 0.3 * pulse;
      } else {
          this.blockOutlineMat.opacity = 0.12 + 0.23 * pulse; // 0.12 to 0.35
          this.blockEdgeMat.opacity    = 0.60 + 0.40 * pulse;
      }
    }

    if (!this.isTimePaused) {
        this.sky.tick(this.camera, delta);
        this.elapsedTime += delta / 1000;
        // 3. Update Entities
        this.entityManager.update(delta);

        // 4. Update Water Scalar Field Physics (~12 ticks/sec)
        this.waterTickTimer += delta;
        if (this.waterTickTimer >= 80) {
            this.waterTickTimer = 0;
            this.tickWaterPhysics();
        }
    }

    if (this.camera.position.distanceToSquared(this.lastUpdatePos) > 16) {
        this.updateChunks(false);
        this.lastUpdatePos.copy(this.camera.position);
    }

    // Time budget to prevent main thread stutters (max ~12ms per frame for geometry processing)
    const tickStart = performance.now();
    const timeLimit = 6.0;

    // 1. Process chunk meshes (from async rebuilds)
    while (this.rebuildMeshQueue.length > 0 && (performance.now() - tickStart) < timeLimit) {
      const nextRebuild = this.rebuildMeshQueue.shift();
      if (nextRebuild && this.loadedChunks.has(nextRebuild.chunkKey)) {
        const chunk = this.loadedChunks.get(nextRebuild.chunkKey)!;
        let creationTime: number;

        if (!chunk.hasAnimated) {
          // First time this chunk is receiving a mesh: start the rise animation!
          chunk.hasAnimated = true;
          chunk.animationStartTime = this.elapsedTime;
          creationTime = this.elapsedTime;
        } else if (
          chunk.animationStartTime !== undefined &&
          (this.elapsedTime - chunk.animationStartTime) < 1.0
        ) {
          // Still rising (e.g. neighbour border rebuild shortly after spawn):
          // keep original start time so the chunk continues smoothly without popping
          creationTime = chunk.animationStartTime;
        } else {
          // Chunk is already in place and animated; render immediately without rise
          creationTime = this.elapsedTime - 10.0;
        }

        this.applyChunkData(nextRebuild, creationTime);
      }
    }

    // 2. Relight edits and remesh chunks whose light changed
    this.light.flushEdits();
    this.queueLightRebuilds();

    // 3. Dispatch meshing rebuilds
    const itemsInQueue = this.rebuildQueue.length;
    let itemsProcessed = 0;
    while (itemsProcessed < itemsInQueue && (performance.now() - tickStart) < timeLimit) {
      const toRebuild = this.rebuildQueue.shift();
      if (toRebuild !== undefined) {
        if (this.pendingRebuildChunks.has(toRebuild)) {
          // Chunk is currently rebuilding, push to back to try again later
          this.rebuildQueue.push(toRebuild);
        } else {
          this.rebuildSet.delete(toRebuild);
          const chunk = this.loadedChunks.get(toRebuild);
          if (chunk) this.asyncRebuild(toRebuild, chunk);
        }
      }
      itemsProcessed++;
    }

    // 4. Neighbor-solidity occlusion culling (throttled — runs every 15 frames ~250ms @ 60fps)
    this.occlusionTick++;
    if (this.occlusionTick >= 15 || this.occlusionDirty) {
      this.occlusionTick = 0;
      this.occlusionDirty = false;
      this.updateOcclusion();
    }
  }

  private applyChunkData(response: WorkerResponse, uTime: number): void {
    const chunk = this.loadedChunks.get(response.chunkKey);
    if (!chunk) return;

    // Blocks, borders and light stay as the main thread holds them: the worker's copies are a
    // snapshot from dispatch time and would undo edits made while the job was in flight.
    this.destroyChunkMeshes(chunk);

    if (response.opaque && response.opaque.positions.length > 3) {
        chunk.opaqueMesh = this.buildSingleMesh(response.opaque, uTime, this.opaqueMaterial);
        this.add(chunk.opaqueMesh);
    }
    if (response.water && response.water.positions.length > 3) {
        chunk.waterMesh = this.buildSingleMesh(response.water, uTime, this.waterMaterial);
        this.add(chunk.waterMesh);
    }
    chunk.hasAnimated = true;

    if (!chunk.readyNotified) {
        chunk.readyNotified = true;
        this.events.emit<ChunkReadyEvent>('chunk:ready', {
            key: response.chunkKey,
            data: chunk.data,
            chunkSize: this.chunkSize
        });
    }
  }

  private buildSingleMesh(data: GeometryData, creationTime: number, material: ShaderMaterial): Mesh {
    const geometry = new BufferGeometry();
    geometry.setAttribute('position',     new BufferAttribute(data.positions, 3));
    geometry.setAttribute('normal',       new BufferAttribute(data.normals,   3));
    geometry.setAttribute('color',        new BufferAttribute(data.colors,    3));
    geometry.setAttribute('ao',           new BufferAttribute(data.ao,        1));
    geometry.setAttribute('light',        new BufferAttribute(data.light,     2));

    data.creationTime.fill(creationTime);
    geometry.setAttribute('creationTime', new BufferAttribute(data.creationTime, 1));

    geometry.setIndex(new BufferAttribute(data.vertices, 1));

    // Compute bounding sphere immediately so Three.js frustum culling
    // works without lazy per-frame computation on the main thread.
    geometry.computeBoundingSphere();
    if (geometry.boundingSphere) {
      // Expand bounding sphere so frustum culling does not clip the chunk while it rises from below
      geometry.boundingSphere.radius += 30.0;
    }

    const mesh = new Mesh(geometry, material);
    mesh.frustumCulled = true;
    return mesh;
  }

  private destroyChunkMeshes(chunk: LoadedChunk): void {
    if (chunk.opaqueMesh) {
        chunk.opaqueMesh.geometry.dispose();
        this.remove(chunk.opaqueMesh);
        chunk.opaqueMesh = null;
    }
    if (chunk.waterMesh) {
        chunk.waterMesh.geometry.dispose();
        this.remove(chunk.waterMesh);
        chunk.waterMesh = null;
    }
  }

  getChunkMeshes(): Mesh[] {
    const meshes: Mesh[] = [];
    for (const chunk of this.loadedChunks.values()) {
        // Only include visible meshes — occlusion-culled chunks must not be raycast-clickable
        if (chunk.opaqueMesh && chunk.opaqueMesh.visible) meshes.push(chunk.opaqueMesh);
        if (chunk.waterMesh  && chunk.waterMesh.visible)  meshes.push(chunk.waterMesh);
    }
    return meshes;
  }

  public setBlockAt(bx: number, by: number, bz: number, blockType: number): void {
    const key = this.keyForBlock(bx, by, bz);
    const chunk = this.loadedChunks.get(key);
    if (!chunk) return;

    const lx = bx - chunk.data.startX;
    const ly = by - chunk.data.startY;
    const lz = bz - chunk.data.startZ;
    const s = this.chunkSize;
    const idx = ly * s * s + lz * s + lx;

    chunk.hasAnimated = true;
    chunk.animationStartTime = -10.0;

    chunk.data.blocks[idx] = blockType;
    if (!chunk.data.waterLevels) {
      chunk.data.waterLevels = new Uint8Array(chunk.data.blocks.length).fill(0);
    }
    chunk.data.waterLevels[idx] = blockRegistry.isFluid(blockType) ? 255 : 0;

    // Se colocou fluido ou removeu bloco adjacente a fluido, acorda chunks para simulação
    if (blockRegistry.isFluid(blockType)) {
      this.activeWaterChunks.add(key);
      if (lx === 0)     this.activeWaterChunks.add(this.chunkKey(bx - 1, by, bz));
      if (lx === s - 1) this.activeWaterChunks.add(this.chunkKey(bx + 1, by, bz));
      if (ly === 0)     this.activeWaterChunks.add(this.chunkKey(bx, by - 1, bz));
      if (ly === s - 1) this.activeWaterChunks.add(this.chunkKey(bx, by + 1, bz));
      if (lz === 0)     this.activeWaterChunks.add(this.chunkKey(bx, by, bz - 1));
      if (lz === s - 1) this.activeWaterChunks.add(this.chunkKey(bx, by, bz + 1));
    } else if (!blockRegistry.isSolid(blockType)) {
      const neighbors = [
        [bx + 1, by, bz], [bx - 1, by, bz],
        [bx, by + 1, bz], [bx, by - 1, bz],
        [bx, by, bz + 1], [bx, by, bz - 1]
      ];
      for (const [nx, ny, nz] of neighbors) {
        if (blockRegistry.isFluid(this.getBlock(nx, ny, nz))) {
          this.activeWaterChunks.add(this.keyForBlock(nx, ny, nz));
          this.activeWaterChunks.add(key);
          break;
        }
      }
    }

    // ── Immediately update this chunk's own borders so that adjacent
    //    chunk rebuilds (dispatched below) see the correct block
    //    instead of the stale value (fixes the transparent-face race condition).
    if (lx === 0         && chunk.borders.negX) chunk.borders.negX[ly * s + lz] = blockType;
    if (lx === s - 1     && chunk.borders.posX) chunk.borders.posX[ly * s + lz] = blockType;
    if (ly === 0         && chunk.borders.negY) chunk.borders.negY[lz * s + lx] = blockType;
    if (ly === s - 1     && chunk.borders.posY) chunk.borders.posY[lz * s + lx] = blockType;
    if (lz === 0         && chunk.borders.negZ) chunk.borders.negZ[ly * s + lx] = blockType;
    if (lz === s - 1     && chunk.borders.posZ) chunk.borders.posZ[ly * s + lx] = blockType;

    this.light.queueEdit(chunk, idx);
    this.light.flushEdits();

    this.asyncRebuild(key, chunk);
    this.rebuildAdjacentChunks(bx, by, bz, chunk.data);
  }

  public getWaterLevel(bx: number, by: number, bz: number): number {
    const key = this.keyForBlock(bx, by, bz);
    const chunk = this.loadedChunks.get(key);
    if (!chunk || !chunk.data.waterLevels) return 0;
    const lx = bx - chunk.data.startX;
    const ly = by - chunk.data.startY;
    const lz = bz - chunk.data.startZ;
    const s = this.chunkSize;
    if (lx < 0 || lx >= s || ly < 0 || ly >= s || lz < 0 || lz >= s) return 0;
    return chunk.data.waterLevels[ly * s * s + lz * s + lx];
  }

  public setBlockAndWaterAt(bx: number, by: number, bz: number, type: number, level: number): void {
    const key = this.keyForBlock(bx, by, bz);
    const chunk = this.loadedChunks.get(key);
    if (!chunk) return;
    const lx = bx - chunk.data.startX;
    const ly = by - chunk.data.startY;
    const lz = bz - chunk.data.startZ;
    const s = this.chunkSize;
    const idx = ly * s * s + lz * s + lx;

    chunk.data.blocks[idx] = type;
    if (!chunk.data.waterLevels) {
      chunk.data.waterLevels = new Uint8Array(chunk.data.blocks.length).fill(0);
    }
    chunk.data.waterLevels[idx] = level;

    if (lx === 0         && chunk.borders.negX) chunk.borders.negX[ly * s + lz] = type;
    if (lx === s - 1     && chunk.borders.posX) chunk.borders.posX[ly * s + lz] = type;
    if (ly === 0         && chunk.borders.negY) chunk.borders.negY[lz * s + lx] = type;
    if (ly === s - 1     && chunk.borders.posY) chunk.borders.posY[lz * s + lx] = type;
    if (lz === 0         && chunk.borders.negZ) chunk.borders.negZ[ly * s + lx] = type;
    if (lz === s - 1     && chunk.borders.posZ) chunk.borders.posZ[ly * s + lx] = type;

    this.light.queueEdit(chunk, idx); // aplicado em lote no próximo tick
    this.activeWaterChunks.add(key);
  }

  private tickWaterPhysics(): void {
    if (this.activeWaterChunks.size === 0) return;

    const waterAccess: WorldWaterAccess = {
      getBlock: (wx, wy, wz) => this.getBlock(wx, wy, wz),
      getWaterLevel: (wx, wy, wz) => this.getWaterLevel(wx, wy, wz),
      setBlockAndWater: (wx, wy, wz, type, level) => this.setBlockAndWaterAt(wx, wy, wz, type, level)
    };

    const chunksToProcess = Array.from(this.activeWaterChunks);

    for (const key of chunksToProcess) {
      const chunk = this.loadedChunks.get(key);
      if (!chunk) {
        this.activeWaterChunks.delete(key);
        continue;
      }

      const result = WaterSimulator.stepChunk(chunk.data, this.chunkSize, waterAccess);

      if (result.hasChanged) {
        this.asyncRebuild(key, chunk);

        const [sx, sy, sz] = this.decodeKey(key);
        const s = this.chunkSize;
        if (result.touchedBorders.negX) {
          const adjKey = this.chunkKey(sx - s, sy, sz);
          this.activeWaterChunks.add(adjKey);
          const adj = this.loadedChunks.get(adjKey);
          if (adj) this.asyncRebuild(adjKey, adj);
        }
        if (result.touchedBorders.posX) {
          const adjKey = this.chunkKey(sx + s, sy, sz);
          this.activeWaterChunks.add(adjKey);
          const adj = this.loadedChunks.get(adjKey);
          if (adj) this.asyncRebuild(adjKey, adj);
        }
        if (result.touchedBorders.negY) {
          const adjKey = this.chunkKey(sx, sy - s, sz);
          this.activeWaterChunks.add(adjKey);
          const adj = this.loadedChunks.get(adjKey);
          if (adj) this.asyncRebuild(adjKey, adj);
        }
        if (result.touchedBorders.posY) {
          const adjKey = this.chunkKey(sx, sy + s, sz);
          this.activeWaterChunks.add(adjKey);
          const adj = this.loadedChunks.get(adjKey);
          if (adj) this.asyncRebuild(adjKey, adj);
        }
        if (result.touchedBorders.negZ) {
          const adjKey = this.chunkKey(sx, sy, sz - s);
          this.activeWaterChunks.add(adjKey);
          const adj = this.loadedChunks.get(adjKey);
          if (adj) this.asyncRebuild(adjKey, adj);
        }
        if (result.touchedBorders.posZ) {
          const adjKey = this.chunkKey(sx, sy, sz + s);
          this.activeWaterChunks.add(adjKey);
          const adj = this.loadedChunks.get(adjKey);
          if (adj) this.asyncRebuild(adjKey, adj);
        }
      } else {
        this.activeWaterChunks.delete(key);
      }
    }
  }

  destroyBlock(point: Vector3, normal: Vector3): void {
    const bx = Math.floor(point.x - normal.x * 0.5);
    const by = Math.floor(point.y - normal.y * 0.5);
    const bz = Math.floor(point.z - normal.z * 0.5);
    
    this.setBlockAt(bx, by, bz, -1);
  }

  destroyBlockAt(bx: number, by: number, bz: number): boolean {
    const current = this.getBlock(bx, by, bz);
    if (!blockRegistry.isSolid(current)) return false;
    this.setBlockAt(bx, by, bz, -1);
    return true;
  }

  destroySphere(center: Vector3, radius: number): Array<{ pos: Vector3; blockType: number }> {
    const destroyed: Array<{ pos: Vector3; blockType: number }> = [];
    const minX = Math.floor(center.x - radius);
    const maxX = Math.ceil(center.x + radius);
    const minY = Math.max(-64, Math.floor(center.y - radius));
    const maxY = Math.min(128, Math.ceil(center.y + radius));
    const minZ = Math.floor(center.z - radius);
    const maxZ = Math.ceil(center.z + radius);

    const rSq = radius * radius;
    const modifiedChunks = new Map<string, LoadedChunk>();
    const adjacentKeys = new Set<string>();
    const s = this.chunkSize;

    for (let x = minX; x <= maxX; x++) {
      const dx = (x + 0.5) - center.x;
      const dxSq = dx * dx;
      for (let z = minZ; z <= maxZ; z++) {
        const dz = (z + 0.5) - center.z;
        const dzSq = dz * dz;
        if (dxSq + dzSq > rSq) continue;

        for (let y = minY; y <= maxY; y++) {
          const dy = (y + 0.5) - center.y;
          if (dxSq + dy * dy + dzSq > rSq) continue;

          const key = this.keyForBlock(x, y, z);
          let chunk = modifiedChunks.get(key);
          if (!chunk) {
            chunk = this.loadedChunks.get(key);
            if (chunk) modifiedChunks.set(key, chunk);
          }
          if (!chunk) continue;

          const lx = x - chunk.data.startX;
          const ly = y - chunk.data.startY;
          const lz = z - chunk.data.startZ;
          const idx = ly * s * s + lz * s + lx;
          const currentType = chunk.data.blocks[idx];

          if (blockRegistry.isSolid(currentType)) {
            chunk.data.blocks[idx] = -1;
            this.light.queueEdit(chunk, idx);
            destroyed.push({ pos: new Vector3(x, y, z), blockType: currentType });

            // Atualiza buffers de borda se na borda do chunk
            if (lx === 0 && chunk.borders.negX) {
              chunk.borders.negX[ly * s + lz] = -1;
              adjacentKeys.add(this.chunkKey(chunk.data.startX - s, chunk.data.startY, chunk.data.startZ));
            }
            if (lx === s - 1 && chunk.borders.posX) {
              chunk.borders.posX[ly * s + lz] = -1;
              adjacentKeys.add(this.chunkKey(chunk.data.startX + s, chunk.data.startY, chunk.data.startZ));
            }
            if (ly === 0 && chunk.borders.negY) {
              chunk.borders.negY[lz * s + lx] = -1;
              adjacentKeys.add(this.chunkKey(chunk.data.startX, chunk.data.startY - s, chunk.data.startZ));
            }
            if (ly === s - 1 && chunk.borders.posY) {
              chunk.borders.posY[lz * s + lx] = -1;
              adjacentKeys.add(this.chunkKey(chunk.data.startX, chunk.data.startY + s, chunk.data.startZ));
            }
            if (lz === 0 && chunk.borders.negZ) {
              chunk.borders.negZ[ly * s + lx] = -1;
              adjacentKeys.add(this.chunkKey(chunk.data.startX, chunk.data.startY, chunk.data.startZ - s));
            }
            if (lz === s - 1 && chunk.borders.posZ) {
              chunk.borders.posZ[ly * s + lx] = -1;
              adjacentKeys.add(this.chunkKey(chunk.data.startX, chunk.data.startY, chunk.data.startZ + s));
            }
          }
        }
      }
    }

    this.light.flushEdits();

    // Rebuild em lote de todos os chunks afetados
    for (const [key, chunk] of modifiedChunks) {
      this.asyncRebuild(key, chunk);
    }
    for (const adjKey of adjacentKeys) {
      if (!modifiedChunks.has(adjKey)) {
        const adj = this.loadedChunks.get(adjKey);
        if (adj) this.asyncRebuild(adjKey, adj);
      }
    }

    return destroyed;
  }

  getEntityManager(): EntityManager {
    return this.entityManager;
  }

  addBlock(point: Vector3, normal: Vector3, blockType: number): void {
    // Offset by +0.5 along normal to get to the empty space next to the hit face
    const bx = Math.floor(point.x + normal.x * 0.5);
    const by = Math.floor(point.y + normal.y * 0.5);
    const bz = Math.floor(point.z + normal.z * 0.5);

    // Basic collision check if player is at that position? 
    // For now we just place it.
    this.setBlockAt(bx, by, bz, blockType);
  }

  getBlock(bx: number, by: number, bz: number): number {
    const key = this.keyForBlock(bx, by, bz);
    let chunk: LoadedChunk | undefined;
    if (key === this.lastChunkKey && this.lastChunk) { chunk = this.lastChunk; }
    else { chunk = this.loadedChunks.get(key); if (chunk) { this.lastChunk = chunk; this.lastChunkKey = key; } }
    
    if (!chunk) return -1;
    const lx = bx - chunk.data.startX;
    const ly = by - chunk.data.startY;
    const lz = bz - chunk.data.startZ;
    const idx = ly * this.chunkSize * this.chunkSize + lz * this.chunkSize + lx;
    return chunk.data.blocks[idx];
  }
  isBlockSolid(bx: number, by: number, bz: number): boolean { 
      const b = this.getBlock(bx, by, bz);
      return b !== -1 && blockRegistry.isSolid(b);
  }

  private updateChunks(force: boolean): void {
    const cx = Math.floor(this.camera.position.x / this.chunkSize);
    const cy = Math.floor(this.camera.position.y / this.chunkSize);
    const cz = Math.floor(this.camera.position.z / this.chunkSize);
    if (!force && cx === this.lastPlayerChunkX && cy === this.lastPlayerChunkY && cz === this.lastPlayerChunkZ) return;
    this.lastPlayerChunkX = cx; this.lastPlayerChunkY = cy; this.lastPlayerChunkZ = cz;
    
    const desired = new Set<string>();
    const radiusSq = this.renderDistance * this.renderDistance;
    
    // Dynamic vertical range around player position (supporting deep underground downwards)
    const minCy = Math.max(-32, cy - this.verticalRenderDistance);
    const maxCy = Math.min(8, cy + this.verticalRenderDistance);

    for (let dx = -this.renderDistance; dx <= this.renderDistance; dx++) {
      for (let dz = -this.renderDistance; dz <= this.renderDistance; dz++) {
        if (dx * dx + dz * dz > radiusSq) continue;
        
        // A) Deep Dynamic Layer (Dynamic Vertical Load from player point)
        for (let targetCy = minCy; targetCy <= maxCy; targetCy++) {
          desired.add(this.chunkKey((cx + dx) * this.chunkSize, targetCy * this.chunkSize, (cz + dz) * this.chunkSize));
        }
        
        // B) Surface Pinning Layer (Permanent view of terrain from Y=0 to Y=128 when near surface)
        if (cy >= -2) {
          for (let baseCy = 0; baseCy <= 7; baseCy++) {
            desired.add(this.chunkKey((cx + dx) * this.chunkSize, baseCy * this.chunkSize, (cz + dz) * this.chunkSize));
          }
        }
      }
    }
    
    const toUnload: string[] = [];
    for (const key of this.loadedChunks.keys()) {
      if (!desired.has(key)) toUnload.push(key);
    }
    for (const key of toUnload) this.unloadChunk(key);
    
    for (const key of Array.from(this.pendingChunks)) {
      if (!desired.has(key)) { this.pool.cancel(key); this.pendingChunks.delete(key); }
    }
    
    const toRequest = Array.from(desired)
      .filter(k => !this.loadedChunks.has(k) && !this.pendingChunks.has(k))
      .sort((a, b) => this.keyDistanceNumeric(a, cx, cy, cz) - this.keyDistanceNumeric(b, cx, cy, cz));
      
    toRequest.forEach(k => this.requestChunk(k));
  }

  private requestChunk(key: string): void {
    this.pendingChunks.add(key);
    const [startX, startY, startZ] = this.decodeKey(key);
    this.pool.dispatch(
      {
        chunkKey: key, size: this.chunkSize, height: this.chunkSize,
        startX, endX: startX + this.chunkSize, 
        startY, endY: startY + this.chunkSize, 
        startZ, endZ: startZ + this.chunkSize,
        worldParams: this.params, neighbourBorderBlocks: this.getNeighbourBorderBlocks(startX, startY, startZ),
        computeLight: true,
        presumeSky: this.presumesSky(startY),
        buildMesh: false // We only want terrain data first!
      },
      (response) => this.onChunkReady(response),
    );
  }

  private onChunkReady(response: WorkerResponse): void {
    this.pendingChunks.delete(response.chunkKey);
    if (!this.loadedChunks.has(response.chunkKey)) {
        const chunk: LoadedChunk = {
            key: response.chunkKey,
            data: response.chunkData,
            borders: response.borders,
            opaqueMesh: null,
            waterMesh: null,
            light: response.light ?? this.light.createLightArray(),
            neighbors: [null, null, null, null, null, null]
        };
        this.loadedChunks.set(response.chunkKey, chunk);
        const [cx, cy, cz] = this.decodeKey(response.chunkKey);
        this.light.stitchChunk(chunk, this.neighborChunks(cx, cy, cz), !!response.light && this.presumesSky(cy));
    }
    
    // Attempt to mesh this chunk and its existing neighbors.
    this.checkAndQueueMeshing(response.chunkKey);
    const [sx, sy, sz] = this.decodeKey(response.chunkKey);
    const endX = sx + this.chunkSize;
    const endY = sy + this.chunkSize;
    const endZ = sz + this.chunkSize;
    
    for (const k of [
      this.chunkKey(sx - this.chunkSize, sy, sz), this.chunkKey(endX, sy, sz),
      this.chunkKey(sx, sy - this.chunkSize, sz), this.chunkKey(sx, endY, sz),
      this.chunkKey(sx, sy, sz - this.chunkSize), this.chunkKey(sx, sy, endZ),
    ]) {
        this.checkAndQueueMeshing(k);
    }
  }

  private unloadChunk(key: string): void {
    const chunk = this.loadedChunks.get(key);
    if (chunk) {
        this.destroyChunkMeshes(chunk);
        this.light.unlink(chunk);
        this.loadedChunks.delete(key);
    }
    this.staleRebuildChunks.delete(key);
    if (this.lastChunkKey === key) { this.lastChunk = null; this.lastChunkKey = null; }
  }

  private asyncRebuild(key: string, chunk: LoadedChunk): void {
    if (this.pendingRebuildChunks.has(key)) {
      this.staleRebuildChunks.add(key);
      return;
    }
    this.pendingRebuildChunks.add(key);
    const [sx, sy, sz] = this.decodeKey(key);
    this.rebuildPool.dispatch(
      {
        chunkKey: key, size: this.chunkSize, height: this.chunkSize,
        startX: sx, endX: sx + this.chunkSize, 
        startY: sy, endY: sy + this.chunkSize, 
        startZ: sz, endZ: sz + this.chunkSize,
        worldParams: this.params, neighbourBorderBlocks: this.getNeighbourBorderBlocks(sx, sy, sz),
        existingBlocks: chunk.data.blocks,
        existingWaterLevels: chunk.data.waterLevels,
        light: chunk.light,
        neighbourBorderLight: this.light.neighborBorders(chunk),
        buildMesh: true // Rebuild jobs explicitly request the mesh
      },
      (response) => this.onRebuildReady(response),
      true // highPriority: meshing jobs take precedence over distant terrain generation
    );
  }

  private onRebuildReady(response: WorkerResponse): void {
    this.pendingRebuildChunks.delete(response.chunkKey);
    const chunk = this.loadedChunks.get(response.chunkKey);
    if (chunk) {
      this.rebuildMeshQueue.push(response);
      if (this.staleRebuildChunks.delete(response.chunkKey)) this.asyncRebuild(response.chunkKey, chunk);
    }
  }

  private rebuildAdjacentChunks(bx: number, by: number, bz: number, data: ChunkDataResult): void {
    const offsets: Array<[number, number, number]> = [];
    if (bx === data.startX) offsets.push([-this.chunkSize, 0, 0]);
    if (bx === data.endX - 1) offsets.push([this.chunkSize, 0, 0]);
    if (by === data.startY) offsets.push([0, -this.chunkSize, 0]);
    if (by === data.endY - 1) offsets.push([0, this.chunkSize, 0]);
    if (bz === data.startZ) offsets.push([0, 0, -this.chunkSize]);
    if (bz === data.endZ - 1) offsets.push([0, 0, this.chunkSize]);
    for (const [dx, dy, dz] of offsets) {
      const adjKey = this.keyForBlock(bx + dx, by + dy, bz + dz);
      const adjChunk = this.loadedChunks.get(adjKey);
      if (adjChunk) this.asyncRebuild(adjKey, adjChunk);
    }
  }

  private getNeighbourBorderBlocks(startX: number, startY: number, startZ: number): ChunkBorders {
    const endX = startX + this.chunkSize;
    const endY = startY + this.chunkSize;
    const endZ = startZ + this.chunkSize;
    
    const nxKey = this.chunkKey(startX - this.chunkSize, startY, startZ);
    const pxKey = this.chunkKey(endX, startY, startZ);
    const nyKey = this.chunkKey(startX, startY - this.chunkSize, startZ);
    const pyKey = this.chunkKey(startX, endY, startZ);
    const nzKey = this.chunkKey(startX, startY, startZ - this.chunkSize);
    const pzKey = this.chunkKey(startX, startY, endZ);
    
    const nx = this.loadedChunks.get(nxKey);
    const px = this.loadedChunks.get(pxKey);
    const ny = this.loadedChunks.get(nyKey);
    const py = this.loadedChunks.get(pyKey);
    const nz = this.loadedChunks.get(nzKey);
    const pz = this.loadedChunks.get(pzKey);
    
    return {
      negX: nx?.borders.posX,
      posX: px?.borders.negX,
      negY: ny?.borders.posY,
      posY: py?.borders.negY,
      negZ: nz?.borders.posZ,
      posZ: pz?.borders.negZ
    };
  }

  /** Loaded neighbors in LightEngine order: -X, +X, -Y, +Y, -Z, +Z. */
  private neighborChunks(sx: number, sy: number, sz: number): Array<LoadedChunk | null> {
    const s = this.chunkSize;
    return [
      [sx - s, sy, sz], [sx + s, sy, sz],
      [sx, sy - s, sz], [sx, sy + s, sz],
      [sx, sy, sz - s], [sx, sy, sz + s]
    ].map(([x, y, z]) => this.loadedChunks.get(this.chunkKey(x, y, z)) ?? null);
  }

  /**
   * New chunks are lit as if open to the sky (terrain above the surface is mostly air), so
   * they look right on arrival; stitching corrects columns a chunk above actually blocks.
   * Deep chunks stay dark until real light reaches them.
   */
  private presumesSky(startY: number): boolean {
    return startY + this.chunkSize >= this.openSkyMinY;
  }

  /** Queues remeshing for already-meshed chunks whose lighting changed. */
  private queueLightRebuilds(): void {
    for (const lightChunk of this.light.dirty) {
      const chunk = lightChunk as LoadedChunk;
      if (!chunk.hasAnimated || this.loadedChunks.get(chunk.key) !== chunk) continue;
      if (this.rebuildSet.has(chunk.key)) continue;
      this.rebuildSet.add(chunk.key);
      this.rebuildQueue.push(chunk.key);
    }
    this.light.dirty.clear();
  }

  private checkAndQueueMeshing(chunkKey: string): void {
    const chunk = this.loadedChunks.get(chunkKey);
    if (!chunk || this.rebuildSet.has(chunkKey)) return; // Already queued
    
    // If it hasn't been meshed for the first time yet, wait for anticipated neighbors to avoid double-draws
    if (!chunk.hasAnimated) {
      const [sx, sy, sz] = this.decodeKey(chunkKey);
      const endX = sx + this.chunkSize;
      const endY = sy + this.chunkSize;
      const endZ = sz + this.chunkSize;
      
      // Check if any expected neighbor is missing
      for (const nk of [
        this.chunkKey(sx - this.chunkSize, sy, sz), this.chunkKey(endX, sy, sz),
        this.chunkKey(sx, sy - this.chunkSize, sz), this.chunkKey(sx, endY, sz),
        this.chunkKey(sx, sy, sz - this.chunkSize), this.chunkKey(sx, sy, endZ),
      ]) {
        // If the neighbor is within our desired boundaries but hasn't loaded its terrain data yet, we wait.
        if (this.isDesiredNumeric(nk) && !this.loadedChunks.has(nk)) {
          return; 
        }
      }
    }
    
    // Either all anticipated neighbors are fully generated! Or the chunk already has a mesh and needs to update borders!
    this.rebuildSet.add(chunkKey);
    this.rebuildQueue.push(chunkKey);
  }

  // ─── Occlusion Culling ────────────────────────────────────────────────────

  /** Shows the wireframe outline at the given block grid position. */
  public setBlockOutline(bx: number, by: number, bz: number, isBreaking: boolean = false): void {
    this.blockOutline.position.set(bx + 0.5, by + 0.5, bz + 0.5);
    this.blockOutline.visible = true;
    this.blockEdge.position.set(bx + 0.5, by + 0.5, bz + 0.5);
    this.blockEdge.visible = true;

    // Use black/dark gray for both states as requested (the red was confusing)
    this.blockOutlineMat.color.set(0x000000);
    this.blockEdgeMat.color.set(0x000000);

    if (isBreaking) {
      this.blockOutlineMat.opacity = 0.5; // Start at 0.5 for breaking
      this.blockEdgeMat.opacity = 0.9;
    } else {
      this.blockOutlineMat.opacity = 0.12; // Start at low for normal
      this.blockEdgeMat.opacity = 0.8;
    }
  }

  /** Hides the block highlight. */
  public clearBlockOutline(): void {
    this.blockOutline.visible = false;
    this.blockEdge.visible    = false;
  }

  /** Called by Player when switching between debug/survival modes. */
  public setDebugMode(debug: boolean): void {
    this.isDebugMode = debug;
    if (debug) {
      // Immediately reveal all chunks when entering debug mode
      for (const chunk of this.loadedChunks.values()) {
        if (chunk.opaqueMesh) chunk.opaqueMesh.visible = true;
        if (chunk.waterMesh)  chunk.waterMesh.visible  = true;
      }
    } else {
      // Force immediate occlusion pass when switching to survival
      this.occlusionDirty = true;
    }
  }

  /** Returns true if every block in a border slice is opaque solid. */
  private isBorderSolid(border: Int8Array | undefined): boolean {
    if (!border) return false; // neighbour not loaded = unknown, treat as open
    for (let i = 0; i < border.length; i++) {
      if (!blockRegistry.isOpaque(border[i])) return false;
    }
    return true;
  }

  /**
   * A chunk is "enclosed" when ALL 6 neighbouring chunks have a fully solid
   * face pressed against it — meaning no light (or player view) can enter.
   *
   * The key fix: we must look at the NEIGHBOUR's border slice that faces THIS
   * chunk, not this chunk's own borders.
   *   - negX neighbour's posX face seals our left side
   *   - posX neighbour's negX face seals our right side
   *   - etc.
   */
  private isChunkEnclosed(chunk: LoadedChunk): boolean {
    const { startX, startY, startZ } = chunk.data;
    const s = this.chunkSize;

    const nxChunk = this.loadedChunks.get(this.chunkKey(startX - s, startY, startZ));
    const pxChunk = this.loadedChunks.get(this.chunkKey(startX + s, startY, startZ));
    const nyChunk = this.loadedChunks.get(this.chunkKey(startX, startY - s, startZ));
    const pyChunk = this.loadedChunks.get(this.chunkKey(startX, startY + s, startZ));
    const nzChunk = this.loadedChunks.get(this.chunkKey(startX, startY, startZ - s));
    const pzChunk = this.loadedChunks.get(this.chunkKey(startX, startY, startZ + s));

    // Each neighbour's face that touches this chunk must be fully solid.
    // If a neighbour is not loaded we cannot confirm the seal → not enclosed.
    return (
      this.isBorderSolid(nxChunk?.borders.posX) &&
      this.isBorderSolid(pxChunk?.borders.negX) &&
      this.isBorderSolid(nyChunk?.borders.posY) &&
      this.isBorderSolid(pyChunk?.borders.negY) &&
      this.isBorderSolid(nzChunk?.borders.posZ) &&
      this.isBorderSolid(pzChunk?.borders.negZ)
    );
  }

  /**
   * Hides meshes of fully-enclosed chunks.
   * Skipped entirely in debug mode (player can fly through solid walls).
   * The chunk the camera is currently inside is always kept visible.
   */
  private updateOcclusion(): void {
    if (this.isDebugMode) return;

    const camX = this.camera.position.x;
    const camY = this.camera.position.y;
    const camZ = this.camera.position.z;

    for (const chunk of this.loadedChunks.values()) {
      if (!chunk.opaqueMesh && !chunk.waterMesh) continue;

      let visible = true;

      if (this.isChunkEnclosed(chunk)) {
        const { startX, endX, startY, endY, startZ, endZ } = chunk.data;
        const s = this.chunkSize;
        // Keep visible if camera is inside OR directly adjacent (within 1 chunk margin)
        // so looking down holes or caves never causes chunks underneath to be invisible
        const cameraNear =
          camX >= (startX - s) && camX < (endX + s) &&
          camY >= (startY - s) && camY < (endY + s) &&
          camZ >= (startZ - s) && camZ < (endZ + s);
        visible = cameraNear;
      }

      if (chunk.opaqueMesh) chunk.opaqueMesh.visible = visible;
      if (chunk.waterMesh)  chunk.waterMesh.visible  = visible;
    }
  }

  private chunkKey(startX: number, startY: number, startZ: number): string {
    return `${startX}_${startY}_${startZ}`;
  }

  private decodeKey(key: string): [number, number, number] {
    const parts = key.split('_');
    return [parseInt(parts[0], 10), parseInt(parts[1], 10), parseInt(parts[2], 10)];
  }

  private keyForBlock(bx: number, by: number, bz: number): string {
    return this.chunkKey(
      Math.floor(bx / this.chunkSize) * this.chunkSize, 
      Math.floor(by / this.chunkSize) * this.chunkSize, 
      Math.floor(bz / this.chunkSize) * this.chunkSize
    );
  }

  private keyDistanceNumeric(key: string, cx: number, cy: number, cz: number): number {
    const [startX, startY, startZ] = this.decodeKey(key);
    const kx = Math.floor(startX / this.chunkSize);
    const ky = Math.floor(startY / this.chunkSize);
    const kz = Math.floor(startZ / this.chunkSize);
    return (kx - cx) ** 2 + (ky - cy) ** 2 + (kz - cz) ** 2;
  }

  private isDesiredNumeric(key: string, margin = 1.0): boolean {
    const [startX, startY, startZ] = this.decodeKey(key);
    const kx = Math.floor(startX / this.chunkSize);
    const ky = Math.floor(startY / this.chunkSize);
    const kz = Math.floor(startZ / this.chunkSize);
    
    // Outside valid world height (-512 to 144)
    if (ky < -32 || ky > 8) return false;

    const dx = kx - this.lastPlayerChunkX;
    const dy = ky - this.lastPlayerChunkY;
    const dz = kz - this.lastPlayerChunkZ;
    
    // Outside horizontal bounds
    if (dx * dx + dz * dz > (this.renderDistance * margin) ** 2) return false;
    
    // Check our two rules: Surface Pinning (ky 0..7 when near surface) or Dynamic Vertical Distance
    const isSurfacePined = this.lastPlayerChunkY >= -2 && ky >= 0 && ky <= 7;
    const isVerticalDesired = Math.abs(dy) <= (this.verticalRenderDistance * margin);
    
    return isSurfacePined || isVerticalDesired;
  }
}