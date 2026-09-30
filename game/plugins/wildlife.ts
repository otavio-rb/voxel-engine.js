import { blockRegistry, entityRegistry, type ChunkReadyEvent, type EnginePlugin } from '@voxel/engine/worker';

/** Chance of a newly meshed surface chunk getting one animal. */
const SPAWN_CHANCE = 0.05;

/** Spawns a random registered entity on the surface of freshly loaded chunks. */
export const wildlifePlugin: EnginePlugin = {
  name: 'wildlife',
  setup({ world }) {
    world.events.on<ChunkReadyEvent>('chunk:ready', ({ data, chunkSize: s }) => {
      const { startX: sx, startY: sy, startZ: sz } = data;
      // Apenas nas camadas de superfície (Y=0 a Y=128)
      if (sy < 0 || sy > 128) return;
      if (Math.random() > SPAWN_CHANCE) return;

      const types = entityRegistry.getAvailableTypes();
      if (types.length === 0) return;

      // Procura um bloco de superfície (de cima para baixo)
      for (let lx = 4; lx < s - 4; lx += 4) {
        for (let lz = 4; lz < s - 4; lz += 4) {
          for (let ly = s - 1; ly >= 0; ly--) {
            const block = data.blocks[ly * s * s + lz * s + lx];
            if (!blockRegistry.isSolid(block)) continue;

            const randType = types[Math.floor(Math.random() * types.length)];
            const x = sx + lx + 0.5, y = sy + ly + 1.1, z = sz + lz + 0.5;
            const entity = entityRegistry.create(randType, world, x, y, z);
            if (entity) {
              entity.position.set(x, y, z);
              world.getEntityManager().add(entity);
            }
            return; // no máximo um animal por chunk
          }
        }
      }
    });
  }
};
