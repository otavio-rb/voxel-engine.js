import Block from '../Block';
import { BlocksMap, BlockType, ChunkDataResult, GeometryData } from '../../types';

export default class ChunkGeometry {
  private positions: number[] = [];
  private normals:   number[] = [];
  private uvs:       number[] = [];
  private colors:    number[] = [];
  private isWater:   number[] = [];
  private vertices:  number[] = [];

  constructor(chunkData: ChunkDataResult, neighbourBorderBlocks: BlocksMap = {}) {
    this.build(chunkData, neighbourBorderBlocks);
  }

  private build(chunkData: ChunkDataResult, neighbourBorderBlocks: BlocksMap): void {
    const { blocks } = chunkData;
    const allBlocks: BlocksMap = { ...blocks, ...neighbourBorderBlocks };

    for (const key in blocks) {
      const blockData = blocks[key];
      if (blockData.type === BlockType.Empty) continue;

      const block = new Block(blockData.position, blockData.type);
      block.buildFaces(this.positions.length / 3, allBlocks, blockData.position.y === 0);

      const d = block.getData();

      for (let i = 0; i < d.positions.length; i++) this.positions.push(d.positions[i]);
      for (let i = 0; i < d.normals.length;   i++) this.normals.push(d.normals[i]);
      for (let i = 0; i < d.uvs.length;       i++) this.uvs.push(d.uvs[i]);
      for (let i = 0; i < d.colors.length;    i++) this.colors.push(d.colors[i]);
      for (let i = 0; i < d.isWater.length;   i++) this.isWater.push(d.isWater[i]);
      for (let i = 0; i < d.vertices.length;  i++) this.vertices.push(d.vertices[i]);
    }
  }

  getData(): GeometryData {
    return {
      positions: new Float32Array(this.positions),
      normals:   new Float32Array(this.normals),
      uvs:       new Float32Array(this.uvs),
      colors:    new Float32Array(this.colors),
      isWater:   new Float32Array(this.isWater),
      vertices:  new Uint32Array(this.vertices),
    };
  }
}
