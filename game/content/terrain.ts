import { registerBlocks } from './blocks';
import { registerGenerators } from './generators';

/**
 * Content needed by chunk workers: block definitions (meshing) and terrain generators.
 * Kept apart from the rest of the content so chunk workers don't bundle rendering code.
 */
export function registerTerrainContent(): void {
  registerBlocks();
  registerGenerators();
}
