import { runEngineWorker } from '@voxel/engine/worker';
import ChunkWorker from './chunk.worker.ts?worker';
import { registerGameContent } from '../content';
import { BlockType } from '../content/blocks';
import { gamePlugins } from '../plugins';

self.addEventListener('error', (e) => {
  console.error('[EngineWorker] Uncaught error:', e.message, e.filename, e.lineno, e.error);
  self.postMessage({ type: 'fatal_error', payload: { message: e.message, stack: e.error?.stack } });
});
self.addEventListener('unhandledrejection', (e) => {
  console.error('[EngineWorker] Unhandled rejection:', e.reason);
  self.postMessage({ type: 'fatal_error', payload: { message: String(e.reason), stack: e.reason?.stack } });
});

runEngineWorker({
  setup: registerGameContent,
  createChunkWorker: () => new ChunkWorker(),
  plugins: gamePlugins,
  world: {
    initialDimension: 'paulista_masp',
    workerCount: 1,
    renderDistance: 10,
    verticalRenderDistance: 6,
    chunkYRange: [0, 8]
  },
  spawnPoint: { x: -65, y: 32, z: -10 },
  hotbar: [
    74,  // Asfalto Escuro
    77,  // Concreto Estrutural
    80,  // Calçada / Pavimento
    81,  // Mármore Claro
    84,  // Branco Puro
    101, // Folhagem / Copa
    125, // Verde Gramado
    126, // Vermelho Puro
    113  // Vidro / Espelho d'Água
  ]
});
