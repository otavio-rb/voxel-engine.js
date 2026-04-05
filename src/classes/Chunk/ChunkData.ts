import { SimplexNoise } from 'three/examples/jsm/Addons.js';
import RNG from '../../utils/rng';
import { BlockType, BlocksMap, ChunkDataResult, WorldParams } from '../../types';

interface ChunkDataParams {
  size: number;
  height: number;
  startX: number;
  endX: number;
  startZ: number;
  endZ: number;
  worldParams: WorldParams;
}

export default class ChunkData {
  private readonly height: number;
  private readonly startX: number;
  private readonly endX: number;
  private readonly startZ: number;
  private readonly endZ: number;
  private readonly worldParams: WorldParams;
  private readonly simplex: SimplexNoise;

  readonly blocks: BlocksMap = {};

  constructor({ height, startX, endX, startZ, endZ, worldParams }: ChunkDataParams) {
    this.height   = height;
    this.startX   = startX;
    this.endX     = endX;
    this.startZ   = startZ;
    this.endZ     = endZ;
    this.worldParams = worldParams;

    const rng = new RNG(worldParams.seed);
    this.simplex = new SimplexNoise(rng);

    this.generate();
  }

  private key(x: number, y: number, z: number): string {
    return `${x}.${y}.${z}`;
  }

  private generate(): void {
    const seaLevel = Math.floor(this.height * 0.25);
    const surfaceOf = new Map<number, number>();
    const colIdx = (x: number, z: number) => x * 100_000 + z;

    // ── Pass 1: Surface calculation ──
    for (let x = this.startX; x < this.endX; x++) {
      for (let z = this.startZ; z < this.endZ; z++) {
        const contNoise = this.octaveBaseNoise(x, z, 4.0, 4); 
        const detailNoise = this.octaveBaseNoise(x + 500, z + 500, 0.4, 3);
        let sy = Math.floor(this.height * (0.3 + 0.5 * (contNoise * 0.8 + detailNoise * 0.2)));
        sy = Math.max(0, Math.min(sy, this.height));
        surfaceOf.set(colIdx(x, z), sy);
      }
    }

    const surfaceAt = (x: number, z: number): number => surfaceOf.get(colIdx(x, z)) ?? -1;

    // ── Pass 2: Base terrain ──
    for (let x = this.startX; x < this.endX; x++) {
      for (let z = this.startZ; z < this.endZ; z++) {
        const sy = surfaceOf.get(colIdx(x, z))!;
        const maxVisibleY = Math.min(this.height, Math.max(sy, seaLevel) + 30); // Extends even higher for majestic trees
        const temperature = this.octaveBaseNoise(x + 1234, z + 5678, 10.0, 2);

        for (let y = 0; y <= maxVisibleY; y++) {
          const isTerrain = y <= sy;
          const isWater   = !isTerrain && y <= seaLevel;

          // Culling (Simple)
          const topSolid    = y < maxVisibleY;
          const leftSolid   = (surfaceAt(x - 1, z) >= y) || (y <= seaLevel);
          const rightSolid  = (surfaceAt(x + 1, z) >= y) || (y <= seaLevel);
          const frontSolid  = (surfaceAt(x, z - 1) >= y) || (y <= seaLevel);
          const backSolid   = (surfaceAt(x, z + 1) >= y) || (y <= seaLevel);
          const bottomSolid = y > 0;

          if (isTerrain && topSolid && leftSolid && rightSolid && frontSolid && backSolid && bottomSolid) {
              if (y < sy) continue;
          }

          if (isTerrain) {
            // Cave carving
            const caveNoise = this.simplex.noise3d(x / 32, y / 16, z / 32);
            const depthFactor = Math.max(0.1, (sy - y) / 10.0);
            const caveThreshold = 0.08 * Math.min(1.0, depthFactor);
            if (Math.abs(caveNoise) < caveThreshold && y < sy) {
                if (y <= seaLevel) this.blocks[this.key(x, y, z)] = { type: BlockType.Water, position: { x, y, z } };
                continue;
            }

            let type: BlockType;
            if (y === sy) {
                if (temperature < -0.4 || sy > this.height * 0.75) type = BlockType.Snow;
                else if (temperature > 0.4 || sy <= seaLevel + 1) type = BlockType.Sand;
                else type = BlockType.Grass;
            } else if (y >= sy - 2) {
                if (temperature < -0.4 || sy > this.height * 0.75) type = BlockType.Snow;
                else if (temperature > 0.4 || sy <= seaLevel + 1) type = BlockType.Sand;
                else type = BlockType.Dirt;
            } else {
                type = BlockType.Stone;
                if (y < sy - 10) {
                    const oreRand = this.simplex.noise3d(x / 3, y / 3, z / 3);
                    if (oreRand > 0.8) type = BlockType.Coal;
                    else if (oreRand < -0.85) type = BlockType.Iron;
                }
            }
            this.blocks[this.key(x, y, z)] = { type, position: { x, y, z } };

          } else if (isWater) {
             this.blocks[this.key(x, y, z)] = { type: BlockType.Water, position: { x, y, z } };
          }

          // ── Pass 3: Trees (Scatter) ──
          // Trees spawn on temperate Grass biomes only
          if (sy > seaLevel && sy < this.height * 0.7) {
             const grid = 12; // Increased spacing for cleaner forests
             
             // Check a 3x3 grid of possible tree centers to avoid clipping
             for (let ox = -1; ox <= 1; ox++) {
               for (let oz = -1; oz <= 1; oz++) {
                  const tx = (Math.floor(x / grid) + ox) * grid + grid/2;
                  const tz = (Math.floor(z / grid) + oz) * grid + grid/2;
                  
                  const treeSeed = this.octaveBaseNoise(tx + 777, tz + 888, 1.0, 1);
                  if (treeSeed > 0.45) { // Consistent probability
                      const tVal = this.octaveBaseNoise(tx, tz, 4.0, 4) * 0.8;
                      const baseSY = Math.floor(this.height * (0.3 + 0.5 * tVal));
                      const tempAtBase = this.getTemperatureAt(tx, tz);

                      if (tempAtBase > -0.3 && tempAtBase < 0.3 && baseSY > seaLevel + 1) {
                          const trunkH = 8 + Math.floor(treeSeed * 20) % 8; // 8 to 15 blocks
                          
                          // Organic bend/tilt calculation
                          const tiltMag = (treeSeed * 3.5); // Up to 3.5 blocks of tilt at the top
                          const tiltAngle = treeSeed * Math.PI * 100.0;
                          
                          const endTX = tx + Math.cos(tiltAngle) * tiltMag;
                          const endTZ = tz + Math.sin(tiltAngle) * tiltMag;
                          
                          const cx = endTX, cy = baseSY + trunkH, cz = endTZ;
                          
                          // 1. Organic Trunk & Root Check
                          if (y > baseSY && y <= cy) {
                              const progress = (y - baseSY) / trunkH;
                              
                              // Power curve for natural bending (starts straight, bends at top)
                              const curve = Math.pow(progress, 1.5); 
                              
                              const curTX = Math.round(tx + Math.cos(tiltAngle) * tiltMag * curve);
                              const curTZ = Math.round(tz + Math.sin(tiltAngle) * tiltMag * curve);
                              
                              const distCenter = Math.abs(x - curTX) + Math.abs(z - curTZ);
                              
                              // Main trunk core: Thicker (cross pattern) for the entire height
                              if (distCenter <= 1) {
                                  this.blocks[this.key(x, y, z)] = { type: BlockType.Wood, position: { x, y, z } };
                              }
                              
                              // Advanced Root system: extends even further out at the very base
                              if (y === baseSY + 1) {
                                  // Roots sprout from the corners or ends of the thick base
                                  if (distCenter === 2 || (distCenter === 1 && progress > 0.5)) {
                                      const rootSeed = this.simplex.noise3d(x*5, y*5, z*5);
                                      if (rootSeed > 0.2) {
                                          this.blocks[this.key(x, y, z)] = { type: BlockType.Wood, position: { x, y, z } };
                                      }
                                  }
                              }
                          }
                          
                          // 2. Spherical Canopy Check with Linear Randomization
                          const dx = x - cx, dy = y - cy, dz = z - cz;
                          const distSq = dx * dx + (dy * dy / 0.6) + dz * dz;
                          
                          // Use a bit of local noise for a jittery/organic leaf edge
                          const jitter = this.simplex.noise3d(x/3.0, y/3.0, z/3.0) * 0.8;
                          const leafR = 5.0 + jitter; // Larger sphere radius
                          
                          if (distSq < leafR * leafR) {
                              const k = this.key(x, y, z);
                              if (!this.blocks[k]) {
                                  this.blocks[k] = { type: BlockType.Leaves, position: { x, y, z } };
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
      startZ: this.startZ,
      endZ:   this.endZ,
      blocks: this.blocks,
    };
  }
}
