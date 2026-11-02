import { runChunkWorker } from '@voxel/engine/chunk-worker';
import { registerTerrainContent } from '../content/terrain';
import { GEO_PRESETS, google3DTilesVoxelizer } from '../content/generators/Google3DTilesVoxelizer';

runChunkWorker({ setup: registerTerrainContent });

const baseOnMessage = self.onmessage;
if (baseOnMessage) {
  self.onmessage = async (e: MessageEvent) => {
    const job = e.data;
    const worldType: string | undefined = job?.worldParams?.worldType;
    if (worldType && GEO_PRESETS[worldType]) {
      await google3DTilesVoxelizer.ensurePresetLoaded(worldType);
    }
    baseOnMessage.call(self, e);
  };
}
