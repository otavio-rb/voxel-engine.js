import { Vector3 } from 'three';
import { dimensionRegistry, type EnginePlugin, type FixedUpdateEvent } from '@voxel/engine/worker';
import { DimensionManager } from '../dimensions/DimensionManager';
import { chat } from './chat';

/** Local hook fired after `/regen`, so other plugins (e.g. network) can react. */
export const WORLD_REGENERATED = 'world:regenerated';
export interface WorldRegeneratedEvent {
  type: string;
}

/** Dimension travel, dimensional rifts and the dimension-aware `/regen`. */
export const dimensionsPlugin: EnginePlugin = {
  name: 'dimensions',
  setup(ctx) {
    const { camera, world, player, commands } = ctx;

    const dimensionManager = new DimensionManager();
    dimensionManager.onChatMessage = (text) => chat(ctx, text);
    dimensionManager.onAbsorptionProgress = (progress, targetDimId, colorHex) => {
      ctx.emitToMain('portal:absorption', { progress, targetDimId, colorHex });
    };

    ctx.on<FixedUpdateEvent>('fixedUpdate', ({ deltaMs }) => {
      dimensionManager.update(deltaMs / 1000, world, player);
    });

    commands.register(['/dim', '/dimension'], (args) => {
      const sub = args[0]?.toLowerCase();
      if (!sub || sub === 'list') {
        const listText = dimensionRegistry.getAll()
          .map(d => `• ${d.id}: ${d.name} (${(d.physics.gravity / 0.008).toFixed(2)}G)`)
          .join('\n');
        chat(ctx, `🌌 Dimensões disponíveis na Engine:\n${listText}\nComandos: /dim <id> (ex: /dim nether, /dim lunar, /dim void) ou /portal [id]`);
        return;
      }

      if (sub === 'info') {
        const cur = dimensionManager.currentDimension;
        chat(ctx, `📍 Dimensão Atual: ${cur.name} [${cur.id}]\n• Gravidade: ${(cur.physics.gravity / 0.008).toFixed(2)}G\n• Escala Coordenadas: 1:${cur.coordinateScale ?? 1}\n• Gerador: ${cur.generatorId}\n• ${cur.description ?? ''}`);
        return;
      }

      ctx.started = true;
      dimensionManager.travelTo(sub, world, player, {
        createReturnPortal: true,
        useCoordinateScaling: true
      });
    });

    commands.register(['/rift', '/portal', '/fenda'], (args) => {
      const targetDim = args[0]?.toLowerCase() || (dimensionManager.currentId === 'nether' ? 'overworld' : 'nether');
      const dir = new Vector3();
      camera.getWorldDirection(dir);
      const spawnPos = camera.position.clone().add(dir.multiplyScalar(3.8));
      spawnPos.y = Math.max(player.camera.position.y - 0.2, 5);

      dimensionManager.spawnDimensionalRift(world, spawnPos, targetDim);
    });

    // Substitui o /regen da engine: tipos que são dimensões viajam até elas.
    commands.register('/regen', (args) => {
      ctx.started = true;
      const worldType = args[0]?.toLowerCase();
      if (worldType && dimensionRegistry.has(worldType)) {
        dimensionManager.travelTo(worldType, world, player, { createReturnPortal: false });
      } else {
        world.reset(worldType ? { worldType } : undefined);
        ctx.teleportToSpawn();
      }
      ctx.emit<WorldRegeneratedEvent>(WORLD_REGENERATED, { type: worldType || 'standard' });
    });
  }
};
