import { SimplexNoise } from 'three/examples/jsm/Addons.js';
import ChunkData from '../chunk/ChunkData';
import ChunkGeometry from '../chunk/ChunkGeometry';
import { ChunkDataResult, ChunkJobData, WorkerResponse, ChunkBorders, ChunkLightBorders } from '../types';
import { blockRegistry } from '../blocks/BlockRegistry';
import RNG from '../utils/rng';
import { LightEngine } from '../world/LightEngine';

let lightEngine: LightEngine | null = null;

/** Created lazily, after the game's setup has registered its blocks. */
function getLightEngine(size: number): LightEngine {
  if (!lightEngine) lightEngine = new LightEngine(size, false);
  return lightEngine;
}

// ── Fix 1: SimplexNoise singleton cached per worker instance ──────────────────
// Each worker is a long-lived JS context. Re-creating SimplexNoise for every
// chunk job wastes ~0.5–2ms rebuilding the 512-entry permutation table, even
// though the seed never changes mid-session. We cache it here instead.
let cachedSimplex: SimplexNoise | null = null;
let cachedSeed: number = -1;

function getSimplexForSeed(seed: number): SimplexNoise {
  if (seed !== cachedSeed || cachedSimplex === null) {
    cachedSimplex = new SimplexNoise(new RNG(seed));
    cachedSeed = seed;
  }
  return cachedSimplex;
}

export interface ChunkWorkerOptions {
  /**
   * Runs once inside the worker before any job. Register the game's blocks and
   * world generators here: each worker has its own registries.
   */
  setup?: () => void;
}

/** Entry point for a chunk worker: generates terrain and greedy-meshes chunks. */
export function runChunkWorker(options: ChunkWorkerOptions = {}): void {
  options.setup?.();
  self.onmessage = (e: MessageEvent<ChunkJobData>): void => handleJob(e.data);
}

function handleJob(job: ChunkJobData): void {
  // Resolve the cached simplex for this seed (no-op on the 2nd+ job with same seed)
  const simplex = getSimplexForSeed(job.worldParams.seed);

  // If existingBlocks is provided this is a rebuild job — skip terrain generation.
  const chunkDataResult: ChunkDataResult = job.existingBlocks
    ? {
        startX: job.startX,
        endX: job.endX,
        startY: job.startY,
        endY: job.endY,
        startZ: job.startZ,
        endZ: job.endZ,
        blocks: job.existingBlocks,
        waterLevels: job.existingWaterLevels ?? new Uint8Array(job.existingBlocks.length).fill(0)
      }
    : new ChunkData({
        size:        job.size,
        height:      job.height,
        startX:      job.startX,
        endX:        job.endX,
        startY:      job.startY,
        endY:        job.endY,
        startZ:      job.startZ,
        endZ:        job.endZ,
        worldParams: job.worldParams,
        voxelsPerBlock: job.voxelsPerBlock,
        simplex,       // ← injected, no re-creation inside ChunkData
      }).getData();

  // Chunks sem nenhuma face visivel (ar puro, ou solido enterrado entre vizinhos opacos)
  // nao recebem malha. Vale pouco no voxel classico e vale tudo em minivoxel: a maioria
  // esmagadora dos chunks cai nesse caso, e o greedy meshing custa O(size^3 * 6) mesmo
  // quando o resultado e vazio.
  const uniform = uniformValue(chunkDataResult.blocks);
  const needsMesh = job.buildMesh !== false
    && !hasNoVisibleFaces(uniform, job.neighbourBorderBlocks, job.size);

  const geometry = needsMesh
      ? buildGeometry(chunkDataResult, job)
      : undefined;
      
  const borders = computeBorders(chunkDataResult, job.size);
  const light = !job.existingBlocks && job.computeLight
    ? getLightEngine(job.size).computeLocal(chunkDataResult.blocks, job.presumeSky ?? false)
    : undefined;

  // Compartilhar so vale para ar e solido: um chunk uniforme de fluido e simulado, e
  // simulacao escreve no array.
  const shareable = uniform !== null && !blockRegistry.isFluid(uniform);
  const uniformLight = light ? uniformValue(light) : null;

  const response: WorkerResponse = {
    chunkKey:  job.chunkKey,
    chunkData: chunkDataResult,
    borders:   borders,
    opaque:    geometry?.opaque,
    water:     geometry?.water,
    light,
    uniform:      shareable ? uniform! : undefined,
    uniformLight: shareable && uniformLight !== null ? uniformLight : undefined,
  };

  // Transfer the ArrayBuffers instead of copying them (zero-copy).
  const transferables: ArrayBuffer[] = [
    chunkDataResult.blocks.buffer as ArrayBuffer,
    chunkDataResult.waterLevels.buffer as ArrayBuffer,
    borders.negX!.buffer as ArrayBuffer,
    borders.posX!.buffer as ArrayBuffer,
    borders.negY!.buffer as ArrayBuffer,
    borders.posY!.buffer as ArrayBuffer,
    borders.negZ!.buffer as ArrayBuffer,
    borders.posZ!.buffer as ArrayBuffer,
  ];

  if (light) transferables.push(light.buffer as ArrayBuffer);

  if (geometry) {
    transferables.push(
      geometry.opaque.positions.buffer,
      geometry.opaque.normals.buffer,
      geometry.opaque.uvs.buffer,
      geometry.opaque.colors.buffer,
      geometry.opaque.isWater.buffer,
      geometry.opaque.creationTime.buffer,
      geometry.opaque.ao.buffer,
      geometry.opaque.light.buffer,
      geometry.opaque.vertices.buffer,
      geometry.water.positions.buffer,
      geometry.water.normals.buffer,
      geometry.water.uvs.buffer,
      geometry.water.colors.buffer,
      geometry.water.isWater.buffer,
      geometry.water.creationTime.buffer,
      geometry.water.ao.buffer,
      geometry.water.light.buffer,
      geometry.water.vertices.buffer
    );
  }

  (self as any).postMessage(response, transferables);
}

/** Valor unico de um volume, ou null se houver mais de um. */
function uniformValue(arr: Int8Array | Uint8Array): number | null {
  const first = arr[0];
  for (let i = 1; i < arr.length; i++) {
    if (arr[i] !== first) return null;
  }
  return first;
}

/**
 * True quando o chunk nao pode produzir uma unica face: ou e ar puro, ou e um unico
 * bloco opaco cercado por fronteiras opacas nos seis vizinhos. Um vizinho desconhecido
 * conta como possivel face, para nunca abrir buraco no mundo.
 */
function hasNoVisibleFaces(uniform: number | null, borders: ChunkBorders, size: number): boolean {
  if (uniform === null) return false;
  const first = uniform;

  if (first < 0) return true;                       // ar puro
  if (!blockRegistry.isOpaque(first)) return false; // agua/vidro uniforme ainda rende superficie

  const area = size * size;
  const slices = [borders.negX, borders.posX, borders.negY, borders.posY, borders.negZ, borders.posZ];
  for (const slice of slices) {
    if (!slice || slice.length !== area) return false;
    for (let i = 0; i < area; i++) {
      if (!blockRegistry.isOpaque(slice[i])) return false;
    }
  }
  return true;
}

function buildGeometry(data: ChunkDataResult, job: ChunkJobData) {
  const step = job.lodStep ?? 1;
  if (step <= 1) {
    return new ChunkGeometry(
      data, job.neighbourBorderBlocks, job.light, job.neighbourBorderLight, job.neighbourBorderWaterLevels
    ).getData();
  }
  return buildLodGeometry(data, job, step);
}

/**
 * Contadores de dominancia, reaproveitados entre todas as celulas de todos os chunks.
 * Ids de bloco cabem em 0..127 (Int8Array), e `touched` guarda quais entradas limpar,
 * para nao zerar 128 posicoes por macro-celula.
 */
const DOM_COUNTS = new Int32Array(128);
const DOM_TOUCHED = new Int32Array(128);
let domTouched = 0;

function domReset(): void {
  for (let i = 0; i < domTouched; i++) DOM_COUNTS[DOM_TOUCHED[i]] = 0;
  domTouched = 0;
}

function domAdd(id: number): void {
  if (id < 0) return;
  if (++DOM_COUNTS[id] === 1) DOM_TOUCHED[domTouched++] = id;
}

/**
 * Bloco representativo do grupo acumulado: o solido mais frequente, ou ar se o grupo for
 * todo ar. Maioria, e nao "o primeiro que achar", evita que uma folha solitaria domine uma
 * macro-celula inteira de pedra vista de longe. Limpa os contadores ao sair.
 */
function domWinner(): number {
  let best = -1;
  let bestCount = 0;
  for (let i = 0; i < domTouched; i++) {
    const id = DOM_TOUCHED[i];
    const c = DOM_COUNTS[id];
    if (c > bestCount) { bestCount = c; best = id; }
  }
  domReset();
  return best;
}

/** Reamostra um volume size^3 em macro-celulas de `step` voxels. */
function downsampleVolume(src: Int8Array, size: number, step: number): Int8Array {
  const m = size / step;
  const out = new Int8Array(m * m * m);
  const area = size * size;
  for (let my = 0; my < m; my++) {
    for (let mz = 0; mz < m; mz++) {
      for (let mx = 0; mx < m; mx++) {
        const ox = mx * step, oy = my * step, oz = mz * step;
        for (let dy = 0; dy < step; dy++) {
          for (let dz = 0; dz < step; dz++) {
            const row = (oy + dy) * area + (oz + dz) * size + ox;
            for (let dx = 0; dx < step; dx++) domAdd(src[row + dx]);
          }
        }
        out[my * m * m + mz * m + mx] = domWinner();
      }
    }
  }
  return out;
}

/** Reamostra uma fatia de fronteira size^2 em macro-celulas de `step`. */
function downsampleSlice(src: Int8Array | undefined, size: number, step: number): Int8Array | undefined {
  if (!src) return undefined;
  const m = size / step;
  const out = new Int8Array(m * m);
  for (let a = 0; a < m; a++) {
    for (let b = 0; b < m; b++) {
      const oa = a * step, ob = b * step;
      for (let da = 0; da < step; da++) {
        const row = (oa + da) * size + ob;
        for (let db = 0; db < step; db++) domAdd(src[row + db]);
      }
      out[a * m + b] = domWinner();
    }
  }
  return out;
}

/** Reamostra um campo escalar (luz empacotada, nivel de agua) pelo maximo do grupo. */
function downsampleScalar(src: Uint8Array | undefined, size: number, step: number): Uint8Array | undefined {
  if (!src) return undefined;
  const m = size / step;
  const out = new Uint8Array(m * m * m);
  const area = size * size;
  for (let my = 0; my < m; my++) {
    for (let mz = 0; mz < m; mz++) {
      for (let mx = 0; mx < m; mx++) {
        let max = 0;
        for (let dy = 0; dy < step; dy++) {
          for (let dz = 0; dz < step; dz++) {
            const row = (my * step + dy) * area + (mz * step + dz) * size + mx * step;
            for (let dx = 0; dx < step; dx++) {
              const v = src[row + dx];
              if (v > max) max = v;
            }
          }
        }
        out[my * m * m + mz * m + mx] = max;
      }
    }
  }
  return out;
}

const SLICE_KEYS = ['negX', 'posX', 'negY', 'posY', 'negZ', 'posZ'] as const;

function downsampleBorders(borders: ChunkBorders, size: number, step: number): ChunkBorders {
  const out: ChunkBorders = {};
  for (const key of SLICE_KEYS) out[key] = downsampleSlice(borders[key], size, step);
  return out;
}

function downsampleLightBorders(borders: ChunkLightBorders, size: number, step: number): ChunkLightBorders {
  const out: ChunkLightBorders = {};
  for (const key of SLICE_KEYS) out[key] = downsampleScalar(borders[key], size, step);
  return out;
}

/**
 * Malha em nivel de detalhe reduzido.
 *
 * Em vez de uma segunda implementacao de greedy meshing, reamostra o chunk em um grid
 * `size/step` e roda o meshing normal nele, com as coordenadas de inicio divididas por
 * `step` (sempre inteiras, porque step divide size). Depois multiplica as posicoes de
 * volta: uma face de 1 macro-voxel sai com `step` unidades de lado, exatamente o volume
 * que ela representa.
 */
function buildLodGeometry(data: ChunkDataResult, job: ChunkJobData, step: number) {
  const size = job.size;
  const macro: ChunkDataResult = {
    startX: data.startX / step, endX: data.endX / step,
    startY: data.startY / step, endY: data.endY / step,
    startZ: data.startZ / step, endZ: data.endZ / step,
    blocks: downsampleVolume(data.blocks, size, step),
    waterLevels: downsampleScalar(data.waterLevels, size, step) ?? new Uint8Array(0)
  };

  const geometry = new ChunkGeometry(
    macro,
    downsampleBorders(job.neighbourBorderBlocks, size, step),
    downsampleScalar(job.light, size, step),
    downsampleLightBorders(job.neighbourBorderLight ?? {}, size, step),
    downsampleLightBorders(job.neighbourBorderWaterLevels ?? {}, size, step)
  ).getData();

  for (const part of [geometry.opaque, geometry.water]) {
    const positions = part.positions;
    for (let i = 0; i < positions.length; i++) positions[i] *= step;
  }
  return geometry;
}

function computeBorders(data: ChunkDataResult, size: number): ChunkBorders {
    const negX = new Int8Array(size * size).fill(-1);
    const posX = new Int8Array(size * size).fill(-1);
    const negY = new Int8Array(size * size).fill(-1);
    const posY = new Int8Array(size * size).fill(-1);
    const negZ = new Int8Array(size * size).fill(-1);
    const posZ = new Int8Array(size * size).fill(-1);

    for (let y = 0; y < size; y++) {
        for (let l = 0; l < size; l++) {
            negX[y * size + l] = data.blocks[y * size * size + l * size + 0];
            posX[y * size + l] = data.blocks[y * size * size + l * size + (size - 1)];
            negZ[y * size + l] = data.blocks[y * size * size + 0 * size + l];
            posZ[y * size + l] = data.blocks[y * size * size + (size - 1) * size + l];
        }
    }
    
    for (let x = 0; x < size; x++) {
        for (let z = 0; z < size; z++) {
            negY[z * size + x] = data.blocks[0 * size * size + z * size + x];
            posY[z * size + x] = data.blocks[(size - 1) * size * size + z * size + x];
        }
    }

    return { negX, posX, negY, posY, negZ, posZ };
}
