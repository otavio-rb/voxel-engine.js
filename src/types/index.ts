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

export interface BlockData {
  type: BlockType;
  position: BlockPosition;
}

export type BlocksMap = Record<string, BlockData>;

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
  Jupyter = 'jupyter',
}

export interface WorldParams {
  seed: number;
  worldType: WorldType;
  terrain: TerrainParams;
}

export interface ChunkJobData {
  chunkKey: number;
  size: number;
  height: number;
  startX: number;
  endX: number;
  startZ: number;
  endZ: number;
  worldParams: WorldParams;
  /** Border blocks from already-loaded neighbours, used for cross-chunk face culling. */
  neighbourBorderBlocks: BlocksMap;
  /** If provided, skip terrain generation and use these blocks directly (async rebuild). */
  existingBlocks?: BlocksMap;
}

/** Typed arrays so buffers can be transferred (zero-copy) from worker → main thread. */
export interface GeometryData {
  positions: Float32Array;
  normals:   Float32Array;
  uvs:       Float32Array;
  colors:    Float32Array;
  isWater:   Float32Array;
  creationTime: Float32Array;
  vertices:  Uint32Array;
}

export interface ChunkDataResult {
  startX: number;
  endX: number;
  startZ: number;
  endZ: number;
  blocks: BlocksMap;
}

/** One-block-wide border slices cached per chunk to avoid O(n) iteration on every rebuild. */
export interface ChunkBorders {
  /** Blocks at x === startX (exposed toward the -X neighbour). */
  negX: BlocksMap;
  /** Blocks at x === endX - 1 (exposed toward the +X neighbour). */
  posX: BlocksMap;
  /** Blocks at z === startZ (exposed toward the -Z neighbour). */
  negZ: BlocksMap;
  /** Blocks at z === endZ - 1 (exposed toward the +Z neighbour). */
  posZ: BlocksMap;
}

export interface WorkerResponse {
  chunkKey: number;
  chunkData: ChunkDataResult;
  borders: ChunkBorders;
  opaque: GeometryData;
  water: GeometryData;
}

export interface WorldConfig {
  renderDistance: number;
  chunkSize: number;
  chunkHeight: number;
}
