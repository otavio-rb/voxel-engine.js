import ChunkData from '../classes/Chunk/ChunkData';
import ChunkGeometry from '../classes/Chunk/ChunkGeometry';
import { ChunkDataResult, ChunkJobData, WorkerResponse } from '../types';

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
    geometry,
  };

  // Transfer the ArrayBuffers instead of copying them (zero-copy).
  // Once transferred, the worker can no longer access these buffers.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (self as any).postMessage(response, [
    geometry.positions.buffer,
    geometry.normals.buffer,
    geometry.uvs.buffer,
    geometry.colors.buffer,
    geometry.isWater.buffer,
    geometry.vertices.buffer,
  ]);
};
