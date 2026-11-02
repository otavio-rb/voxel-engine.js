/**
 * Chunk worker da documentação: gera e malha os chunks das demos ao vivo.
 *
 * Além do trabalho normal, ele aceita `docs:generator` — o gerador que o leitor escreve na
 * página é uma função de verdade (não uma string); a página manda `generate.toString()`, e
 * aqui dentro reconstituímos um objeto `{ generate(ctx) {...} }` a partir dessa fonte e
 * chamamos `.generate(ctx)` nele. É só assim que uma função cruza a fronteira de um Worker
 * de verdade: `postMessage` nunca aceitaria a função em si, só o seu texto.
 */
import { runChunkWorker } from '../../../engine/runtime/ChunkRuntime';
import { worldGeneratorRegistry } from '../../../engine/world/WorldGeneratorRegistry';
import { registerDocsContent, DOCS_BLOCKS } from '../content';
import { createWorld } from '../../../engine/world/generation/terrain';
import { composeTerrain, baseTerrain, mountains, hills, flatTerrain } from '../../../engine/world/generation/terrainLayers';
import { region } from '../../../engine/world/generation/overrides';
import { customGenerator } from '../../../engine/world/generation/customGenerator';
import { sampleHeight } from '../../../engine/world/generation/heightmap';
import { classifyBiome } from '../../../engine/world/generation/biomes';
import { applySurfaceLayers, scatterOres } from '../../../engine/world/generation/surfaceLayers';
import { CaveCarver } from '../../../engine/world/generation/caves';
import { cellHash2, cellHash3, ridgeNoise2D } from '../../../engine/world/generation/noise';

/** Exposto como terceiro argumento (`GEN`) pro código de gerador que o leitor edita nas páginas de geração procedural. */
const GEN = {
  createWorld, composeTerrain, baseTerrain, mountains, hills, flatTerrain, region, customGenerator,
  sampleHeight, classifyBiome, applySurfaceLayers, scatterOres, CaveCarver, cellHash2, cellHash3, ridgeNoise2D
};

runChunkWorker({ setup: registerDocsContent });

// `runChunkWorker` instalou o handler de jobs; passamos a filtrar antes dele.
const jobHandler = self.onmessage as ((e: MessageEvent) => void) | null;

self.onmessage = (e: MessageEvent) => {
  const data = e.data as { type?: string; id?: string; code?: string };

  if (data?.type === 'docs:generator' && data.id && data.code) {
    try {
      // eslint-disable-next-line no-new-func
      const generate = new Function('ctx', 'BLOCKS', 'GEN', `"use strict";\nreturn ({${data.code}}).generate(ctx);`) as (
        ctx: unknown,
        blocks: typeof DOCS_BLOCKS,
        gen: typeof GEN
      ) => void;

      worldGeneratorRegistry.register({
        id: data.id,
        generate: (ctx) => generate(ctx, DOCS_BLOCKS, GEN)
      });
    } catch (err) {
      console.error('[docs:generator] falhou ao compilar', err);
    }
    return;
  }

  jobHandler?.(e);
};
