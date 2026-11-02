/**
 * Conteúdo compartilhado da documentação: blocos, geradores e dimensões.
 *
 * Os registros da engine são singletons POR THREAD, então este módulo é importado
 * pelos três lados — a página, o chunk worker e o engine worker — e cada um chama
 * `registerDocsContent()` no seu próprio contexto. É exatamente o que um jogo faz.
 */
import { blockRegistry } from '../../engine/blocks/BlockRegistry';
import { worldGeneratorRegistry } from '../../engine/world/WorldGeneratorRegistry';
import { dimensionRegistry } from '../../engine/dimension/DimensionRegistry';
import { DEFAULT_DIMENSION } from '../../engine/dimension/Dimension';
import type { ChunkContext, WorldGenerator } from '../../engine/world/WorldGenerator';

/** IDs usados por toda a documentação. */
export const DOCS_BLOCKS = {
  stone: 1,
  dirt: 2,
  grass: 3,
  sand: 4,
  water: 5,
  glass: 6,
  lava: 7,
  basalt: 8,
  wood: 9,
  leaves: 10,
  snow: 11,
  glowstone: 20,
  ice: 21
} as const;

const PALETTE = [
  { id: DOCS_BLOCKS.stone, name: 'stone', color: 0x8a8d93, solid: true, opaque: true },
  { id: DOCS_BLOCKS.dirt, name: 'dirt', color: 0x7a5a3a, solid: true, opaque: true },
  { id: DOCS_BLOCKS.grass, name: 'grass', color: 0x6aa84f, solid: true, opaque: true },
  { id: DOCS_BLOCKS.sand, name: 'sand', color: 0xd9c89a, solid: true, opaque: true },
  {
    id: DOCS_BLOCKS.water,
    name: 'water',
    color: 0x2f86d8,
    fluid: true,
    flows: true,
    swimmable: true,
    transparent: true,
    lightOpacity: 2
  },
  { id: DOCS_BLOCKS.glass, name: 'glass', color: 0xbfe6ff, solid: true, transparent: true, lightOpacity: 1 },
  {
    id: DOCS_BLOCKS.lava,
    name: 'lava',
    color: 0xff6a2a,
    fluid: true,
    flows: true,
    transparent: false,
    luminance: 12,
    lightOpacity: 2
  },
  { id: DOCS_BLOCKS.basalt, name: 'basalt', color: 0x3b3b44, solid: true, opaque: true },
  { id: DOCS_BLOCKS.wood, name: 'wood', color: 0x6b4f2a, solid: true, opaque: true },
  { id: DOCS_BLOCKS.leaves, name: 'leaves', color: 0x3f7d33, solid: true, transparent: true, lightOpacity: 2 },
  { id: DOCS_BLOCKS.snow, name: 'snow', color: 0xeaf2ff, solid: true, opaque: true },
  { id: DOCS_BLOCKS.glowstone, name: 'glowstone', color: 0xffcc66, solid: true, opaque: true, luminance: 14 },
  {
    id: DOCS_BLOCKS.ice,
    name: 'ice',
    color: 0x9fd8ff,
    solid: true,
    transparent: true,
    lightOpacity: 1,
    slipperiness: 0.98
  }
];

const SEA_LEVEL = 26;

/** Relevo com praia, mar, colinas e cavernas — o mundo padrão das demos. */
class DocsTerrain implements WorldGenerator {
  readonly id = 'docs-terreno';

  generate(ctx: ChunkContext): void {
    const s = ctx.voxelsPerBlock;
    const sea = SEA_LEVEL * s;

    for (let x = ctx.startX; x < ctx.endX; x += ctx.stride) {
      for (let z = ctx.startZ; z < ctx.endZ; z += ctx.stride) {
        const base = ctx.octaveBaseNoise(x / s, z / s, 1, 4);
        const detalhe = ctx.octaveBaseNoise(x / s, z / s, 0.25, 2);
        const altura = Math.floor((SEA_LEVEL + base * 14 + detalhe * 3) * s);

        for (let y = ctx.startY; y < ctx.endY && y <= Math.max(altura, sea); y += ctx.stride) {
          if (y > altura) {
            ctx.setBlock(x, y, z, DOCS_BLOCKS.water);
            continue;
          }

          // cavernas: ruído 3D abre o interior da rocha
          if (y < altura - 2 * s) {
            const cav = ctx.simplex.noise3d((x / s) / 18, (y / s) / 12, (z / s) / 18);
            if (cav > 0.58) continue;
          }

          const profundidade = (altura - y) / s;
          let tipo: number = DOCS_BLOCKS.stone;
          if (profundidade < 1) {
            if (altura <= sea + 1 * s) tipo = DOCS_BLOCKS.sand;
            else if (altura > (SEA_LEVEL + 11) * s) tipo = DOCS_BLOCKS.snow;
            else tipo = DOCS_BLOCKS.grass;
          } else if (profundidade < 4) {
            tipo = altura <= sea + 1 * s ? DOCS_BLOCKS.sand : DOCS_BLOCKS.dirt;
          }

          ctx.setBlock(x, y, z, tipo);
        }

        // lava no fundo do mundo: dá o que ver nas cavernas e alimenta a demo de fluidos
        for (let y = ctx.startY; y < ctx.endY && y < 4 * s; y += ctx.stride) {
          if (ctx.getBlock(x, y, z) < 0) ctx.setBlock(x, y, z, DOCS_BLOCKS.lava);
        }
      }
    }
  }
}

/** Arcos e pontes: ruído 3D puro, para mostrar geração sem mapa de altura. */
class DocsArcos implements WorldGenerator {
  readonly id = 'docs-arcos';

  generate(ctx: ChunkContext): void {
    const s = ctx.voxelsPerBlock;
    for (let x = ctx.startX; x < ctx.endX; x += ctx.stride) {
      for (let z = ctx.startZ; z < ctx.endZ; z += ctx.stride) {
        for (let y = ctx.startY; y < ctx.endY; y += ctx.stride) {
          const n = ctx.simplex.noise3d((x / s) / 16, (y / s) / 11, (z / s) / 16);
          const teto = 1 - (y / s) / 48;
          if (n + teto * 0.75 > 0.78) {
            ctx.setBlock(x, y, z, y > 34 * s ? DOCS_BLOCKS.snow : DOCS_BLOCKS.stone);
          }
        }
      }
    }
  }
}

/** Um mundo plano de tabuleiro: referência visual para escala e para sombras. */
class DocsPlano implements WorldGenerator {
  readonly id = 'docs-plano';

  generate(ctx: ChunkContext): void {
    const s = ctx.voxelsPerBlock;
    const topo = 24 * s;
    for (let x = ctx.startX; x < ctx.endX; x += ctx.stride) {
      for (let z = ctx.startZ; z < ctx.endZ; z += ctx.stride) {
        for (let y = ctx.startY; y < ctx.endY && y <= topo; y += ctx.stride) {
          if (y === topo) {
            const quadriculado = (Math.floor(x / s / 4) + Math.floor(z / s / 4)) % 2 === 0;
            ctx.setBlock(x, y, z, quadriculado ? DOCS_BLOCKS.grass : DOCS_BLOCKS.sand);
          } else {
            ctx.setBlock(x, y, z, y > topo - 4 * s ? DOCS_BLOCKS.dirt : DOCS_BLOCKS.stone);
          }
        }
      }
    }
  }
}

let registrado = false;

/** Idempotente: pode ser chamado por qualquer thread, quantas vezes for. */
export function registerDocsContent(): void {
  if (registrado) return;
  registrado = true;

  for (const block of PALETTE) blockRegistry.register(block);

  worldGeneratorRegistry.register(new DocsTerrain());
  worldGeneratorRegistry.register(new DocsArcos());
  worldGeneratorRegistry.register(new DocsPlano());

  dimensionRegistry.register({
    ...DEFAULT_DIMENSION,
    id: 'docs-overworld',
    name: 'Docs Overworld',
    generatorId: 'docs-terreno',
    accentColor: 0x4488ff
  });

  dimensionRegistry.register({
    ...DEFAULT_DIMENSION,
    id: 'docs-abismo',
    name: 'Abismo',
    generatorId: 'docs-arcos',
    accentColor: 0x7c3aed,
    physics: { ...DEFAULT_DIMENSION.physics, gravity: DEFAULT_DIMENSION.physics.gravity * 0.5 },
    atmosphere: {
      ...DEFAULT_DIMENSION.atmosphere,
      daySkyColor: 0x1a0f2b,
      nightSkyColor: 0x05030a,
      horizonColor: 0x5b2a86,
      ambientDayColor: 0x6b4f9e,
      ambientNightColor: 0x241639,
      hasDayNightCycle: false,
      hasClouds: false,
      hasSun: false,
      hasMoon: false
    }
  });
}

export const SEA_LEVEL_BLOCKS = SEA_LEVEL;
