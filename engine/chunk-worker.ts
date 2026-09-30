/** Chunk worker API. The game's chunk worker entry calls `runChunkWorker`. */
export { runChunkWorker, type ChunkWorkerOptions } from './runtime/ChunkRuntime';
export { blockRegistry, BlockRegistry, AIR, type BlockConfig } from './blocks/BlockRegistry';
export { worldGeneratorRegistry, WorldGeneratorRegistry } from './world/WorldGeneratorRegistry';
export type { WorldGenerator, ChunkContext } from './world/WorldGenerator';
