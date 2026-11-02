/**
 * Conteúdo do Manual (`/docs/<rota>/`), como dados — mesmo princípio de
 * `docs/api/registry.ts`: uma fonte, os dois idiomas, gerado por
 * `scripts/gen-docs-pages.mjs` em vez de escrito à mão duas vezes (PT em docs/, EN em
 * docs/en/).
 *
 * Manual vs Docs, como o three.js (threejs.org/manual vs threejs.org/docs): o Manual
 * é narrativo — explica o porquê e como as peças se encaixam, em sequência de
 * aprendizado (a ordem de `PAGES` é a ordem dos capítulos) — e não repete assinatura,
 * tabela de parâmetros ou lista de métodos; isso já existe, correto e com demo viva,
 * em `/docs/api/`. Cada capítulo linka para lá em vez de duplicar.
 *
 * Toda afirmação técnica aqui foi conferida linha a linha contra o arquivo de
 * código-fonte citado em `sourceFile` antes de ser escrita (ver auditoria que motivou
 * a reescrita original: as páginas antigas de core/runtime/chunk-worker/dimensions
 * inventavam opções, métodos e defaults que não existem no motor).
 */

export interface Localized {
  pt: string;
  en: string;
}

export type SectionKind = 'overview' | 'callout' | 'see-also';

export interface Section {
  id: string;
  kind: SectionKind;
  title: Localized;
  body?: Localized;
  calloutVariant?: 'info' | 'tip' | 'warning';
  seeAlso?: Array<{ label: Localized; href: string }>;
}

export interface DocPage {
  id: string;
  route: string;
  navIcon: string;
  navLabel: Localized;
  title: Localized;
  lead: Localized;
  sourceFile: string;
  sections: Section[];
}

export const PAGES: DocPage[] = [
  {
    id: 'core',
    route: '/docs/core/',
    navIcon: 'terminal',
    navLabel: { pt: 'A ponte: Main Thread & VoxelEngine', en: 'The bridge: Main Thread & VoxelEngine' },
    title: { pt: 'A Ponte: Main Thread & <code>VoxelEngine</code>', en: 'The Bridge: Main Thread & <code>VoxelEngine</code>' },
    lead: {
      pt: 'Fachada da main thread: dona do canvas e do input do DOM, encaminha os dois para o engine worker, onde o mundo é simulado e renderizado de fato. Não registra conteúdo (blocos, geradores, entidades) — isso acontece dentro dos workers, capítulos adiante.',
      en: 'Main-thread facade: owns the canvas and DOM input, forwards them to the engine worker, where the world is actually simulated and rendered. It does not register content (blocks, generators, entities) — that happens inside the workers, later chapters.'
    },
    sourceFile: 'engine/core/VoxelEngine.ts',
    sections: [
      {
        id: 'overview',
        kind: 'overview',
        title: { pt: 'Por que transferir o canvas?', en: 'Why transfer the canvas?' },
        body: {
          pt: 'O construtor recebe só <code>{ canvas, worker }</code> e chama <code>canvas.transferControlToOffscreen()</code> imediatamente — a partir daí o desenho é todo responsabilidade do worker, e a main thread fica livre para o DOM nunca travar o frame. O worker é criado no call site do seu app, não dentro da engine, para o bundler conseguir localizar o arquivo do worker.',
          en: 'The constructor takes only <code>{ canvas, worker }</code> and calls <code>canvas.transferControlToOffscreen()</code> immediately — from that point on, drawing is entirely the worker\'s responsibility, and the main thread stays free so the DOM never stalls a frame. The worker is created at your app\'s call site, not inside the engine, so the bundler can find the worker file.'
        }
      },
      {
        id: 'reference',
        kind: 'callout',
        calloutVariant: 'tip',
        title: { pt: 'Referência completa', en: 'Full reference' },
        body: {
          pt: 'Construtor, todos os métodos (<code>start</code>, <code>lockPointer</code>, <code>sendCommand</code>...) e eventos (<code>stats</code>, <code>block:break</code>...) com assinatura real e demo executável:',
          en: 'Constructor, every method (<code>start</code>, <code>lockPointer</code>, <code>sendCommand</code>...) and event (<code>stats</code>, <code>block:break</code>...) with the real signature and a runnable demo:'
        },
        seeAlso: [{ label: { pt: 'VoxelEngine — abrir na referência →', en: 'VoxelEngine — open in the reference →' }, href: '/docs/api/voxel-engine/' }]
      }
    ]
  },
  {
    id: 'runtime',
    route: '/docs/runtime/',
    navIcon: 'smart_toy',
    navLabel: { pt: 'Onde o mundo roda: Engine Worker & plugins', en: 'Where the world runs: Engine Worker & plugins' },
    title: { pt: 'Onde o Mundo Roda: Engine Worker & Plugins', en: 'Where the World Runs: Engine Worker & Plugins' },
    lead: {
      pt: 'A engine inteira roda dentro de um worker dedicado: mundo, player, pipeline de render e plugins. A main thread, do capítulo anterior, só transfere o canvas e encaminha input.',
      en: 'The entire engine runs inside a dedicated worker: world, player, render pipeline, and plugins. The main thread, from the previous chapter, only forwards the canvas and input.'
    },
    sourceFile: 'engine/runtime/EngineRuntime.ts',
    sections: [
      {
        id: 'plugin',
        kind: 'callout',
        calloutVariant: 'info',
        title: { pt: 'Como estender a engine: <code>EnginePlugin</code>', en: 'How to extend the engine: <code>EnginePlugin</code>' },
        body: {
          pt: 'Um plugin é <code>{ readonly name: string; setup(ctx: EngineContext): void }</code> — só isso, e <code>setup</code> é obrigatório. Não existem hooks de ciclo de vida como <code>fixedUpdate</code> ou <code>destroy</code> na interface: um plugin que precisa de um tick ou de um evento de chunk se inscreve ele mesmo dentro de <code>setup</code>, via <code>ctx.on(...)</code>. É assim que jogo e engine ficam desacoplados: o jogo é só um ou mais plugins passados para <code>runEngineWorker</code>.',
          en: 'A plugin is <code>{ readonly name: string; setup(ctx: EngineContext): void }</code> — that is all, and <code>setup</code> is required. There are no lifecycle hooks like <code>fixedUpdate</code> or <code>destroy</code> on the interface: a plugin that needs a tick or a chunk event subscribes itself inside <code>setup</code>, via <code>ctx.on(...)</code>. This is how the game and the engine stay decoupled: the game is just one or more plugins passed to <code>runEngineWorker</code>.'
        }
      },
      {
        id: 'reference',
        kind: 'callout',
        calloutVariant: 'tip',
        title: { pt: 'Referência completa', en: 'Full reference' },
        body: {
          pt: 'Opções de <code>runEngineWorker</code>, tudo que um plugin alcança em <code>EngineContext</code>, e os comandos de console em <code>CommandRegistry</code>:',
          en: 'The <code>runEngineWorker</code> options, everything a plugin can reach on <code>EngineContext</code>, and the console commands in <code>CommandRegistry</code>:'
        },
        seeAlso: [
          { label: { pt: 'runEngineWorker — abrir na referência →', en: 'runEngineWorker — open in the reference →' }, href: '/docs/api/run-engine-worker/' },
          { label: { pt: 'EngineContext — abrir na referência →', en: 'EngineContext — open in the reference →' }, href: '/docs/api/engine-context/' },
          { label: { pt: 'CommandRegistry — abrir na referência →', en: 'CommandRegistry — open in the reference →' }, href: '/docs/api/command-registry/' }
        ]
      }
    ]
  },
  {
    id: 'chunk-worker',
    route: '/docs/chunk-worker/',
    navIcon: 'hub',
    navLabel: { pt: 'Gerando o mundo: Chunk Worker', en: 'Generating the world: Chunk Worker' },
    title: { pt: 'Gerando o Mundo: Chunk Worker & Geração Procedural', en: 'Generating the World: Chunk Worker & Procedural Generation' },
    lead: {
      pt: 'Um segundo tipo de worker, num pool à parte do engine worker, gera terreno chamando <code>WorldGenerator.generate(ctx: ChunkContext)</code> — uma única função que lê/escreve o volume através dos métodos do próprio <code>ChunkContext</code>, sem argumentos separados de posição ou buffer.',
      en: 'A second kind of worker, in a pool separate from the engine worker, generates terrain by calling <code>WorldGenerator.generate(ctx: ChunkContext)</code> — a single function that reads/writes the volume through the <code>ChunkContext</code> methods, with no separate position or buffer arguments.'
    },
    sourceFile: 'engine/world/WorldGenerator.ts',
    sections: [
      {
        id: 'overview',
        kind: 'overview',
        title: { pt: 'Por que um worker à parte?', en: 'Why a separate worker?' },
        body: {
          pt: 'Gerar terreno (ruído Simplex, varrer um volume 32³) é caro e não pode travar nem o engine worker nem a main thread. Por isso roda num pool próprio: o engine worker pede um chunk, o chunk worker gera e devolve o buffer por transferable — zero cópia — e o engine worker só malha e insere na cena.',
          en: "Generating terrain (Simplex noise, sweeping a 32³ volume) is expensive and must not stall either the engine worker or the main thread. So it runs in its own pool: the engine worker requests a chunk, the chunk worker generates it and hands the buffer back as a transferable — zero copy — and the engine worker only meshes it and adds it to the scene."
        }
      },
      {
        id: 'reference',
        kind: 'callout',
        calloutVariant: 'tip',
        title: { pt: 'Referência completa', en: 'Full reference' },
        body: {
          pt: 'As interfaces <code>WorldGenerator</code>/<code>ChunkContext</code> e o entrypoint <code>runChunkWorker</code>, com um gerador de terreno editável ao vivo:',
          en: 'The <code>WorldGenerator</code>/<code>ChunkContext</code> interfaces and the <code>runChunkWorker</code> entrypoint, with a terrain generator you can edit live:'
        },
        seeAlso: [
          { label: { pt: 'WorldGenerator — abrir na referência →', en: 'WorldGenerator — open in the reference →' }, href: '/docs/api/world-generator/' },
          { label: { pt: 'runChunkWorker — abrir na referência →', en: 'runChunkWorker — open in the reference →' }, href: '/docs/api/run-chunk-worker/' }
        ]
      }
    ]
  },
  {
    id: 'procedural-generation',
    route: '/docs/procedural-generation/',
    navIcon: 'terrain',
    navLabel: { pt: 'Terreno sem dor: abstração de geração', en: 'Terrain without pain: generation abstraction' },
    title: { pt: 'Terreno sem Dor: a Abstração de Geração Procedural', en: 'Terrain Without Pain: the Procedural Generation Abstraction' },
    lead: {
      pt: 'Escrever <code>generate(ctx)</code> na mão — como no capítulo anterior — funciona, mas qualquer mundo com biomas, camadas de superfície e cavernas rapidamente vira 600+ linhas (é o tamanho real de um gerador completo em <code>examples/game</code>). Esta camada, em <code>engine/world/generation/</code>, existe pra isso não ser o ponto de entrada obrigatório.',
      en: 'Writing <code>generate(ctx)</code> by hand — like the previous chapter shows — works, but any world with biomes, surface layers and caves quickly grows past 600 lines (that is the real size of a complete generator in <code>examples/game</code>). This layer, in <code>engine/world/generation/</code>, exists so that is not the mandatory starting point.'
    },
    sourceFile: 'engine/world/generation/terrain.ts',
    sections: [
      {
        id: 'overview',
        kind: 'overview',
        title: { pt: 'Camadas que se somam, não um objeto de opções fechado', en: 'Layers that add up, not a closed options object' },
        body: {
          pt: '<code>createWorld({ terrain, overrides?, biomes, layers, caves? })</code> monta um <code>WorldGenerator</code> completo, mas <code>terrain</code> é um <b>array componível</b>, não um heightmap fixo: <code>[baseTerrain(), mountains(), hills()]</code> lê exatamente como soa — cada camada recebe a altura que a anterior produziu e soma ou substitui em cima. <code>overrides</code> recorta regiões por coordenada (um platô plano pra uma construção, em volta de montanhas de verdade). E quando nem uma pilha de alturas serve — ilhas flutuantes, cavidades, formas que não cabem num heightmap — <code>customGenerator({ sample })</code> troca tudo isso por uma função que olha um ponto e devolve densidade + material; a engine faz o laço pelo volume por você.',
          en: '<code>createWorld({ terrain, overrides?, biomes, layers, caves? })</code> assembles a complete <code>WorldGenerator</code>, but <code>terrain</code> is a <b>composable array</b>, not a fixed heightmap: <code>[baseTerrain(), mountains(), hills()]</code> reads exactly like it sounds — each layer receives the height the previous one produced and adds to or replaces it. <code>overrides</code> carves out regions by coordinate (a flat plateau for a build site, surrounded by real mountains). And when even a stack of heights doesn\'t fit — floating islands, overhangs, shapes a heightmap can\'t express — <code>customGenerator({ sample })</code> swaps all of that for a function that looks at one point and returns density + material; the engine runs the volume loop for you.'
        }
      },
      {
        id: 'escape-hatches',
        kind: 'overview',
        title: { pt: 'E se nada disso servir?', en: 'And if none of this fits?' },
        body: {
          pt: 'As mesmas peças que <code>createWorld</code> chama por dentro continuam exportadas soltas: <code>sampleHeight</code>, <code>classifyBiome</code>, <code>applySurfaceLayers</code>/<code>scatterOres</code>, <code>CaveCarver</code> — pra montar um <code>generate(ctx)</code> na mão sem reescrever a parte que já funciona. E o <code>WorldGenerator</code>/<code>ChunkContext</code> cru do capítulo anterior continua lá, sem nenhuma dessas três camadas por cima, pra quando nada disso servir.',
          en: 'The same pieces <code>createWorld</code> calls internally are still exported on their own: <code>sampleHeight</code>, <code>classifyBiome</code>, <code>applySurfaceLayers</code>/<code>scatterOres</code>, <code>CaveCarver</code> — to hand-assemble a <code>generate(ctx)</code> without rewriting the part that already works. And the raw <code>WorldGenerator</code>/<code>ChunkContext</code> from the previous chapter is still there, with none of these three layers on top, for when none of this fits.'
        }
      },
      {
        id: 'caves',
        kind: 'callout',
        calloutVariant: 'info',
        title: { pt: 'De onde vieram as cavernas', en: 'Where the caves came from' },
        body: {
          pt: '<code>CaveCarver</code> não é novo código escrito pra esta abstração — é a mesma talha de túneis/câmaras/ravinas/geodos de um gerador real de <code>examples/game</code> (1056 linhas, 6 biomas de caverna fixos, nomes de bloco direto no código), extraída e generalizada: a matemática do talhe não mudou uma linha, só parou de saber o nome de qualquer bloco. Biomas e decoração agora chegam por <code>CaveCarverOptions.biomes</code>.',
          en: '<code>CaveCarver</code> is not new code written for this abstraction — it is the same tunnel/chamber/ravine/geode carving from a real generator in <code>examples/game</code> (1056 lines, 6 fixed cave biomes, block names baked into the code), extracted and generalized: the carving math did not change a single line, it just stopped knowing any block\'s name. Biomes and decoration now arrive through <code>CaveCarverOptions.biomes</code>.'
        }
      },
      {
        id: 'reference',
        kind: 'see-also',
        title: { pt: 'Referência completa', en: 'Full reference' },
        body: {
          pt: 'As três peças com demonstração ao vivo — troque a ordem das camadas, o recorte do override, ou o campo de densidade, e rode de novo:',
          en: 'The three pieces with a live demo — change the layer order, the override bounds, or the density field, and run again:'
        },
        seeAlso: [
          { label: { pt: 'createWorld — abrir na referência →', en: 'createWorld — open in the reference →' }, href: '/docs/api/terrain-generator/' },
          { label: { pt: 'customGenerator — abrir na referência →', en: 'customGenerator — open in the reference →' }, href: '/docs/api/custom-generator/' },
          { label: { pt: 'CaveCarver — abrir na referência →', en: 'CaveCarver — open in the reference →' }, href: '/docs/api/cave-carver/' }
        ]
      }
    ]
  },
  {
    id: 'blocks',
    route: '/docs/blocks/',
    navIcon: 'grid_view',
    navLabel: { pt: 'Definindo blocos: BlockRegistry', en: 'Defining blocks: BlockRegistry' },
    title: { pt: 'Definindo Blocos: <code>BlockRegistry</code>', en: 'Defining Blocks: <code>BlockRegistry</code>' },
    lead: {
      pt: 'Antes de gerar ou desenhar qualquer coisa, cada tipo de bloco precisa existir no <code>BlockRegistry</code>: cor, solidez, fluidez, luminância e atrito — os metadados que os próximos capítulos (render, física, fluidos) consultam.',
      en: 'Before generating or drawing anything, every block type needs to exist in the <code>BlockRegistry</code>: color, solidity, fluidity, luminance, and friction — the metadata the next chapters (render, physics, fluids) read.'
    },
    sourceFile: 'engine/blocks/BlockRegistry.ts',
    sections: [
      {
        id: 'overview',
        kind: 'overview',
        title: { pt: 'Por que typed arrays e não um Map?', en: 'Why typed arrays instead of a Map?' },
        body: {
          pt: 'No hot-path do Greedy Meshing (próximo capítulo), um único chunk 32³ inspeciona centenas de milhares de faces. Em vez de <code>Map.get()</code> por face, o registro mantém arrays binários pré-alocados (<code>flags</code>, <code>lightOpacityTable</code>, <code>slipperinessTable</code>, <code>colorTable</code>), todos indexados diretamente pelo id do bloco — leitura O(1) sem alocação.',
          en: 'In the Greedy Meshing hot path (next chapter), a single 32³ chunk inspects hundreds of thousands of faces. Instead of a <code>Map.get()</code> per face, the registry keeps pre-allocated binary arrays (<code>flags</code>, <code>lightOpacityTable</code>, <code>slipperinessTable</code>, <code>colorTable</code>), all indexed directly by block id — O(1) reads with no allocation.'
        }
      },
      {
        id: 'reference',
        kind: 'callout',
        calloutVariant: 'tip',
        title: { pt: 'Referência completa', en: 'Full reference' },
        body: {
          pt: 'A interface <code>BlockConfig</code> inteira e os métodos de acesso, com uma paleta registrada ao vivo:',
          en: 'The full <code>BlockConfig</code> interface and the accessor methods, with a palette registered live:'
        },
        seeAlso: [{ label: { pt: 'BlockRegistry — abrir na referência →', en: 'BlockRegistry — open in the reference →' }, href: '/docs/api/block-registry/' }]
      }
    ]
  },
  {
    id: 'rendering',
    route: '/docs/rendering/',
    navIcon: 'polyline',
    navLabel: { pt: 'Desenhando voxels: malhas & volumetria', en: 'Drawing voxels: meshes & volumetrics' },
    title: { pt: 'Desenhando Voxels: Malhas & Volumetria', en: 'Drawing Voxels: Meshes & Volumetrics' },
    lead: {
      pt: 'Com os blocos definidos, dois caminhos de renderização coexistem: malhas poligonais fundidas por Greedy Meshing na CPU (<code>ChunkGeometry</code>), e raymarching volumétrico em GPU sobre uma hierarquia <code>BrickMap</code> para micro-voxels.',
      en: 'With blocks defined, two rendering paths coexist: polygon meshes fused by CPU-side Greedy Meshing (<code>ChunkGeometry</code>), and GPU volumetric raymarching over a <code>BrickMap</code> hierarchy for micro-voxels.'
    },
    sourceFile: 'engine/chunk/ChunkGeometry.ts',
    sections: [
      {
        id: 'overview',
        kind: 'overview',
        title: { pt: 'Qual caminho escolher?', en: 'Which path to pick?' },
        body: {
          pt: '<code>ChunkGeometry</code> funde faces coplanares adjacentes em quads maiores — ótimo para blocos regulares de 1m³, onde a contagem de triângulos importa mais que resolução. <code>BrickMap</code> faz DDA 3D direto sobre uma textura esparsa — a escolha certa quando <code>voxelsPerBlock</code> é alto (escultura destrutiva em micro-voxel) e gerar malha a cada edição seria caro demais.',
          en: '<code>ChunkGeometry</code> fuses adjacent coplanar faces into larger quads — great for regular 1m³ blocks, where triangle count matters more than resolution. <code>BrickMap</code> does 3D DDA directly over a sparse texture — the right choice when <code>voxelsPerBlock</code> is high (destructible micro-voxel sculpting) and remeshing on every edit would be too expensive.'
        }
      },
      {
        id: 'reference',
        kind: 'callout',
        calloutVariant: 'tip',
        title: { pt: 'Referência completa', en: 'Full reference' },
        body: {
          pt: 'Greedy meshing, cálculo de AO por vértice, e a hierarquia DDA do BrickMap, cada um com demo ao vivo:',
          en: 'Greedy meshing, per-vertex AO, and the BrickMap DDA hierarchy, each with a live demo:'
        },
        seeAlso: [
          { label: { pt: 'ChunkGeometry — abrir na referência →', en: 'ChunkGeometry — open in the reference →' }, href: '/docs/api/chunk-geometry/' },
          { label: { pt: 'BrickMap — abrir na referência →', en: 'BrickMap — open in the reference →' }, href: '/docs/api/brickmap/' }
        ]
      }
    ]
  },
  {
    id: 'physics',
    route: '/docs/physics/',
    navIcon: 'sports_esports',
    navLabel: { pt: 'Movimento & colisão: física cinemática', en: 'Movement & collision: kinematic physics' },
    title: { pt: 'Movimento & Colisão: Física Cinemática', en: 'Movement & Collision: Kinematic Physics' },
    lead: {
      pt: 'Com o mundo visível, falta fazer algo se mover nele: corpos cinemáticos resolvem colisão eixo-a-eixo contra o mesmo volume de voxels (<code>KinematicBody</code>/<code>AABBPhysics</code>), e <code>raycastVoxel</code> faz DDA 3D sobre o volume para quebra/colocação de blocos.',
      en: 'With the world visible, something needs to move through it: kinematic bodies resolve axis-by-axis collision against the same voxel volume (<code>KinematicBody</code>/<code>AABBPhysics</code>), and <code>raycastVoxel</code> runs a 3D DDA over the volume for block break/place.'
    },
    sourceFile: 'engine/physics/AABBPhysics.ts',
    sections: [
      {
        id: 'overview',
        kind: 'overview',
        title: { pt: 'Por que eixo-a-eixo?', en: 'Why axis by axis?' },
        body: {
          pt: 'Resolver X, Y e Z como três varreduras separadas (em vez de um único vetor de movimento) é o que evita "colisões fantasma" em quinas de blocos — um corpo encostado numa parede ainda desliza livremente ao longo dela, porque o eixo bloqueado não interfere nos outros dois.',
          en: 'Resolving X, Y, and Z as three separate sweeps (instead of one combined movement vector) is what avoids "ghost collisions" at block corners — a body pressed against a wall still slides freely along it, because the blocked axis does not interfere with the other two.'
        }
      },
      {
        id: 'reference',
        kind: 'callout',
        calloutVariant: 'tip',
        title: { pt: 'Referência completa', en: 'Full reference' },
        body: {
          pt: '<code>KinematicBody</code>/<code>AABBPhysics</code> e <code>raycastVoxel</code>, com demo interativa de colisão e de raycast:',
          en: '<code>KinematicBody</code>/<code>AABBPhysics</code> and <code>raycastVoxel</code>, with an interactive collision and raycast demo:'
        },
        seeAlso: [
          { label: { pt: 'KinematicBody — abrir na referência →', en: 'KinematicBody — open in the reference →' }, href: '/docs/api/kinematic-body/' },
          { label: { pt: 'raycastVoxel — abrir na referência →', en: 'raycastVoxel — open in the reference →' }, href: '/docs/api/raycast-voxel/' }
        ]
      }
    ]
  },
  {
    id: 'fluids',
    route: '/docs/fluids/',
    navIcon: 'water_drop',
    navLabel: { pt: 'Água e lava: simulação de fluidos', en: 'Water and lava: fluid simulation' },
    title: { pt: 'Água e Lava: Simulação de Fluidos', en: 'Water and Lava: Fluid Simulation' },
    lead: {
      pt: 'Um bloco marcado <code>fluid: true</code> no <code>BlockRegistry</code> (capítulo 4) é movimentado, tick a tick, por um autômato celular hidrostático: queda, cascata diagonal e nivelamento lateral.',
      en: 'A block marked <code>fluid: true</code> in the <code>BlockRegistry</code> (chapter 4) is moved, tick by tick, by a hydrostatic cellular automaton: fall, diagonal cascade, and lateral leveling.'
    },
    sourceFile: 'engine/physics/FluidCellularAutomata.ts',
    sections: [
      {
        id: 'overview',
        kind: 'overview',
        title: { pt: 'Por que não varrer o volume inteiro?', en: 'Why not sweep the whole volume?' },
        body: {
          pt: 'Um conjunto de células ativas (<code>activeSet</code>/<code>nextSet</code>) é o que mantém isso barato: assim que uma célula de fluido para de se mover por alguns ticks, ela "dorme" e sai do conjunto — o autômato só processa o que ainda está em movimento, não o volume inteiro a cada tick.',
          en: 'An active-cell set (<code>activeSet</code>/<code>nextSet</code>) is what keeps this cheap: once a fluid cell stops moving for a few ticks, it "sleeps" and leaves the set — the automaton only processes what is still moving, not the whole volume every tick.'
        }
      },
      {
        id: 'reference',
        kind: 'callout',
        calloutVariant: 'tip',
        title: { pt: 'Referência completa', en: 'Full reference' },
        body: {
          pt: '<code>FluidCellularAutomata</code> com uma simulação ao vivo dentro de um mundo de verdade:',
          en: '<code>FluidCellularAutomata</code> with a live simulation inside a real world:'
        },
        seeAlso: [{ label: { pt: 'FluidCellularAutomata — abrir na referência →', en: 'FluidCellularAutomata — open in the reference →' }, href: '/docs/api/fluid-ca/' }]
      }
    ]
  },
  {
    id: 'dimensions',
    route: '/docs/dimensions/',
    navIcon: 'public',
    navLabel: { pt: 'Múltiplos mundos: dimensões & atmosfera', en: 'Multiple worlds: dimensions & atmosphere' },
    title: { pt: 'Múltiplos Mundos: Dimensões & Atmosfera', en: 'Multiple Worlds: Dimensions & Atmosphere' },
    lead: {
      pt: 'Tudo que os capítulos anteriores montaram — gerador, blocos, render, física, fluidos — é amarrado por uma <code>DimensionDefinition</code>: o <code>DimensionRegistry</code> troca gerador, física (<code>gravity</code>, <code>friction</code>) e atmosfera (céu, névoa, ciclo dia/noite) como um conjunto.',
      en: 'Everything the previous chapters assembled — generator, blocks, render, physics, fluids — is tied together by a <code>DimensionDefinition</code>: the <code>DimensionRegistry</code> swaps generator, physics (<code>gravity</code>, <code>friction</code>) and atmosphere (sky, fog, day/night cycle) as one set.'
    },
    sourceFile: 'engine/dimension/Dimension.ts',
    sections: [
      {
        id: 'overview',
        kind: 'overview',
        title: { pt: 'Uma dimensão é dados, não código', en: 'A dimension is data, not code' },
        body: {
          pt: 'Trocar de dimensão não troca a implementação de nada — troca qual <code>generatorId</code> o chunk worker usa e quais parâmetros de física/atmosfera o engine worker aplica. O mesmo <code>WorldGenerator</code> de dois capítulos atrás pode servir a quantas dimensões quiser.',
          en: "Switching dimensions does not swap any implementation — it swaps which <code>generatorId</code> the chunk worker uses and which physics/atmosphere parameters the engine worker applies. The same <code>WorldGenerator</code> from two chapters ago can serve as many dimensions as you want."
        }
      },
      {
        id: 'reference',
        kind: 'callout',
        calloutVariant: 'tip',
        title: { pt: 'Referência completa', en: 'Full reference' },
        body: {
          pt: '<code>DimensionRegistry</code>, a <code>DimensionDefinition</code> inteira, e o <code>Sky</code> que consome a parte de atmosfera:',
          en: '<code>DimensionRegistry</code>, the full <code>DimensionDefinition</code>, and the <code>Sky</code> that consumes the atmosphere half:'
        },
        seeAlso: [
          { label: { pt: 'DimensionRegistry — abrir na referência →', en: 'DimensionRegistry — open in the reference →' }, href: '/docs/api/dimension-registry/' },
          { label: { pt: 'Sky — abrir na referência →', en: 'Sky — open in the reference →' }, href: '/docs/api/sky/' }
        ]
      }
    ]
  }
];

export const findPage = (id: string): DocPage | undefined => PAGES.find((p) => p.id === id);
