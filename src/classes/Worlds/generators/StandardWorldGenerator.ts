import { ChunkContext, WorldGenerator } from '../../../core/world/WorldGenerator';
import { BlockType } from '../../../types';

export class StandardWorldGenerator implements WorldGenerator {
  public readonly id = 'standard';

  public generate(ctx: ChunkContext): void {
    const globalHeight = 128;
    const seaLevel = Math.floor(globalHeight * 0.25);

    if (ctx.startY > globalHeight + 20) return;
    if (ctx.endY <= -512) return;

    // ── Pass 1: Surface height per column ────────────────────────────────────
    const surfaceOf = new Int16Array(ctx.size * ctx.size);
    const colIdx = (lx: number, lz: number) => lz * ctx.size + lx;

    for (let x = ctx.startX; x < ctx.endX; x++) {
      const lx = x - ctx.startX;
      for (let z = ctx.startZ; z < ctx.endZ; z++) {
        const lz = z - ctx.startZ;
        const contNoise = ctx.octaveBaseNoise(x, z, 4.0, 4);
        const detailNoise = ctx.octaveBaseNoise(x + 500, z + 500, 0.4, 3);
        let sy = Math.floor(globalHeight * (0.3 + 0.5 * (contNoise * 0.8 + detailNoise * 0.2)));
        sy = Math.max(0, Math.min(sy, globalHeight));
        surfaceOf[colIdx(lx, lz)] = sy;
      }
    }

    // ── Pass 2: Base terrain (solid, no caves yet) ───────────────────────────
    for (let x = ctx.startX; x < ctx.endX; x++) {
      const lx = x - ctx.startX;
      for (let z = ctx.startZ; z < ctx.endZ; z++) {
        const lz = z - ctx.startZ;
        const sy = surfaceOf[colIdx(lx, lz)];
        if (ctx.startY > sy && ctx.startY > seaLevel) continue;

        const localMaxY = Math.min(ctx.endY - 1, Math.max(sy, seaLevel) + 2);
        const temperature = ctx.octaveBaseNoise(x + 1234, z + 5678, 10.0, 2);

        for (let y = ctx.startY; y <= localMaxY; y++) {
          const isTerrain = y <= sy;
          const isWater = !isTerrain && y <= seaLevel;
          if (isTerrain) {
            let type: BlockType;
            if (y === sy) {
              if (temperature < -0.4 || sy > globalHeight * 0.75) type = BlockType.Snow;
              else if (temperature > 0.4 || sy <= seaLevel + 1) type = BlockType.Sand;
              else type = BlockType.Grass;
            } else if (y >= sy - 2) {
              if (temperature < -0.4 || sy > globalHeight * 0.75) type = BlockType.Snow;
              else if (temperature > 0.4 || sy <= seaLevel + 1) type = BlockType.Sand;
              else type = BlockType.Dirt;
            } else {
              type = BlockType.Stone;
              if (y < sy - 10) {
                const oreRand = ctx.simplex.noise3d(x / 3, y / 3, z / 3);
                if (oreRand > 0.8) type = BlockType.Coal;
                else if (oreRand < -0.85) type = BlockType.Iron;
              }
            }
            ctx.setBlock(x, y, z, type);
          } else if (isWater) {
            ctx.setBlock(x, y, z, BlockType.Water);
          }
        }
      }
    }

    // ── Pass 2.5: Multi-Layer Cave Carving ──────────────────────────────────
    for (let x = ctx.startX; x < ctx.endX; x++) {
      const lx = x - ctx.startX;
      for (let z = ctx.startZ; z < ctx.endZ; z++) {
        const lz = z - ctx.startZ;
        const sy = surfaceOf[colIdx(lx, lz)];
        const caveTop = sy - 4;

        for (let y = ctx.startY; y < Math.min(ctx.endY, caveTop + 1); y++) {
          const existing = ctx.getBlock(x, y, z);
          if (existing < 0 || existing === BlockType.Water) continue;

          const depth = sy - y;
          const depthF = Math.min(depth / 80.0, 1.0);
          let carve = false;

          // 1. Spaghetti tunnels
          if (!carve) {
            const ts = 38;
            const sA = ctx.simplex.noise3d(x / ts, y / ts, z / ts);
            const sB = ctx.simplex.noise3d((x + 1337) / ts, (y + 1337) / ts, (z + 1337) / ts);
            if (Math.abs(sA) + Math.abs(sB) < 0.25 + depthF * 0.12) carve = true;
          }

          // 2. Noodle caves
          if (!carve) {
            const tn = 56;
            const nA = ctx.simplex.noise3d(x / tn, y / tn, z / tn);
            const nB = ctx.simplex.noise3d((x + 2500) / tn, (y + 2500) / tn, (z + 2500) / tn);
            if (Math.abs(nA) + Math.abs(nB) < 0.32) carve = true;
          }

          // 3. Large chambers
          if (!carve && depth > 15) {
            const tc = 88;
            const cN = ctx.simplex.noise3d(x / tc, y / tc, z / tc);
            const cM = ctx.simplex.noise3d(x / 175, y / 140, z / 175);
            if (cN > 0.45 && cM > -0.2) carve = true;
          }

          // 4. Swiss-cheese blobs
          if (!carve && depth > 8) {
            const tv = 22;
            const vN = ctx.simplex.noise3d(x / tv, y / tv, z / tv);
            const vM = ctx.simplex.noise3d(x / 66, y / 66, z / 66);
            if (vN > 0.58 && vM > 0.15) carve = true;
          }

          if (carve) ctx.clearBlock(x, y, z);
        }
      }
    }

    // ── Pass 2.6: Cave Decorations ──────────────────────────────────────────
    for (let x = ctx.startX; x < ctx.endX; x++) {
      const lx = x - ctx.startX;
      for (let z = ctx.startZ; z < ctx.endZ; z++) {
        const lz = z - ctx.startZ;
        const sy = surfaceOf[colIdx(lx, lz)];

        for (let y = ctx.startY + 1; y < Math.min(ctx.endY - 1, sy - 2); y++) {
          const block = ctx.getBlock(x, y, z);
          const above = ctx.getBlock(x, y + 1, z);
          const depth = sy - y;

          if (block < 0) {
            if (above === BlockType.Stone && depth > 8) {
              const sn = ctx.simplex.noise3d(x * 0.5, y * 0.5, z * 0.5);
              if (sn > 0.55) {
                ctx.setBlock(x, y, z, BlockType.Stone);
                if (sn > 0.72 && ctx.getBlock(x, y - 1, z) < 0) {
                  ctx.setBlock(x, y - 1, z, BlockType.Stone);
                }
              }
            }
          } else if (block === BlockType.Stone || block === BlockType.Dirt) {
            if (above < 0 && depth > 6) {
              const gn = ctx.simplex.noise3d(x / 6, 0, z / 6);
              if (gn > 0.35) ctx.setBlock(x, y, z, BlockType.Dirt);

              if (depth > 14) {
                const stN = ctx.simplex.noise3d(x * 0.6, y * 0.6, z * 0.6);
                if (stN > 0.68) {
                  if (ctx.getBlock(x, y + 1, z) < 0) {
                    ctx.setBlock(x, y + 1, z, BlockType.Stone);
                    if (stN > 0.82 && ctx.getBlock(x, y + 2, z) < 0) {
                      ctx.setBlock(x, y + 2, z, BlockType.Stone);
                    }
                  }
                }
              }
            }
          }
        }
      }
    }

    // ── Pass 3: Trees (Scatter) ───────────────────────────────────────────────
    const grid = 12;
    const searchPad = 10;

    if (ctx.startY > globalHeight + 25) return;

    const tStartX = Math.floor((ctx.startX - searchPad) / grid);
    const tEndX = Math.ceil((ctx.endX + searchPad) / grid);
    const tStartZ = Math.floor((ctx.startZ - searchPad) / grid);
    const tEndZ = Math.ceil((ctx.endZ + searchPad) / grid);

    for (let gx = tStartX; gx <= tEndX; gx++) {
      for (let gz = tStartZ; gz <= tEndZ; gz++) {
        const tx = gx * grid + grid / 2;
        const tz = gz * grid + grid / 2;

        const treeSeed = ctx.octaveBaseNoise(tx + 777, tz + 888, 1.0, 1);
        if (treeSeed > 0.45) {
          const tVal = ctx.octaveBaseNoise(tx, tz, 4.0, 4) * 0.8;
          const tGlobalH = 128;
          const tSeaLevel = Math.floor(tGlobalH * 0.25);
          const baseSY = Math.floor(tGlobalH * (0.3 + 0.5 * tVal));
          const tempAtBase = ctx.octaveBaseNoise(tx + 1234, tz + 5678, 10.0, 2);

          if (tempAtBase > -0.3 && tempAtBase < 0.3 && baseSY > tSeaLevel + 1) {
            const trunkH = 8 + (Math.floor(treeSeed * 20) % 8);
            const tiltMag = treeSeed * 3.5;
            const tiltAngle = treeSeed * Math.PI * 100.0;

            const endTX = tx + Math.cos(tiltAngle) * tiltMag;
            const endTZ = tz + Math.sin(tiltAngle) * tiltMag;
            const cx = endTX,
              cy = baseSY + trunkH,
              cz = endTZ;

            const influence = 8;
            const treeMinX = Math.floor(Math.min(tx, endTX) - influence);
            const treeMaxX = Math.ceil(Math.max(tx, endTX) + influence);
            const treeMinZ = Math.floor(Math.min(tz, endTZ) - influence);
            const treeMaxZ = Math.ceil(Math.max(tz, endTZ) + influence);

            const workStartX = Math.max(ctx.startX, treeMinX);
            const workEndX = Math.min(ctx.endX, treeMaxX);
            const workStartZ = Math.max(ctx.startZ, treeMinZ);
            const workEndZ = Math.min(ctx.endZ, treeMaxZ);

            if (workStartX >= workEndX || workStartZ >= workEndZ) continue;

            for (let x = workStartX; x < workEndX; x++) {
              for (let z = workStartZ; z < workEndZ; z++) {
                const localMinY = Math.max(ctx.startY, baseSY);
                const localMaxY = Math.min(ctx.endY - 1, Math.round(cy + 8));

                for (let y = localMinY; y <= localMaxY; y++) {
                  if (y > baseSY && y <= cy) {
                    const progress = (y - baseSY) / trunkH;
                    const curve = Math.pow(progress, 1.5);
                    const curTX = Math.round(tx + Math.cos(tiltAngle) * tiltMag * curve);
                    const curTZ = Math.round(tz + Math.sin(tiltAngle) * tiltMag * curve);
                    const distCenter = Math.abs(x - curTX) + Math.abs(z - curTZ);
                    if (distCenter <= 1) ctx.setBlock(x, y, z, BlockType.Wood);
                    if (y === baseSY + 1 && (distCenter === 2 || (distCenter === 1 && progress > 0.5))) {
                      const rootSeed = ctx.simplex.noise3d(x * 5, y * 5, z * 5);
                      if (rootSeed > 0.2) ctx.setBlock(x, y, z, BlockType.Wood);
                    }
                  }
                  const dx = x - cx,
                    dy = y - cy,
                    dz = z - cz;
                  const distSq = dx * dx + (dy * dy) / 0.6 + dz * dz;
                  const jitter = ctx.simplex.noise3d(x / 3.0, y / 3.0, z / 3.0) * 0.8;
                  const leafR = 5.0 + jitter;
                  if (distSq < leafR * leafR) {
                    const cur = ctx.getBlock(x, y, z);
                    if (cur === -1 || cur === BlockType.Water) ctx.setBlock(x, y, z, BlockType.Leaves);
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
