export enum BlockType {
  Stone = 0,
  Dirt = 1,
  Grass = 2,
  Sand = 3,
  Snow = 4,
  Empty = 5,
  Water = 6,
  Coal = 7,
  Iron = 8,
  Wood = 9,
  Leaves = 10,
}

export interface BlockDefinition {
  label: string;
  color: number;
}

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

export enum WorldType {
  Standard = 'standard',
  Flat = 'flat',
  Cavern = 'cavern',
  Lunar = 'lunar',
  Mercury = 'mercury',
}

export interface WorldParams {
  seed: number;
  worldType: WorldType;
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
  /** Whether to construct and return 3D geometry. */
  buildMesh?: boolean;
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
}

export interface WorldConfig {
  renderDistance: number;
  verticalRenderDistance: number;
  chunkSize: number;
  chunkHeight: number;
}
