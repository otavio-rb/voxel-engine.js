import type { BlockInteractionEvent, EnginePlugin, FixedUpdateEvent } from '@voxel/engine/worker';
import NetworkClient from '../network/NetworkClient';
import { WORLD_REGENERATED, type WorldRegeneratedEvent } from './dimensions';

/** Multiplayer sync over WebSocket (`/ws`), connected when the game starts. */
export const networkPlugin: EnginePlugin = {
  name: 'network',
  setup(ctx) {
    const networkClient = new NetworkClient(ctx.world, ctx.player);
    networkClient.onWorldInit = (config) => ctx.emitToMain('world_init', config);
    networkClient.onWorldRegen = (config) => ctx.emitToMain('world_regen', config);

    ctx.on('start', () => {
      const protocol = self.location.protocol === 'https:' ? 'wss:' : 'ws:';
      networkClient.connect(`${protocol}//${self.location.host}/ws`);
    });

    ctx.on<FixedUpdateEvent>('fixedUpdate', ({ deltaMs }) => {
      networkClient.update(performance.now(), deltaMs);
    });

    ctx.on<BlockInteractionEvent>('block:break', ({ position: p }) => {
      networkClient.broadcastBlockBreak(p.x, p.y, p.z);
    });
    ctx.on<BlockInteractionEvent>('block:place', ({ position: p, blockType }) => {
      networkClient.broadcastBlockPlace(p.x, p.y, p.z, blockType ?? 0);
    });

    ctx.on<WorldRegeneratedEvent>(WORLD_REGENERATED, ({ type }) => {
      networkClient.broadcastWorldConfig({ type });
    });
  }
};
