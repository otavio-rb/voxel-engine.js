import { SculptorPlugin } from './sculptor';
import { OrbitCameraPlugin } from './orbitCamera';
import { FluidPlugin } from './fluid';

export const tinyPlugins = [
  new SculptorPlugin(),
  new OrbitCameraPlugin(),
  new FluidPlugin()
];

export * from './sculptor';
export * from './orbitCamera';
export * from './fluid';
