import type { ChunkContext, WorldGenerator } from '@voxel/engine/chunk-worker';
import { BlockType } from '../blocks';

export class FlatWorldGenerator implements WorldGenerator {
  public readonly id = 'flat';

  public generate(ctx: ChunkContext): void {
    const height = 20;

    if (ctx.startY > height || ctx.endY <= -512) return;

    for (let x = ctx.startX; x < ctx.endX; x++) {
      for (let z = ctx.startZ; z < ctx.endZ; z++) {
        for (let y = ctx.startY; y < ctx.endY; y++) {
          if (y > height) continue;
          let type: BlockType = BlockType.Stone;
          if (y === height) type = BlockType.Grass;
          else if (y > height - 3) type = BlockType.Dirt;
          ctx.setBlock(x, y, z, type);
        }
      }
    }
  }
}
