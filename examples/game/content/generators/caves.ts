import type { ChunkContext } from '@voxel/engine/chunk-worker';
import {
  CaveCarver as EngineCaveCarver,
  cellHash3,
  type CaveBiomeConfig,
  type CaveCarverHelpers,
  type CaveCarverOptions,
  type CaveProfile
} from '@voxel/engine/chunk-worker';
import { BlockType } from '../blocks';
import { SEA_LEVEL, surfaceHeightAt, getVolcanoInCell } from './overworldShape';

/**
 * Biomas cavernosos deste jogo, do mais raso ao mais fundo — a mesma estratigrafia e a
 * mesma decoração de antes, agora como configuração sobre `engine/world/generation/caves.ts`
 * (`CaveCarver` genérico) em vez de uma classe própria. `barren` é a rocha nua logo abaixo
 * da superfície, sem tema; os quatro biomas temáticos começam bem mais fundo, cada um na
 * faixa que lhe faz sentido, com `dripstone` a preencher o que sobra entre eles.
 */
export type CaveBiome = 'barren' | 'dripstone' | 'lush' | 'fungal' | 'crystal' | 'magma';

const THEMED_MIN_DEPTH = 32;
const THEMED_MAX_Y = SEA_LEVEL + 16;
const KARST_FLOOR_Y = 12;
const LUSH_FLOOR_Y = -75;
const DEEP_FLOOR_Y = -120;
const ABYSS_Y = -160;
const MAGMA_CEILING_Y = -55;

function magmaOnsetY(temp: number): number {
  return Math.min(MAGMA_CEILING_Y, -((0.95 - temp) * 120 + 20));
}

// ── Perfis de talhe + decoração ──────────────────────────────────────────────

const BARREN_PROFILE: CaveProfile = {
  tunnelScale: 38, tunnelWidth: 0.225, tunnelSquash: 1.15,
  chamberScale: 44, chamberThreshold: 0.52,
  wall: BlockType.Stone, floor: BlockType.Stone, lined: false,
  looseFloorBlock: BlockType.Gravel, looseFloorThreshold: 0.70,
  decorate(h, x, y, z, { onFloor, roll }) {
    if (!onFloor) return;
    if (roll > 0.94) h.ctx.setBlock(x, y - 1, z, BlockType.Gravel);
    else if (roll < 0.03) h.ctx.setBlock(x, y - 1, z, BlockType.Dirt);
  }
};

const DRIPSTONE_PROFILE: CaveProfile = {
  tunnelScale: 36, tunnelWidth: 0.215, tunnelSquash: 2.10,
  chamberScale: 48, chamberThreshold: 0.56,
  wall: BlockType.Dripstone, floor: BlockType.Dripstone, lined: true,
  blotchFloorBlock: BlockType.Gravel, blotchWallBlock: BlockType.Tuff,
  decorate(h, x, y, z, { onFloor, onCeiling, roll }) {
    const ctx = h.ctx;
    if (onCeiling && roll > 0.80) {
      const room = h.clearance(x, y, z, -1, 7);
      if (room <= 5 && cellHash3(x, y, z, 613) > 0.80) {
        for (let i = 0; i <= room; i++) ctx.setBlock(x, y - i, z, BlockType.Dripstone);
        return;
      }
      const len = Math.min(1 + Math.floor(cellHash3(x, y, z, 607) * 5), room + 1);
      for (let i = 0; i < len; i++) ctx.setBlock(x, y - i, z, BlockType.Dripstone);
      return;
    }
    if (!onFloor) return;
    if (roll > 0.84) {
      const room = h.clearance(x, y, z, 1, 6);
      const len = Math.min(1 + Math.floor(cellHash3(x, y, z, 619) * 4), room + 1);
      for (let i = 0; i < len; i++) ctx.setBlock(x, y + i, z, BlockType.Dripstone);
    } else if (roll > 0.74) {
      ctx.setBlock(x, y - 1, z, BlockType.Gravel);
    }
  }
};

const LUSH_PROFILE: CaveProfile = {
  tunnelScale: 52, tunnelWidth: 0.33, tunnelSquash: 0.82,
  chamberScale: 48, chamberThreshold: 0.28,
  wall: BlockType.Moss, floor: BlockType.Moss, lined: true,
  blotchFloorBlock: BlockType.Gravel, blotchWallBlock: BlockType.Tuff,
  decorate(h, x, y, z, { onFloor, onCeiling, onWater, roll }) {
    const ctx = h.ctx;

    if (onWater) {
      if (roll > 0.92) ctx.setBlock(x, y, z, BlockType.VictoriaRegia);
      return;
    }

    if (onCeiling) {
      if (roll > 0.985) { ctx.setBlock(x, y, z, BlockType.SporeBlossom); return; }
      if (roll > 0.955) { ctx.setBlock(x, y, z, BlockType.HangingRoots); return; }
      if (roll > 0.880) {
        const room = h.clearance(x, y, z, -1, 9);
        const len = Math.min(1 + Math.floor(cellHash3(x, y, z, 631) * 6), Math.max(room, 1));
        for (let i = 0; i < len; i++) {
          const isTip = i === len - 1;
          ctx.setBlock(x, y - i, z, isTip && cellHash3(x, y, z, 641) > 0.35 ? BlockType.GlowBerries : BlockType.CaveVine);
        }
        return;
      }
      return;
    }

    if (!onFloor) return;

    if (roll > 0.965) ctx.setBlock(x, y, z, BlockType.CaveFlower);
    else if (roll > 0.935) ctx.setBlock(x, y, z, BlockType.BigDripleaf);
    else if (roll > 0.895) ctx.setBlock(x, y, z, BlockType.TallGrass);
    else if (roll > 0.855) ctx.setBlock(x, y, z, BlockType.GlowLichen);
    else if (roll < 0.05) ctx.setBlock(x, y - 1, z, BlockType.Clay);
    else ctx.setBlock(x, y - 1, z, BlockType.Moss);
  }
};

/** Cogumelo gigante: pé de 3-6 blocos e chapéu em disco com aba descaída. */
function buildGiantMushroom(h: CaveCarverHelpers, x: number, y: number, z: number): void {
  const ctx = h.ctx;
  const height = 3 + Math.floor(cellHash3(x, y, z, 653) * 4);
  if (h.clearance(x, y, z, 1, height + 1) < height) return;

  for (let i = 0; i < height; i++) ctx.setBlock(x, y + i, z, BlockType.MushroomStem);

  if (height >= 4) {
    const shelfY = y + 1 + Math.floor(cellHash3(x, y, z, 901) * (height - 2));
    const dir = Math.floor(cellHash3(x, y, z, 902) * 4);
    const dx = dir === 0 ? 1 : dir === 1 ? -1 : 0;
    const dz = dir === 2 ? 1 : dir === 3 ? -1 : 0;
    if (h.isAir(x + dx, shelfY, z + dz)) {
      ctx.setBlock(x + dx, shelfY, z + dz, BlockType.ShelfFungus);
    }
  }

  const cap = cellHash3(x, y, z, 659) > 0.5 ? BlockType.RedMushroomCap : BlockType.BrownMushroomCap;
  const capY = y + height;
  for (let dx = -2; dx <= 2; dx++) {
    for (let dz = -2; dz <= 2; dz++) {
      const d = dx * dx + dz * dz;
      if (d > 5) continue;
      if (!h.isAir(x + dx, capY, z + dz)) continue;
      ctx.setBlock(x + dx, capY, z + dz, cap);
      if (d >= 4 && h.isAir(x + dx, capY - 1, z + dz)) {
        ctx.setBlock(x + dx, capY - 1, z + dz, cap);
      }
    }
  }
}

const FUNGAL_PROFILE: CaveProfile = {
  tunnelScale: 52, tunnelWidth: 0.235, tunnelSquash: 0.55,
  chamberScale: 36, chamberThreshold: 0.36,
  wall: BlockType.Tuff, floor: BlockType.Mycelium, lined: true,
  blotchFloorBlock: BlockType.Gravel, blotchWallBlock: BlockType.Tuff,
  decorate(h, x, y, z, { onFloor, onCeiling, roll }) {
    const ctx = h.ctx;
    if (onCeiling && roll > 0.88) {
      ctx.setBlock(x, y, z, roll > 0.94 ? BlockType.VioletGlowshroom : BlockType.Glowshroom);
      return;
    }
    if (!onFloor) return;
    // roll > 0.985 fica para decorateStructure: o chapéu passa dos limites do mapa de
    // ocupação e precisa de uma varredura mais larga.
    if (roll > 0.985) return;
    if (roll > 0.88) {
      const sub = cellHash3(x, y, z, 773);
      if (sub < 0.28) ctx.setBlock(x, y, z, BlockType.Glowshroom);
      else if (sub < 0.48) ctx.setBlock(x, y, z, BlockType.VioletGlowshroom);
      else if (sub < 0.65) ctx.setBlock(x, y, z, BlockType.WarpedFungus);
      else if (sub < 0.80) ctx.setBlock(x, y, z, BlockType.CrimsonFungus);
      else if (sub < 0.89) ctx.setBlock(x, y, z, BlockType.BrownMushroom);
      else if (sub < 0.96) ctx.setBlock(x, y, z, BlockType.RedMushroom);
      else ctx.setBlock(x, y, z, BlockType.GoldenMushroom);
    } else if (roll > 0.60) {
      ctx.setBlock(x, y - 1, z, BlockType.Mycelium);
    }
  },
  decorateStructure(h, x, y, z, roll) {
    if (roll <= 0.985) return;
    buildGiantMushroom(h, x, y, z);
  }
};

const CRYSTAL_PROFILE: CaveProfile = {
  tunnelScale: 30, tunnelWidth: 0.200, tunnelSquash: 1.25,
  chamberScale: 54, chamberThreshold: 0.62,
  wall: BlockType.Calcite, floor: BlockType.Tuff, lined: true,
  blotchFloorBlock: BlockType.Gravel, blotchWallBlock: BlockType.Tuff,
  veinBlock: BlockType.Amethyst, veinThreshold: -0.60,
  allowsGeodes: true,
  decorate(h, x, y, z, { onFloor, onCeiling, roll }) {
    const ctx = h.ctx;
    if (onFloor && roll > 0.975) {
      const height = 2 + Math.floor(cellHash3(x, y, z, 673) * 4);
      const room = h.clearance(x, y, z, 1, height);
      for (let i = 0; i < Math.min(height, room + 1); i++) ctx.setBlock(x, y + i, z, BlockType.Amethyst);
      if (room >= height) ctx.setBlock(x, y + height, z, BlockType.AmethystCluster);
      return;
    }
    if (roll > 0.90) ctx.setBlock(x, y, z, BlockType.AmethystCluster);
    else if (onFloor && roll > 0.66) ctx.setBlock(x, y - 1, z, BlockType.Calcite);
    else if (onCeiling && roll < 0.08) ctx.setBlock(x, y + 1, z, BlockType.Calcite);
  }
};

const MAGMA_PROFILE: CaveProfile = {
  tunnelScale: 42, tunnelWidth: 0.235, tunnelSquash: 0.60,
  chamberScale: 34, chamberThreshold: 0.34,
  wall: BlockType.Basalt, floor: BlockType.Basalt, lined: true,
  blotchFloorBlock: BlockType.Gravel, blotchWallBlock: BlockType.Tuff,
  veinBlock: BlockType.Obsidian, veinThreshold: -0.68,
  floodsWithLava: true,
  decorate(h, x, y, z, { onFloor, onCeiling, roll }) {
    const ctx = h.ctx;
    if (onFloor) {
      if (roll > 0.90) ctx.setBlock(x, y - 1, z, BlockType.Magma);
      else if (roll > 0.80) ctx.setBlock(x, y - 1, z, BlockType.Obsidian);
      else if (roll < 0.16) {
        let walls = 0;
        if (!h.isAir(x + 1, y, z)) walls++;
        if (!h.isAir(x - 1, y, z)) walls++;
        if (!h.isAir(x, y, z + 1)) walls++;
        if (!h.isAir(x, y, z - 1)) walls++;
        if (walls === 4) ctx.setBlock(x, y, z, BlockType.Lava);
      }
      return;
    }
    if (onCeiling && roll > 0.94) ctx.setBlock(x, y + 1, z, BlockType.Magma);
  }
};

// ── Cascata estratigráfica ───────────────────────────────────────────────────
// Mesma ordem de antes: cada entrada só precisa testar a condição que a reivindica, porque
// o `CaveCarver` genérico usa a primeira regra que bater, igual a um if/else em cascata.
const CAVE_BIOMES: CaveBiomeConfig[] = [
  { id: 'barren', profile: BARREN_PROFILE, test: (c) => c.depth < THEMED_MIN_DEPTH || c.y > THEMED_MAX_Y },
  { id: 'magma', profile: MAGMA_PROFILE, test: (c) => c.y < ABYSS_Y || c.y < magmaOnsetY(c.temp) },
  { id: 'lush', profile: LUSH_PROFILE, test: (c) => c.y > KARST_FLOOR_Y && c.hum > 0.24 && c.y <= THEMED_MAX_Y },
  { id: 'dripstone', profile: DRIPSTONE_PROFILE, test: (c) => c.y > KARST_FLOOR_Y },
  { id: 'lush', profile: LUSH_PROFILE, test: (c) => c.y > LUSH_FLOOR_Y && c.hum > 0.10 },
  { id: 'dripstone', profile: DRIPSTONE_PROFILE, test: (c) => c.y > LUSH_FLOOR_Y },
  { id: 'fungal', profile: FUNGAL_PROFILE, test: (c) => c.y > DEEP_FLOOR_Y && c.hum > 0.22 },
  { id: 'crystal', profile: CRYSTAL_PROFILE, test: (c) => c.y > DEEP_FLOOR_Y && c.temp < -0.25 },
  { id: 'dripstone', profile: DRIPSTONE_PROFILE, test: (c) => c.y > DEEP_FLOOR_Y },
  { id: 'crystal', profile: CRYSTAL_PROFILE, test: (c) => c.temp < -0.25 },
  { id: 'magma', profile: MAGMA_PROFILE, test: () => true }
];

function buildOptions(ctx: ChunkContext): CaveCarverOptions {
  return {
    biomes: CAVE_BIOMES,
    seaLevel: SEA_LEVEL,
    waterBlockId: BlockType.Water,
    lavaBlockId: BlockType.Lava,
    rockBlockIds: [BlockType.Stone, BlockType.Deepslate, BlockType.Tuff],
    sampleSurfaceHeight: surfaceHeightAt,
    isUnderSurfaceFeature: (x, z) => {
      const cellX = Math.floor(x / 640);
      const cellZ = Math.floor(z / 640);
      for (let dx = -1; dx <= 1; dx++) {
        for (let dz = -1; dz <= 1; dz++) {
          const v = getVolcanoInCell(cellX + dx, cellZ + dz);
          if (v.exists && Math.hypot(x - v.x, z - v.z) < v.radius) return true;
        }
      }
      return false;
    },
    lavaSeaY: (_ctx, _x, _z, climate) => Math.max(ABYSS_Y, magmaOnsetY(climate.temp)),
    geodes: {
      shellBlockId: BlockType.SmoothBasalt,
      bandBlockId: BlockType.Calcite,
      coreBlockId: BlockType.Amethyst,
      coreAltBlockId: BlockType.AmethystCluster,
      coreAltChance: 0.45,
      minY: -150,
      maxY: -45,
      cellXZ: 112,
      cellY: 72,
      density: 0.12,
      minRadius: 5.5,
      radiusRange: 3.5
    }
  };
}

/**
 * Escava e decora as cavernas de um chunk — fachada fina sobre o `CaveCarver` genérico da
 * engine, com os biomas/decoração deste jogo. Ver `engine/world/generation/caves.ts`.
 */
export class CaveCarver {
  private readonly inner: EngineCaveCarver;

  constructor(ctx: ChunkContext) {
    this.inner = new EngineCaveCarver(ctx, buildOptions(ctx));
  }

  public apply(): void {
    this.inner.apply();
  }

  public biomeAt(x: number, y: number, z: number): CaveBiome {
    return this.inner.biomeAt(x, y, z) as CaveBiome;
  }
}
