import { SimplexNoise } from 'three/examples/jsm/Addons.js';
import RNG from '../../utils/rng';
import { ChunkDataResult, WorldParams } from '../../types';
import { ChunkContext } from '../../core/world/WorldGenerator';
import { worldGeneratorRegistry } from '../../core/world/WorldGeneratorRegistry';
import '../Worlds/generators'; // garante que os geradores padrão estejam registrados

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
  simplex?: SimplexNoise;
}

export default class ChunkData implements ChunkContext {
  readonly size: number;
  readonly startX: number;
  readonly endX: number;
  readonly startY: number;
  readonly endY: number;
  readonly startZ: number;
  readonly endZ: number;
  readonly worldParams: WorldParams;
  readonly simplex: SimplexNoise;

  readonly blocks: Int8Array;
  readonly waterLevels: Uint8Array;

  constructor({ size, startX, endX, startY, endY, startZ, endZ, worldParams, simplex }: ChunkDataParams) {
    this.size = size;
    this.startX = startX;
    this.endX = endX;
    this.startY = startY;
    this.endY = endY;
    this.startZ = startZ;
    this.endZ = endZ;
    this.worldParams = worldParams;

    this.simplex = simplex ?? new SimplexNoise(new RNG(worldParams.seed));

    this.blocks = new Int8Array(size * size * size).fill(-1);
    this.waterLevels = new Uint8Array(size * size * size).fill(0);

    this.generate();
  }

  public idx(x: number, y: number, z: number): number {
    if (y < this.startY || y >= this.endY || x < this.startX || x >= this.endX || z < this.startZ || z >= this.endZ) return -1;
    return (y - this.startY) * this.size * this.size + (z - this.startZ) * this.size + (x - this.startX);
  }

  public setBlock(x: number, y: number, z: number, type: number): void {
    const i = this.idx(x, y, z);
    if (i !== -1) {
      this.blocks[i] = type;
      // Bloco 6 é água no registro padrão
      this.waterLevels[i] = type === 6 ? 255 : 0;
    }
  }

  public clearBlock(x: number, y: number, z: number): void {
    const i = this.idx(x, y, z);
    if (i !== -1) {
      this.blocks[i] = -1;
      this.waterLevels[i] = 0;
    }
  }

  public getBlock(x: number, y: number, z: number): number {
    const i = this.idx(x, y, z);
    if (i === -1) return -1;
    return this.blocks[i];
  }

  public octaveBaseNoise(x: number, z: number, localScaleMult: number, localOctaves: number): number {
    const { scale, persistence } = this.worldParams.terrain;
    const finalScale = scale * localScaleMult;
    let value = 0;
    let amplitude = 1;
    let frequency = 1;
    let maxValue = 0;

    for (let i = 0; i < localOctaves; i++) {
      value += this.simplex.noise((x * frequency) / finalScale, (z * frequency) / finalScale) * amplitude;
      maxValue += amplitude;
      amplitude *= persistence;
      frequency *= 2;
    }
    return value / maxValue;
  }

  private generate(): void {
    const typeKey = (this.worldParams.worldType || 'standard').toLowerCase();
    const generator = worldGeneratorRegistry.get(typeKey) ?? worldGeneratorRegistry.get('standard');

    if (generator) {
      generator.generate(this);
    }
  }

  public getData(): ChunkDataResult {
    return {
      startX: this.startX,
      endX: this.endX,
      startY: this.startY,
      endY: this.endY,
      startZ: this.startZ,
      endZ: this.endZ,
      blocks: this.blocks,
      waterLevels: this.waterLevels,
    };
  }
}
