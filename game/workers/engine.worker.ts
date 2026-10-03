import { runEngineWorker } from '@voxel/engine/worker';
import { registerGameContent } from '../content';
import { BlockType } from '../content/blocks';
import { gamePlugins } from '../plugins';

runEngineWorker({
  setup: registerGameContent,
  createChunkWorker: () => new Worker(new URL('./chunk.worker.ts', import.meta.url), { type: 'module' }),
  plugins: gamePlugins,
  world: { initialDimension: 'overworld' },
  spawnPoint: { x: 0, y: 40, z: 0 },
  hotbar: [
    BlockType.Grass, BlockType.Stone, BlockType.Moss, BlockType.Wood, BlockType.Leaves,
    BlockType.VictoriaRegia, BlockType.SporeBlossom, BlockType.CaveFlower, BlockType.BigDripleaf
  ]
});
