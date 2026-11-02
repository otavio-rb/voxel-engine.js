import { worldGeneratorRegistry } from '@voxel/engine/chunk-worker';
import { MicroTerrainGenerator } from './MicroTerrainGenerator';

export function registerGenerators(): void {
  worldGeneratorRegistry.register(new MicroTerrainGenerator());
}

export { MicroTerrainGenerator };
