import { Vector3 } from 'three';
import { type EngineContext, type EnginePlugin, raycastVoxel } from '@voxel/engine/worker';
import { TinyBlockType } from '../content/blocks';

export class FluidPlugin implements EnginePlugin {
  public readonly name = 'tiny-fluid';

  public setup(ctx: EngineContext): void {
    const { interaction } = ctx;
    if (!interaction) return;
    const lookDir = new Vector3();
    const rayOrigin = new Vector3();

    const spawnFluidSphere = (blockType: number, radiusBlocks: number = 0.5) => {
      ctx.camera.getWorldDirection(lookDir);
      rayOrigin.copy(ctx.camera.position);

      const hit = raycastVoxel(ctx.world, rayOrigin, lookDir, interaction.reach * 2);
      const targetPos = hit?.hit
        ? hit.point.clone().addScaledVector(hit.faceNormal, radiusBlocks * ctx.voxelsPerBlock * 0.7)
        : rayOrigin.clone().addScaledVector(lookDir, 4 * ctx.voxelsPerBlock);

      const radius = radiusBlocks * ctx.voxelsPerBlock;
      const changed = ctx.world.editSphere(targetPos, radius, 'fill', blockType);
      return changed.length;
    };

    ctx.commands.register(['/water', '/agua'], (args) => {
      const r = args[0] ? parseFloat(args[0]) : 0.5;
      const count = spawnFluidSphere(TinyBlockType.ClearWater, isNaN(r) ? 0.5 : r);
      ctx.emitToMain('chat:message', { text: `💧 Água celular gerada: ${count} minivoxels fluidos derramados!` });
    });

    ctx.commands.register(['/lava', '/magma'], (args) => {
      const r = args[0] ? parseFloat(args[0]) : 0.5;
      const count = spawnFluidSphere(TinyBlockType.LavaCore, isNaN(r) ? 0.5 : r);
      ctx.emitToMain('chat:message', { text: `🔥 Lava celular gerada: ${count} minivoxels magmáticos derramados!` });
    });

    ctx.commands.register(['/spring', '/fonte'], (args) => {
      const r = args[0] ? parseFloat(args[0]) : 0.3;
      const count = spawnFluidSphere(TinyBlockType.WaterSpring, isNaN(r) ? 0.3 : r);
      ctx.emitToMain('chat:message', { text: `🌊 Nascente natural criada: ${count} blocos de nascente colocados! Cachoeira viva ativa.` });
    });
  }
}
