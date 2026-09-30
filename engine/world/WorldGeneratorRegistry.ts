import { WorldGenerator } from './WorldGenerator';

export class WorldGeneratorRegistry {
  private static instance: WorldGeneratorRegistry | null = null;
  private generators: Map<string, WorldGenerator> = new Map();

  public static getInstance(): WorldGeneratorRegistry {
    if (!WorldGeneratorRegistry.instance) {
      WorldGeneratorRegistry.instance = new WorldGeneratorRegistry();
    }
    return WorldGeneratorRegistry.instance;
  }

  public register(generator: WorldGenerator): void {
    this.generators.set(generator.id.toLowerCase(), generator);
  }

  public get(id: string): WorldGenerator | undefined {
    return this.generators.get(id.toLowerCase());
  }

  public getAll(): WorldGenerator[] {
    return Array.from(this.generators.values());
  }

  public has(id: string): boolean {
    return this.generators.has(id.toLowerCase());
  }
}

export const worldGeneratorRegistry = WorldGeneratorRegistry.getInstance();
