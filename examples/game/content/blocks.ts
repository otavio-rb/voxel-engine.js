import { blockRegistry } from '@voxel/engine/chunk-worker';

export enum BlockType {
  Stone = 0,
  Dirt = 1,
  Grass = 2,
  Sand = 3,
  Snow = 4,
  Empty = 5,
  Water = 6,
  Coal = 7,
  Iron = 8,
  Wood = 9,
  Leaves = 10,
  Basalt = 11,
  Magma = 12,
  Lava = 13,
  Ash = 14,
  Obsidian = 15,
  Portal = 16,

  // ── Aether Dimension ──────────────────────
  AetherGrass = 17,
  AetherDirt = 18,
  Holystone = 19,
  MossyHolystone = 20,
  ColdAercloud = 21,
  BlueAercloud = 22,
  GoldenAercloud = 23,
  ZaniteOre = 24,
  GravititeOre = 25,
  AmbrosiumOre = 26,
  SkyrootLog = 27,
  SkyrootLeaves = 28,
  GoldenOakLeaves = 29,
  CarvedHolystone = 30,
  SunAltar = 31,

  // ── Overworld Biomes & Trees Expansion ────
  BirchLog = 32,
  BirchLeaves = 33,
  PineLog = 34,
  PineLeaves = 35,
  CherryLeaves = 36,
  JungleLog = 37,
  JungleLeaves = 38,
  Cactus = 39,
  Clay = 40,

  // ── Underground: estratos, biomas cavernosos e estruturas ──
  Deepslate = 41,
  Tuff = 42,
  Dripstone = 43,
  Gravel = 44,
  Moss = 45,
  GlowLichen = 46,
  CaveVine = 47,
  GlowBerries = 48,
  Mycelium = 49,
  MushroomStem = 50,
  RedMushroomCap = 51,
  BrownMushroomCap = 52,
  Glowshroom = 53,
  Amethyst = 54,
  AmethystCluster = 55,
  Calcite = 56,
  SmoothBasalt = 57,

  // ── Flora e Vegetação de Superfície e Subsolo (Micro-voxels 3D) ──
  TallGrass = 58,
  RedFlower = 59,
  YellowFlower = 60,
  RedMushroom = 61,
  BrownMushroom = 62,
  VioletGlowshroom = 63,
  CrimsonFungus = 64,
  WarpedFungus = 65,
  GoldenMushroom = 66,
  ShelfFungus = 67,

  // ── Lush Caves Decorações Especiais (Micro-voxels 3D) ─────────
  VictoriaRegia = 68,
  SporeBlossom = 69,
  CaveFlower = 70,
  HangingRoots = 71,
  BigDripleaf = 72,
}

export function registerBlocks(): void {
  blockRegistry.register({ id: 0, name: 'stone', color: 0x888888, solid: true, opaque: true });
  blockRegistry.register({ id: 1, name: 'dirt', color: 0x8b4513, solid: true, opaque: true });
  blockRegistry.register({ id: 2, name: 'grass', color: 0x4caf50, solid: true, opaque: true });
  blockRegistry.register({ id: 3, name: 'sand', color: 0xf4d03f, solid: true, opaque: true });
  blockRegistry.register({ id: 4, name: 'snow', color: 0xffffff, solid: true, opaque: true });
  blockRegistry.register({ id: 5, name: 'empty', color: 0x000000, air: true, solid: false, opaque: false, transparent: true });
  blockRegistry.register({ id: 6, name: 'water', color: 0x4444ff, solid: false, opaque: false, fluid: true, flows: true, swimmable: true, transparent: true });
  blockRegistry.register({ id: 7, name: 'coal', color: 0x222222, solid: true, opaque: true });
  blockRegistry.register({ id: 8, name: 'iron', color: 0xcccccc, solid: true, opaque: true });
  blockRegistry.register({ id: 9, name: 'wood', color: 0x5d4037, solid: true, opaque: true });
  blockRegistry.register({ id: 10, name: 'leaves', color: 0x2e7d32, solid: true, opaque: false, transparent: true });
  blockRegistry.register({ id: 11, name: 'basalt', color: 0x2b2b32, solid: true, opaque: true });
  blockRegistry.register({ id: 12, name: 'magma', color: 0xc83f12, solid: true, opaque: true, luminance: 0.8 });
  blockRegistry.register({ id: 13, name: 'lava', color: 0xff4500, solid: false, opaque: true, fluid: true, transparent: false, luminance: 1.0 });
  blockRegistry.register({ id: 14, name: 'ash', color: 0x48484e, solid: true, opaque: true });
  blockRegistry.register({ id: 15, name: 'obsidian', color: 0x191426, solid: true, opaque: true });
  blockRegistry.register({ id: 16, name: 'portal', color: 0x9c27b0, solid: false, opaque: false, transparent: true, luminance: 0.9 });

  // ── Aether Dimension Blocks ────────────────
  blockRegistry.register({ id: 17, name: 'aether_grass', color: 0x49d9a0, solid: true, opaque: true });
  blockRegistry.register({ id: 18, name: 'aether_dirt', color: 0x9c8479, solid: true, opaque: true });
  blockRegistry.register({ id: 19, name: 'holystone', color: 0xd4dee8, solid: true, opaque: true });
  blockRegistry.register({ id: 20, name: 'mossy_holystone', color: 0x9eb8b5, solid: true, opaque: true });
  blockRegistry.register({ id: 21, name: 'cold_aercloud', color: 0xe8f7fa, solid: true, opaque: false, transparent: true });
  blockRegistry.register({ id: 22, name: 'blue_aercloud', color: 0x64b5f6, solid: true, opaque: false, transparent: true });
  blockRegistry.register({ id: 23, name: 'golden_aercloud', color: 0xffe082, solid: true, opaque: false, transparent: true, luminance: 0.6 });
  blockRegistry.register({ id: 24, name: 'zanite_ore', color: 0xba68c8, solid: true, opaque: true, luminance: 0.3 });
  blockRegistry.register({ id: 25, name: 'gravitite_ore', color: 0xf06292, solid: true, opaque: true, luminance: 0.6 });
  blockRegistry.register({ id: 26, name: 'ambrosium_ore', color: 0xffd54f, solid: true, opaque: true, luminance: 0.7 });
  blockRegistry.register({ id: 27, name: 'skyroot_log', color: 0x795548, solid: true, opaque: true });
  blockRegistry.register({ id: 28, name: 'skyroot_leaves', color: 0x4db6ac, solid: true, opaque: false, transparent: true });
  blockRegistry.register({ id: 29, name: 'golden_oak_leaves', color: 0xffb300, solid: true, opaque: false, transparent: true, luminance: 0.6 });
  blockRegistry.register({ id: 30, name: 'carved_holystone', color: 0xb0bec5, solid: true, opaque: true });
  blockRegistry.register({ id: 31, name: 'sun_altar', color: 0xffca28, solid: true, opaque: true, luminance: 1.0 });

  // ── Overworld Tree & Biome Expansion ────────
  blockRegistry.register({ id: 32, name: 'birch_log', color: 0xf2eee9, solid: true, opaque: true });
  blockRegistry.register({ id: 33, name: 'birch_leaves', color: 0x689f38, solid: true, opaque: false, transparent: true });
  blockRegistry.register({ id: 34, name: 'pine_log', color: 0x3e2723, solid: true, opaque: true });
  blockRegistry.register({ id: 35, name: 'pine_leaves', color: 0x1b5e20, solid: true, opaque: false, transparent: true });
  blockRegistry.register({ id: 36, name: 'cherry_leaves', color: 0xf48fb1, solid: true, opaque: false, transparent: true });
  blockRegistry.register({ id: 37, name: 'jungle_log', color: 0x4e342e, solid: true, opaque: true });
  blockRegistry.register({ id: 38, name: 'jungle_leaves', color: 0x00c853, solid: true, opaque: false, transparent: true });
  blockRegistry.register({ id: 39, name: 'cactus', color: 0x388e3c, solid: true, opaque: true });
  blockRegistry.register({ id: 40, name: 'clay', color: 0x90a4ae, solid: true, opaque: true });

  // ── Underground: estratos, biomas cavernosos e estruturas ──
  blockRegistry.register({ id: 41, name: 'deepslate', color: 0x4b4b55, solid: true, opaque: true });
  blockRegistry.register({ id: 42, name: 'tuff', color: 0x6b6d62, solid: true, opaque: true });
  blockRegistry.register({ id: 43, name: 'dripstone', color: 0x9a7f6c, solid: true, opaque: true });
  blockRegistry.register({ id: 44, name: 'gravel', color: 0x7e7a75, solid: true, opaque: true });
  blockRegistry.register({ id: 45, name: 'moss', color: 0x4f7a2a, solid: true, opaque: true });
  blockRegistry.register({ id: 46, name: 'glow_lichen', color: 0x7fe3a0, meshType: 'microvoxel', luminance: 0.5 });
  blockRegistry.register({ id: 47, name: 'cave_vine', color: 0x4e7a2e, meshType: 'microvoxel' });
  blockRegistry.register({ id: 48, name: 'glow_berries', color: 0xffb732, meshType: 'microvoxel', luminance: 0.95 });
  blockRegistry.register({ id: 49, name: 'mycelium', color: 0x6f5f73, solid: true, opaque: true });
  blockRegistry.register({ id: 50, name: 'mushroom_stem', color: 0xd8d2c4, solid: true, opaque: true });
  blockRegistry.register({ id: 51, name: 'red_mushroom_cap', color: 0xb5342a, solid: true, opaque: true, luminance: 0.65 });
  blockRegistry.register({ id: 52, name: 'brown_mushroom_cap', color: 0x8a6240, solid: true, opaque: true, luminance: 0.65 });
  blockRegistry.register({ id: 53, name: 'glowshroom', color: 0x58e0d0, meshType: 'microvoxel', luminance: 0.90 });
  blockRegistry.register({ id: 54, name: 'amethyst', color: 0x9b6fd4, solid: true, opaque: true, luminance: 0.20 });
  blockRegistry.register({ id: 55, name: 'amethyst_cluster', color: 0xc9a6ff, meshType: 'microvoxel', luminance: 0.75 });
  blockRegistry.register({ id: 56, name: 'calcite', color: 0xe8e6df, solid: true, opaque: true });
  blockRegistry.register({ id: 57, name: 'smooth_basalt', color: 0x3a3a42, solid: true, opaque: true });

  // ── Flora e Vegetação de Superfície e Subsolo (Micro-voxels 3D) ──
  blockRegistry.register({ id: 58, name: 'tall_grass', color: 0x55aa28, meshType: 'microvoxel' });
  blockRegistry.register({ id: 59, name: 'red_flower', color: 0xe53935, meshType: 'microvoxel' });
  blockRegistry.register({ id: 60, name: 'yellow_flower', color: 0xfdd835, meshType: 'microvoxel' });
  blockRegistry.register({ id: 61, name: 'red_mushroom', color: 0xd32f2f, meshType: 'microvoxel', luminance: 0.45 });
  blockRegistry.register({ id: 62, name: 'brown_mushroom', color: 0x8d6e63, meshType: 'microvoxel', luminance: 0.55 });
  blockRegistry.register({ id: 63, name: 'violet_glowshroom', color: 0x9333ea, meshType: 'microvoxel', luminance: 0.90 });
  blockRegistry.register({ id: 64, name: 'crimson_fungus', color: 0xdc2626, meshType: 'microvoxel', luminance: 0.70 });
  blockRegistry.register({ id: 65, name: 'warped_fungus', color: 0x0d9488, meshType: 'microvoxel', luminance: 0.80 });
  blockRegistry.register({ id: 66, name: 'golden_mushroom', color: 0xf59e0b, meshType: 'microvoxel', luminance: 1.00 });
  blockRegistry.register({ id: 67, name: 'shelf_fungus', color: 0x795548, meshType: 'microvoxel', luminance: 0.45 });

  // ── Lush Caves Flora & Decorações (Micro-voxels 3D) ───────────
  blockRegistry.register({ id: 68, name: 'victoria_regia', color: 0x2e7d32, meshType: 'microvoxel', luminance: 0.50 });
  blockRegistry.register({ id: 69, name: 'spore_blossom', color: 0xe91e63, meshType: 'microvoxel', luminance: 0.90 });
  blockRegistry.register({ id: 70, name: 'cave_flower', color: 0xf06292, meshType: 'microvoxel', luminance: 0.55 });
  blockRegistry.register({ id: 71, name: 'hanging_roots', color: 0x795548, meshType: 'microvoxel' });
  blockRegistry.register({ id: 72, name: 'big_dripleaf', color: 0x388e3c, meshType: 'microvoxel' });
}
