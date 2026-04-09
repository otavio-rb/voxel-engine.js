import ChunkData from '../classes/Chunk/ChunkData';
import ChunkGeometry from '../classes/Chunk/ChunkGeometry';
import { ChunkDataResult, ChunkJobData, WorkerResponse, ChunkBorders, BlocksMap } from '../types';

self.onmessage = (e: MessageEvent<ChunkJobData>): void => {
  const job = e.data;

  // If existingBlocks is provided this is a rebuild job — skip terrain generation.
  const chunkDataResult: ChunkDataResult = job.existingBlocks
    ? { startX: job.startX, endX: job.endX, startZ: job.startZ, endZ: job.endZ, blocks: job.existingBlocks }
    : new ChunkData({
        size:        job.size,
        height:      job.height,
        startX:      job.startX,
        endX:        job.endX,
        startZ:      job.startZ,
        endZ:        job.endZ,
        worldParams: job.worldParams,
      }).getData();

  const geometry = new ChunkGeometry(chunkDataResult, job.neighbourBorderBlocks).getData();

  const response: WorkerResponse = {
    chunkKey:  job.chunkKey,
    chunkData: chunkDataResult,
    borders:   computeBorders(chunkDataResult),
    opaque:    geometry.opaque,
    water:     geometry.water,
  };

  // Transfer the ArrayBuffers instead of copying them (zero-copy).
  // Once transferred, the worker can no longer access these buffers.
  const transferables: ArrayBuffer[] = [
    geometry.opaque.positions.buffer,
    geometry.opaque.normals.buffer,
    geometry.opaque.uvs.buffer,
    geometry.opaque.colors.buffer,
    geometry.opaque.isWater.buffer,
    geometry.opaque.creationTime.buffer,
    geometry.opaque.vertices.buffer,
    geometry.water.positions.buffer,
    geometry.water.normals.buffer,
    geometry.water.uvs.buffer,
    geometry.water.colors.buffer,
    geometry.water.isWater.buffer,
    geometry.water.creationTime.buffer,
    geometry.water.vertices.buffer,
  ];

  (self as any).postMessage(response, transferables);
};

function computeBorders(data: ChunkDataResult): ChunkBorders {
    const maxX = data.endX - 1;
    const maxZ = data.endZ - 1;
    const negX: BlocksMap = {};
    const posX: BlocksMap = {};
    const negZ: BlocksMap = {};
    const posZ: BlocksMap = {};

    for (const k in data.blocks) {
      const b  = data.blocks[k];
      const bx = b.position.x;
      const bz = b.position.z;
      if (bx === data.startX) negX[k] = b;
      if (bx === maxX)        posX[k] = b;
      if (bz === data.startZ) negZ[k] = b;
      if (bz === maxZ)        posZ[k] = b;
    }

    return { negX, posX, negZ, posZ };
}
