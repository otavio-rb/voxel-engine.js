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
  chunkKey: string;
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
  vertices:  Uint32Array;
}

export interface ChunkDataResult {
  startX: number;
  endX: number;
  startZ: number;
  endZ: number;
  blocks: BlocksMap;
}

export interface WorkerResponse {
  chunkKey: string;
  chunkData: ChunkDataResult;
  geometry: GeometryData;
}

export interface WorldConfig {
  renderDistance: number;
  chunkSize: number;
  chunkHeight: number;
}
