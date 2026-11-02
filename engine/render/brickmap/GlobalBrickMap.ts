import type { WebGLRenderer } from 'three';
import { GpuTexture3D } from './GpuTexture3D';

/** Lado de um brick, em voxels. 8^3 = 512 voxels por brick. */
export const BRICK = 8;
const BRICK_VOXELS = BRICK * BRICK * BRICK;

/** Como -1 (ar, em Int16Array) aparece ao ler o mesmo buffer como Uint8. */
export const AIR_TEXEL = 255;

/* Tags do texel de indirecao (32 bits). Ver `publishBrick`. */
/** Brick 100% ar: o raio pula 8 voxels num passo e nunca toca o atlas. */
const TAG_EMPTY = 0x00000000;
/** Brick 100% solido e de um unico bloco: colide na face de entrada, sem micro-DDA. */
const TAG_UNIFORM = 0x80000000;
/** Brick misto: os bits baixos indexam o slot no atlas. */
const TAG_MIXED = 0x40000000;

export interface GlobalBrickMapOptions {
  /** Lado do chunk, em CELULAS. Precisa ser multiplo de BRICK. */
  chunkSize: number;
  /**
   * Quantos voxels de MUNDO vale cada celula guardada. 1 no campo proximo.
   *
   * Um brickmap de anel distante guarda celulas grossas: com `voxelScale: 4`, um brick de
   * 8^3 celulas cobre 32 voxels de mundo por eixo, ou seja 64x menos memoria pelo mesmo
   * volume. Todo o resto da classe -- classificacao, atlas, toro -- nao muda: ela trabalha
   * em espaco de CELULA, e quem converte de mundo para celula e o shader.
   */
  voxelScale?: number;
  /** Janela do mundo residente na GPU, em bricks, por eixo. Arredondada para multiplo do chunk. */
  windowBricks: { x: number; y: number; z: number };
  /** Quantos bricks mistos o atlas comporta. Cada um custa 512 bytes de VRAM. */
  atlasSlots: number;
}

/**
 * O mundo inteiro como UMA estrutura na GPU: grade de indirecao esparsa + atlas de bricks.
 *
 * ## Por que isso substitui a caixa por chunk
 *
 * O prototipo anterior desenhava uma caixa por chunk, cada uma com a sua textura 3D e o seu
 * clone de material. Com a visao que o tiny-voxels pedia (18 chunks na horizontal, 10 na
 * vertical, 40 camadas) isso dava ~28.000 chunks vivos: 28.000 draw calls e mais de 1 GB de
 * VRAM so em texturas de 34^3. Nao existe raymarcher que sobreviva a isso, e nenhum conserto
 * de shader ia mudar o numero -- o custo era a contagem de objetos, nao o tracado do raio.
 *
 * Aqui existem exatamente duas texturas e um draw call para o mundo todo:
 *
 *   indirecao  um texel R32UI por brick de 8^3 voxels, enderecado em toro (`mod` da janela).
 *              Diz se o brick e ar, solido uniforme, ou aponta um slot do atlas.
 *   atlas      um R8UI com os ids de bloco dos bricks MISTOS, e so deles.
 *
 * O ganho de memoria vem de nao armazenar o que e uniforme: num mundo de cavernas, a rocha
 * macica e o ar aberto sao a maioria esmagadora do volume e custam 4 bytes por 512 voxels em
 * vez de 512. So a casca -- superficie, parede de caverna, veio de cristal -- chega ao atlas.
 *
 * ## Enderecamento em toro
 *
 * A janela nao e recentralizada por copia: o brick de coordenada global `b` mora sempre no
 * texel `b mod N`. Mover o jogador nao move nada na GPU; so muda qual faixa de `b` e valida.
 *
 * Isso so e seguro porque a janela e maior que o conjunto de chunks vivos: dois chunks
 * carregados ao mesmo tempo nunca caem no mesmo texel. `assertWindowCoversView` cobra isso na
 * construcao, porque a falha seria um chunk sobrescrevendo outro -- um bug que aparece como
 * terreno piscando a 200 metros e e quase impossivel de rastrear depois.
 *
 * ## Sem apron
 *
 * A versao por chunk mantinha uma casca de 1 voxel copiada dos seis vizinhos, so para que o
 * DDA e a AO nao caissem num buraco na fronteira. Aqui nao existe fronteira: uma consulta de
 * voxel em qualquer coordenada do mundo passa pela indirecao e acha o brick certo. As ~200
 * linhas de costura de borda desaparecem junto.
 */
export class GlobalBrickMap {
  public readonly indirection: GpuTexture3D;
  public readonly atlas: GpuTexture3D;

  /** Lado da janela em bricks, por eixo. */
  public readonly nx: number;
  public readonly ny: number;
  public readonly nz: number;

  /** Layout do atlas em bricks, por eixo. */
  private readonly ax: number;
  private readonly ay: number;

  private readonly chunkSize: number;
  /** Lado do chunk em bricks (chunkSize / BRICK). */
  public readonly chunkBricks: number;
  /** Voxels de mundo por celula. Ver GlobalBrickMapOptions.voxelScale. */
  public readonly voxelScale: number;
  /** Voxels de mundo cobertos por um brick, em cada eixo. */
  public get worldVoxelsPerBrick(): number { return BRICK * this.voxelScale; }

  /** Espelho em CPU da indirecao: a GPU nao e legivel, e remover um chunk precisa ler. */
  private readonly grid: Uint32Array;

  /** Pilha de slots livres do atlas. */
  private readonly freeSlots: Int32Array;
  private freeCount: number;

  /** Slots que cada chunk detem, para devolve-los no unload. -1 = brick sem slot. */
  private readonly chunkSlots = new Map<string, Int32Array>();

  /** Buffers de staging reusados: zero alocacao por chunk no caminho quente. */
  private readonly brickStaging = new Uint8Array(BRICK_VOXELS);
  private readonly chunkIndirStaging: Uint32Array;
  private readonly oneTexel = new Uint32Array(1);

  /** Alto-da-agua de uso do atlas, para o relatorio de memoria e para detectar pressao. */
  public peakSlotsUsed = 0;
  /** Quantas alocacoes falharam por atlas cheio. Diferente de zero = janela ou atlas pequenos. */
  public allocFailures = 0;

  constructor(options: GlobalBrickMapOptions) {
    this.chunkSize = options.chunkSize;
    if (this.chunkSize % BRICK !== 0) {
      throw new Error(`GlobalBrickMap: chunkSize ${this.chunkSize} nao e multiplo de ${BRICK}`);
    }
    this.chunkBricks = this.chunkSize / BRICK;
    this.voxelScale = options.voxelScale ?? 1;

    // Arredondar a janela para multiplo do chunk e o que garante que a caixa de bricks de um
    // chunk nunca cruze a emenda do toro -- e por isso ela sobe em UM texSubImage3D, nao 64.
    const round = (v: number) =>
      Math.max(this.chunkBricks, Math.ceil(v / this.chunkBricks) * this.chunkBricks);
    this.nx = round(options.windowBricks.x);
    this.ny = round(options.windowBricks.y);
    this.nz = round(options.windowBricks.z);

    this.grid = new Uint32Array(this.nx * this.ny * this.nz);
    this.indirection = new GpuTexture3D(this.nx, this.ny, this.nz, 'R32UI');

    // O atlas e um cubo de bricks o mais quadrado possivel: eixos muito desiguais estouram o
    // limite de MAX_3D_TEXTURE_SIZE (tipicamente 2048) antes de usar os slots pedidos.
    const side = Math.ceil(Math.cbrt(options.atlasSlots));
    this.ax = side;
    this.ay = side;
    const az = Math.ceil(options.atlasSlots / (side * side));
    this.atlas = new GpuTexture3D(side * BRICK, side * BRICK, az * BRICK, 'R8UI');

    const slots = side * side * az;
    this.freeSlots = new Int32Array(slots);
    for (let i = 0; i < slots; i++) this.freeSlots[i] = slots - 1 - i;
    this.freeCount = slots;

    this.chunkIndirStaging = new Uint32Array(this.chunkBricks ** 3);
  }

  public get totalSlots(): number {
    return this.freeSlots.length;
  }

  public get slotsUsed(): number {
    return this.freeSlots.length - this.freeCount;
  }

  /** Bytes de VRAM das duas texturas. */
  public get byteLength(): number {
    return this.indirection.byteLength + this.atlas.byteLength;
  }

  public attach(renderer: WebGLRenderer): void {
    this.indirection.attach(renderer);
    this.atlas.attach(renderer);
  }

  public get isAttached(): boolean {
    return this.indirection.isAttached && this.atlas.isAttached;
  }

  /**
   * Cobra que a janela comporte a visao pedida.
   *
   * Ver o comentario da classe: janela menor que o conjunto vivo faz dois chunks colidirem no
   * mesmo texel do toro, e o sintoma e sutil demais para ser descoberto em runtime.
   */
  public assertWindowCoversView(viewChunksXZ: number, down: number, up: number): void {
    const needXZ = (2 * viewChunksXZ + 3) * this.chunkBricks;
    const needY = (down + up + 3) * this.chunkBricks;
    if (this.nx < needXZ || this.nz < needXZ || this.ny < needY) {
      throw new Error(
        `GlobalBrickMap: janela ${this.nx}x${this.ny}x${this.nz} bricks nao cobre a visao ` +
        `(precisa de ${needXZ}x${needY}x${needXZ}). Dois chunks cairiam no mesmo texel.`
      );
    }
  }

  // --- Enderecamento --------------------------------------------------------

  /** Indice no espelho/textura do brick de coordenada global `(bx, by, bz)`. */
  private gridIndex(bx: number, by: number, bz: number): number {
    const tx = ((bx % this.nx) + this.nx) % this.nx;
    const ty = ((by % this.ny) + this.ny) % this.ny;
    const tz = ((bz % this.nz) + this.nz) % this.nz;
    return (tz * this.ny + ty) * this.nx + tx;
  }

  private slotOriginX(slot: number): number { return (slot % this.ax) * BRICK; }
  private slotOriginY(slot: number): number { return (((slot / this.ax) | 0) % this.ay) * BRICK; }
  private slotOriginZ(slot: number): number { return ((slot / (this.ax * this.ay)) | 0) * BRICK; }

  // --- Carga de chunk -------------------------------------------------------

  /**
   * Publica (ou republica) um chunk inteiro no brickmap.
   *
   * Reusa os slots que o chunk ja detinha: um chunk reconstruido nao devolve e repede 64
   * slots, o que fragmentaria a pilha livre a cada edicao.
   */
  public uploadChunk(
    key: string,
    startX: number, startY: number, startZ: number,
    blocks: Int16Array
  ): void {
    if (!this.isAttached) return;

    const cb = this.chunkBricks;
    // `startX` chega em voxels de mundo; a grade de indirecao vive em espaco de celula.
    const w = this.worldVoxelsPerBrick;
    const b0x = Math.floor(startX / w);
    const b0y = Math.floor(startY / w);
    const b0z = Math.floor(startZ / w);

    let slots = this.chunkSlots.get(key);
    if (!slots) {
      slots = new Int32Array(cb ** 3).fill(-1);
      this.chunkSlots.set(key, slots);
    }

    const indir = this.chunkIndirStaging;

    for (let lbz = 0; lbz < cb; lbz++) {
      for (let lby = 0; lby < cb; lby++) {
        for (let lbx = 0; lbx < cb; lbx++) {
          const local = (lbz * cb + lby) * cb + lbx;
          const value = this.publishBrick(blocks, lbx, lby, lbz, slots, local);

          // A staging segue o layout da textura: x rapido, depois y, depois z.
          indir[local] = value;
          this.grid[this.gridIndex(b0x + lbx, b0y + lby, b0z + lbz)] = value;
        }
      }
    }

    // A caixa e alinhada ao chunk, entao nunca cruza a emenda do toro: um upload so.
    this.indirection.writeBox(
      ((b0x % this.nx) + this.nx) % this.nx,
      ((b0y % this.ny) + this.ny) % this.ny,
      ((b0z % this.nz) + this.nz) % this.nz,
      cb, cb, cb,
      indir
    );

    const used = this.slotsUsed;
    if (used > this.peakSlotsUsed) this.peakSlotsUsed = used;
  }

  /**
   * Classifica um brick do chunk e, se for misto, sobe os 512 ids para o atlas.
   * Devolve o texel de indirecao que o representa.
   */
  private publishBrick(
    blocks: Int16Array,
    lbx: number, lby: number, lbz: number,
    slots: Int32Array, local: number
  ): number {
    const s = this.chunkSize;
    const x0 = lbx * BRICK;
    const y0 = lby * BRICK;
    const z0 = lbz * BRICK;

    const staging = this.brickStaging;
    let airCount = 0;
    let firstId = -1;
    let uniform = true;
    let w = 0;

    for (let vz = 0; vz < BRICK; vz++) {
      const zBase = (z0 + vz) * s;
      for (let vy = 0; vy < BRICK; vy++) {
        // `blocks` e indexado [y][z][x]; o atlas e [z][y][x]. A conversao e aqui,
        // uma vez por voxel na carga, e nao no shader a cada passo do DDA.
        const rowBase = (y0 + vy) * s * s + zBase + x0;
        for (let vx = 0; vx < BRICK; vx++) {
          const b = blocks[rowBase + vx];
          if (b < 0) {
            airCount++;
            uniform = false;
            staging[w++] = AIR_TEXEL;
          } else {
            if (firstId === -1) firstId = b;
            else if (firstId !== b) uniform = false;
            staging[w++] = b;
          }
        }
      }
    }

    if (airCount === BRICK_VOXELS) {
      this.releaseSlot(slots, local);
      return TAG_EMPTY;
    }

    if (uniform) {
      this.releaseSlot(slots, local);
      return TAG_UNIFORM | (firstId & 0xff);
    }

    let slot = slots[local];
    if (slot < 0) {
      slot = this.acquireSlot();
      if (slot < 0) {
        // Atlas cheio. Degradar para solido uniforme e melhor que para ar: um buraco no
        // terreno deixa o jogador cair pelo mundo, uma mancha de pedra so fica feia.
        this.allocFailures++;
        return TAG_UNIFORM | ((firstId < 0 ? 0 : firstId) & 0xff);
      }
      slots[local] = slot;
    }

    this.atlas.writeBox(
      this.slotOriginX(slot), this.slotOriginY(slot), this.slotOriginZ(slot),
      BRICK, BRICK, BRICK,
      staging
    );
    return TAG_MIXED | slot;
  }

  private acquireSlot(): number {
    if (this.freeCount === 0) return -1;
    return this.freeSlots[--this.freeCount];
  }

  private releaseSlot(slots: Int32Array, local: number): void {
    const slot = slots[local];
    if (slot < 0) return;
    this.freeSlots[this.freeCount++] = slot;
    slots[local] = -1;
  }

  /** Devolve os slots do chunk e zera a regiao dele na indirecao. */
  public removeChunk(key: string, startX: number, startY: number, startZ: number): void {
    const slots = this.chunkSlots.get(key);
    if (!slots) return;

    for (let i = 0; i < slots.length; i++) this.releaseSlot(slots, i);
    this.chunkSlots.delete(key);

    if (!this.isAttached) return;

    const cb = this.chunkBricks;
    const w = this.worldVoxelsPerBrick;
    const b0x = Math.floor(startX / w);
    const b0y = Math.floor(startY / w);
    const b0z = Math.floor(startZ / w);

    this.chunkIndirStaging.fill(TAG_EMPTY);
    for (let lbz = 0; lbz < cb; lbz++) {
      for (let lby = 0; lby < cb; lby++) {
        for (let lbx = 0; lbx < cb; lbx++) {
          this.grid[this.gridIndex(b0x + lbx, b0y + lby, b0z + lbz)] = TAG_EMPTY;
        }
      }
    }

    this.indirection.writeBox(
      ((b0x % this.nx) + this.nx) % this.nx,
      ((b0y % this.ny) + this.ny) % this.ny,
      ((b0z % this.nz) + this.nz) % this.nz,
      cb, cb, cb,
      this.chunkIndirStaging
    );
  }

  /**
   * Republica UM brick depois de uma edicao de voxel.
   *
   * O caminho de edicao nao pode passar por `uploadChunk`: reclassificar os 64 bricks de um
   * chunk a cada voxel pintado e 32.768 leituras para mudar uma. Aqui sao 512.
   */
  public touchVoxel(
    key: string,
    startX: number, startY: number, startZ: number,
    blocks: Int16Array,
    vx: number, vy: number, vz: number
  ): void {
    if (!this.isAttached) return;
    const slots = this.chunkSlots.get(key);
    if (!slots) return;

    const cb = this.chunkBricks;
    const lbx = (vx / BRICK) | 0;
    const lby = (vy / BRICK) | 0;
    const lbz = (vz / BRICK) | 0;
    if (lbx < 0 || lbx >= cb || lby < 0 || lby >= cb || lbz < 0 || lbz >= cb) return;

    const local = (lbz * cb + lby) * cb + lbx;
    const value = this.publishBrick(blocks, lbx, lby, lbz, slots, local);

    const w = this.worldVoxelsPerBrick;
    const bx = Math.floor(startX / w) + lbx;
    const by = Math.floor(startY / w) + lby;
    const bz = Math.floor(startZ / w) + lbz;
    this.grid[this.gridIndex(bx, by, bz)] = value;

    this.oneTexel[0] = value;
    this.indirection.writeBox(
      ((bx % this.nx) + this.nx) % this.nx,
      ((by % this.ny) + this.ny) % this.ny,
      ((bz % this.nz) + this.nz) % this.nz,
      1, 1, 1,
      this.oneTexel
    );
  }

  public dispose(): void {
    this.indirection.dispose();
    this.atlas.dispose();
    this.chunkSlots.clear();
  }
}
