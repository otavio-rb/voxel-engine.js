import { DimensionDefinition } from './Dimension';

export class DimensionRegistry {
  private static instance: DimensionRegistry | null = null;
  private dimensions: Map<string, DimensionDefinition> = new Map();

  public static getInstance(): DimensionRegistry {
    if (!DimensionRegistry.instance) {
      DimensionRegistry.instance = new DimensionRegistry();
    }
    return DimensionRegistry.instance;
  }

  public register(dimension: DimensionDefinition): void {
    this.dimensions.set(dimension.id.toLowerCase(), dimension);
  }

  public get(id: string): DimensionDefinition | undefined {
    return this.dimensions.get(id.toLowerCase());
  }

  public has(id: string): boolean {
    return this.dimensions.has(id.toLowerCase());
  }

  public getAll(): DimensionDefinition[] {
    return Array.from(this.dimensions.values());
  }
}

export const dimensionRegistry = DimensionRegistry.getInstance();
