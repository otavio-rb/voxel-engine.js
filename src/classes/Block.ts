import blockTypes from '../constants/block-types';
import blockSides from '../constants/block-sides';
import { BlockPosition, BlocksMap, BlockType } from '../types';

/** Internal (number[]) geometry data — converted to typed arrays in ChunkGeometry. */
interface RawGeometryData {
  positions: number[];
  normals:   number[];
  uvs:       number[];
  colors:    number[];
  isWater:   number[];
  vertices:  number[];
}

export default class Block {
  readonly position: BlockPosition;
  readonly blockType: BlockType;

  private positions: number[] = [];
  private vertices:  number[] = [];
  private normals:   number[] = [];
  private colors:    number[] = [];
  private uvs:       number[] = [];
  private isWater:   number[] = [];

  constructor(position: BlockPosition, blockType: BlockType) {
    this.position = position;
    this.blockType = blockType;
  }

  private createObjectKey(x: number, y: number, z: number): string {
    return `${x}.${y}.${z}`;
  }

  private isOpaque(x: number, y: number, z: number, blocks: BlocksMap): boolean {
    const key = this.createObjectKey(x, y, z);
    const b = blocks[key];
    if (!b) return false;
    
    // Water is NOT opaque, so neighbours should still render their faces
    if (b.type === BlockType.Water) return false;
    
    return true;
  }

  /**
   * Appends face geometry for every exposed face of this block.
   * @param baseIndex   The current vertex offset in the parent geometry.
   * @param allBlocks   Combined map of chunk blocks + neighbour border blocks.
   * @param skipBottom  Whether to skip the bottom face (y === 0).
   */
  buildFaces(baseIndex: number, allBlocks: BlocksMap, skipBottom: boolean): void {
    const def = blockTypes[this.blockType];
    const { x, y, z } = this.position;

    const r = ((def.color >> 16) & 0xff) / 255;
    const g = ((def.color >>  8) & 0xff) / 255;
    const b = ( def.color        & 0xff) / 255;

    const isCurrentWater = this.blockType === BlockType.Water;

    for (const { dir, corners, label } of blockSides) {
      if (label === 'bottom' && skipBottom) continue;

      const nx = x + dir[0];
      const ny = y + dir[1];
      const nz = z + dir[2];

      const neighbour = allBlocks[this.createObjectKey(nx, ny, nz)];
      
      // Face Culling Logic:
      // 1. If there is no neighbour, definitely render.
      // 2. If the neighbour is NOT opaque (like Water), definitely render.
      // 3. Exception: Water doesn't need to render faces against other Water.
      if (neighbour) {
          const isNeighbourWater = neighbour.type === BlockType.Water;
          
          if (isCurrentWater) {
              if (isNeighbourWater) continue; // Water vs Water -> Cull
          } else {
              if (!isNeighbourWater) continue; // Opaque vs Opaque -> Cull
          }
      }

      const ndx = baseIndex + this.positions.length / 3;

      for (const { pos, uv } of corners) {
        this.positions.push(pos[0] + x, pos[1] + y, pos[2] + z);
        this.normals.push(dir[0], dir[1], dir[2]);
        this.colors.push(r, g, b);
        this.uvs.push(uv[0], uv[1]);
        this.isWater.push(isCurrentWater ? 1.0 : 0.0);
      }

      this.vertices.push(ndx, ndx + 1, ndx + 2, ndx + 2, ndx + 1, ndx + 3);
    }
  }

  getData(): RawGeometryData {
    return {
      positions: this.positions,
      normals:   this.normals,
      uvs:       this.uvs,
      vertices:  this.vertices,
      colors:    this.colors,
      isWater:   this.isWater,
    };
  }
}
