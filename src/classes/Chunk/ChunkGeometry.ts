import blockSides from '../../constants/block-sides';
import blockTypes from '../../constants/block-types';
import { BlockType, ChunkBorders, ChunkDataResult } from '../../types';

export default class ChunkGeometry {
  private opaquePositions: number[] = [];
  private opaqueNormals:   number[] = [];
  private opaqueUvs:       number[] = [];
  private opaqueColors:    number[] = [];
  private opaqueAo:       number[] = [];
  private opaqueVertices:  number[] = [];

  private waterPositions: number[] = [];
  private waterNormals:   number[] = [];
  private waterUvs:       number[] = [];
  private waterColors:    number[] = [];
  private waterAo:        number[] = [];
  private waterVertices:  number[] = [];

  constructor(chunkData: ChunkDataResult, neighbourBorderBlocks: ChunkBorders = {}) {
    this.build(chunkData, neighbourBorderBlocks);
  }

  private isSolid(
      nx: number, ny: number, nz: number, 
      blocks: Int8Array, 
      borders: ChunkBorders, 
      startX: number, startY: number, startZ: number, 
      size: number
  ): number {
      const type = this.getNeighbourBlock(nx, ny, nz, blocks, borders, startX, startY, startZ, size);
      return (type !== -1 && type !== BlockType.Empty && type !== BlockType.Water) ? 1 : 0;
  }

  private vertexAO(side1: number, side2: number, corner: number): number {
    if (side1 && side2) return 0;
    return 3 - (side1 + side2 + corner);
  }

  private getAOValues(
      x: number, y: number, z: number,
      dir: [number, number, number],
      corners: any[],
      blocks: Int8Array,
      borders: ChunkBorders,
      startX: number, startY: number, startZ: number,
      size: number
  ): number[] {
    const aoValues: number[] = [];
    
    // Determine the two axes perpendicular to the normal
    const axis = dir.indexOf(dir.find(d => d !== 0)!);
    const perp1 = (axis + 1) % 3;
    const perp2 = (axis + 2) % 3;

    for (const corner of corners) {
        const cpos = corner.pos; // relative to block [0, 1]
        
        // Offset for neighbors: 0 -> -1, 1 -> 1
        const o1 = [0, 0, 0];
        const o2 = [0, 0, 0];
        o1[perp1] = cpos[perp1] === 0 ? -1 : 1;
        o2[perp2] = cpos[perp2] === 0 ? -1 : 1;
        
        const side1 = this.isSolid(x + dir[0] + o1[0], y + dir[1] + o1[1], z + dir[2] + o1[2], blocks, borders, startX, startY, startZ, size);
        const side2 = this.isSolid(x + dir[0] + o2[0], y + dir[1] + o2[1], z + dir[2] + o2[2], blocks, borders, startX, startY, startZ, size);
        const cornerVal = this.isSolid(x + dir[0] + o1[0] + o2[0], y + dir[1] + o1[1] + o2[1], z + dir[2] + o1[2] + o2[2], blocks, borders, startX, startY, startZ, size);
        
        aoValues.push(this.vertexAO(side1, side2, cornerVal));
    }

    return aoValues;
  }

  private getNeighbourBlock(
      nx: number, ny: number, nz: number, 
      blocks: Int8Array, 
      borders: ChunkBorders, 
      startX: number, startY: number, startZ: number, 
      size: number
  ): number {
      const lx = nx - startX;
      const ly = ny - startY;
      const lz = nz - startZ;

      // Check locally
      if (lx >= 0 && lx < size && ly >= 0 && ly < size && lz >= 0 && lz < size) {
          return blocks[ly * size * size + lz * size + lx];
      }
      
      // Check borders
      if (lx === -1 && borders.negX && ly >= 0 && ly < size && lz >= 0 && lz < size) {
          return borders.negX[ly * size + lz];
      }
      if (lx === size && borders.posX && ly >= 0 && ly < size && lz >= 0 && lz < size) {
          return borders.posX[ly * size + lz];
      }
      if (ly === -1 && borders.negY && lx >= 0 && lx < size && lz >= 0 && lz < size) {
          return borders.negY[lz * size + lx];
      }
      if (ly === size && borders.posY && lx >= 0 && lx < size && lz >= 0 && lz < size) {
          return borders.posY[lz * size + lx];
      }
      if (lz === -1 && borders.negZ && lx >= 0 && lx < size && ly >= 0 && ly < size) {
          return borders.negZ[ly * size + lx];
      }
      if (lz === size && borders.posZ && lx >= 0 && lx < size && ly >= 0 && ly < size) {
          return borders.posZ[ly * size + lx];
      }
  
      return -1;
  }

  private build(chunkData: ChunkDataResult, neighbourBorderBlocks: ChunkBorders): void {
    const { blocks, startX, startY, startZ, endX } = chunkData;
    const size = endX - startX;

    for (let ly = 0; ly < size; ly++) {
      for (let lz = 0; lz < size; lz++) {
        for (let lx = 0; lx < size; lx++) {
          const idx = ly * size * size + lz * size + lx;
          const type = blocks[idx];
          
          if (type === -1 || type === BlockType.Empty) continue;

          const x = startX + lx;
          const y = startY + ly;
          const z = startZ + lz;

          const def = blockTypes[type as BlockType];
          const isCurrentWater = type === BlockType.Water;
          const skipBottom = y === 0;

          const r = ((def.color >> 16) & 0xff) / 255;
          const g = ((def.color >>  8) & 0xff) / 255;
          const b = ( def.color        & 0xff) / 255;

          for (const { dir, corners, label } of blockSides) {
            if (label === 'bottom' && skipBottom) continue;

            const nx = x + dir[0];
            const ny = y + dir[1];
            const nz = z + dir[2];
            
            const nType = this.getNeighbourBlock(nx, ny, nz, blocks, neighbourBorderBlocks, startX, startY, startZ, size);

            if (nType !== -1 && nType !== BlockType.Empty) {
                const isNeighbourWater = nType === BlockType.Water;
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
            const targetAo = isWater ? this.waterAo : this.opaqueAo;

            const baseIdx = targetPos.length / 3;
            const ao = this.getAOValues(x, y, z, dir as any, corners, blocks, neighbourBorderBlocks, startX, startY, startZ, size);

            for (let i = 0; i < 4; i++) {
              const { pos, uv } = corners[i];
              targetPos.push(pos[0] + x, pos[1] + y, pos[2] + z);
              targetNorm.push(dir[0], dir[1], dir[2]);
              targetColor.push(r, g, b);
              targetUv.push(uv[0], uv[1]);
              targetAo.push(ao[i] / 3.0);
            }

            if (ao[0] + ao[3] > ao[1] + ao[2]) {
                targetVertices.push(
                    baseIdx, baseIdx + 1, baseIdx + 2,
                    baseIdx + 2, baseIdx + 1, baseIdx + 3
                );
            } else {
                targetVertices.push(
                    baseIdx, baseIdx + 1, baseIdx + 3,
                    baseIdx, baseIdx + 3, baseIdx + 2
                );
            }
          }
        }
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
        ao:        new Float32Array(this.opaqueAo),
        isWater:   new Float32Array(this.opaquePositions.length / 3).fill(0.0),
        creationTime: new Float32Array(this.opaquePositions.length / 3).fill(0.0),
        vertices:  new Uint32Array(this.opaqueVertices),
      },
      water: {
        positions: new Float32Array(this.waterPositions),
        normals:   new Float32Array(this.waterNormals),
        uvs:       new Float32Array(this.waterUvs),
        colors:    new Float32Array(this.waterColors),
        ao:        new Float32Array(this.waterAo),
        isWater:   new Float32Array(this.waterPositions.length / 3).fill(1.0),
        creationTime: new Float32Array(this.waterPositions.length / 3).fill(0.0),
        vertices:  new Uint32Array(this.waterVertices),
      }
    };
  }
}
