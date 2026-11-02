import { registerTerrainContent } from './terrain';
import { registerDimensions } from './dimensions';
import { registerEntities } from './entities';

export { registerTerrainContent };

/** Everything the engine worker needs. Each worker has its own registries. */
export function registerGameContent(): void {
  registerTerrainContent();
  registerDimensions();
  registerEntities();
}
