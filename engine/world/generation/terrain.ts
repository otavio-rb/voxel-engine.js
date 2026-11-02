import type { ChunkContext, WorldGenerator } from '../WorldGenerator';
import { composeTerrain, type TerrainLayer } from './terrainLayers';
import type { TerrainOverride } from './overrides';
import { classifyBiome, type BiomeRule, type ClimateNoiseOptions } from './biomes';
import { applySurfaceLayers, scatterOres, type SurfaceLayerConfig, type OreRule } from './surfaceLayers';
import { CaveCarver, type CaveCarverOptions } from './caves';

export interface WorldOptions {
  id: string;
  /** Composed in order over each column — see `baseTerrain`/`mountains`/`hills`/`flatTerrain`. Put a `baseTerrain` first unless you know you don't need `sample.raw`. */
  terrain: TerrainLayer[];
  /** XZ regions (see `region()`) whose own `terrain` array replaces the top-level one inside their bounds. First match wins. */
  overrides?: TerrainOverride[];
  biomes: {
    rules: BiomeRule[];
    temperature?: ClimateNoiseOptions;
    moisture?: ClimateNoiseOptions;
  };
  /** Surface layers per biome id (from `biomes.rules`). A biome with no entry stays bare stone. */
  layers: Record<string, SurfaceLayerConfig>;
  ores?: OreRule[];
  /** How many blocks below the surface ores start appearing. Default 8. */
  oreMinDepth?: number;
  /** Omit to generate a cave-free world. `caves.sampleSurfaceHeight` is wired up for you if you don't set it. */
  caves?: Partial<CaveCarverOptions> & Pick<CaveCarverOptions, 'biomes' | 'seaLevel' | 'waterBlockId' | 'lavaBlockId' | 'rockBlockIds'>;
}

/**
 * Composes terrain layers + biomes + surface layers + (optionally) caves into one ready
 * `WorldGenerator` — register the result with `worldGeneratorRegistry` and you have a complete
 * terrain-and-caves world:
 *
 * ```ts
 * worldGeneratorRegistry.register(createWorld({
 *   id: 'my-world',
 *   terrain: [baseTerrain({ height: 128 }), mountains(), hills({ height: 8 })],
 *   biomes: { rules: [
 *     { id: 'desert', test: (c) => c.temp > 0.3 },
 *     { id: 'plains', test: () => true }
 *   ] },
 *   layers: {
 *     desert: { top: { blockId: SAND, depth: 3 }, stoneBlockId: STONE },
 *     plains: { top: { blockId: GRASS, depth: 1 }, fill: { blockId: DIRT, depth: 3 }, stoneBlockId: STONE }
 *   }
 * }));
 * ```
 *
 * Need to carve out an exception (a flat pad for a build site, say)? Add a `region()` to
 * `overrides`. Need something this shape can't express at all — overhangs, floating islands,
 * a pure density field? `customGenerator` hands you one point at a time instead of a heightmap.
 * And `sampleHeight`/`classifyBiome`/`applySurfaceLayers`/`scatterOres`/`CaveCarver` are the
 * same pieces this function calls, exported on their own — call them yourself from a
 * hand-written `generate(ctx)` for anything in between, or skip this module entirely and
 * implement `WorldGenerator` directly as before.
 */
export function createWorld(options: WorldOptions): WorldGenerator {
  const overrides = options.overrides ?? [];
  const oreMinDepth = options.oreMinDepth ?? 8;

  const resolveHeight = (ctx: ChunkContext, x: number, z: number): number => {
    const override = overrides.find((o) => o.contains(x, z));
    return composeTerrain(ctx, x, z, override ? override.terrain : options.terrain).height;
  };

  const caveOptions: CaveCarverOptions | undefined = options.caves
    ? { sampleSurfaceHeight: resolveHeight, ...options.caves }
    : undefined;

  return {
    id: options.id,
    generate(ctx: ChunkContext): void {
      for (let z = ctx.startZ; z < ctx.endZ; z++) {
        for (let x = ctx.startX; x < ctx.endX; x++) {
          const height = resolveHeight(ctx, x, z);
          const biome = classifyBiome(ctx, x, z, height, {
            rules: options.biomes.rules,
            temperature: options.biomes.temperature,
            moisture: options.biomes.moisture
          });

          const layers = options.layers[biome.id];
          if (!layers) continue;
          applySurfaceLayers(ctx, x, z, height, layers);

          if (options.ores && options.ores.length > 0) {
            const yEnd = Math.min(ctx.endY, height - oreMinDepth + 1);
            for (let y = ctx.startY; y < yEnd; y++) {
              if (ctx.getBlock(x, y, z) !== layers.stoneBlockId) continue;
              const ore = scatterOres(ctx, x, y, z, options.ores);
              if (ore !== null) ctx.setBlock(x, y, z, ore);
            }
          }
        }
      }

      if (caveOptions) new CaveCarver(ctx, caveOptions).apply();
    }
  };
}
