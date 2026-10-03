import type { EnginePlugin } from '@voxel/engine/worker';
import { dimensionsPlugin } from './dimensions';
import { effectsPlugin } from './effects';
import { weatherPlugin } from './weather';
import { volcanoPlugin } from './volcano';
import { wildlifePlugin } from './wildlife';
import { blockParticlesPlugin } from './blockParticles';
import { networkPlugin } from './network';

/** Order matters: plugins receive `fixedUpdate` in this order. */
export const gamePlugins: EnginePlugin[] = [
  dimensionsPlugin,
  effectsPlugin,
  weatherPlugin,
  volcanoPlugin,
  wildlifePlugin,
  blockParticlesPlugin,
  networkPlugin
];

