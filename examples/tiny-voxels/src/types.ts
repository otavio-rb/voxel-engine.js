export type SculptMode = 'add' | 'carve' | 'paint';

export interface SculptConfig {
  mode: SculptMode;
  /**
   * Raio do pincel em BLOCOS. Nunca em voxels: o pincel precisa cobrir o mesmo volume
   * fisico independentemente da resolucao, e nunca pode chegar a um unico voxel.
   */
  brushRadiusBlocks: number;
  blockType: number;
}

export interface TinyStats {
  fps: number;
  x: number;
  y: number;
  z: number;
  targetBlock: string;
  brushRadiusBlocks: number;
  mode: SculptMode;
}
