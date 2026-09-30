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
  Basalt = 11,
  Magma = 12,
  Lava = 13,
  Ash = 14,
  Obsidian = 15,
  Portal = 16,

  // ── Aether Dimension ──────────────────────
  AetherGrass = 17,
  AetherDirt = 18,
  Holystone = 19,
  MossyHolystone = 20,
  ColdAercloud = 21,
  BlueAercloud = 22,
  GoldenAercloud = 23,
  ZaniteOre = 24,
  GravititeOre = 25,
  AmbrosiumOre = 26,
  SkyrootLog = 27,
  SkyrootLeaves = 28,
  GoldenOakLeaves = 29,
  CarvedHolystone = 30,
  SunAltar = 31,

  // ── Overworld Biomes & Trees Expansion ────
  BirchLog = 32,
  BirchLeaves = 33,
  PineLog = 34,
  PineLeaves = 35,
  CherryLeaves = 36,
  JungleLog = 37,
  JungleLeaves = 38,
  Cactus = 39,
  Clay = 40,
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
  Volcanic = 'volcanic',
  Nether = 'nether',
  AstralVoid = 'astral_void',
  Aether = 'aether',
}

export interface WorldParams {
  seed: number;
  worldType: WorldType | string;
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
}

export interface WorldConfig {
  renderDistance: number;
  verticalRenderDistance: number;
  chunkSize: number;
  chunkHeight: number;
}
