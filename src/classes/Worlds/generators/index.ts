import { worldGeneratorRegistry } from '../../../core/world/WorldGeneratorRegistry';
import { StandardWorldGenerator } from './StandardWorldGenerator';
import { FlatWorldGenerator } from './FlatWorldGenerator';
import { CavernWorldGenerator } from './CavernWorldGenerator';
import { LunarWorldGenerator } from './LunarWorldGenerator';
import { MercuryWorldGenerator } from './MercuryWorldGenerator';

export function registerDefaultGenerators(): void {
  worldGeneratorRegistry.register(new StandardWorldGenerator());
  worldGeneratorRegistry.register(new FlatWorldGenerator());
  worldGeneratorRegistry.register(new CavernWorldGenerator());
  worldGeneratorRegistry.register(new LunarWorldGenerator());
  worldGeneratorRegistry.register(new MercuryWorldGenerator());
}

registerDefaultGenerators();

export {
  StandardWorldGenerator,
  FlatWorldGenerator,
  CavernWorldGenerator,
  LunarWorldGenerator,
  MercuryWorldGenerator
};
