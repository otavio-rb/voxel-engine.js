import blockSides from '../../constants/block-sides';
import blockTypes from '../../constants/block-types';
import { BlocksMap, BlockType, ChunkDataResult, GeometryData } from '../../types';

export default class ChunkGeometry {
  private opaquePositions: number[] = [];
  private opaqueNormals:   number[] = [];
  private opaqueUvs:       number[] = [];
  private opaqueColors:    number[] = [];
  private opaqueVertices:  number[] = [];

  private waterPositions: number[] = [];
  private waterNormals:   number[] = [];
  private waterUvs:       number[] = [];
  private waterColors:    number[] = [];
  private waterVertices:  number[] = [];

  constructor(chunkData: ChunkDataResult, neighbourBorderBlocks: BlocksMap = {}) {
    this.build(chunkData, neighbourBorderBlocks);
  }

  private build(chunkData: ChunkDataResult, neighbourBorderBlocks: BlocksMap): void {
    const { blocks } = chunkData;

    for (const key in blocks) {
      const blockData = blocks[key];
      if (blockData.type === BlockType.Empty) continue;

      const { x, y, z } = blockData.position;
      const def = blockTypes[blockData.type];
      const isCurrentWater = blockData.type === BlockType.Water;
      const skipBottom = y === 0;

      const r = ((def.color >> 16) & 0xff) / 255;
      const g = ((def.color >>  8) & 0xff) / 255;
      const b = ( def.color        & 0xff) / 255;

      for (const { dir, corners, label } of blockSides) {
        if (label === 'bottom' && skipBottom) continue;

        const nx = x + dir[0];
        const ny = y + dir[1];
        const nz = z + dir[2];
        const nKey = `${nx}.${ny}.${nz}`;

        // Fast neighbor lookup: first check local chunk, then borders
        const neighbour = blocks[nKey] || neighbourBorderBlocks[nKey];
        
        if (neighbour) {
            const isNeighbourWater = neighbour.type === BlockType.Water;
            if (isCurrentWater) {
                if (isNeighbourWater) continue;
            } else {
                if (!isNeighbourWater) continue;
            }
        }

        const isWater = isCurrentWater;
        const targetPos = isWater ? this.waterPositions : this.opaquePositions;
        const targetNorm = isWater ? this.waterNormals : this.opaqueNormals;
        const targetColor = isWater ? this.waterColors : this.opaqueColors;
        const targetUv = isWater ? this.waterUvs : this.opaqueUvs;
        const targetVertices = isWater ? this.waterVertices : this.opaqueVertices;

        const baseIdx = targetPos.length / 3;

        for (const { pos, uv } of corners) {
          targetPos.push(pos[0] + x, pos[1] + y, pos[2] + z);
          targetNorm.push(dir[0], dir[1], dir[2]);
          targetColor.push(r, g, b);
          targetUv.push(uv[0], uv[1]);
        }

        targetVertices.push(
            baseIdx, baseIdx + 1, baseIdx + 2,
            baseIdx + 2, baseIdx + 1, baseIdx + 3
        );
      }
    }
  }

  getData() {
    return {
      opaque: {
        positions: new Float32Array(this.opaquePositions),
        normals:   new Float32Array(this.opaqueNormals),
        uvs:       new Float32Array(this.opaqueUvs),
        colors:    new Float32Array(this.opaqueColors),
        isWater:   new Float32Array(this.opaquePositions.length / 3).fill(0.0),
        creationTime: new Float32Array(this.opaquePositions.length / 3).fill(0.0),
        vertices:  new Uint32Array(this.opaqueVertices),
      },
      water: {
        positions: new Float32Array(this.waterPositions),
        normals:   new Float32Array(this.waterNormals),
        uvs:       new Float32Array(this.waterUvs),
        colors:    new Float32Array(this.waterColors),
        isWater:   new Float32Array(this.waterPositions.length / 3).fill(1.0),
        creationTime: new Float32Array(this.waterPositions.length / 3).fill(0.0),
        vertices:  new Uint32Array(this.waterVertices),
      }
    };
  }
}
