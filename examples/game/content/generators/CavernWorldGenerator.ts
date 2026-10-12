import type { ChunkContext, WorldGenerator } from '@voxel/engine/chunk-worker';
import { BlockType } from '../blocks';

export class CavernWorldGenerator implements WorldGenerator {
  public readonly id = 'cavern';

  public generate(ctx: ChunkContext): void {
    const globalHeight = 128;

    if (ctx.startY > globalHeight || ctx.endY <= -512) return;

    for (let x = ctx.startX; x < ctx.endX; x++) {
      for (let z = ctx.startZ; z < ctx.endZ; z++) {
        for (let y = ctx.startY; y < ctx.endY; y++) {
          const noise = ctx.simplex.noise3d(x / 16, y / 16, z / 16);
          const density = noise + Math.max(-0.5, Math.min(0.4, 0.5 - y / globalHeight));
          if (density > 0.1) {
            let type = BlockType.Stone;
            if (noise > 0.7) type = BlockType.Coal;
            ctx.setBlock(x, y, z, type);
          }
        }
      }
    }
  }
}
