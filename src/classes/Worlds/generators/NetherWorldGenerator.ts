import { ChunkContext, WorldGenerator } from '../../../core/world/WorldGenerator';
import { BlockType } from '../../../types';

export class NetherWorldGenerator implements WorldGenerator {
  public readonly id = 'nether';

  public generate(ctx: ChunkContext): void {
    const ceilingY = 96;
    const floorY = 0;
    const lavaSeaY = 22;

    if (ctx.startY > ceilingY + 16 || ctx.endY <= floorY - 32) return;

    for (let x = ctx.startX; x < ctx.endX; x++) {
      for (let z = ctx.startZ; z < ctx.endZ; z++) {
        for (let y = ctx.startY; y < ctx.endY; y++) {
          // 1. Bedrock/Basalt ceiling and floor barriers
          if (y >= ceilingY) {
            ctx.setBlock(x, y, z, BlockType.Basalt);
            continue;
          }
          if (y <= floorY) {
            ctx.setBlock(x, y, z, BlockType.Basalt);
            continue;
          }

          // 2. 3D Perlin/Simplex cave carving
          const n1 = ctx.simplex.noise3d(x / 24, y / 16, z / 24);
          const n2 = ctx.simplex.noise3d(x / 12, y / 10, z / 12) * 0.5;
          const density = n1 + n2;

          // Natural vertical density curve: solid top and bottom, open in the middle
          const distFromMid = Math.abs(y - 48) / 48; // 0 at middle, 1 at boundaries
          const threshold = 0.15 - distFromMid * 0.45;

          const isSolid = density > threshold;

          if (isSolid) {
            // Material selection: Basalt, Magma, Obsidian, Ash
            const oreNoise = ctx.simplex.noise3d((x + 500) / 8, y / 8, (z + 500) / 8);
            if (oreNoise > 0.65) {
              ctx.setBlock(x, y, z, BlockType.Magma);
            } else if (oreNoise < -0.7) {
              ctx.setBlock(x, y, z, BlockType.Obsidian);
            } else if (y < lavaSeaY + 3 && Math.abs(oreNoise) < 0.25) {
              ctx.setBlock(x, y, z, BlockType.Ash);
            } else {
              ctx.setBlock(x, y, z, BlockType.Basalt);
            }
          } else {
            // Air cavity or Lava Ocean
            if (y <= lavaSeaY) {
              ctx.setBlock(x, y, z, BlockType.Lava);
            }
          }
        }
      }
    }
  }
}
