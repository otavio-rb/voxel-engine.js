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
    this.register({ id: 11, name: 'basalt', color: 0x2b2b32, solid: true, opaque: true });
    this.register({ id: 12, name: 'magma', color: 0xc83f12, solid: true, opaque: true, luminance: 0.8 });
    this.register({ id: 13, name: 'lava', color: 0xff4500, solid: false, opaque: true, fluid: true, transparent: false, luminance: 1.0 });
    this.register({ id: 14, name: 'ash', color: 0x48484e, solid: true, opaque: true });
    this.register({ id: 15, name: 'obsidian', color: 0x191426, solid: true, opaque: true });
    this.register({ id: 16, name: 'portal', color: 0x9c27b0, solid: false, opaque: false, transparent: true, luminance: 0.9 });

    // ── Aether Dimension Blocks ────────────────
    this.register({ id: 17, name: 'aether_grass', color: 0x49d9a0, solid: true, opaque: true });
    this.register({ id: 18, name: 'aether_dirt', color: 0x9c8479, solid: true, opaque: true });
    this.register({ id: 19, name: 'holystone', color: 0xd4dee8, solid: true, opaque: true });
    this.register({ id: 20, name: 'mossy_holystone', color: 0x9eb8b5, solid: true, opaque: true });
    this.register({ id: 21, name: 'cold_aercloud', color: 0xe8f7fa, solid: true, opaque: false, transparent: true });
    this.register({ id: 22, name: 'blue_aercloud', color: 0x64b5f6, solid: true, opaque: false, transparent: true });
    this.register({ id: 23, name: 'golden_aercloud', color: 0xffe082, solid: true, opaque: false, transparent: true, luminance: 0.6 });
    this.register({ id: 24, name: 'zanite_ore', color: 0xba68c8, solid: true, opaque: true, luminance: 0.3 });
    this.register({ id: 25, name: 'gravitite_ore', color: 0xf06292, solid: true, opaque: true, luminance: 0.6 });
    this.register({ id: 26, name: 'ambrosium_ore', color: 0xffd54f, solid: true, opaque: true, luminance: 0.7 });
    this.register({ id: 27, name: 'skyroot_log', color: 0x795548, solid: true, opaque: true });
    this.register({ id: 28, name: 'skyroot_leaves', color: 0x4db6ac, solid: true, opaque: false, transparent: true });
    this.register({ id: 29, name: 'golden_oak_leaves', color: 0xffb300, solid: true, opaque: false, transparent: true, luminance: 0.6 });
    this.register({ id: 30, name: 'carved_holystone', color: 0xb0bec5, solid: true, opaque: true });
    this.register({ id: 31, name: 'sun_altar', color: 0xffca28, solid: true, opaque: true, luminance: 1.0 });

    // ── Overworld Tree & Biome Expansion ────────
    this.register({ id: 32, name: 'birch_log', color: 0xf2eee9, solid: true, opaque: true });
    this.register({ id: 33, name: 'birch_leaves', color: 0x689f38, solid: true, opaque: false, transparent: true });
    this.register({ id: 34, name: 'pine_log', color: 0x3e2723, solid: true, opaque: true });
    this.register({ id: 35, name: 'pine_leaves', color: 0x1b5e20, solid: true, opaque: false, transparent: true });
    this.register({ id: 36, name: 'cherry_leaves', color: 0xf48fb1, solid: true, opaque: false, transparent: true });
    this.register({ id: 37, name: 'jungle_log', color: 0x4e342e, solid: true, opaque: true });
    this.register({ id: 38, name: 'jungle_leaves', color: 0x00c853, solid: true, opaque: false, transparent: true });
    this.register({ id: 39, name: 'cactus', color: 0x388e3c, solid: true, opaque: true });
    this.register({ id: 40, name: 'clay', color: 0x90a4ae, solid: true, opaque: true });
  }
}

export const blockRegistry = BlockRegistry.getInstance();
