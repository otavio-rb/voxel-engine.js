import { ChunkContext, WorldGenerator } from '../../../core/world/WorldGenerator';
import { BlockType } from '../../../types';

export class FlatWorldGenerator implements WorldGenerator {
  public readonly id = 'flat';

  public generate(ctx: ChunkContext): void {
    const height = 20;

    if (ctx.startY > height) return;

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
