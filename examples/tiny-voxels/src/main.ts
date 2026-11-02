import { VoxelEngine } from '@voxel/engine';
import { TinyUI } from './ui/UI';
import { DEFAULT_PLAYER_SCALE, VOXELS_PER_BLOCK } from './config';

/**
 * O indicador de FPS NAO vive aqui.
 *
 * O canvas e transferido para o engine worker como OffscreenCanvas, entao e o worker que
 * renderiza; esta thread so repassa input. Um Stats nesta thread marcava 60 fps estavel
 * enquanto a thread que desenha engasgava, que foi exatamente o que escondeu um travamento.
 * O numero real vem do evento `engine:profile`, medido no worker. Ver ui/UI.ts.
 */
class TinyGame {
  private readonly engine: VoxelEngine;
  private readonly ui: TinyUI;

  constructor() {
    const canvas = document.querySelector<HTMLCanvasElement>('#scene')!;
    this.engine = new VoxelEngine({
      canvas,
      worker: new Worker(new URL('./workers/engine.worker.ts', import.meta.url), { type: 'module' })
    });

    // Start engine simulation and allow input
    this.engine.setInputBlocked(false);
    this.engine.start();

    this.ui = new TinyUI({
      engine: this.engine,
      voxelsPerBlock: VOXELS_PER_BLOCK
    });

    // Os dois rotulos de escala do HUD saem do config, nao do HTML.
    //
    // Eram texto fixo e ficaram mentindo: "2.4M (AMPLIADO)" errava a altura por 4x e
    // "16 VX/BLOCO" errava a resolucao pela metade, as duas descrevendo valores que o
    // projeto tinha trocado havia tempo. Rotulo de numero que o codigo conhece nao deveria
    // ser escrito a mao em lugar nenhum.
    const resTag = document.getElementById('tag-resolution');
    if (resTag) resTag.textContent = `${VOXELS_PER_BLOCK} VX/BLOCO`;

    const sizeTag = document.getElementById('tag-player-size');
    if (sizeTag) {
      const blocks = 1.8 * DEFAULT_PLAYER_SCALE;
      sizeTag.textContent =
        `${blocks.toFixed(2)} BLOCO (${Math.round(blocks * VOXELS_PER_BLOCK)} VX)`;
    }

    const hint = document.getElementById('play-hint');
    const btnStart = document.getElementById('btn-start-game');

    const startGame = () => {
      this.engine.lockPointer();
      if (hint) {
        hint.style.display = 'none';
      }
    };

    // Click canvas, hint overlay, or start button to capture pointer
    canvas.addEventListener('click', startGame);
    hint?.addEventListener('click', startGame);
    btnStart?.addEventListener('click', (e) => {
      e.stopPropagation();
      startGame();
    });

    this.engine.on('lock_change', ({ isLocked }: { isLocked: boolean }) => {
      if (hint) {
        hint.style.display = isLocked ? 'none' : 'flex';
      }
    });

    /**
     * Handle de depuracao no console do navegador.
     *
     * O engine registra comandos (`/scale`, `/time`, `/tp`, `/shaders`, ...) mas este exemplo
     * nao tem caixa de texto para digita-los, entao sem isto a unica forma de experimentar
     * um valor era editar o config e recompilar. Escala corporal em especial e puro gosto e
     * so se acha olhando:
     *
     *   tinyVoxels.cmd('/scale', '0.08')
     *   tinyVoxels.cmd('/time', 'night')
     */
    (window as unknown as Record<string, unknown>).tinyVoxels = {
      engine: this.engine,
      cmd: (command: string, ...args: string[]) => this.engine.sendCommand(command, args)
    };
  }
}

window.addEventListener('DOMContentLoaded', () => {
  new TinyGame();
});
