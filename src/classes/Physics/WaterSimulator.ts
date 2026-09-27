import { BlockType, ChunkDataResult } from '../../types';
import { blockRegistry } from '../../core/BlockRegistry';

export interface WorldWaterAccess {
  getBlock(wx: number, wy: number, wz: number): number;
  getWaterLevel(wx: number, wy: number, wz: number): number;
  setBlockAndWater(wx: number, wy: number, wz: number, type: number, level: number): void;
}

export interface SimulationResult {
  hasChanged: boolean;
  touchedBorders: {
    negX: boolean;
    posX: boolean;
    negY: boolean;
    posY: boolean;
    negZ: boolean;
    posZ: boolean;
  };
}

export default class WaterSimulator {
  public static readonly SOURCE_LEVEL = 255;
  public static readonly STEP_DECAY = 32; // 8 blocos de alcance horizontal (255 -> 223 -> 191 -> ... -> 31)
  public static readonly MIN_LEVEL = 16;

  /**
   * Executa um passo de simulação do campo escalar de água no chunk.
   */
  public static stepChunk(
    chunkData: ChunkDataResult,
    size: number,
    world: WorldWaterAccess
  ): SimulationResult {
    const { startX, endX, startY, endY, startZ, endZ, blocks, waterLevels } = chunkData;
    let hasChanged = false;

    const touchedBorders = {
      negX: false,
      posX: false,
      negY: false,
      posY: false,
      negZ: false,
      posZ: false,
    };

    const s = size;
    const idx = (lx: number, ly: number, lz: number) => ly * s * s + lz * s + lx;

    // Iteramos de baixo para cima no chunk
    for (let ly = 0; ly < s; ly++) {
      const wy = startY + ly;

      for (let lz = 0; lz < s; lz++) {
        const wz = startZ + lz;

        for (let lx = 0; lx < s; lx++) {
          const wx = startX + lx;
          const i = idx(lx, ly, lz);
          const currentType = blocks[i];
          const currentLevel = waterLevels[i];

          // ── Caso 1: Célula é ÁGUA ──────────────────────────────────────────
          if (currentType === BlockType.Water && currentLevel > 0) {
            const blockAbove = world.getBlock(wx, wy + 1, wz);
            const levelAbove = world.getWaterLevel(wx, wy + 1, wz);
            const isFedFromAbove = (blockRegistry.isFluid(blockAbove) && levelAbove > 0);
            const isSource = (currentLevel === this.SOURCE_LEVEL && !isFedFromAbove);

            // 1. Queda Vertical (Gravidade)
            const blockBelow = world.getBlock(wx, wy - 1, wz);
            const canFall = !blockRegistry.isSolid(blockBelow);

            if (canFall) {
              const levelBelow = world.getWaterLevel(wx, wy - 1, wz);
              if (levelBelow < this.SOURCE_LEVEL) {
                world.setBlockAndWater(wx, wy - 1, wz, BlockType.Water, this.SOURCE_LEVEL);
                hasChanged = true;
                if (ly === 0) touchedBorders.negY = true;
              }

              // Se não for fonte e não for alimentado de cima, a água desce e esvazia este bloco
              if (!isSource && !isFedFromAbove) {
                blocks[i] = BlockType.Empty;
                waterLevels[i] = 0;
                hasChanged = true;
                continue;
              }
            }

            // 2. Espalhamento Horizontal (se o bloco abaixo for sólido ou água cheia)
            const isSupportedBelow = (!canFall || world.getWaterLevel(wx, wy - 1, wz) >= 240);

            if (isSupportedBelow && currentLevel > this.MIN_LEVEL) {
              const spreadLevel = isSource ? (this.SOURCE_LEVEL - this.STEP_DECAY) : (currentLevel - this.STEP_DECAY);

              if (spreadLevel >= this.MIN_LEVEL) {
                const neighbors = [
                  { wx: wx + 1, wz: wz, border: lx === s - 1 ? 'posX' : null },
                  { wx: wx - 1, wz: wz, border: lx === 0 ? 'negX' : null },
                  { wx: wx, wz: wz + 1, border: lz === s - 1 ? 'posZ' : null },
                  { wx: wx, wz: wz - 1, border: lz === 0 ? 'negZ' : null },
                ];

                for (const n of neighbors) {
                  const nBlock = world.getBlock(n.wx, wy, n.wz);
                  const canEnter = !blockRegistry.isSolid(nBlock);

                  if (canEnter) {
                    const nLevel = world.getWaterLevel(n.wx, wy, n.wz);
                    if (spreadLevel > nLevel + 4) {
                      world.setBlockAndWater(n.wx, wy, n.wz, BlockType.Water, spreadLevel);
                      hasChanged = true;
                      if (n.border) (touchedBorders as any)[n.border] = true;
                    }
                  }
                }
              }
            }

            // 3. Drenagem de água corrente se a fonte foi removida
            if (!isSource && !isFedFromAbove) {
              // Verifica se algum vizinho horizontal ainda está alimentando esta célula
              let maxNeighborLevel = 0;
              const hNeighbors = [
                world.getWaterLevel(wx + 1, wy, wz),
                world.getWaterLevel(wx - 1, wy, wz),
                world.getWaterLevel(wx, wy, wz + 1),
                world.getWaterLevel(wx, wy, wz - 1)
              ];

              for (const nl of hNeighbors) {
                if (nl > maxNeighborLevel) maxNeighborLevel = nl;
              }

              // Se nenhum vizinho tem nível suficiente para sustentar este bloco, ele drena
              if (maxNeighborLevel <= currentLevel) {
                const newLevel = Math.max(0, currentLevel - 48);
                if (newLevel <= this.MIN_LEVEL) {
                  blocks[i] = BlockType.Empty;
                  waterLevels[i] = 0;
                } else {
                  waterLevels[i] = newLevel;
                }
                hasChanged = true;
              }
            }
          }
        }
      }
    }

    return { hasChanged, touchedBorders };
  }
}
