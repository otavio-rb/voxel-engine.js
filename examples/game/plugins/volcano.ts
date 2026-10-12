import type { EnginePlugin } from '@voxel/engine/worker';
import { getVolcanoInCell } from '../content/generators/StandardWorldGenerator';
import { chat } from './chat';

/** `/volcano`: teleports to the nearest supervolcano of the standard generator. */
export const volcanoPlugin: EnginePlugin = {
  name: 'volcano',
  setup(ctx) {
    const { player } = ctx;

    ctx.commands.register(['/volcano', '/vulcao'], () => {
      const cellX = Math.floor(player.camera.position.x / 192);
      const cellZ = Math.floor(player.camera.position.z / 192);
      let nearestV = getVolcanoInCell(0, 0);
      let minD = 999999;
      for (let dx = -2; dx <= 2; dx++) {
        for (let dz = -2; dz <= 2; dz++) {
          const v = getVolcanoInCell(cellX + dx, cellZ + dz);
          if (!v.exists) continue;
          const d = Math.sqrt((player.camera.position.x - v.x) ** 2 + (player.camera.position.z - v.z) ** 2);
          if (d < minD) {
            minD = d;
            nearestV = v;
          }
        }
      }
      player.teleport(nearestV.x + nearestV.craterR, 36 + nearestV.height + 4, nearestV.z);
      chat(ctx, `🌋 Teleportado para o topo do vulcão em (${nearestV.x}, ${nearestV.z})!`);
    });
  }
};
