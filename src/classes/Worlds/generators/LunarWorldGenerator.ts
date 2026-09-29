import { ChunkContext, WorldGenerator } from '../../../core/world/WorldGenerator';
import { BlockType } from '../../../types';

export class LunarWorldGenerator implements WorldGenerator {
  public readonly id = 'lunar';

  public generate(ctx: ChunkContext): void {
    const globalHeight = 128;

    if (ctx.startY > globalHeight || ctx.endY <= -512) return;

    const surfaceOf = new Int16Array(ctx.size * ctx.size);

    for (let x = ctx.startX; x < ctx.endX; x++) {
      const lx = x - ctx.startX;
      for (let z = ctx.startZ; z < ctx.endZ; z++) {
        const lz = z - ctx.startZ;
        const noise = ctx.octaveBaseNoise(x, z, 2.0, 3);
        let sy = Math.floor(globalHeight * (0.1 + 0.2 * noise));

        const craterCX = Math.floor(x / 50) * 50 + 25;
        const craterCZ = Math.floor(z / 50) * 50 + 25;
        const dist = Math.sqrt((x - craterCX) ** 2 + (z - craterCZ) ** 2);
        if (dist < 15) sy -= Math.floor((15 - dist) * 0.5);

        sy = Math.max(2, Math.min(sy, globalHeight));
        surfaceOf[lz * ctx.size + lx] = sy;

        const maxY = Math.min(sy, ctx.endY - 1);
        for (let y = ctx.startY; y <= maxY; y++) {
          let type: BlockType = BlockType.Stone;
          if (y === sy && noise > 0.5) type = BlockType.Snow;
          ctx.setBlock(x, y, z, type);
        }
      }
    }
  }
}
