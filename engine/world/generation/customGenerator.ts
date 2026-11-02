import type { ChunkContext, WorldGenerator } from '../WorldGenerator';

export interface DensityPoint {
  x: number;
  y: number;
  z: number;
  ctx: ChunkContext;
}

export interface DensitySample {
  /** Solid where `density > 0`, open otherwise — an SDF-style field, not a block/air boolean. */
  density: number;
  /** A block id, or a key into `CustomGeneratorOptions.materials` resolved to one. Ignored where `density <= 0`. */
  material: number | string;
}

export interface CustomGeneratorOptions {
  id: string;
  /** Called once per voxel in the chunk. Return `null` to leave that voxel untouched (stays air). */
  sample(point: DensityPoint): DensitySample | null;
  /** Lets `sample` return a string instead of memorizing block ids — `material: 'alien-rock'` resolves through this map. */
  materials?: Record<string, number>;
}

/**
 * The density-field escape hatch: write one function that looks at a single point and decides
 * what's there, and this handles the chunk loop and the `ctx.setBlock` calls — no heightmap, no
 * biome, no layer config, nothing in between you and the volume. This is still just a
 * `WorldGenerator` underneath; nothing it does isn't expressible by hand against `ChunkContext`.
 */
export function customGenerator(options: CustomGeneratorOptions): WorldGenerator {
  return {
    id: options.id,
    generate(ctx: ChunkContext): void {
      for (let x = ctx.startX; x < ctx.endX; x += ctx.stride) {
        for (let y = ctx.startY; y < ctx.endY; y += ctx.stride) {
          for (let z = ctx.startZ; z < ctx.endZ; z += ctx.stride) {
            const result = options.sample({ x, y, z, ctx });
            if (!result || result.density <= 0) continue;

            const blockId = typeof result.material === 'number' ? result.material : options.materials?.[result.material];
            if (blockId === undefined) continue;

            ctx.setBlock(x, y, z, blockId);
          }
        }
      }
    }
  };
}
