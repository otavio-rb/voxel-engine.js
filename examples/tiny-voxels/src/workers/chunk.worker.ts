import { runChunkWorker } from '@voxel/engine/chunk-worker';
import { registerTerrainContent } from '../content/terrain';

runChunkWorker({ setup: registerTerrainContent });
