/**
 * Engine worker API: everything game plugins and content can build on.
 * The game's engine worker entry calls `runEngineWorker`.
 */
export {
  runEngineWorker,
  EngineContext,
  type EnginePlugin,
  type EngineWorkerOptions,
  type FixedUpdateEvent,
  type RenderEvent,
  type BlockInteractionEvent
} from './runtime/EngineRuntime';
export { CommandRegistry, type CommandHandler } from './runtime/CommandRegistry';

export { EventEmitter, type EventCallback } from './core/EventEmitter';
export { GameLoop, type GameLoopOptions } from './core/GameLoop';

export { BlockRegistry, blockRegistry, AIR, type BlockConfig } from './blocks/BlockRegistry';

export { default as ProceduralWorld, type ProceduralWorldOptions, type ChunkReadyEvent } from './world/ProceduralWorld';
export { default as Sky } from './world/Sky';
export type { WorldGenerator, ChunkContext } from './world/WorldGenerator';
export { WorldGeneratorRegistry, worldGeneratorRegistry } from './world/WorldGeneratorRegistry';

export {
  DEFAULT_DIMENSION,
  type DimensionDefinition,
  type DimensionAtmosphere,
  type DimensionPhysics,
  type DimensionCelestialConfig,
  type DimensionTravelOptions
} from './dimension/Dimension';
export { DimensionRegistry, dimensionRegistry } from './dimension/DimensionRegistry';

export { Entity, type EntityDimensions } from './entities/Entity';
export { EntityManager } from './entities/EntityManager';
export { EntityRegistry, entityRegistry, type EntityFactory } from './entities/EntityRegistry';

export {
  KinematicBody,
  type BoxDimensions,
  type KinematicBodyOptions,
  type VoxelColliderWorld
} from './physics/AABBPhysics';
export { raycastVoxel, type VoxelRaycastHit, type VoxelWorldReader } from './physics/VoxelRaycaster';
export { default as WaterSimulator } from './physics/WaterSimulator';

export { default as Player, type PlayerMode } from './player/Player';

export {
  VoxelParticles,
  type ParticleOptions,
  type VoxelParticlesOptions,
  type Vec3Like
} from './effects/VoxelParticles';
export { default as PlayerInteraction } from './player/PlayerInteraction';

export { default as RNG } from './utils/rng';
export * from './types';
