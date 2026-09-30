import type { EngineContext } from '@voxel/engine/worker';

/** Shows a line in the game's chat (handled by the UI on the main thread). */
export function chat(ctx: EngineContext, text: string): void {
  ctx.emitToMain('chat:message', { text });
}
