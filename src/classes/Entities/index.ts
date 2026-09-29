import { entityRegistry } from '../../core/entities/EntityRegistry';
import { Sheep } from './Sheep';
import { Cow } from './Cow';
import { Pig } from './Pig';
import { Chicken } from './Chicken';

export function registerDefaultEntities(): void {
  entityRegistry.register('sheep', (world) => new Sheep(world));
  entityRegistry.register('cow', (world) => new Cow(world));
  entityRegistry.register('pig', (world) => new Pig(world));
  entityRegistry.register('chicken', (world) => new Chicken(world));
}

registerDefaultEntities();

export * from './Entity';
export * from './EntityManager';
export * from './Animal';
export * from './Sheep';
export * from './Cow';
export * from './Pig';
export * from './Chicken';
