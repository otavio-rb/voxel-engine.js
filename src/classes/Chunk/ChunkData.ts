import { SimplexNoise } from 'three/examples/jsm/Addons.js';
import RNG from '../../utils/rng';
import { BlockType, ChunkDataResult, WorldParams, WorldType } from '../../types';

interface ChunkDataParams {
  size: number;
  height: number;
  startX: number;
  endX: number;
  startY: number;
  endY: number;
  startZ: number;
  endZ: number;
  worldParams: WorldParams;
  /** Fix 1: pre-built SimplexNoise instance injected from the worker cache.
   *  If omitted (e.g. tests), a new one is created from worldParams.seed. */
  simplex?: SimplexNoise;
}

export default class ChunkData {
  private readonly size: number;
  private readonly startX: number;
  private readonly endX: number;
  private readonly startY: number;
  private readonly endY: number;
  private readonly startZ: number;
  private readonly endZ: number;
  private readonly worldParams: WorldParams;
  private readonly simplex: SimplexNoise;

  readonly blocks: Int8Array;

  constructor({ size, startX, endX, startY, endY, startZ, endZ, worldParams, simplex }: ChunkDataParams) {
    this.size     = size;
    this.startX   = startX;
    this.endX     = endX;
    this.startY   = startY;
    this.endY     = endY;
    this.startZ   = startZ;
    this.endZ     = endZ;
    this.worldParams = worldParams;

    // Fix 1: reuse the caller-provided instance; only create a new one as fallback
    this.simplex = simplex ?? new SimplexNoise(new RNG(worldParams.seed));

    this.blocks = new Int8Array(size * size * size).fill(-1);

    this.generate();
  }

  private idx(x: number, y: number, z: number): number {
    if (y < this.startY || y >= this.endY || x < this.startX || x >= this.endX || z < this.startZ || z >= this.endZ) return -1;
    return (y - this.startY) * this.size * this.size + (z - this.startZ) * this.size + (x - this.startX);
  }

  private setBlock(x: number, y: number, z: number, type: BlockType): void {
    const i = this.idx(x, y, z);
    if (i !== -1) this.blocks[i] = type;
  }

  private clearBlock(x: number, y: number, z: number): void {
    const i = this.idx(x, y, z);
    if (i !== -1) this.blocks[i] = -1;
  }

  private getBlock(x: number, y: number, z: number): number {
    const i = this.idx(x, y, z);
    if (i === -1) return -1;
    return this.blocks[i];
  }

  private generate(): void {
    switch (this.worldParams.worldType) {
      case WorldType.Flat:
        this.generateFlat();
        break;
      case WorldType.Cavern:
        this.generateCavern();
        break;
      case WorldType.Lunar:
        this.generateLunar();
        break;
      case WorldType.Mercury:
        this.generateMercury();
        break;
      case WorldType.Standard:
      default:
        this.generateStandard();
        break;
    }
  }

  private generateFlat(): void {
    const height = 20;

    // Fix 3: skip chunks entirely above the flat terrain ceiling
    if (this.startY > height) return;

    for (let x = this.startX; x < this.endX; x++) {
      for (let z = this.startZ; z < this.endZ; z++) {
        for (let y = this.startY; y < this.endY; y++) {
          if (y > height) continue;
          let type: BlockType = BlockType.Stone;
          if (y === height) type = BlockType.Grass;
          else if (y > height - 3) type = BlockType.Dirt;
          this.setBlock(x, y, z, type);
        }
      }
    }
  }

  private generateStandard(): void {
    const globalHeight = 128;
    const seaLevel     = Math.floor(globalHeight * 0.25);

    if (this.startY > globalHeight + 20) return;
    if (this.endY <= 0) return;

    // ── Pass 1: Surface height per column ────────────────────────────────────
    const surfaceOf = new Int16Array(this.size * this.size);
    const colIdx    = (lx: number, lz: number) => lz * this.size + lx;

    for (let x = this.startX; x < this.endX; x++) {
      const lx = x - this.startX;
      for (let z = this.startZ; z < this.endZ; z++) {
        const lz = z - this.startZ;
        const contNoise   = this.octaveBaseNoise(x, z, 4.0, 4);
        const detailNoise = this.octaveBaseNoise(x + 500, z + 500, 0.4, 3);
        let sy = Math.floor(globalHeight * (0.3 + 0.5 * (contNoise * 0.8 + detailNoise * 0.2)));
        sy = Math.max(0, Math.min(sy, globalHeight));
        surfaceOf[colIdx(lx, lz)] = sy;
      }
    }

    // ── Pass 2: Base terrain (solid, no caves yet) ───────────────────────────
    for (let x = this.startX; x < this.endX; x++) {
      const lx = x - this.startX;
      for (let z = this.startZ; z < this.endZ; z++) {
        const lz  = z - this.startZ;
        const sy  = surfaceOf[colIdx(lx, lz)];
        if (this.startY > sy && this.startY > seaLevel) continue;

        const localMaxY   = Math.min(this.endY - 1, Math.max(sy, seaLevel) + 2);
        const temperature = this.octaveBaseNoise(x + 1234, z + 5678, 10.0, 2);

        for (let y = this.startY; y <= localMaxY; y++) {
          const isTerrain = y <= sy;
          const isWater   = !isTerrain && y <= seaLevel;
          if (isTerrain) {
            let type: BlockType;
            if (y === sy) {
              if (temperature < -0.4 || sy > globalHeight * 0.75)  type = BlockType.Snow;
              else if (temperature > 0.4 || sy <= seaLevel + 1)    type = BlockType.Sand;
              else                                                   type = BlockType.Grass;
            } else if (y >= sy - 2) {
              if (temperature < -0.4 || sy > globalHeight * 0.75)  type = BlockType.Snow;
              else if (temperature > 0.4 || sy <= seaLevel + 1)    type = BlockType.Sand;
              else                                                   type = BlockType.Dirt;
            } else {
              type = BlockType.Stone;
              if (y < sy - 10) {
                const oreRand = this.simplex.noise3d(x / 3, y / 3, z / 3);
                if (oreRand > 0.8)        type = BlockType.Coal;
                else if (oreRand < -0.85) type = BlockType.Iron;
              }
            }
            this.setBlock(x, y, z, type);
          } else if (isWater) {
            this.setBlock(x, y, z, BlockType.Water);
          }
        }
      }
    }

    // ── Pass 2.5: Multi-Layer Cave Carving ──────────────────────────────────
    //  Four distinct cave types carved after terrain is fully solid:
    //  1. Spaghetti tunnels  – thin, winding passages
    //  2. Noodle caves       – medium-width tunnels
    //  3. Large chambers     – open caverns (deep only)
    //  4. Swiss-cheese blobs – irregular ovoid voids
    for (let x = this.startX; x < this.endX; x++) {
      const lx = x - this.startX;
      for (let z = this.startZ; z < this.endZ; z++) {
        const lz = z - this.startZ;
        const sy = surfaceOf[colIdx(lx, lz)];
        // Leave at least 4 solid blocks near the surface
        const caveTop = sy - 4;

        for (let y = this.startY; y < Math.min(this.endY, caveTop + 1); y++) {
          const existing = this.getBlock(x, y, z);
          if (existing < 0 || existing === BlockType.Water) continue;

          const depth  = sy - y;
          const depthF = Math.min(depth / 80.0, 1.0); // 0→1 as depth increases
          let carve = false;

          // 1. Spaghetti tunnels — thin winding passages
          if (!carve) {
            const ts = 38;
            const sA = this.simplex.noise3d(x / ts, y / ts, z / ts);
            const sB = this.simplex.noise3d((x + 1337) / ts, (y + 1337) / ts, (z + 1337) / ts);
            // Aggressive threshold — caves get wider with depth
            if (Math.abs(sA) + Math.abs(sB) < 0.25 + depthF * 0.12) carve = true;
          }

          // 2. Noodle caves — medium-width passages
          if (!carve) {
            const tn = 56;
            const nA = this.simplex.noise3d(x / tn, y / tn, z / tn);
            const nB = this.simplex.noise3d((x + 2500) / tn, (y + 2500) / tn, (z + 2500) / tn);
            if (Math.abs(nA) + Math.abs(nB) < 0.32) carve = true;
          }

          // 3. Large chambers — open caverns (depth > 15)
          if (!carve && depth > 15) {
            const tc = 88;
            const cN = this.simplex.noise3d(x / tc, y / tc, z / tc);
            const cM = this.simplex.noise3d(x / 175, y / 140, z / 175);
            if (cN > 0.45 && cM > -0.2) carve = true;
          }

          // 4. Swiss-cheese blobs — irregular ovoid voids (depth > 8)
          if (!carve && depth > 8) {
            const tv = 22;
            const vN = this.simplex.noise3d(x / tv, y / tv, z / tv);
            const vM = this.simplex.noise3d(x / 66, y / 66, z / 66);
            if (vN > 0.58 && vM > 0.15) carve = true;
          }

          if (carve) this.clearBlock(x, y, z);
        }
      }
    }

    // ── Pass 2.6: Cave Decorations ──────────────────────────────────────────
    //  Stalactites (hang from ceiling), stalagmites (grow from floor),
    //  gravel-like cave floors, and underground water pools.
    for (let x = this.startX; x < this.endX; x++) {
      const lx = x - this.startX;
      for (let z = this.startZ; z < this.endZ; z++) {
        const lz = z - this.startZ;
        const sy = surfaceOf[colIdx(lx, lz)];

        for (let y = this.startY + 1; y < Math.min(this.endY - 1, sy - 2); y++) {
          const block = this.getBlock(x, y, z);
          const above = this.getBlock(x, y + 1, z);
          const below = this.getBlock(x, y - 1, z);
          const depth  = sy - y;

          if (block < 0) {
            // ── Air block inside a cave ──

            // Stalactite: hanging stone from a solid stone ceiling
            if (above === BlockType.Stone && depth > 8) {
              const sn = this.simplex.noise3d(x * 0.5, y * 0.5, z * 0.5);
              if (sn > 0.55) {
                this.setBlock(x, y, z, BlockType.Stone);
                if (sn > 0.72 && this.getBlock(x, y - 1, z) < 0) {
                  this.setBlock(x, y - 1, z, BlockType.Stone); // 2-block stalactite
                }
              }
            }


          } else if (block === BlockType.Stone || block === BlockType.Dirt) {
            // ── Solid block that is a cave floor (air above) ──

            if (above < 0 && depth > 6) {
              // Gravel-like floor: replace top stone with dirt/sand
              const gn = this.simplex.noise3d(x / 6, 0, z / 6);
              if (gn > 0.35) this.setBlock(x, y, z, BlockType.Dirt);

              // Stalagmite: stone pillar growing up from cave floor
              if (depth > 14) {
                const stN = this.simplex.noise3d(x * 0.6, y * 0.6, z * 0.6);
                if (stN > 0.68) {
                  if (this.getBlock(x, y + 1, z) < 0) {
                    this.setBlock(x, y + 1, z, BlockType.Stone);
                    if (stN > 0.82 && this.getBlock(x, y + 2, z) < 0) {
                      this.setBlock(x, y + 2, z, BlockType.Stone); // 2-block stalagmite
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
    const grid      = 12;
    const searchPad = 10;

    if (this.startY > globalHeight + 25) return;

    const tStartX = Math.floor((this.startX - searchPad) / grid);
    const tEndX   = Math.ceil((this.endX + searchPad) / grid);
    const tStartZ = Math.floor((this.startZ - searchPad) / grid);
    const tEndZ   = Math.ceil((this.endZ + searchPad) / grid);

    for (let gx = tStartX; gx <= tEndX; gx++) {
      for (let gz = tStartZ; gz <= tEndZ; gz++) {
        const tx = gx * grid + grid / 2;
        const tz = gz * grid + grid / 2;
        
        const treeSeed = this.octaveBaseNoise(tx + 777, tz + 888, 1.0, 1);
        if (treeSeed > 0.45) {
          const tVal        = this.octaveBaseNoise(tx, tz, 4.0, 4) * 0.8;
          const tGlobalH    = 128;
          const tSeaLevel   = Math.floor(tGlobalH * 0.25);
          const baseSY      = Math.floor(tGlobalH * (0.3 + 0.5 * tVal));
          const tempAtBase  = this.getTemperatureAt(tx, tz);

          if (tempAtBase > -0.3 && tempAtBase < 0.3 && baseSY > tSeaLevel + 1) {
            const trunkH   = 8 + Math.floor(treeSeed * 20) % 8;
            const tiltMag  = (treeSeed * 3.5);
            const tiltAngle = treeSeed * Math.PI * 100.0;
            
            const endTX = tx + Math.cos(tiltAngle) * tiltMag;
            const endTZ = tz + Math.sin(tiltAngle) * tiltMag;
            const cx = endTX, cy = baseSY + trunkH, cz = endTZ;
            
            const influence = 8;
            const treeMinX = Math.floor(Math.min(tx, endTX) - influence);
            const treeMaxX = Math.ceil(Math.max(tx, endTX) + influence);
            const treeMinZ = Math.floor(Math.min(tz, endTZ) - influence);
            const treeMaxZ = Math.ceil(Math.max(tz, endTZ) + influence);

            const workStartX = Math.max(this.startX, treeMinX);
            const workEndX   = Math.min(this.endX,   treeMaxX);
            const workStartZ = Math.max(this.startZ, treeMinZ);
            const workEndZ   = Math.min(this.endZ,   treeMaxZ);

            if (workStartX >= workEndX || workStartZ >= workEndZ) continue;

            for (let x = workStartX; x < workEndX; x++) {
              for (let z = workStartZ; z < workEndZ; z++) {
                const localMinY = Math.max(this.startY, baseSY);
                const localMaxY = Math.min(this.endY - 1, Math.round(cy + 8));

                for (let y = localMinY; y <= localMaxY; y++) {
                  if (y > baseSY && y <= cy) {
                    const progress   = (y - baseSY) / trunkH;
                    const curve      = Math.pow(progress, 1.5);
                    const curTX      = Math.round(tx + Math.cos(tiltAngle) * tiltMag * curve);
                    const curTZ      = Math.round(tz + Math.sin(tiltAngle) * tiltMag * curve);
                    const distCenter = Math.abs(x - curTX) + Math.abs(z - curTZ);
                    if (distCenter <= 1) this.setBlock(x, y, z, BlockType.Wood);
                    if (y === baseSY + 1 && (distCenter === 2 || (distCenter === 1 && progress > 0.5))) {
                      const rootSeed = this.simplex.noise3d(x*5, y*5, z*5);
                      if (rootSeed > 0.2) this.setBlock(x, y, z, BlockType.Wood);
                    }
                  }
                  const dx = x - cx, dy = y - cy, dz = z - cz;
                  const distSq = dx * dx + (dy * dy / 0.6) + dz * dz;
                  const jitter = this.simplex.noise3d(x/3.0, y/3.0, z/3.0) * 0.8;
                  const leafR  = 5.0 + jitter;
                  if (distSq < leafR * leafR) {
                    const cur = this.getBlock(x, y, z);
                    if (cur === -1 || cur === BlockType.Water) this.setBlock(x, y, z, BlockType.Leaves);
                  }
                }
              }
            }
          }
        }
      }
    }
  }

  private generateCavern(): void {
    const globalHeight = 128;

    // Fix 3: cavern world only has content within 0..globalHeight
    if (this.startY > globalHeight || this.endY <= 0) return;

    for (let x = this.startX; x < this.endX; x++) {
      for (let z = this.startZ; z < this.endZ; z++) {
        for (let y = this.startY; y < this.endY; y++) {
          const noise   = this.simplex.noise3d(x / 16, y / 16, z / 16);
          const density = noise + (0.5 - y / globalHeight);
          if (density > 0.1) {
            let type = BlockType.Stone;
            if (noise > 0.7) type = BlockType.Coal;
            this.setBlock(x, y, z, type);
          }
        }
      }
    }
  }

  private generateLunar(): void {
    const globalHeight = 128;

    // Fix 3: skip chunks above max possible surface
    if (this.startY > globalHeight || this.endY <= 0) return;

    // Fix 2: flat array instead of Map for surfaceOf
    const surfaceOf = new Int16Array(this.size * this.size);

    for (let x = this.startX; x < this.endX; x++) {
      const lx = x - this.startX;
      for (let z = this.startZ; z < this.endZ; z++) {
        const lz    = z - this.startZ;
        const noise = this.octaveBaseNoise(x, z, 2.0, 3);
        let sy      = Math.floor(globalHeight * (0.1 + 0.2 * noise));

        const craterCX = Math.floor(x / 50) * 50 + 25;
        const craterCZ = Math.floor(z / 50) * 50 + 25;
        const dist     = Math.sqrt((x - craterCX) ** 2 + (z - craterCZ) ** 2);
        if (dist < 15) sy -= Math.floor((15 - dist) * 0.5);

        sy = Math.max(2, Math.min(sy, globalHeight));
        surfaceOf[lz * this.size + lx] = sy;

        const maxY = Math.min(sy, this.endY - 1);
        for (let y = this.startY; y <= maxY; y++) {
          let type: BlockType = BlockType.Stone;
          if (y === sy && noise > 0.5) type = BlockType.Snow;
          this.setBlock(x, y, z, type);
        }
      }
    }
  }

  private generateMercury(): void {
    const globalHeight = 128;

    // Fix 3: skip chunks above max possible surface
    if (this.startY > globalHeight || this.endY <= 0) return;

    for (let x = this.startX; x < this.endX; x++) {
      for (let z = this.startZ; z < this.endZ; z++) {
        const baseNoise   = this.octaveBaseNoise(x, z, 3.0, 5);
        const detailNoise = this.octaveBaseNoise(x + 500, z + 500, 0.5, 3);
        let surfaceY = Math.floor(globalHeight * (0.2 + 0.4 * (baseNoise * 0.7 + detailNoise * 0.3)));

        const craterFreq    = 64;
        const craterCX      = Math.floor(x / craterFreq) * craterFreq + craterFreq/2;
        const craterCZ      = Math.floor(z / craterFreq) * craterFreq + craterFreq/2;
        const distToCrater  = Math.sqrt((x - craterCX) ** 2 + (z - craterCZ) ** 2);
        if (distToCrater < 16) surfaceY -= Math.floor((16 - distToCrater) * 0.8);

        surfaceY = Math.max(1, Math.min(surfaceY, globalHeight - 1));

        // Fix 3c: column entirely above terrain → skip
        if (this.startY > surfaceY) continue;

        const maxY = Math.min(surfaceY, this.endY - 1);
        for (let y = this.startY; y <= maxY; y++) {
          let type: BlockType = BlockType.Stone;
          if (y === surfaceY) {
              const rand = this.simplex.noise3d(x/10, y/10, z/10);
              if (rand > 0.4)       type = BlockType.Coal;
              else if (rand < -0.4) type = BlockType.Sand;
          } else if (y < surfaceY - 4) {
              type = BlockType.Coal;
          }
          this.setBlock(x, y, z, type);
        }
      }
    }
  }

  private getTemperatureAt(x: number, z: number): number {
    return this.octaveBaseNoise(x + 1234, z + 5678, 10.0, 2);
  }

  private octaveBaseNoise(x: number, z: number, localScaleMult: number, localOctaves: number): number {
    const { scale, persistence } = this.worldParams.terrain;
    const finalScale = scale * localScaleMult;
    let value    = 0;
    let amplitude = 1;
    let frequency = 1;
    let maxValue  = 0;

    for (let i = 0; i < localOctaves; i++) {
        value    += this.simplex.noise((x * frequency) / finalScale, (z * frequency) / finalScale) * amplitude;
        maxValue += amplitude;
        amplitude *= persistence;
        frequency *= 2;
    }
    return value / maxValue;
  }

  getData(): ChunkDataResult {
    return {
      startX: this.startX,
      endX:   this.endX,
      startY: this.startY,
      endY:   this.endY,
      startZ: this.startZ,
      endZ:   this.endZ,
      blocks: this.blocks,
    };
  }
}
