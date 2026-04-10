import ChunkData from '../classes/Chunk/ChunkData';
import ChunkGeometry from '../classes/Chunk/ChunkGeometry';
import { ChunkDataResult, ChunkJobData, WorkerResponse, ChunkBorders } from '../types';

self.onmessage = (e: MessageEvent<ChunkJobData>): void => {
  const job = e.data;

  // If existingBlocks is provided this is a rebuild job — skip terrain generation.
  const chunkDataResult: ChunkDataResult = job.existingBlocks
    ? { startX: job.startX, endX: job.endX, startY: job.startY, endY: job.endY, startZ: job.startZ, endZ: job.endZ, blocks: job.existingBlocks }
    : new ChunkData({
        size:        job.size,
        height:      job.height,
        startX:      job.startX,
        endX:        job.endX,
        startY:      job.startY,
        endY:        job.endY,
        startZ:      job.startZ,
        endZ:        job.endZ,
        worldParams: job.worldParams,
      }).getData();

  const geometry = job.buildMesh !== false 
      ? new ChunkGeometry(chunkDataResult, job.neighbourBorderBlocks).getData() 
      : undefined;
      
  const borders = computeBorders(chunkDataResult, job.size);

  const response: WorkerResponse = {
    chunkKey:  job.chunkKey,
    chunkData: chunkDataResult,
    borders:   borders,
    opaque:    geometry?.opaque,
    water:     geometry?.water,
  };

  // Transfer the ArrayBuffers instead of copying them (zero-copy).
  const transferables: ArrayBuffer[] = [
    chunkDataResult.blocks.buffer as ArrayBuffer,
    borders.negX!.buffer as ArrayBuffer,
    borders.posX!.buffer as ArrayBuffer,
    borders.negY!.buffer as ArrayBuffer,
    borders.posY!.buffer as ArrayBuffer,
    borders.negZ!.buffer as ArrayBuffer,
    borders.posZ!.buffer as ArrayBuffer,
  ];

  if (geometry) {
    transferables.push(
      geometry.opaque.positions.buffer,
      geometry.opaque.normals.buffer,
      geometry.opaque.uvs.buffer,
      geometry.opaque.colors.buffer,
      geometry.opaque.isWater.buffer,
      geometry.opaque.creationTime.buffer,
      geometry.opaque.ao.buffer,
      geometry.opaque.vertices.buffer,
      geometry.water.positions.buffer,
      geometry.water.normals.buffer,
      geometry.water.uvs.buffer,
      geometry.water.colors.buffer,
      geometry.water.isWater.buffer,
      geometry.water.creationTime.buffer,
      geometry.water.ao.buffer,
      geometry.water.vertices.buffer
    );
  }

  (self as any).postMessage(response, transferables);
};

function computeBorders(data: ChunkDataResult, size: number): ChunkBorders {
    const negX = new Int8Array(size * size).fill(-1);
    const posX = new Int8Array(size * size).fill(-1);
    const negY = new Int8Array(size * size).fill(-1);
    const posY = new Int8Array(size * size).fill(-1);
    const negZ = new Int8Array(size * size).fill(-1);
    const posZ = new Int8Array(size * size).fill(-1);

    for (let y = 0; y < size; y++) {
        for (let l = 0; l < size; l++) {
            // negX: lx = 0, lz = l
            negX[y * size + l] = data.blocks[y * size * size + l * size + 0];
            // posX: lx = size - 1, lz = l
            posX[y * size + l] = data.blocks[y * size * size + l * size + (size - 1)];
            // negZ: lz = 0, lx = l
            negZ[y * size + l] = data.blocks[y * size * size + 0 * size + l];
            // posZ: lz = size - 1, lx = l
            posZ[y * size + l] = data.blocks[y * size * size + (size - 1) * size + l];
        }
    }
    
    for (let x = 0; x < size; x++) {
        for (let z = 0; z < size; z++) {
            // negY: ly = 0
            negY[z * size + x] = data.blocks[0 * size * size + z * size + x];
            // posY: ly = size - 1
            posY[z * size + x] = data.blocks[(size - 1) * size * size + z * size + x];
        }
    }

    return { negX, posX, negY, posY, negZ, posZ };
}
