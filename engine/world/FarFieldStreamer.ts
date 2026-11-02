import type WorkerPool from './WorkerPool';
import type { GlobalBrickMap } from '../render/brickmap/GlobalBrickMap';
import type { WorldParams, WorkerResponse } from '../types';

export interface FarFieldOptions {
  /** Lado do chunk distante, em CELULAS. Precisa ser multiplo do brick (8). */
  chunkCells: number;
  /** Voxels de mundo por celula: 4, 8, 16... */
  stride: number;
  /** Onde este anel comeca e termina, em voxels de mundo (raio horizontal). */
  innerRadius: number;
  outerRadius: number;
  /** Meia-altura do anel, em voxels de mundo. */
  verticalRadius: number;
  /** Limites verticais do mundo, em voxels. */
  minY: number;
  maxY: number;
  /** Quantos chunks despachar por tick. */
  budgetPerTick?: number;
}

/**
 * So a posicao. Os voxels NAO ficam guardados.
 *
 * Um chunk distante tem 64^3 celulas = 256 KB, e algumas centenas deles seriam ~100 MB de
 * RAM parada. Depois que os bricks sobem para a GPU ninguem le esses dados de volta: o campo
 * distante nao tem colisao, nao tem edicao e nao tem luz. O que precisa sobreviver e o
 * canto, para saber qual regiao da indirecao limpar quando o chunk sair do anel.
 */
interface FarChunk {
  startX: number;
  startY: number;
  startZ: number;
}

/**
 * O campo distante: terreno grosso, em chunks grandes, so para ser visto.
 *
 * ## Por que nao e o streaming normal com outro numero
 *
 * O alcance de visao esbarra em dois tetos ao mesmo tempo, e o LOD de malha que a engine ja
 * tinha nao mexe em nenhum deles -- ele reduz triangulos, e diz isso na propria doc: "os
 * dados de voxel continuam em resolucao cheia". Os tetos sao:
 *
 *   slots de atlas   a casca visivel do mundo, 512 bytes por brick de 8^3 celulas
 *   chunks vivos     cada um e um job de worker, uma entrada de Map e um Int8Array
 *
 * Esticar a visao em resolucao cheia multiplica os dois pelo quadrado da distancia. A 4 cm
 * por voxel, passar de 20 m para 200 m seriam ~16.000 chunks virando ~1.600.000.
 *
 * Um chunk DESTA classe tem o mesmo tamanho de array e cobre `stride^3` vezes mais mundo.
 * Com stride 8, 512 voxels de mundo por eixo num array de 64: o anel inteiro de 60 a 200 m
 * cabe em algumas centenas de chunks e ~90.000 slots.
 *
 * ## O que ele deliberadamente nao faz
 *
 * Nao calcula luz, nao gera malha, nao guarda bordas, nao participa de colisao nem de
 * edicao. O jogador nunca toca o campo distante -- quando chega perto, o anel fino ja
 * cobriu aquela regiao. Isso e o que mantem a classe pequena: ela so gera e publica.
 *
 * ## A emenda
 *
 * O gerador avalia uma funcao de coordenada de MUNDO, e `stride` so pula coordenadas (ver
 * ChunkContext.stride). Medido, uma celula grossa concorda em solido/ar com o voxel fino da
 * mesma coordenada em 100% das amostras, com stride 2, 4 e 8 -- e por isso que a fronteira
 * entre aneis nao aparece como degrau.
 */
export class FarFieldStreamer {
  private readonly loaded = new Map<string, FarChunk>();
  private readonly pending = new Set<string>();
  private readonly queue: string[] = [];

  /** Lado do chunk em voxels de MUNDO. */
  private readonly worldSpan: number;
  private readonly budget: number;

  private lastCx = Infinity;
  private lastCy = Infinity;
  private lastCz = Infinity;

  constructor(
    private readonly options: FarFieldOptions,
    private readonly pool: WorkerPool,
    private readonly brickMap: GlobalBrickMap,
    private readonly params: WorldParams,
    private readonly voxelsPerBlock: number
  ) {
    this.worldSpan = options.chunkCells * options.stride;
    this.budget = options.budgetPerTick ?? 2;
  }

  public get loadedCount(): number {
    return this.loaded.size;
  }

  private key(x: number, y: number, z: number): string {
    return `${x}_${y}_${z}`;
  }

  /**
   * Recalcula o anel desejado quando o jogador muda de chunk distante, e despacha um pouco
   * por tick.
   *
   * O orcamento por tick existe pelo mesmo motivo do caminho normal: na primeira vez o
   * conjunto inteiro e pedido de uma vez, e sem limite isso e uma rajada de centenas de
   * jobs na thread que desenha.
   */
  public update(camX: number, camY: number, camZ: number): void {
    const span = this.worldSpan;
    const cx = Math.floor(camX / span);
    const cy = Math.floor(camY / span);
    const cz = Math.floor(camZ / span);

    if (cx !== this.lastCx || cy !== this.lastCy || cz !== this.lastCz) {
      this.lastCx = cx; this.lastCy = cy; this.lastCz = cz;
      this.rebuildDesired(cx, cy, cz);
    }

    for (let i = 0; i < this.budget && this.queue.length > 0; i++) {
      const key = this.queue.pop()!;
      if (this.loaded.has(key) || this.pending.has(key)) continue;
      this.dispatch(key);
    }
  }

  private rebuildDesired(cx: number, cy: number, cz: number): void {
    const { innerRadius, outerRadius, verticalRadius, minY, maxY } = this.options;
    const span = this.worldSpan;
    const rOut = Math.ceil(outerRadius / span);
    const rIn = innerRadius / span;
    const rV = Math.ceil(verticalRadius / span);

    const desired = new Set<string>();
    for (let dx = -rOut; dx <= rOut; dx++) {
      for (let dz = -rOut; dz <= rOut; dz++) {
        const d2 = dx * dx + dz * dz;
        if (d2 > rOut * rOut) continue;
        // O miolo e do anel fino. Um chunk inteiramente dentro dele nao e pedido; os que
        // cruzam a borda sao, porque o anel fino pode nao chegar ate a quina deles.
        if (d2 < (rIn - 1.5) * (rIn - 1.5)) continue;

        for (let dy = -rV; dy <= rV; dy++) {
          const sy = (cy + dy) * span;
          if (sy + span <= minY || sy >= maxY) continue;
          desired.add(this.key((cx + dx) * span, sy, (cz + dz) * span));
        }
      }
    }

    for (const [key, chunk] of this.loaded) {
      if (desired.has(key)) continue;
      this.brickMap.removeChunk(key, chunk.startX, chunk.startY, chunk.startZ);
      this.loaded.delete(key);
    }
    for (const key of this.pending) {
      if (!desired.has(key)) { this.pool.cancel(key); this.pending.delete(key); }
    }

    this.queue.length = 0;
    for (const key of desired) {
      if (!this.loaded.has(key) && !this.pending.has(key)) this.queue.push(key);
    }
    // A fila e consumida do fim: ordenar do mais longe para o mais perto faz o que esta
    // perto da borda do anel fino chegar primeiro, que e onde o buraco aparece.
    this.queue.sort((a, b) => this.distance2(b, cx, cy, cz) - this.distance2(a, cx, cy, cz));
  }

  private distance2(key: string, cx: number, cy: number, cz: number): number {
    const [x, y, z] = key.split('_').map(Number);
    const span = this.worldSpan;
    const dx = x / span - cx, dy = y / span - cy, dz = z / span - cz;
    return dx * dx + dy * dy + dz * dz;
  }

  private dispatch(key: string): void {
    const [startX, startY, startZ] = key.split('_').map(Number);
    const { chunkCells, stride } = this.options;
    const span = this.worldSpan;

    this.pending.add(key);
    this.pool.dispatch(
      {
        chunkKey: key,
        size: chunkCells,
        height: chunkCells,
        startX, endX: startX + span,
        startY, endY: startY + span,
        startZ, endZ: startZ + span,
        worldParams: this.params,
        voxelsPerBlock: this.voxelsPerBlock,
        stride,
        neighbourBorderBlocks: {},
        // Campo distante: nada de malha, nada de luz. So os voxels.
        buildMesh: false,
        computeLight: false
      },
      (response: WorkerResponse) => this.onReady(key, startX, startY, startZ, response),
      false
    );
  }

  private onReady(
    key: string, startX: number, startY: number, startZ: number, response: WorkerResponse
  ): void {
    this.pending.delete(key);
    const blocks = response.chunkData?.blocks;
    if (!blocks) return;

    // Chunk de ar puro e a maior parte do anel (tudo acima do relevo). O texel zero da
    // indirecao ja o representa, entao nem vale subir.
    if (response.uniform !== undefined && response.uniform < 0) return;

    this.loaded.set(key, { startX, startY, startZ });
    this.brickMap.uploadChunk(key, startX, startY, startZ, blocks);
  }

  public dispose(): void {
    for (const key of this.pending) this.pool.cancel(key);
    this.pending.clear();
    this.loaded.clear();
    this.queue.length = 0;
  }
}
