/**
 * Engine worker da documentação.
 *
 * Diferente do worker de um jogo, este não decide a configuração do mundo em tempo de
 * build: ele espera a mensagem `docs:boot` (enviada pela página ANTES de `VoxelEngine`
 * ser construído, e portanto antes do `init`) e só então chama `runEngineWorker`. É isso
 * que permite ao exemplo da página ser editado e reexecutado com outras opções.
 *
 * Ele também instala um plugin-ponte: o código de plugin que o leitor escreve na página
 * chega por mensagem e é avaliado AQUI DENTRO, com o `EngineContext` real em mãos.
 */
import { runEngineWorker, type EngineContext, type EnginePlugin } from '../../../engine/runtime/EngineRuntime';
import { registerDocsContent } from '../content';
import { DOCS_BLOCKS } from '../content';

interface BootPayload {
  world?: Record<string, unknown>;
  spawnPoint?: { x: number; y: number; z: number };
  hotbar?: number[];
  targetTps?: number;
  playerScale?: number;
}

let booted = false;

/** Ponte de plugin: executa o código do leitor com o ctx real e devolve logs à página. */
const docsBridge: EnginePlugin = {
  name: 'docs-bridge',

  setup(ctx: EngineContext) {
    const disposers: Array<() => void> = [];

    ctx.onMessage<{ code: string }>('docs:plugin', (data) => {
      // Cada execução desfaz a anterior: o leitor reexecuta o exemplo à vontade.
      while (disposers.length) {
        try {
          disposers.pop()!();
        } catch (err) {
          console.warn('[docs-bridge] limpeza falhou', err);
        }
      }

      const log = (...args: unknown[]) =>
        ctx.emitToMain('docs:log', args.map((a) => (typeof a === 'object' ? JSON.stringify(a) : String(a))).join(' '));

      // `on` devolve unsubscribe; guardamos para a próxima execução limpar tudo.
      const on = (event: string, cb: (payload: unknown) => void) => {
        const off = ctx.on(event, cb);
        disposers.push(off);
        return off;
      };

      try {
        // eslint-disable-next-line no-new-func
        const fn = new Function('ctx', 'on', 'print', 'BLOCKS', `"use strict";\n${data.code}`);
        fn(ctx, on, log, DOCS_BLOCKS);
        ctx.emitToMain('docs:ready', 'plugin aplicado');
      } catch (err) {
        ctx.emitToMain('docs:error', String((err as Error)?.stack ?? err));
      }
    });

    ctx.emitToMain('docs:ready', 'ponte pronta');
  }
};

self.addEventListener('error', (event: ErrorEvent) => {
  self.postMessage({ type: 'fatal_error', payload: { message: event.message, stack: event.error?.stack } });
});

self.onmessage = (e: MessageEvent) => {
  if (booted || e.data?.type !== 'docs:boot') return;
  booted = true;

  const payload = (e.data.payload ?? {}) as BootPayload;

  runEngineWorker({
    setup: registerDocsContent,
    createChunkWorker: () => new Worker(new URL('./chunk.worker.ts', import.meta.url), { type: 'module' }),
    plugins: [docsBridge],
    world: {
      chunkSize: 32,
      renderDistance: 6,
      verticalRenderDistance: 4,
      initialDimension: 'docs-overworld',
      ...(payload.world ?? {})
    } as never,
    spawnPoint: payload.spawnPoint ?? { x: 0, y: 48, z: 0 },
    hotbar: payload.hotbar ?? [
      DOCS_BLOCKS.grass,
      DOCS_BLOCKS.stone,
      DOCS_BLOCKS.sand,
      DOCS_BLOCKS.glass,
      DOCS_BLOCKS.glowstone,
      DOCS_BLOCKS.water
    ],
    targetTps: payload.targetTps ?? 60,
    playerScale: payload.playerScale ?? 1
  });
};
