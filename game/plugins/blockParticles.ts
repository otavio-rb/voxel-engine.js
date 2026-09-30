import { blockRegistry, type BlockInteractionEvent, type EnginePlugin } from '@voxel/engine/worker';

/** Fragments per axis inside the broken block (4×4×4 = 64, like Minecraft). */
const GRID = 4;

/** Minecraft-style digging fragments in the broken block's color. */
export const blockParticlesPlugin: EnginePlugin = {
  name: 'block-particles',
  setup(ctx) {
    ctx.on<BlockInteractionEvent>('block:break', ({ position: { x, y, z }, blockType }) => {
      if (blockType === undefined || blockType < 0) return;
      const baseColor = blockRegistry.getColor(blockType);

      for (let i = 0; i < GRID; i++) {
        for (let j = 0; j < GRID; j++) {
          for (let k = 0; k < GRID; k++) {
            const px = x + (i + 0.5) / GRID;
            const py = y + (j + 0.5) / GRID;
            const pz = z + (k + 0.5) / GRID;

            // EntityDiggingFX: direção a partir do centro + ruído, com velocidade curta e impulso para cima
            let vx = px - x - 0.5 + (Math.random() * 2 - 1) * 0.4;
            let vy = py - y - 0.5 + (Math.random() * 2 - 1) * 0.4;
            let vz = pz - z - 0.5 + (Math.random() * 2 - 1) * 0.4;
            const speed = (Math.random() + Math.random() + 1) * 0.15 * 0.4 / (Math.hypot(vx, vy, vz) || 1);
            vx *= speed;
            vy = vy * speed + 0.1;
            vz *= speed;

            // Variação de brilho para parecer textura, e não um bloco liso
            const shade = 0.7 + Math.random() * 0.3;

            ctx.particles.emit({
              position: { x: px, y: py, z: pz },
              velocity: { x: vx, y: vy, z: vz },
              color: shadeColor(baseColor, shade),
              size: 0.1 + Math.random() * 0.1,
              lifetime: 4 / (Math.random() * 0.9 + 0.1)
            });
          }
        }
      }
    });
  }
};

function shadeColor(hex: number, factor: number): number {
  const r = Math.round(((hex >> 16) & 0xff) * factor);
  const g = Math.round(((hex >> 8) & 0xff) * factor);
  const b = Math.round((hex & 0xff) * factor);
  return (r << 16) | (g << 8) | b;
}
