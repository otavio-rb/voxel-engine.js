import { Vector3 } from 'three';
import { type EngineContext, type EnginePlugin, raycastVoxel, blockRegistry } from '@voxel/engine/worker';
import { RAYMARCH_DEBUG_STEPS } from '../config';

export class OrbitCameraPlugin implements EnginePlugin {
  public readonly name = 'tiny-camera';

  private rayOrigin = new Vector3();
  private rayDirection = new Vector3();
  private statsTimer = 0;

  public setup(ctx: EngineContext): void {
    const { player, interaction } = ctx;
    if (!player || !interaction) return;
    const s = ctx.voxelsPerBlock;

    /**
     * 1. ATIVAR GRAVIDADE E FÍSICA REAL
     * O modo 'normal' ativa simulação de gravidade, pulo, atrito e colisão com o mundo.
     */
    player.setMode('normal');

    /**
     * 2. PERSONAGEM MAIOR & STEP ASSIST NATIVO DA ENGINE
     * Aumenta a altura e dimensões do jogador em ~33% para uma escala imersiva:
     * - Altura total: 2.4 blocos (38.4 voxels vs 28.8 originais)
     * - Altura dos olhos: 2.15 blocos (34.4 voxels vs 25.9 originais)
     * - Largura do corpo: 0.75 blocos (12 voxels vs 9.6 originais)
     * - Step-assist: sobe degraus de até 10 minivoxels (~0.625 blocos) automaticamente.
     */
    player.setDimensions({
      width: 0.75 * s,
      height: 2.4 * s,
      eyeHeight: 2.15 * s
    });
    player.mv.JUMP_VELOCITY = 0.48 * s;
    player.mv.WALK_SPEED = 0.12 * s;
    player.stepHeight = 10;
    player.flySpeed = 0.35 * s;

    // Teleporta para o spawn point da superfície para iniciar com gravidade
    ctx.teleportToSpawn();

    /**
     * 3. ALTERNADOR DE GRAVIDADE / VOO LIVRE (Tecla F ou Botão no HUD)
     */
    const toggleGravity = () => {
      const isFlying = player.getMode() === 'debug';
      const newMode = isFlying ? 'normal' : 'debug';
      player.setMode(newMode);
      const hasGravity = newMode === 'normal';
      ctx.emitToMain('tiny:gravity_change', {
        gravity: hasGravity,
        mode: newMode
      });
      ctx.emitToMain('tiny:notice', {
        text: hasGravity ? 'Gravidade: ATIVADA (1.0G)' : 'Voo Livre: ATIVADO (Criativo)'
      });
    };

    ctx.onMessage('tiny:toggle_gravity', () => {
      toggleGravity();
    });

    // Visualizacao de custo do raymarch, alternavel em tempo de execucao.
    ctx.world.raymarchDebugSteps = RAYMARCH_DEBUG_STEPS;
    const toggleDebug = () => {
      ctx.world.raymarchDebugSteps = !ctx.world.raymarchDebugSteps;
      ctx.emitToMain('tiny:notice', {
        text: `passos do DDA: ${ctx.world.raymarchDebugSteps ? 'visiveis (verde barato, vermelho caro)' : 'ocultos'}`
      });
    };
    ctx.commands.register('ddasteps', toggleDebug);

    ctx.on<string>('keydown', (key) => {
      const k = key.toLowerCase();
      if (k === 'f') toggleGravity();
      if (k === 'g') toggleDebug();
    });

    ctx.onMessage<{ x: number; y: number; z: number }>('tiny:teleport', (pos) => {
      player.teleport(pos.x, pos.y, pos.z);
    });

    ctx.onMessage('tiny:reset_spawn', () => {
      ctx.teleportToSpawn();
    });

    // Envia status e coordenadas para o HUD com frequência de 10 Hz
    ctx.on('fixedUpdate', ({ deltaMs }: { deltaMs: number }) => {
      this.statsTimer += deltaMs;
      if (this.statsTimer < 100) return;
      this.statsTimer = 0;

      ctx.camera.getWorldPosition(this.rayOrigin);
      ctx.camera.getWorldDirection(this.rayDirection);

      const hit = raycastVoxel(ctx.world, this.rayOrigin, this.rayDirection, interaction.reach);
      let targetName = 'Nenhum';

      if (hit && hit.hit) {
        const conf = blockRegistry.get(hit.blockType);
        targetName = conf ? conf.name : `Bloco #${hit.blockType}`;
      }

      ctx.emitToMain('tiny:stats_update', {
        x: Math.round(ctx.camera.position.x * 10) / 10,
        y: Math.round(ctx.camera.position.y * 10) / 10,
        z: Math.round(ctx.camera.position.z * 10) / 10,
        targetBlock: targetName,
        hitDist: hit ? Math.round(hit.distance * 10) / 10 : null,
        gravity: player.getMode() === 'normal',
        isGrounded: player.isGrounded,
        playerHeight: '2.40m'
      });
    });
  }
}
