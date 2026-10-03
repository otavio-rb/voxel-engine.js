import type { ChunkContext, WorldGenerator } from '@voxel/engine/chunk-worker';
import { BlockType } from '../blocks';
import { CaveCarver } from './caves';
import {
  GLOBAL_HEIGHT,
  SEA_LEVEL,
  getVolcanoInCell,
  surfaceHeightAt,
  type OverworldBiome,
  type VolcanoInfo,
} from './overworldShape';

export { getVolcanoInCell, type OverworldBiome, type VolcanoInfo };

/**
 * Macro Climate Classification:
 * Biomes scale to hundreds of blocks (400 - 1200+ blocks), providing vast,
 * immersive landscapes rather than micro-patches switching every 20-30 blocks.
 */
export function getBiomeAt(
  x: number,
  z: number,
  sy: number,
  seaLevel: number,
  globalHeight: number,
  isVolcanic: boolean,
  simplex: { noise: (x: number, y: number) => number }
): { biome: OverworldBiome; temp: number; moisture: number } {
  if (isVolcanic) {
    return { biome: 'volcanic', temp: 1.0, moisture: -0.5 };
  }

  // Macro continental climate scales (sampling wavelength ~900 to 1200 blocks)
  const temp = simplex.noise((x + 15000) / 950, (z + 15000) / 950) +
               simplex.noise((x + 15000) / 460, (z + 15000) / 460) * 0.2;

  const moisture = simplex.noise((x - 25000) / 1050, (z + 35000) / 1050) +
                   simplex.noise((x - 25000) / 520, (z + 35000) / 520) * 0.2;

  // Mountain peaks and high terrain
  if (sy >= 72) {
    return { biome: 'mountains', temp, moisture };
  }

  // Polar / Glacial freezing zone
  if (temp < -0.38) {
    return { biome: moisture > 0.08 ? 'taiga' : 'snow_tundra', temp, moisture };
  }

  // Cool Boreal zone
  if (temp < -0.10) {
    return { biome: moisture > -0.05 ? 'taiga' : 'plains', temp, moisture };
  }

  // Arid Desert
  if (temp > 0.35 && moisture < -0.12) {
    return { biome: 'desert', temp, moisture };
  }

  // Humid Tropical Jungle
  if (temp > 0.28 && moisture > 0.22) {
    return { biome: 'jungle', temp, moisture };
  }

  // High moisture temperate regions
  if (moisture > 0.32) {
    // Cherry Blossom Groves on elevated temperate hills
    if (temp > 0.06 && sy > seaLevel + 7) {
      return { biome: 'cherry', temp, moisture };
    }
    return { biome: 'forest', temp, moisture };
  }

  // Moderate moisture: Birch forests vs Oak forests
  if (moisture > 0.06) {
    const subVar = simplex.noise((x + 3333) / 320, (z + 7777) / 320);
    return { biome: subVar > 0.12 ? 'birch' : 'forest', temp, moisture };
  }

  // Meadows & Plains
  return { biome: 'plains', temp, moisture };
}

export class StandardWorldGenerator implements WorldGenerator {
  public readonly id = 'standard';

  public generate(ctx: ChunkContext): void {
    const globalHeight = GLOBAL_HEIGHT;
    const seaLevel = SEA_LEVEL;

    if (ctx.startY > globalHeight + 25) return;
    if (ctx.endY <= -512) return;

    // ── Pass 1: Surface height per column ────────────────────────────────────
    const surfaceOf = new Int16Array(ctx.size * ctx.size);
    // Flags:
    // bit 0: isVolcanic
    // bit 1: isCalderaLava
    // bit 2: isLavaFlow
    // bit 3: onCone
    const flagsOf = new Uint8Array(ctx.size * ctx.size);
    const colIdx = (lx: number, lz: number) => lz * ctx.size + lx;

    const volcanoGrid = 640;

    for (let x = ctx.startX; x < ctx.endX; x++) {
      const lx = x - ctx.startX;
      for (let z = ctx.startZ; z < ctx.endZ; z++) {
        const lz = z - ctx.startZ;
        let sy = surfaceHeightAt(ctx, x, z);

        // Evaluate nearby volcanoes
        let bestConeElev = 0;
        let isCalderaLava = false;
        let isLavaFlow = false;
        let nearVolcano = false;

        const cellX = Math.floor(x / volcanoGrid);
        const cellZ = Math.floor(z / volcanoGrid);

        for (let dx = -1; dx <= 1; dx++) {
          for (let dz = -1; dz <= 1; dz++) {
            const v = getVolcanoInCell(cellX + dx, cellZ + dz);
            if (!v.exists) continue;

            const dX = x - v.x;
            const dZ = z - v.z;
            const d = Math.sqrt(dX * dX + dZ * dZ);

            if (d < v.radius + 18) nearVolcano = true;

            if (d < v.radius) {
              let elev = 0;
              if (d >= v.craterR) {
                const t = (d - v.craterR) / (v.radius - v.craterR);
                elev = v.height * Math.pow(1.0 - t, 1.4);

                const angle = Math.atan2(dZ, dX);
                const flowWave = Math.sin(angle * 3.0 + 1.2);
                if (flowWave > 0.88 && d > v.craterR + 2 && d < v.radius - 3) {
                  isLavaFlow = true;
                  elev -= 1.0;
                }
              } else {
                const craterRatio = d / v.craterR;
                const dip = v.craterDepth * (1.0 - craterRatio * craterRatio);
                elev = v.height - dip;
                const calderaLavaY = v.height - v.craterDepth + 4;
                if (elev <= calderaLavaY) {
                  elev = calderaLavaY;
                  isCalderaLava = true;
                }
              }

              if (elev > bestConeElev) {
                bestConeElev = elev;
              }
            }
          }
        }

        const isVolcanic = nearVolcano;

        if (bestConeElev > 0) {
          const ridge = ctx.simplex.noise3d(x / 14, 0, z / 14) * 2.5;
          sy = Math.max(sy, Math.floor(Math.max(sy, seaLevel + 4) + bestConeElev + ridge));
          sy = Math.min(sy, globalHeight - 2);
        }

        surfaceOf[colIdx(lx, lz)] = sy;

        let flags = 0;
        if (isVolcanic) flags |= 1;
        if (isCalderaLava) flags |= 2;
        if (isLavaFlow) flags |= 4;
        if (bestConeElev > 0) flags |= 8;
        flagsOf[colIdx(lx, lz)] = flags;
      }
    }

    // ── Pass 2: Base terrain (solid, water, biomes) ───────────────────────────
    for (let x = ctx.startX; x < ctx.endX; x++) {
      const lx = x - ctx.startX;
      for (let z = ctx.startZ; z < ctx.endZ; z++) {
        const lz = z - ctx.startZ;
        const sy = surfaceOf[colIdx(lx, lz)];
        const flags = flagsOf[colIdx(lx, lz)];
        const isVolcanic = (flags & 1) !== 0;
        const isCalderaLava = (flags & 2) !== 0;
        const isLavaFlow = (flags & 4) !== 0;
        const onCone = (flags & 8) !== 0;

        if (ctx.startY > sy && ctx.startY > seaLevel) continue;

        const localMaxY = Math.min(ctx.endY - 1, Math.max(sy, seaLevel) + 2);
        const { biome } = getBiomeAt(x, z, sy, seaLevel, globalHeight, isVolcanic, ctx.simplex);

        for (let y = ctx.startY; y <= localMaxY; y++) {
          const isTerrain = y <= sy;
          const isWater = !isTerrain && y <= seaLevel;

          if (isTerrain) {
            let type: BlockType = BlockType.Stone;

            if (biome === 'volcanic') {
              if (y === sy) {
                if (isCalderaLava || isLavaFlow) {
                  type = BlockType.Lava;
                } else if (onCone) {
                  const magmaRand = ctx.simplex.noise3d(x / 5, y / 5, z / 5);
                  if (magmaRand > 0.4) type = BlockType.Magma;
                  else if (magmaRand < -0.3) type = BlockType.Ash;
                  else type = BlockType.Basalt;
                } else {
                  const ashRand = ctx.simplex.noise3d(x / 7, 0, z / 7);
                  if (ashRand > 0.15) type = BlockType.Ash;
                  else if (ashRand < -0.55) type = BlockType.Obsidian;
                  else if (ashRand < -0.3) type = BlockType.Magma;
                  else type = BlockType.Basalt;
                }
              } else if (y >= sy - 2) {
                type = (isCalderaLava || isLavaFlow) ? BlockType.Magma : BlockType.Basalt;
              } else {
                type = BlockType.Basalt;
              }
            } else if (biome === 'desert') {
              // Desert Strata: Sand for 3-4 blocks, then Stone
              if (y >= sy - 3) {
                type = BlockType.Sand;
              } else {
                type = BlockType.Stone;
              }
            } else if (biome === 'snow_tundra') {
              // Tundra Strata: Snow on top, dirt subsurface
              if (y === sy) {
                type = BlockType.Snow;
              } else if (y >= sy - 2) {
                type = BlockType.Dirt;
              } else {
                type = BlockType.Stone;
              }
            } else if (biome === 'mountains') {
              // Mountain Strata: neve nos picos muito altos
              const snowLine = 88;
              if (sy >= snowLine) {
                if (y >= sy - 2) {
                  type = BlockType.Snow;
                } else {
                  type = BlockType.Stone;
                }
              } else {
                const isRock = (sy >= 76) || (ctx.simplex.noise(x / 10, z / 10) > -0.15);
                if (y === sy) {
                  type = isRock ? BlockType.Stone : BlockType.Grass;
                } else if (y >= sy - 2) {
                  type = isRock ? BlockType.Stone : BlockType.Dirt;
                } else {
                  type = BlockType.Stone;
                }
              }
            } else {
              // Standard biomes (Plains, Forest, Birch, Taiga, Cherry, Jungle)
              const isBeach = sy <= seaLevel + 1;
              if (y === sy) {
                type = isBeach ? BlockType.Sand : BlockType.Grass;
              } else if (y >= sy - 3) {
                type = isBeach ? BlockType.Sand : BlockType.Dirt;
              } else {
                type = BlockType.Stone;
              }
            }

            // Deep strata: a rocha escurece com a profundidade, com veios de tufo
            if (type === BlockType.Stone && y < sy - 8) {
              const deepslateLine = -2 + ctx.simplex.noise3d(x / 30, 0, z / 30) * 5;
              if (y < deepslateLine) {
                type = BlockType.Deepslate;
              } else if (ctx.simplex.noise3d(x / 26, y / 17, z / 26) > 0.55) {
                type = BlockType.Tuff;
              }

              // Ores in deep stone
              const oreRand = ctx.simplex.noise3d(x / 3.5, y / 3.5, z / 3.5);
              if (oreRand > 0.82) type = BlockType.Coal;
              else if (oreRand < -0.86) type = BlockType.Iron;
            }

            ctx.setBlock(x, y, z, type);
          } else if (isWater) {
            ctx.setBlock(x, y, z, BlockType.Water);
          }
        }
      }
    }

    // ── Pass 2.5: Caves, cave biomes & underground structures ────────────────
    new CaveCarver(ctx).apply();

    // ── Pass 3: Trees & Flora (Multiple Tree Varieties per Biome) ────────────
    const grid = 10;
    const searchPad = 12;

    if (ctx.startY > globalHeight + 30) return;

    const tStartX = Math.floor((ctx.startX - searchPad) / grid);
    const tEndX = Math.ceil((ctx.endX + searchPad) / grid);
    const tStartZ = Math.floor((ctx.startZ - searchPad) / grid);
    const tEndZ = Math.ceil((ctx.endZ + searchPad) / grid);

    for (let gx = tStartX; gx <= tEndX; gx++) {
      for (let gz = tStartZ; gz <= tEndZ; gz++) {
        // Jittered tree origin within grid cell
        const hash = Math.sin(gx * 374.3 + gz * 619.1) * 43758.5453;
        const rPos = hash - Math.floor(hash);
        const rType = Math.sin(gx * 719.3 + gz * 293.7) * 43758.5453;
        const seed = rType - Math.floor(rType);

        const tx = gx * grid + 2 + Math.floor(rPos * (grid - 4));
        const tz = gz * grid + 2 + Math.floor(seed * (grid - 4));

        const baseSY = surfaceHeightAt(ctx, tx, tz);

        // Check volcanic influence at tree pos
        let nearVolcano = false;
        let onCone = false;
        const cellX = Math.floor(tx / volcanoGrid);
        const cellZ = Math.floor(tz / volcanoGrid);

        for (let dx = -1; dx <= 1; dx++) {
          for (let dz = -1; dz <= 1; dz++) {
            const v = getVolcanoInCell(cellX + dx, cellZ + dz);
            if (!v.exists) continue;
            const d = Math.sqrt((tx - v.x) ** 2 + (tz - v.z) ** 2);
            if (d < v.radius) onCone = true;
            if (d < v.radius + 18) nearVolcano = true;
          }
        }

        const isVolcanicTree = nearVolcano;
        const { biome } = getBiomeAt(tx, tz, baseSY, seaLevel, globalHeight, isVolcanicTree, ctx.simplex);

        // Trees only generate above sea level and not on snow peaks
        if (baseSY <= seaLevel + 1 || baseSY >= 88) continue;

        // ── Dispatch per Biome ───────────────────────────────────────────────
        if (biome === 'volcanic') {
          if (!onCone && seed > 0.70) {
            this.buildCharredTrunk(ctx, tx, baseSY, tz, seed);
          }
        } else if (biome === 'mountains') {
          // Pinheiros nas encostas das montanhas
          if (seed > 0.65) {
            const snowOnPine = baseSY >= 78;
            this.buildPineTree(ctx, tx, baseSY, tz, seed, snowOnPine);
          }
        } else if (biome === 'desert') {
          // Cacti in the desert
          if (seed > 0.68) {
            this.buildCactus(ctx, tx, baseSY, tz, seed);
          }
        } else if (biome === 'snow_tundra') {
          // Sparse snow-covered conifer pine trees
          if (seed > 0.72) {
            this.buildPineTree(ctx, tx, baseSY, tz, seed, true);
          }
        } else if (biome === 'taiga') {
          // Dense Boreal Pine / Spruce trees
          if (seed > 0.35) {
            this.buildPineTree(ctx, tx, baseSY, tz, seed, false);
          }
        } else if (biome === 'birch') {
          // Elegant Birch trees
          if (seed > 0.38) {
            this.buildBirchTree(ctx, tx, baseSY, tz, seed);
          }
        } else if (biome === 'cherry') {
          // Sakura Cherry Blossom trees
          if (seed > 0.40) {
            this.buildCherryTree(ctx, tx, baseSY, tz, seed);
          }
        } else if (biome === 'jungle') {
          // Towering Jungle trees & understory
          if (seed > 0.45) {
            this.buildJungleTree(ctx, tx, baseSY, tz, seed);
          }
        } else if (biome === 'forest') {
          // Rich Oak forest
          if (seed > 0.35) {
            this.buildOakTree(ctx, tx, baseSY, tz, seed);
          }
        } else if (biome === 'plains') {
          // Sparse solitary oaks on plains / meadow
          if (seed > 0.82) {
            this.buildOakTree(ctx, tx, baseSY, tz, seed);
          }
        }
      }
    }
  }

  /**
   * Classic Oak Tree: organic branching trunk and lush rounded leaf canopy
   */
  private buildOakTree(ctx: ChunkContext, tx: number, baseSY: number, tz: number, seed: number): void {
    const trunkH = 6 + Math.floor(seed * 5);
    const topY = baseSY + trunkH;

    // Trunk
    for (let y = baseSY + 1; y <= topY; y++) {
      ctx.setBlock(tx, y, tz, BlockType.Wood);
    }

    // Canopy
    const leafRadius = 3;
    for (let dy = -2; dy <= 2; dy++) {
      const cy = topY + dy;
      const r = dy === 2 ? 1 : dy === -2 ? 2 : leafRadius;

      for (let ox = -r; ox <= r; ox++) {
        for (let oz = -r; oz <= r; oz++) {
          if (ox === 0 && oz === 0 && dy <= 0) continue;
          if (Math.abs(ox) === r && Math.abs(oz) === r && dy !== 0) continue;

          const cur = ctx.getBlock(tx + ox, cy, tz + oz);
          if (cur === -1 || cur === BlockType.Water) {
            ctx.setBlock(tx + ox, cy, tz + oz, BlockType.Leaves);
          }
        }
      }
    }
  }

  /**
   * Birch Tree: slender pale trunk and compact bright green foliage
   */
  private buildBirchTree(ctx: ChunkContext, tx: number, baseSY: number, tz: number, seed: number): void {
    const trunkH = 7 + Math.floor(seed * 4);
    const topY = baseSY + trunkH;

    // Birch Log trunk
    for (let y = baseSY + 1; y <= topY; y++) {
      ctx.setBlock(tx, y, tz, BlockType.BirchLog);
    }

    // Tiered Birch Leaves
    for (let dy = -3; dy <= 1; dy++) {
      const cy = topY + dy;
      const r = dy === 1 ? 1 : dy === -3 ? 1 : 2;

      for (let ox = -r; ox <= r; ox++) {
        for (let oz = -r; oz <= r; oz++) {
          if (ox === 0 && oz === 0 && dy <= 0) continue;
          if (Math.abs(ox) === r && Math.abs(oz) === r && (dy === 1 || dy === -3)) continue;

          const cur = ctx.getBlock(tx + ox, cy, tz + oz);
          if (cur === -1) {
            ctx.setBlock(tx + ox, cy, tz + oz, BlockType.BirchLeaves);
          }
        }
      }
    }
  }

  /**
   * Pine / Spruce Conifer Tree: tall dark trunk with conical needle tiers
   */
  private buildPineTree(ctx: ChunkContext, tx: number, baseSY: number, tz: number, seed: number, withSnow: boolean): void {
    const trunkH = 10 + Math.floor(seed * 6);
    const topY = baseSY + trunkH;

    // Dark Pine Log trunk
    for (let y = baseSY + 1; y <= topY; y++) {
      ctx.setBlock(tx, y, tz, BlockType.PineLog);
    }

    // Conical needle foliage
    const foliageStart = baseSY + Math.floor(trunkH * 0.35);
    for (let y = foliageStart; y <= topY + 1; y++) {
      const distFromTop = (topY + 1) - y;
      let r = 0;
      if (distFromTop === 0) r = 0;
      else if (distFromTop <= 2) r = 1;
      else if (distFromTop <= 5) r = 2;
      else if (distFromTop <= 8) r = 3;
      else r = (distFromTop % 2 === 0) ? 3 : 2;

      for (let ox = -r; ox <= r; ox++) {
        for (let oz = -r; oz <= r; oz++) {
          if (ox === 0 && oz === 0 && y <= topY) continue;
          if (Math.abs(ox) === r && Math.abs(oz) === r && r > 1) continue;

          const cur = ctx.getBlock(tx + ox, y, tz + oz);
          if (cur === -1) {
            ctx.setBlock(tx + ox, y, tz + oz, BlockType.PineLeaves);
            if (withSnow && (ox !== 0 || oz !== 0 || y === topY + 1)) {
              if (ctx.getBlock(tx + ox, y + 1, tz + oz) === -1) {
                ctx.setBlock(tx + ox, y + 1, tz + oz, BlockType.Snow);
              }
            }
          }
        }
      }
    }
  }

  /**
   * Cherry Blossom Tree: elegant spreading canopy of pink flowers
   */
  private buildCherryTree(ctx: ChunkContext, tx: number, baseSY: number, tz: number, seed: number): void {
    const trunkH = 6 + Math.floor(seed * 3);
    const curveX = seed > 0.5 ? 1 : -1;
    const topY = baseSY + trunkH;

    // Curved trunk
    for (let y = baseSY + 1; y <= topY; y++) {
      const progress = (y - baseSY) / trunkH;
      const ox = Math.round(progress * curveX * 1.5);
      ctx.setBlock(tx + ox, y, tz, BlockType.Wood);
    }

    // Wide umbrella cherry blossom canopy
    const headX = tx + curveX;
    const leafR = 3;
    for (let dy = -1; dy <= 2; dy++) {
      const cy = topY + dy;
      const r = dy === 2 ? 1 : dy === 1 ? leafR : leafR + 1;

      for (let ox = -r; ox <= r; ox++) {
        for (let oz = -r; oz <= r; oz++) {
          const distSq = ox * ox + oz * oz;
          if (distSq <= (r + 0.2) * (r + 0.2)) {
            const cur = ctx.getBlock(headX + ox, cy, tz + oz);
            if (cur === -1) {
              ctx.setBlock(headX + ox, cy, tz + oz, BlockType.CherryLeaves);
            }
          }
        }
      }
    }
  }

  /**
   * Giant Jungle Tree: colossal trunk with root buttresses and high umbrella canopy
   */
  private buildJungleTree(ctx: ChunkContext, tx: number, baseSY: number, tz: number, seed: number): void {
    const trunkH = 15 + Math.floor(seed * 8);
    const topY = baseSY + trunkH;

    // 2x2 Trunk
    for (let y = baseSY + 1; y <= topY; y++) {
      ctx.setBlock(tx, y, tz, BlockType.JungleLog);
      ctx.setBlock(tx + 1, y, tz, BlockType.JungleLog);
      ctx.setBlock(tx, y, tz + 1, BlockType.JungleLog);
      ctx.setBlock(tx + 1, y, tz + 1, BlockType.JungleLog);
    }

    // Base root buttresses
    ctx.setBlock(tx - 1, baseSY + 1, tz, BlockType.JungleLog);
    ctx.setBlock(tx + 2, baseSY + 1, tz, BlockType.JungleLog);
    ctx.setBlock(tx, baseSY + 1, tz - 1, BlockType.JungleLog);
    ctx.setBlock(tx, baseSY + 1, tz + 2, BlockType.JungleLog);

    // Sprawling canopy on top
    const leafR = 5;
    for (let dy = -2; dy <= 2; dy++) {
      const cy = topY + dy;
      const r = dy === 2 ? 2 : dy >= 0 ? leafR : leafR - 1;

      for (let ox = -r; ox <= r + 1; ox++) {
        for (let oz = -r; oz <= r + 1; oz++) {
          const distSq = ox * ox + oz * oz;
          if (distSq <= (r + 0.5) * (r + 0.5)) {
            const cur = ctx.getBlock(tx + ox, cy, tz + oz);
            if (cur === -1) {
              ctx.setBlock(tx + ox, cy, tz + oz, BlockType.JungleLeaves);
            }
          }
        }
      }
    }
  }

  /**
   * Saguaro Cactus in Desert
   */
  private buildCactus(ctx: ChunkContext, tx: number, baseSY: number, tz: number, seed: number): void {
    const cactusH = 3 + (seed > 0.6 ? 1 : 0);

    for (let y = baseSY + 1; y <= baseSY + cactusH; y++) {
      ctx.setBlock(tx, y, tz, BlockType.Cactus);
    }

    // Optional side arm
    if (seed > 0.55 && cactusH >= 3) {
      const armDir = seed > 0.75 ? 1 : -1;
      const armY = baseSY + 2;
      ctx.setBlock(tx + armDir, armY, tz, BlockType.Cactus);
      ctx.setBlock(tx + armDir, armY + 1, tz, BlockType.Cactus);
    }
  }

  /**
   * Charred volcanic burnt trunk
   */
  private buildCharredTrunk(ctx: ChunkContext, tx: number, baseSY: number, tz: number, seed: number): void {
    const h = 4 + Math.floor(seed * 4);
    for (let y = baseSY + 1; y <= baseSY + h; y++) {
      ctx.setBlock(tx, y, tz, BlockType.Wood);
    }
  }
}
