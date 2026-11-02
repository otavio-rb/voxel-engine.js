import { SimplexNoise } from 'three/examples/jsm/Addons.js';
import { WorldParams } from '../types';

export interface ChunkContext {
  readonly size: number;
  readonly startX: number;
  readonly endX: number;
  readonly startY: number;
  readonly endY: number;
  readonly startZ: number;
  readonly endZ: number;
  readonly blocks: Int16Array;
  readonly waterLevels: Uint8Array;
  readonly worldParams: WorldParams;
  readonly simplex: SimplexNoise;
  /**
   * Voxels por bloco deste mundo (1 = voxel classico, 8 = minivoxel de 1/8 de bloco).
   * Escreva o relevo em blocos e multiplique por este fator: o mesmo gerador serve
   * qualquer resolucao, e as frequencias de ruido nao precisam ser redescobertas na mao.
   */
  readonly voxelsPerBlock: number;
  /**
   * Quantos voxels de MUNDO cada celula deste chunk representa. 1 = resolucao cheia.
   */
  readonly stride: number;

  setBlock(x: number, y: number, z: number, type: number): void;
  getBlock(x: number, y: number, z: number): number;
  clearBlock(x: number, y: number, z: number): void;
  octaveBaseNoise(x: number, z: number, localScaleMult: number, localOctaves: number): number;
}

export interface WorldGenerator {
  readonly id: string;
  generate(context: ChunkContext): void;
}
