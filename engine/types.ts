export interface FaceCorner {
  pos: [number, number, number];
  uv: [number, number];
}

export type FaceLabel = 'left' | 'right' | 'bottom' | 'top' | 'back' | 'front';

export interface FaceDefinition {
  label: FaceLabel;
  uvRow: number;
  dir: [number, number, number];
  corners: FaceCorner[];
}

export interface BlockPosition {
  x: number;
  y: number;
  z: number;
}

export interface TerrainParams {
  scale: number;
  magnitude: number;
  offset: number;
  octaves: number;
  persistence: number;
}

export interface WorldParams {
  seed: number;
  /** ID of the WorldGenerator used to fill new chunks. */
  worldType: string;
  terrain: TerrainParams;
}

export interface ChunkJobData {
  chunkKey: string;
  size: number;
  height: number;
  startX: number;
  endX: number;
  startY: number;
  endY: number;
  startZ: number;
  endZ: number;
  worldParams: WorldParams;
  /** Border blocks from already-loaded neighbours, used for cross-chunk face culling. */
  neighbourBorderBlocks: ChunkBorders;
  /** If provided, skip terrain generation and use these blocks directly (async rebuild). */
  existingBlocks?: Int8Array;
  /** Scalar field water levels (0 to 255) */
  existingWaterLevels?: Uint8Array;
  /** Whether to construct and return 3D geometry. */
  buildMesh?: boolean;
  /** Generation jobs: also compute the chunk's own light (see LightEngine.computeLocal). */
  computeLight?: boolean;
  /** With `computeLight`: light the top as open sky. */
  presumeSky?: boolean;
  /** Rebuild jobs: packed light (sky << 4 | block) per cell, for vertex lighting. */
  light?: Uint8Array;
  /** Border light slices of the neighbors, laid out like `neighbourBorderBlocks`. */
  neighbourBorderLight?: ChunkLightBorders;
}

export interface ChunkLightBorders {
  negX?: Uint8Array;
  posX?: Uint8Array;
  negY?: Uint8Array;
  posY?: Uint8Array;
  negZ?: Uint8Array;
  posZ?: Uint8Array;
}

/** Typed arrays so buffers can be transferred (zero-copy) from worker → main thread. */
export interface GeometryData {
  positions: Float32Array;
  normals:   Float32Array;
  uvs:       Float32Array;
  colors:    Float32Array;
  isWater:   Float32Array;
  creationTime: Float32Array;
  ao:        Float32Array;
  /** Per vertex: sky light, block light (0-1). */
  light:     Float32Array;
  vertices:  Uint32Array;
}

export interface ChunkDataResult {
  startX: number;
  endX: number;
  startY: number;
  endY: number;
  startZ: number;
  endZ: number;
  blocks: Int8Array;
  /** Scalar field water levels (0 = empty, 255 = 1.0 full block) */
  waterLevels: Uint8Array;
}

/** One-block-wide border slices cached per chunk to avoid O(n) iteration on every rebuild. */
export interface ChunkBorders {
  /** Blocks at x === startX (exposed toward the -X neighbour). */
  negX?: Int8Array;
  /** Blocks at x === endX - 1 (exposed toward the +X neighbour). */
  posX?: Int8Array;
  /** Blocks at y === startY (exposed toward the -Y neighbour). */
  negY?: Int8Array;
  /** Blocks at y === endY - 1 (exposed toward the +Y neighbour). */
  posY?: Int8Array;
  /** Blocks at z === startZ (exposed toward the -Z neighbour). */
  negZ?: Int8Array;
  /** Blocks at z === endZ - 1 (exposed toward the +Z neighbour). */
  posZ?: Int8Array;
}

export interface WorkerResponse {
  chunkKey: string;
  chunkData: ChunkDataResult;
  borders: ChunkBorders;
  opaque?: GeometryData;
  water?: GeometryData;
  /** Chunk-local light, when the job asked for `computeLight`. */
  light?: Uint8Array;
}

export interface WorldConfig {
  renderDistance: number;
  verticalRenderDistance: number;
  chunkSize: number;
  chunkHeight: number;
}
