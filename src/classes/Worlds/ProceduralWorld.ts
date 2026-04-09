import { 
  Group, 
  Vector3, 
  Mesh, 
  BufferGeometry, 
  BufferAttribute, 
  ShaderMaterial, 
  PerspectiveCamera, 
  BoxGeometry, 
  EdgesGeometry, 
  LineSegments,
  LineBasicMaterial,
  WebGLRenderer,
  Scene,
  Color
} from 'three';
import { SimplexNoise } from 'three/examples/jsm/Addons.js';
import ChunkData from '../Chunk/ChunkData';
import ChunkGeometry from '../Chunk/ChunkGeometry';
import WorkerPool from './WorkerPool';
import Sky from '../Sky';
import { 
  WorldType, 
  WorldParams, 
  ChunkDataResult, 
  WorkerResponse, 
  BlocksMap, 
  GeometryData, 
  WorldConfig, 
  ChunkBorders 
} from '../../types';
import RNG from '../../utils/rng';

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
  private readonly renderDistance: number;
  private readonly camera: PerspectiveCamera;
  private readonly simplex: SimplexNoise;
  private readonly pool: WorkerPool;
  private readonly rebuildPool: WorkerPool;

  // ─── Chunk state ──────────────────────────────────────────────────────────
  private readonly loadedChunks      = new Map<number, LoadedChunk>();
  private readonly pendingChunks     = new Set<number>();

  // ─── Queues ───────────────────────────────────────────────────────────────
  private readonly meshQueue: WorkerResponse[] = [];
  private readonly rebuildMeshQueue: WorkerResponse[] = [];
  private readonly rebuildQueue: number[] = [];
  private readonly rebuildSet           = new Set<number>();
  private readonly pendingRebuildChunks = new Set<number>();

  private readonly opaqueMaterial: ShaderMaterial;
  private readonly waterMaterial: ShaderMaterial;
  private wireframeEnabled = false;
  private readonly sky: Sky;

  // Hot Cache for collision optimization
  private lastChunk: LoadedChunk | null = null;
  private lastChunkKey: number | null   = null;

  private lastPlayerChunkX = Infinity;
  private lastPlayerChunkZ = Infinity;
  private lastUpdatePos    = new Vector3();
  private elapsedTime      = 0;

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
    this.chunkHeight    = config.chunkHeight;
    this.renderDistance = config.renderDistance;
    this.camera         = config.camera;

    const rng = new RNG(this.params.seed);
    this.simplex = new SimplexNoise(rng);

    const cores          = navigator.hardwareConcurrency;
    const mainWorkers    = Math.max(1, Math.floor(cores * 0.75));
    const rebuildWorkers = Math.max(1, cores - mainWorkers);
    this.pool        = new WorkerPool(mainWorkers);
    this.rebuildPool = new WorkerPool(rebuildWorkers);

    this.opaqueMaterial = new ShaderMaterial({
      uniforms: {
        uTime:           { value: 0 },
        uSkyColor:       { value: new Color(0x87CEEB) },
        uSunDirection:   { value: new Vector3(1, 1, 1).normalize() },
        uShadersEnabled: { value: 1.0 },
      },
      vertexShader: `
        attribute float creationTime;
        varying vec3 vNormal;
        varying vec3 vColor;
        varying vec2 vUv;
        varying vec3 vWorldPos;
        varying float vCreationTime;
        uniform float uTime;

        void main() {
          vNormal = normal;
          vColor = color;
          vUv = uv;
          vWorldPos = (modelMatrix * vec4(position, 1.0)).xyz;
          vCreationTime = creationTime;

          vec3 pos = position;
          float age = uTime - creationTime;
          float rise = smoothstep(0.0, 1.5, age);
          pos.y *= rise;
          pos.y -= (1.0 - rise) * 20.0;

          gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
        }
      `,
      fragmentShader: `
        uniform vec3 uSkyColor;
        uniform vec3 uSunDirection;
        uniform float uShadersEnabled;
        varying vec3 vNormal;
        varying vec3 vColor;
        varying vec3 vWorldPos;

        void main() {
          if (uShadersEnabled < 0.5) {
            gl_FragColor = vec4(vColor, 1.0);
            return;
          }

          vec3 sunDir = normalize(uSunDirection);
          float diffuse = max(dot(vNormal, sunDir), 0.0);
          float ambient = 0.4;
          
          vec3 lighting = vColor * (diffuse + ambient);
          float dist = length(vWorldPos - cameraPosition);
          float fog = smoothstep(128.0, 256.0, dist);
          
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
      },
      vertexShader: `
        attribute float creationTime;
        varying vec3 vNormal;
        varying vec3 vColor;
        varying vec3 vWorldPos;
        uniform float uTime;

        void main() {
          vNormal = normal;
          vColor = color;
          
          vec3 pos = position;
          pos.y += sin(uTime * 2.0 + position.x * 0.5) * 0.1;
          pos.y += cos(uTime * 1.5 + position.z * 0.5) * 0.1;
          
          vWorldPos = (modelMatrix * vec4(pos, 1.0)).xyz;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
        }
      `,
      fragmentShader: `
        uniform vec3 uSkyColor;
        varying vec3 vColor;
        varying vec3 vWorldPos;

        void main() {
          float dist = length(vWorldPos - cameraPosition);
          float fog = smoothstep(128.0, 256.0, dist);
          
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

  public setTime(phase: string): void {
    this.sky.setTime(phase);
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
        mat.uniforms.uSkyColor.value.copy(this.sky.ambient.color);
        mat.uniforms.uSunDirection.value.copy(this.sky.directional.position).normalize();
        if (this.sky.worldType === WorldType.Lunar || this.sky.worldType === WorldType.Jupyter) {
            mat.uniforms.uShadersEnabled.value = 1.0;
        }
    });

    this.sky.tick(this.camera);
    this.elapsedTime += 0.016; // Stable, monotonic clock (60 FPS assumed for animations)

    if (this.camera.position.distanceToSquared(this.lastUpdatePos) > 16) {
        this.updateChunks(false);
        this.lastUpdatePos.copy(this.camera.position);
    }

    // Time budget to prevent main thread stutters (max ~8ms per frame for geometry processing)
    const tickStart = performance.now();
    const timeLimit = 8.0;

    // 1. Prioritize rebuilds
    while (this.rebuildMeshQueue.length > 0 && (performance.now() - tickStart) < timeLimit) {
      const nextRebuild = this.rebuildMeshQueue.shift();
      if (nextRebuild && this.loadedChunks.has(nextRebuild.chunkKey)) {
        this.applyChunkData(nextRebuild, this.elapsedTime - 2.0);
      }
    }

    // 2. Process new chunks
    while (this.meshQueue.length > 0 && (performance.now() - tickStart) < timeLimit) {
      const next = this.meshQueue.shift();
      if (next) {
        // Slightly more relaxed range check for mesh queue to avoid flickers
        if (this.isDesiredNumeric(next.chunkKey, 1.5)) {
          this.applyChunkData(next, this.elapsedTime);
          this.queueNeighbourRebuilds(next.chunkKey);
        }
      }
    }

    const toRebuild = this.rebuildQueue.shift();
    if (toRebuild !== undefined) {
      this.rebuildSet.delete(toRebuild);
      const chunk = this.loadedChunks.get(toRebuild);
      if (chunk) this.asyncRebuild(toRebuild, chunk);
    }
  }

  private applyChunkData(response: WorkerResponse, uTime: number): void {
    let chunk = this.loadedChunks.get(response.chunkKey);
    if (chunk) {
        this.destroyChunkMeshes(chunk);
    } else {
        chunk = {
            data: response.chunkData,
            borders: response.borders,
            opaqueMesh: null,
            waterMesh: null
        };
        this.loadedChunks.set(response.chunkKey, chunk);
    }

    chunk.borders = response.borders;

    if (response.opaque.positions.length > 3) {
        chunk.opaqueMesh = this.buildSingleMesh(response.opaque, uTime, this.opaqueMaterial);
        this.add(chunk.opaqueMesh);
    }
    if (response.water.positions.length > 3) {
        chunk.waterMesh = this.buildSingleMesh(response.water, uTime, this.waterMaterial);
        this.add(chunk.waterMesh);
    }
  }

  private buildSingleMesh(data: GeometryData, creationTime: number, material: ShaderMaterial): Mesh {
    const geometry = new BufferGeometry();
    geometry.setAttribute('position',     new BufferAttribute(data.positions, 3));
    geometry.setAttribute('normal',       new BufferAttribute(data.normals,   3));
    geometry.setAttribute('color',        new BufferAttribute(data.colors,    3));
    
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
    const key = this.keyForBlock(bx, bz);
    const chunk = this.loadedChunks.get(key);
    if (!chunk) return;
    delete chunk.data.blocks[`${bx}.${by}.${bz}`];
    this.asyncRebuild(key, chunk);
    this.rebuildAdjacentChunks(bx, bz, chunk.data);
  }

  getBlock(bx: number, by: number, bz: number): { type: number; position: { x: number; y: number; z: number } } | null {
    const key = this.keyForBlock(bx, bz);
    let chunk: LoadedChunk | undefined;
    if (key === this.lastChunkKey && this.lastChunk) { chunk = this.lastChunk; }
    else { chunk = this.loadedChunks.get(key); if (chunk) { this.lastChunk = chunk; this.lastChunkKey = key; } }
    return chunk?.data.blocks[`${bx}.${by}.${bz}`] ?? null;
  }
  isBlockSolid(bx: number, by: number, bz: number): boolean { return this.getBlock(bx, by, bz) !== null; }

  private updateChunks(force: boolean): void {
    const cx = Math.floor(this.camera.position.x / this.chunkSize);
    const cz = Math.floor(this.camera.position.z / this.chunkSize);
    if (!force && cx === this.lastPlayerChunkX && cz === this.lastPlayerChunkZ) return;
    this.lastPlayerChunkX = cx; this.lastPlayerChunkZ = cz;
    const desired = new Set<number>();
    const radiusSq = this.renderDistance * this.renderDistance;
    for (let dx = -this.renderDistance; dx <= this.renderDistance; dx++) {
      for (let dz = -this.renderDistance; dz <= this.renderDistance; dz++) {
        if (dx * dx + dz * dz > radiusSq) continue;
        desired.add(this.chunkKey((cx + dx) * this.chunkSize, (cz + dz) * this.chunkSize));
      }
    }
    const toUnload: number[] = [];
    for (const key of this.loadedChunks.keys()) {
      if (!desired.has(key)) toUnload.push(key);
    }
    for (const key of toUnload) this.unloadChunk(key);
    for (const key of Array.from(this.pendingChunks)) {
      if (!desired.has(key)) { this.pool.cancel(key); this.pendingChunks.delete(key); }
    }
    const toRequest = Array.from(desired)
      .filter(k => !this.loadedChunks.has(k) && !this.pendingChunks.has(k))
      .sort((a, b) => this.keyDistanceNumeric(a, cx, cz) - this.keyDistanceNumeric(b, cx, cz));
    toRequest.forEach(k => this.requestChunk(k));
  }

  private requestChunk(key: number): void {
    this.pendingChunks.add(key);
    const [startX, startZ] = this.decodeKey(key);
    this.pool.dispatch(
      {
        chunkKey: key, size: this.chunkSize, height: this.chunkHeight,
        startX, endX: startX + this.chunkSize, startZ, endZ: startZ + this.chunkSize,
        worldParams: this.params, neighbourBorderBlocks: this.getNeighbourBorderBlocks(startX, startZ),
      },
      (response) => this.onChunkReady(response),
    );
  }

  private onChunkReady(response: WorkerResponse): void {
    this.pendingChunks.delete(response.chunkKey);
    if (this.isDesiredNumeric(response.chunkKey)) this.meshQueue.push(response);
  }

  private unloadChunk(key: number): void {
    const chunk = this.loadedChunks.get(key);
    if (chunk) {
        this.destroyChunkMeshes(chunk);
        this.loadedChunks.delete(key);
    }
    if (this.lastChunkKey === key) { this.lastChunk = null; this.lastChunkKey = null; }
  }

  private asyncRebuild(key: number, chunk: LoadedChunk): void {
    if (this.pendingRebuildChunks.has(key)) return;
    this.pendingRebuildChunks.add(key);
    const [sx, sz] = this.decodeKey(key);
    this.rebuildPool.dispatch(
      {
        chunkKey: key, size: this.chunkSize, height: this.chunkHeight,
        startX: sx, endX: sx + this.chunkSize, startZ: sz, endZ: sz + this.chunkSize,
        worldParams: this.params, neighbourBorderBlocks: this.getNeighbourBorderBlocks(sx, sz),
        existingBlocks: chunk.data.blocks,
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

  private rebuildAdjacentChunks(bx: number, bz: number, data: ChunkDataResult): void {
    const offsets: Array<[number, number]> = [];
    if (bx === data.startX) offsets.push([-this.chunkSize, 0]);
    if (bx === data.endX - 1) offsets.push([this.chunkSize, 0]);
    if (bz === data.startZ) offsets.push([0, -this.chunkSize]);
    if (bz === data.endZ - 1) offsets.push([0, this.chunkSize]);
    for (const [dx, dz] of offsets) {
      const adjKey = this.keyForBlock(bx + dx, bz + dz);
      const adjChunk = this.loadedChunks.get(adjKey);
      if (adjChunk) this.asyncRebuild(adjKey, adjChunk);
    }
  }

  private getNeighbourBorderBlocks(startX: number, startZ: number): BlocksMap {
    const endX = startX + this.chunkSize;
    const endZ = startZ + this.chunkSize;
    const result: BlocksMap = {};
    const nxKey = this.chunkKey(startX - this.chunkSize, startZ);
    const pxKey = this.chunkKey(endX, startZ);
    const nzKey = this.chunkKey(startX, startZ - this.chunkSize);
    const pzKey = this.chunkKey(startX, endZ);
    const nx = this.loadedChunks.get(nxKey); if (nx) Object.assign(result, nx.borders.posX);
    const px = this.loadedChunks.get(pxKey); if (px) Object.assign(result, px.borders.negX);
    const nz = this.loadedChunks.get(nzKey); if (nz) Object.assign(result, nz.borders.posZ);
    const pz = this.loadedChunks.get(pzKey); if (pz) Object.assign(result, pz.borders.negZ);
    return result;
  }

  private queueNeighbourRebuilds(chunkKey: number): void {
    const [sx, sz] = this.decodeKey(chunkKey);
    const endX = sx + this.chunkSize;
    const endZ = sz + this.chunkSize;
    for (const k of [
      this.chunkKey(sx - this.chunkSize, sz), this.chunkKey(endX, sz),
      this.chunkKey(sx, sz - this.chunkSize), this.chunkKey(sx, endZ),
    ]) {
      if (this.loadedChunks.has(k) && !this.rebuildSet.has(k)) {
        this.rebuildSet.add(k); this.rebuildQueue.push(k);
      }
    }
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

  private chunkKey(startX: number, startZ: number): number {
    const kx = (startX / this.chunkSize) + 32768;
    const kz = (startZ / this.chunkSize) + 32768;
    return (kx * 65536) + kz;
  }

  private decodeKey(key: number): [number, number] {
    const kx = Math.floor(key / 65536) - 32768;
    const kz = (key % 65536) - 32768;
    return [kx * this.chunkSize, kz * this.chunkSize];
  }


  private keyForBlock(bx: number, bz: number): number {
    return this.chunkKey(Math.floor(bx / this.chunkSize) * this.chunkSize, Math.floor(bz / this.chunkSize) * this.chunkSize);
  }

  private keyDistanceNumeric(key: number, cx: number, cz: number): number {
    const [startX, startZ] = this.decodeKey(key);
    const kx = Math.floor(startX / this.chunkSize);
    const kz = Math.floor(startZ / this.chunkSize);
    return (kx - cx) ** 2 + (kz - cz) ** 2;
  }

  private isDesiredNumeric(key: number, margin = 1.0): boolean {
    const [startX, startZ] = this.decodeKey(key);
    const kx = Math.floor(startX / this.chunkSize);
    const kz = Math.floor(startZ / this.chunkSize);
    const dx = kx - this.lastPlayerChunkX;
    const dz = kz - this.lastPlayerChunkZ;
    return dx * dx + dz * dz <= (this.renderDistance * margin) ** 2;
  }
}