import type { ChunkContext } from '@voxel/engine/chunk-worker';

/** Altura total do mundo de superfície (o topo útil do terreno). */
export const GLOBAL_HEIGHT = 128;

/** Nível do mar derivado da altura global. */
export const SEA_LEVEL = Math.floor(GLOBAL_HEIGHT * 0.25);

/**
 * Altura do terreno numa coluna, antes de vulcões e cavernas.
 *
 * É a única definição desta fórmula: a geração de terreno, o plantio de árvores
 * e o sistema de cavernas precisam concordar sobre onde fica a superfície,
 * inclusive em colunas fora do chunk que está a ser gerado.
 */
export function surfaceHeightAt(ctx: ChunkContext, x: number, z: number): number {
  const contNoise = ctx.octaveBaseNoise(x, z, 5.0, 4);
  const detailNoise = ctx.octaveBaseNoise(x + 500, z + 500, 0.6, 3);
  const raw = contNoise * 0.8 + detailNoise * 0.2;
  let sy = Math.floor(GLOBAL_HEIGHT * (0.32 + 0.48 * raw));

  // Preserva 100% mares, rios e praias (raw <= 0.18 ou sy <= seaLevel + 6).
  // Apenas eleva morros já altos para formar montanhas imponentes.
  if (raw > 0.18 && sy > SEA_LEVEL + 6) {
    const r1 = 1.0 - Math.abs(ctx.simplex.noise((x + 12000) / 240, (z + 12000) / 240));
    const r2 = 1.0 - Math.abs(ctx.simplex.noise((x + 12000) / 110, (z + 12000) / 110));
    const ridge = Math.pow(r1 * 0.7 + r2 * 0.3, 1.8);
    const elevation = (raw - 0.18) / 0.50;
    const mountainLift = Math.pow(Math.min(elevation, 1.5), 1.3) * (18 + ridge * 38);
    sy = Math.floor(sy + mountainLift);
  }

  return Math.max(0, Math.min(sy, GLOBAL_HEIGHT - 4));
}

/** Hash determinístico 2D estável entre chunks, no intervalo [0, 1). */
export function cellHash2(a: number, b: number, salt: number): number {
  const h = Math.sin(a * 127.1 + b * 311.7 + salt * 74.7) * 43758.5453123;
  return h - Math.floor(h);
}

/** Hash determinístico 3D estável entre chunks, no intervalo [0, 1). */
export function cellHash3(a: number, b: number, c: number, salt: number): number {
  const h = Math.sin(a * 127.1 + b * 311.7 + c * 74.7 + salt * 269.5) * 43758.5453123;
  return h - Math.floor(h);
}

export interface VolcanoInfo {
  x: number;
  z: number;
  radius: number;
  height: number;
  craterR: number;
  craterDepth: number;
  exists: boolean;
}

export type OverworldBiome =
  | 'plains'
  | 'forest'
  | 'birch'
  | 'taiga'
  | 'cherry'
  | 'desert'
  | 'jungle'
  | 'snow_tundra'
  | 'mountains'
  | 'volcanic';

/**
 * Large-scale cell grid for volcanoes (640x640 blocks).
 * Volcanoes are rare, epic geological landmarks rather than cluttering every turn.
 */
export function getVolcanoInCell(cellX: number, cellZ: number): VolcanoInfo {
  const cellGrid = 640;

  // Epic volcano landmark at cell (1, 1) around (720, 720)
  if (cellX === 1 && cellZ === 1) {
    return {
      x: cellX * cellGrid + 120,
      z: cellZ * cellGrid + 120,
      radius: 68,
      height: 66,
      craterR: 14,
      craterDepth: 18,
      exists: true,
    };
  }

  const h1 = Math.sin(cellX * 127.1 + cellZ * 311.7) * 43758.5453123;
  const r1 = h1 - Math.floor(h1);
  const h2 = Math.sin((cellX + 43.1) * 269.5 + (cellZ + 17.3) * 183.3) * 43758.5453123;
  const r2 = h2 - Math.floor(h2);
  const h3 = Math.sin((cellX + 91.7) * 419.2 + (cellZ + 53.9) * 371.1) * 43758.5453123;
  const r3 = h3 - Math.floor(h3);

  // ~25% of 640x640 cells contain a volcano
  const exists = r3 > 0.75;
  const x = cellX * cellGrid + 80 + Math.floor(r1 * (cellGrid - 160));
  const z = cellZ * cellGrid + 80 + Math.floor(r2 * (cellGrid - 160));
  const radius = 54 + Math.floor(r1 * 18);
  const height = 54 + Math.floor(r2 * 22);
  const craterR = 12 + Math.floor(r3 * 4);
  const craterDepth = 16;

  return { x, z, radius, height, craterR, craterDepth, exists };
}
