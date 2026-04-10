import { 
  Group, 
  Vector3, 
  Mesh, 
  BufferGeometry, 
  BufferAttribute, 
  ShaderMaterial, 
  PerspectiveCamera, 
  WebGLRenderer,
  Scene,
  Color
} from 'three';
import { SimplexNoise } from 'three/examples/jsm/Addons.js';
import WorkerPool from './WorkerPool';
import Sky from '../Sky';
import { 
  WorldType, 
  WorldParams, 
  ChunkDataResult, 
  WorkerResponse, 
  GeometryData, 
  WorldConfig, 
  ChunkBorders 
} from '../../types';
import RNG from '../../utils/rng';
import { EntityManager } from '../Entities/EntityManager';
import { Animal } from '../Entities/Animal';
import { Sheep } from '../Entities/Sheep';
import { Cow } from '../Entities/Cow';
import { Pig } from '../Entities/Pig';
import { Chicken } from '../Entities/Chicken';

interface LoadedChunk {
  /** Block data kept in memory so destroyed blocks can be applied and the mesh rebuilt. */
  data: ChunkDataResult;
  /** Pre-computed border slices for O(1) neighbour-border lookup. */
  borders: ChunkBorders;
  /** Individual Three.js meshes for this chunk. */
  opaqueMesh: Mesh | null;
  waterMesh: Mesh | null;
}

export default class ProceduralWorld extends Group {
  private readonly chunkSize: number;
  private chunkHeight: number;
  private renderDistance: number;
  private verticalRenderDistance: number;
  private readonly camera: PerspectiveCamera;
  private readonly simplex: SimplexNoise;
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

  private readonly opaqueMaterial: ShaderMaterial;
  private readonly waterMaterial: ShaderMaterial;
  private wireframeEnabled = false;
  private readonly sky: Sky;

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
  private readonly entityManager: EntityManager;

  readonly params: WorldParams = {
    seed: Math.floor(Math.random() * 100_000),
    worldType: WorldType.Standard,
    terrain: {
      scale:       64,
      magnitude:   0.7,
      offset:      0.4,
      octaves:     4,
      persistence: 0.5,
    },
  };

  constructor(config: WorldConfig & { camera: PerspectiveCamera }) {
    super();

    this.chunkSize      = config.chunkSize;
    this.chunkHeight    = config.chunkHeight; // Kept for backwards compatibility but not used for mesh height
    this.renderDistance = config.renderDistance;
    this.verticalRenderDistance = config.verticalRenderDistance;
    this.camera         = config.camera;

    const rng = new RNG(this.params.seed);
    this.simplex = new SimplexNoise(rng);

    const cores = navigator.hardwareConcurrency || 4;
    const workerCount = Math.max(2, cores - 1);
    this.pool = new WorkerPool(workerCount);
    // Reuse the same pool for rebuilds to allow 100% core utilization for the intensive meshing step
    this.rebuildPool = this.pool;
    
    this.entityManager = new EntityManager(this);

    this.opaqueMaterial = new ShaderMaterial({
      uniforms: {
        uTime:           { value: 0 },
        uSkyColor:       { value: new Color(0x87CEEB) },
        uSunDirection:   { value: new Vector3(1, 1, 1).normalize() },
        uShadersEnabled: { value: 1.0 },
        uFogNear:        { value: 128.0 },
        uFogFar:         { value: 256.0 },
      },
      vertexShader: `
        attribute float creationTime;
        attribute float ao;
        varying vec3 vNormal;
        varying vec3 vColor;
        varying vec2 vUv;
        varying vec3 vWorldPos;
        varying float vCreationTime;
        varying float vAo;
        uniform float uTime;
        void main() {
          vNormal = normal;
          vColor = color;
          vUv = uv;
          vWorldPos = (modelMatrix * vec4(position, 1.0)).xyz;
          vCreationTime = creationTime;
          vAo = ao;

          vec3 pos = position;
          if (pos.y >= 0.0) {
              float age = uTime - creationTime;
              float rise = smoothstep(0.0, 1.5, age);
              pos.y *= rise;
              pos.y -= (1.0 - rise) * 20.0;
          }

          gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
        }
      `,
      fragmentShader: `
        uniform vec3 uSkyColor;
        uniform vec3 uSunDirection;
        uniform float uShadersEnabled;
        uniform float uFogNear;
        uniform float uFogFar;
        varying vec3 vNormal;
        varying vec3 vColor;
        varying vec3 vWorldPos;
        varying float vAo;

        void main() {
          float aoMultiplier = 0.2 + 0.8 * vAo;
          if (uShadersEnabled < 0.5) {
            gl_FragColor = vec4(vColor * aoMultiplier, 1.0);
            return;
          }

          vec3 sunDir = normalize(uSunDirection);
          float diffuse = max(dot(vNormal, sunDir), 0.0);
          float ambient = 0.4;
          
          vec3 lighting = vColor * (diffuse + ambient) * aoMultiplier;
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
      },
      vertexShader: `
        attribute float creationTime;
        attribute float ao;
        varying vec3 vNormal;
        varying vec3 vColor;
        varying vec3 vWorldPos;
        varying float vAo;
        uniform float uTime;

        void main() {
          vNormal = normal;
          vColor = color;
          vAo = ao;
          
          vec3 pos = position;
          vWorldPos = (modelMatrix * vec4(pos, 1.0)).xyz;
          
          // Use world coordinates so waves align across chunk borders
          pos.y += sin(uTime * 2.0 + vWorldPos.x * 0.5) * 0.1;
          pos.y += cos(uTime * 1.5 + vWorldPos.z * 0.5) * 0.1;

          if (position.y >= 0.0) {
              float age = uTime - creationTime;
              float rise = smoothstep(0.0, 1.5, age);
              pos.y *= rise;
              pos.y -= (1.0 - rise) * 20.0;
          }
          
          gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
        }
      `,
      fragmentShader: `
        uniform vec3 uSkyColor;
        uniform float uFogNear;
        uniform float uFogFar;
        varying vec3 vColor;
        varying vec3 vWorldPos;

        void main() {
          float dist = length(vWorldPos - cameraPosition);
          float fog = smoothstep(uFogNear, uFogFar, dist);
          
          vec3 waterBase = mix(vColor, vec3(0.0, 0.4, 0.8), 0.3);
          gl_FragColor = vec4(mix(waterBase, uSkyColor, fog), 0.7);
        }
      `,
      vertexColors: true,
      transparent: true,
      depthWrite: false,
    });

    this.sky = new Sky();
    this.add(this.sky);
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
        if (this.sky.worldType === WorldType.Mercury) {
            color = new Color(0x330500); // Dark red/orange for lava
        } else {
            color = new Color(0x001133); // Normal underwater blue
        }
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

  public locateBiome(name: string): { x: number; z: number } | null {
    const px = Math.floor(this.camera.position.x);
    const pz = Math.floor(this.camera.position.z);
    const searchStep = 64;
    const maxSearch  = 20;

    for (let radius = 1; radius < maxSearch; radius++) {
      for (let x = -radius; x <= radius; x++) {
        for (let z = -radius; z <= radius; z++) {
          if (Math.abs(x) !== radius && Math.abs(z) !== radius) continue;
          const tx   = px + x * searchStep;
          const tz   = pz + z * searchStep;
          const temp = this.getTemperatureAt(tx, tz);
          if (name === 'snow'   && temp < -0.3)                     return { x: tx, z: tz };
          if (name === 'desert' && temp >  0.4)                     return { x: tx, z: tz };
          if (name === 'plains' && temp >= -0.3 && temp <= 0.4)     return { x: tx, z: tz };
        }
      }
    }
    return null;
  }

  public reset(newParams?: Partial<WorldParams>): void {
    if (newParams) {
        if (newParams.seed !== undefined) this.params.seed = newParams.seed;
        if (newParams.worldType !== undefined) this.params.worldType = newParams.worldType;
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
    this.lastChunk = null;
    this.lastChunkKey = null;
    this.lastPlayerChunkX = Infinity;
    this.lastPlayerChunkY = Infinity;
    this.lastPlayerChunkZ = Infinity;
    this.elapsedTime      = 0;
    this.sky.setWorldType(this.params.worldType);
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

  tick(): void {
    [this.opaqueMaterial, this.waterMaterial].forEach(mat => {
        mat.uniforms.uTime.value = this.elapsedTime;
        if (!this.isUnderwater) {
          mat.uniforms.uSkyColor.value.copy(this.sky.ambient.color);
        }
        mat.uniforms.uSunDirection.value.copy(this.sky.directional.position).normalize();
        if (this.sky.worldType === WorldType.Lunar || this.sky.worldType === WorldType.Mercury) {
            mat.uniforms.uShadersEnabled.value = 1.0;
        }
    });

    if (!this.isTimePaused) {
        this.sky.tick(this.camera);
        this.elapsedTime += 0.016; // Stable, monotonic clock (60 FPS assumed for animations)
        // 3. Update Entities
        this.entityManager.update(16); // ~60fps assumption for now
    }

    if (this.camera.position.distanceToSquared(this.lastUpdatePos) > 16) {
        this.updateChunks(false);
        this.lastUpdatePos.copy(this.camera.position);
    }

    // Time budget to prevent main thread stutters (max ~8ms per frame for geometry processing)
    const tickStart = performance.now();
    const timeLimit = 8.0;

    // 1. Process chunk meshes (from async rebuilds)
    while (this.rebuildMeshQueue.length > 0 && (performance.now() - tickStart) < timeLimit) {
      const nextRebuild = this.rebuildMeshQueue.shift();
      if (nextRebuild && this.loadedChunks.has(nextRebuild.chunkKey)) {
        this.applyChunkData(nextRebuild, this.elapsedTime - 2.0);
      }
    }

    // 2. Dispatch meshing rebuilds
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
  }

  private applyChunkData(response: WorkerResponse, uTime: number): void {
    let chunk = this.loadedChunks.get(response.chunkKey);
    
    if (!chunk) {
        chunk = {
            data: response.chunkData,
            borders: response.borders,
            opaqueMesh: null,
            waterMesh: null
        };
        this.loadedChunks.set(response.chunkKey, chunk);
    } else {
        // Update data and borders (handles rebuilds and meshQueue updates)
        chunk.data = response.chunkData;
        chunk.borders = response.borders;
        this.destroyChunkMeshes(chunk);
    }

    if (response.opaque && response.opaque.positions.length > 3) {
        chunk.opaqueMesh = this.buildSingleMesh(response.opaque, uTime, this.opaqueMaterial);
        this.add(chunk.opaqueMesh);
    }
    if (response.water && response.water.positions.length > 3) {
        chunk.waterMesh = this.buildSingleMesh(response.water, uTime, this.waterMaterial);
        this.add(chunk.waterMesh);
    }

    // Try to spawn an animal if this is a newly loaded surface chunk
    if (!response.chunkKey.includes('rebuild')) { // Simple check for first-time load
        this.trySpawnAnimal(response.chunkKey);
    }
  }

  private trySpawnAnimal(key: string): void {
      const [sx, sy, sz] = this.decodeKey(key);
      // Only spawn in surface layers (Y=0 to Y=128)
      if (sy < 0 || sy > 128) return;
      if (Math.random() > 0.05) return; // 5% chance per chunk

      const chunk = this.loadedChunks.get(key);
      if (!chunk) return;

      // Find a suitable surface block (looking from top down)
      for (let lx = 4; lx < this.chunkSize - 4; lx += 4) {
          for (let lz = 4; lz < this.chunkSize - 4; lz += 4) {
              for (let ly = this.chunkSize - 1; ly >= 0; ly--) {
                  const idx = ly * this.chunkSize * this.chunkSize + lz * this.chunkSize + lx;
                  const block = chunk.data.blocks[idx];
                  
                  if (block !== -1 && block !== 5 && block !== 6) { // solid ground
                    const rand = Math.random();
                    let entity: Animal;
                    
                    if (rand < 0.25) {
                        entity = new Sheep(this);
                    } else if (rand < 0.50) {
                        entity = new Cow(this);
                    } else if (rand < 0.75) {
                        entity = new Pig(this);
                    } else {
                        entity = new Chicken(this);
                    }
                    
                    entity.position.set(sx + lx + 0.5, sy + ly + 1.1, sz + lz + 0.5);
                    this.entityManager.add(entity);
                    return; // one animal per chunk max
                  }
              }
          }
      }
  }

  private buildSingleMesh(data: GeometryData, creationTime: number, material: ShaderMaterial): Mesh {
    const geometry = new BufferGeometry();
    geometry.setAttribute('position',     new BufferAttribute(data.positions, 3));
    geometry.setAttribute('normal',       new BufferAttribute(data.normals,   3));
    geometry.setAttribute('color',        new BufferAttribute(data.colors,    3));
    geometry.setAttribute('ao',           new BufferAttribute(data.ao,        1));
    
    // Reuse the transferred buffer to avoid allocations on the main thread
    data.creationTime.fill(creationTime);
    geometry.setAttribute('creationTime', new BufferAttribute(data.creationTime, 1));
    
    geometry.setIndex(new BufferAttribute(data.vertices, 1));
    return new Mesh(geometry, material);
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
        if (chunk.opaqueMesh) meshes.push(chunk.opaqueMesh);
        if (chunk.waterMesh) meshes.push(chunk.waterMesh);
    }
    return meshes;
  }

  destroyBlock(point: Vector3, normal: Vector3): void {
    const bx = Math.floor(point.x - normal.x * 0.001);
    const by = Math.floor(point.y - normal.y * 0.001);
    const bz = Math.floor(point.z - normal.z * 0.001);
    const key = this.keyForBlock(bx, by, bz);
    const chunk = this.loadedChunks.get(key);
    if (!chunk) return;
    
    const lx = bx - chunk.data.startX;
    const ly = by - chunk.data.startY;
    const lz = bz - chunk.data.startZ;
    const idx = ly * this.chunkSize * this.chunkSize + lz * this.chunkSize + lx;
    
    chunk.data.blocks[idx] = -1;
    this.asyncRebuild(key, chunk);
    this.rebuildAdjacentChunks(bx, by, bz, chunk.data);
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
      return b !== -1 && b !== 5 && b !== 6; // 5: Empty, 6: Water 
  }

  private updateChunks(force: boolean): void {
    const cx = Math.floor(this.camera.position.x / this.chunkSize);
    const cy = Math.floor(this.camera.position.y / this.chunkSize);
    const cz = Math.floor(this.camera.position.z / this.chunkSize);
    if (!force && cx === this.lastPlayerChunkX && cy === this.lastPlayerChunkY && cz === this.lastPlayerChunkZ) return;
    this.lastPlayerChunkX = cx; this.lastPlayerChunkY = cy; this.lastPlayerChunkZ = cz;
    
    const desired = new Set<string>();
    const radiusSq = this.renderDistance * this.renderDistance;
    
    for (let dx = -this.renderDistance; dx <= this.renderDistance; dx++) {
      for (let dz = -this.renderDistance; dz <= this.renderDistance; dz++) {
        if (dx * dx + dz * dz > radiusSq) continue;
        
        // A) Deep Dynamic Layer (Dynamic Vertical Load from player point)
        for (let dy = -this.verticalRenderDistance; dy <= this.verticalRenderDistance; dy++) {
          desired.add(this.chunkKey((cx + dx) * this.chunkSize, (cy + dy) * this.chunkSize, (cz + dz) * this.chunkSize));
        }
        
        // B) Surface Pinning Layer (Permanent view of terrain up to max depth)
        // 4 chunks from Y=0 to Y=128
        for (let baseCy = 0; baseCy <= 3; baseCy++) {
          desired.add(this.chunkKey((cx + dx) * this.chunkSize, baseCy * this.chunkSize, (cz + dz) * this.chunkSize));
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
        buildMesh: false // We only want terrain data first!
      },
      (response) => this.onChunkReady(response),
    );
  }

  private onChunkReady(response: WorkerResponse): void {
    this.pendingChunks.delete(response.chunkKey);
    if (!this.loadedChunks.has(response.chunkKey)) {
        this.loadedChunks.set(response.chunkKey, {
            data: response.chunkData,
            borders: response.borders,
            opaqueMesh: null,
            waterMesh: null
        });
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
        this.loadedChunks.delete(key);
    }
    if (this.lastChunkKey === key) { this.lastChunk = null; this.lastChunkKey = null; }
  }

  private asyncRebuild(key: string, chunk: LoadedChunk): void {
    if (this.pendingRebuildChunks.has(key)) return;
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
        buildMesh: true // Rebuild jobs explicitly request the mesh
      },
      (response) => this.onRebuildReady(response),
    );
  }

  private onRebuildReady(response: WorkerResponse): void {
    this.pendingRebuildChunks.delete(response.chunkKey);
    if (this.loadedChunks.has(response.chunkKey)) {
      this.rebuildMeshQueue.push(response);
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

  private checkAndQueueMeshing(chunkKey: string): void {
    const chunk = this.loadedChunks.get(chunkKey);
    if (!chunk || this.rebuildSet.has(chunkKey)) return; // Already queued
    
    // If it hasn't been meshed for the first time yet, wait for anticipated neighbors to avoid double-draws
    if (!chunk.opaqueMesh) {
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

  private getTemperatureAt(x: number, z: number): number {
    const { scale, persistence } = this.params.terrain;
    const finalScale = scale * 0.5;
    let value = 0, amplitude = 1, frequency = 1, maxValue = 0;
    for (let i = 0; i < 2; i++) {
        value += this.simplex.noise((x * frequency) / finalScale, (z * frequency) / finalScale) * amplitude;
        maxValue += amplitude; amplitude *= persistence; frequency *= 2;
    }
    return value / maxValue;
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
    
    const dx = kx - this.lastPlayerChunkX;
    const dy = ky - this.lastPlayerChunkY;
    const dz = kz - this.lastPlayerChunkZ;
    
    // Outside horizontal bounds
    if (dx * dx + dz * dz > (this.renderDistance * margin) ** 2) return false;
    
    // Check our two rules: Surface Pinning or Spherical Distance
    const isSurfacePined = ky >= 0 && ky <= 3;
    const isSphericalPined = Math.abs(dy) <= (this.verticalRenderDistance * margin);
    
    return isSurfacePined || isSphericalPined;
  }
}