import { worldGeneratorRegistry } from '@voxel/engine/chunk-worker';
import { StandardWorldGenerator } from './StandardWorldGenerator';
import { FlatWorldGenerator } from './FlatWorldGenerator';
import { CavernWorldGenerator } from './CavernWorldGenerator';
import { LunarWorldGenerator } from './LunarWorldGenerator';
import { MercuryWorldGenerator } from './MercuryWorldGenerator';
import { VolcanicWorldGenerator } from './VolcanicWorldGenerator';
import { NetherWorldGenerator } from './NetherWorldGenerator';
import { AstralVoidWorldGenerator } from './AstralVoidWorldGenerator';
import { AetherWorldGenerator } from './AetherWorldGenerator';

export function registerGenerators(): void {
  worldGeneratorRegistry.register(new StandardWorldGenerator());
  worldGeneratorRegistry.register(new FlatWorldGenerator());
  worldGeneratorRegistry.register(new CavernWorldGenerator());
  worldGeneratorRegistry.register(new LunarWorldGenerator());
  worldGeneratorRegistry.register(new MercuryWorldGenerator());
  worldGeneratorRegistry.register(new VolcanicWorldGenerator());
  worldGeneratorRegistry.register(new NetherWorldGenerator());
  worldGeneratorRegistry.register(new AstralVoidWorldGenerator());
  worldGeneratorRegistry.register(new AetherWorldGenerator());
}

export {
  StandardWorldGenerator,
  FlatWorldGenerator,
  CavernWorldGenerator,
  LunarWorldGenerator,
  MercuryWorldGenerator,
  VolcanicWorldGenerator,
  NetherWorldGenerator,
  AstralVoidWorldGenerator,
  AetherWorldGenerator
};

