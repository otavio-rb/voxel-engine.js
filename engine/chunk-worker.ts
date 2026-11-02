/** Chunk worker API. The game's chunk worker entry calls `runChunkWorker`. */
export { runChunkWorker, type ChunkWorkerOptions } from './runtime/ChunkRuntime';
export {
  blockRegistry,
  BlockRegistry,
  AIR,
  SURFACE_TYPE_ID,
  type BlockConfig,
  type BlockSurfaceType,
  type FluidBlockConfig,
  type FluidReactionRule,
  type MicrovoxelBuilderContext,
  type MicrovoxelMeshBuilder
} from './blocks/BlockRegistry';
export { worldGeneratorRegistry, WorldGeneratorRegistry } from './world/WorldGeneratorRegistry';
export type { WorldGenerator, ChunkContext } from './world/WorldGenerator';

/**
 * Abstração de geração procedural: `createWorld` compõe camadas de terreno + biomas +
 * cavernas num `WorldGenerator` pronto; `customGenerator` é o andar de campo de densidade
 * (um ponto por vez, sem heightmap/bioma no meio) pra formas que uma pilha de alturas não
 * expressa; `sampleHeight`/`classifyBiome`/`applySurfaceLayers`/`scatterOres`/`CaveCarver`
 * são as mesmas peças soltas, pra montar um `generate(ctx)` na mão; ou ignore tudo isto e
 * implemente `WorldGenerator` direto contra `ChunkContext`, como antes.
 */
export { createWorld, type WorldOptions } from './world/generation/terrain';
export {
  composeTerrain,
  baseTerrain,
  mountains,
  hills,
  flatTerrain,
  type TerrainLayer,
  type TerrainSample,
  type BaseTerrainOptions,
  type MountainsOptions,
  type HillsOptions,
  type FlatTerrainOptions
} from './world/generation/terrainLayers';
export { region, type TerrainOverride, type RegionOptions } from './world/generation/overrides';
export { customGenerator, type CustomGeneratorOptions, type DensityPoint, type DensitySample } from './world/generation/customGenerator';
export { sampleHeight, type HeightmapOptions, type HeightmapMountainOptions } from './world/generation/heightmap';
export {
  classifyBiome,
  type BiomeRule,
  type BiomeMapOptions,
  type BiomeResult,
  type Climate,
  type ClimateNoiseOptions
} from './world/generation/biomes';
export {
  applySurfaceLayers,
  scatterOres,
  type SurfaceLayerBand,
  type SurfaceLayerConfig,
  type OreRule
} from './world/generation/surfaceLayers';
export {
  CaveCarver,
  type CaveCarverOptions,
  type CaveBiomeConfig,
  type CaveProfile,
  type CaveClimate,
  type CaveCellInfo,
  type CaveCarverHelpers,
  type CaveEntranceOptions,
  type CaveGeodeOptions
} from './world/generation/caves';
export { cellHash2, cellHash3, ridgeNoise2D, type RidgeNoiseOptions } from './world/generation/noise';
