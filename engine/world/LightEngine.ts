import { blockRegistry } from '../blocks/BlockRegistry';
import type { ChunkLightBorders } from '../types';

/** Neighbor slots, in this order: -X, +X, -Y, +Y, -Z, +Z. */
export const NEG_X = 0, POS_X = 1, NEG_Y = 2, POS_Y = 3, NEG_Z = 4, POS_Z = 5;
const OPPOSITE = [POS_X, NEG_X, POS_Y, NEG_Y, POS_Z, NEG_Z];

export const MAX_LIGHT = 15;

/** Chunk as seen by the light engine. Light is packed per cell: sky in the high nibble, block in the low. */
export interface LightChunk {
  data: { blocks: Int8Array };
  light: Uint8Array;
  neighbors: Array<LightChunk | null>;
  /** Top was lit as open sky because nothing was loaded above. */
  assumedSky?: boolean;
}

const SKY = 0;
const BLOCK = 1;
type Channel = typeof SKY | typeof BLOCK;

/**
 * Minecraft-style flood-fill lighting.
 *
 * - Block light starts at emitting blocks and loses 1 per step (plus the block's opacity).
 * - Sky light enters from above at 15 and travels straight down without loss through
 *   fully clear blocks; any other step loses light like block light.
 * - A chunk's own light is computed in isolation (`computeLocal`, run in chunk workers,
 *   presuming open sky above); `stitchChunk` then joins it with loaded neighbors.
 * - Edits relight incrementally: light that depended on the changed cell is removed,
 *   then the surroundings propagate back in.
 */
export class LightEngine {
  private readonly size: number;
  private readonly area: number;
  private readonly volume: number;
  private readonly opacity = new Uint8Array(256);
  private readonly emission = new Uint8Array(256);

  private readonly addChunks: LightChunk[] = [];
  private readonly addIdx: number[] = [];
  private readonly remChunks: LightChunk[] = [];
  private readonly remIdx: number[] = [];
  private readonly remLevel: number[] = [];

  // Result of `step` (avoids allocating a tuple per visited cell)
  private stepChunk: LightChunk | null = null;
  private stepIndex = 0;

  /** Chunks whose light changed; the world remeshes them. Only tracked when `trackDirty`. */
  public readonly dirty = new Set<LightChunk>();

  constructor(chunkSize: number, private readonly trackDirty = true) {
    this.size = chunkSize;
    this.area = chunkSize * chunkSize;
    this.volume = this.area * chunkSize;
    this.refreshBlockTables();
  }

  /** Re-reads opacity/emission from the block registry (call after registering blocks). */
  public refreshBlockTables(): void {
    for (let id = -128; id < 128; id++) {
      this.opacity[id & 0xff] = Math.min(MAX_LIGHT, blockRegistry.getLightOpacity(id));
      this.emission[id & 0xff] = blockRegistry.getLightEmission(id);
    }
  }

  public createLightArray(): Uint8Array {
    return new Uint8Array(this.volume);
  }

  // ── Chunk lifecycle ─────────────────────────────────────────────────────

  /**
   * Lights one chunk on its own: block light from its emitters and sky light entering
   * from the top when `openSkyAbove`. Cheap to run in a worker, right after generation.
   */
  public computeLocal(blocks: Int8Array, openSkyAbove: boolean): Uint8Array {
    const light = this.createLightArray();
    const chunk: LightChunk = { data: { blocks }, light, neighbors: [null, null, null, null, null, null] };
    const S = this.size, A = this.area;

    for (let i = 0; i < blocks.length; i++) {
      const e = this.emission[blocks[i] & 0xff];
      if (e > 0) {
        light[i] = e;
        this.pushAdd(chunk, i);
      }
    }
    this.runAdd(BLOCK);

    if (openSkyAbove) {
      for (let column = 0; column < A; column++) {
        const x = column % S, z = (column / S) | 0;
        for (let y = S - 1; y >= 0; y--) {
          const i = y * A + column;
          const op = this.opacity[blocks[i] & 0xff];
          if (op >= MAX_LIGHT) break;
          if (op > 0) {
            // Bloco filtrante (água, folhas): a luz passa a decair e o BFS continua daqui
            light[i] = ((MAX_LIGHT - Math.max(1, op)) << 4) | (light[i] & 0x0f);
            this.pushAdd(chunk, i);
            break;
          }
          light[i] = (MAX_LIGHT << 4) | (light[i] & 0x0f);
          if (this.hasDimmerSideNeighbor(blocks, light, i, x, z)) this.pushAdd(chunk, i);
        }
      }
      this.runAdd(SKY);
    }
    return light;
  }

  /**
   * Joins a newly loaded chunk, whose `light` came from `computeLocal`, with its loaded
   * neighbors. `presumedSky` must match the `openSkyAbove` given to `computeLocal`.
   */
  public stitchChunk(chunk: LightChunk, neighbors: Array<LightChunk | null>, presumedSky: boolean): void {
    const S = this.size, A = this.area;
    const { blocks } = chunk.data;
    this.link(chunk, neighbors);

    const above = neighbors[POS_Y];
    const below = neighbors[NEG_Y];
    chunk.assumedSky = presumedSky && !above;

    // Céu presumido, mas já existe um chunk em cima: corrige as colunas que ele bloqueia
    if (presumedSky && above) {
      for (let column = 0; column < A; column++) {
        if ((above.light[column] >> 4) === MAX_LIGHT) continue;
        const top = (S - 1) * A + column;
        const sky = chunk.light[top] >> 4;
        if (sky > 0) {
          this.setLevel(chunk, top, SKY, 0);
          this.pushRemove(chunk, top, sky);
        }
      }
    }

    // O chunk de baixo presumiu céu: só perde luz nas colunas que este chunk bloqueia
    if (below?.assumedSky) {
      below.assumedSky = false;
      for (let column = 0; column < A; column++) {
        const incoming = above ? above.light[column] >> 4 : presumedSky ? MAX_LIGHT : 0;
        if (incoming === MAX_LIGHT && this.isClearColumn(blocks, column)) continue;
        const bi = (S - 1) * A + column;
        const sky = below.light[bi] >> 4;
        if (sky > 0) { // inclui células filtradas (folhas, água), também vindas do céu presumido
          this.setLevel(below, bi, SKY, 0);
          this.pushRemove(below, bi, sky);
        }
      }
    }
    this.runRemove(SKY);

    // Troca de luz pelas bordas, nos dois sentidos
    for (const channel of [SKY, BLOCK] as Channel[]) {
      const shift = channel === SKY ? 4 : 0;
      for (let face = 0; face < 6; face++) {
        const n = neighbors[face];
        if (!n) continue;
        this.forEachBorderCell(OPPOSITE[face], (i) => {
          if (((n.light[i] >> shift) & 0x0f) > 1) this.pushAdd(n, i);
        });
        this.forEachBorderCell(face, (i) => {
          if (((chunk.light[i] >> shift) & 0x0f) > 1) this.pushAdd(chunk, i);
        });
      }
      this.runAdd(channel);
    }
    if (this.trackDirty) this.dirty.add(chunk);
  }

  /** Links a chunk with its six neighbors (either may be null). */
  public link(chunk: LightChunk, neighbors: Array<LightChunk | null>): void {
    chunk.neighbors = neighbors;
    for (let face = 0; face < 6; face++) {
      const n = neighbors[face];
      if (n) n.neighbors[OPPOSITE[face]] = chunk;
    }
  }

  public unlink(chunk: LightChunk): void {
    for (let face = 0; face < 6; face++) {
      const n = chunk.neighbors[face];
      if (n && n.neighbors[OPPOSITE[face]] === chunk) n.neighbors[OPPOSITE[face]] = null;
      chunk.neighbors[face] = null;
    }
    this.dirty.delete(chunk);
  }

  // ── Block edits ─────────────────────────────────────────────────────────

  private readonly editChunks: LightChunk[] = [];
  private readonly editIdx: number[] = [];

  /** Records a block change; call `flushEdits` once after a batch of changes. */
  public queueEdit(chunk: LightChunk, index: number): void {
    this.editChunks.push(chunk);
    this.editIdx.push(index);
  }

  public flushEdits(): void {
    const count = this.editChunks.length;
    if (count === 0) return;
    const topLayer = (this.size - 1) * this.area;

    for (const channel of [SKY, BLOCK] as Channel[]) {
      // 1. Remove a luz que dependia das células alteradas
      for (let e = 0; e < count; e++) {
        const chunk = this.editChunks[e], index = this.editIdx[e];
        const level = this.getLevel(chunk, index, channel);
        if (level > 0) {
          this.setLevel(chunk, index, channel, 0);
          this.pushRemove(chunk, index, level);
        }
      }
      this.runRemove(channel);

      // 2. Reacende: emissores novos e vizinhos que podem entrar nas células alteradas
      for (let e = 0; e < count; e++) {
        const chunk = this.editChunks[e], index = this.editIdx[e];
        const type = chunk.data.blocks[index];
        if (channel === BLOCK) {
          const em = this.emission[type & 0xff];
          if (em > this.getLevel(chunk, index, BLOCK)) {
            this.setLevel(chunk, index, BLOCK, em);
            this.pushAdd(chunk, index);
          }
        }
        const op = this.opacity[type & 0xff];
        if (op >= MAX_LIGHT) continue;
        for (let dir = 0; dir < 6; dir++) {
          if (!this.step(chunk, index, dir)) continue;
          const n = this.stepChunk!, ni = this.stepIndex;
          if (this.getLevel(n, ni, channel) > 0) this.pushAdd(n, ni);
        }
        // Céu aberto acima de um chunk sem vizinho superior
        if (channel === SKY && chunk.assumedSky && index >= topLayer) {
          this.setLevel(chunk, index, SKY, op === 0 ? MAX_LIGHT : MAX_LIGHT - Math.max(1, op));
          this.pushAdd(chunk, index);
        }
      }
      this.runAdd(channel);
    }
    this.editChunks.length = 0;
    this.editIdx.length = 0;
  }

  // ── Mesh inputs ─────────────────────────────────────────────────────────

  /** Border light slices of the six neighbors, laid out like `ChunkBorders`. */
  public neighborBorders(chunk: LightChunk): ChunkLightBorders {
    const S = this.size, A = this.area;
    const slice = (face: number, pick: (a: number, b: number) => number): Uint8Array | undefined => {
      const n = chunk.neighbors[face];
      if (!n) return undefined;
      const out = new Uint8Array(A);
      for (let a = 0; a < S; a++) {
        for (let b = 0; b < S; b++) out[a * S + b] = n.light[pick(a, b)];
      }
      return out;
    };
    return {
      negX: slice(NEG_X, (y, z) => y * A + z * S + (S - 1)),
      posX: slice(POS_X, (y, z) => y * A + z * S),
      negY: slice(NEG_Y, (z, x) => (S - 1) * A + z * S + x),
      posY: slice(POS_Y, (z, x) => z * S + x),
      negZ: slice(NEG_Z, (y, x) => y * A + (S - 1) * S + x),
      posZ: slice(POS_Z, (y, x) => y * A + x)
    };
  }

  // ── BFS ─────────────────────────────────────────────────────────────────

  private pushAdd(chunk: LightChunk, index: number): void {
    this.addChunks.push(chunk);
    this.addIdx.push(index);
  }

  private pushRemove(chunk: LightChunk, index: number, level: number): void {
    this.remChunks.push(chunk);
    this.remIdx.push(index);
    this.remLevel.push(level);
  }

  private runAdd(channel: Channel): void {
    const chunks = this.addChunks, idx = this.addIdx;
    const opacity = this.opacity;
    for (let head = 0; head < chunks.length; head++) {
      const chunk = chunks[head];
      const index = idx[head];
      const level = this.getLevel(chunk, index, channel);
      if (level <= 1) continue;

      for (let dir = 0; dir < 6; dir++) {
        if (!this.step(chunk, index, dir)) continue;
        const n = this.stepChunk!, ni = this.stepIndex;
        const op = opacity[n.data.blocks[ni] & 0xff];
        if (op >= MAX_LIGHT) continue;
        const next = channel === SKY && dir === NEG_Y && level === MAX_LIGHT && op === 0
          ? MAX_LIGHT
          : level - (op > 1 ? op : 1);
        if (next > this.getLevel(n, ni, channel)) {
          this.setLevel(n, ni, channel, next);
          chunks.push(n);
          idx.push(ni);
        }
      }
    }
    chunks.length = 0;
    idx.length = 0;
  }

  private runRemove(channel: Channel): void {
    const chunks = this.remChunks, idx = this.remIdx, levels = this.remLevel;
    for (let head = 0; head < chunks.length; head++) {
      const chunk = chunks[head];
      const index = idx[head];
      const level = levels[head];

      for (let dir = 0; dir < 6; dir++) {
        if (!this.step(chunk, index, dir)) continue;
        const n = this.stepChunk!, ni = this.stepIndex;
        const nl = this.getLevel(n, ni, channel);
        if (nl === 0) continue;
        const dependent = nl < level ||
          (channel === SKY && dir === NEG_Y && level === MAX_LIGHT && nl === MAX_LIGHT);
        if (dependent) {
          this.setLevel(n, ni, channel, 0);
          chunks.push(n);
          idx.push(ni);
          levels.push(nl);
          // Um emissor atravessado pela remoção volta a emitir sua própria luz
          const e = channel === BLOCK ? this.emission[n.data.blocks[ni] & 0xff] : 0;
          if (e > 0) {
            this.setLevel(n, ni, BLOCK, e);
            this.pushAdd(n, ni);
          }
        } else {
          // Luz independente na fronteira: repropaga para dentro da área apagada
          this.pushAdd(n, ni);
        }
      }
    }
    chunks.length = 0;
    idx.length = 0;
    levels.length = 0;
  }

  // ── Cell access ─────────────────────────────────────────────────────────

  private getLevel(chunk: LightChunk, index: number, channel: Channel): number {
    const v = chunk.light[index];
    return channel === SKY ? v >> 4 : v & 0x0f;
  }

  private setLevel(chunk: LightChunk, index: number, channel: Channel, level: number): void {
    const v = chunk.light[index];
    chunk.light[index] = channel === SKY ? (level << 4) | (v & 0x0f) : (v & 0xf0) | level;
    if (this.trackDirty) this.markDirty(chunk, index);
  }

  /** Marks the chunk, and a neighbor whose mesh samples this cell across the border. */
  private markDirty(chunk: LightChunk, index: number): void {
    this.dirty.add(chunk);
    const S = this.size, A = this.area;
    const x = index % S, z = ((index / S) | 0) % S, y = (index / A) | 0;
    if (x !== 0 && x !== S - 1 && y !== 0 && y !== S - 1 && z !== 0 && z !== S - 1) return;
    const n = chunk.neighbors;
    if (x === 0 && n[NEG_X]) this.dirty.add(n[NEG_X]!);
    else if (x === S - 1 && n[POS_X]) this.dirty.add(n[POS_X]!);
    if (y === 0 && n[NEG_Y]) this.dirty.add(n[NEG_Y]!);
    else if (y === S - 1 && n[POS_Y]) this.dirty.add(n[POS_Y]!);
    if (z === 0 && n[NEG_Z]) this.dirty.add(n[NEG_Z]!);
    else if (z === S - 1 && n[POS_Z]) this.dirty.add(n[POS_Z]!);
  }

  /** Moves one cell in `dir`, possibly into a neighbor chunk; false if that chunk isn't loaded. */
  private step(chunk: LightChunk, index: number, dir: number): boolean {
    const S = this.size, A = this.area, V = this.volume;
    let target: LightChunk | null = chunk;
    let ni: number;
    switch (dir) {
      case NEG_X:
        if (index % S > 0) ni = index - 1;
        else { target = chunk.neighbors[NEG_X]; ni = index + S - 1; }
        break;
      case POS_X:
        if (index % S < S - 1) ni = index + 1;
        else { target = chunk.neighbors[POS_X]; ni = index - (S - 1); }
        break;
      case NEG_Y:
        if (index >= A) ni = index - A;
        else { target = chunk.neighbors[NEG_Y]; ni = index + V - A; }
        break;
      case POS_Y:
        if (index < V - A) ni = index + A;
        else { target = chunk.neighbors[POS_Y]; ni = index - (V - A); }
        break;
      case NEG_Z:
        if (index % A >= S) ni = index - S;
        else { target = chunk.neighbors[NEG_Z]; ni = index + A - S; }
        break;
      default:
        if (index % A < A - S) ni = index + S;
        else { target = chunk.neighbors[POS_Z]; ni = index - (A - S); }
        break;
    }
    if (!target) return false;
    this.stepChunk = target;
    this.stepIndex = ni;
    return true;
  }

  /** Visits the cells of one face of a chunk. */
  private forEachBorderCell(face: number, fn: (index: number) => void): void {
    const S = this.size, A = this.area;
    for (let a = 0; a < S; a++) {
      for (let b = 0; b < S; b++) {
        switch (face) {
          case NEG_X: fn(a * A + b * S); break;
          case POS_X: fn(a * A + b * S + S - 1); break;
          case NEG_Y: fn(a * S + b); break;
          case POS_Y: fn((S - 1) * A + a * S + b); break;
          case NEG_Z: fn(a * A + b); break;
          default:    fn(a * A + (S - 1) * S + b); break;
        }
      }
    }
  }

  /** True if sunlight crosses the whole column without being filtered. */
  private isClearColumn(blocks: Int8Array, column: number): boolean {
    for (let i = column; i < blocks.length; i += this.area) {
      if (this.opacity[blocks[i] & 0xff] !== 0) return false;
    }
    return true;
  }

  /** True if a horizontal neighbor inside the chunk could receive light from this sky cell. */
  private hasDimmerSideNeighbor(blocks: Int8Array, light: Uint8Array, index: number, x: number, z: number): boolean {
    const S = this.size;
    if (x === 0 || x === S - 1 || z === 0 || z === S - 1) return true;
    const op = this.opacity;
    return (op[blocks[index - 1] & 0xff] < MAX_LIGHT && (light[index - 1] >> 4) < MAX_LIGHT - 1) ||
      (op[blocks[index + 1] & 0xff] < MAX_LIGHT && (light[index + 1] >> 4) < MAX_LIGHT - 1) ||
      (op[blocks[index - S] & 0xff] < MAX_LIGHT && (light[index - S] >> 4) < MAX_LIGHT - 1) ||
      (op[blocks[index + S] & 0xff] < MAX_LIGHT && (light[index + S] >> 4) < MAX_LIGHT - 1);
  }
}
