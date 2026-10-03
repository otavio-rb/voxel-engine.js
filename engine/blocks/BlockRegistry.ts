/** Block ID used for empty space. Chunks are filled with it before generation. */
export const AIR = -1;

/** Minecraft's slipperiness for ordinary blocks. */
export const DEFAULT_SLIPPERINESS = 0.6;

export interface BlockConfig {
  /** Must fit in an Int8Array (0..127); negative IDs are reserved for air. */
  id: number;
  name: string;
  color: number;
  solid?: boolean;
  opaque?: boolean;
  fluid?: boolean;
  /** Fluid that spreads through the scalar-field simulation (e.g. water). */
  flows?: boolean;
  /** Entities inside this block swim instead of falling (e.g. water). */
  swimmable?: boolean;
  transparent?: boolean;
  luminance?: number;
  /**
   * How much light (0-15) is lost when entering this block, on top of the 1 lost per step.
   * Defaults: air 0, opaque 15, fluids 2, other transparent blocks 1.
   */
  lightOpacity?: number;
  /** Ground friction factor as in Minecraft: 0.6 default, 0.8 slime, 0.98 ice. */
  slipperiness?: number;
  /** Behaves as empty space: never meshed, never collides. */
  air?: boolean;
  /** 'cube' for standard 6-sided voxel blocks, or 'microvoxel'/'cross' for 3D micro-voxel models (plants, vines, mushrooms). */
  meshType?: 'cube' | 'microvoxel' | 'cross';
}

export class BlockRegistry {
  private static instance: BlockRegistry | null = null;
  private blocks: Map<number, BlockConfig> = new Map();
  private nameToId: Map<string, number> = new Map();

  public static getInstance(): BlockRegistry {
    if (!BlockRegistry.instance) {
      BlockRegistry.instance = new BlockRegistry();
    }
    return BlockRegistry.instance;
  }

  public register(config: BlockConfig): void {
    const isSpecial = config.meshType === 'microvoxel' || config.meshType === 'cross';
    const fullConfig: BlockConfig = {
      solid: isSpecial ? false : true,
      opaque: isSpecial ? false : true,
      fluid: false,
      flows: false,
      swimmable: false,
      transparent: isSpecial ? true : false,
      air: false,
      luminance: 0,
      meshType: 'cube',
      ...config
    };

    if (isSpecial) {
      if (config.solid === undefined) fullConfig.solid = false;
      if (config.opaque === undefined) fullConfig.opaque = false;
      if (config.transparent === undefined) fullConfig.transparent = true;
      if (config.lightOpacity === undefined) fullConfig.lightOpacity = 0;
    }

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

  /** Light lost when entering the block (0-15); see `BlockConfig.lightOpacity`. */
  public getLightOpacity(id: number): number {
    if (id < 0) return 0;
    const block = this.blocks.get(id);
    if (!block) return 0;
    if (block.lightOpacity !== undefined) return block.lightOpacity;
    if (block.air) return 0;
    if (block.opaque) return 15;
    if (block.fluid) return 2;
    return 1;
  }

  /** Block light level (0-15) emitted by the block, from its luminance (0-1). */
  public getLightEmission(id: number): number {
    if (id < 0) return 0;
    const luminance = this.blocks.get(id)?.luminance ?? 0;
    return Math.max(0, Math.min(15, Math.round(luminance * 15)));
  }

  public getSlipperiness(id: number): number {
    if (id < 0) return DEFAULT_SLIPPERINESS;
    return this.blocks.get(id)?.slipperiness ?? DEFAULT_SLIPPERINESS;
  }

  public flows(id: number): boolean {
    if (id < 0) return false;
    return this.blocks.get(id)?.flows ?? false;
  }

  public isSwimmable(id: number): boolean {
    if (id < 0) return false;
    return this.blocks.get(id)?.swimmable ?? false;
  }

  /** True for empty space: negative IDs and blocks registered with `air: true`. */
  public isAir(id: number): boolean {
    if (id < 0) return true;
    return this.blocks.get(id)?.air ?? false;
  }

  public isTransparent(id: number): boolean {
    if (id < 0) return true;
    const block = this.blocks.get(id);
    return block ? (block.transparent ?? false) : true;
  }

  public isMicrovoxel(id: number): boolean {
    if (id < 0) return false;
    const block = this.blocks.get(id);
    return block ? block.meshType === 'microvoxel' || block.meshType === 'cross' : false;
  }

  public isCrossMesh(id: number): boolean {
    return this.isMicrovoxel(id);
  }

  public isInteractable(id: number): boolean {
    if (id < 0) return false;
    const block = this.blocks.get(id);
    return block ? !block.air && !block.fluid : false;
  }

  public getColor(id: number): number {
    const block = this.blocks.get(id);
    return block ? block.color : 0xffffff;
  }

  public getAll(): BlockConfig[] {
    return Array.from(this.blocks.values());
  }
}

export const blockRegistry = BlockRegistry.getInstance();
