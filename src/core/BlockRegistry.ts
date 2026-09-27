export interface BlockConfig {
  id: number;
  name: string;
  color: number;
  solid?: boolean;
  opaque?: boolean;
  fluid?: boolean;
  transparent?: boolean;
  luminance?: number;
}

export class BlockRegistry {
  private static instance: BlockRegistry | null = null;
  private blocks: Map<number, BlockConfig> = new Map();
  private nameToId: Map<string, number> = new Map();

  constructor() {
    this.registerDefaults();
  }

  public static getInstance(): BlockRegistry {
    if (!BlockRegistry.instance) {
      BlockRegistry.instance = new BlockRegistry();
    }
    return BlockRegistry.instance;
  }

  public register(config: BlockConfig): void {
    const fullConfig: BlockConfig = {
      solid: true,
      opaque: true,
      fluid: false,
      transparent: false,
      luminance: 0,
      ...config
    };

    this.blocks.set(fullConfig.id, fullConfig);
    this.nameToId.set(fullConfig.name.toLowerCase(), fullConfig.id);
  }

  public get(id: number): BlockConfig | undefined {
    return this.blocks.get(id);
  }

  public getByName(name: string): BlockConfig | undefined {
    const id = this.nameToId.get(name.toLowerCase());
    return id !== undefined ? this.blocks.get(id) : undefined;
  }

  public isSolid(id: number): boolean {
    if (id < 0) return false;
    const block = this.blocks.get(id);
    return block ? (block.solid ?? true) : false;
  }

  public isOpaque(id: number): boolean {
    if (id < 0) return false;
    const block = this.blocks.get(id);
    return block ? (block.opaque ?? true) : false;
  }

  public isFluid(id: number): boolean {
    if (id < 0) return false;
    const block = this.blocks.get(id);
    return block ? (block.fluid ?? false) : false;
  }

  public isTransparent(id: number): boolean {
    if (id < 0) return true;
    const block = this.blocks.get(id);
    return block ? (block.transparent ?? false) : true;
  }

  public getColor(id: number): number {
    const block = this.blocks.get(id);
    return block ? block.color : 0xffffff;
  }

  public getAll(): BlockConfig[] {
    return Array.from(this.blocks.values());
  }

  private registerDefaults(): void {
    this.register({ id: 0, name: 'stone', color: 0x888888, solid: true, opaque: true });
    this.register({ id: 1, name: 'dirt', color: 0x8b4513, solid: true, opaque: true });
    this.register({ id: 2, name: 'grass', color: 0x4caf50, solid: true, opaque: true });
    this.register({ id: 3, name: 'sand', color: 0xf4d03f, solid: true, opaque: true });
    this.register({ id: 4, name: 'snow', color: 0xffffff, solid: true, opaque: true });
    this.register({ id: 5, name: 'empty', color: 0x000000, solid: false, opaque: false, transparent: true });
    this.register({ id: 6, name: 'water', color: 0x4444ff, solid: false, opaque: false, fluid: true, transparent: true });
    this.register({ id: 7, name: 'coal', color: 0x222222, solid: true, opaque: true });
    this.register({ id: 8, name: 'iron', color: 0xcccccc, solid: true, opaque: true });
    this.register({ id: 9, name: 'wood', color: 0x5d4037, solid: true, opaque: true });
    this.register({ id: 10, name: 'leaves', color: 0x2e7d32, solid: true, opaque: false, transparent: true });
  }
}

export const blockRegistry = BlockRegistry.getInstance();
