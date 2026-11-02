import type { EnginePlugin } from '@voxel/engine/worker';
import { blockParticlesPlugin } from './blockParticles';
import { dimensionsPlugin } from './dimensions';
import { effectsPlugin } from './effects';
import { volcanoPlugin } from './volcano';
import { weatherPlugin } from './weather';
import { wildlifePlugin } from './wildlife';

/** Default plugin bundle for geo-voxels (decoupled from multiplayer server). */
export const gamePlugins: EnginePlugin[] = [
  dimensionsPlugin,
  weatherPlugin,
  effectsPlugin,
  volcanoPlugin,
  wildlifePlugin,
  blockParticlesPlugin
];

export {
  blockParticlesPlugin,
  dimensionsPlugin,
  effectsPlugin,
  volcanoPlugin,
  weatherPlugin,
  wildlifePlugin
};
