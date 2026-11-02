import type { ChunkContext } from '../WorldGenerator';
import { ridgeNoise2D } from './noise';

export interface HeightmapMountainOptions {
  /** Below this normalized continent-noise value, no lift is applied (keeps seas/rivers/beaches flat). Default 0.18. */
  threshold?: number;
  /** Lift only applies above this height too (keeps lowlands flat even where noise is high). Default `seaLevel + 6`. */
  minHeight?: number;
  /** Normalizes `raw - threshold` into roughly [0, elevationCap] before the lift curve. Default 0.50. */
  elevationRange?: number;
  /** Caps the normalized elevation before the lift curve. Default 1.5. */
  elevationCap?: number;
  /** Exponent applied to the normalized elevation — higher sharpens peaks vs. foothills. Default 1.3. */
  liftExponent?: number;
  /** Base lift added regardless of ridge noise, in world Y units (pre voxelsPerBlock). Default 18. */
  liftBase?: number;
  /** Extra lift scaled by ridge noise, in world Y units. Default 38. */
  liftAmplitude?: number;
  ridge?: import('./noise').RidgeNoiseOptions;
}

export interface HeightmapOptions {
  /** Total usable world height, in blocks. */
  height: number;
  /** Sea level, in blocks. Defaults to `height * 0.25`. */
  seaLevel?: number;
  /** Continent-scale noise: broad landmasses. */
  continent?: { scale?: number; octaves?: number };
  /** Finer detail noise layered on top of the continent shape. */
  detail?: { scale?: number; octaves?: number; offset?: number; weight?: number };
  /** Base-height formula: `height * (base + spread * raw)`. Defaults reproduce a sea-to-mountain range. */
  base?: number;
  spread?: number;
  /** Set to `false` to disable the ridged-mountain lift entirely (plain heightmap). */
  mountains?: HeightmapMountainOptions | false;
  /** Keeps the result at least this far below the ceiling. Default 4. */
  topMargin?: number;
}

/**
 * Samples terrain height at one world column: a continent/detail noise blend, optionally
 * lifted into ridged mountains above a threshold. This is `surfaceHeightAt` generalized —
 * every constant that generator used is an option here, with that generator's own values as
 * the defaults, so `sampleHeight(ctx, x, z, { height: 128 })` reproduces it exactly.
 *
 * Call this from your own `generate(ctx)`, or use `baseTerrain`/`mountains` (in `terrainLayers.ts`)
 * for the same formula as a composable `createWorld` layer instead.
 */
export function sampleHeight(ctx: ChunkContext, x: number, z: number, options: HeightmapOptions): number {
  const seaLevel = options.seaLevel ?? options.height * 0.25;
  const continentScale = options.continent?.scale ?? 5.0;
  const continentOctaves = options.continent?.octaves ?? 4;
  const detailOffset = options.detail?.offset ?? 500;
  const detailScale = options.detail?.scale ?? 0.6;
  const detailOctaves = options.detail?.octaves ?? 3;
  const detailWeight = options.detail?.weight ?? 0.2;
  const base = options.base ?? 0.32;
  const spread = options.spread ?? 0.48;
  const topMargin = options.topMargin ?? 4;

  const contNoise = ctx.octaveBaseNoise(x, z, continentScale, continentOctaves);
  const detailNoise = ctx.octaveBaseNoise(x + detailOffset, z + detailOffset, detailScale, detailOctaves);
  const raw = contNoise * (1 - detailWeight) + detailNoise * detailWeight;
  let sy = Math.floor(options.height * (base + spread * raw));

  if (options.mountains !== false) {
    const m = options.mountains ?? {};
    const threshold = m.threshold ?? 0.18;
    const minHeight = m.minHeight ?? seaLevel + 6;
    const elevationRange = m.elevationRange ?? 0.50;
    const elevationCap = m.elevationCap ?? 1.5;
    const liftExponent = m.liftExponent ?? 1.3;
    const liftBase = m.liftBase ?? 18;
    const liftAmplitude = m.liftAmplitude ?? 38;

    if (raw > threshold && sy > minHeight) {
      const ridge = ridgeNoise2D(ctx, x, z, m.ridge);
      const elevation = (raw - threshold) / elevationRange;
      const lift = Math.pow(Math.min(elevation, elevationCap), liftExponent) * (liftBase + ridge * liftAmplitude);
      sy = Math.floor(sy + lift);
    }
  }

  return Math.max(0, Math.min(sy, options.height - topMargin));
}
