import type { ChunkContext, WorldGenerator } from '@voxel/engine/chunk-worker';
import { TinyBlockType } from '../blocks';

/**
 * Biomas.
 *
 * Eles escolhem MATERIAL e FLORA, e nao altura -- ver `macroSurface`. `AlpinePeaks` e o
 * unico que nao vem do clima: ele e decidido pela altitude, porque "montanha" e uma
 * propriedade do relevo, nao da temperatura, e um bioma alpino sorteado por clima num
 * terreno baixo so produz neve no meio da planicie.
 */
export enum BiomeType {
  SakuraSanctuary = 0,
  AlpinePeaks = 1,
  AutumnWoods = 3,
  VerdantValley = 4
}

/**
 * Relevo volumétrico em minivoxels com suporte a biomas ricos, árvores realistas
 * e cachoeiras naturais com nascentes perenes.
 *
 * Utiliza amostragem de densidade 3D com oitavas interpoladas via latice trilinear
 * e ruído de valor/hash para microdetalhes, garantindo 60 FPS com zero alocações por voxel.
 */
export class MicroTerrainGenerator implements WorldGenerator {
  public readonly id = 'micro_terrain';

  /* Altitudes em METROS (1 bloco = 1 m). Ver a convenção em config.ts. */
  /** Altura de referência do terreno. */
  private static readonly SURFACE = 64;
  /** Nível do mar. */
  private static readonly WATER = 58;
  /** Leito de rocha. */
  private static readonly BEDROCK = 0;
  /** Altura máxima que o relevo pode alcançar, em metros. Ver `macroSurface`. */
  private static readonly MAX_HEIGHT = 158;
  /** Acima desta altitude a superfície é alpina (rocha e neve). */
  private static readonly ALPINE_LINE = 105;
  /**
   * Em quantos blocos o gradiente vertical vai de 0 a 1.
   */
  private static readonly ROLLOFF = 1.6;
  /** Espessura da pele de superfície (grama / areia), em metros. */
  private static readonly SKIN = 0.45;
  /** Espaçamento da latice de interpolação, em voxels. */
  private static readonly LATTICE = 4;

  /**
   * Espessura das faixas geológicas enterradas, em voxels. Igual ao lado do brick do
   * renderizador (8), de propósito — ver a nota de coerência de brick em `material`.
   */
  private static readonly STRATUM = 8;

  /** Limite superior da amplitude do campo 3D. */
  private static readonly AMPLITUDE_SUM = 1.0 + 0.45 + 0.17 + 0.10 + 0.05;

  /** Quantos metros abaixo da superfície as cavernas começam a existir. */
  private static readonly CAVE_CEILING_MARGIN = 9;
  /** Espessura, em voxels, da casca de rocha que conta como "parede de caverna". */
  private static readonly CAVE_WALL_BAND = 0.09;

  private lattice = new Float32Array(0);
  private latticeN = 0;
  private columnSolid = new Uint8Array(0);

  /**
   * Campo de cavernas: três valores por ponto de latice (dois vermes + uma câmara).
   *
   * Separado do latice de relevo porque é amostrado em frequências muito mais baixas: um túnel
   * tem dezenas de blocos de comprimento, então interpolar de 4 em 4 voxels não perde nada e
   * evita 32.768 chamadas de ruído 3D por chunk.
   */
  private caveLattice = new Float32Array(0);
  private caveLatticeN = 0;
  /** Quanto o voxel está "escavado": > 0 é ar de caverna. Reusado por coluna. */
  private columnCarve = new Float32Array(0);
  /**
   * Quanto a coluna atual pertence à montanha (0 a 1), escrito por `macroSurface`.
   *
   * Campo em vez de retorno porque `macroSurface` é chamada uma vez por coluna, logo antes
   * do laço de Y que o consome — e devolver um par exigiria um objeto por coluna, que é
   * exatamente o tipo de alocação que este gerador evita.
   */
  private columnMountain = 0;

  public generate(ctx: ChunkContext): void {
    const { startX, endX, startY, endY, startZ, endZ } = ctx;
    const s = ctx.voxelsPerBlock;
    /**
     * Voxels de mundo por celula. 1 no campo proximo; 2, 4 ou 8 nos aneis de LOD.
     *
     * `size` e a dimensao do ARRAY e `size * k` e o alcance em MUNDO. Os dois eram a mesma
     * coisa enquanto so existia resolucao cheia, e e exatamente onde um chunk de LOD
     * quebraria em silencio se a distincao nao fosse feita.
     */
    const k = ctx.stride;
    const size = ctx.size;

    const waterY = Math.floor(MicroTerrainGenerator.WATER * s);
    const bedrockY = Math.floor(MicroTerrainGenerator.BEDROCK * s);
    const rolloff = MicroTerrainGenerator.ROLLOFF * s;
    // O gradiente e avaliado em voxels de MUNDO: o stride nao muda a espessura da casca.
    const invRolloff = 1 / rolloff;
    const band = MicroTerrainGenerator.AMPLITUDE_SUM;

    const maxSurface = MicroTerrainGenerator.MAX_HEIGHT * s + band * rolloff;
    if (startY > maxSurface && startY > waterY) return;
    if (endY <= bedrockY) {
      ctx.blocks.fill(TinyBlockType.DarkSlate);
      return;
    }

    this.buildLattice(ctx, size, s);
    this.buildCaveLattice(ctx, size, s);
    if (this.columnSolid.length < size + 2) this.columnSolid = new Uint8Array(size + 2);
    if (this.columnCarve.length < size + 2) this.columnCarve = new Float32Array(size + 2);
    const solid = this.columnSolid;
    const carve = this.columnCarve;

    const caveTop = MicroTerrainGenerator.CAVE_CEILING_MARGIN * s;
    const caveFloor = bedrockY + s;

    const strataScale = 1 / (12 * s);

    for (let lx = 0; lx < size; lx++) {
      const x = startX + lx * k;
      const bx = x / s;

      for (let lz = 0; lz < size; lz++) {
        const z = startZ + lz * k;
        const bz = z / s;

        // Amostragem de clima 2D por coluna (baratíssimo: < 0.2ms total por chunk)
        // Frequencias em METROS: o bioma troca a cada ~550 m e o rio aparece a cada ~250 m.
        // Eram 143 m e 71 m, herdados de quando um "bloco" nao valia um metro -- a 64 m de
        // visao isso punha duas trocas de bioma dentro do campo de visao.
        const temp = ctx.simplex.noise((bx + 260) * 0.0018, (bz + 260) * 0.0018);
        const moist = ctx.simplex.noise((bx - 320) * 0.0016, (bz + 580) * 0.0016);
        const riverNoise = Math.abs(ctx.simplex.noise(bx * 0.004, bz * 0.004));
        // A superfície vem antes do bioma: o bioma alpino é escolhido pela altitude.
        const surfaceBlocks = this.macroSurface(ctx, bx, bz, riverNoise);
        const biome = this.getBiome(temp, moist, surfaceBlocks);

        const macroY = surfaceBlocks * s;
        const strata = ctx.simplex.noise(x * strataScale, z * strataScale);

        /**
         * Peso do campo de densidade 3D nesta coluna: quase nada na planicie, cheio na
         * montanha.
         *
         * O campo 3D e o que permite saliencia, arco e parede negativa -- coisas que um
         * campo de altura nao consegue, e a razao de o gerador nao ser um heightmap. Mas a
         * amplitude dele era 1,62 com periodos de 1 a 4 metros, e como a superficie fica
         * onde a densidade cruza zero, isso deslocava o chao em **+/- 2,6 m a cada poucos
         * metros**. Numa planicie o resultado nao e relevo, e entulho: o terreno vira um
         * campo de blocos irregulares, e voxel mais fino so renderiza o entulho com mais
         * nitidez.
         *
         * `macroSurface` ja calcula o quanto a coluna pertence a montanha; aqui esse mesmo
         * numero decide quanto do campo 3D entra. Planicie fica plana por construcao, e a
         * serra mantem o caráter volumetrico.
         */
        const relief = 0.04 + 0.70 * this.columnMountain;

        for (let i = 0; i <= size; i++) {
          const y = startY + i * k;
          carve[i] = -1;
          if (y < bedrockY) { solid[i] = 1; continue; }

          const gradient = (macroY - y) * invRolloff;
          const far = gradient > band ? 1 : gradient < -band ? -1 : 0;

          if (far < 0) { solid[i] = 0; continue; }

          if (far > 0) {
            solid[i] = 1;
          } else {
            // O campo 3D so tem forca onde o relevo e acidentado. Ver `relief` abaixo.
            const d = gradient
              + this.sampleLattice(lx, i, lz) * relief
              + (valueNoise(x, y, z, 2) - 0.5) * 0.05
              + (valueNoise(x, y, z, 1) - 0.5) * 0.03
              + (hash3(x, y, z) - 0.5) * 0.02;
            solid[i] = d > 0 ? 1 : 0;
          }

          // Cavernas só existem abaixo da casca de superfície e acima do leito de rocha.
          // Sem o teto, um túnel que aflora vira uma cratera e o jogador cai no mundo logo
          // ao nascer; sem o piso, a base do mundo vira queijo e não há chão nenhum.
          if (solid[i] === 1 && y < macroY - caveTop && y > caveFloor) {
            const c = this.sampleCave(lx, i, lz);
            carve[i] = c;
            if (c > 0) solid[i] = 0;
          }
        }

        let depth = solid[size] ? Math.max(1, Math.floor(macroY) - endY + 1) : 0;

        for (let i = size - 1; i >= 0; i--) {
          const y = startY + i * k;
          if (!solid[i]) {
            depth = 0;
            // Caverna não enche de água: só a bacia de superfície, acima do nível do mar e
            // fora de qualquer vazio escavado.
            if (y <= waterY && carve[i] <= 0) ctx.setBlock(x, y, z, TinyBlockType.ClearWater);
            continue;
          }

          // Parede de caverna: o voxel é sólido mas o campo de escavação quase o pegou, o que
          // é verdade na mesma medida no teto, no piso e nas laterais. Detectar pela coluna
          // (ar logo acima / logo abaixo) só acharia teto e piso, e as paredes laterais --
          // que são a maior parte do que se vê de dentro de um túnel -- ficariam de fora.
          const wall = carve[i] > -MicroTerrainGenerator.CAVE_WALL_BAND && y < macroY - caveTop;

          ctx.setBlock(x, y, z, wall
            ? this.caveMaterial(x, y, z, i, solid, size, s, biome)
            : this.material(x, y, z, depth * k, strata, waterY, bedrockY, s, biome));
          depth++;
        }

        // Flora & Cachoeiras: decididas por coluna de METRO, e so em resolucao cheia --
        // num chunk de LOD a copa de uma arvore nao chega a uma celula de diametro.
        if (k === 1 && x % s === 0 && z % s === 0) {
          this.scatterFlora(ctx, x, z, startY, endY, waterY, solid, size, s, biome, macroY);
        }
      }
    }
  }

  // ─── Biomas & Superfície Macro ──────────────────────────────────────────────

  /**
   * Bioma de uma coluna. Escolhe material e flora; NAO escolhe altura.
   *
   * O alpino vem da altitude, nao do clima: montanha e propriedade do relevo. Com ele
   * sorteado por temperatura, como era antes, nascia neve no meio da planicie e campo
   * florido no topo do pico.
   */
  private getBiome(temp: number, moist: number, surfaceBlocks: number): BiomeType {
    if (surfaceBlocks > MicroTerrainGenerator.ALPINE_LINE) return BiomeType.AlpinePeaks;
    if (temp > 0.06 && moist > 0.08) return BiomeType.SakuraSanctuary;
    if (moist < -0.05) return BiomeType.AutumnWoods;
    return BiomeType.VerdantValley;
  }

  /**
   * Altura da superficie, em blocos.
   *
   * ## Por que a altura nao vem mais do bioma
   *
   * A versao anterior escolhia um bioma discreto e cada bioma tinha a SUA formula de altura:
   * vale verdejante em `14.5 + ruido*4.5`, pico alpino em `18 + cume*8 + ...`. Nas duas
   * colunas vizinhas onde a temperatura cruzava o limiar, a altura saltava de uma formula
   * para a outra de uma vez. Medido numa transecta de 220 blocos: degrau de **255 voxels (8
   * blocos) entre colunas adjacentes** -- uma parede vertical sem nenhuma extensao
   * horizontal. Era a origem dos paredoes, e nenhum ajuste de ruido ia consertar, porque o
   * problema era a descontinuidade, nao a amplitude.
   *
   * Agora a altura vem de campos CONTINUOS que nao sabem o que e um bioma:
   *
   *   continentalidade  onde o terreno e baixo ou alto, em escala de ~200 blocos
   *   erosao            o quanto aquela regiao e plana ou acidentada
   *   cume              o perfil afiado que vira montanha, pesado pela erosao
   *
   * Uma planicie e continentalidade baixa com erosao alta; uma serra e o contrario. Como
   * tudo e interpolado, nao existe fronteira onde saltar. O bioma le o resultado -- acima da
   * linha alpina e montanha -- em vez de ditar.
   *
   * O bioma de canyon (mesas em degraus via `Math.floor`) foi removido: ele produzia
   * terracos verticais de 2 blocos por construcao, que e a mesma parede por outro caminho.
   */
  private macroSurface(ctx: ChunkContext, bx: number, bz: number, riverNoise: number): number {
    // Todas as frequencias sao por METRO e todas as amplitudes estao em metros.
    //
    // Continentalidade: a forma larga do terreno, em escala de ~700 m.
    const cont =
      ctx.simplex.noise(bx * 0.0014, bz * 0.0014) +
      ctx.simplex.noise(bx * 0.0035, bz * 0.0035) * 0.45;

    // Erosao: positivo = regiao gasta e plana, negativo = regiao acidentada.
    const ero = ctx.simplex.noise((bx + 910) * 0.0022, (bz - 430) * 0.0022);

    // Detalhe, para a superficie nao ficar lisa de plastico.
    const det =
      ctx.simplex.noise((bx - 320) * 0.012, (bz + 760) * 0.012) * 0.6 +
      ctx.simplex.noise((bx + 140) * 0.035, (bz - 90) * 0.035) * 0.25;

    // Quanto esta coluna pertence a montanha, de 0 a 1, suave nas duas pontas.
    const mountain = smoothstep(0.08, 0.62, cont * 0.62 - ero * 0.45);
    this.columnMountain = mountain;

    // Base: a planicie. Varia pouco, que e o que faz "planicie coerente". O centro fica
    // 4 m acima do nivel do mar, nao em cima dele, para a terra firme nascer seca.
    const base = 62.0 + cont * 13.0;

    // Cume: o valor absoluto invertido do ruido da a crista afiada. Multiplicado pela
    // montanha, ele simplesmente nao existe na planicie, em vez de ser cortado por um
    // limiar (o corte seria, de novo, uma parede).
    const ridge = 1.0 - Math.abs(ctx.simplex.noise(bx * 0.0055, bz * 0.0055));
    const peaks = ridge * ridge * 68.0 * mountain;

    // O relevo fino acompanha o terreno: planicie quase lisa, encosta rugosa.
    const rough = det * (1.6 + 7.0 * mountain);

    let surf = base + peaks + rough;

    // ── Rios ────────────────────────────────────────────────────────────────
    // O leito e interpolado numa faixa larga e some na montanha. Antes, o rio forcava a
    // coluna para `WATER - 0.8` dentro de uma faixa estreita, sem olhar a altura em volta:
    // num terreno a 25 blocos isso abria uma fenda vertical de 14 blocos -- as rachaduras
    // que apareciam no perfil. Rio e um vale, nao um corte.
    const riverW = 1.0 - smoothstep(0.012, 0.075, riverNoise);
    const carve = riverW * (1.0 - mountain);
    if (carve > 0.001) {
      const bed = Math.min(surf - 1.5, MicroTerrainGenerator.WATER - 1.5);
      surf = surf + (bed - surf) * carve;
    }

    return surf;
  }

  // ─── Latice de Interpolação 3D ─────────────────────────────────────────────

  private buildLattice(ctx: ChunkContext, size: number, s: number): void {
    const step = MicroTerrainGenerator.LATTICE;
    const k = ctx.stride;
    const n = size / step + 1;
    if (this.latticeN !== n) {
      this.lattice = new Float32Array(n * n * n);
      this.latticeN = n;
    }
    const lat = this.lattice;

    // Periodos em METROS: 22, 9 e 4. Eram 4, 1,5 e 1 -- numeros de quando um "bloco" nao
    // valia um metro. Ver a nota de amplitude em `generate`.
    const f1 = 1 / (22.0 * s);
    const f2 = 1 / (9.0 * s);
    const f3 = 1 / (4.0 * s);

    let i = 0;
    for (let ly = 0; ly < n; ly++) {
      const wy = ctx.startY + ly * step * k;
      for (let lz = 0; lz < n; lz++) {
        const wz = ctx.startZ + lz * step * k;
        for (let lx = 0; lx < n; lx++) {
          const wx = ctx.startX + lx * step * k;
          lat[i++] =
            ctx.simplex.noise3d(wx * f1, wy * f1, wz * f1) * 1.0 +
            ctx.simplex.noise3d(wx * f2, wy * f2, wz * f2) * 0.45 +
            ctx.simplex.noise3d(wx * f3, wy * f3, wz * f3) * 0.17;
        }
      }
    }
  }

  private sampleLattice(lx: number, ly: number, lz: number): number {
    const step = MicroTerrainGenerator.LATTICE;
    const n = this.latticeN;
    const lat = this.lattice;

    const fx = lx / step, fy = ly / step, fz = lz / step;
    let ix = fx | 0, iy = fy | 0, iz = fz | 0;
    if (ix > n - 2) ix = n - 2;
    if (iy > n - 2) iy = n - 2;
    if (iz > n - 2) iz = n - 2;
    const tx = fx - ix, ty = fy - iy, tz = fz - iz;

    const rowY = iy * n * n;
    const o00 = rowY + iz * n + ix;
    const o01 = rowY + (iz + 1) * n + ix;
    const o10 = o00 + n * n;
    const o11 = o01 + n * n;

    const a = lat[o00], b = lat[o00 + 1];
    const c = lat[o01], d = lat[o01 + 1];
    const e = lat[o10], f = lat[o10 + 1];
    const g = lat[o11], h = lat[o11 + 1];

    const x0 = a + (b - a) * tx, x1 = c + (d - c) * tx;
    const x2 = e + (f - e) * tx, x3 = g + (h - g) * tx;
    const y0 = x0 + (x1 - x0) * tz, y1 = x2 + (x3 - x2) * tz;
    return y0 + (y1 - y0) * ty;
  }

  // ─── Campo de Cavernas ─────────────────────────────────────────────────────

  /**
   * Latice do campo de cavernas: dois ruídos de "verme" e um de câmara, por ponto.
   *
   * Os dois primeiros não são duas cavernas: são duas superfícies de nível independentes cuja
   * INTERSEÇÃO é uma curva unidimensional. Escavar onde `n1² + n2²` é pequeno abre um tubo em
   * volta dessa curva — um túnel que serpenteia de verdade, em vez do queijo suíço que sai de
   * limiarizar um único ruído 3D. É o que faz a geometria da cena de referência: corredor
   * estreito, sinuoso, que abre numa câmara.
   *
   * O terceiro ruído é a câmara: baixa frequência, limiar alto, e achatado em Y para que as
   * salas fiquem mais largas que altas, como caverna real.
   */
  private buildCaveLattice(ctx: ChunkContext, size: number, s: number): void {
    const step = MicroTerrainGenerator.LATTICE;
    const k = ctx.stride;
    const n = size / step + 1;
    if (this.caveLatticeN !== n) {
      this.caveLattice = new Float32Array(n * n * n * 3);
      this.caveLatticeN = n;
    }
    const lat = this.caveLattice;

    const fw = 1 / (26 * s);
    const fc = 1 / (46 * s);
    // Câmaras achatadas: amostrar Y numa frequência maior encolhe a feição nesse eixo.
    const fcY = fc * 2.1;

    let i = 0;
    for (let ly = 0; ly < n; ly++) {
      const wy = ctx.startY + ly * step * k;
      for (let lz = 0; lz < n; lz++) {
        const wz = ctx.startZ + lz * step * k;
        for (let lx = 0; lx < n; lx++) {
          const wx = ctx.startX + lx * step * k;
          lat[i++] = ctx.simplex.noise3d(wx * fw, wy * fw, wz * fw);
          lat[i++] = ctx.simplex.noise3d((wx + 911) * fw, (wy - 417) * fw, (wz + 233) * fw);
          lat[i++] = ctx.simplex.noise3d((wx - 2200) * fc, wy * fcY, (wz + 1700) * fc);
        }
      }
    }
  }

  /**
   * Raio do tubo escavado em volta da curva dos dois vermes.
   *
   * Calibrado contra o corte vertical: 0,085 dava 1,4% do subsolo escavado, o que significa
   * um mundo onde o jogador quase nunca encontra uma caverna. 0,15 põe isso na casa dos 12%,
   * que é a densidade em que se anda de túnel em túnel sem que a rocha vire queijo.
   */
  private static readonly WORM_RADIUS = 0.15;
  /** Limiar acima do qual o ruído de câmara abre uma sala. */
  private static readonly CHAMBER_THRESHOLD = 0.50;

  /**
   * Quanto o voxel está escavado. Positivo é ar de caverna; perto de zero é parede.
   *
   * Os componentes são interpolados ANTES de virar distância. Interpolar a distância já
   * pronta arredondaria a quina do túnel para dentro e deixaria a parede com degraus de 4
   * voxels — exatamente o artefato que o latice existe para não ter.
   */
  private sampleCave(lx: number, ly: number, lz: number): number {
    const step = MicroTerrainGenerator.LATTICE;
    const n = this.caveLatticeN;
    const lat = this.caveLattice;

    const fx = lx / step, fy = ly / step, fz = lz / step;
    let ix = fx | 0, iy = fy | 0, iz = fz | 0;
    if (ix > n - 2) ix = n - 2;
    if (iy > n - 2) iy = n - 2;
    if (iz > n - 2) iz = n - 2;
    const tx = fx - ix, ty = fy - iy, tz = fz - iz;

    const rowY = iy * n * n;
    const o00 = (rowY + iz * n + ix) * 3;
    const o01 = (rowY + (iz + 1) * n + ix) * 3;
    const o10 = o00 + n * n * 3;
    const o11 = o01 + n * n * 3;

    let worm1 = 0, worm2 = 0, chamber = 0;
    for (let c = 0; c < 3; c++) {
      const a = lat[o00 + c], b = lat[o00 + 3 + c];
      const d = lat[o01 + c], e = lat[o01 + 3 + c];
      const f = lat[o10 + c], g = lat[o10 + 3 + c];
      const h = lat[o11 + c], k = lat[o11 + 3 + c];

      const x0 = a + (b - a) * tx, x1 = d + (e - d) * tx;
      const x2 = f + (g - f) * tx, x3 = h + (k - h) * tx;
      const y0 = x0 + (x1 - x0) * tz, y1 = x2 + (x3 - x2) * tz;
      const v = y0 + (y1 - y0) * ty;

      if (c === 0) worm1 = v;
      else if (c === 1) worm2 = v;
      else chamber = v;
    }

    const tunnel = MicroTerrainGenerator.WORM_RADIUS - Math.sqrt(worm1 * worm1 + worm2 * worm2);
    const room = (chamber - MicroTerrainGenerator.CHAMBER_THRESHOLD) * 0.8;
    return tunnel > room ? tunnel : room;
  }

  /**
   * Material de uma parede de caverna.
   *
   * É aqui que a cena de referência acontece. O teto recebe musgo denso com gemas de esmeralda
   * esparsas — é delas que vem o verde que lava a parede de cima, porque no raymarch cada voxel
   * emissivo entra na lista de luzes e ilumina de verdade os vizinhos. Veios de neon ciano
   * aparecem em bolsões, e são eles que fazem o azul do fundo. A lanterna quente é rara de
   * propósito: uma por caverna é o que dá o ponto branco estourado, duas viram discoteca.
   */
  private caveMaterial(
    x: number, y: number, z: number,
    i: number, solid: Uint8Array, size: number,
    s: number, biome: BiomeType
  ): number {
    const speck = hash3(x, y, z);
    const depthBlocks = y / s;

    // Aglomerados de cristal, em dois níveis.
    //
    // O nível de fora é um hash por região de 128 voxels (4 blocos): ou a região tem veio,
    // ou não tem. O de dentro é `valueNoise` grosso, que recorta o veio dentro da região.
    // Um sorteio só, por voxel, espalharia cristal isolado por toda parede de caverna do
    // mundo — e como cada voxel emissivo vira luz, isso é ao mesmo tempo feio e caro.
    // É a diferença entre "uma gruta de cristal no fim do túnel" e "purpurina".
    const pocket = hash3(x >> 7, y >> 7, z >> 7);

    if (pocket > 0.93) {
      // Celula de 16 voxels (meio bloco), nao de 32: com `valueNoise(.,5)` o veio saia em
      // manchas do tamanho de um bloco inteiro e, dentro de um bolsao, cobria a parede toda.
      // A camera nascida na camara mais rica media uma PAREDE de neon, nao um aglomerado.
      const vein = valueNoise(x, y, z, 4);
      if (vein > 0.86) {
        // A lanterna quente é uma por bolsão raro: é ela que dá o ponto branco estourado
        // da cena. Duas na mesma caverna viram discoteca.
        if (pocket > 0.985 && vein > 0.90) return TinyBlockType.WarmLantern;
        return depthBlocks < 6 ? TinyBlockType.AmethystViolet : TinyBlockType.NeonCyan;
      }
      // Lápis-lazúli é a auréola escura do veio, não um material de parede. Espalhado
      // largo ele pinta a caverna inteira de azul-marinho, e o azul deixa de significar
      // "aqui tem cristal".
      if (vein > 0.80) return TinyBlockType.LapisAzure;
    }

    // Teto: ar logo acima na coluna. `solid` tem size+1 posições, então i+1 é sempre válido.
    const ceiling = solid[i + 1] === 0;

    if (ceiling || speck > 0.86) {
      const mossy = valueNoise(x, y, z, 4);
      if (mossy > 0.58) {
        // A esmeralda no musgo é o que lava o teto de verde na cena de referência. Presa
        // ao mesmo bolsão do cristal para que o verde venha em manchas, e não pontilhado.
        if (pocket > 0.80 && speck > 0.985) return TinyBlockType.EmeraldGem;
        return valueNoise(x, y, z, 2) > 0.48 ? TinyBlockType.Moss : TinyBlockType.PineEmerald;
      }
    }

    // Rocha da parede: o marrom-areia da imagem, com variação forte de voxel para voxel.
    // O `voxelGrain` do renderizador multiplica isso; sem a variação de MATERIAL por baixo,
    // o grão sozinho vira ruído monocromático.
    // Rocha da parede.
    //
    // A escolha é por MANCHA, não por voxel. Com `hash3` por voxel, Solo Fértil (#4E3629) e
    // Arenito (#D8B17A) se alternam a cada voxel -- um salto de 3x em luminância entre
    // vizinhos -- e a parede lê como chuvisco de TV, não como rocha. `valueNoise(.,2)` tem
    // célula de 4 voxels, então o material vem em placas pequenas e a variação fina fica por
    // conta do `voxelGrain` do renderizador, que é exatamente para isso.
    //
    // Argila (#8C969E) saiu da mistura: é um cinza-azulado frio, e com um terço da parede
    // feita dela a caverna inteira puxava para o azul, brigando com a única coisa que
    // deveria ser azul ali (o cristal).
    const patch = valueNoise(x, y, z, 2);

    if (depthBlocks < 25) {
      return patch > 0.62 ? TinyBlockType.Basalt
        : patch > 0.38 ? TinyBlockType.DarkSlate : TinyBlockType.Granite;
    }
    return patch > 0.46 ? TinyBlockType.RichSoil
      : patch > 0.26 ? TinyBlockType.Sandstone : TinyBlockType.Terracotta;
  }

  // ─── Materiais por Bioma ───────────────────────────────────────────────────

  /**
   * Material da rocha que NÃO é parede de caverna: pele de superfície e tudo o que está
   * enterrado atrás dela.
   *
   * ## Coerência de brick
   *
   * O renderizador guarda os voxels num atlas esparso de bricks de 8³ e só gasta memória com
   * brick MISTO: um brick de um único bloco cabe em 4 bytes, contra 512. Toda a economia do
   * brickmap depende disso.
   *
   * Então variar o material VOXEL A VOXEL dentro de rocha maciça não é decoração barata — é o
   * maior consumidor de memória do mundo. Medido: um `hash3(x, y, z)` escolhendo entre Basalto
   * e Ardósia nas camadas profundas tornava **todo** brick de rocha misto, e a rocha profunda
   * passava a custar 45 a 62 slots por chunk contra 9 a 20 perto da superfície. Com raio 14 e
   * só 6 chunks de alcance vertical, a visão pedia 230.000 slots — mais do que o atlas inteiro.
   * Era o que limitava a profundidade de carregamento, e não tinha nada a ver com o renderizador.
   *
   * Por isso, daqui para baixo da pele a variação é por BRICK (`brickHash`, `brickValueNoise`)
   * ou em faixas de espessura múltipla de `STRATUM`. Nada disso se vê sem cavar, e no instante
   * em que alguém cava, o chunk é republicado e o brick vira misto de qualquer forma —
   * pagando o slot só quando ele passa a ser visível.
   *
   * A parede de caverna é o oposto e tem a sua própria função (`caveMaterial`): ela é a
   * superfície que o jogador de fato enxerga, então ali a variação fina vale cada byte.
   */
  private material(
    x: number, y: number, z: number,
    depthVoxels: number, strata: number,
    waterY: number, bedrockY: number,
    s: number, biome: BiomeType
  ): number {
    if (y < bedrockY + s) return TinyBlockType.DarkSlate;

    const depth = depthVoxels / s;

    // Veios de cristal dentro da rocha.
    //
    // A regra antiga era `valueNoise(.,3) > 0.82`, que transformava 18% de TODO voxel
    // profundo em gema. Num mundo de blocos grandes isso passava por "pedrinha colorida";
    // a 32 voxels por bloco são milhares de gemas por chunk, e cada uma é uma fonte de luz
    // em potencial. Agora o sorteio é em dois níveis: um bolsão a cada ~16 regiões de 4
    // blocos, e dentro dele um veio. O cristal volta a ser achado, não cenário.
    if (depth > 0.4 && hash3(x >> 7, y >> 7, z >> 7) > 0.94 && brickValueNoise(x, y, z, 1) > 0.72) {
      if (biome === BiomeType.AlpinePeaks) return TinyBlockType.EmeraldGem;
      return y < 45 * s ? TinyBlockType.AmethystViolet : TinyBlockType.NeonCyan;
    }

    const speck = hash3(x, y, z);

    // ── Pele de Superfície (depth < SKIN) ──
    if (depth < MicroTerrainGenerator.SKIN) {
      if (y < waterY + 2 * s) return TinyBlockType.Sandstone;

      switch (biome) {
        case BiomeType.AlpinePeaks: {
          // Os limiares sao relativos a linha alpina, nao absolutos. Fixos em 20 e 16
          // blocos eles ficavam ABAIXO da propria linha (23), entao todo pico caia no
          // primeiro ramo e a serra inteira saia de neve lisa.
          const above = y / s - MicroTerrainGenerator.ALPINE_LINE;
          if (above > 22) return TinyBlockType.Marble;                       // neve
          if (above > 9) return speck > 0.45 ? TinyBlockType.Granite : TinyBlockType.Marble;
          if (above > 0) return speck > 0.35 ? TinyBlockType.Granite : TinyBlockType.Moss;
          return speck > 0.6 ? TinyBlockType.Moss : TinyBlockType.Granite;
        }

        case BiomeType.SakuraSanctuary:
          // Grama vívida com pétalas de cerejeira e musgo
          if (speck > 0.88) return TinyBlockType.SakuraBlossom;
          return speck > 0.45 ? TinyBlockType.LushGrass : TinyBlockType.Moss;

        case BiomeType.AutumnWoods:
          // Chão outonal com folhas douradas e solo fértil
          if (speck > 0.85) return TinyBlockType.AutumnAmber;
          return speck > 0.5 ? TinyBlockType.RichSoil : TinyBlockType.Moss;

        case BiomeType.VerdantValley:
        default:
          return speck > 0.5 ? TinyBlockType.LushGrass : TinyBlockType.Moss;
      }
    }

    // ── Subsuperfície Rasa: 1,5 m de solo sob a pele ──
    if (depth < 1.5) {
      if (y < waterY + 2 * s) return TinyBlockType.Sandstone;
      if (biome === BiomeType.AlpinePeaks) return TinyBlockType.Granite;
      return TinyBlockType.RichSoil;
    }

    // ── Estratos Geológicos Intermediários: 12 m de rocha sedimentar ──
    //
    // As faixas têm espessura múltipla de STRATUM, não 0.34 ou 0.35 de bloco. Ver a nota
    // sobre coerência de brick no topo de `material`.
    if (depth < 12) {
      return Math.floor(y / MicroTerrainGenerator.STRATUM) % 3 === 0
        ? TinyBlockType.Terracotta : TinyBlockType.Sandstone;
    }

    // ── Camadas Profundas ──
    //
    // O salpico é por BRICK, não por voxel: `hash3(x, y, z)` aqui era o maior consumidor de
    // memória do mundo inteiro. Ver a nota no topo de `material`.
    if (y > 25 * s) {
      return Math.floor(y / (2 * MicroTerrainGenerator.STRATUM)) % 3 === 0
        ? TinyBlockType.Granite : TinyBlockType.Clay;
    }
    return brickHash(x, y, z) > 0.86 ? TinyBlockType.Basalt : TinyBlockType.DarkSlate;
  }

  // ─── Flora & Cachoeiras Naturais ───────────────────────────────────────────

  private scatterFlora(
    ctx: ChunkContext,
    x: number, z: number,
    startY: number, endY: number, waterY: number,
    solid: Uint8Array, size: number,
    s: number, biome: BiomeType, macroY: number
  ): void {
    let topY = -1;
    for (let i = size - 1; i >= 0; i--) {
      const above = i + 1 > size - 1 ? solid[size] : solid[i + 1];
      if (solid[i] && !above) { topY = startY + i; break; }
    }
    if (topY < 0 || topY <= waterY || topY + 1 >= endY) return;

    // ── Cachoeiras Naturais & Nascentes de Montanha ──
    // Em terreno alpino elevado (cliff edges), cria nascentes perenes
    if (biome === BiomeType.AlpinePeaks && topY > waterY + 30 * s) {
      const springHash = hash3(x, 0, z);
      if (springHash > 0.982) {
        // Coloca a nascente no penhasco e água fluida na frente para saltar na queda d'água
        ctx.setBlock(x, topY, z, TinyBlockType.WaterSpring);
        // Cria nicho de pedra e vertente de água
        const r = Math.max(1, Math.round(s * 1.2));
        for (let dx = -r; dx <= r; dx++) {
          for (let dz = -r; dz <= r; dz++) {
            if (dx === 0 && dz === 0) continue;
            if (dx * dx + dz * dz <= r * r) {
              const cur = ctx.getBlock(x + dx, topY, z + dz);
              if (cur === -1 || cur === TinyBlockType.ClearWater) {
                ctx.setBlock(x + dx, topY, z + dz, TinyBlockType.ClearWater);
              }
            }
          }
        }
        return;
      }
    }

    const seed = Math.abs(Math.sin(x * 12.9898 + z * 78.233) * 43758.5453) % 1;

    switch (biome) {
      case BiomeType.SakuraSanctuary: {
        // Árvores de Sakura com copas em nuvens rosadas
        if (seed > 0.991) {
          this.growSakuraTree(ctx, x, topY + 1, z, seed, s);
          return;
        }
        // Campos de Lavanda e flores silvestres
        if (seed > 0.90) {
          const flower = seed > 0.86 ? TinyBlockType.SakuraBlossom : TinyBlockType.LavenderFlower;
          this.scatterFlowerPatch(ctx, x, topY + 1, z, flower, s);
        }
        break;
      }

      case BiomeType.AlpinePeaks: {
        // Pinheiros Alpinos / Taiga cônicos
        if (seed > 0.991 && topY < 112 * s) {
          this.growPineTree(ctx, x, topY + 1, z, seed, s);
          return;
        }
        // Boulders rochosos e musgo
        if (seed > 0.975 && topY < 100 * s) {
          this.scatterBoulder(ctx, x, topY + 1, z, s);
        }
        break;
      }

      case BiomeType.AutumnWoods: {
        // Árvores outonais com folhagem dourada
        if (seed > 0.990) {
          this.growAutumnTree(ctx, x, topY + 1, z, seed, s);
          return;
        }
        // Folhas outonais e cogumelos
        if (seed > 0.92) {
          this.scatterFlowerPatch(ctx, x, topY + 1, z, TinyBlockType.AutumnAmber, s);
        }
        break;
      }

      case BiomeType.VerdantValley:
      default: {
        // Carvalhos verdejantes amplos
        if (seed > 0.990) {
          this.growOakTree(ctx, x, topY + 1, z, seed, s);
          return;
        }
        if (seed > 0.93) {
          this.scatterFlowerPatch(ctx, x, topY + 1, z, TinyBlockType.LavenderFlower, s);
        }
        break;
      }
    }
  }

  // ─── Algoritmos de Árvores por Bioma ────────────────────────────────────────

  /**
   * Pinheiro Taiga Cônico: tronco reto de DeepOak e copa cônica em camadas de PineEmerald.
   */
  private growPineTree(ctx: ChunkContext, rootX: number, rootY: number, rootZ: number, seed: number, s: number): void {
    const trunkH = Math.round((12.0 + ((seed * 100) % 5.0)) * s);
    const trunkR = Math.max(1, Math.round(s * 0.32));

    // Tronco
    for (let ty = 0; ty < trunkH; ty++) {
      for (let dx = -trunkR; dx <= trunkR; dx++) {
        for (let dz = -trunkR; dz <= trunkR; dz++) {
          if (dx * dx + dz * dz <= (trunkR + 0.4) * (trunkR + 0.4)) {
            ctx.setBlock(rootX + dx, rootY + ty, rootZ + dz, TinyBlockType.DeepOak);
          }
        }
      }
    }

    // Folhagem cônica em tiers
    const foliageStart = Math.round(trunkH * 0.28);
    const foliageH = trunkH - foliageStart + Math.round(3.0 * s);
    const baseR = Math.round(3.4 * s);

    for (let dy = 0; dy <= foliageH; dy++) {
      const progress = dy / foliageH; // 0 na base, 1 no topo
      // Tapering cônico com relevo por camadas
      const tierMod = 0.8 + 0.2 * Math.sin(progress * Math.PI * 6);
      const tierR = Math.max(0.5, (1.0 - progress) * baseR * tierMod);
      const rSq = tierR * tierR;
      const py = rootY + foliageStart + dy;

      const ceilR = Math.ceil(tierR);
      for (let dx = -ceilR; dx <= ceilR; dx++) {
        for (let dz = -ceilR; dz <= ceilR; dz++) {
          if (dx * dx + dz * dz <= rSq) {
            if (ctx.getBlock(rootX + dx, py, rootZ + dz) === -1) {
              ctx.setBlock(rootX + dx, py, rootZ + dz, TinyBlockType.PineEmerald);
            }
          }
        }
      }
    }
  }

  /**
   * Cerejeira Japonesa (Sakura): tronco de BirchBark e copa em múltiplos lóbulos de nuvem (SakuraBlossom).
   */
  private growSakuraTree(ctx: ChunkContext, rootX: number, rootY: number, rootZ: number, seed: number, s: number): void {
    const trunkH = Math.round((7.0 + ((seed * 50) % 3.0)) * s);
    const trunkR = Math.max(1, Math.round(s * 0.28));

    // Tronco elegante
    for (let ty = 0; ty < trunkH; ty++) {
      for (let dx = -trunkR; dx <= trunkR; dx++) {
        for (let dz = -trunkR; dz <= trunkR; dz++) {
          if (dx * dx + dz * dz <= (trunkR + 0.4) * (trunkR + 0.4)) {
            ctx.setBlock(rootX + dx, rootY + ty, rootZ + dz, TinyBlockType.BirchBark);
          }
        }
      }
    }

    const crownY = rootY + trunkH;
    // 3 nuvens de flores: uma central e duas deslocadas
    const clouds = [
      { ox: 0, oy: 0, oz: 0, r: Math.round(3.4 * s) },
      { ox: Math.round(2.0 * s), oy: Math.round(-0.8 * s), oz: Math.round(1.6 * s), r: Math.round(2.6 * s) },
      { ox: Math.round(-1.6 * s), oy: Math.round(-0.6 * s), oz: Math.round(-1.6 * s), r: Math.round(2.8 * s) }
    ];

    for (const c of clouds) {
      const cx = rootX + c.ox;
      const cy = crownY + c.oy;
      const cz = rootZ + c.oz;
      const r = c.r;
      const rSq = r * r;

      for (let dx = -r; dx <= r; dx++) {
        for (let dz = -r; dz <= r; dz++) {
          const horiz = dx * dx + dz * dz;
          if (horiz > rSq) continue;

          const span = Math.sqrt((rSq - horiz) / 1.4);
          const dyMin = Math.ceil(-span * 0.6);
          const dyMax = Math.floor(span);

          for (let dy = dyMin; dy <= dyMax; dy++) {
            if (ctx.getBlock(cx + dx, cy + dy, cz + dz) === -1) {
              ctx.setBlock(cx + dx, cy + dy, cz + dz, TinyBlockType.SakuraBlossom);
            }
          }
        }
      }
    }
  }

  /**
   * Carvalho Outonal: folhagem dourada e alaranjada vibrante (AutumnAmber) com copa ampla.
   */
  private growAutumnTree(ctx: ChunkContext, rootX: number, rootY: number, rootZ: number, seed: number, s: number): void {
    const trunkH = Math.round((8.0 + ((seed * 80) % 3.0)) * s);
    const trunkR = Math.max(1, Math.round(s * 0.28));

    for (let ty = 0; ty < trunkH; ty++) {
      for (let dx = -trunkR; dx <= trunkR; dx++) {
        for (let dz = -trunkR; dz <= trunkR; dz++) {
          if (dx * dx + dz * dz <= (trunkR + 0.4) * (trunkR + 0.4)) {
            ctx.setBlock(rootX + dx, rootY + ty, rootZ + dz, TinyBlockType.DeepOak);
          }
        }
      }
    }

    const crownY = rootY + trunkH;
    const r = Math.round(4.0 * s);
    const rSq = r * r;

    for (let dx = -r; dx <= r; dx++) {
      for (let dz = -r; dz <= r; dz++) {
        const horiz = dx * dx + dz * dz;
        if (horiz > rSq) continue;

        const wobble = (valueNoise(rootX + dx, crownY, rootZ + dz, 2) - 0.5) * 0.4;
        const span = Math.sqrt(Math.max(0, (rSq * (1 + wobble) - horiz) / 1.3));
        const dyMin = Math.ceil(-span * 0.5);
        const dyMax = Math.floor(span);

        for (let dy = dyMin; dy <= dyMax; dy++) {
          if (ctx.getBlock(rootX + dx, crownY + dy, rootZ + dz) === -1) {
            ctx.setBlock(rootX + dx, crownY + dy, rootZ + dz, TinyBlockType.AutumnAmber);
          }
        }
      }
    }
  }

  /**
   * Carvalho Verdejante: copa arredondada cheia de folhagem verde.
   */
  private growOakTree(ctx: ChunkContext, rootX: number, rootY: number, rootZ: number, seed: number, s: number): void {
    const trunkH = Math.round((7.5 + ((seed * 70) % 3.0)) * s);
    const trunkR = Math.max(1, Math.round(s * 0.28));

    for (let ty = 0; ty < trunkH; ty++) {
      for (let dx = -trunkR; dx <= trunkR; dx++) {
        for (let dz = -trunkR; dz <= trunkR; dz++) {
          if (dx * dx + dz * dz <= (trunkR + 0.4) * (trunkR + 0.4)) {
            ctx.setBlock(rootX + dx, rootY + ty, rootZ + dz, TinyBlockType.DeepOak);
          }
        }
      }
    }

    const crownY = rootY + trunkH;
    const r = Math.round(4.2 * s);
    const rSq = r * r;

    for (let dx = -r; dx <= r; dx++) {
      for (let dz = -r; dz <= r; dz++) {
        const horiz = dx * dx + dz * dz;
        if (horiz > rSq) continue;

        const span = Math.sqrt((rSq - horiz) / 1.25);
        const dyMin = Math.ceil(-span * 0.55);
        const dyMax = Math.floor(span);

        for (let dy = dyMin; dy <= dyMax; dy++) {
          if (ctx.getBlock(rootX + dx, crownY + dy, rootZ + dz) === -1) {
            ctx.setBlock(rootX + dx, crownY + dy, rootZ + dz, TinyBlockType.PineEmerald);
          }
        }
      }
    }
  }

  /**
   * Mancha de flores: hastes finas e esparsas, nao um cilindro.
   *
   * Isto era um disco macico de `r` por `h` preenchido inteiro. Nas escalas antigas o disco
   * tinha poucos voxels e passava por tufo; a 4 cm por voxel e um metro de mundo, virou um
   * cilindro solido de 70 cm de cor saturada plantado na planicie -- na tela, um tambor de
   * tinta. Flor e silhueta esparsa: alguns pontos da area viram haste de um a poucos
   * voxels, e o resto fica vazio.
   */
  private scatterFlowerPatch(ctx: ChunkContext, x: number, y: number, z: number, flower: number, s: number): void {
    const r = Math.max(1, Math.round(s * 0.45));
    const maxH = Math.max(1, Math.round(s * 0.22));
    const rSq = r * r;

    for (let dx = -r; dx <= r; dx++) {
      for (let dz = -r; dz <= r; dz++) {
        if (dx * dx + dz * dz > rSq) continue;
        // Um ponto em cada sete vira haste: o vazio entre elas e o que faz ler como flora.
        if (hash3(x + dx, 7, z + dz) < 0.86) continue;
        const h = 1 + Math.floor(hash3(x + dx, 11, z + dz) * maxH);
        for (let dy = 0; dy < h; dy++) {
          if (ctx.getBlock(x + dx, y + dy, z + dz) === -1) {
            ctx.setBlock(x + dx, y + dy, z + dz, flower);
          }
        }
      }
    }
  }

  private scatterBoulder(ctx: ChunkContext, x: number, y: number, z: number, s: number): void {
    const r = Math.max(1, Math.round(s * 1.3));
    for (let dx = -r; dx <= r; dx++) {
      for (let dy = 0; dy <= r; dy++) {
        for (let dz = -r; dz <= r; dz++) {
          if (dx * dx + dy * dy + dz * dz <= r * r) {
            ctx.setBlock(x + dx, y + dy, z + dz, TinyBlockType.Granite);
          }
        }
      }
    }
  }
}

// ─── Ruído por Hash ──────────────────────────────────────────────────────────

/** Interpolacao suave de Hermite entre `edge0` e `edge1`, como a do GLSL. */
function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

/**
 * `hash3` constante dentro de um brick de 8³.
 *
 * Ver a nota de coerência de brick em `MicroTerrainGenerator.material`: usada no lugar de
 * `hash3` onde a variação é invisível, ela mantém o brick uniforme e tira o custo de memória.
 */
function brickHash(x: number, y: number, z: number): number {
  return hash3(x >> 3, y >> 3, z >> 3);
}

/** `valueNoise` em escala de brick: a célula é 8 << shift voxels, nunca menor que o brick. */
function brickValueNoise(x: number, y: number, z: number, shift: number): number {
  return valueNoise(x >> 3, y >> 3, z >> 3, shift);
}

function hash3(x: number, y: number, z: number): number {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(z | 0, 1274126177);
  h = Math.imul(h ^ (h >>> 13), 1103515245);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function valueNoise(x: number, y: number, z: number, shift: number): number {
  const mask = (1 << shift) - 1;
  const inv = 1 / (1 << shift);
  const cx = x >> shift, cy = y >> shift, cz = z >> shift;
  const fx = (x & mask) * inv, fy = (y & mask) * inv, fz = (z & mask) * inv;
  const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy), sz = fz * fz * (3 - 2 * fz);

  const c000 = hash3(cx, cy, cz),         c100 = hash3(cx + 1, cy, cz);
  const c010 = hash3(cx, cy + 1, cz),     c110 = hash3(cx + 1, cy + 1, cz);
  const c001 = hash3(cx, cy, cz + 1),     c101 = hash3(cx + 1, cy, cz + 1);
  const c011 = hash3(cx, cy + 1, cz + 1), c111 = hash3(cx + 1, cy + 1, cz + 1);

  const x00 = c000 + (c100 - c000) * sx, x10 = c010 + (c110 - c010) * sx;
  const x01 = c001 + (c101 - c001) * sx, x11 = c011 + (c111 - c011) * sx;
  const y0 = x00 + (x10 - x00) * sy, y1 = x01 + (x11 - x01) * sy;
  return y0 + (y1 - y0) * sz;
}
