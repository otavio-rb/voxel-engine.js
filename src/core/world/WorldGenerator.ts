import { SimplexNoise } from 'three/examples/jsm/Addons.js';
import { WorldParams } from '../../types';

export interface ChunkContext {
  readonly size: number;
  readonly startX: number;
  readonly endX: number;
  readonly startY: number;
  readonly endY: number;
  readonly startZ: number;
  readonly endZ: number;
  readonly blocks: Int8Array;
  readonly waterLevels: Uint8Array;
  readonly worldParams: WorldParams;
  readonly simplex: SimplexNoise;

  setBlock(x: number, y: number, z: number, type: number): void;
  getBlock(x: number, y: number, z: number): number;
  clearBlock(x: number, y: number, z: number): void;
  octaveBaseNoise(x: number, z: number, localScaleMult: number, localOctaves: number): number;
}

export interface WorldGenerator {
  readonly id: string;
  generate(context: ChunkContext): void;
}
