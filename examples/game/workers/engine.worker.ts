import { runEngineWorker } from '@voxel/engine/worker';
import { registerGameContent } from '../content';
import { BlockType } from '../content/blocks';
import { gamePlugins } from '../plugins';
import ChunkWorker from './chunk.worker.ts?worker';

console.log('[VoxelEngine] Engine Worker script initialized');

self.addEventListener('error', (event: any) => {
  console.error('[EngineWorker:UNCAUGHT_ERROR]', event?.message, event?.filename, event?.lineno, event?.error);
  try {
    self.postMessage({
      type: 'fatal_error',
      payload: {
        message: event?.message || 'Worker runtime error',
        filename: event?.filename,
        lineno: event?.lineno,
        stack: event?.error?.stack || String(event?.error)
      }
    });
  } catch {}
});

self.addEventListener('unhandledrejection', (event: any) => {
  console.error('[EngineWorker:UNHANDLED_REJECTION]', event?.reason);
  try {
    self.postMessage({
      type: 'fatal_error',
      payload: {
        message: String(event?.reason?.message || event?.reason),
        stack: event?.reason?.stack
      }
    });
  } catch {}
});

runEngineWorker({
  setup: registerGameContent,
  createChunkWorker: () => new ChunkWorker(),
  plugins: gamePlugins,
  world: { initialDimension: 'overworld' },
  spawnPoint: { x: 0, y: 40, z: 0 },
  hotbar: [
    BlockType.Grass, BlockType.Stone, BlockType.Moss, BlockType.Wood, BlockType.Leaves,
    BlockType.VictoriaRegia, BlockType.SporeBlossom, BlockType.CaveFlower, BlockType.BigDripleaf
  ]
});
