/**
 * Escala do mundo, compartilhada entre a pagina e os workers.
 *
 * **1 metro = 25 voxels = 4 cm por voxel.** Mais fino que os 10 cm do Teardown.
 *
 * ## O que esse numero custa
 *
 * A distancia de visao custa VOXELS, nao metros, e o orcamento e o atlas de bricks. Medido
 * neste mundo, com a mesma VRAM (~220.000 slots, 113 MB):
 *
 *    8 voxels/m (12,5 cm)  ->  56 m de visao
 *   25 voxels/m (4 cm)     ->  18 m de visao
 *
 * Nao e uma troca escondida: resolucao linear 3x mais fina e 27x mais voxels por volume, e
 * o alcance paga. 18 m com nevoa fechando antes disso e curto, mas e o regime de um jogo de
 * destruicao fina, nao de paisagem aberta. Se um dia a paisagem importar mais que o detalhe,
 * este numero e o unico lugar a mexer -- tudo o mais no gerador esta escrito em metros.
 */
export const VOXELS_PER_BLOCK = 25;

/** Altura de referencia do terreno, em metros (ver content/generators/MicroTerrainGenerator.ts). */
export const SURFACE_BLOCK_Y = 64;

/**
 * Escala corporal do personagem.
 *
 * A altura sai de `1.8 * escala` metros (ver engine/player/Player.ts), entao 1.11 da
 * **2,0 m** -- 16 voxels de 12,5 cm.
 *
 * Para experimentar sem recompilar, use o console do navegador:
 * `tinyVoxels.cmd('/scale', '0.9')`. Ver main.ts.
 */
export const DEFAULT_PLAYER_SCALE = 1.11;

import { TinyBlockType } from './content/blocks';

/**
 * Hotbar inicial sincronizada entre HTML, UI e workers.
 */
export const DEFAULT_HOTBAR: number[] = [
  TinyBlockType.LushGrass,
  TinyBlockType.DarkSlate,
  TinyBlockType.RichSoil,
  TinyBlockType.Marble,
  TinyBlockType.RedBrick,
  TinyBlockType.DeepOak,
  TinyBlockType.PineEmerald,
  TinyBlockType.WarmLantern,
  TinyBlockType.ClearWater
];

/**
 * Como o mundo e desenhado.
 *
 *  'mesh'     greedy meshing: uma malha por chunk.
 *  'raymarch' brickmap global: zero malhas, UM draw call para o mundo inteiro.
 *
 * O motivo de o raymarch existir esta na medicao do caminho de malha neste mundo: num chunk
 * 64^3 de superficie, o greedy meshing funde apenas 1,99x (20.270 faces expostas viram 10.161
 * quads), gera 2,7 MB de geometria contra 256 KB de dados de voxel, e leva ~76 ms por chunk.
 * A fusao baixa nao e acidente: greedy meshing precisa de superficie plana, e superficie plana
 * e exatamente o que faz um minivoxel parecer um bloco grande. Quanto melhor o terreno fica,
 * pior a malha fica.
 *
 * ## O que mudou desde o prototipo
 *
 * A primeira versao do raymarch desenhava uma CAIXA POR CHUNK, cada uma com a sua textura 3D
 * e o seu clone de material. Isso trocava o custo de meshing por um custo pior: a visao
 * configurada pedia ~28.000 chunks vivos, ou seja 28.000 draw calls e mais de 1 GB de VRAM em
 * texturas de 34^3. Era o motivo real da travada -- nao o tracado do raio.
 *
 * Agora os voxels do mundo inteiro vivem em UMA estrutura esparsa na GPU (grade de indirecao
 * + atlas de bricks de 8^3) e um unico triangulo de tela cheia percorre o DDA por pixel. So
 * bricks MISTOS ocupam espaco; ar puro e rocha macica custam 4 bytes por 512 voxels. A luz
 * nao e mais um lightmap: sol, ceu e cada cristal emissivo sao raios secundarios tracados na
 * mesma estrutura. Ver engine/render/brickmap/.
 */
export const CHUNK_RENDERER: 'mesh' | 'raymarch' = 'raymarch';

/**
 * Com o raymarch ligado, pinta cada pixel pelo numero de passos de DDA gastos: verde barato,
 * vermelho caro. E a leitura direta de onde falta pular espaco vazio.
 */
export const RAYMARCH_DEBUG_STEPS = false;

/**
 * Se true, usa greedy meshing para fundir faces adjacentes coplanares.
 * Se false, usa naive meshing (emite quads diretamente por face exposta).
 * Em minivoxels, desligar greedy meshing remove o custo de varredura bidimensional de faces.
 */
export const GREEDY_MESHING = false;

