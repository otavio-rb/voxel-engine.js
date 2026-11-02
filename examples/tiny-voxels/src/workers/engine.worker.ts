import { runEngineWorker } from '@voxel/engine/worker';
import { registerGameContent, TinyBlockType } from '../content';
import { tinyPlugins } from '../plugins';
import { CHUNK_RENDERER, DEFAULT_HOTBAR, DEFAULT_PLAYER_SCALE, GREEDY_MESHING, SURFACE_BLOCK_Y, VOXELS_PER_BLOCK } from '../config';

/** Lado do chunk em voxels. A 8 voxels por metro, um chunk cobre 4 x 4 x 4 metros. */
const CHUNK = 32;
/** Quantos chunks cabem num metro, para escrever as distancias em metros. */
const CHUNKS_PER_METER = VOXELS_PER_BLOCK / CHUNK;

/**
 * Distancias de carregamento, em METROS.
 *
 * O orcamento e o atlas de bricks: cada coluna gasta um slot por brick MISTO que atravessa
 * (a casca da superficie e as paredes de caverna). Medido com a rocha enterrada ja coerente
 * por brick -- ver MicroTerrainGenerator.material --, uma coluna de chunk custa ~10 slots.
 *
 * Medido, pior caso entre jogador na superficie e fundo na caverna:
 *
 *   24 m de raio, 20 abaixo  ->  418.000 slots  204 MB
 *   22 m de raio, 18 abaixo  ->  299.000 slots  146 MB
 *   20 m de raio, 18 abaixo  ->  255.000 slots  125 MB   <- escolhido
 *   18 m de raio, 16 abaixo  ->  178.000 slots   87 MB
 *
 * contra os 300.000 de `brickAtlasSlots`, que deixa 18% de folga. Se estourar,
 * `brickMapStats().allocFailures` para de ser zero e aparecem manchas de pedra uniforme.
 *
 * O pior caso e DENTRO de caverna, nao na superficie: a 4 cm por voxel a parede de um tunel
 * tem tres vezes mais bricks mistos que a casca do terreno aberto.
 *
 * A troca que tornou isto possivel foi cair de 32 para 8 voxels por metro (ver config.ts):
 * o mesmo numero de chunks passou a cobrir quatro vezes mais mundo em metros.
 */
const VIEW_METERS = 20;
/** Para cima: quase so ceu, que nao custa desenhar mas custa carregar. */
const VIEW_METERS_UP = 10;
/** Para baixo: o que se quer enxergar de uma boca de caverna. */
const VIEW_METERS_DOWN = 18;

/** Extremos do mundo em METROS, acompanhando o gerador (MicroTerrainGenerator). */
const BEDROCK_METERS = 0;
/** Topo possivel do relevo, em metros (MicroTerrainGenerator.MAX_HEIGHT). */
const MAX_TERRAIN_METERS = 158;
/** Teto do mundo, com folga acima do pico mais alto. */
const SKY_TOP_METERS = MAX_TERRAIN_METERS + 12;

const chunksFor = (meters: number) => Math.max(1, Math.round(meters * CHUNKS_PER_METER));
/** Converte uma altitude em metros para indice de chunk, para a faixa nao desalinhar. */
const chunkYOf = (meters: number) => Math.floor((meters * VOXELS_PER_BLOCK) / CHUNK);

runEngineWorker({
  setup: registerGameContent,
  createChunkWorker: () => new Worker(new URL('./chunk.worker.ts', import.meta.url), { type: 'module' }),
  plugins: tinyPlugins,
  world: {
    voxelsPerBlock: VOXELS_PER_BLOCK,

    /**
     * 32 voxels de lado (2 blocos).
     *
     * Eu tinha escolhido 64 para ter menos chunks (1.773 contra 13.549 para a mesma visao) e
     * menos custo fixo de bookkeeping. Foi erro: o custo de bookkeeping e por chunk e e
     * pequeno, enquanto TODO custo pesado escala com o volume do chunk. Medido, por chunk:
     *
     *                             32^3        64^3
     *   geracao do terreno        ~1.5 ms    ~10 ms
     *   luz (computeLocal)         2.2 ms     21.7 ms
     *   luz (costura)              1.0 ms      3.5 ms
     *   greedy meshing            ~9 ms      ~76 ms
     *   geometria gerada         ~340 KB      2,7 MB
     *
     * Ou seja, 64 transformava cada chunk que chega num bloco de trabalho grande o bastante
     * para ser sentido como travada, em vez de muitos blocos pequenos que caber num orcamento
     * por quadro. E a tabela de memoria ja apontava 32 como melhor (210 MB contra 258 MB para
     * a mesma visao) — eu escolhi 64 contra a propria medicao que tinha feito.
     */
    chunkSize: CHUNK,
    chunkHeight: CHUNK,

    // Longe nos tres eixos. So e possivel porque chunks uniformes compartilham arrays na
    // engine: sem isso, essa mesma visao custaria 1.270 MB em vez de ~258 MB.
    renderDistance: chunksFor(VIEW_METERS),
    verticalRenderDistance: chunksFor(VIEW_METERS_UP),
    verticalRenderDistanceDown: chunksFor(VIEW_METERS_DOWN),

    // LOD so dentro da nevoa: a resolucao cheia vai ate 24 blocos e os ultimos 8 caem para
    // metade. Reduzir antes disso e autodestrutivo num mundo de minivoxels, porque faz o
    // voxel renderizado ficar 2x maior justamente onde o olho ainda o resolve.
    lodRings: [chunksFor(16), chunksFor(VIEW_METERS)],

    // Derivada das alturas em blocos: escrita a mao, ela desalinha sempre que CHUNK muda.
    chunkYRange: [chunkYOf(BEDROCK_METERS), chunkYOf(SKY_TOP_METERS) + 1],
    // A fixacao de superficie do mundo classico multiplicaria os chunks vivos.
    surfacePinRange: null,

    /**
     * Acima do terreno mais alto possivel, em voxels. Um chunk sem nada carregado acima so
     * e tratado como ceu aberto a partir daqui; mais baixo que isso ele comeca escuro e
     * espera a luz real chegar. Com o default 0, todo o subsolo nasceria iluminado.
     */
    openSkyMinY: (MAX_TERRAIN_METERS + 4) * VOXELS_PER_BLOCK,

    // A superficie lisa e o que mais faz um minivoxel parecer um bloco grande: o greedy
    // meshing funde a parede num quad unico e a AO e por vertice. O grao por voxel e o
    // contorno de aresta sao o que devolve a escala para o olho.
    // Mais suaves do que a 32 voxels/metro: com voxel de 12,5 cm o cubo ja se le sozinho
    // na tela, e grao e contorno fortes viravam ruido em vez de pista de escala.
    voxelGrain: 0.22,
    voxelEdge: 0.25,
    // O contorno precisa sobreviver quase ate a nevoa, senao a escala do voxel desaparece
    // a poucos metros e o mundo volta a parecer feito de blocos grandes.
    voxelEdgeFadeBlocks: 8,

    // Ver config.ts: 'mesh' (greedy meshing) ou 'raymarch' (brickmap global).
    chunkRenderer: CHUNK_RENDERER,
    greedyMeshing: GREEDY_MESHING,

    // 200.000 bricks de 8^3 = ~102 MB de VRAM para os voxels do mundo inteiro, contra os
    // 167.000 que a visao acima pede no pior caso. Para comparar: a versao por chunk pedia
    // mais de 1 GB em texturas de 34^3 para cobrir menos mundo.
    brickAtlasSlots: 300_000,
    // Cada unidade e um DDA de sombra a mais por pixel. 3 cobre o caso da cena de referencia
    // (lanterna + dois aglomerados de cristal visiveis ao mesmo tempo) sem passar disso.
    lightShadowBudget: 3,

    /**
     * Anel de LOD: terreno grosso alem dos 20 m finos, so para ser visto.
     *
     * `stride: 8` quer dizer que cada celula vale 8 voxels de mundo (32 cm), e um chunk de
     * 64 celulas cobre 512 voxels = 20,5 m. O anel inteiro ate 200 m cabe em algumas
     * centenas de chunks, contra os ~1.600.000 que 200 m em resolucao cheia pediriam.
     *
     * O detalhe perdido e invisivel: a 20 m de distancia, 32 cm projetam menos de um pixel
     * de diferenca contra 4 cm.
     */
    farField: {
      stride: 8,
      chunkCells: 64,
      outerRadius: 200 * VOXELS_PER_BLOCK,
      verticalRadius: 90 * VOXELS_PER_BLOCK,
      atlasSlots: 120_000
    },

    initialDimension: 'micro_world'
  },
  playerScale: DEFAULT_PLAYER_SCALE,
  // Logo acima da planicie, nao 30 m acima dela: com 20 m de visao, cair de alto e
  // atravessar nevoa sem ver nada ate aterrissar. `settleSpawn` ajusta o resto.
  spawnPoint: { x: 0, y: (SURFACE_BLOCK_Y + 6) * VOXELS_PER_BLOCK, z: 0 },
  hotbar: DEFAULT_HOTBAR
});
