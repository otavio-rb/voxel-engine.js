# Tiny Voxels

Mundo procedural infinito em voxels de **4 cm** (25 por metro) — mais fino que os 10 cm do
Teardown. Todo o relevo e feito desses voxels, nao uma casca fina sobre blocos grandes.

O mundo e desenhado por **raymarch sobre um brickmap global**: zero malhas, um draw call para
tudo o que se ve. Ver `engine/render/brickmap/`.

## A convencao de escala

**1 metro = 1 bloco = 25 voxels.** O personagem tem 2,0 m (50 voxels). Arvores vao de 8 a 16 m,
montanhas chegam a ~110 m sobre uma planicie em torno de 65 m, e o nivel do mar fica em 58 m.

**A distancia de visao custa VOXELS, nao metros**, e esse e o eixo da troca. Com a mesma VRAM:

| resolucao | alcance |
| --- | --- |
| 8 voxels/m (12,5 cm) | 56 m |
| **25 voxels/m (4 cm)** | **20 m** |

Resolucao linear 3x mais fina sao 27x mais voxels por volume, e o alcance paga. 20 m com
nevoa fechando antes e curto, mas e o regime de um jogo de destruicao fina, nao de paisagem
aberta. `VOXELS_PER_BLOCK` em `src/config.ts` e o unico lugar a mexer — tudo o mais no gerador
esta escrito em metros.

**O voxel nao e unidade de interacao.** Nenhuma ferramenta remove um voxel so: tudo opera em
esfera, via `editSphere` da engine.

## Renderizacao: brickmap global

O caminho de malha (greedy meshing) nao serve a este mundo, e a medicao e direta: num chunk de
superficie, o greedy meshing funde apenas 1,99x, gera 10,9x mais geometria que dados de voxel
e leva ~76 ms por chunk. A fusao baixa nao e acidente — greedy meshing precisa de superficie
plana, e superficie plana e justamente o que faz um minivoxel parecer um bloco grande. Quanto
melhor o terreno fica, pior a malha fica.

O primeiro prototipo de raymarch trocou isso por algo pior: uma caixa por chunk, cada uma com
a sua textura 3D e o seu material. A visao configurada pedia ~28.000 chunks vivos, ou seja
28.000 draw calls e mais de 1 GB de VRAM. **O custo era a contagem de objetos, nao o tracado
do raio** — nenhum conserto de shader mudaria o numero.

Hoje existem duas texturas e um draw call para o mundo inteiro:

| | o que guarda |
| --- | --- |
| grade de indirecao | um texel R32UI por brick de 8³: ar, solido uniforme, ou indice no atlas |
| atlas de bricks | R8UI com os ids de bloco dos bricks **mistos**, e so deles |

A economia vem de nao armazenar o que e uniforme: ar aberto e rocha macica custam 4 bytes por
512 voxels em vez de 512. So a casca — superficie, parede de caverna, veio de cristal — chega
ao atlas. O enderecamento e em toro (`b mod N`), entao andar nao move nada na GPU.

### Coerencia de brick: a regra que o gerador tem de respeitar

Como so brick MISTO gasta memoria, **variar material voxel a voxel dentro de rocha macica e o
maior consumidor de memoria do mundo**. Um `hash3(x, y, z)` escolhendo entre dois tipos de
pedra nas camadas profundas tornava todo brick de rocha misto: a rocha profunda custava 45 a
62 slots por chunk contra 9 a 20 perto da superficie, e a visao inteira pedia mais slots do
que o atlas tinha. Daqui para baixo da pele, a variacao e por brick (`brickHash`) ou em faixas
multiplas de 8 voxels. Ver a nota em `MicroTerrainGenerator.material`.

### Luz

Nao ha lightmap. Sol, ceu e cada aglomerado de cristal emissivo sao **raios secundarios**
tracados na mesma estrutura, o que da luz colorida de verdade (o verde do musgo e o azul do
cristal na mesma parede) sem custo de carregamento de chunk.

Um filtro importa muito: so voxel emissivo **exposto ao ar** entra na lista de luzes. O
gerador semeia veios de gema dentro da rocha e a esmagadora maioria nunca encosta em ar —
medido, 99,2% das candidatas sao cristais enterrados que nao iluminam nada.

## Distancias e o que as fixa

**20 m em resolucao cheia**, e um anel de LOD ate **200 m** por cima disso.

### O anel de LOD

O alcance de visao esbarra em dois tetos ao mesmo tempo, e o LOD de malha que a engine ja
tinha nao mexe em nenhum deles -- ele reduz triangulos, e diz na propria doc que "os dados de
voxel continuam em resolucao cheia". Os tetos sao:

| teto | custo |
| --- | --- |
| slots de atlas | 512 bytes por brick de 8³ celulas da casca visivel |
| chunks vivos | um job de worker, uma entrada de Map e um Int8Array cada |

Esticar a visao em resolucao cheia multiplica os dois pelo quadrado da distancia: a 4 cm por
voxel, ir de 20 m a 200 m levaria ~16.000 chunks a ~1.600.000.

O anel distante (`engine/world/FarFieldStreamer.ts`) gera o terreno com **`stride: 8`** — cada
celula vale 8 voxels de mundo (32 cm) — em chunks de 64 celulas que cobrem 20,5 m cada. O anel
inteiro cabe em algumas centenas de chunks e ~120.000 slots.

Ele nao calcula luz, nao gera malha, nao guarda bordas e nao participa de colisao nem de
edicao: o jogador nunca o toca, porque ao chegar perto o anel fino ja cobriu a regiao.

**A emenda nao aparece** porque o gerador avalia uma funcao de coordenada de MUNDO e `stride`
so pula coordenadas (`ChunkContext.stride`). Medido, uma celula grossa concorda em solido/ar
com o voxel fino da mesma coordenada em **100% das amostras**, com stride 2, 4 e 8.

No renderizador, cada anel e um passe de tela cheia com um `uVoxelScale`: o DDA trabalha em
espaco de CELULA e so a entrada e a saida convertem. E o que permite reusar o shader inteiro
em vez de uma segunda copia do laco de travessia dentro dele.

### O anel fino

Visao de **20 m na horizontal, 18 m para baixo e 10 m para cima**, em chunks de 1,28 m.

O alcance vertical e assimetrico de proposito: para cima quase so ha ceu, que nao custa
desenhar mas custa carregar. Com um numero so, a unica forma de enxergar fundo numa caverna
era carregar a mesma altura de ar la em cima.

O orcamento e o atlas. Medido, pior caso entre jogador na superficie e fundo na caverna:

| raio | abaixo | slots | VRAM |
| --- | --- | --- | --- |
| 24 m | 20 m | 418.000 | 204 MB |
| 22 m | 18 m | 299.000 | 146 MB |
| **20 m** | **18 m** | **255.000** | **125 MB** |
| 18 m | 16 m | 178.000 | 87 MB |

O pior caso e DENTRO de caverna, nao na superficie: a 4 cm por voxel a parede de um tunel tem
tres vezes mais bricks mistos que a casca do terreno aberto. Contra 300.000 slots alocados,
o que deixa 18% de folga. Se estourar,
`world.brickMapStats().allocFailures` para de ser zero e aparecem manchas de pedra uniforme.

## O gerador

`src/content/generators/MicroTerrainGenerator.ts` **nao** e um campo de altura. Um campo de
altura nao consegue ter relevo de minivoxel: por construcao existe um voxel de superficie por
coluna, e a forma vem da frequencia do ruido 2D. Aqui o terreno e um campo de densidade 3D
montado numa latice de 4 voxels interpolada (ruido 3D por voxel custava 6,5 ms/chunk; a latice
custa 0,2), com detalhe fino por hash inteiro.

### Altura nao vem de bioma

Cada bioma tinha a **sua** formula de altura, e nas duas colunas vizinhas onde a temperatura
cruzava o limiar a altura saltava de uma formula para a outra. Medido numa transecta de 220
blocos: degrau de **8 blocos entre colunas adjacentes** — parede vertical sem nenhuma extensao
horizontal. Os rios faziam o mesmo por outro caminho, forcando a coluna ao nivel do mar numa
faixa estreita sem olhar a altura em volta, o que abria fendas em vez de vales.

Agora a altura vem de campos continuos que nao sabem o que e um bioma — continentalidade,
erosao e cume — e o bioma so escolhe material e flora. O alpino vem da **altitude**, nao do
clima: montanha e propriedade do relevo, e um bioma alpino sorteado por temperatura produz
neve no meio da planicie.

| | antes | depois |
| --- | --- | --- |
| degrau maximo entre colunas | 8,0 blocos | 2,6 blocos |
| degraus acima de 3 blocos | 8 | **0** |
| colunas no nivel do mar | 42% | 25% |

O bioma de canyon foi removido: as mesas em degraus (`Math.floor`) produziam terracos
verticais de 2 blocos por construcao, que e a mesma parede por outro caminho.

### O campo 3D so pesa onde ha relevo

O gerador nao e um heightmap porque um heightmap nao faz saliencia, arco nem parede negativa.
Mas o campo de densidade 3D tinha amplitude 1,62 com periodos de 1 a 4 metros e, como a
superficie fica onde a densidade cruza zero, isso deslocava o chao em **+/- 2,6 m a cada
poucos metros**. Numa planicie o resultado nao e relevo, e entulho — e voxel mais fino so
renderiza o entulho com mais nitidez.

Agora o peso do campo 3D acompanha o mesmo fator de montanha que `macroSurface` ja calcula:
quase zero na planicie, cheio na serra. Medido numa transecta de 120 m, desvio da superficie
em relacao a uma media movel de 2 m:

| | antes | depois |
| --- | --- | --- |
| desvio medio | 31,4 cm | **7,7 cm** |
| degrau p99 entre colunas | 18 voxels | **2 voxels** |
| degrau maximo | 248 cm | 72 cm |

### Cavernas

Dois ruidos de "verme" cuja intersecao e uma curva unidimensional — escavar em volta dela abre
um tunel que serpenteia de verdade, em vez do queijo suico que sai de limiarizar um unico
ruido 3D — mais cameras de baixa frequencia achatadas em Y. Medido sobre 5 seeds: **17,8% do
subsolo escavado** (14,7% a 21,4%), a ~1,9 ms por chunk.

## Rodando

```bash
npm install
npm run dev        # http://localhost:5173
npm run typecheck
npm run build
```

No console do navegador, `tinyVoxels.cmd('/scale', '0.9')` muda a escala do personagem ao
vivo; `/time`, `/tp`, `/shaders` e os demais comandos da engine funcionam igual.

## Estrutura

```
src/
  content/      blocos, dimensao e o gerador de relevo
  plugins/      escultor (pincel add/cavar/pintar) e telemetria de camera
  ui/           HUD, biblioteca de materiais, atalhos
  workers/      entradas do engine worker e do chunk worker
```

## Dependencia da engine

A engine e consumida como **dependencia real**, nao como pasta compartilhada:

```json
"@voxel/engine": "file:../voxel-engine.js/engine"
```

`npm install` cria um symlink, e o pacote expoe TypeScript direto (`exports` aponta para os
`.ts`), entao editar a engine recarrega este jogo na hora via HMR. O `vite.config.ts` cuida
dos dois detalhes que isso exige: `optimizeDeps.exclude` para o Vite nao pre-bundlar o pacote,
e `server.fs.allow` porque o symlink resolve para fora da raiz do projeto.
