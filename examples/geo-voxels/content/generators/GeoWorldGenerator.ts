import { AIR, type ChunkContext, type WorldGenerator } from '@voxel/engine/chunk-worker';
import { google3DTilesVoxelizer } from './Google3DTilesVoxelizer';

export class GeoWorldGenerator implements WorldGenerator {
  public readonly id: string;

  constructor(presetId: string) {
    this.id = presetId;
  }

  public generate(ctx: ChunkContext): void {
    const { size, startX, startY, startZ, blocks } = ctx;

    for (let ly = 0; ly < size; ly++) {
      const wy = startY + ly;
      const yOffset = ly * size * size;
      for (let lz = 0; lz < size; lz++) {
        const wz = startZ + lz;
        const rowOffset = yOffset + lz * size;
        for (let lx = 0; lx < size; lx++) {
          const wx = startX + lx;
          const b = google3DTilesVoxelizer.getVoxel(this.id, wx, wy, wz);
          if (b !== AIR) {
            blocks[rowOffset + lx] = b;
          }
        }
      }
    }
  }
}

