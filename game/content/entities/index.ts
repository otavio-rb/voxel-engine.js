import { entityRegistry } from '@voxel/engine/worker';
import { Sheep } from './Sheep';
import { Cow } from './Cow';
import { Pig } from './Pig';
import { Chicken } from './Chicken';

export function registerEntities(): void {
  entityRegistry.register('sheep', (world) => new Sheep(world));
  entityRegistry.register('cow', (world) => new Cow(world));
  entityRegistry.register('pig', (world) => new Pig(world));
  entityRegistry.register('chicken', (world) => new Chicken(world));
}

export * from './Animal';
export * from './Sheep';
export * from './Cow';
export * from './Pig';
export * from './Chicken';
