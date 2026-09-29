import { ChunkContext, WorldGenerator } from '../../../core/world/WorldGenerator';
import { BlockType } from '../../../types';

export class MercuryWorldGenerator implements WorldGenerator {
  public readonly id = 'mercury';

  public generate(ctx: ChunkContext): void {
    const globalHeight = 128;

    if (ctx.startY > globalHeight || ctx.endY <= -512) return;

    for (let x = ctx.startX; x < ctx.endX; x++) {
      for (let z = ctx.startZ; z < ctx.endZ; z++) {
        const baseNoise = ctx.octaveBaseNoise(x, z, 3.0, 5);
        const detailNoise = ctx.octaveBaseNoise(x + 500, z + 500, 0.5, 3);
        let surfaceY = Math.floor(globalHeight * (0.2 + 0.4 * (baseNoise * 0.7 + detailNoise * 0.3)));

        const craterFreq = 64;
        const craterCX = Math.floor(x / craterFreq) * craterFreq + craterFreq / 2;
        const craterCZ = Math.floor(z / craterFreq) * craterFreq + craterFreq / 2;
        const distToCrater = Math.sqrt((x - craterCX) ** 2 + (z - craterCZ) ** 2);
        if (distToCrater < 16) surfaceY -= Math.floor((16 - distToCrater) * 0.8);

        surfaceY = Math.max(1, Math.min(surfaceY, globalHeight - 1));

        if (ctx.startY > surfaceY) continue;

        const maxY = Math.min(surfaceY, ctx.endY - 1);
        for (let y = ctx.startY; y <= maxY; y++) {
          let type: BlockType = BlockType.Stone;
          if (y === surfaceY) {
            const rand = ctx.simplex.noise3d(x / 10, y / 10, z / 10);
            if (rand > 0.4) type = BlockType.Coal;
            else if (rand < -0.4) type = BlockType.Sand;
          } else if (y < surfaceY - 4) {
            type = BlockType.Coal;
          }
          ctx.setBlock(x, y, z, type);
        }
      }
    }
  }
}
