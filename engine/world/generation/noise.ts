import type { ChunkContext } from '../WorldGenerator';

/**
 * Hash determinístico de uma célula de grade 2D/3D, em [0, 1). Útil para espalhar feições
 * raras (vulcões, ravinas, geodos, ...) numa grade de células: hasheia as coordenadas da
 * célula para decidir se ela tem a feição, hasheia de novo com outro `salt` para a posição/
 * tamanho — sempre o mesmo resultado para a mesma célula, em qualquer worker, em qualquer
 * ordem de geração.
 */
export function cellHash2(a: number, b: number, salt: number): number {
  const h = Math.sin(a * 127.1 + b * 311.7 + salt * 74.7) * 43758.5453123;
  return h - Math.floor(h);
}

export function cellHash3(a: number, b: number, c: number, salt: number): number {
  const h = Math.sin(a * 127.1 + b * 311.7 + c * 74.7 + salt * 269.5) * 43758.5453123;
  return h - Math.floor(h);
}

export interface RidgeNoiseOptions {
  /** Escalas (comprimento de onda) das duas amostras de ruído combinadas. */
  scales?: [number, number];
  /** Peso da primeira amostra (a segunda recebe `1 - blend`). */
  blend?: number;
  /** Expoente aplicado ao resultado — valores > 1 afinam os picos. */
  exponent?: number;
  /** Deslocamento aplicado às coordenadas antes de amostrar (evita correlação com outro ruído na mesma posição). */
  offset?: number;
}

/**
 * Ruído "ridge": `1 - |simplex|` em duas escalas, combinado e elevado a um expoente — cristas
 * afiadas em vez de colinas suaves. É o padrão usado para erguer cordilheiras sobre um
 * heightmap de base.
 */
export function ridgeNoise2D(ctx: ChunkContext, x: number, z: number, options: RidgeNoiseOptions = {}): number {
  const [s1, s2] = options.scales ?? [240, 110];
  const blend = options.blend ?? 0.7;
  const exponent = options.exponent ?? 1.8;
  const offset = options.offset ?? 12000;

  const r1 = 1.0 - Math.abs(ctx.simplex.noise((x + offset) / s1, (z + offset) / s1));
  const r2 = 1.0 - Math.abs(ctx.simplex.noise((x + offset) / s2, (z + offset) / s2));
  return Math.pow(r1 * blend + r2 * (1 - blend), exponent);
}
