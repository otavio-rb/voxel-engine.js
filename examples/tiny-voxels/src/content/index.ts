import { registerBlocks } from './blocks';
import { registerGenerators } from './generators';
import { registerDimensions } from './dimensions';

export function registerGameContent(): void {
  registerBlocks();
  registerGenerators();
  registerDimensions();
}

export * from './blocks';
export * from './generators';
export * from './dimensions';
