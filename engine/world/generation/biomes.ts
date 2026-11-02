import type { ChunkContext } from '../WorldGenerator';

export interface Climate {
  temp: number;
  moisture: number;
  /** Surface height at this column, in blocks — pass whatever `sampleHeight` (or your own logic) returned. */
  elevation: number;
}

export interface BiomeRule {
  id: string;
  /**
   * Evaluated in array order; the first rule that returns true wins. Keep a catch-all last.
   * `ctx` is handed through so a rule can sample its own extra noise field (e.g. to split one
   * climate band into two biomes) without `classifyBiome` needing to know about it.
   */
  test(climate: Climate, ctx: ChunkContext, x: number, z: number): boolean;
}

export interface ClimateNoiseOptions {
  /** World-space offset applied before sampling, so temperature/moisture/sub-variance fields don't correlate. */
  offset?: [number, number];
  /** Macro wavelength, in blocks. */
  scale?: number;
  /** Finer wavelength layered on top. */
  detailScale?: number;
  /** Weight of the detail sample (the macro sample gets `1`). */
  detailWeight?: number;
}

export interface BiomeMapOptions {
  /** Ordered biome rules; first match wins. Put specific rules first, a catch-all last. */
  rules: BiomeRule[];
  temperature?: ClimateNoiseOptions;
  moisture?: ClimateNoiseOptions;
}

export interface BiomeResult {
  id: string;
  temp: number;
  moisture: number;
  elevation: number;
}

function sampleClimateField(ctx: ChunkContext, x: number, z: number, options: ClimateNoiseOptions = {}): number {
  const [ox, oz] = options.offset ?? [0, 0];
  const scale = options.scale ?? 950;
  const detailScale = options.detailScale ?? scale * 0.48;
  const detailWeight = options.detailWeight ?? 0.2;
  return (
    ctx.simplex.noise((x + ox) / scale, (z + oz) / scale) +
    ctx.simplex.noise((x + ox) / detailScale, (z + oz) / detailScale) * detailWeight
  );
}

/**
 * Classifies one world column into a biome: two macro climate fields (temperature,
 * moisture — each a blend of a broad and a finer noise sample) evaluated against an ordered
 * list of rules you supply. This is `getBiomeAt` generalized — no biome names are built in;
 * `options.rules` IS the biome list, evaluated top to bottom.
 */
export function classifyBiome(ctx: ChunkContext, x: number, z: number, elevation: number, options: BiomeMapOptions): BiomeResult {
  const temp = sampleClimateField(ctx, x, z, options.temperature);
  const moisture = sampleClimateField(ctx, x, z, options.moisture);
  const climate: Climate = { temp, moisture, elevation };

  for (const rule of options.rules) {
    if (rule.test(climate, ctx, x, z)) return { id: rule.id, temp, moisture, elevation };
  }
  const fallback = options.rules[options.rules.length - 1];
  return { id: fallback?.id ?? 'default', temp, moisture, elevation };
}
