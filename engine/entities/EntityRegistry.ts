import { Entity } from './Entity';
import ProceduralWorld from '../world/ProceduralWorld';

export type EntityFactory = (world: ProceduralWorld, x: number, y: number, z: number) => Entity;

export class EntityRegistry {
  private static instance: EntityRegistry | null = null;
  private factories: Map<string, EntityFactory> = new Map();

  public static getInstance(): EntityRegistry {
    if (!EntityRegistry.instance) {
      EntityRegistry.instance = new EntityRegistry();
    }
    return EntityRegistry.instance;
  }

  public register(type: string, factory: EntityFactory): void {
    this.factories.set(type.toLowerCase(), factory);
  }

  public create(type: string, world: ProceduralWorld, x: number, y: number, z: number): Entity | undefined {
    const factory = this.factories.get(type.toLowerCase());
    return factory ? factory(world, x, y, z) : undefined;
  }

  public getAvailableTypes(): string[] {
    return Array.from(this.factories.keys());
  }

  public has(type: string): boolean {
    return this.factories.has(type.toLowerCase());
  }
}

export const entityRegistry = EntityRegistry.getInstance();
