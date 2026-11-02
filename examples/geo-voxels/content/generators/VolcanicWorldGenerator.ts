import type { ChunkContext, WorldGenerator } from '@voxel/engine/chunk-worker';
import { BlockType } from '../blocks';

export class VolcanicWorldGenerator implements WorldGenerator {
  public readonly id = 'volcanic';

  public generate(ctx: ChunkContext): void {
    const globalHeight = 128;
    const lavaSeaLevel = Math.floor(globalHeight * 0.22); // Y ~ 28

    if (ctx.startY > globalHeight + 20) return;
    if (ctx.endY <= -512) return;

    const surfaceOf = new Int16Array(ctx.size * ctx.size);
    const isLavaLakeCol = new Uint8Array(ctx.size * ctx.size);
    const colIdx = (lx: number, lz: number) => lz * ctx.size + lx;

    // ── Pass 1: Surface calculation with active volcanoes ─────────────────────
    for (let x = ctx.startX; x < ctx.endX; x++) {
      const lx = x - ctx.startX;
      for (let z = ctx.startZ; z < ctx.endZ; z++) {
        const lz = z - ctx.startZ;

        // Base volcanic terrain: rugged basalt ridges and ash plains
        const baseNoise = ctx.octaveBaseNoise(x, z, 3.5, 4);
        const detailNoise = ctx.octaveBaseNoise(x + 1337, z + 7331, 0.6, 3);
        let sy = Math.floor(globalHeight * (0.24 + 0.35 * (baseNoise * 0.75 + detailNoise * 0.25)));

        // Volcano placement in cells of 120 blocks
        const vCell = 120;
        const cx = Math.floor(x / vCell);
        const cz = Math.floor(z / vCell);

        let bestConeElev = 0;
        let isCalderaLava = false;

        // Check 3x3 cells for volcanoes
        for (let dx = -1; dx <= 1; dx++) {
          for (let dz = -1; dz <= 1; dz++) {
            const curCx = cx + dx;
            const curCz = cz + dz;
            const hash = Math.sin(curCx * 127.1 + curCz * 311.7) * 43758.5453;
            const r1 = hash - Math.floor(hash);
            const hash2 = Math.sin((curCx + 43.1) * 269.5 + (curCz + 17.3) * 183.3) * 43758.5453;
            const r2 = hash2 - Math.floor(hash2);

            // In volcanic world, every cell has a massive volcano!
            const vx = curCx * vCell + 24 + Math.floor(r1 * (vCell - 48));
            const vz = curCz * vCell + 24 + Math.floor(r2 * (vCell - 48));

            const radius = 42 + Math.floor(r1 * 18);
            const peakH = 45 + Math.floor(r2 * 25);
            const craterR = 10 + Math.floor(r1 * 4);
            const craterDepth = 15;

            const dist = Math.sqrt((x - vx) ** 2 + (z - vz) ** 2);
            if (dist < radius) {
              let elev = 0;
              if (dist >= craterR) {
                const t = (dist - craterR) / (radius - craterR);
                elev = peakH * Math.pow(1.0 - t, 1.35);
              } else {
                // Inside caldera
                const cRatio = dist / craterR;
                const dip = craterDepth * (1.0 - cRatio * cRatio);
                elev = peakH - dip;
                const calderaLavaY = peakH - craterDepth + 4;
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

        if (bestConeElev > 0) {
          const ridge = ctx.simplex.noise3d(x / 12, 0, z / 12) * 3.0;
          sy = Math.max(sy, Math.floor(lavaSeaLevel + 2 + bestConeElev + ridge));
        }

        sy = Math.max(2, Math.min(sy, globalHeight - 2));
        surfaceOf[colIdx(lx, lz)] = sy;
        if (isCalderaLava) {
          isLavaLakeCol[colIdx(lx, lz)] = 1;
        }
      }
    }

    // ── Pass 2: Volcanic strata, magma crust, and lava oceans ─────────────────
    for (let x = ctx.startX; x < ctx.endX; x++) {
      const lx = x - ctx.startX;
      for (let z = ctx.startZ; z < ctx.endZ; z++) {
        const lz = z - ctx.startZ;
        const sy = surfaceOf[colIdx(lx, lz)];
        const isCalderaLava = isLavaLakeCol[colIdx(lx, lz)] === 1;

        if (ctx.startY > sy && ctx.startY > lavaSeaLevel) continue;
        const localMaxY = Math.min(ctx.endY - 1, Math.max(sy, lavaSeaLevel) + 2);

        const surfaceNoise = ctx.simplex.noise3d(x / 6, 0, z / 6);
        const magmaNoise = ctx.simplex.noise3d(x / 9, 0, z / 9);

        for (let y = ctx.startY; y <= localMaxY; y++) {
          const isTerrain = y <= sy;
          const isLavaOcean = !isTerrain && y <= lavaSeaLevel;

          if (isTerrain) {
            let type: BlockType;

            if (y === sy) {
              if (isCalderaLava) {
                type = BlockType.Lava;
              } else if (magmaNoise > 0.45) {
                type = BlockType.Magma;
              } else if (surfaceNoise > 0.15) {
                type = BlockType.Ash;
              } else if (surfaceNoise < -0.6) {
                type = BlockType.Obsidian;
              } else {
                type = BlockType.Basalt;
              }
            } else if (y >= sy - 2) {
              if (isCalderaLava) {
                type = BlockType.Magma;
              } else if (magmaNoise > 0.4) {
                type = BlockType.Magma;
              } else {
                type = BlockType.Basalt;
              }
            } else {
              type = BlockType.Basalt;

              // Veins of coal, iron, magma, and obsidian deep underground
              const oreRand = ctx.simplex.noise3d(x / 4, y / 4, z / 4);
              if (oreRand > 0.8) {
                type = BlockType.Coal;
              } else if (oreRand < -0.85) {
                type = BlockType.Iron;
              } else if (oreRand > 0.65 && y < sy - 8) {
                type = BlockType.Magma;
              } else if (oreRand < -0.75 && y < sy - 12) {
                type = BlockType.Obsidian;
              }
            }

            ctx.setBlock(x, y, z, type);
          } else if (isLavaOcean) {
            ctx.setBlock(x, y, z, BlockType.Lava);
          }
        }
      }
    }

    // ── Pass 2.5: Volcanic Lava Tubes and Caverns ─────────────────────────────
    for (let x = ctx.startX; x < ctx.endX; x++) {
      const lx = x - ctx.startX;
      for (let z = ctx.startZ; z < ctx.endZ; z++) {
        const lz = z - ctx.startZ;
        const sy = surfaceOf[colIdx(lx, lz)];
        const caveTop = sy - 4;

        for (let y = ctx.startY; y < Math.min(ctx.endY, caveTop + 1); y++) {
          const existing = ctx.getBlock(x, y, z);
          if (existing < 0 || existing === BlockType.Lava) continue;

          // Lava tube tunnels
          const ts = 34;
          const sA = ctx.simplex.noise3d(x / ts, y / ts, z / ts);
          const sB = ctx.simplex.noise3d((x + 1337) / ts, (y + 1337) / ts, (z + 1337) / ts);
          if (Math.abs(sA) + Math.abs(sB) < 0.22) {
            ctx.clearBlock(x, y, z);

            // Lava pools at bottom of deep caves
            if (y < lavaSeaLevel + 5) {
              const floorBlock = ctx.getBlock(x, y - 1, z);
              if (floorBlock > 0) {
                ctx.setBlock(x, y, z, BlockType.Lava);
              }
            }
          }
        }
      }
    }

    // ── Pass 3: Burnt / Charred Trees and Basalt Columns ──────────────────────
    const grid = 16;
    const searchPad = 8;
    if (ctx.startY > globalHeight + 25) return;

    const tStartX = Math.floor((ctx.startX - searchPad) / grid);
    const tEndX = Math.ceil((ctx.endX + searchPad) / grid);
    const tStartZ = Math.floor((ctx.startZ - searchPad) / grid);
    const tEndZ = Math.ceil((ctx.endZ + searchPad) / grid);

    for (let gx = tStartX; gx <= tEndX; gx++) {
      for (let gz = tStartZ; gz <= tEndZ; gz++) {
        const tx = gx * grid + grid / 2;
        const tz = gz * grid + grid / 2;

        const treeSeed = ctx.octaveBaseNoise(tx + 444, tz + 999, 1.0, 1);
        if (treeSeed > 0.4) {
          const baseNoise = ctx.octaveBaseNoise(tx, tz, 3.5, 4);
          const baseSY = Math.floor(globalHeight * (0.24 + 0.35 * baseNoise));

          if (baseSY > lavaSeaLevel + 3 && baseSY < globalHeight - 15) {
            const trunkH = 5 + (Math.floor(treeSeed * 10) % 5);
            for (let y = baseSY + 1; y <= baseSY + trunkH; y++) {
              if (y >= ctx.startY && y < ctx.endY) {
                if (tx >= ctx.startX && tx < ctx.endX && tz >= ctx.startZ && tz < ctx.endZ) {
                  ctx.setBlock(tx, y, tz, BlockType.Wood); // Charred burnt trunk
                  // Occasional jagged branch stub
                  if (y === baseSY + trunkH - 1 && treeSeed > 0.6) {
                    ctx.setBlock(tx + 1, y, tz, BlockType.Wood);
                  }
                }
              }
            }
          }
        }
      }
    }
  }
}
