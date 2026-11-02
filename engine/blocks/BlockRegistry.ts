/** Block ID used for empty space. Chunks are filled with it before generation. */
export const AIR = -1;

/** Minecraft's slipperiness for ordinary blocks. */
export const DEFAULT_SLIPPERINESS = 0.6;

export interface MicrovoxelBuilderContext {
  wx: number;
  wy: number;
  wz: number;
  skyLight: number;
  blkLight: number;
  emissive: number;
  getNeighbourBlock: (nx: number, ny: number, nz: number) => number;
  addBox: (
    x0: number, y0: number, z0: number,
    x1: number, y1: number, z1: number,
    r: number, g: number, b: number,
    boxEmissive?: number
  ) => void;
}

export type MicrovoxelMeshBuilder = (ctx: MicrovoxelBuilderContext) => void;

export interface FluidReactionRule {
  /** Block ID placed at the reaction site (or self cell). */
  resultBlockId?: number;
  /** Block ID placed at the other fluid's position (default: AIR). */
  otherResultBlockId?: number;
  /** Alias for the block ID this fluid cell becomes on contact. */
  selfBecomes?: number;
  /** Alias for the block ID the neighbor fluid cell becomes on contact. */
  neighborBecomes?: number;
  /** Particle color emitted on reaction (default: 0xEEF2F7). */
  particleColor?: number;
}

export interface FluidBlockConfig {
  /** Viscosity in simulation ticks (1 = flows every tick like water, 3 = flows every 3rd tick like lava). */
  viscosity?: number;
  /** True if this block acts as a continuous fluid source/spring. */
  isSpring?: boolean;
  /** For springs: the fluid block ID emitted into adjacent passable cells. */
  emitsFluidId?: number;
  /** Chemical reactions when touching another block ID (e.g. water touching lava -> basalt). */
  reactions?: Record<number, FluidReactionRule>;
}

export type BlockSurfaceType = 'default' | 'stone' | 'foliage' | 'magma' | 'water' | 'lava';

/** Numeric material IDs passed via vertex UV.y to shaders so shaders don't guess material from RGB. */
export const SURFACE_TYPE_ID: Record<BlockSurfaceType, number> = {
  default: 0,
  stone: 1,
  foliage: 2,
  magma: 3,
  water: 4,
  lava: 5
};

export interface BlockConfig {
  /** Must fit in an Int16Array (0..1023); negative IDs are reserved for air. */
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
  /** Custom 3D micro-box geometry builder for 'microvoxel' / 'cross' blocks. */
  meshBuilder?: MicrovoxelMeshBuilder;
  /** Cellular automata fluid simulation rules (viscosity, springs, reactions). */
  fluidConfig?: FluidBlockConfig;
  /** Surface shader material hint ('default', 'stone', 'foliage', 'magma', 'water', 'lava'). */
  surfaceType?: BlockSurfaceType;
  /** Explicit surface roughness (0.03 to 1.0) for GGX specular lighting. */
  roughness?: number;
}

/** Capacidade da tabela indexada de propriedades de blocos (0..1023 cabem em Int16Array). */
const BLOCK_TABLE_SIZE = 1024;

// Dez flags, por isso Uint16Array e nao Uint8Array.
const F_REGISTERED  = 1 << 0;
const F_SOLID       = 1 << 1;
const F_OPAQUE      = 1 << 2;
const F_FLUID       = 1 << 3;
const F_AIR         = 1 << 4;
const F_TRANSPARENT = 1 << 5;
const F_SWIMMABLE   = 1 << 6;
const F_MICROVOXEL  = 1 << 7;
const F_FLOWS       = 1 << 8;
const F_SPRING      = 1 << 9;

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

  /**
   * Propriedades de bloco em tabelas indexadas por id, em vez de `Map.get` por consulta.
   *
   * Isto esta no caminho mais quente da engine. Medido num chunk 32^3 de subsolo, que produz
   * ZERO quads: o greedy meshing levava 18.6 ms, dominado pelo trabalho por celula e nao pela
   * geometria. A varredura visita 6 faces x 32 camadas x 32x32 = 196 mil celulas e consulta o
   * registro varias vezes em cada uma (no arquivo: isSolid 7 vezes, isFluid 6, isAir 4), e um
   * `Map.get` por consulta custa ~1.1 ms por 262 mil chamadas contra ~0.2 ms indexado.
   *
   * O bit F_REGISTERED preserva a semantica exata de id nao registrado, que difere por
   * acessor: `isTransparent` devolve true, `getSlipperiness` devolve o default, os outros
   * devolvem false.
   */
  private readonly flags = new Uint16Array(BLOCK_TABLE_SIZE);
  private readonly lightOpacityTable = new Uint8Array(BLOCK_TABLE_SIZE);
  private readonly lightEmissionTable = new Uint8Array(BLOCK_TABLE_SIZE);
  // Float64 e nao Float32: slipperiness entra na formula de movimento, e em Float32 o 0.6
  // padrao viraria 0.6000000238418579, mudando a fisica nos ultimos bits sem motivo.
  private readonly slipperinessTable = new Float64Array(BLOCK_TABLE_SIZE);
  private readonly colorTable = new Uint32Array(BLOCK_TABLE_SIZE);
  private readonly surfaceTypeTable = new Uint8Array(BLOCK_TABLE_SIZE);
  private readonly viscosityTable = new Uint8Array(BLOCK_TABLE_SIZE);
  private readonly springEmitsTable = new Int16Array(BLOCK_TABLE_SIZE).fill(-1);
  private readonly meshBuilderTable: Array<MicrovoxelMeshBuilder | undefined> = new Array(BLOCK_TABLE_SIZE);

  public register(config: BlockConfig): void {
    const isSpecial = config.meshType === 'microvoxel' || config.meshType === 'cross' || !!config.meshBuilder;
    const fullConfig: BlockConfig = {
      solid: isSpecial ? false : true,
      opaque: isSpecial ? false : true,
      fluid: false,
      flows: false,
      swimmable: false,
      transparent: isSpecial ? true : false,
      air: false,
      luminance: 0,
      meshType: config.meshBuilder ? 'microvoxel' : 'cube',
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
    this.cache(fullConfig);
  }

  /** Preenche as tabelas indexadas para um bloco recem-registrado. */
  private cache(b: BlockConfig): void {
    const id = b.id;
    if (id < 0 || id >= BLOCK_TABLE_SIZE) return;

    const special = b.meshType === 'microvoxel' || b.meshType === 'cross' || !!b.meshBuilder;
    let f = F_REGISTERED;
    if (b.solid ?? true) f |= F_SOLID;
    if (b.opaque ?? true) f |= F_OPAQUE;
    if (b.fluid ?? false) f |= F_FLUID;
    if (b.air ?? false) f |= F_AIR;
    if (b.transparent ?? false) f |= F_TRANSPARENT;
    if (b.swimmable ?? false) f |= F_SWIMMABLE;
    if (b.flows ?? false) f |= F_FLOWS;
    if (special) f |= F_MICROVOXEL;
    if (b.fluidConfig?.isSpring) f |= F_SPRING;
    this.flags[id] = f;

    this.lightOpacityTable[id] =
      b.lightOpacity !== undefined ? b.lightOpacity
      : b.air ? 0
      : b.opaque ? 15
      : b.fluid ? 2
      : 1;
    // Suporta tanto luminance em [0..1] quanto em [0..15] (como usado em tiny-voxels)
    const rawLum = b.luminance ?? 0;
    const normLum = rawLum > 1.0 ? rawLum : Math.round(rawLum * 15);
    this.lightEmissionTable[id] = Math.max(0, Math.min(15, Math.round(normLum)));
    this.slipperinessTable[id] = b.slipperiness ?? DEFAULT_SLIPPERINESS;
    this.colorTable[id] = b.color;

    const surf = b.surfaceType ?? (b.fluid ? (b.swimmable ? 'water' : 'lava') : 'default');
    this.surfaceTypeTable[id] = SURFACE_TYPE_ID[surf] ?? 0;
    this.viscosityTable[id] = Math.max(1, b.fluidConfig?.viscosity ?? (b.fluid && !b.swimmable ? 3 : 1));
    this.springEmitsTable[id] = b.fluidConfig?.emitsFluidId ?? -1;
    this.meshBuilderTable[id] = b.meshBuilder;
  }

  /** True quando o id tem entrada nas tabelas indexadas. */
  private cached(id: number): boolean {
    return id >= 0 && id < BLOCK_TABLE_SIZE && (this.flags[id] & F_REGISTERED) !== 0;
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
    return (this.flags[id] & (F_REGISTERED | F_SOLID)) === (F_REGISTERED | F_SOLID);
  }

  public isOpaque(id: number): boolean {
    if (id < 0) return false;
    return (this.flags[id] & (F_REGISTERED | F_OPAQUE)) === (F_REGISTERED | F_OPAQUE);
  }

  public isFluid(id: number): boolean {
    if (id < 0) return false;
    return (this.flags[id] & (F_REGISTERED | F_FLUID)) === (F_REGISTERED | F_FLUID);
  }

  public isSpring(id: number): boolean {
    if (id < 0) return false;
    return (this.flags[id] & (F_REGISTERED | F_SPRING)) === (F_REGISTERED | F_SPRING);
  }

  public getSpringEmittedFluidId(id: number): number {
    if (!this.cached(id)) return -1;
    return this.springEmitsTable[id];
  }

  public getFluidViscosity(id: number): number {
    if (!this.cached(id)) return 1;
    return this.viscosityTable[id] || 1;
  }

  public getFluidReactions(id: number): Record<number, FluidReactionRule> | undefined {
    return this.blocks.get(id)?.fluidConfig?.reactions;
  }

  public getSurfaceTypeId(id: number): number {
    if (!this.cached(id)) return 0;
    return this.surfaceTypeTable[id];
  }

  public getMeshBuilder(id: number): MicrovoxelMeshBuilder | undefined {
    if (!this.cached(id)) return undefined;
    return this.meshBuilderTable[id];
  }

  /** Light lost when entering the block (0-15); see `BlockConfig.lightOpacity`. */
  public getLightOpacity(id: number): number {
    if (id < 0 || !this.cached(id)) return 0;
    return this.lightOpacityTable[id];
  }

  /** Block light level (0-15) emitted by the block, from its luminance (0-1). */
  public getLightEmission(id: number): number {
    if (id < 0 || !this.cached(id)) return 0;
    return this.lightEmissionTable[id];
  }

  public getSlipperiness(id: number): number {
    if (id < 0 || !this.cached(id)) return DEFAULT_SLIPPERINESS;
    return this.slipperinessTable[id];
  }

  public flows(id: number): boolean {
    if (id < 0) return false;
    return (this.flags[id] & (F_REGISTERED | F_FLOWS)) === (F_REGISTERED | F_FLOWS);
  }

  public isSwimmable(id: number): boolean {
    if (id < 0) return false;
    return (this.flags[id] & (F_REGISTERED | F_SWIMMABLE)) === (F_REGISTERED | F_SWIMMABLE);
  }

  /** True for empty space: negative IDs and blocks registered with `air: true`. */
  public isAir(id: number): boolean {
    if (id < 0) return true;
    return (this.flags[id] & (F_REGISTERED | F_AIR)) === (F_REGISTERED | F_AIR);
  }

  public isTransparent(id: number): boolean {
    if (id < 0) return true;
    // Id desconhecido conta como transparente, como antes: e o lado seguro para o culling.
    if (!this.cached(id)) return true;
    return (this.flags[id] & F_TRANSPARENT) !== 0;
  }

  public isMicrovoxel(id: number): boolean {
    if (id < 0) return false;
    return (this.flags[id] & (F_REGISTERED | F_MICROVOXEL)) === (F_REGISTERED | F_MICROVOXEL);
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
    return this.cached(id) ? this.colorTable[id] : 0xffffff;
  }

  public getAll(): BlockConfig[] {
    return Array.from(this.blocks.values());
  }
}

export const blockRegistry = BlockRegistry.getInstance();
