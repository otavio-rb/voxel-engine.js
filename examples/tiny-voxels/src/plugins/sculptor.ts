import { Vector3 } from 'three';
import { type EngineContext, type EnginePlugin, raycastVoxel } from '@voxel/engine/worker';
import type { SculptConfig, SculptMode } from '../types';
import { TinyBlockType } from '../content/blocks';

/**
 * Raios de pincel, em BLOCOS.
 *
 * O menor raio e 0.2 bloco deliberadamente: com 16 voxels por bloco isso ja e uma esfera
 * de ~3 voxels de raio, uns 137 voxels por clique. Um voxel sozinho nunca e removivel, e
 * nem deveria ser — e esse o ponto de um mundo de minivoxels. A ferramenta opera em
 * volume, como em Teardown; o voxel e a unidade de armazenamento, nao de interacao.
 */
export const BRUSH_RADII_BLOCKS = [0.1, 0.2, 0.35, 0.5, 0.75, 1.0] as const;

export class SculptorPlugin implements EnginePlugin {
  public readonly name = 'tiny-sculptor';

  private config: SculptConfig = {
    mode: 'carve',
    brushRadiusBlocks: BRUSH_RADII_BLOCKS[2], // Default: 0.35 blocos (~11 voxels de raio em 32vx/bloco)
    blockType: TinyBlockType.Marble
  };

  private readonly rayOrigin = new Vector3();
  private readonly lookDirection = new Vector3();
  private readonly brushCenter = new Vector3();

  public setup(ctx: EngineContext): void {
    const { interaction, player } = ctx;
    if (!interaction || !player) return;

    // Alcance em blocos: esculpir minivoxel exige chegar longe
    interaction.reach = 8 * ctx.voxelsPerBlock;

    ctx.onMessage<Partial<SculptConfig>>('tiny:set_sculpt', (data) => {
      if (data.mode) this.config.mode = data.mode;
      if (typeof data.brushRadiusBlocks === 'number') {
        this.config.brushRadiusBlocks = Math.max(0.05, Math.min(1.5, data.brushRadiusBlocks));
      }
      if (typeof data.blockType === 'number') {
        this.config.blockType = data.blockType;
        interaction.setSelectedBlockType(data.blockType);
      }
    });

    ctx.onMessage<{ scale: number }>('tiny:set_player_scale', (data) => {
      if (typeof data?.scale === 'number') {
        player.setScale(data.scale);
        ctx.emitToMain('tiny:notice', { text: `Escala do personagem ajustada para ${data.scale}x.` });
      }
    });

    ctx.commands.register(['/scale', '/escala'], (args, cmdCtx) => {
      if (!cmdCtx.player) return;
      const val = parseFloat(args[0]);
      if (!Number.isFinite(val) || val <= 0.05 || val > 3.0) {
        ctx.emitToMain('tiny:notice', { text: 'Uso: /scale <0.1 a 3.0> (ex: /scale 0.35 para miniatura, 1.0 para normal)' });
        return;
      }
      cmdCtx.player.setScale(val);
      ctx.emitToMain('tiny:notice', { text: `Escala do personagem ajustada para ${val}x.` });
    });

    ctx.onMessage<number>('player:set_block', (blockType) => {
      if (typeof blockType === 'number') {
        this.config.blockType = blockType;
      }
    });

    // Substitui a interacao de 1 voxel da engine por edicao de volume.
    interaction.clickHandler = (button: number) => {
      ctx.camera.getWorldDirection(this.lookDirection);
      this.rayOrigin.copy(ctx.camera.position);

      const hit = raycastVoxel(ctx.world, this.rayOrigin, this.lookDirection, interaction.reach);
      if (!hit || !hit.hit) return true;

      // Botao esquerdo (0) = cavar/quebrar, Botao direito (2) = colocar/construir
      const action: SculptMode = button === 0 ? 'carve' : 'add';
      const selected = interaction.getSelectedBlockType();
      if (typeof selected === 'number' && selected >= 0) {
        this.config.blockType = selected;
      }

      const radius = this.config.brushRadiusBlocks * ctx.voxelsPerBlock;

      // Cavar centra no voxel atingido; construir e pintar centram do lado de fora da
      // face, senao metade da esfera nasce enterrada na parede que foi clicada.
      this.brushCenter.copy(hit.point);
      if (action !== 'carve') {
        this.brushCenter.addScaledVector(hit.faceNormal, radius * 0.6);
      }

      const changed = ctx.world.editSphere(
        this.brushCenter,
        radius,
        action === 'carve' ? 'destroy' : action === 'add' ? 'fill' : 'paint',
        this.config.blockType
      );

      ctx.emitToMain('tiny:sculpt_applied', { voxels: changed.length, mode: action });
      return true;
    };
  }
}
