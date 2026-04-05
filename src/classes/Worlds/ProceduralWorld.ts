import {
  Group,
  Mesh,
  BufferGeometry,
  BufferAttribute,
  Float32BufferAttribute,
  LineSegments,
  EdgesGeometry,
  BoxGeometry,
  LineBasicMaterial,
  WebGLRenderer,
  Scene,
  Vector3,
  PerspectiveCamera,
  ShaderMaterial,
  Color,
} from 'three';
import { SimplexNoise } from 'three/examples/jsm/Addons.js';
import RNG from '../../utils/rng';
import Sky from '../Sky';
import WorkerPool from './WorkerPool';
import ChunkGeometry from '../Chunk/ChunkGeometry';
import { BlocksMap, ChunkDataResult, GeometryData, WorldConfig, WorldParams, WorkerResponse } from '../../types';

/**
 * How many chunks along each axis form one sector.
 * 3×3 = 9 chunks per sector → ~13 draw calls instead of ~113.
 */
const SECTOR_CHUNKS = 3;

/** One-block-wide border slices cached per chunk to avoid O(n) iteration on every rebuild. */
interface ChunkBorders {
  /** Blocks at x === startX (exposed toward the -X neighbour). */
  negX: BlocksMap;
  /** Blocks at x === endX - 1 (exposed toward the +X neighbour). */
  posX: BlocksMap;
  /** Blocks at z === startZ (exposed toward the -Z neighbour). */
  negZ: BlocksMap;
  /** Blocks at z === endZ - 1 (exposed toward the +Z neighbour). */
  posZ: BlocksMap;
}

interface LoadedChunk {
  /** Block data kept in memory so destroyed blocks can be applied and the mesh rebuilt. */
  data: ChunkDataResult;
  /** Pre-computed border slices for O(1) neighbour-border lookup. */
  borders: ChunkBorders;
}

/** Cached raw geometry for one chunk, used when merging into a sector mesh. */
interface ChunkGeoEntry {
  geo: GeometryData;
  /** uTime value at the moment this geometry was produced (drives rise animation per-chunk). */
  creationTime: number;
}

/**
 * Procedural voxel world with streaming chunk loading/unloading.
 *
 * Geometry merging: N×N chunks are combined into a single Mesh (a "sector") so
 * the renderer issues one draw call per sector instead of one per chunk.
 *
 * - Chunks are generated off-thread via a WorkerPool.
 * - Each frame, the world checks if the camera has moved to a new chunk
 *   and loads/unloads chunks accordingly.
 */
export default class ProceduralWorld extends Group {
  private readonly chunkSize: number;
  private readonly chunkHeight: number;
  private readonly renderDistance: number;
  private readonly camera: PerspectiveCamera;
  private readonly simplex: SimplexNoise;

  /** Main pool — used exclusively for new chunk terrain generation. */
  private readonly pool: WorkerPool;
  /** Separate pool for neighbour rebuilds so they never starve new chunk loads. */
  private readonly rebuildPool: WorkerPool;

  // ─── Chunk state ──────────────────────────────────────────────────────────
  private readonly loadedChunks      = new Map<string, LoadedChunk>();
  private readonly pendingChunks     = new Set<string>();
  /** Raw geometry cache per chunk — used when building/rebuilding sector meshes. */
  private readonly chunkGeoCache     = new Map<string, ChunkGeoEntry>();

  // ─── Sector state ─────────────────────────────────────────────────────────
  /** One merged Mesh per sector — the only objects submitted to the GPU for rendering. */
  private readonly sectorMeshes      = new Map<string, Mesh>();
  /** Bounding-box outline per sector, visible only in wireframe mode. */
  private readonly sectorOutlines    = new Map<string, LineSegments>();
  /** Sectors waiting for their mesh to be rebuilt (drained 1 per frame). */
  private readonly pendingSectors    = new Set<string>();

  // ─── Rebuild queues ───────────────────────────────────────────────────────
  /** New chunk geometry results waiting for GPU upload (drained 1 per frame). */
  private readonly meshQueue: WorkerResponse[] = [];
  /** Rebuild geometry results waiting to replace chunk geo cache (drained 1 per frame). */
  private readonly rebuildMeshQueue: WorkerResponse[] = [];
  /** Loaded chunks queued for an async geometry rebuild (FIFO order). */
  private readonly rebuildQueue: string[] = [];
  /** O(1) duplicate check for rebuildQueue. */
  private readonly rebuildSet           = new Set<string>();
  /** Chunks with an async rebuild already in-flight — prevents double-dispatch. */
  private readonly pendingRebuildChunks = new Set<string>();

  private readonly material: ShaderMaterial;
  private readonly outlineMaterial: LineBasicMaterial;
  private wireframeEnabled = false;
  private readonly sky: Sky;

  private lastPlayerChunkX = Infinity;
  private lastPlayerChunkZ = Infinity;

  readonly params: WorldParams = {
    seed: Math.floor(Math.random() * 100_000),
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

    this.material = new ShaderMaterial({
      uniforms: {
        uTime:           { value: 0 },
        uShadersEnabled: { value: 1.0 },
        uSunDirection:   { value: new Vector3(0.5, 1, 0.3).normalize() },
        uSkyColor:       { value: new Color(0x87CEEB) },
        uFogStart:       { value: (config.renderDistance - 1.5) * config.chunkSize },
        uFogEnd:         { value: (config.renderDistance - 0.5) * config.chunkSize },
      },
      vertexShader: `
        attribute float isWater;
        attribute float creationTime;
        varying vec3 vNormal;
        varying vec3 vColor;
        varying vec2 vUv;
        varying float vIsWater;
        varying float vDist;
        uniform float uTime;
        uniform float uShadersEnabled;

        void main() {
          vNormal  = normal;
          vColor   = color;
          vUv      = uv;
          vIsWater = isWater;

          vec3 pos = position;

          // Per-chunk rise animation (creationTime is per-vertex)
          float age         = uTime - creationTime;
          float riseDuration = 1.0;
          float riseOffset  = clamp(1.0 - (age / riseDuration), 0.0, 1.0);
          pos.y -= pow(riseOffset, 2.0) * 20.0;

          if (isWater > 0.5) {
            pos.y -= 0.15;
            if (uShadersEnabled > 0.5) {
              pos.y += sin(uTime * 2.0 + position.x * 1.5 + position.z * 1.5) * 0.12;
            }
          }

          vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
          vDist = -mvPosition.z;
          gl_Position = projectionMatrix * mvPosition;
        }
      `,
      fragmentShader: `
        varying vec3 vNormal;
        varying vec3 vColor;
        varying vec2 vUv;
        varying float vIsWater;
        varying float vDist;
        uniform vec3 uSunDirection;
        uniform vec3 uSkyColor;
        uniform float uFogStart;
        uniform float uFogEnd;
        uniform float uTime;
        uniform float uShadersEnabled;

        void main() {
          vec3 lightDir     = normalize(uSunDirection);
          float sunIntensity = clamp(uSunDirection.y * 2.0, 0.0, 1.0);
          float diffuse     = max(0.0, dot(vNormal, lightDir));
          vec3 ambient      = uSkyColor * 0.35;
          vec3 totalLight   = vColor * diffuse * sunIntensity + vColor * ambient;
          totalLight       += max(0.0, vNormal.y) * 0.1 * uSkyColor;

          vec3 finalColor = totalLight;
          float alpha     = 1.0;

          if (uShadersEnabled > 0.5 && vIsWater > 0.5) {
            float noise  = sin(vUv.x * 20.0 + uTime) * cos(vUv.y * 20.0 + uTime) * 0.1;
            finalColor  += noise;
            finalColor.b += 0.1;
            alpha = 0.8;
          }

          float fogFactor = clamp((vDist - uFogStart) / (uFogEnd - uFogStart), 0.0, 1.0);
          finalColor = mix(finalColor, uSkyColor, fogFactor);
          gl_FragColor = vec4(finalColor, alpha);
        }
      `,
      vertexColors: true,
      transparent:  true,
    });

    this.outlineMaterial = new LineBasicMaterial({ color: 0x00ff88, depthTest: false });

    this.sky = new Sky();
    this.add(this.sky);
    this.updateChunks(true);
  }

  // ─── Public API ────────────────────────────────────────────────────────────

  public toggleShaders(enabled: boolean): void {
    this.material.uniforms.uShadersEnabled.value = enabled ? 1.0 : 0.0;
  }

  /**
   * Toggle wireframe rendering + sector bounding-box outlines.
   * Pass `true`/`false` to force a state, or omit to toggle.
   * Returns the new state.
   */
  public toggleWireframe(force?: boolean): boolean {
    this.wireframeEnabled = force !== undefined ? force : !this.wireframeEnabled;
    this.material.wireframe = this.wireframeEnabled;
    for (const outline of this.sectorOutlines.values()) {
      outline.visible = this.wireframeEnabled;
    }
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

  /**
   * Pre-compiles the chunk shader on the GPU so the first chunk that arrives
   * doesn't trigger a 50–100ms GLSL compilation spike on the main thread.
   */
  warmUp(renderer: WebGLRenderer, scene: Scene): void {
    const dummy = new Mesh(new BufferGeometry(), this.material);
    scene.add(dummy);
    renderer.compile(scene, this.camera);
    scene.remove(dummy);
    dummy.geometry.dispose();
  }

  tick(): void {
    const cx = Math.floor(this.camera.position.x / this.chunkSize);
    const cz = Math.floor(this.camera.position.z / this.chunkSize);

    this.sky.tick(this.camera);
    this.material.uniforms.uTime.value += 0.016;
    this.material.uniforms.uSkyColor.value.copy(this.sky.ambient.color);
    this.material.uniforms.uSunDirection.value.copy(this.sky.sunMesh.position).normalize();

    if (cx !== this.lastPlayerChunkX || cz !== this.lastPlayerChunkZ) {
      this.updateChunks(false);
    }

    // 1. Register one new chunk's geometry and mark its sector dirty
    const next = this.meshQueue.shift();
    if (next && this.isDesired(next.chunkKey)) {
      const [sx, sz] = this.parseKey(next.chunkKey);
      this.loadedChunks.set(next.chunkKey, {
        data:    next.chunkData,
        borders: this.computeBorders(next.chunkData),
      });
      this.chunkGeoCache.set(next.chunkKey, {
        geo:          next.geometry,
        creationTime: this.material.uniforms.uTime.value,
      });
      this.pendingSectors.add(this.sectorKey(sx, sz));
      this.queueNeighbourRebuilds(next.chunkKey);
    }

    // 2. Register one completed rebuild result and mark its sector dirty
    const nextRebuild = this.rebuildMeshQueue.shift();
    if (nextRebuild && this.loadedChunks.has(nextRebuild.chunkKey)) {
      const [sx, sz] = this.parseKey(nextRebuild.chunkKey);
      this.chunkGeoCache.set(nextRebuild.chunkKey, {
        geo:          nextRebuild.geometry,
        creationTime: this.material.uniforms.uTime.value - 2.0, // skip animation
      });
      this.pendingSectors.add(this.sectorKey(sx, sz));
    }

    // 3. Rebuild one dirty sector mesh per frame (the actual GPU upload)
    const sectorIter = this.pendingSectors.values();
    const nextSector = sectorIter.next().value as string | undefined;
    if (nextSector !== undefined) {
      this.pendingSectors.delete(nextSector);
      this.applySectorRebuild(nextSector);
    }

    // 4. Dispatch one deferred neighbour rebuild per frame (off-thread)
    const toRebuild = this.rebuildQueue.shift();
    if (toRebuild) {
      this.rebuildSet.delete(toRebuild);
      const chunk = this.loadedChunks.get(toRebuild);
      if (chunk) this.asyncRebuild(toRebuild, chunk);
    }
  }

  /** Returns all currently visible sector meshes — used for raycasting. */
  getChunkMeshes(): Mesh[] {
    return [...this.sectorMeshes.values()];
  }

  /**
   * Removes the block at the given world-space intersection point and triggers
   * an async rebuild of the affected chunk (and neighbours if on a border).
   */
  destroyBlock(point: Vector3, normal: Vector3): void {
    const bx = Math.floor(point.x - normal.x * 0.001);
    const by = Math.floor(point.y - normal.y * 0.001);
    const bz = Math.floor(point.z - normal.z * 0.001);

    const key   = this.keyForBlock(bx, bz);
    const chunk = this.loadedChunks.get(key);
    if (!chunk) return;

    const blockKey = `${bx}.${by}.${bz}`;
    if (!(blockKey in chunk.data.blocks)) return;

    delete chunk.data.blocks[blockKey];
    chunk.borders = this.computeBorders(chunk.data);

    this.asyncRebuild(key, chunk);
    this.rebuildAdjacentChunks(bx, bz, chunk.data);
  }

  getBlock(bx: number, by: number, bz: number): { type: number; position: { x: number; y: number; z: number } } | null {
    const chunk = this.loadedChunks.get(this.keyForBlock(bx, bz));
    return chunk?.data.blocks[`${bx}.${by}.${bz}`] ?? null;
  }

  isBlockSolid(bx: number, by: number, bz: number): boolean {
    return this.getBlock(bx, by, bz) !== null;
  }

  /**
   * Synchronous mesh rebuild — kept for external callers that need an immediate result.
   * For internal use prefer asyncRebuild().
   */
  public rebuildChunkMesh(key: string, chunk: LoadedChunk): void {
    const [sx, sz] = this.parseKey(key);
    const geomData = new ChunkGeometry(chunk.data, this.getNeighbourBorderBlocks(sx, sz)).getData();
    this.chunkGeoCache.set(key, {
      geo:          geomData,
      creationTime: this.material.uniforms.uTime.value - 2.0,
    });
    this.applySectorRebuild(this.sectorKey(sx, sz));
  }

  // ─── Chunk management ──────────────────────────────────────────────────────

  private updateChunks(force: boolean): void {
    const cx = Math.floor(this.camera.position.x / this.chunkSize);
    const cz = Math.floor(this.camera.position.z / this.chunkSize);

    if (!force && cx === this.lastPlayerChunkX && cz === this.lastPlayerChunkZ) return;
    this.lastPlayerChunkX = cx;
    this.lastPlayerChunkZ = cz;

    const desired  = new Set<string>();
    const radiusSq = this.renderDistance * this.renderDistance;

    for (let dx = -this.renderDistance; dx <= this.renderDistance; dx++) {
      for (let dz = -this.renderDistance; dz <= this.renderDistance; dz++) {
        if (dx * dx + dz * dz > radiusSq) continue;
        desired.add(this.chunkKey((cx + dx) * this.chunkSize, (cz + dz) * this.chunkSize));
      }
    }

    // Unload out-of-range chunks
    const toUnload: string[] = [];
    for (const key of this.loadedChunks.keys()) {
      if (!desired.has(key)) toUnload.push(key);
    }
    for (const key of toUnload) this.unloadChunk(key);

    // Cancel queued chunks no longer needed
    for (const key of [...this.pendingChunks]) {
      if (!desired.has(key)) {
        this.pool.cancel(key);
        this.pendingChunks.delete(key);
      }
    }

    // Request new chunks (nearest first)
    [...desired]
      .filter(k => !this.loadedChunks.has(k) && !this.pendingChunks.has(k))
      .sort((a, b) => this.keyDistance(a, cx, cz) - this.keyDistance(b, cx, cz))
      .forEach(k => this.requestChunk(k));
  }

  private requestChunk(key: string): void {
    this.pendingChunks.add(key);
    const [startX, startZ] = this.parseKey(key);

    this.pool.dispatch(
      {
        chunkKey:             key,
        size:                 this.chunkSize,
        height:               this.chunkHeight,
        startX,
        endX:                 startX + this.chunkSize,
        startZ,
        endZ:                 startZ + this.chunkSize,
        worldParams:          this.params,
        neighbourBorderBlocks: this.getNeighbourBorderBlocks(startX, startZ),
      },
      (response) => this.onChunkReady(response),
    );
  }

  private onChunkReady(response: WorkerResponse): void {
    this.pendingChunks.delete(response.chunkKey);
    if (this.isDesired(response.chunkKey)) this.meshQueue.push(response);
  }

  private unloadChunk(key: string): void {
    this.loadedChunks.delete(key);
    this.chunkGeoCache.delete(key);
    this.rebuildSet.delete(key);
    this.pendingRebuildChunks.delete(key);

    // Mark the sector dirty so it gets rebuilt without this chunk's geometry
    const [sx, sz] = this.parseKey(key);
    this.pendingSectors.add(this.sectorKey(sx, sz));
  }

  // ─── Async rebuild ────────────────────────────────────────────────────────

  private asyncRebuild(key: string, chunk: LoadedChunk): void {
    if (this.pendingRebuildChunks.has(key)) return;
    this.pendingRebuildChunks.add(key);

    const [sx, sz] = this.parseKey(key);
    this.rebuildPool.dispatch(
      {
        chunkKey:             key,
        size:                 this.chunkSize,
        height:               this.chunkHeight,
        startX:               sx,
        endX:                 sx + this.chunkSize,
        startZ:               sz,
        endZ:                 sz + this.chunkSize,
        worldParams:          this.params,
        neighbourBorderBlocks: this.getNeighbourBorderBlocks(sx, sz),
        existingBlocks:       chunk.data.blocks,
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
    if (bx === data.startX)   offsets.push([-this.chunkSize, 0]);
    if (bx === data.endX - 1) offsets.push([ this.chunkSize, 0]);
    if (bz === data.startZ)   offsets.push([0, -this.chunkSize]);
    if (bz === data.endZ - 1) offsets.push([0,  this.chunkSize]);

    for (const [dx, dz] of offsets) {
      const adjKey   = this.keyForBlock(bx + dx, bz + dz);
      const adjChunk = this.loadedChunks.get(adjKey);
      if (adjChunk) this.asyncRebuild(adjKey, adjChunk);
    }
  }

  // ─── Sector geometry ───────────────────────────────────────────────────────

  /**
   * Merges all available chunk geometries in a sector into a single Mesh
   * and replaces the old sector mesh.  Runs on the main thread but is
   * fast (typed-array copies only — no block iteration).
   */
  private applySectorRebuild(sk: string): void {
    const entries: ChunkGeoEntry[] = [];
    for (const ck of this.chunksInSector(sk)) {
      const e = this.chunkGeoCache.get(ck);
      if (e) entries.push(e);
    }

    // Dispose old sector mesh
    const old = this.sectorMeshes.get(sk);
    if (old) {
      old.geometry.dispose();
      this.remove(old);
    }

    // Dispose old outline
    const oldOutline = this.sectorOutlines.get(sk);
    if (oldOutline) {
      oldOutline.geometry.dispose();
      this.remove(oldOutline);
      this.sectorOutlines.delete(sk);
    }

    if (entries.length === 0) {
      this.sectorMeshes.delete(sk);
      return;
    }

    const { geo, creationTimes } = this.mergeGeometries(entries);
    const mesh = this.buildMesh(geo, creationTimes);
    this.add(mesh);
    this.sectorMeshes.set(sk, mesh);

    // Build sector bounding-box outline (visible only in wireframe mode)
    const outline = this.buildSectorOutline(sk);
    this.add(outline);
    this.sectorOutlines.set(sk, outline);
  }

  /** Bright bounding-box outline drawn at the sector's world-space footprint. */
  private buildSectorOutline(sk: string): LineSegments {
    const sectorWorld = this.chunkSize * SECTOR_CHUNKS;
    const parts = sk.split(':');
    const sx = Number(parts[1]);
    const sz = Number(parts[2]);

    const box   = new BoxGeometry(sectorWorld, this.chunkHeight, sectorWorld);
    const edges = new EdgesGeometry(box);
    box.dispose();

    const line = new LineSegments(edges, this.outlineMaterial);
    line.position.set(
      sx + sectorWorld / 2,
      this.chunkHeight  / 2,
      sz + sectorWorld  / 2,
    );
    line.renderOrder = 1;          // draw on top of terrain
    line.visible     = this.wireframeEnabled;
    return line;
  }

  /**
   * Concatenates typed arrays from all chunk geometries into one.
   * O(total vertices) — no block iteration, no allocations beyond the final arrays.
   */
  private mergeGeometries(entries: ChunkGeoEntry[]): { geo: GeometryData; creationTimes: Float32Array } {
    let totalVerts = 0;
    let totalIdxs  = 0;
    for (const e of entries) {
      totalVerts += e.geo.positions.length / 3;
      totalIdxs  += e.geo.vertices.length;
    }

    const positions     = new Float32Array(totalVerts * 3);
    const normals       = new Float32Array(totalVerts * 3);
    const uvs           = new Float32Array(totalVerts * 2);
    const colors        = new Float32Array(totalVerts * 3);
    const isWater       = new Float32Array(totalVerts);
    const vertices      = new Uint32Array(totalIdxs);
    const creationTimes = new Float32Array(totalVerts);

    let vOff = 0; // vertex index offset
    let pOff = 0; // float offset for positions/normals/colors (×3)
    let uOff = 0; // float offset for uvs (×2)
    let iOff = 0; // index offset

    for (const e of entries) {
      const vc = e.geo.positions.length / 3;

      positions.set(e.geo.positions, pOff);
      normals.set(e.geo.normals,     pOff);
      colors.set(e.geo.colors,       pOff);
      isWater.set(e.geo.isWater,     vOff);
      uvs.set(e.geo.uvs,             uOff);
      creationTimes.fill(e.creationTime, vOff, vOff + vc);

      for (let i = 0; i < e.geo.vertices.length; i++) {
        vertices[iOff + i] = e.geo.vertices[i] + vOff;
      }

      vOff += vc;
      pOff += e.geo.positions.length;
      uOff += e.geo.uvs.length;
      iOff += e.geo.vertices.length;
    }

    return { geo: { positions, normals, uvs, colors, isWater, vertices }, creationTimes };
  }

  private buildMesh(data: GeometryData, creationTimes: Float32Array): Mesh {
    const geometry = new BufferGeometry();
    geometry.setAttribute('position',     new Float32BufferAttribute(data.positions, 3));
    geometry.setAttribute('normal',       new Float32BufferAttribute(data.normals,   3));
    geometry.setAttribute('color',        new Float32BufferAttribute(data.colors,    3));
    geometry.setAttribute('isWater',      new BufferAttribute(data.isWater, 1));
    geometry.setAttribute('uv',           new Float32BufferAttribute(data.uvs,       2));
    geometry.setAttribute('creationTime', new BufferAttribute(creationTimes,         1));
    geometry.setIndex(new BufferAttribute(data.vertices, 1));
    return new Mesh(geometry, this.material);
  }

  // ─── Sector helpers ───────────────────────────────────────────────────────

  private sectorKey(chunkStartX: number, chunkStartZ: number): string {
    const sectorWorld = this.chunkSize * SECTOR_CHUNKS;
    const sx = Math.floor(chunkStartX / sectorWorld) * sectorWorld;
    const sz = Math.floor(chunkStartZ / sectorWorld) * sectorWorld;
    return `S:${sx}:${sz}`;
  }

  /** Returns the chunk keys of all N×N slots inside a sector. */
  private chunksInSector(sk: string): string[] {
    const parts = sk.split(':');
    const sx = Number(parts[1]);
    const sz = Number(parts[2]);
    const keys: string[] = [];
    for (let dx = 0; dx < SECTOR_CHUNKS; dx++) {
      for (let dz = 0; dz < SECTOR_CHUNKS; dz++) {
        keys.push(this.chunkKey(sx + dx * this.chunkSize, sz + dz * this.chunkSize));
      }
    }
    return keys;
  }

  // ─── Neighbour border helpers ─────────────────────────────────────────────

  private computeBorders(data: ChunkDataResult): ChunkBorders {
    const maxX = data.endX - 1;
    const maxZ = data.endZ - 1;
    const negX: BlocksMap = {};
    const posX: BlocksMap = {};
    const negZ: BlocksMap = {};
    const posZ: BlocksMap = {};

    for (const k in data.blocks) {
      const b  = data.blocks[k];
      const bx = b.position.x;
      const bz = b.position.z;
      if (bx === data.startX) negX[k] = b;
      if (bx === maxX)        posX[k] = b;
      if (bz === data.startZ) negZ[k] = b;
      if (bz === maxZ)        posZ[k] = b;
    }

    return { negX, posX, negZ, posZ };
  }

  /** O(1) — four Map lookups, four Object.assign calls on pre-cached border slices. */
  private getNeighbourBorderBlocks(startX: number, startZ: number): BlocksMap {
    const endX   = startX + this.chunkSize;
    const endZ   = startZ + this.chunkSize;
    const result: BlocksMap = {};

    const negX = this.loadedChunks.get(this.chunkKey(startX - this.chunkSize, startZ));
    if (negX) Object.assign(result, negX.borders.posX);

    const posX = this.loadedChunks.get(this.chunkKey(endX, startZ));
    if (posX) Object.assign(result, posX.borders.negX);

    const negZ = this.loadedChunks.get(this.chunkKey(startX, startZ - this.chunkSize));
    if (negZ) Object.assign(result, negZ.borders.posZ);

    const posZ = this.loadedChunks.get(this.chunkKey(startX, endZ));
    if (posZ) Object.assign(result, posZ.borders.negZ);

    return result;
  }

  private queueNeighbourRebuilds(chunkKey: string): void {
    const [sx, sz] = this.parseKey(chunkKey);
    const endX = sx + this.chunkSize;
    const endZ = sz + this.chunkSize;

    for (const k of [
      this.chunkKey(sx - this.chunkSize, sz),
      this.chunkKey(endX,                sz),
      this.chunkKey(sx, sz - this.chunkSize),
      this.chunkKey(sx,               endZ),
    ]) {
      if (this.loadedChunks.has(k) && !this.rebuildSet.has(k)) {
        this.rebuildSet.add(k);
        this.rebuildQueue.push(k);
      }
    }
  }

  // ─── Generic helpers ──────────────────────────────────────────────────────

  private getTemperatureAt(x: number, z: number): number {
    const { scale, persistence } = this.params.terrain;
    const finalScale = scale * 0.5;
    let value = 0, amplitude = 1, frequency = 1, maxValue = 0;
    for (let i = 0; i < 2; i++) {
      value    += this.simplex.noise((x * frequency) / finalScale, (z * frequency) / finalScale) * amplitude;
      maxValue += amplitude;
      amplitude *= persistence;
      frequency *= 2;
    }
    return value / maxValue;
  }

  private chunkKey(startX: number, startZ: number): string {
    return `${startX}:${startZ}`;
  }

  private keyForBlock(bx: number, bz: number): string {
    return this.chunkKey(
      Math.floor(bx / this.chunkSize) * this.chunkSize,
      Math.floor(bz / this.chunkSize) * this.chunkSize,
    );
  }

  private parseKey(key: string): [number, number] {
    const [x, z] = key.split(':').map(Number);
    return [x, z];
  }

  private keyDistance(key: string, cx: number, cz: number): number {
    const [startX, startZ] = this.parseKey(key);
    const kx = Math.floor(startX / this.chunkSize);
    const kz = Math.floor(startZ / this.chunkSize);
    return (kx - cx) ** 2 + (kz - cz) ** 2;
  }

  private isDesired(key: string): boolean {
    const [startX, startZ] = this.parseKey(key);
    const kx = Math.floor(startX / this.chunkSize);
    const kz = Math.floor(startZ / this.chunkSize);
    const dx = kx - this.lastPlayerChunkX;
    const dz = kz - this.lastPlayerChunkZ;
    return dx * dx + dz * dz <= this.renderDistance * this.renderDistance;
  }
}
