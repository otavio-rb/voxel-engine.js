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
  /** Voxels por bloco; repassado aos geradores via ChunkContext. Default 1. */
  voxelsPerBlock?: number;
  /** Border blocks from already-loaded neighbours, used for cross-chunk face culling. */
  neighbourBorderBlocks: ChunkBorders;
  /** If provided, skip terrain generation and use these blocks directly (async rebuild). */
  existingBlocks?: Int16Array;
  /** Scalar field water levels (0 to 255) */
  existingWaterLevels?: Uint8Array;
  /** Whether to construct and return 3D geometry. */
  buildMesh?: boolean;
  /**
   * Se true (default), faz fusao de faces adjacentes coplanares na malha (Greedy Meshing).
   * Se false, emite quads individuais por face exposta (Naive Meshing).
   */
  greedyMeshing?: boolean;
  /**
   * Nivel de detalhe da malha: 1 = resolucao cheia, 2/4/8 = o chunk e reamostrado em
   * macro-celulas de `lodStep` voxels antes do meshing. Deve dividir `size`. Os dados de
   * voxel continuam em resolucao cheia; so a geometria perde detalhe.
   */
  lodStep?: number;
  /**
   * Voxels de MUNDO por celula gerada. 1 (default) e resolucao cheia.
   *
   * Diferente de `lodStep`, que so reduz a MALHA: aqui o chunk guarda menos celulas e cobre
   * mais mundo, que e o que torna um anel distante barato tambem em memoria e em contagem
   * de chunks. Ver ChunkContext.stride e world/FarFieldStreamer.
   */
  stride?: number;
  /** Generation jobs: also compute the chunk's own light (see LightEngine.computeLocal). */
  computeLight?: boolean;
  /** With `computeLight`: light the top as open sky. */
  presumeSky?: boolean;
  /** Rebuild jobs: packed light (sky << 4 | block) per cell, for vertex lighting. */
  light?: Uint8Array;
  /** Border light slices of the neighbors, laid out like `neighbourBorderBlocks`. */
  neighbourBorderLight?: ChunkLightBorders;
  /** Rebuild jobs: border water-level slices of the neighbors, laid out like `neighbourBorderBlocks`. */
  neighbourBorderWaterLevels?: ChunkWaterBorders;
}

export interface ChunkLightBorders {
  negX?: Uint8Array;
  posX?: Uint8Array;
  negY?: Uint8Array;
  posY?: Uint8Array;
  negZ?: Uint8Array;
  posZ?: Uint8Array;
}

/** Water-level (0-255) border slices, laid out like `ChunkBorders`. */
export type ChunkWaterBorders = ChunkLightBorders;

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
  blocks: Int16Array;
  /** Scalar field water levels (0 = empty, 255 = 1.0 full block) */
  waterLevels: Uint8Array;
}

/** One-block-wide border slices cached per chunk to avoid O(n) iteration on every rebuild. */
export interface ChunkBorders {
  /** Blocks at x === startX (exposed toward the -X neighbour). */
  negX?: Int16Array;
  /** Blocks at x === endX - 1 (exposed toward the +X neighbour). */
  posX?: Int16Array;
  /** Blocks at y === startY (exposed toward the -Y neighbour). */
  negY?: Int16Array;
  /** Blocks at y === endY - 1 (exposed toward the +Y neighbour). */
  posY?: Int16Array;
  /** Blocks at z === startZ (exposed toward the -Z neighbour). */
  negZ?: Int16Array;
  /** Blocks at z === endZ - 1 (exposed toward the +Z neighbour). */
  posZ?: Int16Array;
}

export interface WorkerResponse {
  chunkKey: string;
  chunkData: ChunkDataResult;
  borders: ChunkBorders;
  opaque?: GeometryData;
  water?: GeometryData;
  /** Chunk-local light, when the job asked for `computeLight`. */
  light?: Uint8Array;
  /**
   * Valor do bloco quando o chunk inteiro e um unico bloco, senao undefined.
   *
   * Num mundo de minivoxels a maioria esmagadora dos chunks e uniforme (ceu puro ou
   * subsolo puro): medido neste projeto, de 68% a 90% conforme a distancia de render
   * cresce. Informar isso deixa a main thread apontar para arrays compartilhados em vez
   * de guardar uma copia por chunk, o que e a diferenca entre 1.270 MB e ~210 MB para uma
   * visao de 32x16 blocos.
   */
  uniform?: number;
  /** Idem para a luz empacotada: valor unico quando toda a celula tem a mesma luz. */
  uniformLight?: number;
}

export interface WorldConfig {
  /**
   * Quantos voxels cabem em um bloco (um metro). 1 e o voxel classico; 8 significa
   * minivoxels de 1/8 de bloco. Nao muda o grid: um voxel continua valendo uma unidade
   * da cena. O que muda e o tamanho do jogador, da fisica, do alcance e da nevoa,
   * todos escritos em blocos e convertidos por esse fator.
   */
  voxelsPerBlock?: number;
  renderDistance: number;
  /** Alcance vertical, em chunks. Vale para cima e, por padrao, tambem para baixo. */
  verticalRenderDistance: number;
  /**
   * Alcance vertical PARA BAIXO, em chunks. Omitido, usa `verticalRenderDistance`.
   *
   * Existe porque os dois lados nao valem o mesmo. Olhar para baixo de uma boca de caverna
   * quer profundidade; olhar para cima quase sempre so encontra ceu, que nao custa nada
   * desenhar mas custa carregar. Com um numero so, a unica forma de enxergar fundo era
   * carregar a mesma altura de ar la em cima.
   */
  verticalRenderDistanceDown?: number;
  /**
   * Anel de LOD alem da visao normal. So no raymarch; omitido, nao existe campo distante.
   *
   * O terreno dele e gerado em passo grosso e guardado em chunks grandes, entao custa pouco
   * nos dois tetos que limitam o alcance (slots de atlas e numero de chunks). Ver
   * world/FarFieldStreamer.
   */
  farField?: {
    /** Voxels de MUNDO por celula: 4, 8, 16. */
    stride: number;
    /** Lado do chunk distante em CELULAS; precisa ser multiplo de 8. */
    chunkCells: number;
    /** Raio externo do anel, em voxels de mundo. */
    outerRadius: number;
    /** Meia-altura do anel, em voxels de mundo. */
    verticalRadius: number;
    /** Slots de atlas reservados para este anel. */
    atlasSlots: number;
  };
  chunkSize: number;
  chunkHeight: number;
}
