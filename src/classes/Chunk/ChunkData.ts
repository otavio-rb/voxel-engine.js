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

  constructor({ size, startX, endX, startY, endY, startZ, endZ, worldParams }: ChunkDataParams) {
    this.size     = size;
    this.startX   = startX;
    this.endX     = endX;
    this.startY   = startY;
    this.endY     = endY;
    this.startZ   = startZ;
    this.endZ     = endZ;
    this.worldParams = worldParams;

    this.blocks = new Int8Array(size * size * size).fill(-1);

    const rng = new RNG(worldParams.seed);
    this.simplex = new SimplexNoise(rng);

    this.generate();
  }

  private idx(x: number, y: number, z: number): number {
    if (y < this.startY || y >= this.endY || x < this.startX || x >= this.endX || z < this.startZ || z >= this.endZ) return -1;
    return (y - this.startY) * this.size * this.size + (z - this.startZ) * this.size + (x - this.startX);
  }

  private setBlock(x: number, y: number, z: number, type: BlockType): void {
    const i = this.idx(x, y, z);
    if (i !== -1) {
        this.blocks[i] = type;
    }
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
    const seaLevel = Math.floor(globalHeight * 0.25);
    const surfaceOf = new Map<number, number>();
    const colIdx = (x: number, z: number) => x * 100_000 + z;

    // ── Pass 1: Surface calculation ──
    for (let x = this.startX; x < this.endX; x++) {
      for (let z = this.startZ; z < this.endZ; z++) {
        const contNoise = this.octaveBaseNoise(x, z, 4.0, 4); 
        const detailNoise = this.octaveBaseNoise(x + 500, z + 500, 0.4, 3);
        let sy = Math.floor(globalHeight * (0.3 + 0.5 * (contNoise * 0.8 + detailNoise * 0.2)));
        sy = Math.max(0, Math.min(sy, globalHeight));
        surfaceOf.set(colIdx(x, z), sy);
      }
    }

    const surfaceAt = (x: number, z: number): number => surfaceOf.get(colIdx(x, z)) ?? -1;

    // ── Pass 2: Base terrain ──
    for (let x = this.startX; x < this.endX; x++) {
      for (let z = this.startZ; z < this.endZ; z++) {
        const sy = surfaceOf.get(colIdx(x, z))!;
        
        // Fast paths: chunk entirely above terrain
        if (this.startY > sy && this.startY > seaLevel) continue;
        
        const localMaxY = Math.min(this.endY - 1, Math.max(sy, seaLevel) + 2);
        const temperature = this.octaveBaseNoise(x + 1234, z + 5678, 10.0, 2);

        for (let y = this.startY; y <= localMaxY; y++) {
          const isTerrain = y <= sy;
          const isWater   = !isTerrain && y <= seaLevel;

          if (isTerrain) {
            // ── Cave & Chamber System ──
            const noiseScale = 48; // Larger tunnels
            // Isotropic noise (same scale for y) so tunnels don't get squished horizontally
            const nA = this.simplex.noise3d(x / noiseScale, y / noiseScale, z / noiseScale);
            const nB = this.simplex.noise3d((x + 1000) / noiseScale, (y + 1000) / noiseScale, (z + 1000) / noiseScale);
            const nMask = this.simplex.noise3d(x / 128, y / 128, z / 128); // Larger masking scale so caves go deeper
            
            // Spaghetti Caves (intersection of two noise fields)
            const spaghetti = Math.abs(nA) + Math.abs(nB);
            const caveThreshold = 0.12 * (nMask + 0.5); // Mask fluctuates thickness
            
            // Larger Rooms
            const chamberThreshold = -0.7;
            const isChamber = nA < chamberThreshold && nMask > -0.2;
            
            const isCave = (spaghetti < caveThreshold && nMask > -0.4) || isChamber;

            if (isCave) {
                // Surface Entrance Check: allow caves to poke through the surface
                const isBuried = y < sy - 1; 
                // We carve if we are buried OR if it's a strong cave opening near the surface
                if (isBuried || (isCave && y <= sy)) {
                    // Left as air, making the cave completely dry
                    continue; // Cave carved, don't place terrain
                }
            }

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
                    const oreRand = this.simplex.noise3d(x / 3, y / 3, z / 3);
                    if (oreRand > 0.8) type = BlockType.Coal;
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

    // ── Pass 3: Trees (Scatter) ──
    const grid = 12;      // Spacing between tree candidates
    const searchPad = 10; // Max reach of a tree from its center
    
    // Iterate over all tree cells that could affect this chunk
    const tStartX = Math.floor((this.startX - searchPad) / grid);
    const tEndX   = Math.ceil((this.endX + searchPad) / grid);
    const tStartZ = Math.floor((this.startZ - searchPad) / grid);
    const tEndZ   = Math.ceil((this.endZ + searchPad) / grid);

    for (let gx = tStartX; gx <= tEndX; gx++) {
      for (let gz = tStartZ; gz <= tEndZ; gz++) {
        const tx = gx * grid + grid / 2;
        const tz = gz * grid + grid / 2;
        
        // Consistent tree check based on tree center
        const treeSeed = this.octaveBaseNoise(tx + 777, tz + 888, 1.0, 1);
        if (treeSeed > 0.45) {
          const tVal = this.octaveBaseNoise(tx, tz, 4.0, 4) * 0.8;
          const globalHeight = 128;
          const seaLevel = Math.floor(globalHeight * 0.25);
          const baseSY = Math.floor(globalHeight * (0.3 + 0.5 * tVal));
          const tempAtBase = this.getTemperatureAt(tx, tz);

          // Tree existence conditions
          if (tempAtBase > -0.3 && tempAtBase < 0.3 && baseSY > seaLevel + 1) {
            const trunkH = 8 + Math.floor(treeSeed * 20) % 8;
            const tiltMag = (treeSeed * 3.5);
            const tiltAngle = treeSeed * Math.PI * 100.0;
            
            const endTX = tx + Math.cos(tiltAngle) * tiltMag;
            const endTZ = tz + Math.sin(tiltAngle) * tiltMag;
            const cx = endTX, cy = baseSY + trunkH, cz = endTZ;
            
            // Influence radius (max possible leaf reach)
            const influence = 8;
            const treeMinX = Math.floor(Math.min(tx, endTX) - influence);
            const treeMaxX = Math.ceil(Math.max(tx, endTX) + influence);
            const treeMinZ = Math.floor(Math.min(tz, endTZ) - influence);
            const treeMaxZ = Math.ceil(Math.max(tz, endTZ) + influence);

            // Intersect with current chunk
            const workStartX = Math.max(this.startX, treeMinX);
            const workEndX   = Math.min(this.endX,   treeMaxX);
            const workStartZ = Math.max(this.startZ, treeMinZ);
            const workEndZ   = Math.min(this.endZ,   treeMaxZ);

            if (workStartX >= workEndX || workStartZ >= workEndZ) continue;

            for (let x = workStartX; x < workEndX; x++) {
              for (let z = workStartZ; z < workEndZ; z++) {
                // Determine vertical range for trunk + canopy
                const localMinY = Math.max(this.startY, baseSY);
                const localMaxY = Math.min(this.endY - 1, Math.round(cy + 8));

                for (let y = localMinY; y <= localMaxY; y++) {
                  // 1. Organic Trunk & Root Check
                  if (y > baseSY && y <= cy) {
                    const progress = (y - baseSY) / trunkH;
                    const curve = Math.pow(progress, 1.5); 
                    
                    const curTX = Math.round(tx + Math.cos(tiltAngle) * tiltMag * curve);
                    const curTZ = Math.round(tz + Math.sin(tiltAngle) * tiltMag * curve);
                    
                    const distCenter = Math.abs(x - curTX) + Math.abs(z - curTZ);
                    
                    if (distCenter <= 1) {
                        this.setBlock(x, y, z, BlockType.Wood);
                    }
                    
                    // Roots system
                    if (y === baseSY + 1 && (distCenter === 2 || (distCenter === 1 && progress > 0.5))) {
                        const rootSeed = this.simplex.noise3d(x*5, y*5, z*5);
                        if (rootSeed > 0.2) {
                            this.setBlock(x, y, z, BlockType.Wood);
                        }
                    }
                  }
                  
                  // 2. Spherical Canopy Check
                  const dx = x - cx, dy = y - cy, dz = z - cz;
                  const distSq = dx * dx + (dy * dy / 0.6) + dz * dz;
                  const jitter = this.simplex.noise3d(x/3.0, y/3.0, z/3.0) * 0.8;
                  const leafR = 5.0 + jitter;
                  
                  if (distSq < leafR * leafR) {
                      const cur = this.getBlock(x, y, z);
                      // Don't overwrite trunk or terrain if it was already set
                      if (cur === -1 || cur === BlockType.Water) {
                          this.setBlock(x, y, z, BlockType.Leaves);
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

  private generateCavern(): void {
    const globalHeight = 128;
    for (let x = this.startX; x < this.endX; x++) {
      for (let z = this.startZ; z < this.endZ; z++) {
        for (let y = this.startY; y < this.endY; y++) {
          const noise = this.simplex.noise3d(x / 16, y / 16, z / 16);
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
    const surfaceOf = new Map<number, number>();
    const colIdx = (x: number, z: number) => x * 100_000 + z;
    const globalHeight = 128;

    for (let x = this.startX; x < this.endX; x++) {
      for (let z = this.startZ; z < this.endZ; z++) {
        const noise = this.octaveBaseNoise(x, z, 2.0, 3);
        let sy = Math.floor(globalHeight * (0.1 + 0.2 * noise));
        
        // Simple crater logic
        const cx = Math.floor(x / 50) * 50 + 25;
        const cz = Math.floor(z / 50) * 50 + 25;
        const dist = Math.sqrt((x - cx) ** 2 + (z - cz) ** 2);
        if (dist < 15) {
            const craterDepth = (15 - dist) * 0.5;
            sy -= Math.floor(craterDepth);
        }

        sy = Math.max(2, Math.min(sy, globalHeight));
        surfaceOf.set(colIdx(x, z), sy);

        const maxY = Math.min(sy, this.endY - 1);
        for (let y = this.startY; y <= maxY; y++) {
          let type = BlockType.Stone;
          if (y === sy && noise > 0.5) type = BlockType.Snow; // Grayish dust/snow/sand
          this.setBlock(x, y, z, type);
        }
      }
    }
  }

  private generateMercury(): void {
    const globalHeight = 128;
    for (let x = this.startX; x < this.endX; x++) {
      for (let z = this.startZ; z < this.endZ; z++) {
        // Base terrain noise - Very rugged
        const baseNoise = this.octaveBaseNoise(x, z, 3.0, 5);
        const detailNoise = this.octaveBaseNoise(x + 500, z + 500, 0.5, 3);
        let surfaceY = Math.floor(globalHeight * (0.2 + 0.4 * (baseNoise * 0.7 + detailNoise * 0.3)));

        // Large craters
        const craterFreq = 64;
        const cx = Math.floor(x / craterFreq) * craterFreq + craterFreq/2;
        const cz = Math.floor(z / craterFreq) * craterFreq + craterFreq/2;
        const distToCrater = Math.sqrt((x - cx) ** 2 + (z - cz) ** 2);
        
        if (distToCrater < 16) {
           const depth = (16 - distToCrater) * 0.8;
           surfaceY -= Math.floor(depth);
        }

        surfaceY = Math.max(1, Math.min(surfaceY, globalHeight - 1));

        const maxY = Math.min(surfaceY, this.endY - 1);
        for (let y = this.startY; y <= maxY; y++) {
          if (y <= surfaceY) {
            let type = BlockType.Stone;
            if (y === surfaceY) {
                const rand = this.simplex.noise3d(x/10, y/10, z/10);
                if (rand > 0.4) type = BlockType.Coal; // Scorched spots
                else if (rand < -0.4) type = BlockType.Sand; // Sulfuric/Dusty spots
            } else if (y < surfaceY - 4) {
                type = BlockType.Coal; // Deep basalt
            }
            this.setBlock(x, y, z, type);
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
      startY: this.startY,
      endY:   this.endY,
      startZ: this.startZ,
      endZ:   this.endZ,
      blocks: this.blocks,
    };
  }
}
