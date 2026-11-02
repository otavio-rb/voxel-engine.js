import { blockRegistry } from '@voxel/engine/chunk-worker';

export enum TinyBlockType {
  // Geological & Earth
  DarkSlate = 0,
  Marble = 1,
  Terracotta = 2,
  Granite = 3,
  Sandstone = 4,
  Basalt = 5,
  RichSoil = 6,
  Clay = 7,
  Gravel = 8,

  // Vegetation & Organic
  LushGrass = 9,
  Moss = 10,
  PineEmerald = 11,
  SakuraBlossom = 12,
  AutumnAmber = 13,
  LavenderFlower = 14,
  DeepOak = 15,
  BirchBark = 16,

  // Architecture & Construction
  WhitePlaster = 17,
  RedBrick = 18,
  PolishedWalnut = 19,
  Steel = 20,
  Brass = 21,
  Glass = 22,

  // Crystals & Light Emitters
  LapisAzure = 23,
  AmethystViolet = 24,
  EmeraldGem = 25,
  RubyRed = 26,
  NeonCyan = 27,
  WarmLantern = 28,
  LavaCore = 29,

  // Fluids & Springs
  ClearWater = 30,
  WaterSpring = 31
}

export interface TinyBlockMeta {
  id: TinyBlockType;
  name: string;
  category: 'earth' | 'nature' | 'architecture' | 'crystal' | 'fluid';
  colorHex: string;
  emissive?: boolean;
}

export const TINY_BLOCK_METAS: TinyBlockMeta[] = [
  // Geological
  { id: TinyBlockType.Marble, name: 'Mármore Alabastro', category: 'earth', colorHex: '#F0ECE1' },
  { id: TinyBlockType.DarkSlate, name: 'Ardósia Escura', category: 'earth', colorHex: '#252830' },
  { id: TinyBlockType.Terracotta, name: 'Terracota Rústica', category: 'earth', colorHex: '#C35E42' },
  { id: TinyBlockType.Granite, name: 'Granito Rosado', category: 'earth', colorHex: '#9D6B62' },
  { id: TinyBlockType.Sandstone, name: 'Arenito Dourado', category: 'earth', colorHex: '#D8B17A' },
  { id: TinyBlockType.Basalt, name: 'Basalto Vulcânico', category: 'earth', colorHex: '#3D3F43' },
  { id: TinyBlockType.RichSoil, name: 'Solo Fértil', category: 'earth', colorHex: '#4E3629' },
  { id: TinyBlockType.Clay, name: 'Argila Cinzenta', category: 'earth', colorHex: '#8C969E' },
  { id: TinyBlockType.Gravel, name: 'Cascalho Fino', category: 'earth', colorHex: '#696C72' },

  // Nature
  { id: TinyBlockType.LushGrass, name: 'Grama Vívida', category: 'nature', colorHex: '#439C32' },
  { id: TinyBlockType.Moss, name: 'Musgo Profundo', category: 'nature', colorHex: '#587A31' },
  { id: TinyBlockType.PineEmerald, name: 'Folhagem Esmeralda', category: 'nature', colorHex: '#1B5E36' },
  { id: TinyBlockType.SakuraBlossom, name: 'Flor de Cerejeira', category: 'nature', colorHex: '#F2A0B5' },
  { id: TinyBlockType.AutumnAmber, name: 'Folha de Outono', category: 'nature', colorHex: '#DC5A28' },
  { id: TinyBlockType.LavenderFlower, name: 'Lavanda Silvestre', category: 'nature', colorHex: '#9B72CF' },
  { id: TinyBlockType.DeepOak, name: 'Carvalho Escuro', category: 'nature', colorHex: '#5C381E' },
  { id: TinyBlockType.BirchBark, name: 'Tronco de Bétula', category: 'nature', colorHex: '#DDD5C7' },

  // Architecture
  { id: TinyBlockType.WhitePlaster, name: 'Gesso Branco', category: 'architecture', colorHex: '#F8F9FA' },
  { id: TinyBlockType.RedBrick, name: 'Tijolo Cerâmico', category: 'architecture', colorHex: '#A33E2B' },
  { id: TinyBlockType.PolishedWalnut, name: 'Nogueira Polida', category: 'architecture', colorHex: '#3E2723' },
  { id: TinyBlockType.Steel, name: 'Aço Refinado', category: 'architecture', colorHex: '#8A95A5' },
  { id: TinyBlockType.Brass, name: 'Latão Dourado', category: 'architecture', colorHex: '#D4AF37' },
  { id: TinyBlockType.Glass, name: 'Vidro Cristalino', category: 'architecture', colorHex: '#A0D2EB' },

  // Crystals & Light
  { id: TinyBlockType.LapisAzure, name: 'Lápis-Lazúli', category: 'crystal', colorHex: '#1B4D89' },
  { id: TinyBlockType.AmethystViolet, name: 'Ametista Mística', category: 'crystal', colorHex: '#8E44AD', emissive: true },
  { id: TinyBlockType.EmeraldGem, name: 'Gema Esmeralda', category: 'crystal', colorHex: '#27AE60', emissive: true },
  { id: TinyBlockType.RubyRed, name: 'Rubi Carmesim', category: 'crystal', colorHex: '#C0392B', emissive: true },
  { id: TinyBlockType.NeonCyan, name: 'Neon Ciano', category: 'crystal', colorHex: '#00F0FF', emissive: true },
  { id: TinyBlockType.WarmLantern, name: 'Lanterna Quente', category: 'crystal', colorHex: '#FFB703', emissive: true },
  { id: TinyBlockType.LavaCore, name: 'Núcleo de Magma', category: 'crystal', colorHex: '#FF4500', emissive: true },

  // Fluid & Springs
  { id: TinyBlockType.ClearWater, name: 'Água Pura', category: 'fluid', colorHex: '#3388CC' },
  { id: TinyBlockType.WaterSpring, name: 'Nascente Natural', category: 'fluid', colorHex: '#4BA3E3', emissive: true }
];

export function registerBlocks(): void {
  // Geological
  blockRegistry.register({ id: TinyBlockType.DarkSlate, name: 'Dark Slate', color: 0x252830, solid: true, opaque: true, surfaceType: 'stone' });
  blockRegistry.register({ id: TinyBlockType.Marble, name: 'Marble', color: 0xF0ECE1, solid: true, opaque: true, surfaceType: 'stone' });
  blockRegistry.register({ id: TinyBlockType.Terracotta, name: 'Terracotta', color: 0xC35E42, solid: true, opaque: true, surfaceType: 'stone' });
  blockRegistry.register({ id: TinyBlockType.Granite, name: 'Granite', color: 0x9D6B62, solid: true, opaque: true, surfaceType: 'stone' });
  blockRegistry.register({ id: TinyBlockType.Sandstone, name: 'Sandstone', color: 0xD8B17A, solid: true, opaque: true, surfaceType: 'stone' });
  blockRegistry.register({ id: TinyBlockType.Basalt, name: 'Basalt', color: 0x3D3F43, solid: true, opaque: true, surfaceType: 'stone' });
  blockRegistry.register({ id: TinyBlockType.RichSoil, name: 'Rich Soil', color: 0x4E3629, solid: true, opaque: true });
  blockRegistry.register({ id: TinyBlockType.Clay, name: 'Clay', color: 0x8C969E, solid: true, opaque: true, surfaceType: 'stone' });
  blockRegistry.register({ id: TinyBlockType.Gravel, name: 'Gravel', color: 0x696C72, solid: true, opaque: true, surfaceType: 'stone' });

  // Nature
  blockRegistry.register({ id: TinyBlockType.LushGrass, name: 'Lush Grass', color: 0x439C32, solid: true, opaque: true, surfaceType: 'foliage' });
  blockRegistry.register({ id: TinyBlockType.Moss, name: 'Moss', color: 0x587A31, solid: true, opaque: true, surfaceType: 'foliage' });
  blockRegistry.register({ id: TinyBlockType.PineEmerald, name: 'Pine Foliage', color: 0x1B5E36, solid: true, opaque: true, surfaceType: 'foliage' });
  blockRegistry.register({ id: TinyBlockType.SakuraBlossom, name: 'Sakura Blossom', color: 0xF2A0B5, solid: true, opaque: true, surfaceType: 'foliage' });
  blockRegistry.register({ id: TinyBlockType.AutumnAmber, name: 'Autumn Foliage', color: 0xDC5A28, solid: true, opaque: true, surfaceType: 'foliage' });
  blockRegistry.register({ id: TinyBlockType.LavenderFlower, name: 'Lavender Flower', color: 0x9B72CF, solid: true, opaque: true, surfaceType: 'foliage' });
  blockRegistry.register({ id: TinyBlockType.DeepOak, name: 'Deep Oak', color: 0x5C381E, solid: true, opaque: true });
  blockRegistry.register({ id: TinyBlockType.BirchBark, name: 'Birch Bark', color: 0xDDD5C7, solid: true, opaque: true });

  // Architecture
  blockRegistry.register({ id: TinyBlockType.WhitePlaster, name: 'White Plaster', color: 0xF8F9FA, solid: true, opaque: true, surfaceType: 'stone' });
  blockRegistry.register({ id: TinyBlockType.RedBrick, name: 'Red Brick', color: 0xA33E2B, solid: true, opaque: true, surfaceType: 'stone' });
  blockRegistry.register({ id: TinyBlockType.PolishedWalnut, name: 'Polished Walnut', color: 0x3E2723, solid: true, opaque: true });
  blockRegistry.register({ id: TinyBlockType.Steel, name: 'Steel', color: 0x8A95A5, solid: true, opaque: true, surfaceType: 'stone' });
  blockRegistry.register({ id: TinyBlockType.Brass, name: 'Brass', color: 0xD4AF37, solid: true, opaque: true, surfaceType: 'stone' });
  blockRegistry.register({ id: TinyBlockType.Glass, name: 'Glass', color: 0xA0D2EB, solid: true, opaque: false, transparent: true, lightOpacity: 1 });

  // Crystals & Light
  blockRegistry.register({ id: TinyBlockType.LapisAzure, name: 'Lapis Azure', color: 0x1B4D89, solid: true, opaque: true, surfaceType: 'stone' });
  blockRegistry.register({ id: TinyBlockType.AmethystViolet, name: 'Amethyst', color: 0x8E44AD, solid: true, opaque: true, luminance: 10 });
  blockRegistry.register({ id: TinyBlockType.EmeraldGem, name: 'Emerald', color: 0x27AE60, solid: true, opaque: true, luminance: 8 });
  blockRegistry.register({ id: TinyBlockType.RubyRed, name: 'Ruby', color: 0xC0392B, solid: true, opaque: true, luminance: 8 });
  blockRegistry.register({ id: TinyBlockType.NeonCyan, name: 'Neon Cyan', color: 0x00F0FF, solid: true, opaque: true, luminance: 15 });
  blockRegistry.register({ id: TinyBlockType.WarmLantern, name: 'Warm Lantern', color: 0xFFB703, solid: true, opaque: true, luminance: 14 });
  // Fluids
  blockRegistry.register({
    id: TinyBlockType.LavaCore,
    name: 'Lava Core',
    color: 0xFF4500,
    solid: false,
    opaque: true,
    fluid: true,
    flows: true,
    swimmable: false,
    luminance: 15,
    lightOpacity: 1,
    surfaceType: 'lava',
    fluidConfig: {
      viscosity: 3,
      reactions: {
        [TinyBlockType.ClearWater]: {
          resultBlockId: TinyBlockType.Basalt,
          otherResultBlockId: -1,
          particleColor: 0xEEF2F7
        }
      }
    }
  });
  blockRegistry.register({
    id: TinyBlockType.ClearWater,
    name: 'Clear Water',
    color: 0x3388CC,
    solid: false,
    opaque: false,
    fluid: true,
    flows: true,
    swimmable: true,
    transparent: true,
    lightOpacity: 2,
    surfaceType: 'water',
    fluidConfig: {
      viscosity: 1,
      reactions: {
        [TinyBlockType.LavaCore]: {
          resultBlockId: TinyBlockType.Basalt,
          otherResultBlockId: -1,
          particleColor: 0xEEF2F7
        }
      }
    }
  });
  blockRegistry.register({
    id: TinyBlockType.WaterSpring,
    name: 'Water Spring',
    color: 0x4BA3E3,
    solid: true,
    opaque: true,
    luminance: 6,
    lightOpacity: 1,
    surfaceType: 'water',
    fluidConfig: {
      isSpring: true,
      emitsFluidId: TinyBlockType.ClearWater
    }
  });
}
