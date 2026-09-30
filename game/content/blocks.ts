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
}
