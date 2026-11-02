/**
 * Main-thread API. Import from `@voxel/engine` in the page script.
 * Worker-side APIs live in `@voxel/engine/worker` and `@voxel/engine/chunk-worker`.
 */
export {
  VoxelEngine,
  type VoxelEngineOptions,
  type EngineStats,
  type BlockBreakEvent,
  type BlockPlaceEvent
} from './core/VoxelEngine';
export { EventEmitter, type EventCallback } from './core/EventEmitter';
export {
  createOrbitCameraRig,
  type OrbitCameraRig,
  type OrbitCameraRigOptions
} from './camera/OrbitCameraRig';
export {
  blockRegistry,
  BlockRegistry,
  SURFACE_TYPE_ID,
  type BlockConfig,
  type BlockSurfaceType,
  type FluidBlockConfig,
  type FluidReactionRule,
  type MicrovoxelBuilderContext,
  type MicrovoxelMeshBuilder
} from './blocks/BlockRegistry';
