import { ChunkContext, WorldGenerator } from '../../../core/world/WorldGenerator';
import { BlockType } from '../../../types';

export class AstralVoidWorldGenerator implements WorldGenerator {
  public readonly id = 'astral_void';

  public generate(ctx: ChunkContext): void {
    const minY = 10;
    const maxY = 90;

    if (ctx.startY > maxY + 16 || ctx.endY < minY - 16) return;

    // Grid of celestial island clusters (every 96 blocks)
    const cellSize = 96;

    for (let x = ctx.startX; x < ctx.endX; x++) {
      for (let z = ctx.startZ; z < ctx.endZ; z++) {
        // Find nearest island center
        const cellX = Math.floor(x / cellSize);
        const cellZ = Math.floor(z / cellSize);

        // Check 3x3 surrounding cells
        let maxIslandDensity = -999;
        let isCore = false;

        for (let dx = -1; dx <= 1; dx++) {
          for (let dz = -1; dz <= 1; dz++) {
            const cx = cellX + dx;
            const cz = cellZ + dz;

            // Deterministic island center
            const hash1 = Math.sin(cx * 157.3 + cz * 311.7) * 43758.5453;
            const r1 = hash1 - Math.floor(hash1);
            const hash2 = Math.sin((cx + 73.1) * 269.5 + (cz + 17.3) * 183.3) * 43758.5453;
            const r2 = hash2 - Math.floor(hash2);

            const islandX = cx * cellSize + 24 + Math.floor(r1 * (cellSize - 48));
            const islandZ = cz * cellSize + 24 + Math.floor(r2 * (cellSize - 48));
            const islandY = 40 + Math.floor(r1 * 25);
            const radius = 22 + Math.floor(r2 * 14);

            const distHoriz = Math.sqrt((x - islandX) ** 2 + (z - islandZ) ** 2);
            if (distHoriz < radius * 1.5) {
              for (let y = ctx.startY; y < ctx.endY; y++) {
                const dy = (y - islandY) * 1.8; // Flatten vertically into an ellipsoid
                const dist3d = Math.sqrt(distHoriz * distHoriz + dy * dy);

                // 3D noise modulation for craggy asteroid edges
                const n = ctx.simplex.noise3d(x / 14, y / 10, z / 14) * 6.0;
                const density = radius - dist3d + n;

                if (density > 0) {
                  if (density > maxIslandDensity) {
                    maxIslandDensity = density;
                    isCore = density > 8;
                  }

                  let type = BlockType.Stone;
                  if (density < 2.5) {
                    // Outer rim of space asteroid
                    type = BlockType.Obsidian;
                  } else if (isCore) {
                    const oreN = ctx.simplex.noise3d(x / 6, y / 6, z / 6);
                    if (oreN > 0.6) type = BlockType.Magma;
                    else if (oreN < -0.6) type = BlockType.Iron;
                    else type = BlockType.Basalt;
                  } else {
                    type = BlockType.Stone;
                  }

                  ctx.setBlock(x, y, z, type);
                }
              }
            }
          }
        }
      }
    }
  }
}
