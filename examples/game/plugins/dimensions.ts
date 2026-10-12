import { Vector3 } from 'three';
import { dimensionRegistry, type EnginePlugin, type FixedUpdateEvent, type RenderEvent } from '@voxel/engine/worker';
import { DimensionManager } from '../dimensions/DimensionManager';
import { PortalWarp } from '../effects/PortalWarp';
import { applyShaderQuality } from '../effects/ShaderQuality';
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
    const warp = new PortalWarp();
    ctx.postProcessor.add(warp);

    dimensionManager.onChatMessage = (text) => chat(ctx, text);
    dimensionManager.onWarpEffect = (dim) => warp.triggerExit(dim.portalColor ?? 0x9c27b0);

    // Lente gravitacional na fenda mais próxima e a câmera sendo sugada para dentro dela
    const riftWorldPos = new Vector3();
    ctx.on<RenderEvent>('render', ({ frameDeltaMs }) => {
      const { approach, transit, approachColor } = dimensionManager;
      warp.update(frameDeltaMs / 1000, approach, transit, approachColor);
    });
    ctx.on('predraw', () => {
      warp.applyCamera(camera);
      let nearest: Vector3 | null = null;
      let best = Infinity;
      for (const rift of dimensionManager.rifts) {
        if (rift.isDisposed) continue;
        rift.getWorldPosition(riftWorldPos);
        const d = riftWorldPos.distanceToSquared(camera.position);
        if (d < best) { best = d; nearest = riftWorldPos.clone(); }
      }
      warp.aim(camera, nearest);
    });
    ctx.on('postdraw', () => warp.restoreCamera(camera));

    // Shaders off: rifts fall back to plain materials, including ones opened later
    ctx.on<boolean>('shaders', (enabled) => {
      for (const rift of dimensionManager.rifts) applyShaderQuality(rift, enabled);
    });

    let tick = 0;
    ctx.on<FixedUpdateEvent>('fixedUpdate', ({ deltaMs }) => {
      dimensionManager.update(deltaMs / 1000, world, player);
      if (++tick % 6 === 0) {
        for (const rift of dimensionManager.rifts) applyShaderQuality(rift, ctx.shadersEnabled);
      }
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
