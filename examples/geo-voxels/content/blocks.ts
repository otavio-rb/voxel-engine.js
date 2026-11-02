import { AIR, blockRegistry } from '@voxel/engine/chunk-worker';
import {
  buildAmethystCluster,
  buildBigDripleaf,
  buildCaveFlower,
  buildCaveVine,
  buildGlowBerries,
  buildGlowLichen,
  buildHangingRoots,
  buildShelfFungus,
  buildSporeBlossom,
  buildTallGrass,
  buildVictoriaRegia,
  createMushroomBuilder,
  createSurfaceFlowerBuilder
} from './floraModels';
import { GEO_COLOR_PALETTE } from './geoPalette';

export { GEO_COLOR_PALETTE };

/** Primeiro id de bloco ocupado pela paleta fotorrealista. Declarado aqui porque
 *  `COLOR_LUT` e construido na carga do modulo e consulta este valor. */
export const GEO_BLOCK_ID_BASE = 73;

/** Limite de ExG a partir do qual uma cor da paleta conta como folhagem. */
export const FOLIAGE_EXG_THRESHOLD = 0.02;

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

  // ── Paleta Urbana & Arquitetônica (Google Photorealistic 3D Tiles) ──
  AsphaltDark = 73,
  AsphaltRoad = 74,
  PavementSlate = 75,
  ConcreteDark = 76,
  ConcreteBrutalist = 77,
  ConcreteMedium = 78,
  ConcreteLight = 79,
  SidewalkGrey = 80,
  FacadeSilver = 81,
  FacadeLight = 82,
  FacadeWhite = 83,
  SubsoilRock = 84,

  MaspCrimsonDark = 85,
  MaspCrimson = 86,
  MaspCrimsonBright = 87,

  FoliageShadow = 88,
  FoliageDeep = 89,
  FoliageTrianon = 90,
  FoliageCanopy = 91,
  FoliageBright = 92,
  UrbanMoss = 93,
  TreeTrunkDark = 94,

  FacadeCream = 95,
  FacadeTravertine = 96,
  FacadeBeige = 97,
  FacadeSandstone = 98,
  FacadeBrown = 99,
  TerracottaLight = 100,
  BrickPaulista = 101,
  BrickDark = 102,

  GlassDark = 103,
  GlassSteel = 104,
  GlassReflective = 105,
  GlassSky = 106,
  RoadYellow = 107,
  UrbanLantern = 108,
}

export function registerBlocks(): void {
  blockRegistry.register({ id: 0, name: 'stone', color: 0x888888, solid: true, opaque: true, surfaceType: 'stone' });
  blockRegistry.register({ id: 1, name: 'dirt', color: 0x8b4513, solid: true, opaque: true });
  blockRegistry.register({ id: 2, name: 'grass', color: 0x4caf50, solid: true, opaque: true });
  blockRegistry.register({ id: 3, name: 'sand', color: 0xf4d03f, solid: true, opaque: true });
  blockRegistry.register({ id: 4, name: 'snow', color: 0xffffff, solid: true, opaque: true });
  blockRegistry.register({ id: 5, name: 'empty', color: 0x000000, air: true, solid: false, opaque: false, transparent: true });
  blockRegistry.register({
    id: 6,
    name: 'water',
    color: 0x4444ff,
    solid: false,
    opaque: false,
    fluid: true,
    flows: true,
    swimmable: true,
    transparent: true,
    surfaceType: 'water',
    fluidConfig: {
      viscosity: 1,
      reactions: {
        13: { selfBecomes: AIR, neighborBecomes: 11, resultBlockId: AIR, otherResultBlockId: 11, particleColor: 0xEEF2F7 }
      }
    }
  });
  blockRegistry.register({ id: 7, name: 'coal', color: 0x222222, solid: true, opaque: true, surfaceType: 'stone' });
  blockRegistry.register({ id: 8, name: 'iron', color: 0xcccccc, solid: true, opaque: true, surfaceType: 'stone' });
  blockRegistry.register({ id: 9, name: 'wood', color: 0x5d4037, solid: true, opaque: true });
  blockRegistry.register({ id: 10, name: 'leaves', color: 0x2e7d32, solid: true, opaque: false, transparent: true, surfaceType: 'foliage' });
  blockRegistry.register({ id: 11, name: 'basalt', color: 0x2b2b32, solid: true, opaque: true, surfaceType: 'stone' });
  blockRegistry.register({ id: 12, name: 'magma', color: 0xc83f12, solid: true, opaque: true, luminance: 0.8, surfaceType: 'magma' });
  blockRegistry.register({
    id: 13,
    name: 'lava',
    color: 0xff4500,
    solid: false,
    opaque: true,
    fluid: true,
    transparent: false,
    luminance: 1.0,
    surfaceType: 'lava',
    fluidConfig: {
      viscosity: 3,
      reactions: {
        6: { selfBecomes: 11, neighborBecomes: AIR, resultBlockId: 11, otherResultBlockId: AIR, particleColor: 0xEEF2F7 }
      }
    }
  });
  blockRegistry.register({ id: 14, name: 'ash', color: 0x48484e, solid: true, opaque: true });
  blockRegistry.register({ id: 15, name: 'obsidian', color: 0x191426, solid: true, opaque: true, surfaceType: 'stone' });
  blockRegistry.register({ id: 16, name: 'portal', color: 0x9c27b0, solid: false, opaque: false, transparent: true, luminance: 0.9 });

  // ── Aether Dimension Blocks ────────────────
  blockRegistry.register({ id: 17, name: 'aether_grass', color: 0x49d9a0, solid: true, opaque: true });
  blockRegistry.register({ id: 18, name: 'aether_dirt', color: 0x9c8479, solid: true, opaque: true });
  blockRegistry.register({ id: 19, name: 'holystone', color: 0xd4dee8, solid: true, opaque: true, surfaceType: 'stone' });
  blockRegistry.register({ id: 20, name: 'mossy_holystone', color: 0x9eb8b5, solid: true, opaque: true, surfaceType: 'stone' });
  blockRegistry.register({ id: 21, name: 'cold_aercloud', color: 0xe8f7fa, solid: true, opaque: false, transparent: true });
  blockRegistry.register({ id: 22, name: 'blue_aercloud', color: 0x64b5f6, solid: true, opaque: false, transparent: true });
  blockRegistry.register({ id: 23, name: 'golden_aercloud', color: 0xffe082, solid: true, opaque: false, transparent: true, luminance: 0.6 });
  blockRegistry.register({ id: 24, name: 'zanite_ore', color: 0xba68c8, solid: true, opaque: true, luminance: 0.3, surfaceType: 'stone' });
  blockRegistry.register({ id: 25, name: 'gravitite_ore', color: 0xf06292, solid: true, opaque: true, luminance: 0.6, surfaceType: 'stone' });
  blockRegistry.register({ id: 26, name: 'ambrosium_ore', color: 0xffd54f, solid: true, opaque: true, luminance: 0.7, surfaceType: 'stone' });
  blockRegistry.register({ id: 27, name: 'skyroot_log', color: 0x795548, solid: true, opaque: true });
  blockRegistry.register({ id: 28, name: 'skyroot_leaves', color: 0x4db6ac, solid: true, opaque: false, transparent: true, surfaceType: 'foliage' });
  blockRegistry.register({ id: 29, name: 'golden_oak_leaves', color: 0xffb300, solid: true, opaque: false, transparent: true, luminance: 0.6, surfaceType: 'foliage' });
  blockRegistry.register({ id: 30, name: 'carved_holystone', color: 0xb0bec5, solid: true, opaque: true, surfaceType: 'stone' });
  blockRegistry.register({ id: 31, name: 'sun_altar', color: 0xffca28, solid: true, opaque: true, luminance: 1.0 });

  // ── Overworld Tree & Biome Expansion ────────
  blockRegistry.register({ id: 32, name: 'birch_log', color: 0xf2eee9, solid: true, opaque: true });
  blockRegistry.register({ id: 33, name: 'birch_leaves', color: 0x689f38, solid: true, opaque: false, transparent: true, surfaceType: 'foliage' });
  blockRegistry.register({ id: 34, name: 'pine_log', color: 0x3e2723, solid: true, opaque: true });
  blockRegistry.register({ id: 35, name: 'pine_leaves', color: 0x1b5e20, solid: true, opaque: false, transparent: true, surfaceType: 'foliage' });
  blockRegistry.register({ id: 36, name: 'cherry_leaves', color: 0xf48fb1, solid: true, opaque: false, transparent: true, surfaceType: 'foliage' });
  blockRegistry.register({ id: 37, name: 'jungle_log', color: 0x4e342e, solid: true, opaque: true });
  blockRegistry.register({ id: 38, name: 'jungle_leaves', color: 0x00c853, solid: true, opaque: false, transparent: true, surfaceType: 'foliage' });
  blockRegistry.register({ id: 39, name: 'cactus', color: 0x388e3c, solid: true, opaque: true, surfaceType: 'foliage' });
  blockRegistry.register({ id: 40, name: 'clay', color: 0x90a4ae, solid: true, opaque: true });

  // ── Underground: estratos, biomas cavernosos e estruturas ──
  blockRegistry.register({ id: 41, name: 'deepslate', color: 0x4b4b55, solid: true, opaque: true, surfaceType: 'stone' });
  blockRegistry.register({ id: 42, name: 'tuff', color: 0x6b6d62, solid: true, opaque: true, surfaceType: 'stone' });
  blockRegistry.register({ id: 43, name: 'dripstone', color: 0x9a7f6c, solid: true, opaque: true, surfaceType: 'stone' });
  blockRegistry.register({ id: 44, name: 'gravel', color: 0x7e7a75, solid: true, opaque: true });
  blockRegistry.register({ id: 45, name: 'moss', color: 0x4f7a2a, solid: true, opaque: true, surfaceType: 'foliage' });
  blockRegistry.register({ id: 46, name: 'glow_lichen', color: 0x7fe3a0, meshType: 'microvoxel', luminance: 0.5, meshBuilder: buildGlowLichen });
  blockRegistry.register({ id: 47, name: 'cave_vine', color: 0x4e7a2e, meshType: 'microvoxel', surfaceType: 'foliage', meshBuilder: buildCaveVine });
  blockRegistry.register({ id: 48, name: 'glow_berries', color: 0xffb732, meshType: 'microvoxel', luminance: 0.95, surfaceType: 'foliage', meshBuilder: buildGlowBerries });
  blockRegistry.register({ id: 49, name: 'mycelium', color: 0x6f5f73, solid: true, opaque: true });
  blockRegistry.register({ id: 50, name: 'mushroom_stem', color: 0xd8d2c4, solid: true, opaque: true });
  blockRegistry.register({ id: 51, name: 'red_mushroom_cap', color: 0xb5342a, solid: true, opaque: true, luminance: 0.65 });
  blockRegistry.register({ id: 52, name: 'brown_mushroom_cap', color: 0x8a6240, solid: true, opaque: true, luminance: 0.65 });
  blockRegistry.register({
    id: 53,
    name: 'glowshroom',
    color: 0x58e0d0,
    meshType: 'microvoxel',
    luminance: 0.90,
    meshBuilder: createMushroomBuilder({
      allowCeiling: true,
      stem: [0.55, 0.88, 0.85],
      cap: [0.16, 0.88, 0.82],
      top: [0.35, 0.98, 0.92],
      hasSpots: true,
      spot: [0.80, 1.00, 0.98]
    })
  });
  blockRegistry.register({ id: 54, name: 'amethyst', color: 0x9b6fd4, solid: true, opaque: true, luminance: 0.20, surfaceType: 'stone' });
  blockRegistry.register({ id: 55, name: 'amethyst_cluster', color: 0xc9a6ff, meshType: 'microvoxel', luminance: 0.75, meshBuilder: buildAmethystCluster });
  blockRegistry.register({ id: 56, name: 'calcite', color: 0xe8e6df, solid: true, opaque: true, surfaceType: 'stone' });
  blockRegistry.register({ id: 57, name: 'smooth_basalt', color: 0x3a3a42, solid: true, opaque: true, surfaceType: 'stone' });

  // ── Flora e Vegetação de Superfície e Subsolo (Micro-voxels 3D) ──
  blockRegistry.register({ id: 58, name: 'tall_grass', color: 0x55aa28, meshType: 'microvoxel', surfaceType: 'foliage', meshBuilder: buildTallGrass });
  blockRegistry.register({ id: 59, name: 'red_flower', color: 0xe53935, meshType: 'microvoxel', surfaceType: 'foliage', meshBuilder: createSurfaceFlowerBuilder(true) });
  blockRegistry.register({ id: 60, name: 'yellow_flower', color: 0xfdd835, meshType: 'microvoxel', surfaceType: 'foliage', meshBuilder: createSurfaceFlowerBuilder(false) });
  blockRegistry.register({
    id: 61,
    name: 'red_mushroom',
    color: 0xd32f2f,
    meshType: 'microvoxel',
    luminance: 0.45,
    meshBuilder: createMushroomBuilder({
      stem: [0.90, 0.88, 0.82],
      cap: [0.86, 0.16, 0.16],
      top: [0.76, 0.10, 0.10],
      hasSpots: true,
      spot: [0.98, 0.98, 0.98]
    })
  });
  blockRegistry.register({
    id: 62,
    name: 'brown_mushroom',
    color: 0x8d6e63,
    meshType: 'microvoxel',
    luminance: 0.55,
    meshBuilder: createMushroomBuilder({
      stem: [0.82, 0.76, 0.68],
      cap: [0.55, 0.36, 0.22],
      top: [0.42, 0.26, 0.16],
      hasSpots: true,
      spot: [0.72, 0.56, 0.40]
    })
  });
  blockRegistry.register({
    id: 63,
    name: 'violet_glowshroom',
    color: 0x9333ea,
    meshType: 'microvoxel',
    luminance: 0.90,
    meshBuilder: createMushroomBuilder({
      allowCeiling: true,
      stem: [0.72, 0.60, 0.86],
      cap: [0.56, 0.14, 0.90],
      top: [0.82, 0.26, 0.98],
      hasSpots: true,
      spot: [0.96, 0.75, 1.00]
    })
  });
  blockRegistry.register({
    id: 64,
    name: 'crimson_fungus',
    color: 0xdc2626,
    meshType: 'microvoxel',
    luminance: 0.70,
    meshBuilder: createMushroomBuilder({
      stem: [0.78, 0.45, 0.50],
      cap: [0.88, 0.12, 0.18],
      top: [0.68, 0.08, 0.12],
      hasSpots: true,
      spot: [1.00, 0.75, 0.18]
    })
  });
  blockRegistry.register({
    id: 65,
    name: 'warped_fungus',
    color: 0x0d9488,
    meshType: 'microvoxel',
    luminance: 0.80,
    meshBuilder: createMushroomBuilder({
      stem: [0.22, 0.42, 0.44],
      cap: [0.06, 0.68, 0.62],
      top: [0.14, 0.86, 0.74],
      hasSpots: true,
      spot: [0.94, 0.88, 0.28]
    })
  });
  blockRegistry.register({
    id: 66,
    name: 'golden_mushroom',
    color: 0xf59e0b,
    meshType: 'microvoxel',
    luminance: 1.00,
    meshBuilder: createMushroomBuilder({
      stem: [0.92, 0.85, 0.62],
      cap: [0.98, 0.70, 0.08],
      top: [1.00, 0.88, 0.25],
      hasSpots: true,
      spot: [1.00, 0.98, 0.76]
    })
  });
  blockRegistry.register({ id: 67, name: 'shelf_fungus', color: 0x795548, meshType: 'microvoxel', luminance: 0.45, meshBuilder: buildShelfFungus });

  // ── Lush Caves Flora & Decorações (Micro-voxels 3D) ───────────
  blockRegistry.register({ id: 68, name: 'victoria_regia', color: 0x2e7d32, meshType: 'microvoxel', luminance: 0.50, surfaceType: 'foliage', meshBuilder: buildVictoriaRegia });
  blockRegistry.register({ id: 69, name: 'spore_blossom', color: 0xe91e63, meshType: 'microvoxel', luminance: 0.90, surfaceType: 'foliage', meshBuilder: buildSporeBlossom });
  blockRegistry.register({ id: 70, name: 'cave_flower', color: 0xf06292, meshType: 'microvoxel', luminance: 0.55, surfaceType: 'foliage', meshBuilder: buildCaveFlower });
  blockRegistry.register({ id: 71, name: 'hanging_roots', color: 0x795548, meshType: 'microvoxel', meshBuilder: buildHangingRoots });
  blockRegistry.register({ id: 72, name: 'big_dripleaf', color: 0x388e3c, meshType: 'microvoxel', surfaceType: 'foliage', meshBuilder: buildBigDripleaf });

  // ── Paleta fotorrealista derivada dos tiles reais (Google 3D Tiles) ──
  // Ver geoPalette.ts: 746 cores por median-cut das texturas, nao uma grade HSL a mao.
  for (let i = 0; i < GEO_COLOR_PALETTE.length; i++) {
    const [r, g, b] = GEO_COLOR_PALETTE[i];
    const id = GEO_BLOCK_ID_BASE + i;
    const hex = (r << 16) | (g << 8) | b;
    blockRegistry.register({
      id,
      name: `geo_color_${id}`,
      color: hex,
      solid: true,
      opaque: true,
      surfaceType: excessGreen(r, g, b) > FOLIAGE_EXG_THRESHOLD ? 'foliage' : 'default'
    });
  }
}


function colorDistSq(r1: number, g1: number, b1: number, r2: number, g2: number, b2: number): number {
  const rmean = (r1 + r2) / 2;
  const dr = r1 - r2;
  const dg = g1 - g2;
  const db = b1 - b2;
  return (((512 + rmean) * dr * dr) >> 8) + 4 * dg * dg + (((767 - rmean) * db * db) >> 8);
}

// Tabela de busca instantânea O(1) de 32x32x32 células (64 KB em cache L1/L2)
function buildColorLUT(): Uint16Array {
  const lut = new Uint16Array(32 * 32 * 32);
  for (let r5 = 0; r5 < 32; r5++) {
    const r = (r5 << 3) | 4;
    for (let g5 = 0; g5 < 32; g5++) {
      const g = (g5 << 3) | 4;
      for (let b5 = 0; b5 < 32; b5++) {
        const b = (b5 << 3) | 4;
        let best = 0;
        let minD = Infinity;
        for (let i = 0; i < GEO_COLOR_PALETTE.length; i++) {
          const d = colorDistSq(r, g, b, GEO_COLOR_PALETTE[i][0], GEO_COLOR_PALETTE[i][1], GEO_COLOR_PALETTE[i][2]);
          if (d < minD) {
            minD = d;
            best = i;
          }
        }
        lut[(r5 << 10) | (g5 << 5) | b5] = GEO_BLOCK_ID_BASE + best;
      }
    }
  }
  return lut;
}

const COLOR_LUT = buildColorLUT();

/**
 * Converte qualquer cor original RGB (0..255) das texturas fotográficas da Google Maps Platform
 * diretamente no bloco com a cor mais próxima e fiel, com mais de 700 tons disponíveis de forma 100% automática e instantânea O(1).
 */
export function rgbToGeoBlockId(rawR: number, rawG: number, rawB: number): number {
  const r = Math.max(0, Math.min(255, rawR)) >> 3;
  const g = Math.max(0, Math.min(255, rawG)) >> 3;
  const b = Math.max(0, Math.min(255, rawB)) >> 3;
  return COLOR_LUT[(r << 10) | (g << 5) | b];
}

/**
 * Indice de excesso de verde (ExG), normalizado pela soma dos canais:
 * `(2g - r - b) / (r + g + b)`. E o indice padrao de vegetacao para imagem RGB sem
 * infravermelho, e e usado aqui em lugar de comparacoes diretas tipo `g > r * 1.08`
 * porque essas comparacoes escalam com o brilho e perdem a copa na sombra.
 *
 * Medido sobre a paleta assada: o teste antigo marcava 63 das 746 cores como folhagem e
 * apenas 2 das 64 cores escuras -- ou seja, copa sombreada pela foto aerea nao era
 * reconhecida, e era exatamente ela que sobrava como gororoba depois da limpeza.
 * Com ExG > 0.02: 204 cores no total e 19 das 64 escuras.
 */
export function excessGreen(r: number, g: number, b: number): number {
  const sum = r + g + b;
  if (sum <= 0) return 0;
  return (2 * g - r - b) / sum;
}

/**
 * Quao "vegetacao" e a COR de um bloco, de 0 a 1. E so um voto: a classificacao de
 * arvores no voxelizador decide por geometria (altura sobre o terreno, penetrabilidade
 * vertical, rugosidade do topo) e usa esta pontuacao apenas para desempatar e para
 * escolher a especie. Cor sozinha nunca basta -- fachada de vidro esverdeada pontua
 * alto, copa em contraluz pontua baixo.
 */
export function geoVegetationScore(blockId: number): number {
  if (
    blockId === BlockType.Leaves ||
    blockId === BlockType.BirchLeaves ||
    blockId === BlockType.PineLeaves ||
    blockId === BlockType.JungleLeaves ||
    blockId === BlockType.CherryLeaves ||
    blockId === BlockType.Moss
  ) {
    return 1;
  }
  const palIdx = blockId - GEO_BLOCK_ID_BASE;
  if (palIdx < 0 || palIdx >= GEO_COLOR_PALETTE.length) return 0;
  const [r, g, b] = GEO_COLOR_PALETTE[palIdx];
  const exg = excessGreen(r, g, b);
  if (exg <= 0) return 0;
  // 0.02 (limite da folhagem) -> 0; 0.16 (verde franco de copa iluminada) -> 1.
  return Math.max(0, Math.min(1, (exg - FOLIAGE_EXG_THRESHOLD) / 0.14));
}

