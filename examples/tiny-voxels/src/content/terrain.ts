import { registerBlocks } from './blocks';
import { registerGenerators } from './generators';

export function registerTerrainContent(): void {
  registerBlocks();
  registerGenerators();
}
