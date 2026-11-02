import { Color, DataTexture, FloatType, NearestFilter, RGBAFormat, type Vector3 } from 'three';
import { blockRegistry } from '../../blocks/BlockRegistry';
import { BRICK } from './GlobalBrickMap';

/** Quantas luzes o shader considera por quadro. Cada uma custa um raio de sombra por pixel. */
export const MAX_ACTIVE_LIGHTS = 48;

interface ClusterLight {
  x: number; y: number; z: number;
  r: number; g: number; b: number;
  /** Raio de alcance, em voxels. */
  radius: number;
  /** Brilho no centro. */
  power: number;
}

/**
 * As luzes do mundo, agrupadas por brick e enviadas ao shader como lista.
 *
 * ## Por que lista, e nao lightmap
 *
 * O caminho de malha propaga luz voxel a voxel num lightmap (`LightEngine`) -- um canal de ceu
 * e um de bloco, no estilo Minecraft. Isso nao serve aqui por dois motivos. Primeiro, custa:
 * `computeLocal` media 2,2 ms por chunk de 32^3, e o brickmap carrega chunks muito mais rapido
 * que o caminho de malha conseguia. Segundo, e sem cor: um canal escalar por voxel nao sabe
 * dizer que a luz que bate na parede veio de um cristal ciano, e a cena de referencia e
 * inteiramente sobre isso -- o verde do musgo, o azul do cristal e o branco da lanterna
 * coexistindo na mesma parede.
 *
 * A lista resolve os dois: nada e pre-calculado por voxel, e cada luz carrega a sua cor. O
 * custo sai do carregamento de chunk e vai para o pixel, que e onde o resto do raymarcher ja
 * vive. Em troca, o numero de luzes simultaneas e limitado -- dai o corte pelas mais fortes
 * perto da camera.
 *
 * ## Agrupamento por brick
 *
 * Um veio de cristal nao e uma luz, sao algumas centenas de voxels emissivos adjacentes. Como
 * ponto de luz individual cada um seria irrelevante e o orcamento estouraria na primeira
 * caverna. Agrupados pelo brick de 8^3 que os contem, viram uma luz no centroide com potencia
 * somada -- que e visualmente o que um aglomerado de cristais faz de qualquer forma.
 */
export class EmissiveLightField {
  /** Luzes por chunk, para poder removê-las junto com ele. */
  private readonly byChunk = new Map<string, ClusterLight[]>();

  /** `uLights`: 2 texels por luz (posicao+raio, cor+potencia). */
  public readonly texture: DataTexture;
  private readonly data: Float32Array;

  /** Quantas luzes o ultimo `refresh` deixou ativas. */
  public activeCount = 0;

  /** Buffer de ordenacao reusado, para nao alocar por quadro. */
  private readonly scratch: ClusterLight[] = [];

  /**
   * Alcance maximo de uma luz, em voxels. Escrito em voxels e nao em blocos porque o shader
   * trabalha em voxels; o chamador converte.
   */
  private readonly maxRadius: number;

  /**
   * O alcance e escrito em BLOCOS, e e pequeno de proposito.
   *
   * Comecou em 10 blocos, que num mundo de blocos grandes seria uma tocha generosa. Aqui um
   * tunel tem ~2 blocos de largura: uma luz de 10 blocos alcanca cinco larguras de tunel em
   * todas as direcoes, entao toda luz da caverna ilumina toda parede da caverna, as
   * contribuicoes somam, e o resultado medido foi uma gruta uniformemente clara sem queda de
   * luz nenhuma -- o oposto de uma caverna. A queda de luz e o efeito; o alcance e o que a
   * produz.
   */
  constructor(voxelsPerBlock: number, maxRadiusBlocks = 4) {
    this.maxRadius = maxRadiusBlocks * voxelsPerBlock;
    this.data = new Float32Array(MAX_ACTIVE_LIGHTS * 2 * 4);
    this.texture = new DataTexture(
      this.data as unknown as BufferSource, MAX_ACTIVE_LIGHTS * 2, 1, RGBAFormat, FloatType
    );
    this.texture.minFilter = NearestFilter;
    this.texture.magFilter = NearestFilter;
    this.texture.generateMipmaps = false;
    this.texture.needsUpdate = true;
  }

  /**
   * Varre um chunk e substitui as luzes dele.
   *
   * Chamado no mesmo ponto que `GlobalBrickMap.uploadChunk`, com os mesmos dados ja quentes
   * em cache.
   */
  public scanChunk(
    key: string,
    startX: number, startY: number, startZ: number,
    blocks: Int16Array,
    chunkSize: number
  ): void {
    const cb = chunkSize / BRICK;
    const brickCount = cb * cb * cb;

    // Acumuladores por brick: contagem, centroide e cor ponderada pela emissao.
    const count = new Float32Array(brickCount);
    const sx = new Float32Array(brickCount);
    const sy = new Float32Array(brickCount);
    const sz = new Float32Array(brickCount);
    const sr = new Float32Array(brickCount);
    const sg = new Float32Array(brickCount);
    const sb = new Float32Array(brickCount);
    const peak = new Float32Array(brickCount);

    const color = new Color();
    let any = false;

    const s = chunkSize;
    const last = s - 1;

    for (let y = 0; y < s; y++) {
      const yBase = y * s * s;
      const by = (y / BRICK) | 0;
      for (let z = 0; z < s; z++) {
        const zBase = yBase + z * s;
        const bz = (z / BRICK) | 0;
        for (let x = 0; x < s; x++) {
          const at = zBase + x;
          const id = blocks[at];
          if (id < 0) continue;
          const emission = blockRegistry.getLightEmission(id);
          if (emission === 0) continue;

          // Cristal enterrado nao ilumina nada -- e nao pode custar nada.
          //
          // O gerador semeia veios de gema por dentro da rocha macica, e a esmagadora
          // maioria deles nunca encosta em ar nenhum. Registrados como luz, eram dezenas
          // de milhares de pontos disputando um orcamento de 48 para iluminar o interior
          // de uma pedra. Medido numa fatia de 19 chunks: 906 voxels emissivos, zero
          // visiveis. O teste de exposicao e o que torna a lista de luzes viavel.
          //
          // Vizinho fora do chunk conta como solido: perder a luz de um cristal que so
          // aflora na costura e barato, e o contrario (assumir ar) encheria a lista de
          // luzes fantasmas em toda face de chunk.
          const exposed =
            (x > 0    && blocks[at - 1] < 0) ||
            (x < last && blocks[at + 1] < 0) ||
            (z > 0    && blocks[at - s] < 0) ||
            (z < last && blocks[at + s] < 0) ||
            (y > 0    && blocks[at - s * s] < 0) ||
            (y < last && blocks[at + s * s] < 0);
          if (!exposed) continue;

          const bi = (bz * cb + by) * cb + ((x / BRICK) | 0);
          const w = emission / 15;
          color.setHex(blockRegistry.getColor(id));

          count[bi] += w;
          sx[bi] += x * w;
          sy[bi] += y * w;
          sz[bi] += z * w;
          sr[bi] += color.r * w;
          sg[bi] += color.g * w;
          sb[bi] += color.b * w;
          if (w > peak[bi]) peak[bi] = w;
          any = true;
        }
      }
    }

    if (!any) {
      this.byChunk.delete(key);
      return;
    }

    const lights: ClusterLight[] = [];
    for (let bi = 0; bi < brickCount; bi++) {
      const c = count[bi];
      if (c === 0) continue;

      // A potencia cresce com o aglomerado, mas em raiz: 400 voxels de cristal nao sao 400
      // vezes mais brilhantes que um, sao uma mancha de luz um pouco maior e mais forte.
      const bulk = Math.sqrt(c);
      lights.push({
        x: startX + sx[bi] / c,
        y: startY + sy[bi] / c,
        z: startZ + sz[bi] / c,
        r: sr[bi] / c,
        g: sg[bi] / c,
        b: sb[bi] / c,
        radius: this.maxRadius * peak[bi] * Math.min(1.3, 0.5 + bulk * 0.04),
        power: peak[bi] * Math.min(1.3, 0.3 + bulk * 0.05)
      });
    }

    if (lights.length === 0) this.byChunk.delete(key);
    else this.byChunk.set(key, lights);
  }

  public removeChunk(key: string): void {
    this.byChunk.delete(key);
  }

  /**
   * Escolhe as luzes que o shader vai ver neste quadro e sobe a textura.
   *
   * O criterio nao e distancia pura: uma lanterna forte a 30 m importa mais que um cristal
   * fraco a 10 m. O peso e `potencia / (1 + (dist/raio)^2)`, que e aproximadamente a
   * contribuicao real dela no pixel mais proximo.
   */
  public refresh(cameraPosition: Vector3): void {
    const picks = this.scratch;
    picks.length = 0;

    for (const lights of this.byChunk.values()) {
      for (const light of lights) {
        const dx = light.x - cameraPosition.x;
        const dy = light.y - cameraPosition.y;
        const dz = light.z - cameraPosition.z;
        const dist2 = dx * dx + dy * dy + dz * dz;

        // Fora do alcance, a luz nao ilumina pixel nenhum: nao gasta orcamento.
        const reach = light.radius * 1.35;
        if (dist2 > reach * reach) continue;

        picks.push(light);
      }
    }

    // A ordenacao e incondicional, nao so quando estoura o teto: o shader gasta o orcamento
    // de raios de sombra nas PRIMEIRAS luzes da lista, entao a ordem e o que decide quais
    // projetam sombra. Lista fora de ordem = sombra sorteada, que cintila quando a camera
    // anda e a ordem de iteracao dos chunks muda.
    const camX = cameraPosition.x, camY = cameraPosition.y, camZ = cameraPosition.z;
    picks.sort((a, b) => weight(b, camX, camY, camZ) - weight(a, camX, camY, camZ));
    if (picks.length > MAX_ACTIVE_LIGHTS) picks.length = MAX_ACTIVE_LIGHTS;

    const data = this.data;
    for (let i = 0; i < picks.length; i++) {
      const light = picks[i];
      const o = i * 8;
      data[o] = light.x;
      data[o + 1] = light.y;
      data[o + 2] = light.z;
      data[o + 3] = light.radius;
      data[o + 4] = light.r;
      data[o + 5] = light.g;
      data[o + 6] = light.b;
      data[o + 7] = light.power;
    }

    this.activeCount = picks.length;
    this.texture.needsUpdate = true;
  }

  public dispose(): void {
    this.texture.dispose();
    this.byChunk.clear();
  }
}

function weight(light: ClusterLight, cx: number, cy: number, cz: number): number {
  const dx = light.x - cx, dy = light.y - cy, dz = light.z - cz;
  const d2 = dx * dx + dy * dy + dz * dz;
  const r = Math.max(1, light.radius);
  return light.power / (1 + d2 / (r * r));
}
