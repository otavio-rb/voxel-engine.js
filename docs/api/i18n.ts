/**
 * Internationalization (i18n) for @voxel/engine API Reference.
 * Provides English and Portuguese translations for groups, modules, headers, and UI controls.
 */

export function isEn(): boolean {
  if (typeof window === 'undefined') return false;
  const param = new URLSearchParams(window.location.search).get('lang');
  if (param === 'en') return true;
  if (param === 'pt') return false;
  if (window.location.pathname.includes('/docs/en/')) return true;
  return localStorage.getItem('voxel_docs_lang') === 'en';
}

export interface GroupI18n {
  title: string;
  blurb: string;
}

export interface ModuleI18n {
  summary: string;
  summaryPlain: string;
  exampleTitle: string;
  related?: string;
}

export const GROUP_TRANSLATIONS_EN: Record<string, GroupI18n> = {
  'main-thread': {
    title: 'Main Thread',
    blurb: 'What the page imports from <code>@voxel/engine</code>: the bridge — canvas, input, and events.'
  },
  'worker-runtime': {
    title: 'Worker Runtime',
    blurb: 'The entire engine runs inside a dedicated worker. The main thread only renders and sends inputs.'
  },
  'blocos-volume': {
    title: 'Blocks & Volume',
    blurb: 'Block type registry, dense 3D voxel volume, and the multi-strategy greedy mesher.'
  },
  'mundo': {
    title: 'World & Dimensions',
    blurb: 'Infinite chunk streaming with dedicated workers, procedural generators, and multi-dimension support.'
  },
  'fisica': {
    title: 'Physics & Player',
    blurb: 'Continuous AABB physics without ghost collisions, voxel DDA raycasting, and cellular automata fluids.'
  },
  'render': {
    title: 'Render & Shaders',
    blurb: 'WebGL PostProcessor with a modular pass pipeline (Bloom, SSAO, God Rays, FXAA), custom shaders, and real-time shadows.'
  },
  'entidades': {
    title: 'Entities & Effects',
    blurb: 'Dynamic entities with physics simulation and interpolation, and GPU particle system for block breaking.'
  }
};

export const MODULE_TRANSLATIONS_EN: Record<string, ModuleI18n> = {
  'voxel-engine': {
    summary: 'The bridge between your web page and the engine running in a Web Worker: handles offscreen canvas transfer, forwards user input, and re-emits game events.',
    summaryPlain: 'Bridge from the page to the worker: transferred canvas, forwarded input, re-emitted events.',
    exampleTitle: 'The entire engine, running on this page'
  },
  'event-emitter': {
    summary: 'Typed asynchronous event bus. Calling <code>on()</code> returns an unsubscribe callback for automatic cleanup.',
    summaryPlain: 'The engine event emitter; on() returns an unsubscribe function.',
    exampleTitle: 'Two listeners, one unsubscribe — demonstrated live'
  },
  'run-engine-worker': {
    summary: 'Entrypoint for the dedicated Engine Worker: initializes the world, player controller, rendering pipeline, and extensible plugins.',
    summaryPlain: 'The engine worker entrypoint: mounts world, player, render, and plugins.',
    exampleTitle: 'Live and editable worker configuration'
  },
  'engine-context': {
    summary: 'The unified API surface accessible to engine plugins inside the worker, providing direct access to subsystems and lifecycle hooks.',
    summaryPlain: 'What a plugin reaches inside the worker, plus lifecycle hooks.',
    exampleTitle: 'A custom plugin written here, executed inside the worker'
  },
  'command-registry': {
    summary: 'Slash command registry for in-game console commands, supporting aliases, normalization, and argument validation.',
    summaryPlain: 'Worker slash commands with aliases and name normalization.',
    exampleTitle: 'Real commands mutating the world step-by-step'
  },
  'game-loop': {
    summary: 'Fixed timestep simulation loop with an accumulator and sub-frame interpolation alpha for jitter-free rendering.',
    summaryPlain: 'Fixed timestep with accumulator and per-frame interpolation alpha.',
    exampleTitle: 'The same movement, with and without interpolation alpha'
  },
  'frame-profiler': {
    summary: 'Microsecond performance profiler tracking execution phases (physics, meshing, streaming, rendering) over a rolling window.',
    summaryPlain: 'Cost per frame phase, aggregated over a rolling time window.',
    exampleTitle: 'Measuring the real world, phase by phase'
  },
  'run-chunk-worker': {
    summary: 'Background worker dedicated to procedural terrain generation and greedy mesh generation, transferring geometry without serialization overhead.',
    summaryPlain: 'The worker that generates the volume and returns the ready mesh, zero-copy.',
    exampleTitle: 'A raw job sent to the worker, returning ready-to-render geometry'
  },
  'block-registry': {
    summary: 'Global block registry backed by bitflags and flat typed arrays for zero-allocation hot-path queries during collision and meshing.',
    summaryPlain: 'The block table: bitflags and flat arrays for hot-path queries.',
    exampleTitle: 'The entire block table, rendered as voxels'
  },
  'chunk-data': {
    summary: 'Dense 3D voxel storage container (typically 32x32x32) providing direct flat index access and light propagation buffers.',
    summaryPlain: 'Chunk volume data container and generator context.',
    exampleTitle: 'Excavating the volume and re-meshing on every step'
  },
  'chunk-geometry': {
    summary: 'Multi-strategy greedy mesher combining coplanar adjacent faces into optimized quads with per-vertex ambient occlusion.',
    summaryPlain: 'The greedy mesher: merges coplanar faces into quads and computes AO.',
    exampleTitle: 'Greedy vs. Naive meshing side-by-side with wireframe overlay'
  },
  'types': {
    summary: 'Binary protocol contracts between main thread and workers: flat struct definitions and transferable TypedArrays.',
    summaryPlain: 'Cross-thread contracts: flat structures and transferable TypedArrays.',
    exampleTitle: 'The same binary buffers, rendered in three different ways'
  },
  'world-generator': {
    summary: 'Procedural heightmap and 3D density function interface. Implement <code>generate(ctx)</code> to produce infinite terrain in parallel chunk workers.',
    summaryPlain: 'Implement generate(ctx) and chunk workers generate the world with it.',
    exampleTitle: 'Your custom generator, running on real chunk workers',
    related: 'Writing <code>generate(ctx)</code> by hand like this is the lowest level — the raw interface. For most worlds, reach for the ready-made abstraction instead: see <a href="/docs/api/terrain-generator/?lang=en"><code>createWorld</code></a> (terrain + biomes + caves from config), <a href="/docs/api/custom-generator/?lang=en"><code>customGenerator</code></a> (per-voxel density field) or the <a href="/docs/api/generator-types/?lang=en">generator types overview</a> comparing all of them.'
  },
  'terrain-generator': {
    summary: 'Composes a complete <code>WorldGenerator</code> from config — a stack of composable terrain layers (<code>baseTerrain</code>, <code>mountains</code>, <code>hills</code>, ...), biomes, surface layers and optional caves. <code>terrain</code> is an array, not a closed options object: each layer only adds to or replaces the height it received from the one before it, so stacking <code>[baseTerrain(), mountains(), hills()]</code> literally means "take the base shape, raise mountains where it makes sense, and throw smaller hills on top" — in whatever order you write them.',
    summaryPlain: 'Composable terrain layers + biomes + surface layers + caves, into a ready WorldGenerator.',
    exampleTitle: 'A complete world — mountains, hills, caves and a built-in plateau'
  },
  'custom-generator': {
    summary: 'The density-field escape hatch: a <code>sample({ x, y, z, ctx })</code> function that looks at one point and returns <code>{ density, material }</code> — <code>density &gt; 0</code> is solid, everything else is air. No heightmap, no biome, no layer in between: the volume loop and the <code>ctx.setBlock</code> calls are this function\'s job. Still just a <code>WorldGenerator</code> underneath — nothing here is inexpressible by hand-writing <code>generate(ctx)</code>, this just does the loop for you.',
    summaryPlain: 'One sample(x,y,z) per voxel, density + material — the engine handles the loop.',
    exampleTitle: 'An alien planet — a spherical density field, no heightmap at all'
  },
  'generator-types': {
    summary: 'Four ways to produce a <code>WorldGenerator</code>, from the most ready-made to the most raw — they all end up in the same place: an object with <code>id</code> and <code>generate(ctx)</code>, registered in <code>worldGeneratorRegistry</code>. Start with whichever one solves your world; only drop a level when composition isn\'t enough.',
    summaryPlain: 'The four ways to build a generator — from declarative createWorld down to the raw WorldGenerator — and when to reach for each.',
    exampleTitle: 'The recommended starting point: createWorld'
  },
  'cave-carver': {
    summary: 'Carves and decorates one chunk\'s caves: 3D "worm noise" tunnels + "cheese" chambers for the main network, plus ravines, shafts and geodes scattered on cell grids — all a pure function of world coordinates, so galleries line up seamlessly across chunks generated by different workers, in any order. Extracted and generalized out of an example that had 6 fixed cave biomes (dripstone, fungal, crystal, magma...) with block names baked into the code: here no block or biome is built in — everything arrives through <code>CaveCarverOptions.biomes</code>.',
    summaryPlain: 'Carves tunnels, chambers, ravines, shafts and geodes — biomes and decoration fully configurable.',
    exampleTitle: 'Caves alone, over a simple terrain'
  },
  'procedural-world': {
    summary: 'Infinite world orchestrator managing chunk streaming, LOD levels, daylight propagation, dynamic fluids, and live voxel destruction/placement.',
    summaryPlain: 'Chunk streaming, LOD, lighting, fluid dynamics, shadows, and voxel editing.',
    exampleTitle: 'Live world streaming with dynamic crater excavations'
  },
  'dimension-registry': {
    summary: 'Multi-dimension manager bundling terrain generator, physics rules, and atmospheric parameters into isolated world contexts.',
    summaryPlain: 'Generator, physics, and atmosphere in a single object; switching changes all three.',
    exampleTitle: 'Seamlessly switching dimensions every 8 seconds'
  },
  'sky': {
    summary: 'Procedural skybox rendering Rayleigh/Mie atmospheric scattering, dynamic sun and moon positions, starry background, and voxelized volumetric clouds.',
    summaryPlain: 'Atmosphere, sun, moon, stars, and clouds for the active dimension.',
    exampleTitle: 'Day/night cycle sweeping across a voxel volume'
  },
  'far-field-streamer': {
    summary: 'Horizon-scale low-detail voxel streaming system providing distant silhouettes without high-resolution memory overhead.',
    summaryPlain: 'Distant horizon in LOD: distant silhouette without full-resolution cost.',
    exampleTitle: 'Distant horizon rendered with concentric LOD rings'
  },
  'kinematic-body': {
    summary: 'Continuous axis-by-axis AABB collision resolution against voxel grids with automatic step-height handling and slope traversal.',
    summaryPlain: 'Axis-by-axis AABB collision against the voxel grid, with step height.',
    exampleTitle: 'Rigid bodies falling and colliding against real voxels'
  },
  'raycast-voxel': {
    summary: 'Fast 3D Digital Differential Analyzer (DDA) raycaster identifying the exact targeted voxel and normal impact face in O(distance).',
    summaryPlain: 'DDA grid raycasting: determines which block is targeted and on which face.',
    exampleTitle: 'Ray sweeping across the volume, highlighting target and face'
  },
  'fluid-ca': {
    summary: 'Mass-conserving cellular automata fluid simulator with active frontier tracking and tick budgeting for realistic liquid flow.',
    summaryPlain: 'Cellular automata fluid simulation with active frontier and tick budgeting.',
    exampleTitle: 'Real water cascading down authentic procedural terrain'
  },
  'player': {
    summary: 'First-person kinematic character controller managing input states, voxel-scaled physics, jumping, sprinting, and camera orientation.',
    summaryPlain: 'Player movement controller with physics constants and voxel scaling.',
    exampleTitle: 'Explore the world; locomotion mode switches every 10 seconds'
  },
  'player-interaction': {
    summary: 'Player crosshair targeting, outline highlighting, block mining with particle feedback, placement validation, and hotbar management.',
    summaryPlain: 'Crosshair, highlight, break, place, and hotbar inventory.',
    exampleTitle: 'Mine and place blocks with live console telemetry'
  },
  'rng': {
    summary: 'Fast, deterministic pseudo-random number generator (Mulberry32/PCG) ensuring reproducible procedural world seeds.',
    summaryPlain: 'Deterministic seeded RNG; guarantees reproducible worlds.',
    exampleTitle: 'Same seed, identical terrain — verified side-by-side'
  },
  'post-processor': {
    summary: 'Ping-pong framebuffer manager executing full-screen render passes with declarative scene uniform bindings.',
    summaryPlain: 'Fullscreen post-processing passes with ping-pong buffers and declarative uniforms.',
    exampleTitle: 'Your custom fullscreen post-processing shader on a voxel scene'
  },
  'shader-pipeline': {
    summary: 'Composable rendering pipeline bundling quality presets, screen effects, and pass coordination.',
    summaryPlain: 'Ready-to-use shader stack with quality presets.',
    exampleTitle: 'Five post-processing presets cycling every 5 seconds'
  },
  'cinematic-pass': {
    summary: 'High-end color grading and tone mapping pass featuring ACES filmic curves, exposure adjustment, vignette, and film grain.',
    summaryPlain: 'Tonemapping and color grading: film curve, exposure, vignette, grain.',
    exampleTitle: 'Three distinct cinematic looks applied to the same scene'
  },
  'post-passes': {
    summary: 'Modular WebGL post-processing shaders including HDR Bloom, Screen-Space Ambient Occlusion (SSAO), Volumetric God Rays, and FXAA.',
    summaryPlain: 'Independent passes for Bloom, SSAO, volumetric lighting, and FXAA.',
    exampleTitle: 'Isolating and previewing each post-processing pass independently'
  },
  'shadow-map': {
    summary: 'Cascaded directional sun shadow mapping with texel-grid snapping and percentage-closer filtering (PCF).',
    summaryPlain: 'Directional sunlight shadows with texel snapping and PCF smoothing.',
    exampleTitle: 'Shadows enabled, disabled, and tested at varying resolutions'
  },
  'brickmap': {
    summary: 'Sparse hierarchical 3D texture brickmap enabling real-time raymarched voxel rendering as an alternative to polygon meshing.',
    summaryPlain: 'Raymarched brickmap volume rendering as an alternative to polygon meshes.',
    exampleTitle: 'The same voxel world rendered entirely via GPU raymarching'
  },
  'voxel-particles': {
    summary: 'High-performance GPU instanced particle system with voxel-world collision resolution, spawning debris upon block destruction.',
    summaryPlain: 'Thousands of colliding particles rendered in a single draw call.',
    exampleTitle: 'Continuous particle fountain (isolated InstancedMesh)'
  },
  'entities': {
    summary: 'Lightweight entity-component management system supporting non-voxel dynamic actors, spatial queries, and named archetype registration.',
    summaryPlain: 'Non-voxel dynamic actors: AABB physics, custom meshes, and named spawning.',
    exampleTitle: 'Bouncing blob creatures traversing procedural terrain'
  }
};

export const UI_I18N = {
  pt: {
    topbarOverview: 'Visão Geral',
    topbarApi: 'API',
    topbarMainThread: 'Main Thread',
    sidebarOverview: 'Visão Geral',
    sidebarApiRef: 'Referência da API',
    breadcrumbDocs: 'Docs',
    breadcrumbApi: 'Referência da API',
    apiRefBadge: 'API REFERENCE',
    allDemoBadge: 'TODA DEMO É EXECUTÁVEL',
    indexTitle: 'A engine, módulo por módulo',
    indexDescription: (count: number) => `Uma página por módulo, com a assinatura real do código-fonte e uma demonstração que <strong>roda de verdade</strong> contra os módulos de <code class="font-code-inline text-emerald-700">engine/</code>. Todo exemplo é editável: mexa no código e execute. ${count} módulos documentados.`,
    sandboxCardHeading: 'Cada demo usa o sandbox mais barato que exercita o módulo, e nada além disso:',
    sandboxScene: '— volume de voxels gerado por <code class="font-code-inline">ChunkData</code>, malhado por <code class="font-code-inline">ChunkGeometry</code> e iluminado pelo <code class="font-code-inline">Sky</code>. Serve a colisão, raycast, partículas, entidades e passes de tela.',
    sandboxWorld: '— <code class="font-code-inline">ProceduralWorld</code> com chunk workers, só onde o streaming <em>é</em> o assunto: mundo, LOD, dimensões, fluidos, jogador e interação.',
    sandboxEngine: '— a engine inteira num worker, com OffscreenCanvas, para <code class="font-code-inline">VoxelEngine</code>, <code class="font-code-inline">runEngineWorker</code>, <code class="font-code-inline">EngineContext</code> e comandos.',
    sandboxFootnote: 'E todo cubo que aparece é voxel de verdade: volume preenchido e passado pelo mesher da engine, nunca <code class="font-code-inline">BoxGeometry</code>.',
    searchPlaceholder: 'Filtrar módulos: ChunkGeometry, fluido, shader…',
    signatures: 'Assinaturas',
    proofOfConcept: 'Prova de conceito',
    signatureCol: 'Assinatura',
    descriptionCol: 'O que faz',
    ready: 'pronto',
    running: 'rodando…',
    copy: 'copiar',
    reset: 'restaurar',
    stop: 'parar',
    run: 'Executar',
    edited: 'editado',
    previous: 'anterior',
    next: 'próximo',
    editorHint: 'Edite e execute (<kbd>Ctrl</kbd>+<kbd>Enter</kbd>). Roda contra os módulos reais da engine; as edições ficam salvas neste navegador.'
  },
  en: {
    topbarOverview: 'Overview',
    topbarApi: 'API',
    topbarMainThread: 'Main Thread',
    sidebarOverview: 'Overview',
    sidebarApiRef: 'API Reference',
    breadcrumbDocs: 'Docs',
    breadcrumbApi: 'API Reference',
    apiRefBadge: 'API REFERENCE',
    allDemoBadge: 'ALL DEMOS ARE LIVE & RUNNABLE',
    indexTitle: 'The engine, module by module',
    indexDescription: (count: number) => `One page per module, featuring the real source code signature and a live demonstration that <strong>actually runs</strong> against <code class="font-code-inline text-emerald-700">engine/</code> modules. Every example is editable: tweak the code and run. ${count} documented modules.`,
    sandboxCardHeading: 'Each demo uses the leanest sandbox that exercises the module, and nothing more:',
    sandboxScene: '— voxel volume generated by <code class="font-code-inline">ChunkData</code>, meshed by <code class="font-code-inline">ChunkGeometry</code>, and lit by <code class="font-code-inline">Sky</code>. Powers collisions, raycasts, particles, entities, and screen passes.',
    sandboxWorld: '— <code class="font-code-inline">ProceduralWorld</code> with chunk workers, used strictly where streaming <em>is</em> the focus: world, LOD, dimensions, fluids, player, and interaction.',
    sandboxEngine: '— the entire engine in a worker with OffscreenCanvas, for <code class="font-code-inline">VoxelEngine</code>, <code class="font-code-inline">runEngineWorker</code>, <code class="font-code-inline">EngineContext</code>, and commands.',
    sandboxFootnote: 'And every cube you see is a true voxel: a filled volume processed by the engine mesher, never <code class="font-code-inline">BoxGeometry</code>.',
    searchPlaceholder: 'Filter modules: ChunkGeometry, fluid, shader…',
    signatures: 'Signatures',
    proofOfConcept: 'Proof of Concept',
    signatureCol: 'Signature',
    descriptionCol: 'Description',
    ready: 'ready',
    running: 'running…',
    copy: 'copy',
    reset: 'reset',
    stop: 'stop',
    run: 'Run',
    edited: 'edited',
    previous: 'previous',
    next: 'next',
    editorHint: 'Edit and run (<kbd>Ctrl</kbd>+<kbd>Enter</kbd>). Runs against real engine modules; edits persist in this browser.'
  }
};

/**
 * Translates common Portuguese member descriptions into clean English.
 */
const DESC_MAP_EN: Record<string, string> = {
  '<b>Comece aqui.</b> Terreno (heightmap + montanhas/colinas componíveis), biomas, camadas de superfície e cavernas, tudo a partir de config — cobre a maioria dos mundos em poucas linhas. Ver <a href="/docs/api/terrain-generator/">createWorld</a>.':
    '<b>Start here.</b> Terrain (heightmap + composable mountains/hills), biomes, surface layers and caves, all from config — covers most worlds in a few lines. See <a href="/docs/api/terrain-generator/?lang=en">createWorld</a>.',
  'Quando o relevo não é uma função de altura (esferas flutuantes, cavidades fechadas, formas arbitrárias): um campo de densidade por voxel, a engine cuida do loop. Ver <a href="/docs/api/custom-generator/">customGenerator</a>.':
    "When the terrain isn't a function of height (floating spheres, enclosed cavities, arbitrary shapes): a per-voxel density field, the engine handles the loop. See <a href=\"/docs/api/custom-generator/?lang=en\">customGenerator</a>.",
  'Só o subsolo: talha túneis/câmaras/ravinas/geodos sobre QUALQUER superfície sua (de <code>createWorld</code>, <code>customGenerator</code> ou escrita à mão) — não é um gerador completo por si, compõe com um dos três. Ver <a href="/docs/api/cave-carver/">CaveCarver</a>.':
    "Just the underground: carves tunnels/chambers/ravines/geodes over ANY surface of yours (from <code>createWorld</code>, <code>customGenerator</code>, or hand-written) — not a complete generator on its own, it composes with one of the three. See <a href=\"/docs/api/cave-carver/?lang=en\">CaveCarver</a>.",
  'O nível cru: você mesmo escreve o laço pela coluna/voxel e chama <code>ctx.setBlock</code>. Sem limite de expressividade, sem composição ganha de graça. Ver <a href="/docs/api/world-generator/">WorldGenerator</a>.':
    "The raw level: you write the column/voxel loop yourself and call <code>ctx.setBlock</code>. No ceiling on expressiveness, no composition for free. See <a href=\"/docs/api/world-generator/?lang=en\">WorldGenerator</a>.",
  "O worker é criado no call site (<code>new Worker(new URL('./engine.worker.ts', import.meta.url), { type: 'module' })</code>) para o bundler encontrá-lo. O canvas é transferido no construtor.": "The worker is created at the call site (<code>new Worker(new URL('./engine.worker.ts', import.meta.url), { type: 'module' })</code>) so the bundler can find it. The canvas is transferred in the constructor.",
  'Libera a simulação no worker (equivale ao comando <code>/start</code>).': 'Releases the simulation in the worker (equivalent to the <code>/start</code> command).',
  'Pointer lock do canvas; no-op em modo mobile.': 'Pointer lock for the canvas; a no-op in mobile mode.',
  'Congela o input — é o que mantém esta página digitável enquanto a engine roda ao lado.': 'Freezes input — this is what keeps this page typable while the engine runs alongside it.',
  'Troca pointer lock por controles de toque.': 'Swaps pointer lock for touch controls.',
  'Injeta input (controles mobile, UI, testes).': 'Injects input (mobile controls, UI, tests).',
  'Hotbar do jogador, no worker.': "The player's hotbar, inside the worker.",
  '<code>sendCommand</code> dispara um comando registrado; <code>send</code> fala com plugins via <code>ctx.onMessage</code>.': '<code>sendCommand</code> triggers a registered command; <code>send</code> talks to plugins via <code>ctx.onMessage</code>.',
  'Atalhos para os comandos equivalentes.': 'Shortcuts for the equivalent commands.',
  'Uma vez por segundo: <code>fps</code>, <code>frameTimeMs</code>, <code>renderTimeMs</code>, <code>triangles</code>, <code>calls</code>, <code>loadedChunks</code>, <code>workers</code>, <code>gpuMemoryMB</code>, <code>voxelRamMB</code>, <code>dimension</code>, <code>isUnderwater</code>.': 'Once per second: <code>fps</code>, <code>frameTimeMs</code>, <code>renderTimeMs</code>, <code>triangles</code>, <code>calls</code>, <code>loadedChunks</code>, <code>workers</code>, <code>gpuMemoryMB</code>, <code>voxelRamMB</code>, <code>dimension</code>, <code>isUnderwater</code>.',
  'Eventos vindos do worker, mais o estado do pointer lock.': 'Events coming from the worker, plus the pointer lock state.',
  'Solta o ponteiro, remove os listeners e encerra o worker (e os chunk workers que ele abriu).': 'Releases the pointer, removes the listeners, and terminates the worker (and the chunk workers it opened).',
  'Assina e devolve a função que cancela.': 'Subscribes and returns the unsubscribe function.',
  'Remove um listener específico.': 'Removes a specific listener.',
  'Dispara. Um listener que lança não impede os outros.': "Fires the event. A listener that throws doesn't block the others.",
  'Remove todos os listeners.': 'Removes all listeners.',
  'Obrigatório. Fábrica do chunk worker; a entry dele chama <code>runChunkWorker</code>.': 'Required. Factory for the chunk worker; its entry calls <code>runChunkWorker</code>.',
  'Roda antes do mundo existir: registre blocos, dimensões, geradores e entidades.': 'Runs before the world exists: register blocks, dimensions, generators, and entities.',
  'Cada <code>setup(ctx)</code> é chamado depois que o mundo existe.': "Each plugin's <code>setup(ctx)</code> is called after the world exists.",
  '<code>chunkSize</code>, <code>renderDistance</code>, <code>voxelsPerBlock</code>, <code>lodRings</code>, <code>greedyMeshing</code>, <code>voxelGrain</code>, <code>voxelEdge</code>, <code>chunkRenderer</code>…': '<code>chunkSize</code>, <code>renderDistance</code>, <code>voxelsPerBlock</code>, <code>lodRings</code>, <code>greedyMeshing</code>, <code>voxelGrain</code>, <code>voxelEdge</code>, <code>chunkRenderer</code>…',
  'Blocos nas teclas numéricas e onde o jogador nasce.': 'Blocks on the number keys, and where the player spawns.',
  'Taxa do tick fixo e escala relativa do jogador (0.35 ≈ miniatura, para micro-voxel).': "The fixed tick rate and the player's relative scale (0.35 ≈ miniature, for micro-voxel worlds).",
  'Os objetos Three.js do worker.': "The worker's Three.js objects.",
  'Streaming de chunks, movimento, quebra e colocação.': 'Chunk streaming, movement, breaking, and placing.',
  'Pool compartilhado: a engine simula, o plugin decide o que emitir.': 'Shared pool: the engine simulates, the plugin decides what to emit.',
  'A pilha de tela cheia e o grading.': 'The full-screen pass stack and the color grading.',
  'Comandos de barra do worker.': "The worker's slash commands.",
  'A simulação fica parada até <code>/start</code>.': 'The simulation stays paused until <code>/start</code>.',
  'Conversa com a main thread nos dois sentidos.': 'Talks to the main thread in both directions.',
  '<code>fixedUpdate</code> traz <code>{ deltaMs, dtScale }</code>; <code>render</code> traz <code>{ alpha, frameDeltaMs }</code>. O que mexer na câmera em <code>predraw</code> precisa desfazer em <code>postdraw</code>.': '<code>fixedUpdate</code> carries <code>{ deltaMs, dtScale }</code>; <code>render</code> carries <code>{ alpha, frameDeltaMs }</code>. Anything that moves the camera in <code>predraw</code> must undo it in <code>postdraw</code>.',
  'Spawn adiado até o terreno em volta chegar dos workers.': 'Spawn is delayed until the surrounding terrain arrives from the workers.',
  '<code>CommandHandler = (args: string[], ctx: EngineContext) =&gt; void</code>.': '<code>CommandHandler = (args: string[], ctx: EngineContext) =&gt; void</code>.',
  'Consulta o que existe.': 'Looks up what exists.',
  '<code>false</code> quando o comando não existe.': "<code>false</code> when the command doesn't exist.",
  'Da main thread e de dentro do worker, respectivamente.': 'From the main thread and from inside the worker, respectively.',
  '<code>onFixedUpdate(fixedDeltaMs, dtScale)</code> e <code>onRender(alpha, frameDeltaMs)</code>.': '<code>onFixedUpdate(fixedDeltaMs, dtScale)</code> and <code>onRender(alpha, frameDeltaMs)</code>.',
  'Liga e desliga o <code>requestAnimationFrame</code>.': 'Starts and stops the <code>requestAnimationFrame</code> loop.',
  '<code>1000 / targetTps</code>.': '<code>1000 / targetTps</code>.',
  'Tamanho da janela de agregação.': 'The size of the aggregation window.',
  'Mede uma fase e devolve o retorno dela.': 'Measures a phase and returns its result.',
  'Soma tempo medido por fora (um timer de GPU, por exemplo).': 'Adds externally measured time (a GPU timer, for example).',
  '<code>{ fps, worstFrameMs, windowMs, phases }</code> quando a janela fecha; <code>null</code> no resto.': '<code>{ fps, worstFrameMs, windowMs, phases }</code> when the window closes; <code>null</code> otherwise.',
  'O <code>ProceduralWorld</code> reporta as fases dele (chunks, luz, costura, malha) no profiler que você ligar.': 'The <code>ProceduralWorld</code> reports its own phases (chunks, lighting, stitching, meshing) to whichever profiler you attach.',
  'Chamado uma vez, na entry do worker.': "Called once, in the worker's entry point.",
  'Registra blocos e geradores NESTE worker — registros não atravessam threads.': "Registers blocks and generators in THIS worker — registrations don't cross threads.",
  '<code>chunkKey</code>, limites <code>startX…endZ</code>, <code>size</code>, <code>worldParams</code>, <code>neighbourBorderBlocks</code>, <code>buildMesh</code>, <code>greedyMeshing</code>, <code>lodStep</code>, <code>voxelsPerBlock</code>, e <code>existingBlocks</code> para rebuild.': '<code>chunkKey</code>, the <code>startX…endZ</code> bounds, <code>size</code>, <code>worldParams</code>, <code>neighbourBorderBlocks</code>, <code>buildMesh</code>, <code>greedyMeshing</code>, <code>lodStep</code>, <code>voxelsPerBlock</code>, and <code>existingBlocks</code> for rebuilds.',
  '<code>chunkData</code>, <code>borders</code>, <code>opaque</code>/<code>water</code> (<code>GeometryData</code>), <code>light</code>, <code>uniform</code>.': '<code>chunkData</code>, <code>borders</code>, <code>opaque</code>/<code>water</code> (<code>GeometryData</code>), <code>light</code>, <code>uniform</code>.',
  '<code>id</code>, <code>name</code>, <code>color</code>, <code>solid</code>, <code>opaque</code>, <code>fluid</code>, <code>flows</code>, <code>swimmable</code>, <code>transparent</code>, <code>luminance</code>, <code>lightOpacity</code>, <code>slipperiness</code>, <code>air</code>, <code>meshType</code>.': '<code>id</code>, <code>name</code>, <code>color</code>, <code>solid</code>, <code>opaque</code>, <code>fluid</code>, <code>flows</code>, <code>swimmable</code>, <code>transparent</code>, <code>luminance</code>, <code>lightOpacity</code>, <code>slipperiness</code>, <code>air</code>, <code>meshType</code>.',
  'A configuração completa.': 'The complete configuration.',
  'Consultas de bitflag, O(1) e sem alocar.': 'Bitflag queries, O(1) and allocation-free.',
  'Luz perdida ao atravessar, luz emitida, atrito no chão e cor base.': 'Light lost when passing through, emitted light, ground friction, and base color.',
  "<code>meshType: 'microvoxel' | 'cross'</code> troca o cubo por um modelo 3D (plantas, vinhas).": "<code>meshType: 'microvoxel' | 'cross'</code> swaps the cube for a 3D model (plants, vines).",
  'O construtor já chama o gerador de <code>worldParams.worldType</code>.': 'The constructor already calls the generator for <code>worldParams.worldType</code>.',
  'Coordenadas de mundo; fora do chunk vira no-op / <code>-1</code>.': 'World coordinates; outside the chunk becomes a no-op / <code>-1</code>.',
  'Índice da célula, ou <code>-1</code>. É aqui que a divisão por <code>stride</code> acontece.': "The cell's index, or <code>-1</code>. This is where the division by <code>stride</code> happens.",
  'Ruído fractal normalizado, pela seed do mundo.': "Normalized fractal noise, seeded by the world's seed.",
  'Layout <code>(y * size + z) * size + x</code>; água de 0 a 255.': 'Layout <code>(y * size + z) * size + x</code>; water levels range from 0 to 255.',
  'O payload transferível que vai ao mesher.': 'The transferable payload that goes to the mesher.',
  '<code>greedyMeshing: false</code> cai no mesher naïve — um quad por face.': '<code>greedyMeshing: false</code> falls back to the naive mesher — one quad per face.',
  '<code>positions</code>, <code>normals</code>, <code>uvs</code>, <code>colors</code>, <code>ao</code>, <code>light</code>, <code>isWater</code>, <code>creationTime</code> e <code>vertices</code> (índices).': '<code>positions</code>, <code>normals</code>, <code>uvs</code>, <code>colors</code>, <code>ao</code>, <code>light</code>, <code>isWater</code>, <code>creationTime</code>, and <code>vertices</code> (indices).',
  'Fatias de 1 bloco dos vizinhos: <code>negX</code>, <code>posX</code>, <code>negY</code>, <code>posY</code>, <code>negZ</code>, <code>posZ</code>.': 'One-block-thick slices from the neighbors: <code>negX</code>, <code>posX</code>, <code>negY</code>, <code>posY</code>, <code>negZ</code>, <code>posZ</code>.',
  'Luz empacotada (<code>sky &lt;&lt; 4 | block</code>); <code>undefined</code> = tudo iluminado pelo céu.': 'Packed light (<code>sky &lt;&lt; 4 | block</code>); <code>undefined</code> means everything is sky-lit.',
  '<code>TerrainParams { scale, magnitude, offset, octaves, persistence }</code>.': '<code>TerrainParams { scale, magnitude, offset, octaves, persistence }</code>.',
  'O volume pronto para o mesher.': 'The volume ready for the mesher.',
  'Fatias de 1 bloco por face, guardadas por chunk.': 'One-block slices per face, stored per chunk.',
  'Atributos do mesh; <code>vertices</code> é o índice <code>Uint32Array</code>.': 'Mesh attributes; <code>vertices</code> is the <code>Uint32Array</code> index.',
  'O job que vai e volta do chunk worker.': 'The job that travels to and from the chunk worker.',
  'Geometria de face usada pelo mesher e pelos micro-voxels.': 'Face geometry used by the mesher and by micro-voxels.',
  'Casa com <code>worldParams.worldType</code> e com <code>DimensionDefinition.generatorId</code>.': 'Matches <code>worldParams.worldType</code> and <code>DimensionDefinition.generatorId</code>.',
  'Escreve no volume com <code>ctx.setBlock</code>.': 'Writes into the volume with <code>ctx.setBlock</code>.',
  '<code>stride &gt; 1</code> é um chunk de LOD: avance os laços de <code>stride</code> em <code>stride</code>.': '<code>stride &gt; 1</code> means an LOD chunk: advance the loops by <code>stride</code> at a time.',
  'Ruído determinístico pela seed do mundo.': "Deterministic noise, seeded by the world's seed.",
  'Singleton por thread; IDs comparados em minúsculas.': 'Singleton per thread; IDs are compared in lowercase.',
  '<code>lodRings: [8, 14, 20]</code> = resolução cheia até 8 chunks, metade até 14, um quarto até 20. Cada passo precisa dividir <code>chunkSize</code>.': '<code>lodRings: [8, 14, 20]</code> = full resolution up to 8 chunks, half up to 14, a quarter up to 20. Each step must evenly divide <code>chunkSize</code>.',
  'Um passo: céu, entidades, fluidos, streaming e costura de luz, com orçamento de tempo por quadro.': 'One step: sky, entities, fluids, streaming, and light stitching, with a per-frame time budget.',
  'Leitura e escrita de voxel, com rebuild do chunk e dos vizinhos de borda.': 'Voxel read/write, rebuilding the chunk and its border neighbors.',
  'Caminho em lote: milhares de escritas, um rebuild só no fim. É o que o autômato de fluidos usa.': 'Batch path: thousands of writes, a single rebuild at the end. This is what the fluid automaton uses.',
  'Escultura esférica — a base do modo micro-voxel.': 'Spherical sculpting — the basis of the micro-voxel mode.',
  'Trocar de dimensão refaz céu, física e gerador.': 'Switching dimension rebuilds sky, physics, and generator.',
  'Sombra direcional e as leituras que os efeitos consomem.': 'Directional shadow and the readings consumed by the effects.',
  'A telemetria que vira <code>EngineStats</code>.': 'The telemetry that becomes <code>EngineStats</code>.',
  'Altura da primeira coluna seca — o spawn usa isso para não nascer no mar.': 'Height of the first dry column — spawn uses this to avoid spawning in the sea.',
  '<code>generatorId</code> aponta para um <code>WorldGenerator</code> registrado.': '<code>generatorId</code> points to a registered <code>WorldGenerator</code>.',
  'Entra no <code>Player</code> quando a dimensão é ativada.': 'Applied to the <code>Player</code> when the dimension is activated.',
  'Consumida pelo <code>Sky</code> e pelos materiais do mundo.': "Consumed by the <code>Sky</code> and the world's materials.",
  'Singleton por thread; a primeira registrada é a inicial.': 'Singleton per thread; the first one registered is the initial dimension.',
  'Troca em tempo de execução, com recarga dos chunks.': 'Switches at runtime, reloading the chunks.',
  'Reconstrói o céu com a atmosfera da dimensão.': "Rebuilds the sky with the dimension's atmosphere.",
  "<code>'day'</code>/<code>'sunrise'</code>, <code>'noon'</code>/<code>'midday'</code>, <code>'sunset'</code>/<code>'night'</code>, <code>'midnight'</code>, ou um número em radianos.": "<code>'day'</code>/<code>'sunrise'</code>, <code>'noon'</code>/<code>'midday'</code>, <code>'sunset'</code>/<code>'night'</code>, <code>'midnight'</code>, or a number in radians.",
  '<code>daylight</code> vai de 0 (noite) a 1 (meio-dia).': '<code>daylight</code> ranges from 0 (night) to 1 (midday).',
  'O que a volumétrica, a sombra e a névoa consomem.': 'What the volumetrics, shadow, and fog consume.',
  'Distâncias em chunks: cheia até o 1º, metade até o 2º, um quarto até o 3º, um oitavo além. Cada passo precisa dividir <code>chunkSize</code>.': 'Distances in chunks: full up to the 1st ring, half up to the 2nd, a quarter up to the 3rd, an eighth beyond. Each step must evenly divide <code>chunkSize</code>.',
  'Como o LOD chega ao gerador: ele só avança os laços de <code>stride</code> em <code>stride</code>.': 'How LOD reaches the generator: it only advances its loops by <code>stride</code> at a time.',
  'Chamado pelo mundo a cada quadro; descarta o que saiu de alcance.': 'Called by the world every frame; discards whatever fell out of range.',
  'Padrões: <code>gravity 0.008</code>, <code>friction 0.9</code>, <code>stepHeight 0.6 * unitScale</code>.': 'Defaults: <code>gravity 0.008</code>, <code>friction 0.9</code>, <code>stepHeight 0.6 * unitScale</code>.',
  'Estado do corpo, em unidades de mundo.': "The body's state, in world units.",
  'Gravidade, integração e resolução eixo a eixo em um passo.': 'Gravity, integration, and axis-by-axis resolution in a single step.',
  '<code>{ x, y, z, collidedX, collidedY, collidedZ, onGround }</code>.': '<code>{ x, y, z, collidedX, collidedY, collidedZ, onGround }</code>.',
  'Testes pontuais e a caixa atual.': 'Point tests and the current bounding box.',
  'O <code>ProceduralWorld</code> implementa isso — e qualquer objeto seu também pode.': 'The <code>ProceduralWorld</code> implements this — and so can any object of yours.',
  'O predicado padrão é <code>blockRegistry.isInteractable</code>.': 'The default predicate is <code>blockRegistry.isInteractable</code>.',
  'A única coisa exigida do mundo.': 'The only thing required from the world.',
  '<code>blockPos + faceNormal</code> é onde um bloco novo seria colocado.': '<code>blockPos + faceNormal</code> is where a new block would be placed.',
  'O <code>world</code> precisa de <code>chunkSize</code>, <code>getBlock</code>, <code>setBlockFast</code> e <code>flushDirtyChunks</code>.': 'The <code>world</code> needs <code>chunkSize</code>, <code>getBlock</code>, <code>setBlockFast</code>, and <code>flushDirtyChunks</code>.',
  '<code>update</code> acumula tempo e chama <code>step</code>; <code>step</code> roda um tick inteiro.': '<code>update</code> accumulates time and calls <code>step</code>; <code>step</code> runs one full tick.',
  'Acordar é o que coloca células no conjunto ativo.': 'Waking is what puts cells into the active set.',
  'Nascentes emitem fluido a cada 4 ticks.': 'Springs emit fluid every 4 ticks.',
  'Telemetria e a chave geral (comando <code>/fluid</code>).': 'Telemetry and the master switch (the <code>/fluid</code> command).',
  'O <code>ProceduralWorld</code> já cria e roda um, dentro do <code>tick</code>.': 'The <code>ProceduralWorld</code> already creates and runs one, inside its own <code>tick</code>.',
  'O empacotamento usado pelos conjuntos.': 'The packing scheme used by the sets.',
  "<code>'normal'</code> = survival com gravidade; <code>'debug'</code> = criativo com voo.": "<code>'normal'</code> = survival with gravity; <code>'debug'</code> = creative with flight.",
  'Tick fixo e interpolação no quadro.': 'Fixed tick and per-frame interpolation.',
  'Input, encaminhado pelo <code>VoxelEngine</code> no jogo.': 'Input, forwarded by the <code>VoxelEngine</code> in-game.',
  'Ganchos para plugins empurrarem o jogador.': 'Hooks for plugins to push the player around.',
  '<code>body</code> é o corpo AABB; <code>controls</code> guarda yaw/pitch.': '<code>body</code> is the AABB body; <code>controls</code> holds yaw/pitch.',
  'GRAVITY 0.08, JUMP_VELOCITY 0.42, WALK_SPEED 0.1, TICK_MS 50…': 'GRAVITY 0.08, JUMP_VELOCITY 0.42, WALK_SPEED 0.1, TICK_MS 50…',
  'Os callbacks viram os eventos do <code>EngineContext</code>.': "The callbacks become the <code>EngineContext</code>'s events.",
  'Hotbar nas teclas numéricas e na roda do mouse.': 'Hotbar on the number keys and the mouse wheel.',
  'Botão 0 quebra, 2 coloca, com auto-repeat enquanto segurado.': 'Button 0 breaks, 2 places, with auto-repeat while held.',
  'Faz o raycast, atualiza o destaque e aplica a ação pendente.': 'Performs the raycast, updates the highlight, and applies the pending action.',
  'Ação única — usada pelos controles de toque.': 'A single action — used by touch controls.',
  'Mesma seed, mesma sequência.': 'Same seed, same sequence.',
  'Float em <code>[0, 1)</code>, no lugar de <code>Math.random</code>.': 'A float in <code>[0, 1)</code>, in place of <code>Math.random</code>.',
  'Como o <code>ChunkData</code> usa: o ruído inteiro herda o determinismo.': 'The same way <code>ChunkData</code> uses it: the whole noise field inherits the determinism.',
  'Ordenados por <code>order</code> (padrão 0).': 'Sorted by <code>order</code> (default 0).',
  'Desenha a cena no alvo e roda a cadeia de passes até a tela.': 'Renders the scene to the target and runs the pass chain through to the screen.',
  'O <code>PostProcessor</code> injeta <code>tDiffuse</code> e desenha o quad com o seu material.': 'The <code>PostProcessor</code> injects <code>tDiffuse</code> and draws the quad with your material.',
  'O estado do quadro, exposto aos passes.': "The frame's state, exposed to the passes.",
  'Vertex shader do quad e a ligação manual dos uniforms, para passes internos.': "The quad's vertex shader and the manual uniform binding, for internal passes.",
  '<code>tDepth</code>, <code>uResolution</code>, <code>uTexel</code>, <code>uTime</code>, <code>uNear</code>, <code>uFar</code>, <code>uProjection</code>, <code>uInvProjection</code>, <code>uView</code>, <code>uInvView</code>, <code>uCameraPos</code>, <code>uSunDirection</code>, <code>uSunScreen</code>, <code>uSunColor</code>, <code>uSkyColor</code>, <code>uDaylight</code>, <code>uUnderwater</code>, <code>uWetness</code>, <code>uWorldScale</code>.': '<code>tDepth</code>, <code>uResolution</code>, <code>uTexel</code>, <code>uTime</code>, <code>uNear</code>, <code>uFar</code>, <code>uProjection</code>, <code>uInvProjection</code>, <code>uView</code>, <code>uInvView</code>, <code>uCameraPos</code>, <code>uSunDirection</code>, <code>uSunScreen</code>, <code>uSunColor</code>, <code>uSkyColor</code>, <code>uDaylight</code>, <code>uUnderwater</code>, <code>uWetness</code>, <code>uWorldScale</code>.',
  '<code>low</code> liga só o grading; <code>medium</code> soma bloom e FXAA; <code>high</code> soma volumétrica; <code>ultra</code> soma SSAO e reforça AO e god rays.': '<code>low</code> enables grading only; <code>medium</code> adds bloom and FXAA; <code>high</code> adds volumetrics; <code>ultra</code> adds SSAO and boosts AO and god rays.',
  'Chave geral sem perder o preset (<code>/shaders</code>).': 'Master switch without losing the preset (<code>/shaders</code>).',
  'Por quadro: câmera, direção e cor do sol, cor do céu, <code>daylight</code>, submerso, <code>wetness</code>.': 'Per frame: camera, sun direction and color, sky color, <code>daylight</code>, underwater, <code>wetness</code>.',
  'Os passes, para ajuste fino direto.': 'The passes themselves, for direct fine-tuning.',
  'Libera os alvos de render.': 'Releases the render targets.',
  'A curva de tonemapping.': 'The tonemapping curve.',
  'Exposição por fase do ciclo.': 'Exposure per cycle phase.',
  'Grading de cor.': 'Color grading.',
  'Efeitos de lente; <code>setBloom</code> encaminha para o <code>BloomPass</code>.': 'Lens effects; <code>setBloom</code> forwards to the <code>BloomPass</code>.',
  'Onde ele vive na pilha.': 'Where it lives in the stack.',
  'Bloom por downsample/upsample, com limiar e força.': 'Bloom via downsample/upsample, with threshold and strength.',
  'Oclusão de ambiente em espaço de tela, a partir da profundidade (<code>needsDepth</code>).': 'Screen-space ambient occlusion, derived from depth (<code>needsDepth</code>).',
  'God rays na direção do sol, usando <code>sunScreen</code> do <code>PostFrame</code>.': 'God rays along the sun direction, using <code>sunScreen</code> from <code>PostFrame</code>.',
  'Antialiasing barato; é o último da fila.': "Cheap antialiasing; it's last in the queue.",
  'O quad e o vertex shader que todo passe reaproveita.': 'The quad and vertex shader every pass reuses.',
  'Trechos GLSL compartilhados.': 'Shared GLSL snippets.',
  'O mundo cria e mantém o mapa: <code>{ resolution, radius, strength, softness }</code>.': 'The world creates and maintains the map: <code>{ resolution, radius, strength, softness }</code>.',
  'Desenhado antes da cena, e antes dos efeitos de câmera.': 'Rendered before the scene, and before the camera effects.',
  'Ajuste em tempo de execução (<code>/shadows</code>, <code>/shadowsoft</code>).': 'Runtime tuning (<code>/shadows</code>, <code>/shadowsoft</code>).',
  'Quantização do sol e do deslocamento: é o que mata o shimmer.': 'Quantization of the sun and the offset: this is what kills the shimmer.',
  'Camada que define o que projeta sombra.': 'The layer that defines what casts shadow.',
  'A opção que escolhe o caminho; <code>/brickmap</code> alterna em runtime.': 'The option that picks the path; <code>/brickmap</code> toggles it at runtime.',
  'Mantém os bricks residentes na GPU e o índice esparso conforme os chunks entram e saem.': 'Keeps the resident bricks on the GPU and the sparse index in sync as chunks come and go.',
  'Passe de tela cheia que marcha o ray pelo brickmap e resolve normal e material no fragment.': 'Full-screen pass that marches the ray through the brickmap and resolves normal and material in the fragment shader.',
  'Campo de luz emissiva amostrado pelo raymarch (blocos com <code>luminance</code>).': 'Emissive light field sampled by the raymarch (blocks with <code>luminance</code>).',
  'Textura 3D com upload parcial, para atualizar só os bricks sujos.': '3D texture with partial upload, to update only the dirty bricks.',
  'O brickmap só aloca as texturas depois que existe contexto WebGL.': 'The brickmap only allocates its textures once a WebGL context exists.',
  'Além do limite, as mais antigas são recicladas.': 'Beyond the limit, the oldest ones are recycled.',
  'Velocidade em blocos por tick; <code>lifetime</code> em ticks de 50 ms. Padrões: <code>size 0.15</code>, <code>lifetime 20</code>, <code>gravity 0.04</code>, <code>drag 0.98</code>.': 'Speed in blocks per tick; <code>lifetime</code> in 50 ms ticks. Defaults: <code>size 0.15</code>, <code>lifetime 20</code>, <code>gravity 0.04</code>, <code>drag 0.98</code>.',
  'Tick fixo de 50 ms por dentro.': 'A fixed 50 ms tick internally.',
  'O objeto já adicionado ao <code>parent</code>.': 'The object, already added to the <code>parent</code>.',
  'Já monta <code>body: KinematicBody</code> e um mesh de caixa.': 'Already sets up <code>body: KinematicBody</code> and a box mesh.',
  'O comportamento é da subclasse; <code>applyPhysics(dtScale)</code> resolve o movimento.': 'Behavior belongs to the subclass; <code>applyPhysics(dtScale)</code> resolves movement.',
  'Atalhos para o corpo.': 'Shortcuts to the body.',
  'Ciclo de vida visual.': 'Visual lifecycle.',
  'Ganchos para a subclasse.': 'Hooks for the subclass.',
  '<code>EntityFactory = (world, x, y, z) =&gt; Entity</code>.': '<code>EntityFactory = (world, x, y, z) =&gt; Entity</code>.',
  'O resultado já tem <code>id</code> e <code>generate(ctx)</code> — registre direto em <code>worldGeneratorRegistry</code>.': 'The result already has <code>id</code> and <code>generate(ctx)</code> — register it directly with <code>worldGeneratorRegistry</code>.',
  'Repassado pra <code>sampleHeight</code>. Só <code>height</code> tem default (128) — o resto reproduz o terreno de <code>StandardWorldGenerator</code> se você não mexer.': 'Passed through to <code>sampleHeight</code>. Only <code>height</code> has a default (128) — everything else reproduces <code>StandardWorldGenerator</code>\'s terrain if you leave it alone.',
  'Repassado pra <code>classifyBiome</code>: a primeira regra da lista cujo <code>test(climate)</code> der true vence — sem lista de biomas embutida na engine.': 'Passed through to <code>classifyBiome</code>: the first rule in the list whose <code>test(climate)</code> returns true wins — no biome list is built into the engine.',
  'Uma entrada por id de bioma (<code>{ top?, fill?, stoneBlockId }</code>); bioma sem entrada fica sem blocos nessa coluna.': 'One entry per biome id (<code>{ top?, fill?, stoneBlockId }</code>); a biome with no entry gets no blocks in that column.',
  'Minério espalhado por ruído 3D abaixo de <code>oreMinDepth</code> blocos (padrão 8), só onde a coluna ainda é <code>stoneBlockId</code>.': 'Ore scattered by 3D noise below <code>oreMinDepth</code> blocks (default 8), only where the column is still <code>stoneBlockId</code>.',
  'Omitido = mundo sem caverna nenhuma. <code>sampleSurfaceHeight</code> já sai ligado ao mesmo heightmap — só falta biomas/blocos de caverna.': 'Omit it for a cave-free world. <code>sampleSurfaceHeight</code> is already wired to the same heightmap — you only need to supply cave biomes/blocks.',
  '<code>options.biomes</code> é avaliada em ordem (primeira regra que bater vence); a última entrada é o fallback.': '<code>options.biomes</code> is evaluated in order (the first matching rule wins); the last entry is the fallback.',
  'Talha, forra as paredes, posiciona geodos (se configurados) e decora. Uma vez por chunk.': 'Carves, lines the walls, places geodes (if configured), and decorates. Once per chunk.',
  'Qual id de bioma ocupa esse ponto — útil pra outro sistema (árvores, estruturas) concordar com a caverna.': 'Which biome id occupies that point — useful for another system (trees, structures) to agree with the cave.',
  'Forma do talhe + material de forro; campos opcionais (<code>blotchWallBlock</code>, <code>veinBlock</code>, <code>floodsWithLava</code>, <code>allowsGeodes</code>) cobrem as variações mais comuns sem precisar reescrever a talha.': 'Carve shape + lining material; optional fields (<code>blotchWallBlock</code>, <code>veinBlock</code>, <code>floodsWithLava</code>, <code>allowsGeodes</code>) cover the most common variations without rewriting the carve itself.',
  'Chamado por célula de ar exposta (chão/teto/água) dentro do bioma. <code>h</code> dá <code>clearance</code>, <code>isAir/isSolid/isWater</code> e um hash estável pra sorteio.': 'Called per exposed air cell (floor/ceiling/water) inside the biome. <code>h</code> gives you <code>clearance</code>, <code>isAir/isSolid/isWater</code>, and a stable hash for rolling odds.',
  'Varredura mais larga, pra decoração rara e grande (ex.: uma estrutura que não cabe no padding normal) — só roda se algum bioma declarar isto.': 'A wider scan, for rare, large decoration (e.g. a structure that does not fit the normal padding) — only runs if some biome declares this.',
  'Cada camada recebe <code>{ height, raw }</code> da anterior e devolve mutado — <code>baseTerrain</code> estabelece a forma (e <code>raw</code>, o ruído de continente normalizado); <code>mountains</code>/<code>hills</code> somam em cima; <code>flatTerrain</code> substitui tudo.': 'Each layer receives <code>{ height, raw }</code> from the one before it and mutates it — <code>baseTerrain</code> establishes the shape (and <code>raw</code>, the normalized continent noise); <code>mountains</code>/<code>hills</code> add on top; <code>flatTerrain</code> replaces everything.',
  'Regiões (ver <code>region()</code>) cujo próprio <code>terrain</code> substitui o do mundo inteiro, só ali dentro — um platô plano pra uma construção, por exemplo.': 'Regions (see <code>region()</code>) whose own <code>terrain</code> replaces the whole world\'s, only inside their bounds — a flat plateau for a build site, for instance.',
  'Omitido = mundo sem caverna nenhuma. <code>sampleSurfaceHeight</code> já sai ligado às mesmas camadas de terreno — só falta biomas/blocos de caverna.': 'Omit it for a cave-free world. <code>sampleSurfaceHeight</code> is already wired to the same terrain layers — you only need to supply cave biomes/blocks.',
  'A forma de base: ruído de continente + detalhe. Primeira camada da pilha, quase sempre.': 'The base shape: continent + detail noise. The first layer of the stack, almost always.',
  '<code>height</code> é o teto de elevação em blocos (padrão 56). Só ergue onde <code>raw</code> (de <code>baseTerrain</code>) passa do limiar.': '<code>height</code> is the elevation ceiling in blocks (default 56). Only lifts where <code>raw</code> (from <code>baseTerrain</code>) crosses the threshold.',
  '<code>height</code> é a amplitude em blocos (padrão 12) de uma ondulação independente, somada em cima do que veio antes.': '<code>height</code> is the amplitude in blocks (default 12) of an independent ripple, added on top of whatever came before.',
  'Substitui a altura recebida por um valor fixo — o uso típico é dentro de um <code>region()</code>.': 'Replaces the incoming height with a fixed value — the typical use is inside a <code>region()</code>.',
  'Caixa em XZ (Y é ignorado): dentro dela, <code>terrain</code> substitui a pilha do mundo inteiro.': 'An XZ box (Y is ignored): inside it, <code>terrain</code> replaces the whole world\'s stack.',
  'Chamado uma vez por voxel do chunk (respeitando <code>ctx.stride</code>). Devolver <code>null</code> deixa o voxel como estava (ar).': 'Called once per voxel in the chunk (respecting <code>ctx.stride</code>). Returning <code>null</code> leaves the voxel as it was (air).',
  '<code>material</code> pode ser o id numérico direto, ou uma chave resolvida via <code>materials</code>.': '<code>material</code> can be the numeric id directly, or a key resolved through <code>materials</code>.',
  'Deixa <code>sample</code> devolver <code>material: "alien-rock"</code> em vez de memorizar id numérico — resolvido aqui, não por nome adivinhado na engine.': 'Lets <code>sample</code> return <code>material: "alien-rock"</code> instead of memorizing numeric ids — resolved here, not guessed by name inside the engine.'
};

export function translateDesc(desc: string, isEnglish: boolean): string {
  if (!isEnglish) return desc;
  return DESC_MAP_EN[desc] ?? desc;
}

const EXAMPLE_NOTE_EN: Record<string, string> = {
  'voxel-engine': 'Click the world to lock the pointer: <b>WASD</b> moves, <b>space/shift</b> goes up and down, <b>left click</b> breaks, <b>right</b> places, <b>1-6</b> switches the block. <kbd>Esc</kbd> returns the keyboard to the editor.',
  'event-emitter': "Each <code>emit</code> spawns cubes for the listeners. On the 12th event, the green listener's <code>off()</code> is called: only the blue ones keep going.",
  'run-engine-worker': 'These are the options the engine worker receives. Switch <code>voxelsPerBlock</code> to <code>4</code>, or <code>greedyMeshing</code> to <code>false</code>, and run again: the world is rebuilt with the new configuration.',
  'engine-context': 'The text in <code>pluginCode</code> is sent to the engine worker and evaluated there, against the real <code>EngineContext</code>. Enter the world and break a block: the sparks are emitted by your own plugin, inside the worker.',
  'command-registry': 'Each command below runs in the worker and the effect shows up in the world. The last one is a <b>new</b> command, registered at runtime.',
  'game-loop': "At 4 ticks per second the difference is obvious: the orange cube jumps on each tick; the green one uses the <code>alpha</code> from <code>onRender</code> and glides at the screen's refresh rate.",
  'frame-profiler': "The numbers are the measured cost of the world's phases as chunks arrive from the workers. Orbit to force streaming and watch the bars change.",
  'run-chunk-worker': 'No world at all: the page talks directly to the chunk worker, over the same protocol as the <code>WorkerPool</code>, and draws whatever comes back.',
  'block-registry': 'Each pillar is a registered block. Color, transparency, and glow all come from the registry — register a new block at the top of the code and it appears in the scene.',
  'chunk-geometry': 'Both sides are the <b>same volume</b>. The wireframe toggles every 3 s: on the left the quads are large and few; on the right, one per face.',
  'types': "The geometry is a single one. What changes every 2.5 s is which <i>attribute</i> drives the vertex color: the block's color, the face normal, or the ambient occlusion.",
  'world-generator': 'The body of <code>generate</code> below is sent to every chunk worker, compiled there, and used to generate the terrain you see. Edit and run: the whole world changes.',
  'generator-types': 'All four approaches above end up here — a <code>WorldGenerator</code> running on a real world. This demo uses the most ready-made of the four; switch to <code>customGenerator</code> or <code>CaveCarver</code> by looking at the examples on the linked pages.',
  'terrain-generator': 'The body below is sent to every chunk worker, compiled there, and used to generate the terrain you see. Change the order or the parameters of the layers and run again.',
  'custom-generator': 'No column/height here at all: every voxel decides on its own whether it is solid, by looking at its distance from the center plus some 3D noise — this lets you do things a heightmap cannot express, like this floating sphere.',
  'cave-carver': 'The same volume as always, but with the ground carved by CaveCarver — walk under the surface to see the tunnels.',
  'procedural-world': 'Drag to orbit. Every 2.5 s the example finds the surface with <code>drySurfaceAt</code>, opens a crater with <code>editSphere</code>, and marks the spot with glowstone — rebuilding the affected chunks.',
  'dimension-registry': 'The same world instance. What changes is the dimension: a different generator, a different sky, different gravity — and the chunks are regenerated by the workers.',
  'sky': 'The <code>Sky</code> is instantiated on its own, without a <code>ProceduralWorld</code>: it brings the directional and ambient light, and that light is what lights up the voxels. At the end, the dimension switches and the whole sky changes.',
  'far-field-streamer': 'A 12-chunk range with <code>lodRings: [4, 7, 10]</code>. Switch it to <code>undefined</code> and lower <code>renderDistance</code> to 6, run again, and compare the silhouette and voxel memory.',
  'kinematic-body': "The bodies are voxel volumes meshed by <code>ChunkGeometry</code>, and the collider is the scene's volume. They fall, bump into things, climb one-block steps, and settle.",
  'raycast-voxel': 'The yellow line is the ray; it spins on its own. The green box marks the hit block and the blue one the neighboring cell along the <code>faceNormal</code> — where a new block would go. Drag to orbit.',
  'fluid-ca': "The automaton here is the world's own (<code>world.fluidCA</code>): it moves water voxels through the chunks and re-meshes whatever changed. Once the water settles, the active set drops back to zero.",
  'player': "Click to lock the pointer. <b>WASD</b> moves, <b>space</b> jumps (or ascends, in debug mode), <b>shift</b> descends/crouches. The footer shows the <code>KinematicBody</code>'s state live.",
  'player-interaction': 'Click to lock the pointer. <b>Left</b> breaks, <b>right</b> places, <b>1-5</b> switches the block. Every action emits particles and shows up in the console.',
  'rng': 'Three volumes generated just now: the two on the left use seed 1337; the one on the right, 2024. The cell-by-cell comparison is printed to the console.',
  'post-processor': 'The GLSL below is compiled and joins the same stack as SSAO/bloom/tonemap. Edit the fragment shader and run again — the effect changes instantly.',
  'cinematic-pass': "The scene doesn't change — only the grading does. Edit the presets and run again to draw your own.",
  'post-passes': 'The stack starts whole; then each pass gets 4 s alone, in the same scene, so you can see what each one does.',
  'shadow-map': 'The sun sits low on the horizon (<code>sunset</code>), which is when the shadow shows up the most. The tower is built with <code>setBlockAt</code> before the test.',
  'brickmap': "If your GPU doesn't support the required 3D textures, the engine falls back to the mesh path and logs a warning to the browser console — the same behavior as the game.",
  'voxel-particles': 'A demo focused purely on the particle pool: single-draw-call rendering and collision physics, without loading any chunks or procedural world.',
  'entities': "The subclass is created here, registered in the <code>entityRegistry</code>, and instantiated by name. It collides against the scene's voxel volume, using the same AABB solver as the player."
};

export function translateNote(moduleId: string, note: string | undefined, isEnglish: boolean): string | undefined {
  if (!note || !isEnglish) return note;
  return EXAMPLE_NOTE_EN[moduleId] ?? note;
}
