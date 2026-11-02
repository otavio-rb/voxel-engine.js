import type { ChunkContext } from '../WorldGenerator';
import { ridgeNoise2D, type RidgeNoiseOptions } from './noise';

export interface TerrainSample {
  height: number;
  /** Normalized continent-noise value (roughly [-1,1]) set by whichever layer established the base shape — later layers (e.g. `mountains`) read it to decide where to apply. 0 until something sets it. */
  raw: number;
}

export interface TerrainLayer {
  /** Mutates `sample` in place. Layers run in array order — each sees what the ones before it produced. */
  apply(ctx: ChunkContext, x: number, z: number, sample: TerrainSample): void;
}

/** Runs `layers` in order over one column, starting from `{ height: 0, raw: 0 }`. */
export function composeTerrain(ctx: ChunkContext, x: number, z: number, layers: TerrainLayer[]): TerrainSample {
  const sample: TerrainSample = { height: 0, raw: 0 };
  for (const layer of layers) layer.apply(ctx, x, z, sample);
  return sample;
}

export interface BaseTerrainOptions {
  /** Total usable world height, in blocks. */
  height: number;
  continent?: { scale?: number; octaves?: number };
  detail?: { scale?: number; octaves?: number; offset?: number; weight?: number };
  base?: number;
  spread?: number;
}

/**
 * The broad shape every world starts from: a continent/detail noise blend (see `sampleHeight`
 * — this is the same formula, as the first layer of a composable stack instead of a single
 * function call). Put this first; `mountains`/`hills` read `sample.raw`/`sample.height`.
 */
export function baseTerrain(options: BaseTerrainOptions): TerrainLayer {
  const continentScale = options.continent?.scale ?? 5.0;
  const continentOctaves = options.continent?.octaves ?? 4;
  const detailOffset = options.detail?.offset ?? 500;
  const detailScale = options.detail?.scale ?? 0.6;
  const detailOctaves = options.detail?.octaves ?? 3;
  const detailWeight = options.detail?.weight ?? 0.2;
  const base = options.base ?? 0.32;
  const spread = options.spread ?? 0.48;

  return {
    apply(ctx, x, z, sample) {
      const contNoise = ctx.octaveBaseNoise(x, z, continentScale, continentOctaves);
      const detailNoise = ctx.octaveBaseNoise(x + detailOffset, z + detailOffset, detailScale, detailOctaves);
      const raw = contNoise * (1 - detailWeight) + detailNoise * detailWeight;
      sample.raw = raw;
      sample.height = Math.floor(options.height * (base + spread * raw));
    }
  };
}

export interface MountainsOptions {
  /** Overall lift ceiling, in blocks, at full elevation. Default 56 (the original formula's 18+38). */
  height?: number;
  /** Only lifts where `sample.raw` is above this. Default 0.18. */
  threshold?: number;
  /** Only lifts where `sample.height` is already above this — e.g. pass your sea level + 6 to keep lowlands flat. Omit to lift wherever `raw` crosses the threshold regardless of height. */
  minHeight?: number;
  elevationRange?: number;
  elevationCap?: number;
  liftExponent?: number;
  ridge?: RidgeNoiseOptions;
}

/**
 * Lifts the incoming height into ridged peaks wherever the base layer's `raw` value is high
 * enough — the mountain half of `sampleHeight`, as its own layer. Needs `sample.raw`, so put a
 * `baseTerrain` (or anything else that sets `raw`) before it in the `terrain` array.
 */
export function mountains(options: MountainsOptions = {}): TerrainLayer {
  const totalLift = options.height ?? 56;
  const liftBase = totalLift * (18 / 56);
  const liftAmplitude = totalLift * (38 / 56);
  const threshold = options.threshold ?? 0.18;
  const elevationRange = options.elevationRange ?? 0.50;
  const elevationCap = options.elevationCap ?? 1.5;
  const liftExponent = options.liftExponent ?? 1.3;

  return {
    apply(ctx, x, z, sample) {
      if (sample.raw <= threshold) return;
      if (options.minHeight !== undefined && sample.height <= options.minHeight) return;

      const ridge = ridgeNoise2D(ctx, x, z, options.ridge);
      const elevation = (sample.raw - threshold) / elevationRange;
      const lift = Math.pow(Math.min(elevation, elevationCap), liftExponent) * (liftBase + ridge * liftAmplitude);
      sample.height = Math.floor(sample.height + lift);
    }
  };
}

export interface HillsOptions {
  /** Amplitude, in blocks (the bump goes roughly ±height). Default 12. */
  height?: number;
  /** Relative wavelength multiplier passed to `ctx.octaveBaseNoise`. Default 1.2. */
  scale?: number;
  octaves?: number;
  /** World-space offset so this doesn't correlate with the base layer's noise. Default 9000. */
  offset?: number;
}

/** Adds a smaller, independent bump on top of the incoming height — rolling hills, dunes, whatever reads as "smaller terrain variation" at whatever scale you give it. */
export function hills(options: HillsOptions = {}): TerrainLayer {
  const amplitude = options.height ?? 12;
  const scale = options.scale ?? 1.2;
  const octaves = options.octaves ?? 3;
  const offset = options.offset ?? 9000;

  return {
    apply(ctx, x, z, sample) {
      const n = ctx.octaveBaseNoise(x + offset, z + offset, scale, octaves);
      sample.height = Math.floor(sample.height + n * amplitude);
    }
  };
}

export interface FlatTerrainOptions {
  height: number;
}

/** Replaces whatever height came before it outright — a flat plateau at a fixed height. Mostly useful inside a `region()` override. */
export function flatTerrain(options: FlatTerrainOptions): TerrainLayer {
  return {
    apply(_ctx, _x, _z, sample) {
      sample.height = options.height;
      sample.raw = 0;
    }
  };
}
