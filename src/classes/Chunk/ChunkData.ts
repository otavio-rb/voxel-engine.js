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
    const colIdx   = (x: number, z: number) => x * 100_000 + z;

    // ── Pass 1: surface heights ──────────────────────────────────────────────
    const surfaceOf = new Map<number, number>();
    for (let x = this.startX; x < this.endX; x++) {
      for (let z = this.startZ; z < this.endZ; z++) {
        const contNoise   = this.octaveBaseNoise(x, z, 4.0, 4);
        const detailNoise = this.octaveBaseNoise(x + 500, z + 500, 0.4, 3);
        let sy = Math.floor(this.height * (0.3 + 0.5 * (contNoise * 0.8 + detailNoise * 0.2)));
        surfaceOf.set(colIdx(x, z), Math.max(0, Math.min(sy, this.height)));
      }
    }

    const surfaceAt = (x: number, z: number): number => surfaceOf.get(colIdx(x, z)) ?? -1;

    // ── Pass 2: cave carving ─────────────────────────────────────────────────
    // Pre-compute all carved blocks BEFORE culling so that Pass 3 can correctly
    // expose faces adjacent to caves and cave entrances (y === sy).
    //
    // Threshold: 0.13 at the surface (creates entrance holes), grows to 0.27
    // underground (wider tunnels deep down). y >= 2 keeps a solid bedrock layer.
    const caveSet = new Set<string>();
    for (let x = this.startX; x < this.endX; x++) {
      for (let z = this.startZ; z < this.endZ; z++) {
        const sy = surfaceOf.get(colIdx(x, z))!;
        for (let y = 2; y <= sy; y++) {
          const n         = this.simplex.noise3d(x / 32, y / 16, z / 32);
          const depth     = Math.max(0, sy - y);
          const threshold = 0.13 + Math.min(0.14, depth * 0.012);
          if (Math.abs(n) < threshold) caveSet.add(this.key(x, y, z));
        }
      }
    }

    // Cave-aware solid check: a position is solid only if it has terrain AND is not carved.
    const isSolid = (x: number, y: number, z: number): boolean =>
      surfaceAt(x, z) >= y && !caveSet.has(this.key(x, y, z));

    // ── Pass 3: block placement + cave-aware culling ─────────────────────────
    for (let x = this.startX; x < this.endX; x++) {
      for (let z = this.startZ; z < this.endZ; z++) {
        const sy          = surfaceOf.get(colIdx(x, z))!;
        const maxVisibleY = Math.min(this.height, Math.max(sy, seaLevel) + 30);
        const temperature = this.octaveBaseNoise(x + 1234, z + 5678, 10.0, 2);

        for (let y = 0; y <= maxVisibleY; y++) {
          const isCarved = caveSet.has(this.key(x, y, z));

          // Flooded caves below sea level
          if (isCarved) {
            if (y <= seaLevel) this.blocks[this.key(x, y, z)] = { type: BlockType.Water, position: { x, y, z } };
            continue; // carved air — no trees grow inside caves
          }

          const isTerrain = y <= sy;
          const isWater   = !isTerrain && y <= seaLevel;

          if (isTerrain) {
            // Cave-aware buried-block culling.
            // isSolid() accounts for both surface height AND cave carving, so
            // blocks bordering a cave entrance are correctly NOT skipped.
            const topSolid    = isSolid(x, y + 1, z);
            const leftSolid   = isSolid(x - 1, y, z) || (y <= seaLevel && !caveSet.has(this.key(x - 1, y, z)));
            const rightSolid  = isSolid(x + 1, y, z) || (y <= seaLevel && !caveSet.has(this.key(x + 1, y, z)));
            const frontSolid  = isSolid(x, y, z - 1) || (y <= seaLevel && !caveSet.has(this.key(x, y, z - 1)));
            const backSolid   = isSolid(x, y, z + 1) || (y <= seaLevel && !caveSet.has(this.key(x, y, z + 1)));
            const bottomSolid = y > 0;

            if (topSolid && leftSolid && rightSolid && frontSolid && backSolid && bottomSolid) continue;

            let type: BlockType;
            if (y === sy) {
              if (temperature < -0.4 || sy > this.height * 0.75) type = BlockType.Snow;
              else if (temperature > 0.4 || sy <= seaLevel + 1)  type = BlockType.Sand;
              else type = BlockType.Grass;
            } else if (y >= sy - 2) {
              if (temperature < -0.4 || sy > this.height * 0.75) type = BlockType.Snow;
              else if (temperature > 0.4 || sy <= seaLevel + 1)  type = BlockType.Sand;
              else type = BlockType.Dirt;
            } else {
              type = BlockType.Stone;
              if (y < sy - 10) {
                const oreRand = this.simplex.noise3d(x / 3, y / 3, z / 3);
                if (oreRand > 0.8)        type = BlockType.Coal;
                else if (oreRand < -0.85) type = BlockType.Iron;
              }
            }
            this.blocks[this.key(x, y, z)] = { type, position: { x, y, z } };

          } else if (isWater) {
            this.blocks[this.key(x, y, z)] = { type: BlockType.Water, position: { x, y, z } };
          }

          // ── Trees (Scatter) ──────────────────────────────────────────────
          if (sy > seaLevel && sy < this.height * 0.7) {
            const grid = 12;
            for (let ox = -1; ox <= 1; ox++) {
              for (let oz = -1; oz <= 1; oz++) {
                const tx = (Math.floor(x / grid) + ox) * grid + grid / 2;
                const tz = (Math.floor(z / grid) + oz) * grid + grid / 2;

                const treeSeed = this.octaveBaseNoise(tx + 777, tz + 888, 1.0, 1);
                if (treeSeed > 0.45) {
                  const tVal    = this.octaveBaseNoise(tx, tz, 4.0, 4) * 0.8;
                  const baseSY  = Math.floor(this.height * (0.3 + 0.5 * tVal));
                  const tempAtBase = this.getTemperatureAt(tx, tz);

                  if (tempAtBase > -0.3 && tempAtBase < 0.3 && baseSY > seaLevel + 1) {
                    const trunkH   = 8 + Math.floor(treeSeed * 20) % 8;
                    const tiltMag  = treeSeed * 3.5;
                    const tiltAngle = treeSeed * Math.PI * 100.0;
                    const endTX    = tx + Math.cos(tiltAngle) * tiltMag;
                    const endTZ    = tz + Math.sin(tiltAngle) * tiltMag;
                    const cx = endTX, cy = baseSY + trunkH, cz = endTZ;

                    if (y > baseSY && y <= cy) {
                      const progress  = (y - baseSY) / trunkH;
                      const curve     = Math.pow(progress, 1.5);
                      const curTX     = Math.round(tx + Math.cos(tiltAngle) * tiltMag * curve);
                      const curTZ     = Math.round(tz + Math.sin(tiltAngle) * tiltMag * curve);
                      const distCenter = Math.abs(x - curTX) + Math.abs(z - curTZ);

                      if (distCenter <= 1) {
                        this.blocks[this.key(x, y, z)] = { type: BlockType.Wood, position: { x, y, z } };
                      }
                      if (y === baseSY + 1) {
                        if (distCenter === 2 || (distCenter === 1 && progress > 0.5)) {
                          if (this.simplex.noise3d(x * 5, y * 5, z * 5) > 0.2) {
                            this.blocks[this.key(x, y, z)] = { type: BlockType.Wood, position: { x, y, z } };
                          }
                        }
                      }
                    }

                    const dx = x - cx, dy = y - cy, dz = z - cz;
                    const distSq = dx * dx + (dy * dy / 0.6) + dz * dz;
                    const jitter = this.simplex.noise3d(x / 3.0, y / 3.0, z / 3.0) * 0.8;
                    const leafR  = 5.0 + jitter;
                    if (distSq < leafR * leafR) {
                      const k = this.key(x, y, z);
                      if (!this.blocks[k]) this.blocks[k] = { type: BlockType.Leaves, position: { x, y, z } };
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
