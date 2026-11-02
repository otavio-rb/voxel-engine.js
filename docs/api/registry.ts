/**
 * A referência como dados. Uma entrada por módulo: assinatura real do código-fonte e
 * uma demonstração que RODA — não há exemplo só de console aqui. Cada `example.code` é
 * compilado e executado pela página contra os módulos de `engine/`, com um palco visual
 * (cena Three.js, mundo com streaming de chunks, ou a engine inteira num worker).
 *
 * O gerador de páginas (`scripts/gen-api-pages.mjs`) lê este arquivo para criar
 * `docs/api/<id>/index.html`.
 */

export interface ApiMember {
  kind: 'constructor' | 'property' | 'method' | 'event';
  signature: string;
  desc: string;
}

export interface ApiExample {
  /** Nome da demonstração, mostrado no cabeçalho do playground. */
  title: string;
  code: string;
  /** '2d' entrega o canvas em contexto 2D; o resto monta WebGL por conta própria. */
  visual?: '2d';
  /** Observação exibida acima do editor (como interagir, o que esperar). */
  note?: string;
}

export interface ApiModule {
  id: string;
  name: string;
  kind: 'class' | 'singleton' | 'function' | 'interface' | 'const' | 'guide';
  entry: string;
  file: string;
  /** Resumo com marcação (usado na página do módulo). */
  summary: string;
  /** Mesmo resumo em texto puro, curto (usado nos cartões do índice). */
  summaryPlain: string;
  /** HTML curto com links pra outras páginas (ex.: a abstração de nível mais alto pra isto). */
  related?: string;
  members: ApiMember[];
  example: ApiExample;
}

export interface ApiGroup {
  id: string;
  title: string;
  icon: string;
  blurb: string;
  modules: ApiModule[];
}

export const GROUPS: ApiGroup[] = [
  {
    id: 'main-thread',
    title: 'Main Thread',
    icon: 'terminal',
    blurb: 'O que a página importa de <code>@voxel/engine</code>: a ponte — canvas, input e eventos.',
    modules: [
      {
        id: 'voxel-engine',
        name: 'VoxelEngine',
        kind: 'class',
        entry: "import { VoxelEngine } from '@voxel/engine';",
        file: 'engine/core/VoxelEngine.ts',
        summary:
          'Ponte da main thread. Transfere o canvas para o worker com <code>transferControlToOffscreen()</code>, encaminha teclado/mouse/pointer lock e re-emite os eventos que o worker publica. Não roda simulação nem render — tudo isso acontece no worker.',
        summaryPlain: 'A ponte da página para o worker: canvas transferido, input encaminhado, eventos re-emitidos.',
        members: [
          { kind: 'constructor', signature: 'new VoxelEngine({ canvas, worker })', desc: "O worker é criado no call site (<code>new Worker(new URL('./engine.worker.ts', import.meta.url), { type: 'module' })</code>) para o bundler encontrá-lo. O canvas é transferido no construtor." },
          { kind: 'method', signature: 'start(config?: { worldType?, flight?, shaders? }): void', desc: 'Libera a simulação no worker (equivale ao comando <code>/start</code>).' },
          { kind: 'method', signature: 'lockPointer(): Promise&lt;void&gt;', desc: 'Pointer lock do canvas; no-op em modo mobile.' },
          { kind: 'method', signature: 'unlockPointer()', desc: 'Pointer lock do canvas; no-op em modo mobile.' },
          { kind: 'method', signature: 'isLockedPointer()', desc: 'Pointer lock do canvas; no-op em modo mobile.' },
          { kind: 'method', signature: 'setInputBlocked(blocked: boolean): void', desc: 'Congela o input — é o que mantém esta página digitável enquanto a engine roda ao lado.' },
          { kind: 'method', signature: 'setMobileMode(enabled)', desc: 'Troca pointer lock por controles de toque.' },
          { kind: 'method', signature: 'setMobileLocked(locked)', desc: 'Troca pointer lock por controles de toque.' },
          { kind: 'method', signature: 'getMobileMode()', desc: 'Troca pointer lock por controles de toque.' },
          { kind: 'method', signature: 'sendKeyDown(key)', desc: 'Injeta input (controles mobile, UI, testes).' },
          { kind: 'method', signature: 'sendKeyUp(key)', desc: 'Injeta input (controles mobile, UI, testes).' },
          { kind: 'method', signature: 'sendMouseMove(mx, my)', desc: 'Injeta input (controles mobile, UI, testes).' },
          { kind: 'method', signature: 'sendMouseDown(button)', desc: 'Injeta input (controles mobile, UI, testes).' },
          { kind: 'method', signature: 'sendMouseUp(button)', desc: 'Injeta input (controles mobile, UI, testes).' },
          { kind: 'method', signature: 'selectBlock(type)', desc: 'Hotbar do jogador, no worker.' },
          { kind: 'method', signature: 'selectSlot(index)', desc: 'Hotbar do jogador, no worker.' },
          { kind: 'method', signature: 'setHotbar(types)', desc: 'Hotbar do jogador, no worker.' },
          { kind: 'method', signature: 'sendCommand(command, args?)', desc: '<code>sendCommand</code> dispara um comando registrado; <code>send</code> fala com plugins via <code>ctx.onMessage</code>.' },
          { kind: 'method', signature: 'send(name, data?)', desc: '<code>sendCommand</code> dispara um comando registrado; <code>send</code> fala com plugins via <code>ctx.onMessage</code>.' },
          { kind: 'method', signature: 'setFlightMode(enabled: boolean)', desc: 'Atalhos para os comandos equivalentes.' },
          { kind: 'method', signature: 'toggleShaders(on)', desc: 'Atalhos para os comandos equivalentes.' },
          { kind: 'method', signature: 'teleport(x, y, z)', desc: 'Atalhos para os comandos equivalentes.' },
          { kind: 'method', signature: 'regenerateWorld(type)', desc: 'Atalhos para os comandos equivalentes.' },
          { kind: 'event', signature: "'stats'", desc: 'Uma vez por segundo: <code>fps</code>, <code>frameTimeMs</code>, <code>renderTimeMs</code>, <code>triangles</code>, <code>calls</code>, <code>loadedChunks</code>, <code>workers</code>, <code>gpuMemoryMB</code>, <code>voxelRamMB</code>, <code>dimension</code>, <code>isUnderwater</code>.' },
          { kind: 'event', signature: "'block:break'", desc: 'Eventos vindos do worker, mais o estado do pointer lock.' },
          { kind: 'event', signature: "'block:place'", desc: 'Eventos vindos do worker, mais o estado do pointer lock.' },
          { kind: 'event', signature: "'lock_change'", desc: 'Eventos vindos do worker, mais o estado do pointer lock.' },
          { kind: 'event', signature: "'fatal_error'", desc: 'Eventos vindos do worker, mais o estado do pointer lock.' },
          { kind: 'method', signature: 'destroy(): void', desc: 'Solta o ponteiro, remove os listeners e encerra o worker (e os chunk workers que ele abriu).' }
        ],
        example: {
          title: 'A engine inteira, rodando nesta página',
          note: 'Clique no mundo para travar o ponteiro: <b>WASD</b> anda, <b>espaço/shift</b> sobe e desce, <b>clique esquerdo</b> quebra, <b>direito</b> coloca, <b>1-6</b> troca o bloco. <kbd>Esc</kbd> devolve o teclado ao editor.',
          code: `// Isto não é um mock: sobe um engine worker de verdade, que abre o pool de chunk
// workers e renderiza num OffscreenCanvas transferido deste canvas.
const demo = engineSandbox({
  world: { chunkSize: 32, renderDistance: 6, verticalRenderDistance: 4 },
  spawnPoint: { x: 0, y: 48, z: 0 },
  hotbar: [BLOCKS.grass, BLOCKS.stone, BLOCKS.sand, BLOCKS.glass, BLOCKS.glowstone, BLOCKS.water]
});

const engine = demo.engine;

// Eventos que nasceram no worker e o VoxelEngine re-emite aqui na main thread:
engine.on('block:break', (e) => print('block:break ->', e.blockType, 'em', e.position.x + ',' + e.position.y + ',' + e.position.z));
engine.on('block:place', (e) => print('block:place ->', e.blockType));

demo.onStats((s) => {
  const w = s.workers || {};
  demo.hud(
    s.fps + ' fps · ' + s.frameTimeMs + ' ms/quadro · ' + s.triangles.toLocaleString('pt-BR') + ' triângulos · ' +
    s.calls + ' draw calls\\n' +
    s.loadedChunks + ' chunks · ' + (w.busy || 0) + '/' + (w.total || 0) + ' chunk workers ocupados · ' +
    s.voxelRamMB + ' MB de voxel · ' + s.gpuMemoryMB + ' MB de GPU\\n' +
    'posição ' + s.x.toFixed(1) + ', ' + s.y.toFixed(1) + ', ' + s.z.toFixed(1) + ' · ' + s.facing + ' · ' + s.gpuRenderer
  );
});

print('engine no ar. o teclado só vai para ela enquanto o ponteiro estiver travado.');
print('experimente trocar renderDistance acima e executar de novo.');`
        }
      },
      {
        id: 'event-emitter',
        name: 'EventEmitter',
        kind: 'class',
        entry: "import { EventEmitter } from '@voxel/engine';",
        file: 'engine/core/EventEmitter.ts',
        summary:
          'Emissor mínimo, base de <code>VoxelEngine</code>, <code>EngineContext</code> e <code>ProceduralWorld</code>. <code>on()</code> devolve a função de unsubscribe — é assim que um plugin limpa os próprios listeners quando é recarregado.',
        summaryPlain: 'O emissor de eventos da engine; on() devolve o unsubscribe.',
        members: [
          { kind: 'property', signature: 'on&lt;T&gt;(event, cb): () =&gt; void', desc: 'Assina e devolve a função que cancela.' },
          { kind: 'property', signature: 'off&lt;T&gt;(event, cb): void', desc: 'Remove um listener específico.' },
          { kind: 'property', signature: 'emit&lt;T&gt;(event, payload?): void', desc: 'Dispara. Um listener que lança não impede os outros.' },
          { kind: 'method', signature: 'clear(): void', desc: 'Remove todos os listeners.' }
        ],
        example: {
          title: 'Dois ouvintes, um unsubscribe — visível',
          note: 'Cada <code>emit</code> faz os listeners nascerem cubos. No 12º evento o <code>off()</code> do listener verde é chamado: só os azuis continuam.',
          code: `const view = view3D({ target: [0, 2, 0], distance: 20 });
const bus = new EventEmitter();

// Os "cubos" saem do mesher da engine: um volume 2³ preenchido e passado pelo
// ChunkGeometry. BoxGeometry do Three.js seria mentir sobre o que a engine faz.
const molde = (bloco) => voxelObject(2, (ctx) => {
  for (let x = 0; x < 2; x++) {
    for (let y = 0; y < 2; y++) {
      for (let z = 0; z < 2; z++) ctx.setBlock(x, y, z, bloco);
    }
  }
});

const moldeVerde = molde(BLOCKS.grass);
const moldeAzul = molde(BLOCKS.glowstone);

const vivos = [];
const nascer = (base, escala) => {
  const m = new THREE.Mesh(base.geometry, base.material); // mesma malha, outra instância
  m.scale.setScalar(escala);
  m.position.set((Math.random() - 0.5) * 10, 8, (Math.random() - 0.5) * 10);
  view.add(m);
  vivos.push(m);
  if (vivos.length > 70) view.remove(vivos.shift());
};

// dois listeners no MESMO evento
const offVerde = bus.on('tick', () => nascer(moldeVerde, 1));
bus.on('tick', (n) => { if (n % 2 === 0) nascer(moldeAzul, 0.6); });

let n = 0;
const timer = setInterval(() => {
  bus.emit('tick', ++n);
  if (n === 12) {
    offVerde(); // o unsubscribe devolvido pelo on()
    print('off() chamado: nenhum voxel verde a mais.');
  }
  view.hud('emit #' + n + ' · objetos vivos: ' + vivos.length + (n >= 12 ? ' · listener verde cancelado' : ' · dois listeners ativos'));
}, 260);
onStop(() => clearInterval(timer));

view.onFrame((dt) => {
  for (const c of vivos) {
    c.position.y -= dt * 0.004;
    c.rotation.x += dt * 0.0012;
    c.rotation.y += dt * 0.0016;
  }
});

print('verde nasce a cada emit; dourado só nos pares (o listener filtra).');`
        }
      }
    ]
  },
  {
    id: 'worker-runtime',
    title: 'Runtime do Worker',
    icon: 'smart_toy',
    blurb: 'O worker da engine, de <code>@voxel/engine/worker</code>: mundo, player, render e plugins.',
    modules: [
      {
        id: 'run-engine-worker',
        name: 'runEngineWorker',
        kind: 'function',
        entry: "import { runEngineWorker } from '@voxel/engine/worker';",
        file: 'engine/runtime/EngineRuntime.ts',
        summary:
          'Entrypoint do worker da engine. Espera o <code>init</code> da main thread, monta renderer, cena, câmera, mundo, player e interação, roda o <code>GameLoop</code> e chama o <code>setup</code> de cada plugin uma vez, com tudo pronto.',
        summaryPlain: 'O entrypoint do engine worker: monta mundo, player, render e plugins.',
        members: [
          { kind: 'property', signature: 'createChunkWorker: () =&gt; Worker', desc: 'Obrigatório. Fábrica do chunk worker; a entry dele chama <code>runChunkWorker</code>.' },
          { kind: 'property', signature: 'setup?: () =&gt; void', desc: 'Roda antes do mundo existir: registre blocos, dimensões, geradores e entidades.' },
          { kind: 'property', signature: 'plugins?: EnginePlugin[]', desc: 'Cada <code>setup(ctx)</code> é chamado depois que o mundo existe.' },
          { kind: 'property', signature: "world?: Partial&lt;Omit&lt;ProceduralWorldOptions, 'camera' | 'createChunkWorker'&gt;&gt;", desc: '<code>chunkSize</code>, <code>renderDistance</code>, <code>voxelsPerBlock</code>, <code>lodRings</code>, <code>greedyMeshing</code>, <code>voxelGrain</code>, <code>voxelEdge</code>, <code>chunkRenderer</code>…' },
          { kind: 'property', signature: 'hotbar?: number[]', desc: 'Blocos nas teclas numéricas e onde o jogador nasce.' },
          { kind: 'property', signature: 'spawnPoint?: BlockPosition', desc: 'Blocos nas teclas numéricas e onde o jogador nasce.' },
          { kind: 'property', signature: 'targetTps?: number', desc: 'Taxa do tick fixo e escala relativa do jogador (0.35 ≈ miniatura, para micro-voxel).' },
          { kind: 'property', signature: 'playerScale?: number', desc: 'Taxa do tick fixo e escala relativa do jogador (0.35 ≈ miniatura, para micro-voxel).' }
        ],
        example: {
          title: 'A configuração do worker, editável e ao vivo',
          note: 'Estas são as opções que o worker da engine recebe. Troque <code>voxelsPerBlock</code> para <code>4</code>, ou <code>greedyMeshing</code> para <code>false</code>, e execute de novo: o mundo é reconstruído com a nova configuração.',
          code: `// As opções abaixo vão para runEngineWorker() dentro do worker desta página.
const demo = engineSandbox({
  world: {
    chunkSize: 32,
    renderDistance: 6,
    verticalRenderDistance: 3,
    voxelsPerBlock: 1,      // 4 = micro-voxel (1/4 de bloco); o player encolhe junto
    greedyMeshing: true,    // false = mesher naïve: mesma imagem, muito mais triângulo
    lodRings: [4, 6],       // malha cheia até 4 chunks, metade até 6, um quarto além
    voxelGrain: 0.06,
    voxelEdge: 0.0,
    initialDimension: 'docs-overworld'
  },
  spawnPoint: { x: 0, y: 48, z: 0 },
  targetTps: 60,
  playerScale: 1
});

demo.onStats((s) => demo.hud(
  s.fps + ' fps · ' + s.triangles.toLocaleString('pt-BR') + ' triângulos · ' + s.calls + ' draw calls · ' +
  s.loadedChunks + ' chunks carregados\\n' +
  'troque voxelsPerBlock ou greedyMeshing no código e execute de novo para comparar'
));

print('mundo subindo com a configuração acima; clique para entrar nele.');`
        }
      },
      {
        id: 'engine-context',
        name: 'EngineContext',
        kind: 'class',
        entry: "import type { EngineContext, EnginePlugin } from '@voxel/engine/worker';",
        file: 'engine/runtime/EngineRuntime.ts',
        summary:
          'Tudo que um plugin alcança dentro do worker — mundo, player, interação, partículas, shaders, comandos — e os hooks do ciclo de vida, que chegam por <code>ctx.on(...)</code>.',
        summaryPlain: 'O que um plugin alcança dentro do worker, e os hooks do ciclo de vida.',
        members: [
          { kind: 'property', signature: 'renderer: WebGLRenderer', desc: 'Os objetos Three.js do worker.' },
          { kind: 'property', signature: 'scene: Scene', desc: 'Os objetos Three.js do worker.' },
          { kind: 'property', signature: 'camera: PerspectiveCamera', desc: 'Os objetos Three.js do worker.' },
          { kind: 'property', signature: 'world: ProceduralWorld', desc: 'Streaming de chunks, movimento, quebra e colocação.' },
          { kind: 'property', signature: 'player: Player', desc: 'Streaming de chunks, movimento, quebra e colocação.' },
          { kind: 'property', signature: 'interaction: PlayerInteraction', desc: 'Streaming de chunks, movimento, quebra e colocação.' },
          { kind: 'property', signature: 'particles: VoxelParticles', desc: 'Pool compartilhado: a engine simula, o plugin decide o que emitir.' },
          { kind: 'property', signature: 'postProcessor', desc: 'A pilha de tela cheia e o grading.' },
          { kind: 'property', signature: 'shaders', desc: 'A pilha de tela cheia e o grading.' },
          { kind: 'property', signature: 'cinematicPass', desc: 'A pilha de tela cheia e o grading.' },
          { kind: 'property', signature: 'commands: CommandRegistry', desc: 'Comandos de barra do worker.' },
          { kind: 'method', signature: 'executeCommand(cmd, args?)', desc: 'Comandos de barra do worker.' },
          { kind: 'property', signature: 'started: boolean', desc: 'A simulação fica parada até <code>/start</code>.' },
          { kind: 'property', signature: 'shadersEnabled: boolean', desc: 'A simulação fica parada até <code>/start</code>.' },
          { kind: 'property', signature: 'voxelsPerBlock: number', desc: 'A simulação fica parada até <code>/start</code>.' },
          { kind: 'method', signature: 'emitToMain(event, payload?)', desc: 'Conversa com a main thread nos dois sentidos.' },
          { kind: 'method', signature: 'onMessage(name, handler)', desc: 'Conversa com a main thread nos dois sentidos.' },
          { kind: 'event', signature: "'start'", desc: '<code>fixedUpdate</code> traz <code>{ deltaMs, dtScale }</code>; <code>render</code> traz <code>{ alpha, frameDeltaMs }</code>. O que mexer na câmera em <code>predraw</code> precisa desfazer em <code>postdraw</code>.' },
          { kind: 'event', signature: "'fixedUpdate'", desc: '<code>fixedUpdate</code> traz <code>{ deltaMs, dtScale }</code>; <code>render</code> traz <code>{ alpha, frameDeltaMs }</code>. O que mexer na câmera em <code>predraw</code> precisa desfazer em <code>postdraw</code>.' },
          { kind: 'event', signature: "'render'", desc: '<code>fixedUpdate</code> traz <code>{ deltaMs, dtScale }</code>; <code>render</code> traz <code>{ alpha, frameDeltaMs }</code>. O que mexer na câmera em <code>predraw</code> precisa desfazer em <code>postdraw</code>.' },
          { kind: 'event', signature: "'predraw'", desc: '<code>fixedUpdate</code> traz <code>{ deltaMs, dtScale }</code>; <code>render</code> traz <code>{ alpha, frameDeltaMs }</code>. O que mexer na câmera em <code>predraw</code> precisa desfazer em <code>postdraw</code>.' },
          { kind: 'event', signature: "'postdraw'", desc: '<code>fixedUpdate</code> traz <code>{ deltaMs, dtScale }</code>; <code>render</code> traz <code>{ alpha, frameDeltaMs }</code>. O que mexer na câmera em <code>predraw</code> precisa desfazer em <code>postdraw</code>.' },
          { kind: 'event', signature: "'shaders'", desc: '<code>fixedUpdate</code> traz <code>{ deltaMs, dtScale }</code>; <code>render</code> traz <code>{ alpha, frameDeltaMs }</code>. O que mexer na câmera em <code>predraw</code> precisa desfazer em <code>postdraw</code>.' },
          { kind: 'event', signature: "'keydown'", desc: '<code>fixedUpdate</code> traz <code>{ deltaMs, dtScale }</code>; <code>render</code> traz <code>{ alpha, frameDeltaMs }</code>. O que mexer na câmera em <code>predraw</code> precisa desfazer em <code>postdraw</code>.' },
          { kind: 'event', signature: "'keyup'", desc: '<code>fixedUpdate</code> traz <code>{ deltaMs, dtScale }</code>; <code>render</code> traz <code>{ alpha, frameDeltaMs }</code>. O que mexer na câmera em <code>predraw</code> precisa desfazer em <code>postdraw</code>.' },
          { kind: 'event', signature: "'block:break'", desc: '<code>fixedUpdate</code> traz <code>{ deltaMs, dtScale }</code>; <code>render</code> traz <code>{ alpha, frameDeltaMs }</code>. O que mexer na câmera em <code>predraw</code> precisa desfazer em <code>postdraw</code>.' },
          { kind: 'event', signature: "'block:place'", desc: '<code>fixedUpdate</code> traz <code>{ deltaMs, dtScale }</code>; <code>render</code> traz <code>{ alpha, frameDeltaMs }</code>. O que mexer na câmera em <code>predraw</code> precisa desfazer em <code>postdraw</code>.' },
          { kind: 'property', signature: 'spawnPoint', desc: 'Spawn adiado até o terreno em volta chegar dos workers.' },
          { kind: 'method', signature: 'teleportToSpawn()', desc: 'Spawn adiado até o terreno em volta chegar dos workers.' },
          { kind: 'method', signature: 'settleSpawn()', desc: 'Spawn adiado até o terreno em volta chegar dos workers.' }
        ],
        example: {
          title: 'Um plugin escrito aqui, executado dentro do worker',
          note: 'O texto em <code>pluginCode</code> é enviado para o engine worker e avaliado lá, com o <code>EngineContext</code> real. Entre no mundo e quebre um bloco: as faíscas são emitidas pelo seu plugin, dentro do worker.',
          code: `const demo = engineSandbox({ world: { renderDistance: 5 }, spawnPoint: { x: 0, y: 48, z: 0 } });
demo.onLog((linha) => print('worker:', linha));

// ↓ este corpo roda DENTRO do engine worker. 'ctx' é o EngineContext;
//   'on' é ctx.on já com limpeza automática; 'print' volta para este console.
const pluginCode = [
  "print('plugin ativo · ' + ctx.world.getLoadedChunkCount() + ' chunks · dimensão ' + ctx.world.getActiveDimensionName());",
  "",
  "on('block:break', (e) => {",
  "  for (let i = 0; i < 26; i++) {",
  "    ctx.particles.emit({",
  "      position: { x: e.position.x + 0.5, y: e.position.y + 0.5, z: e.position.z + 0.5 },",
  "      velocity: { x: (Math.random() - 0.5) * 0.25, y: 0.25, z: (Math.random() - 0.5) * 0.25 },",
  "      color: 0xffaa33, size: 0.09, lifetime: 34, gravity: 0.03",
  "    });",
  "  }",
  "  print('faíscas em ' + e.position.x + ',' + e.position.y + ',' + e.position.z);",
  "});",
  "",
  "// um comando novo, que passa a existir no CommandRegistry do worker",
  "ctx.commands.register(['/cratera', '/boom'], (args, c) => {",
  "  const r = Number(args[0] || 6);",
  "  c.world.editSphere(c.player.body.position.clone(), r, 'destroy');",
  "  print('cratera de raio ' + r);",
  "});",
  "",
  "// tick fixo: a exposição do grading acompanha a altura do jogador",
  "on('fixedUpdate', () => {",
  "  const altura = ctx.player.body.position.y;",
  "  ctx.cinematicPass.setExposure(1 + Math.max(0, altura - 40) * 0.004, 0.8);",
  "});"
].join('\\n');

demo.plugin(pluginCode);

print('plugin enviado ao worker. entre no mundo, quebre um bloco e veja as faíscas.');
print('em alguns segundos o comando criado por ele será executado:');

await sleep(5000);
demo.engine.sendCommand('/boom', ['7']);
print('/boom executado — o plugin abriu uma cratera no mundo real.');`
        }
      },
      {
        id: 'command-registry',
        name: 'CommandRegistry',
        kind: 'class',
        entry: "import { CommandRegistry } from '@voxel/engine/worker';",
        file: 'engine/runtime/CommandRegistry.ts',
        summary:
          'Comandos de barra do worker. Nomes normalizados (caixa e <code>/</code> não importam) e aliases por handler. O runtime já registra os nativos: <code>/start</code>, <code>/time</code>, <code>/creative</code>, <code>/survival</code>, <code>/shaders</code>, <code>/tonemap</code>, <code>/shadows</code>, <code>/ssao</code>, <code>/bloom</code>, <code>/godrays</code>, <code>/exposure</code>, <code>/grain</code>, <code>/vignette</code>, <code>/wireframe</code>, <code>/brickmap</code>, <code>/tp</code>, <code>/spawn</code>, <code>/regen</code>, <code>/set</code> e <code>/fluid</code>.',
        summaryPlain: 'Os comandos de barra do worker, com aliases e normalização de nome.',
        members: [
          { kind: 'method', signature: 'register(names: string | string[], handler): void', desc: '<code>CommandHandler = (args: string[], ctx: EngineContext) =&gt; void</code>.' },
          { kind: 'method', signature: 'has(name)', desc: 'Consulta o que existe.' },
          { kind: 'method', signature: 'list()', desc: 'Consulta o que existe.' },
          { kind: 'method', signature: 'execute(name, args, ctx): boolean', desc: '<code>false</code> quando o comando não existe.' },
          { kind: 'method', signature: 'engine.sendCommand(cmd, args)', desc: 'Da main thread e de dentro do worker, respectivamente.' },
          { kind: 'method', signature: 'ctx.executeCommand(cmd, args)', desc: 'Da main thread e de dentro do worker, respectivamente.' }
        ],
        example: {
          title: 'Comandos reais mudando o mundo, um a um',
          note: 'Cada comando abaixo é executado no worker e o efeito aparece no mundo. O último é um comando <b>novo</b>, registrado em tempo de execução.',
          code: `const demo = engineSandbox({ world: { renderDistance: 5 } });
demo.onLog((l) => print('worker:', l));

print('esperando o mundo carregar…');
await sleep(5000);

const roteiro = [
  ['/time', ['night'], 'noite fechada'],
  ['/time', ['noon'], 'meio-dia'],
  ['/shaders', ['off'], 'pilha de shaders desligada'],
  ['/shaders', ['on'], 'pilha de shaders ligada'],
  ['/wireframe', ['on'], 'wireframe: dá para ver os quads do greedy meshing'],
  ['/wireframe', ['off'], 'de volta ao sólido'],
  ['/tonemap', ['agx'], 'curva de tonemapping AgX'],
  ['/vignette', ['0.4'], 'vinheta mais forte'],
  ['/tp', ['0', '70', '0'], 'teleporte para cima']
];

for (const [cmd, args, rotulo] of roteiro) {
  demo.engine.sendCommand(cmd, args);
  demo.hud(cmd + ' ' + args.join(' ') + '  —  ' + rotulo);
  print(cmd, args.join(' '));
  await sleep(2600);
}

// Registrando um comando novo no CommandRegistry do worker:
demo.plugin([
  "ctx.commands.register(['/torre', '/tower'], (args, c) => {",
  "  const altura = Number(args[0] || 12);",
  "  const p = c.player.body.position;",
  "  for (let y = 0; y < altura; y++) {",
  "    c.world.setBlockAt(Math.floor(p.x) + 3, Math.floor(p.y) + y, Math.floor(p.z), y % 4 === 3 ? 20 : 1);",
  "  }",
  "  print('torre de ' + altura + ' blocos erguida');",
  "});",
  "print('comandos registrados agora: ' + ctx.commands.list().length);"
].join('\\n'));

await sleep(900);
demo.engine.sendCommand('/torre', ['16']);
demo.hud('/torre 16 — um comando que não existia até esta execução');
print('/torre 16 executado.');`
        }
      },
      {
        id: 'game-loop',
        name: 'GameLoop',
        kind: 'class',
        entry: "import { GameLoop } from '@voxel/engine/worker';",
        file: 'engine/core/GameLoop.ts',
        summary:
          'Loop de passo fixo com acumulador: a simulação roda em Hz constante e o render recebe o <code>alpha</code> de interpolação do quadro. É o que mantém a física igual em 30 e em 240 fps.',
        summaryPlain: 'Passo fixo com acumulador e alpha de interpolação por quadro.',
        members: [
          { kind: 'constructor', signature: 'new GameLoop({ targetTps?, onFixedUpdate, onRender })', desc: '<code>onFixedUpdate(fixedDeltaMs, dtScale)</code> e <code>onRender(alpha, frameDeltaMs)</code>.' },
          { kind: 'method', signature: 'start()', desc: 'Liga e desliga o <code>requestAnimationFrame</code>.' },
          { kind: 'method', signature: 'stop()', desc: 'Liga e desliga o <code>requestAnimationFrame</code>.' },
          { kind: 'method', signature: 'getFixedStepMs()', desc: '<code>1000 / targetTps</code>.' }
        ],
        example: {
          title: 'O mesmo movimento, com e sem o alpha',
          note: 'Com 4 ticks por segundo a diferença fica óbvia: o cubo laranja salta no tick; o verde usa o <code>alpha</code> do <code>onRender</code> e desliza na taxa da tela.',
          code: `const view = view3D({ target: [0, 0, 0], distance: 26, autoRotate: false });

// marcadores feitos de voxel pelo mesher da engine, não por BoxGeometry
const marcador = (bloco) => voxelObject(3, (ctx) => {
  for (let x = 0; x < 3; x++) {
    for (let y = 0; y < 3; y++) {
      for (let z = 0; z < 3; z++) ctx.setBlock(x, y, z, bloco);
    }
  }
});

const porTick = marcador(BLOCKS.sand);      // só se move no tick
const interpolado = marcador(BLOCKS.grass); // usa o alpha do quadro
porTick.position.y = 3;
interpolado.position.y = -3;
view.add(porTick);
view.add(interpolado);

// trilho: uma fileira de voxels, também malhada pela engine
const trilho = voxelObject(24, (ctx) => {
  for (let x = 0; x < 24; x++) ctx.setBlock(x, 0, 12, BLOCKS.stone);
});
trilho.position.y = -0.5;
view.add(trilho);

let anterior = -9;
let atual = -9;

const loop = new GameLoop({
  targetTps: 4,
  onFixedUpdate: () => {
    anterior = atual;
    atual += 2.25;
    if (atual > 9) { atual = -9; anterior = -9; }
    porTick.position.x = atual;
  },
  onRender: (alpha, frameDeltaMs) => {
    interpolado.position.x = anterior + (atual - anterior) * alpha;
    view.hud(
      '4 ticks/s · passo fixo ' + loop.getFixedStepMs().toFixed(0) + ' ms\\n' +
      'alpha do quadro: ' + alpha.toFixed(2) + ' · quadro ' + frameDeltaMs.toFixed(1) + ' ms\\n' +
      'areia: posição do tick · grama: posição interpolada'
    );
  }
});

loop.start();
onStop(() => loop.stop());

print('a simulação anda 4x por segundo nos dois casos — só a apresentação muda.');`
        }
      },
      {
        id: 'frame-profiler',
        name: 'FrameProfiler',
        kind: 'class',
        entry: "import { FrameProfiler } from '@voxel/engine/worker';",
        file: 'engine/core/FrameProfiler.ts',
        summary:
          'Agrega o custo de fases nomeadas numa janela e devolve um snapshot: fps, pior quadro e média/máximo por fase. Serve para saber <i>qual</i> fase estourou o orçamento, não só que o quadro estourou.',
        summaryPlain: 'Custo por fase do quadro, agregado por janela de tempo.',
        members: [
          { kind: 'constructor', signature: 'new FrameProfiler(windowMs = 1000)', desc: 'Tamanho da janela de agregação.' },
          { kind: 'property', signature: 'measure&lt;T&gt;(name, fn): T', desc: 'Mede uma fase e devolve o retorno dela.' },
          { kind: 'method', signature: 'add(name, ms)', desc: 'Soma tempo medido por fora (um timer de GPU, por exemplo).' },
          { kind: 'method', signature: 'frame(frameMs): ProfilerSnapshot | null', desc: '<code>{ fps, worstFrameMs, windowMs, phases }</code> quando a janela fecha; <code>null</code> no resto.' },
          { kind: 'property', signature: 'world.profiler = profiler', desc: 'O <code>ProceduralWorld</code> reporta as fases dele (chunks, luz, costura, malha) no profiler que você ligar.' }
        ],
        example: {
          title: 'Medindo o mundo de verdade, fase a fase',
          note: 'Os números são o custo medido das fases do mundo enquanto os chunks chegam dos workers. Orbite para forçar streaming e veja as barras mudarem.',
          code: `const demo = worldSandbox({
  world: { chunkSize: 32, renderDistance: 6, verticalRenderDistance: 2 },
  spawn: [0, 60, 0], lookAt: [0, 28, 0], distance: 120,
  shaders: 'medium'
});

const profiler = new FrameProfiler(500);
demo.world.profiler = profiler; // o mundo passa a reportar as fases dele aqui

demo.onFrame((frameMs) => {
  const snap = profiler.frame(frameMs);
  if (!snap) return;

  const fases = Object.entries(snap.phases)
    .sort((a, b) => b[1].totalMs - a[1].totalMs)
    .slice(0, 6);

  const linhas = fases.map(([nome, p]) => {
    const media = p.totalMs / p.calls;
    const barra = '█'.repeat(Math.max(1, Math.round((p.totalMs / snap.windowMs) * 60)));
    return '  ' + nome.padEnd(20) + media.toFixed(2).padStart(6) + ' ms  max ' +
           p.maxMs.toFixed(1).padStart(5) + '  ' + barra;
  });

  demo.hud(
    snap.fps + ' fps · pior quadro ' + snap.worstFrameMs + ' ms · janela ' + snap.windowMs + ' ms\\n' +
    (linhas.length ? linhas.join('\\n') : '  (nenhuma fase medida neste intervalo)')
  );
});

await demo.ready();
print('as fases vêm do ProceduralWorld enquanto o terreno chega dos chunk workers.');`
        }
      },
      {
        id: 'run-chunk-worker',
        name: 'runChunkWorker',
        kind: 'function',
        entry: "import { runChunkWorker } from '@voxel/engine/chunk-worker';",
        file: 'engine/runtime/ChunkRuntime.ts',
        summary:
          'Entrypoint do chunk worker. Recebe um <code>ChunkJobData</code>, gera o volume com o <code>WorldGenerator</code> registrado, calcula luz quando pedido, faz o greedy meshing e devolve os buffers por transferência (zero-copy).',
        summaryPlain: 'O worker que gera o volume e devolve a malha pronta, sem cópia.',
        members: [
          { kind: 'method', signature: 'runChunkWorker(options?: ChunkWorkerOptions): void', desc: 'Chamado uma vez, na entry do worker.' },
          { kind: 'property', signature: 'setup?: () =&gt; void', desc: 'Registra blocos e geradores NESTE worker — registros não atravessam threads.' },
          { kind: 'property', signature: 'ChunkJobData', desc: '<code>chunkKey</code>, limites <code>startX…endZ</code>, <code>size</code>, <code>worldParams</code>, <code>neighbourBorderBlocks</code>, <code>buildMesh</code>, <code>greedyMeshing</code>, <code>lodStep</code>, <code>voxelsPerBlock</code>, e <code>existingBlocks</code> para rebuild.' },
          { kind: 'property', signature: 'WorkerResponse', desc: '<code>chunkData</code>, <code>borders</code>, <code>opaque</code>/<code>water</code> (<code>GeometryData</code>), <code>light</code>, <code>uniform</code>.' }
        ],
        example: {
          title: 'Um job cru enviado ao worker, a malha voltando',
          note: 'Sem mundo nenhum: a página fala direto com o chunk worker, no mesmo protocolo do <code>WorkerPool</code>, e desenha o que voltou.',
          code: `const worker = chunkWorker();        // o chunk worker real da documentação
const view = view3D({ target: [16, 20, 16], distance: 85 });

const SIZE = 32;
const job = {
  chunkKey: '0,0,0',
  size: SIZE, height: SIZE,
  startX: 0, endX: SIZE,
  startY: 0, endY: SIZE,
  startZ: 0, endZ: SIZE,
  worldParams: {
    seed: 2024,
    worldType: 'docs-terreno',
    terrain: { scale: 60, magnitude: 10, offset: 6, octaves: 4, persistence: 0.5 }
  },
  neighbourBorderBlocks: {},   // sem vizinhos: as faces de borda são geradas
  buildMesh: true,
  greedyMeshing: true
};

const t0 = performance.now();

worker.onmessage = (e) => {
  const res = e.data; // WorkerResponse
  const ms = performance.now() - t0;

  print('resposta em', ms.toFixed(1), 'ms · chunk', res.chunkKey);
  print('volume:', res.chunkData.blocks.constructor.name, res.chunkData.blocks.length, 'células');
  print('bordas devolvidas:', Object.keys(res.borders).join(', ') || '(nenhuma)');

  if (res.opaque && res.opaque.vertices.length) {
    print('triângulos opacos:', res.opaque.vertices.length / 3);
    view.add(voxelMesh(res.opaque));
  }
  if (res.water && res.water.vertices.length) {
    print('triângulos de água:', res.water.vertices.length / 3);
    view.add(voxelMesh(res.water, { transparent: true, opacity: 0.6 }));
  }

  view.hud('gerado e malhado no worker em ' + ms.toFixed(1) + ' ms · buffers transferidos sem cópia');
};

worker.postMessage(job);
print('job enviado. troque greedyMeshing para false e compare a contagem de triângulos.');`
        }
      }
    ]
  },
  {
    id: 'blocos-volume',
    title: 'Blocos & Volume',
    icon: 'grid_view',
    blurb: 'A tabela de blocos, o volume de um chunk e o greedy mesher que vira triângulo.',
    modules: [
      {
        id: 'block-registry',
        name: 'blockRegistry',
        kind: 'singleton',
        entry: "import { blockRegistry, AIR, type BlockConfig } from '@voxel/engine/worker';",
        file: 'engine/blocks/BlockRegistry.ts',
        summary:
          'Tabela global de blocos. As consultas quentes (sólido, opaco, fluido, opacidade de luz, atrito) viram bitflags e arrays planos de 256 posições, porque o mesher e a física as chamam milhões de vezes por quadro. IDs cabem em <code>0..127</code> (o volume é <code>Int8Array</code>) e <code>AIR = -1</code>. É um singleton <b>por thread</b>.',
        summaryPlain: 'A tabela de blocos: bitflags e arrays planos para as consultas quentes.',
        members: [
          { kind: 'method', signature: 'register(config: BlockConfig)', desc: '<code>id</code>, <code>name</code>, <code>color</code>, <code>solid</code>, <code>opaque</code>, <code>fluid</code>, <code>flows</code>, <code>swimmable</code>, <code>transparent</code>, <code>luminance</code>, <code>lightOpacity</code>, <code>slipperiness</code>, <code>air</code>, <code>meshType</code>.' },
          { kind: 'method', signature: 'get(id)', desc: 'A configuração completa.' },
          { kind: 'method', signature: 'getByName(name)', desc: 'A configuração completa.' },
          { kind: 'method', signature: 'getAll()', desc: 'A configuração completa.' },
          { kind: 'property', signature: 'isSolid', desc: 'Consultas de bitflag, O(1) e sem alocar.' },
          { kind: 'property', signature: 'isOpaque', desc: 'Consultas de bitflag, O(1) e sem alocar.' },
          { kind: 'property', signature: 'isFluid', desc: 'Consultas de bitflag, O(1) e sem alocar.' },
          { kind: 'property', signature: 'isTransparent', desc: 'Consultas de bitflag, O(1) e sem alocar.' },
          { kind: 'property', signature: 'isAir', desc: 'Consultas de bitflag, O(1) e sem alocar.' },
          { kind: 'property', signature: 'flows', desc: 'Consultas de bitflag, O(1) e sem alocar.' },
          { kind: 'property', signature: 'isSwimmable', desc: 'Consultas de bitflag, O(1) e sem alocar.' },
          { kind: 'method', signature: 'getLightOpacity(id)', desc: 'Luz perdida ao atravessar, luz emitida, atrito no chão e cor base.' },
          { kind: 'method', signature: 'getLightEmission(id)', desc: 'Luz perdida ao atravessar, luz emitida, atrito no chão e cor base.' },
          { kind: 'method', signature: 'getSlipperiness(id)', desc: 'Luz perdida ao atravessar, luz emitida, atrito no chão e cor base.' },
          { kind: 'method', signature: 'getColor(id)', desc: 'Luz perdida ao atravessar, luz emitida, atrito no chão e cor base.' },
          { kind: 'method', signature: 'isMicrovoxel(id)', desc: "<code>meshType: 'microvoxel' | 'cross'</code> troca o cubo por um modelo 3D (plantas, vinhas)." },
          { kind: 'method', signature: 'isCrossMesh(id)', desc: "<code>meshType: 'microvoxel' | 'cross'</code> troca o cubo por um modelo 3D (plantas, vinhas)." },
          { kind: 'method', signature: 'isInteractable(id)', desc: "<code>meshType: 'microvoxel' | 'cross'</code> troca o cubo por um modelo 3D (plantas, vinhas)." }
        ],
        example: {
          title: 'A tabela inteira, desenhada como voxels',
          note: 'Cada pilar é um bloco registrado. Cor, transparência e brilho vêm do registro — registre um bloco novo no topo do código e ele aparece na cena.',
          code: `// Dois blocos novos, registrados agora:
blockRegistry.register({ id: 22, name: 'amethyst', color: 0x9b6cf6, solid: true, opaque: true, luminance: 9 });
blockRegistry.register({ id: 23, name: 'rubber', color: 0x2f3e46, solid: true, opaque: true, slipperiness: 0.2 });

const blocos = blockRegistry.getAll().filter((b) => !b.air);
const SIZE = 48;

worldGeneratorRegistry.register({
  id: 'docs-vitrine',
  generate(ctx) {
    for (let x = ctx.startX; x < ctx.endX; x++) {
      for (let z = ctx.startZ; z < ctx.endZ; z++) ctx.setBlock(x, 0, z, 1);
    }
    blocos.forEach((b, i) => {
      const x = 3 + (i % 8) * 5;
      const z = 3 + Math.floor(i / 8) * 5;
      const altura = 2 + (i % 4);
      for (let y = 1; y <= altura; y++) {
        for (let dx = 0; dx < 3; dx++) {
          for (let dz = 0; dz < 3; dz++) ctx.setBlock(x + dx, y, z + dz, b.id);
        }
      }
    });
  }
});

const chunk = new ChunkData({
  size: SIZE, height: SIZE,
  startX: 0, endX: SIZE, startY: 0, endY: SIZE, startZ: 0, endZ: SIZE,
  worldParams: { seed: 1, worldType: 'docs-vitrine', terrain: { scale: 40, magnitude: 6, offset: 4, octaves: 3, persistence: 0.5 } }
});

const geo = new ChunkGeometry(chunk.getData()).getData();
const view = view3D({ target: [SIZE / 2, 3, SIZE / 2], distance: 72 });
view.add(voxelMesh(geo.opaque));
view.add(voxelMesh(geo.water, { transparent: true, opacity: 0.65 }));
view.hud(blocos.length + ' blocos registrados · as cores saem direto do blockRegistry');

for (const b of blocos) {
  print(
    String(b.id).padStart(3), b.name.padEnd(11),
    '#' + b.color.toString(16).padStart(6, '0'),
    'sólido=' + blockRegistry.isSolid(b.id),
    'opaco=' + blockRegistry.isOpaque(b.id),
    'fluido=' + blockRegistry.isFluid(b.id),
    'luz=' + blockRegistry.getLightEmission(b.id),
    'atrito=' + blockRegistry.getSlipperiness(b.id)
  );
}`
        }
      },
      {
        id: 'chunk-data',
        name: 'ChunkData',
        kind: 'class',
        entry: "// módulo interno da engine: importe pelo caminho do arquivo\nimport ChunkData from 'engine/chunk/ChunkData';",
        file: 'engine/chunk/ChunkData.ts',
        summary:
          'O volume de um chunk: <code>size³</code> células em <code>Int8Array</code>, mais os níveis de água em <code>Uint8Array</code>. Implementa <code>ChunkContext</code>, então é ele que o seu <code>WorldGenerator</code> recebe. Coordenadas são sempre de <b>mundo</b>: com <code>stride &gt; 1</code> o mesmo chunk cobre <code>size * stride</code> voxels por eixo — é assim que um chunk de LOD custa o mesmo que um normal.',
        summaryPlain: 'O volume de um chunk e o contexto que o gerador recebe.',
        members: [
          { kind: 'constructor', signature: 'new ChunkData({ size, height, startX…endZ, worldParams, simplex?, voxelsPerBlock?, stride? })', desc: 'O construtor já chama o gerador de <code>worldParams.worldType</code>.' },
          { kind: 'method', signature: 'setBlock(x, y, z, type)', desc: 'Coordenadas de mundo; fora do chunk vira no-op / <code>-1</code>.' },
          { kind: 'method', signature: 'getBlock(x, y, z)', desc: 'Coordenadas de mundo; fora do chunk vira no-op / <code>-1</code>.' },
          { kind: 'method', signature: 'clearBlock(x, y, z)', desc: 'Coordenadas de mundo; fora do chunk vira no-op / <code>-1</code>.' },
          { kind: 'method', signature: 'idx(x, y, z): number', desc: 'Índice da célula, ou <code>-1</code>. É aqui que a divisão por <code>stride</code> acontece.' },
          { kind: 'method', signature: 'octaveBaseNoise(x, z, scaleMult, octaves)', desc: 'Ruído fractal normalizado, pela seed do mundo.' },
          { kind: 'property', signature: 'blocks: Int8Array', desc: 'Layout <code>(y * size + z) * size + x</code>; água de 0 a 255.' },
          { kind: 'property', signature: 'waterLevels: Uint8Array', desc: 'Layout <code>(y * size + z) * size + x</code>; água de 0 a 255.' },
          { kind: 'method', signature: 'getData(): ChunkDataResult', desc: 'O payload transferível que vai ao mesher.' }
        ],
        example: {
          title: 'Escavando o volume e remalhando a cada passo',
          code: `const SIZE = 40;
const chunk = new ChunkData({
  size: SIZE, height: SIZE,
  startX: 0, endX: SIZE, startY: 0, endY: SIZE, startZ: 0, endZ: SIZE,
  worldParams: {
    seed: 7, worldType: 'docs-terreno',
    terrain: { scale: 50, magnitude: 8, offset: 6, octaves: 4, persistence: 0.5 }
  }
});

let solidos = 0;
for (let i = 0; i < chunk.blocks.length; i++) if (chunk.blocks[i] >= 0) solidos++;
print('volume:', chunk.blocks.length, 'células ·', solidos, 'sólidas (' + (100 * solidos / chunk.blocks.length).toFixed(1) + '%)');
print('getBlock(20, 26, 20) =', chunk.getBlock(20, 26, 20), '· idx =', chunk.idx(20, 26, 20), '· fora do chunk:', chunk.idx(999, 0, 0));

const view = view3D({ target: [SIZE / 2, 20, SIZE / 2], distance: 100 });

let malha = null;
const remalhar = () => {
  if (malha) view.remove(malha);
  const geo = new ChunkGeometry(chunk.getData()).getData();
  malha = voxelMesh(geo.opaque);
  view.add(malha);
  return geo.opaque.vertices.length / 3;
};
remalhar();

// escava um túnel com clearBlock e remalha: o volume é a fonte da verdade
let passo = 0;
const timer = setInterval(() => {
  const z = Math.floor(SIZE / 2);
  for (let x = 0; x < SIZE; x++) {
    for (let dy = 0; dy < 4; dy++) {
      for (let dz = -2; dz <= 2; dz++) {
        chunk.clearBlock(x, 30 - passo + dy, z + dz);
      }
    }
  }
  passo++;
  const tris = remalhar();
  view.hud('passo ' + passo + ' · túnel escavado com clearBlock · ' + tris + ' triângulos após remesh');
  if (passo >= 14) clearInterval(timer);
}, 700);
onStop(() => clearInterval(timer));`
        }
      },
      {
        id: 'chunk-geometry',
        name: 'ChunkGeometry',
        kind: 'class',
        entry: "// módulo interno da engine: importe pelo caminho do arquivo\nimport ChunkGeometry from 'engine/chunk/ChunkGeometry';",
        file: 'engine/chunk/ChunkGeometry.ts',
        summary:
          'O greedy mesher. Funde faces coplanares do mesmo material em quads grandes, calcula AO por vértice e separa a geometria opaca da de água. As fatias de borda dos vizinhos entram por parâmetro para que faces internas entre chunks não sejam geradas.',
        summaryPlain: 'O greedy mesher: funde faces coplanares em quads e calcula AO.',
        members: [
          { kind: 'constructor', signature: 'new ChunkGeometry(chunkData, borders?, light?, borderLight?, borderWater?, greedyMeshing?)', desc: '<code>greedyMeshing: false</code> cai no mesher naïve — um quad por face.' },
          { kind: 'method', signature: 'getData(): { opaque, water }', desc: '<code>positions</code>, <code>normals</code>, <code>uvs</code>, <code>colors</code>, <code>ao</code>, <code>light</code>, <code>isWater</code>, <code>creationTime</code> e <code>vertices</code> (índices).' },
          { kind: 'property', signature: 'borders: ChunkBorders', desc: 'Fatias de 1 bloco dos vizinhos: <code>negX</code>, <code>posX</code>, <code>negY</code>, <code>posY</code>, <code>negZ</code>, <code>posZ</code>.' },
          { kind: 'property', signature: 'light?: Uint8Array', desc: 'Luz empacotada (<code>sky &lt;&lt; 4 | block</code>); <code>undefined</code> = tudo iluminado pelo céu.' }
        ],
        example: {
          title: 'Greedy contra naïve, lado a lado, com o wireframe entrando',
          note: 'Os dois lados são o <b>mesmo volume</b>. O wireframe entra e sai a cada 3 s: à esquerda os quads são grandes e poucos; à direita, um por face.',
          code: `const SIZE = 32;
const chunk = new ChunkData({
  size: SIZE, height: SIZE,
  startX: 0, endX: SIZE, startY: 0, endY: SIZE, startZ: 0, endZ: SIZE,
  worldParams: { seed: 11, worldType: 'docs-terreno', terrain: { scale: 48, magnitude: 8, offset: 6, octaves: 4, persistence: 0.5 } }
});

const t0 = performance.now();
const greedy = new ChunkGeometry(chunk.getData(), {}, undefined, {}, {}, true).getData();
const t1 = performance.now();
const naive = new ChunkGeometry(chunk.getData(), {}, undefined, {}, {}, false).getData();
const t2 = performance.now();

const tris = (g) => g.vertices.length / 3;

print('greedy:', tris(greedy.opaque), 'triângulos em', (t1 - t0).toFixed(1), 'ms');
print('naïve :', tris(naive.opaque), 'triângulos em', (t2 - t1).toFixed(1), 'ms');
print('redução:', (100 - 100 * tris(greedy.opaque) / tris(naive.opaque)).toFixed(1) + '%');
print('água  :', tris(greedy.water), 'triângulos (malha separada, desenhada transparente)');

const view = view3D({ target: [0, 14, SIZE / 2], distance: 115 });

const montar = (dados, x) => {
  const solido = voxelMesh(dados.opaque);
  const agua = voxelMesh(dados.water, { transparent: true, opacity: 0.6 });
  const fio = voxelMesh(dados.opaque, { wireframe: true });
  for (const m of [solido, agua, fio]) { m.position.x = x; view.add(m); }
  return fio;
};

const fioGreedy = montar(greedy, -SIZE * 0.62);
const fioNaive = montar(naive, SIZE * 0.62);

let mostrandoFio = false;
const alternar = () => {
  mostrandoFio = !mostrandoFio;
  fioGreedy.visible = mostrandoFio;
  fioNaive.visible = mostrandoFio;
  view.hud(
    'esquerda: greedy — ' + tris(greedy.opaque) + ' triângulos    |    direita: naïve — ' + tris(naive.opaque) + ' triângulos\\n' +
    (mostrandoFio ? 'wireframe ligado: compare o tamanho dos quads' : 'wireframe desligado: a imagem é a mesma nos dois')
  );
};
alternar();
const timer = setInterval(alternar, 3000);
onStop(() => clearInterval(timer));`
        }
      },
      {
        id: 'types',
        name: 'types',
        kind: 'interface',
        entry: "import type { WorldParams, ChunkDataResult, GeometryData } from '@voxel/engine/worker';",
        file: 'engine/types.ts',
        summary:
          'Os contratos que atravessam as threads. Tudo que vai para um worker é estrutura plana e <code>TypedArray</code>, para poder ser transferido sem cópia — é por isso que a engine não tem classes do lado do dado.',
        summaryPlain: 'Os contratos entre threads: estruturas planas e TypedArrays transferíveis.',
        members: [
          { kind: 'property', signature: 'WorldParams { seed, worldType, terrain }', desc: '<code>TerrainParams { scale, magnitude, offset, octaves, persistence }</code>.' },
          { kind: 'property', signature: 'ChunkDataResult { startX…endZ, blocks: Int8Array, waterLevels: Uint8Array }', desc: 'O volume pronto para o mesher.' },
          { kind: 'property', signature: 'ChunkBorders { negX?, posX?, negY?, posY?, negZ?, posZ? }', desc: 'Fatias de 1 bloco por face, guardadas por chunk.' },
          { kind: 'property', signature: 'GeometryData { positions, normals, uvs, colors, ao, light, isWater, creationTime, vertices }', desc: 'Atributos do mesh; <code>vertices</code> é o índice <code>Uint32Array</code>.' },
          { kind: 'property', signature: 'ChunkJobData / WorkerResponse', desc: 'O job que vai e volta do chunk worker.' },
          { kind: 'property', signature: 'BlockPosition', desc: 'Geometria de face usada pelo mesher e pelos micro-voxels.' },
          { kind: 'property', signature: 'FaceDefinition', desc: 'Geometria de face usada pelo mesher e pelos micro-voxels.' },
          { kind: 'property', signature: 'FaceLabel', desc: 'Geometria de face usada pelo mesher e pelos micro-voxels.' }
        ],
        example: {
          title: 'Os mesmos buffers, desenhados de três jeitos',
          note: 'A geometria é uma só. O que muda a cada 2,5 s é qual <i>atributo</i> vai para a cor do vértice: a cor do bloco, a normal da face ou a oclusão de ambiente.',
          code: `const SIZE = 32;
const chunk = new ChunkData({
  size: SIZE, height: SIZE,
  startX: 0, endX: SIZE, startY: 0, endY: SIZE, startZ: 0, endZ: SIZE,
  worldParams: { seed: 3, worldType: 'docs-terreno', terrain: { scale: 44, magnitude: 8, offset: 6, octaves: 4, persistence: 0.5 } }
});

const geo = new ChunkGeometry(chunk.getData()).getData().opaque; // GeometryData

for (const [nome, buffer] of Object.entries(geo)) {
  print(('  ' + nome).padEnd(16), buffer.constructor.name.padEnd(13), String(buffer.length).padStart(7), 'valores');
}

const view = view3D({ target: [SIZE / 2, 16, SIZE / 2], distance: 90 });
const n = geo.positions.length / 3;

// Um mesh por modo, trocando SÓ o atributo de cor.
const fazer = (cores) => {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(geo.positions, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(geo.normals, 3));
  g.setAttribute('color', new THREE.BufferAttribute(cores, 3));
  g.setIndex(new THREE.BufferAttribute(geo.vertices, 1));
  const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true }));
  m.visible = false;
  view.add(m);
  return m;
};

const doBloco = new Float32Array(geo.colors);
const daNormal = new Float32Array(n * 3);
const doAo = new Float32Array(n * 3);
for (let v = 0; v < n; v++) {
  daNormal[v * 3] = geo.normals[v * 3] * 0.5 + 0.5;
  daNormal[v * 3 + 1] = geo.normals[v * 3 + 1] * 0.5 + 0.5;
  daNormal[v * 3 + 2] = geo.normals[v * 3 + 2] * 0.5 + 0.5;
  const ao = geo.ao[v];
  doAo[v * 3] = ao;
  doAo[v * 3 + 1] = ao;
  doAo[v * 3 + 2] = ao;
}

const modos = [
  ['colors — a cor do bloco, vinda do blockRegistry', fazer(doBloco)],
  ['normals — a direção da face (x,y,z → r,g,b)', fazer(daNormal)],
  ['ao — oclusão de ambiente por vértice', fazer(doAo)]
];

let i = 0;
const mostrar = () => {
  modos.forEach(([, m], k) => { m.visible = k === i % modos.length; });
  view.hud(modos[i % modos.length][0] + '\\n' + n.toLocaleString('pt-BR') + ' vértices · ' + (geo.vertices.length / 3).toLocaleString('pt-BR') + ' triângulos');
  i++;
};
mostrar();
const timer = setInterval(mostrar, 2500);
onStop(() => clearInterval(timer));`
        }
      }
    ]
  },
  {
    id: 'mundo',
    title: 'Mundo & Dimensões',
    icon: 'public',
    blurb: 'Geração procedural, streaming de chunks, céu, LOD e dimensões.',
    modules: [
      {
        id: 'world-generator',
        name: 'WorldGenerator',
        kind: 'interface',
        entry: "import { worldGeneratorRegistry, type WorldGenerator, type ChunkContext } from '@voxel/engine/chunk-worker';",
        file: 'engine/world/WorldGenerator.ts',
        summary:
          'O ponto de extensão do mundo: um objeto com <code>id</code> e <code>generate(ctx)</code>, executado <b>dentro do chunk worker</b>, uma vez por chunk. Escreva o relevo em <b>blocos</b> e multiplique por <code>ctx.voxelsPerBlock</code>: o mesmo gerador serve qualquer resolução.',
        summaryPlain: 'Escreva generate(ctx) e o chunk worker gera o mundo com ele.',
        related: 'Escrever <code>generate(ctx)</code> na mão como aqui é o nível mais baixo — a interface crua. Pra maioria dos mundos, use a abstração pronta: veja <a href="/docs/api/terrain-generator/"><code>createWorld</code></a> (terreno + biomas + cavernas a partir de config), <a href="/docs/api/custom-generator/"><code>customGenerator</code></a> (campo de densidade por voxel) ou a <a href="/docs/api/generator-types/">visão geral dos tipos de gerador</a> comparando todos eles.',
        members: [
          { kind: 'property', signature: 'id: string', desc: 'Casa com <code>worldParams.worldType</code> e com <code>DimensionDefinition.generatorId</code>.' },
          { kind: 'method', signature: 'generate(ctx: ChunkContext): void', desc: 'Escreve no volume com <code>ctx.setBlock</code>.' },
          { kind: 'property', signature: 'ctx.startX…endZ', desc: '<code>stride &gt; 1</code> é um chunk de LOD: avance os laços de <code>stride</code> em <code>stride</code>.' },
          { kind: 'property', signature: 'ctx.size', desc: '<code>stride &gt; 1</code> é um chunk de LOD: avance os laços de <code>stride</code> em <code>stride</code>.' },
          { kind: 'property', signature: 'ctx.stride', desc: '<code>stride &gt; 1</code> é um chunk de LOD: avance os laços de <code>stride</code> em <code>stride</code>.' },
          { kind: 'property', signature: 'ctx.voxelsPerBlock', desc: '<code>stride &gt; 1</code> é um chunk de LOD: avance os laços de <code>stride</code> em <code>stride</code>.' },
          { kind: 'property', signature: 'ctx.simplex', desc: 'Ruído determinístico pela seed do mundo.' },
          { kind: 'method', signature: 'ctx.octaveBaseNoise(x, z, scaleMult, octaves)', desc: 'Ruído determinístico pela seed do mundo.' },
          { kind: 'method', signature: 'worldGeneratorRegistry.register(gen)', desc: 'Singleton por thread; IDs comparados em minúsculas.' },
          { kind: 'method', signature: 'get(id)', desc: 'Singleton por thread; IDs comparados em minúsculas.' },
          { kind: 'method', signature: 'has(id)', desc: 'Singleton por thread; IDs comparados em minúsculas.' },
          { kind: 'method', signature: 'getAll()', desc: 'Singleton por thread; IDs comparados em minúsculas.' }
        ],
        example: {
          title: 'Seu gerador, rodando nos chunk workers de um mundo real',
          note: 'O corpo de <code>generate</code> abaixo é enviado para cada chunk worker, compilado lá e usado para gerar o terreno que você vê. Edite e execute: o mundo inteiro muda.',
          code: `const demo = worldSandbox({
  generator: {
    id: 'meu-gerador',
    // generate(ctx) de verdade — roda aqui só pra virar texto (.toString());
    // quem EXECUTA é o chunk worker, onde BLOCKS existe como variável livre.
    generate(ctx) {
      const s = ctx.voxelsPerBlock;
      for (let x = ctx.startX; x < ctx.endX; x += ctx.stride) {
        for (let z = ctx.startZ; z < ctx.endZ; z += ctx.stride) {
          const colina = ctx.octaveBaseNoise(x / s, z / s, 1, 4) * 12;
          const terraco = Math.round(colina / 4) * 4; // degraus
          const h = Math.floor((26 + terraco) * s);
          for (let y = ctx.startY; y < ctx.endY && y <= h; y += ctx.stride) {
            const d = (h - y) / s;
            let t = BLOCKS.stone;
            if (d < 1) t = h > 34 * s ? BLOCKS.snow : BLOCKS.grass;
            else if (d < 4) t = BLOCKS.dirt;
            if (d > 8 && Math.abs(ctx.simplex.noise3d(x / s / 7, y / s / 7, z / s / 7)) > 0.72) t = BLOCKS.glowstone;
            ctx.setBlock(x, y, z, t);
          }
          for (let y = h + 1; y <= 26 * s; y += ctx.stride) ctx.setBlock(x, y, z, BLOCKS.water);
        }
      }
    }
  },
  world: { chunkSize: 32, renderDistance: 6, verticalRenderDistance: 2 },
  spawn: [0, 60, 0], lookAt: [0, 26, 0], distance: 140,
  shaders: 'medium'
});

await demo.ready();

demo.onFrame(() => {
  const w = demo.world.getWorkerStats();
  demo.hud(
    'gerador do leitor rodando em ' + w.total + ' chunk workers · ' + w.busy + ' ocupados, ' + w.queued + ' na fila\\n' +
    demo.world.getLoadedChunkCount() + ' chunks carregados · ' + (demo.world.getVoxelRamBytes() / 1048576).toFixed(1) + ' MB de voxel'
  );
});

print('geradores registrados nesta thread:', worldGeneratorRegistry.getAll().map((g) => g.id).join(', '));
print('o seu vive na outra ponta — nos chunk workers, que é onde o terreno nasce.');`
        }
      },
      {
        id: 'generator-types',
        name: 'Generator Types',
        kind: 'guide',
        entry:
          "import { createWorld, customGenerator, CaveCarver, worldGeneratorRegistry } from '@voxel/engine/chunk-worker';",
        file: 'engine/world/generation/terrain.ts',
        summary:
          'Quatro jeitos de produzir um <code>WorldGenerator</code>, do mais pronto ao mais cru — todos terminam no mesmo lugar: um objeto com <code>id</code> e <code>generate(ctx)</code>, registrado em <code>worldGeneratorRegistry</code>. Comece pelo primeiro que resolver o seu mundo; só desça de nível quando a composição não bastar.',
        summaryPlain: 'Os quatro jeitos de montar um gerador — do createWorld declarativo até o WorldGenerator cru — e quando usar cada um.',
        members: [
          {
            kind: 'property',
            signature: "createWorld({ terrain, biomes, layers, caves? })",
            desc: '<b>Comece aqui.</b> Terreno (heightmap + montanhas/colinas componíveis), biomas, camadas de superfície e cavernas, tudo a partir de config — cobre a maioria dos mundos em poucas linhas. Ver <a href="/docs/api/terrain-generator/">createWorld</a>.'
          },
          {
            kind: 'property',
            signature: "customGenerator({ id, sample({x,y,z,ctx}) })",
            desc: 'Quando o relevo não é uma função de altura (esferas flutuantes, cavidades fechadas, formas arbitrárias): um campo de densidade por voxel, a engine cuida do loop. Ver <a href="/docs/api/custom-generator/">customGenerator</a>.'
          },
          {
            kind: 'property',
            signature: 'new CaveCarver(ctx, options).apply()',
            desc: 'Só o subsolo: talha túneis/câmaras/ravinas/geodos sobre QUALQUER superfície sua (de <code>createWorld</code>, <code>customGenerator</code> ou escrita à mão) — não é um gerador completo por si, compõe com um dos três. Ver <a href="/docs/api/cave-carver/">CaveCarver</a>.'
          },
          {
            kind: 'property',
            signature: 'generate(ctx): void',
            desc: 'O nível cru: você mesmo escreve o laço pela coluna/voxel e chama <code>ctx.setBlock</code>. Sem limite de expressividade, sem composição ganha de graça. Ver <a href="/docs/api/world-generator/">WorldGenerator</a>.'
          }
        ],
        example: {
          title: 'O ponto de partida recomendado: createWorld',
          note: 'As quatro abordagens acima terminam aqui — um <code>WorldGenerator</code> rodando num mundo real. Esta demo usa a mais pronta das quatro; troque para <code>customGenerator</code> ou <code>CaveCarver</code> olhando os exemplos das páginas linkadas.',
          code: `const demo = worldSandbox({
  generator: {
    id: 'ponto-de-partida',
    // generate(ctx) de verdade; GEN e BLOCKS existem como variáveis livres no chunk worker.
    generate(ctx) {
      const world = GEN.createWorld({
        id: 'ponto-de-partida',
        terrain: [GEN.baseTerrain({ height: 96 }), GEN.hills({ height: 10 })],
        biomes: { rules: [{ id: 'planicie', test: () => true }] },
        layers: {
          planicie: { top: { blockId: BLOCKS.grass, depth: 1 }, fill: { blockId: BLOCKS.dirt, depth: 3 }, stoneBlockId: BLOCKS.stone }
        }
      });
      return world.generate(ctx);
    }
  },
  world: { chunkSize: 32, renderDistance: 6, verticalRenderDistance: 2 },
  spawn: [0, 70, 0], lookAt: [0, 30, 0], distance: 140,
  shaders: 'medium'
});

await demo.ready();
print('isto é createWorld — a opção recomendada. compare com os exemplos de customGenerator e CaveCarver nas páginas linkadas acima.');`
        }
      },
      {
        id: 'terrain-generator',
        name: 'createWorld',
        kind: 'function',
        entry: "import { createWorld, baseTerrain, mountains, hills, region, flatTerrain } from '@voxel/engine/chunk-worker';",
        file: 'engine/world/generation/terrain.ts',
        summary:
          'Monta um <code>WorldGenerator</code> completo a partir de config — uma pilha de camadas de terreno compostas (<code>baseTerrain</code>, <code>mountains</code>, <code>hills</code>, ...), biomas, camadas de superfície e cavernas opcionais. <code>terrain</code> é um array, não um objeto de opções fechado: cada camada só soma ou substitui a altura que recebeu da anterior, então empilhar <code>[baseTerrain(), mountains(), hills()]</code> é literalmente "pegue o relevo de base, erga montanhas onde fizer sentido, e jogue colinas menores por cima" — na ordem que você escrever.',
        summaryPlain: 'Camadas de terreno componíveis + biomas + camadas de superfície + cavernas, num WorldGenerator pronto.',
        members: [
          { kind: 'method', signature: 'createWorld(options: WorldOptions): WorldGenerator', desc: 'O resultado já tem <code>id</code> e <code>generate(ctx)</code> — registre direto em <code>worldGeneratorRegistry</code>.' },
          { kind: 'property', signature: 'terrain: TerrainLayer[]', desc: 'Cada camada recebe <code>{ height, raw }</code> da anterior e devolve mutado — <code>baseTerrain</code> estabelece a forma (e <code>raw</code>, o ruído de continente normalizado); <code>mountains</code>/<code>hills</code> somam em cima; <code>flatTerrain</code> substitui tudo.' },
          { kind: 'property', signature: 'overrides?: TerrainOverride[]', desc: 'Regiões (ver <code>region()</code>) cujo próprio <code>terrain</code> substitui o do mundo inteiro, só ali dentro — um platô plano pra uma construção, por exemplo.' },
          { kind: 'property', signature: 'biomes: { rules: BiomeRule[], temperature?, moisture? }', desc: 'Repassado pra <code>classifyBiome</code>: a primeira regra da lista cujo <code>test(climate)</code> der true vence — sem lista de biomas embutida na engine.' },
          { kind: 'property', signature: 'layers: Record&lt;string, SurfaceLayerConfig&gt;', desc: 'Uma entrada por id de bioma (<code>{ top?, fill?, stoneBlockId }</code>); bioma sem entrada fica sem blocos nessa coluna.' },
          { kind: 'property', signature: 'ores?: OreRule[]', desc: 'Minério espalhado por ruído 3D abaixo de <code>oreMinDepth</code> blocos (padrão 8), só onde a coluna ainda é <code>stoneBlockId</code>.' },
          { kind: 'property', signature: 'caves?: Partial&lt;CaveCarverOptions&gt;', desc: 'Omitido = mundo sem caverna nenhuma. <code>sampleSurfaceHeight</code> já sai ligado às mesmas camadas de terreno — só falta biomas/blocos de caverna.' },
          { kind: 'method', signature: 'baseTerrain(options: { height, continent?, detail?, base?, spread? })', desc: 'A forma de base: ruído de continente + detalhe. Primeira camada da pilha, quase sempre.' },
          { kind: 'method', signature: 'mountains(options?: { height?, threshold?, minHeight?, ridge?, ... })', desc: '<code>height</code> é o teto de elevação em blocos (padrão 56). Só ergue onde <code>raw</code> (de <code>baseTerrain</code>) passa do limiar.' },
          { kind: 'method', signature: 'hills(options?: { height?, scale?, octaves?, offset? })', desc: '<code>height</code> é a amplitude em blocos (padrão 12) de uma ondulação independente, somada em cima do que veio antes.' },
          { kind: 'method', signature: 'flatTerrain(options: { height })', desc: 'Substitui a altura recebida por um valor fixo — o uso típico é dentro de um <code>region()</code>.' },
          { kind: 'method', signature: 'region(options: { from: [x,y,z], to: [x,y,z], terrain })', desc: 'Caixa em XZ (Y é ignorado): dentro dela, <code>terrain</code> substitui a pilha do mundo inteiro.' }
        ],
        example: {
          title: 'Um mundo completo — montanhas, colinas, cavernas e um platô embutido',
          note: 'O corpo abaixo é enviado para cada chunk worker, compilado lá e usado pra gerar o terreno que você vê. Troque a ordem/parâmetros das camadas e execute de novo.',
          code: `const demo = worldSandbox({
  generator: {
    id: 'meu-terreno',
    // generate(ctx) de verdade; GEN (a abstração de geração procedural) e BLOCKS
    // já existem como variáveis livres dentro do chunk worker que executa isto.
    generate(ctx) {
      const world = GEN.createWorld({
        id: 'meu-terreno',
        terrain: [GEN.baseTerrain({ height: 128 }), GEN.mountains(), GEN.hills({ height: 6 })],
        overrides: [
          GEN.region({
            from: [-16, 0, -16], to: [16, 0, 16],
            terrain: GEN.flatTerrain({ height: 40 })
          })
        ],
        biomes: {
          rules: [
            { id: 'praia', test: (c) => c.elevation <= 34 },
            { id: 'planicie', test: () => true }
          ]
        },
        layers: {
          praia: { top: { blockId: BLOCKS.sand, depth: 3 }, stoneBlockId: BLOCKS.stone },
          planicie: { top: { blockId: BLOCKS.grass, depth: 1 }, fill: { blockId: BLOCKS.dirt, depth: 3 }, stoneBlockId: BLOCKS.stone }
        },
        caves: {
          seaLevel: 32,
          waterBlockId: BLOCKS.water,
          lavaBlockId: BLOCKS.lava,
          rockBlockIds: [BLOCKS.stone],
          biomes: [{
            id: 'padrao',
            test: () => true,
            profile: {
              tunnelScale: 34, tunnelWidth: 0.22, tunnelSquash: 1.1,
              chamberScale: 40, chamberThreshold: 0.5,
              wall: BLOCKS.stone, floor: BLOCKS.stone, lined: false
            }
          }]
        }
      });
      return world.generate(ctx);
    }
  },
  world: { chunkSize: 32, renderDistance: 6, verticalRenderDistance: 3 },
  spawn: [0, 110, 0], lookAt: [0, 40, 0], distance: 180,
  shaders: 'medium'
});

await demo.ready();

demo.onFrame(() => {
  const w = demo.world.getWorkerStats();
  demo.hud(
    'mundo gerado por createWorld · ' + w.total + ' chunk workers · ' + w.busy + ' ocupados\\n' +
    demo.world.getLoadedChunkCount() + ' chunks carregados'
  );
});

print('o platô em (0,0) vem de "overrides" — remova esse bloco e a montanha toma o lugar dele.');
print('troque a ordem das camadas em "terrain": mountains() antes de hills() não é o mesmo mundo que depois.');`
        }
      },
      {
        id: 'custom-generator',
        name: 'customGenerator',
        kind: 'function',
        entry: "import { customGenerator } from '@voxel/engine/chunk-worker';",
        file: 'engine/world/generation/customGenerator.ts',
        summary:
          'A válvula de escape em campo de densidade: uma função <code>sample({ x, y, z, ctx })</code> que olha um ponto e devolve <code>{ density, material }</code> — <code>density &gt; 0</code> é sólido, o resto é ar. Sem heightmap, sem bioma, sem camada no meio: o loop pelo volume e as chamadas de <code>ctx.setBlock</code> ficam por conta desta função. Ainda é só um <code>WorldGenerator</code> por baixo — nada aqui é inexpressável escrevendo <code>generate(ctx)</code> na mão, isto só faz o loop por você.',
        summaryPlain: 'Um sample(x,y,z) por voxel, densidade + material — a engine cuida do loop.',
        members: [
          { kind: 'method', signature: 'customGenerator(options: { id, sample, materials? }): WorldGenerator', desc: 'Chamado uma vez por voxel do chunk (respeitando <code>ctx.stride</code>). Devolver <code>null</code> deixa o voxel como estava (ar).' },
          { kind: 'property', signature: 'sample({ x, y, z, ctx }): { density: number; material: number | string } | null', desc: '<code>material</code> pode ser o id numérico direto, ou uma chave resolvida via <code>materials</code>.' },
          { kind: 'property', signature: 'materials?: Record&lt;string, number&gt;', desc: 'Deixa <code>sample</code> devolver <code>material: "alien-rock"</code> em vez de memorizar id numérico — resolvido aqui, não por nome adivinhado na engine.' }
        ],
        example: {
          title: 'Um planeta alienígena — campo de densidade esférico, sem heightmap nenhum',
          note: 'Nada de coluna/altura aqui: cada voxel decide por conta própria se é sólido, olhando a distância até o centro mais ruído 3D — dá pra fazer coisas que um heightmap não expressa, como esta esfera flutuante.',
          code: `const demo = worldSandbox({
  generator: {
    id: 'planeta-alien',
    generate(ctx) {
      const center = { x: 0, y: 40, z: 0 };
      const radius = 28;
      const world = GEN.customGenerator({
        id: 'planeta-alien',
        materials: { rocha: BLOCKS.basalt, nucleo: BLOCKS.glowstone },
        sample({ x, y, z, ctx }) {
          const dx = x - center.x, dy = y - center.y, dz = z - center.z;
          const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
          const noise = ctx.simplex.noise3d(x / 9, y / 9, z / 9) * 4;
          const density = radius + noise - dist;
          if (density <= 0) return null;
          return { density, material: dist < radius * 0.35 ? 'nucleo' : 'rocha' };
        }
      });
      return world.generate(ctx);
    }
  },
  world: { chunkSize: 32, renderDistance: 4, verticalRenderDistance: 4 },
  spawn: [0, 40, 70], lookAt: [0, 40, 0], distance: 90,
  shaders: 'medium'
});

await demo.ready();
print('troque o ruído, o raio, ou a condição do núcleo — e rode de novo. density > 0 é tudo que importa.');`
        }
      },
      {
        id: 'cave-carver',
        name: 'CaveCarver',
        kind: 'class',
        entry: "import { CaveCarver } from '@voxel/engine/chunk-worker';",
        file: 'engine/world/generation/caves.ts',
        summary:
          'Esculpe e decora as cavernas de um chunk: túneis 3D ("worm noise") + câmaras "queijo" pra rede principal, mais ravinas, poços e geodos espalhados em grades de célula — tudo função pura das coordenadas do mundo, então as galerias encaixam sem costura entre chunks gerados por workers diferentes, em qualquer ordem. Extraído e generalizado de um exemplo que tinha 6 biomas de caverna fixos (dripstone, fungal, cristal, magma...) com nome de bloco direto no código: aqui nenhum bloco ou bioma é embutido — tudo chega por <code>CaveCarverOptions.biomes</code>.',
        summaryPlain: 'Talha túneis, câmaras, ravinas, poços e geodos — biomas e decoração 100% configuráveis.',
        members: [
          { kind: 'constructor', signature: 'new CaveCarver(ctx: ChunkContext, options: CaveCarverOptions)', desc: '<code>options.biomes</code> é avaliada em ordem (primeira regra que bater vence); a última entrada é o fallback.' },
          { kind: 'method', signature: 'apply(): void', desc: 'Talha, forra as paredes, posiciona geodos (se configurados) e decora. Uma vez por chunk.' },
          { kind: 'method', signature: 'biomeAt(x: number, y: number, z: number): string', desc: 'Qual id de bioma ocupa esse ponto — útil pra outro sistema (árvores, estruturas) concordar com a caverna.' },
          { kind: 'property', signature: 'CaveProfile { tunnelScale, tunnelWidth, tunnelSquash, chamberScale, chamberThreshold, wall, floor, lined, ... }', desc: 'Forma do talhe + material de forro; campos opcionais (<code>blotchWallBlock</code>, <code>veinBlock</code>, <code>floodsWithLava</code>, <code>allowsGeodes</code>) cobrem as variações mais comuns sem precisar reescrever a talha.' },
          { kind: 'property', signature: 'profile.decorate?(h, x, y, z, info): void', desc: 'Chamado por célula de ar exposta (chão/teto/água) dentro do bioma. <code>h</code> dá <code>clearance</code>, <code>isAir/isSolid/isWater</code> e um hash estável pra sorteio.' },
          { kind: 'property', signature: 'profile.decorateStructure?(h, x, y, z, roll): void', desc: 'Varredura mais larga, pra decoração rara e grande (ex.: uma estrutura que não cabe no padding normal) — só roda se algum bioma declarar isto.' }
        ],
        example: {
          title: 'Cavernas sozinhas, sobre um terreno simples',
          note: 'O mesmo volume de sempre, mas com o subsolo esculpido por CaveCarver — ande por baixo do chão pra ver os túneis.',
          code: `const demo = worldSandbox({
  generator: {
    id: 'minhas-cavernas',
    // generate(ctx) de verdade; GEN e BLOCKS existem como variáveis livres no chunk worker.
    generate(ctx) {
      for (let x = ctx.startX; x < ctx.endX; x++) {
        for (let z = ctx.startZ; z < ctx.endZ; z++) {
          const sy = GEN.sampleHeight(ctx, x, z, { height: 64 });
          for (let y = ctx.startY; y <= sy && y < ctx.endY; y++) ctx.setBlock(x, y, z, BLOCKS.stone);
        }
      }
      new GEN.CaveCarver(ctx, {
        seaLevel: 16,
        waterBlockId: BLOCKS.water,
        lavaBlockId: BLOCKS.lava,
        rockBlockIds: [BLOCKS.stone],
        sampleSurfaceHeight: (c, x, z) => GEN.sampleHeight(c, x, z, { height: 64 }),
        biomes: [{
          id: 'raso',
          test: (c) => c.depth < 40,
          profile: {
            tunnelScale: 30, tunnelWidth: 0.24, tunnelSquash: 1.3,
            chamberScale: 38, chamberThreshold: 0.48,
            wall: BLOCKS.stone, floor: BLOCKS.stone, lined: false
          }
        }, {
          id: 'fundo',
          test: () => true,
          profile: {
            tunnelScale: 46, tunnelWidth: 0.3, tunnelSquash: 0.7,
            chamberScale: 42, chamberThreshold: 0.3,
            wall: BLOCKS.glowstone, floor: BLOCKS.basalt, lined: true,
            floodsWithLava: true
          }
        }],
        lavaSeaY: () => -10
      }).apply();
    }
  },
  world: { chunkSize: 32, renderDistance: 5, verticalRenderDistance: 3 },
  spawn: [0, 70, 0], lookAt: [0, 20, 0], distance: 130,
  shaders: 'medium'
});

await demo.ready();
print('dois biomas de caverna: raso (rocha nua) até 40 blocos de profundidade, depois fundo (com luz e lava).');
print('troque os parâmetros do perfil e rode de novo — a forma do talhe muda na hora.');`
        }
      },
      {
        id: 'procedural-world',
        name: 'ProceduralWorld',
        kind: 'class',
        entry: "import { ProceduralWorld } from '@voxel/engine/worker';",
        file: 'engine/world/ProceduralWorld.ts',
        summary:
          'O mundo vivo: um <code>THREE.Group</code> que faz streaming de chunks ao redor da câmera, despacha jobs para o pool de chunk workers, mantém anéis de LOD, luz, água e sombras, e expõe a edição de voxels.',
        summaryPlain: 'Streaming de chunks, LOD, luz, água, sombras e edição de voxel.',
        members: [
          { kind: 'constructor', signature: 'new ProceduralWorld({ camera, createChunkWorker, chunkSize, renderDistance, … })', desc: '<code>lodRings: [8, 14, 20]</code> = resolução cheia até 8 chunks, metade até 14, um quarto até 20. Cada passo precisa dividir <code>chunkSize</code>.' },
          { kind: 'method', signature: 'tick(deltaMs)', desc: 'Um passo: céu, entidades, fluidos, streaming e costura de luz, com orçamento de tempo por quadro.' },
          { kind: 'method', signature: 'setBlockAt(bx, by, bz, type)', desc: 'Leitura e escrita de voxel, com rebuild do chunk e dos vizinhos de borda.' },
          { kind: 'method', signature: 'getBlock(x, y, z)', desc: 'Leitura e escrita de voxel, com rebuild do chunk e dos vizinhos de borda.' },
          { kind: 'method', signature: 'getWaterLevel(…)', desc: 'Leitura e escrita de voxel, com rebuild do chunk e dos vizinhos de borda.' },
          { kind: 'method', signature: 'isBlockSolid(…)', desc: 'Leitura e escrita de voxel, com rebuild do chunk e dos vizinhos de borda.' },
          { kind: 'method', signature: 'setBlockFast(…, dirtyKeys?, borderAdjKeys?)', desc: 'Caminho em lote: milhares de escritas, um rebuild só no fim. É o que o autômato de fluidos usa.' },
          { kind: 'method', signature: 'flushDirtyChunks(dirtyKeys, …)', desc: 'Caminho em lote: milhares de escritas, um rebuild só no fim. É o que o autômato de fluidos usa.' },
          { kind: 'method', signature: "editSphere(center, radius, 'destroy' | 'fill' | 'paint', type?)", desc: 'Escultura esférica — a base do modo micro-voxel.' },
          { kind: 'method', signature: 'setRenderDistance(d)', desc: 'Trocar de dimensão refaz céu, física e gerador.' },
          { kind: 'method', signature: 'setTime(phase)', desc: 'Trocar de dimensão refaz céu, física e gerador.' },
          { kind: 'method', signature: 'switchDimension(dim, pos?)', desc: 'Trocar de dimensão refaz céu, física e gerador.' },
          { kind: 'method', signature: 'reset(params?)', desc: 'Trocar de dimensão refaz céu, física e gerador.' },
          { kind: 'method', signature: 'setShadows(on, opts?)', desc: 'Sombra direcional e as leituras que os efeitos consomem.' },
          { kind: 'method', signature: 'renderShadows(renderer, scene)', desc: 'Sombra direcional e as leituras que os efeitos consomem.' },
          { kind: 'method', signature: 'getSunDirection(t)', desc: 'Sombra direcional e as leituras que os efeitos consomem.' },
          { kind: 'method', signature: 'getAtmosphereColor(t)', desc: 'Sombra direcional e as leituras que os efeitos consomem.' },
          { kind: 'method', signature: 'getLoadedChunkCount()', desc: 'A telemetria que vira <code>EngineStats</code>.' },
          { kind: 'method', signature: 'getWorkerStats()', desc: 'A telemetria que vira <code>EngineStats</code>.' },
          { kind: 'method', signature: 'getVoxelRamBytes()', desc: 'A telemetria que vira <code>EngineStats</code>.' },
          { kind: 'method', signature: 'getEstimatedGpuMemoryBytes()', desc: 'A telemetria que vira <code>EngineStats</code>.' },
          { kind: 'method', signature: 'drySurfaceAt(bx, bz, topY, bottomY)', desc: 'Altura da primeira coluna seca — o spawn usa isso para não nascer no mar.' }
        ],
        example: {
          title: 'Streaming de verdade, com crateras sendo abertas',
          note: 'Arraste para orbitar. A cada 2,5 s o exemplo encontra a superfície com <code>drySurfaceAt</code>, abre uma cratera com <code>editSphere</code> e marca o lugar com glowstone — com rebuild dos chunks afetados.',
          code: `const demo = worldSandbox({
  world: { chunkSize: 32, renderDistance: 6, verticalRenderDistance: 2 },
  spawn: [0, 58, 0], lookAt: [0, 26, 0], distance: 130,
  shadows: true, shaders: 'medium'
});

await demo.ready();
print('mundo carregado. abrindo crateras…');

let n = 0;
const timer = setInterval(() => {
  const angulo = n * 1.3;
  const raio = 18 + (n % 4) * 9;
  const x = Math.round(Math.cos(angulo) * raio);
  const z = Math.round(Math.sin(angulo) * raio);
  const y = demo.world.drySurfaceAt(x, z, 60, 0);
  if (y === null) return;

  demo.world.editSphere(new THREE.Vector3(x, y, z), 5, 'destroy');
  demo.world.setBlockAt(x, y + 1, z, BLOCKS.glowstone);
  print('cratera em', x + ',' + y + ',' + z);
  n++;
}, 2500);
onStop(() => clearInterval(timer));

demo.onFrame(() => {
  const w = demo.world.getWorkerStats();
  demo.hud(
    demo.world.getLoadedChunkCount() + ' chunks · ' + w.busy + '/' + w.total + ' workers · ' + w.queued + ' na fila\\n' +
    (demo.world.getVoxelRamBytes() / 1048576).toFixed(1) + ' MB de voxel · ' +
    (demo.world.getEstimatedGpuMemoryBytes() / 1048576).toFixed(1) + ' MB estimados de GPU · ' +
    'dimensão ' + demo.world.getActiveDimensionName()
  );
});`
        }
      },
      {
        id: 'dimension-registry',
        name: 'dimensionRegistry',
        kind: 'singleton',
        entry: "import { dimensionRegistry, DEFAULT_DIMENSION, type DimensionDefinition } from '@voxel/engine/worker';",
        file: 'engine/dimension/Dimension.ts',
        summary:
          'Uma dimensão amarra gerador, física e atmosfera num objeto só: trocar de dimensão troca o gerador do mundo, a gravidade do jogador e o céu de uma vez.',
        summaryPlain: 'Gerador, física e atmosfera num objeto só; trocar troca os três.',
        members: [
          { kind: 'property', signature: 'DimensionDefinition { id, name, generatorId, accentColor, physics, atmosphere }', desc: '<code>generatorId</code> aponta para um <code>WorldGenerator</code> registrado.' },
          { kind: 'property', signature: 'DimensionPhysics { gravity, … }', desc: 'Entra no <code>Player</code> quando a dimensão é ativada.' },
          { kind: 'property', signature: 'DimensionAtmosphere { daySkyColor, nightSkyColor, horizonColor, ambient*, hasDayNightCycle, hasClouds, hasSun, hasMoon }', desc: 'Consumida pelo <code>Sky</code> e pelos materiais do mundo.' },
          { kind: 'method', signature: 'register(dim)', desc: 'Singleton por thread; a primeira registrada é a inicial.' },
          { kind: 'method', signature: 'get(id)', desc: 'Singleton por thread; a primeira registrada é a inicial.' },
          { kind: 'method', signature: 'has(id)', desc: 'Singleton por thread; a primeira registrada é a inicial.' },
          { kind: 'method', signature: 'getAll()', desc: 'Singleton por thread; a primeira registrada é a inicial.' },
          { kind: 'method', signature: 'world.switchDimension(dim, targetPosition?)', desc: 'Troca em tempo de execução, com recarga dos chunks.' }
        ],
        example: {
          title: 'Trocando de dimensão a cada 8 segundos',
          note: 'A mesma instância de mundo. O que muda é a dimensão: outro gerador, outro céu, outra gravidade — e os chunks são regerados pelos workers.',
          code: `// Uma dimensão nova, montada em cima da padrão:
dimensionRegistry.register({
  ...DEFAULT_DIMENSION,
  id: 'docs-neon',
  name: 'Neon',
  generatorId: 'docs-plano',
  accentColor: 0x22d3ee,
  physics: { ...DEFAULT_DIMENSION.physics, gravity: DEFAULT_DIMENSION.physics.gravity * 0.4 },
  atmosphere: {
    ...DEFAULT_DIMENSION.atmosphere,
    daySkyColor: 0x071a2b, nightSkyColor: 0x02060d, horizonColor: 0x0ea5e9,
    ambientDayColor: 0x22d3ee, ambientNightColor: 0x0b3b54,
    hasDayNightCycle: false, hasClouds: false
  }
});

const demo = worldSandbox({
  world: { renderDistance: 5 },
  spawn: [0, 58, 0], lookAt: [0, 26, 0], distance: 120,
  shaders: 'medium'
});

await demo.ready();

const ids = ['docs-overworld', 'docs-abismo', 'docs-neon'];
let i = 0;

const trocar = () => {
  const dim = dimensionRegistry.get(ids[i % ids.length]);
  demo.world.switchDimension(dim, new THREE.Vector3(0, 48, 0));
  demo.hud(
    'dimensão: ' + dim.name + '  (' + dim.id + ')\\n' +
    'gerador ' + dim.generatorId + ' · gravidade ' + dim.physics.gravity +
    ' · ciclo dia/noite: ' + dim.atmosphere.hasDayNightCycle + ' · nuvens: ' + dim.atmosphere.hasClouds
  );
  print('switchDimension ->', dim.name);
  i++;
};

trocar();
const timer = setInterval(trocar, 8000);
onStop(() => clearInterval(timer));

print('registradas:', dimensionRegistry.getAll().map((d) => d.id).join(', '));`
        }
      },
      {
        id: 'sky',
        name: 'Sky',
        kind: 'class',
        entry: "import { Sky } from '@voxel/engine/worker';",
        file: 'engine/world/Sky.ts',
        summary:
          'O céu da dimensão ativa: gradiente de atmosfera, sol, lua, estrelas e nuvens, com o ciclo dia/noite. É um <code>THREE.Group</code> que o <code>ProceduralWorld</code> mantém, e de onde os efeitos leem a direção e a cor do sol.',
        summaryPlain: 'Atmosfera, sol, lua, estrelas e nuvens da dimensão ativa.',
        members: [
          { kind: 'method', signature: 'setDimension(dim)', desc: 'Reconstrói o céu com a atmosfera da dimensão.' },
          { kind: 'method', signature: 'setTime(phase)', desc: "<code>'day'</code>/<code>'sunrise'</code>, <code>'noon'</code>/<code>'midday'</code>, <code>'sunset'</code>/<code>'night'</code>, <code>'midnight'</code>, ou um número em radianos." },
          { kind: 'method', signature: 'world.getSky()', desc: '<code>daylight</code> vai de 0 (noite) a 1 (meio-dia).' },
          { kind: 'method', signature: 'world.setTime(phase)', desc: '<code>daylight</code> vai de 0 (noite) a 1 (meio-dia).' },
          { kind: 'property', signature: 'world.daylight', desc: '<code>daylight</code> vai de 0 (noite) a 1 (meio-dia).' },
          { kind: 'method', signature: 'world.getSunDirection(t)', desc: 'O que a volumétrica, a sombra e a névoa consomem.' },
          { kind: 'method', signature: 'getSunLightColor(t)', desc: 'O que a volumétrica, a sombra e a névoa consomem.' },
          { kind: 'method', signature: 'getAtmosphereColor(t)', desc: 'O que a volumétrica, a sombra e a névoa consomem.' }
        ],
        example: {
          title: 'O ciclo do dia sobre um volume de voxels',
          note: 'O <code>Sky</code> é instanciado sozinho, sem <code>ProceduralWorld</code>: ele traz a luz direcional e a ambiente, e é essa luz que acende os voxels. No fim, a dimensão troca e o céu inteiro muda.',
          code: `// Sky é um THREE.Group independente: dá para usá-lo sobre qualquer cena.
// Aqui ele ilumina um volume de voxels — sem ProceduralWorld no meio.
const cena = voxelScene({
  size: 64,
  seed: 12,
  target: [32, 22, 32],
  distance: 120,
  shaders: 'high'
});

const sky = cena.sky; // o sandbox criou com new Sky()
print('dimensão do céu:', sky.activeDimension.name);

const fases = ['sunrise', 'noon', 'sunset', 'midnight'];
let i = 0;
const trocar = () => {
  sky.setTime(fases[i % fases.length]);
  print('setTime ->', fases[i % fases.length]);
  i++;
};
trocar();
const timer = setInterval(trocar, 8000);
onStop(() => clearInterval(timer));

// troca a atmosfera no meio do caminho: outra dimensão, outro céu
const troca = setTimeout(() => {
  sky.setDimension(dimensionRegistry.get('docs-abismo'));
  print('setDimension -> Abismo: sem sol, sem nuvens, sem ciclo');
}, 26000);
onStop(() => clearTimeout(troca));

const dir = new THREE.Vector3();

cena.onFrame(() => {
  // sky.tick(camera, delta) roda no laço do sandbox; aqui só lemos o resultado
  dir.copy(sky.directional.position).normalize();
  cena.hud(
    'fase: ' + fases[(i - 1 + fases.length) % fases.length] + ' · daylight ' + sky.daylight.toFixed(2) +
    ' · dimensão ' + sky.activeDimension.name + '\\n' +
    'sol em (' + dir.x.toFixed(2) + ', ' + dir.y.toFixed(2) + ', ' + dir.z.toFixed(2) + ')' +
    ' · luz direcional #' + sky.directional.color.getHexString() +
    ' · ambiente #' + sky.ambient.color.getHexString()
  );
});`
        }
      },
      {
        id: 'far-field-streamer',
        name: 'FarFieldStreamer',
        kind: 'class',
        entry: "// não exportado pelos barrels: o ProceduralWorld instancia internamente\n// ligue com world: { lodRings: [4, 7, 10] }",
        file: 'engine/world/FarFieldStreamer.ts',
        summary:
          'O horizonte. Mantém chunks de LOD alto muito além da distância normal, com orçamento próprio de jobs por quadro, para que a silhueta do mundo exista sem pagar o preço de chunks em resolução cheia. Um chunk com <code>stride 8</code> cobre 512 voxels de mundo pelo armazenamento de 64.',
        summaryPlain: 'O horizonte em LOD: silhueta longe sem custo de resolução cheia.',
        members: [
          { kind: 'property', signature: 'world: { lodRings: number[] }', desc: 'Distâncias em chunks: cheia até o 1º, metade até o 2º, um quarto até o 3º, um oitavo além. Cada passo precisa dividir <code>chunkSize</code>.' },
          { kind: 'property', signature: 'ChunkJobData.lodStep', desc: 'Como o LOD chega ao gerador: ele só avança os laços de <code>stride</code> em <code>stride</code>.' },
          { kind: 'property', signature: 'ChunkContext.stride', desc: 'Como o LOD chega ao gerador: ele só avança os laços de <code>stride</code> em <code>stride</code>.' },
          { kind: 'method', signature: 'update(camX, camY, camZ)', desc: 'Chamado pelo mundo a cada quadro; descarta o que saiu de alcance.' },
          { kind: 'method', signature: 'dispose()', desc: 'Chamado pelo mundo a cada quadro; descarta o que saiu de alcance.' }
        ],
        example: {
          title: 'O horizonte com anéis de LOD',
          note: 'Alcance de 12 chunks com <code>lodRings: [4, 7, 10]</code>. Troque para <code>undefined</code> e baixe <code>renderDistance</code> para 6, execute de novo, e compare a silhueta e a memória de voxel.',
          code: `const demo = worldSandbox({
  world: {
    chunkSize: 32,
    renderDistance: 12,
    verticalRenderDistance: 2,
    lodRings: [4, 7, 10]   // → undefined para desligar o campo distante
  },
  spawn: [0, 90, 0], lookAt: [0, 26, 0], distance: 320,
  shaders: 'low'
});

await demo.ready();

demo.onFrame(() => {
  const info = demo.renderer.info;
  demo.hud(
    'lodRings [4, 7, 10] · renderDistance 12 chunks (384 blocos)\\n' +
    demo.world.getLoadedChunkCount() + ' chunks carregados · ' +
    (demo.world.getVoxelRamBytes() / 1048576).toFixed(1) + ' MB de voxel · ' +
    info.render.triangles.toLocaleString('pt-BR') + ' triângulos · ' + info.render.calls + ' draw calls\\n' +
    'os chunks distantes guardam 1 célula por 2, 4 ou 8 voxels de mundo — a silhueta fica, o custo não'
  );
});

print('o campo distante é servido pelos mesmos chunk workers, com lodStep > 1 no job.');`
        }
      }
    ]
  },
  {
    id: 'fisica',
    title: 'Física & Jogador',
    icon: 'sports_esports',
    blurb: 'Colisão AABB em grid, raycast DDA, fluidos por autômato celular e o movimento do jogador.',
    modules: [
      {
        id: 'kinematic-body',
        name: 'KinematicBody',
        kind: 'class',
        entry: "import { KinematicBody, type VoxelColliderWorld } from '@voxel/engine/worker';",
        file: 'engine/physics/AABBPhysics.ts',
        summary:
          'Resolvedor de colisão AABB em grid de voxels. Resolve um eixo por vez (X, Y, Z) para não tunelar em esquinas, sobe degraus até <code>stepHeight</code> sozinho e conhece a borda de agachamento. Só exige do mundo um <code>isBlockSolid(x, y, z)</code>.',
        summaryPlain: 'Colisão AABB eixo a eixo contra o grid, com step height.',
        members: [
          { kind: 'constructor', signature: 'new KinematicBody({ dimensions, gravity?, friction?, eyeHeight?, unitScale?, stepHeight? })', desc: 'Padrões: <code>gravity 0.008</code>, <code>friction 0.9</code>, <code>stepHeight 0.6 * unitScale</code>.' },
          { kind: 'property', signature: 'position', desc: 'Estado do corpo, em unidades de mundo.' },
          { kind: 'property', signature: 'velocity', desc: 'Estado do corpo, em unidades de mundo.' },
          { kind: 'property', signature: 'isGrounded', desc: 'Estado do corpo, em unidades de mundo.' },
          { kind: 'method', signature: 'stepPhysics(world, dtScale?, applyGravity?, onCollision?)', desc: 'Gravidade, integração e resolução eixo a eixo em um passo.' },
          { kind: 'method', signature: 'moveAndCollide(world, dx, dy, dz, sneakEdge?): MoveResult', desc: '<code>{ x, y, z, collidedX, collidedY, collidedZ, onGround }</code>.' },
          { kind: 'method', signature: 'checkCollisionAt(pos, world)', desc: 'Testes pontuais e a caixa atual.' },
          { kind: 'method', signature: 'getBounds(pos?)', desc: 'Testes pontuais e a caixa atual.' },
          { kind: 'method', signature: 'KinematicBody.intersectsSolid(world, box)', desc: 'Testes pontuais e a caixa atual.' },
          { kind: 'property', signature: 'VoxelColliderWorld { isBlockSolid(x, y, z): boolean }', desc: 'O <code>ProceduralWorld</code> implementa isso — e qualquer objeto seu também pode.' }
        ],
        example: {
          title: 'Corpos caindo e esbarrando em voxels de verdade',
          note: 'Os corpos são volumes de voxel malhados pelo <code>ChunkGeometry</code>, e o colisor é o volume da cena. Eles caem, batem, sobem degraus de um bloco e assentam.',
          code: `// O KinematicBody só exige isBlockSolid. Então o colisor aqui é um volume de
// voxels da engine — sem chunk workers, sem streaming: só o que o módulo precisa.
const cena = voxelScene({
  size: 56,
  seed: 21,
  target: [28, 20, 28],
  distance: 100,
  shaders: 'medium'
});

const BLOCOS = [BLOCKS.lava, BLOCKS.glowstone, BLOCKS.ice, BLOCKS.leaves];

const corpos = BLOCOS.map((bloco, i) => {
  const corpo = new KinematicBody({
    dimensions: { width: 0.9, height: 1.8 },
    gravity: 0.08,
    friction: 0.9,
    stepHeight: 1.0
  });
  corpo.position.set(28 + Math.cos(i * 1.7) * 9, 52, 28 + Math.sin(i * 1.7) * 9);
  corpo.velocity.set(Math.cos(i * 1.7) * 0.09, 0, Math.sin(i * 1.7) * 0.09);

  // o corpo aparece como voxels: uma coluna 1x2x1 malhada pelo ChunkGeometry
  const malha = voxelObject(2, (ctx) => {
    ctx.setBlock(0, 0, 0, bloco);
    ctx.setBlock(0, 1, 0, bloco);
  }, { center: false });
  malha.geometry.translate(-0.5, 0, -0.5);
  cena.add(malha);

  return { corpo, malha };
});

let noChaoAgora = false;

cena.onTick(() => {
  for (const { corpo, malha } of corpos) {
    corpo.stepPhysics(cena.world, 1, true, (eixo) => {
      if (eixo === 'y' && corpo.velocity.y < -0.4) print('impacto em y =', corpo.position.y.toFixed(1));
    });

    // moveAndCollide reavalia o apoio depois; guardamos o estado do passo de física
    if (corpo === corpos[0].corpo) noChaoAgora = corpo.isGrounded;

    if (corpo.isGrounded) {
      const r = corpo.moveAndCollide(cena.world, corpo.velocity.x, 0, corpo.velocity.z);
      if (r.collidedX || r.collidedZ) {
        corpo.velocity.x *= -1;
        corpo.velocity.z *= -1;
      }
    }

    if (corpo.position.y < 2) corpo.position.set(20 + Math.random() * 16, 52, 20 + Math.random() * 16);
    malha.position.set(corpo.position.x, corpo.position.y, corpo.position.z);
  }

  const c = corpos[0].corpo;
  const caixa = c.getBounds();
  cena.hud(
    'corpo 1 · y ' + c.position.y.toFixed(2) + ' · vel.y ' + c.velocity.y.toFixed(3) + ' · no chão: ' + noChaoAgora + '\\n' +
    'AABB atual: x ' + caixa.minX.toFixed(1) + '→' + caixa.maxX.toFixed(1) +
    ' · y ' + caixa.minY.toFixed(1) + '→' + caixa.maxY.toFixed(1) + '\\n' +
    'colisor = o volume de voxels (isBlockSolid) · stepHeight 1.0 sobe um bloco andando'
  );
});`
        }
      },
      {
        id: 'raycast-voxel',
        name: 'raycastVoxel',
        kind: 'function',
        entry: "import { raycastVoxel, type VoxelWorldReader } from '@voxel/engine/worker';",
        file: 'engine/physics/VoxelRaycaster.ts',
        summary:
          'DDA 3D (Amanatides & Woo): caminha célula a célula pelo grid em O(passos), sem mesh nem teste de triângulo. É o que decide qual bloco a mira acerta, em qual face — e, por isso, onde o bloco novo entra.',
        summaryPlain: 'Raycast DDA no grid: qual bloco a mira acerta e em qual face.',
        members: [
          { kind: 'method', signature: 'raycastVoxel(world, origin, direction, maxDistance = 8, isSolidPredicate?)', desc: 'O predicado padrão é <code>blockRegistry.isInteractable</code>.' },
          { kind: 'property', signature: 'VoxelWorldReader { getBlock(x, y, z): number }', desc: 'A única coisa exigida do mundo.' },
          { kind: 'property', signature: 'VoxelRaycastHit { hit, blockPos, faceNormal, point, blockType, distance }', desc: '<code>blockPos + faceNormal</code> é onde um bloco novo seria colocado.' }
        ],
        example: {
          title: 'O raio varrendo o volume, acerto e face',
          note: 'A linha amarela é o raio; ela gira sozinha. A caixa verde marca o bloco acertado e a azul a célula vizinha pela <code>faceNormal</code> — onde um bloco novo entraria. Arraste para orbitar.',
          code: `// raycastVoxel só precisa de getBlock: o volume da cena já é um VoxelWorldReader.
const cena = voxelScene({
  size: 48,
  seed: 5,
  target: [24, 18, 24],
  distance: 85,
  shaders: 'medium'
});

// gizmos de seleção (contorno, não conteúdo do mundo)
const gizmo = (cor) => {
  const m = new THREE.Mesh(
    new THREE.BoxGeometry(1.04, 1.04, 1.04),
    new THREE.MeshBasicMaterial({ color: cor, wireframe: true })
  );
  m.visible = false;
  cena.add(m);
  return m;
};
const alvo = gizmo(0x34d399);     // bloco atingido
const vizinho = gizmo(0x60a5fa);  // célula pela faceNormal: onde um bloco novo entraria

// o próprio raio, desenhado
const linha = new THREE.Line(
  new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]),
  new THREE.LineBasicMaterial({ color: 0xfbbf24 })
);
cena.add(linha);

// a origem sai do próprio volume: um pouco acima do topo da coluna central
let topo = 0;
for (let y = 47; y >= 0; y--) {
  if (cena.chunk.getBlock(24, y, 24) >= 0) { topo = y; break; }
}
const origem = new THREE.Vector3(24, topo + 10, 24);
const direcao = new THREE.Vector3();
let t = 0;
print('origem do raio em y =', topo + 10, '(topo da coluna central + 10)');

cena.onFrame((dt) => {
  // varre a direção do raio em círculo, inclinando para baixo
  t += dt * 0.0006;
  direcao.set(Math.cos(t) * 0.6, -0.75 - Math.sin(t * 0.7) * 0.2, Math.sin(t) * 0.6).normalize();

  const hit = raycastVoxel(cena.world, origem, direcao, 48, (tipo) => tipo >= 0);

  alvo.visible = Boolean(hit);
  vizinho.visible = Boolean(hit);

  const fim = hit ? hit.point.clone() : origem.clone().add(direcao.clone().multiplyScalar(48));
  linha.geometry.setFromPoints([origem, fim]);

  if (!hit) {
    cena.hud('nenhum voxel em 48 blocos nesta direção');
    return;
  }

  alvo.position.set(hit.blockPos.x + 0.5, hit.blockPos.y + 0.5, hit.blockPos.z + 0.5);
  vizinho.position.set(
    hit.blockPos.x + hit.faceNormal.x + 0.5,
    hit.blockPos.y + hit.faceNormal.y + 0.5,
    hit.blockPos.z + hit.faceNormal.z + 0.5
  );

  const bloco = blockRegistry.get(hit.blockType);
  cena.hud(
    'bloco ' + hit.blockType + ' (' + (bloco ? bloco.name : '?') + ') em ' +
    hit.blockPos.x + ',' + hit.blockPos.y + ',' + hit.blockPos.z + '\\n' +
    'face (' + hit.faceNormal.x + ',' + hit.faceNormal.y + ',' + hit.faceNormal.z + ') · distância ' +
    hit.distance.toFixed(2) + ' · ponto ' + hit.point.x.toFixed(1) + ',' + hit.point.y.toFixed(1) + ',' + hit.point.z.toFixed(1) + '\\n' +
    'verde: bloco atingido · azul: onde um bloco novo seria colocado'
  );
});

print('DDA: o raio anda célula a célula, sem malha e sem teste de triângulo.');`
        }
      },
      {
        id: 'fluid-ca',
        name: 'FluidCellularAutomata',
        kind: 'class',
        entry: "import { FluidCellularAutomata, packCoord, unpackCoord } from '@voxel/engine/worker';",
        file: 'engine/physics/FluidCellularAutomata.ts',
        summary:
          'Autômato celular de fluidos com <b>conjunto ativo</b>: só as células acordadas são processadas, com teto de transições por tick — um oceano parado custa zero. Trata queda, espalhamento, nascentes e a reação água + lava virando basalto. As coordenadas viram um inteiro por <code>packCoord</code> para o <code>Set</code> não alocar.',
        summaryPlain: 'Fluidos por autômato celular com conjunto ativo e teto por tick.',
        members: [
          { kind: 'constructor', signature: 'new FluidCellularAutomata(world, { tickIntervalMs = 40, maxUpdatesPerTick = 3000, reactionsEnabled, particlesEnabled })', desc: 'O <code>world</code> precisa de <code>chunkSize</code>, <code>getBlock</code>, <code>setBlockFast</code> e <code>flushDirtyChunks</code>.' },
          { kind: 'method', signature: 'update(deltaMs)', desc: '<code>update</code> acumula tempo e chama <code>step</code>; <code>step</code> roda um tick inteiro.' },
          { kind: 'method', signature: 'step()', desc: '<code>update</code> acumula tempo e chama <code>step</code>; <code>step</code> roda um tick inteiro.' },
          { kind: 'property', signature: 'wakeVoxel', desc: 'Acordar é o que coloca células no conjunto ativo.' },
          { kind: 'property', signature: 'wakeNeighbors', desc: 'Acordar é o que coloca células no conjunto ativo.' },
          { kind: 'property', signature: 'wakeArea', desc: 'Acordar é o que coloca células no conjunto ativo.' },
          { kind: 'property', signature: 'wakeRadius', desc: 'Acordar é o que coloca células no conjunto ativo.' },
          { kind: 'property', signature: 'scanChunk', desc: 'Acordar é o que coloca células no conjunto ativo.' },
          { kind: 'method', signature: 'addSpring(x, y, z)', desc: 'Nascentes emitem fluido a cada 4 ticks.' },
          { kind: 'property', signature: 'removeSpring', desc: 'Nascentes emitem fluido a cada 4 ticks.' },
          { kind: 'method', signature: 'isSpring(type)', desc: 'Nascentes emitem fluido a cada 4 ticks.' },
          { kind: 'property', signature: 'activeCount', desc: 'Telemetria e a chave geral (comando <code>/fluid</code>).' },
          { kind: 'property', signature: 'springCount', desc: 'Telemetria e a chave geral (comando <code>/fluid</code>).' },
          { kind: 'property', signature: 'enabled', desc: 'Telemetria e a chave geral (comando <code>/fluid</code>).' },
          { kind: 'method', signature: 'clear()', desc: 'Telemetria e a chave geral (comando <code>/fluid</code>).' },
          { kind: 'property', signature: 'world.fluidCA', desc: 'O <code>ProceduralWorld</code> já cria e roda um, dentro do <code>tick</code>.' },
          { kind: 'method', signature: 'packCoord(x, y, z)', desc: 'O empacotamento usado pelos conjuntos.' },
          { kind: 'method', signature: 'unpackCoord(k, out)', desc: 'O empacotamento usado pelos conjuntos.' }
        ],
        example: {
          title: 'Água de verdade descendo um terreno de verdade',
          note: 'O autômato aqui é o do próprio mundo (<code>world.fluidCA</code>): ele move voxels de água pelos chunks e remalha o que mudou. Quando a água assenta, o conjunto ativo volta a zero.',
          code: `const demo = worldSandbox({
  world: { renderDistance: 5 },
  spawn: [0, 50, 0], lookAt: [8, 28, 8], distance: 65,
  shadows: true, shaders: 'medium'
});

await demo.ready();

const topo = demo.world.drySurfaceAt(10, 10, 60, 0) ?? 32;
print('despejando água em 10,' + (topo + 10) + ',10');

let derramado = 0;
const timer = setInterval(() => {
  const x = 10, y = topo + 10, z = 10;
  demo.world.setBlockAt(x, y, z, BLOCKS.water);
  demo.world.fluidCA.wakeRadius(x, y, z, 2);
  derramado++;

  if (derramado === 26) {
    const ly = demo.world.drySurfaceAt(-8, 6, 60, 0);
    if (ly !== null) {
      demo.world.setBlockAt(-8, ly + 6, 6, BLOCKS.lava);
      demo.world.fluidCA.wakeRadius(-8, ly + 6, 6, 2);
      print('lava derramada: onde encontrar a água, vira basalto com vapor');
    }
  }
}, 350);
onStop(() => clearInterval(timer));

demo.onFrame(() => {
  const ca = demo.world.fluidCA;
  demo.hud(
    'células de fluido ativas: ' + ca.activeCount + ' · nascentes: ' + ca.springCount +
    ' · voxels derramados: ' + derramado + '\\n' +
    'o conjunto ativo cai para zero quando a água assenta — é por isso que um oceano parado é de graça'
  );
});

print('packCoord(10, ' + (topo + 10) + ', 10) =', packCoord(10, topo + 10, 10));
const saida = [0, 0, 0];
unpackCoord(packCoord(10, topo + 10, 10), saida);
print('unpackCoord ->', saida.join(', '));`
        }
      },
      {
        id: 'player',
        name: 'Player',
        kind: 'class',
        entry: "import { Player, MOVEMENT, scaleMovement } from '@voxel/engine/worker';",
        file: 'engine/player/Player.ts',
        summary:
          'Movimento do jogador com a tabela de constantes do Minecraft (<code>MOVEMENT</code>): aceleração no chão e no ar, momentum, sprint, agachamento, nado e voo no modo debug, mais view bobbing, inclinação na queda e FOV de sprint. <code>scaleMovement</code> reescala a tabela inteira para mundos de micro-voxel.',
        summaryPlain: 'O movimento do jogador, com a tabela de constantes e escala de voxel.',
        members: [
          { kind: 'constructor', signature: "new Player({ camera, world, mode = 'debug', voxelsPerBlock = 1, scale = 1 })", desc: "<code>'normal'</code> = survival com gravidade; <code>'debug'</code> = criativo com voo." },
          { kind: 'method', signature: 'update(deltaMs)', desc: 'Tick fixo e interpolação no quadro.' },
          { kind: 'method', signature: 'render(extraMs, frameDeltaMs)', desc: 'Tick fixo e interpolação no quadro.' },
          { kind: 'method', signature: 'onKeyDown(key)', desc: 'Input, encaminhado pelo <code>VoxelEngine</code> no jogo.' },
          { kind: 'method', signature: 'onKeyUp(key)', desc: 'Input, encaminhado pelo <code>VoxelEngine</code> no jogo.' },
          { kind: 'method', signature: 'onMouseMove(mx, my)', desc: 'Input, encaminhado pelo <code>VoxelEngine</code> no jogo.' },
          { kind: 'method', signature: 'setLock(locked)', desc: 'Input, encaminhado pelo <code>VoxelEngine</code> no jogo.' },
          { kind: 'method', signature: 'teleport(x, y, z, yaw?, pitch?)', desc: 'Ganchos para plugins empurrarem o jogador.' },
          { kind: 'method', signature: 'applyForce(v)', desc: 'Ganchos para plugins empurrarem o jogador.' },
          { kind: 'method', signature: 'setGravity(v)', desc: 'Ganchos para plugins empurrarem o jogador.' },
          { kind: 'method', signature: 'addCameraShake(i)', desc: 'Ganchos para plugins empurrarem o jogador.' },
          { kind: 'method', signature: "setMode('normal' | 'debug')", desc: '<code>body</code> é o corpo AABB; <code>controls</code> guarda yaw/pitch.' },
          { kind: 'method', signature: 'setScale(s)', desc: '<code>body</code> é o corpo AABB; <code>controls</code> guarda yaw/pitch.' },
          { kind: 'property', signature: 'body: KinematicBody', desc: '<code>body</code> é o corpo AABB; <code>controls</code> guarda yaw/pitch.' },
          { kind: 'property', signature: 'controls: HeadlessControls', desc: '<code>body</code> é o corpo AABB; <code>controls</code> guarda yaw/pitch.' },
          { kind: 'property', signature: 'MOVEMENT', desc: 'GRAVITY 0.08, JUMP_VELOCITY 0.42, WALK_SPEED 0.1, TICK_MS 50…' },
          { kind: 'method', signature: 'scaleMovement(voxelsPerBlock, playerScale?)', desc: 'GRAVITY 0.08, JUMP_VELOCITY 0.42, WALK_SPEED 0.1, TICK_MS 50…' }
        ],
        example: {
          title: 'Ande pelo mundo; a cada 10 s o modo troca',
          note: 'Clique para travar o ponteiro. <b>WASD</b> anda, <b>espaço</b> pula (ou sobe, no modo debug), <b>shift</b> desce/agacha. O rodapé mostra o estado do <code>KinematicBody</code> em tempo real.',
          code: `const demo = worldSandbox({
  controls: 'player',
  world: { renderDistance: 6 },
  spawn: [0, 50, 0],
  shadows: true, shaders: 'medium'
});

await demo.ready();

const player = demo.player;
player.flySpeed = 2.0;

let debug = true;
const timer = setInterval(() => {
  debug = !debug;
  player.setMode(debug ? 'debug' : 'normal');
  print('modo ->', debug ? 'debug (voo)' : 'normal (gravidade)');
}, 10000);
onStop(() => clearInterval(timer));

demo.onFrame(() => {
  const b = player.body;
  const v = b.velocity;
  demo.hud(
    'modo ' + (debug ? 'debug — voo' : 'normal — gravidade') +
    ' · pos ' + b.position.x.toFixed(1) + ', ' + b.position.y.toFixed(1) + ', ' + b.position.z.toFixed(1) + '\\n' +
    'velocidade horizontal ' + Math.hypot(v.x, v.z).toFixed(3) + ' · vel.y ' + v.y.toFixed(3) +
    ' · no chão: ' + b.isGrounded + ' · yaw ' + (player.controls.getYaw() * 180 / Math.PI).toFixed(0) + '°'
  );
});

print('WALK_SPEED', MOVEMENT.WALK_SPEED, '· JUMP_VELOCITY', MOVEMENT.JUMP_VELOCITY, '· GRAVITY', MOVEMENT.GRAVITY);
const micro = scaleMovement(8, 0.35);
print('a mesma tabela para um mundo de 1/8 de bloco com jogador miniatura:');
print('  WALK_SPEED', micro.WALK_SPEED.toFixed(4), '· JUMP_VELOCITY', micro.JUMP_VELOCITY.toFixed(4), '· GRAVITY', micro.GRAVITY.toFixed(4));`
        }
      },
      {
        id: 'player-interaction',
        name: 'PlayerInteraction',
        kind: 'class',
        entry: "import { PlayerInteraction } from '@voxel/engine/worker';",
        file: 'engine/player/PlayerInteraction.ts',
        summary:
          'A ponte entre a mira e o mundo: raycast por quadro, destaque do bloco alvo, quebra e colocação com auto-repeat, e a hotbar. Dispara <code>onBlockDestroyed</code>/<code>onBlockPlaced</code>, que o runtime converte nos eventos <code>block:break</code> e <code>block:place</code>.',
        summaryPlain: 'Mira, destaque, quebra, colocação e hotbar.',
        members: [
          { kind: 'constructor', signature: 'new PlayerInteraction(camera, world, onBlockDestroyed?, onBlockPlaced?, onSelectionChange?)', desc: 'Os callbacks viram os eventos do <code>EngineContext</code>.' },
          { kind: 'method', signature: 'setHotbar(types)', desc: 'Hotbar nas teclas numéricas e na roda do mouse.' },
          { kind: 'method', signature: 'selectSlot(i)', desc: 'Hotbar nas teclas numéricas e na roda do mouse.' },
          { kind: 'method', signature: 'getSelectedBlockType()', desc: 'Hotbar nas teclas numéricas e na roda do mouse.' },
          { kind: 'method', signature: 'setSelectedBlockType(t)', desc: 'Hotbar nas teclas numéricas e na roda do mouse.' },
          { kind: 'method', signature: 'onMouseDown(button)', desc: 'Botão 0 quebra, 2 coloca, com auto-repeat enquanto segurado.' },
          { kind: 'property', signature: 'onMouseUp', desc: 'Botão 0 quebra, 2 coloca, com auto-repeat enquanto segurado.' },
          { kind: 'method', signature: 'onWheel(dir)', desc: 'Botão 0 quebra, 2 coloca, com auto-repeat enquanto segurado.' },
          { kind: 'method', signature: 'onKeyDown(key)', desc: 'Botão 0 quebra, 2 coloca, com auto-repeat enquanto segurado.' },
          { kind: 'method', signature: 'setLock(locked)', desc: 'Botão 0 quebra, 2 coloca, com auto-repeat enquanto segurado.' },
          { kind: 'method', signature: 'update(deltaMs)', desc: 'Faz o raycast, atualiza o destaque e aplica a ação pendente.' },
          { kind: 'method', signature: 'triggerClick(button)', desc: 'Ação única — usada pelos controles de toque.' }
        ],
        example: {
          title: 'Quebre e coloque blocos — com eco no console',
          note: 'Clique para travar o ponteiro. <b>Esquerdo</b> quebra, <b>direito</b> coloca, <b>1-5</b> troca o bloco. Cada ação emite partículas e aparece no console.',
          code: `const demo = worldSandbox({
  controls: 'player',
  world: { renderDistance: 5 },
  spawn: [0, 48, 0],
  hotbar: [BLOCKS.grass, BLOCKS.stone, BLOCKS.glass, BLOCKS.glowstone, BLOCKS.water],
  shadows: true, shaders: 'medium'
});

await demo.ready();

const inter = demo.interaction;

inter.onBlockDestroyed = (pos, normal, tipo) => {
  const bloco = blockRegistry.get(tipo);
  print('quebrou', (bloco ? bloco.name : tipo), 'em', pos.x + ',' + pos.y + ',' + pos.z);
  for (let i = 0; i < 18; i++) {
    demo.particles.emit({
      position: { x: pos.x + 0.5, y: pos.y + 0.5, z: pos.z + 0.5 },
      velocity: { x: (Math.random() - 0.5) * 0.22, y: 0.2, z: (Math.random() - 0.5) * 0.22 },
      color: blockRegistry.getColor(tipo),
      size: 0.12, lifetime: 28
    });
  }
};

inter.onBlockPlaced = (pos, normal, tipo) => {
  const bloco = blockRegistry.get(tipo);
  print('colocou', (bloco ? bloco.name : tipo), 'em', pos.x + ',' + pos.y + ',' + pos.z);
};

inter.onSelectionChange = (tipo, slot) => {
  const bloco = blockRegistry.get(tipo);
  print('hotbar: slot', slot, '->', bloco ? bloco.name : tipo);
};

demo.onFrame(() => {
  const tipo = inter.getSelectedBlockType();
  const bloco = blockRegistry.get(tipo);
  demo.hud(
    'clique para travar · esquerdo quebra · direito coloca · 1-5 troca\\n' +
    'bloco selecionado: ' + (bloco ? bloco.name : tipo) + ' (id ' + tipo + ') · partículas vivas: ' + demo.particles.count
  );
});`
        }
      },
      {
        id: 'rng',
        name: 'RNG',
        kind: 'class',
        entry: "import { RNG } from '@voxel/engine/worker';",
        file: 'engine/utils/rng.ts',
        summary:
          'Gerador pseudoaleatório determinístico por seed. É o que torna o mundo reproduzível: a mesma <code>worldParams.seed</code> dá o mesmo terreno em qualquer máquina e em qualquer worker — e é ele que alimenta o <code>SimplexNoise</code> do <code>ChunkData</code>.',
        summaryPlain: 'Aleatório determinístico por seed; é o que torna o mundo reproduzível.',
        members: [
          { kind: 'constructor', signature: 'new RNG(seed: number)', desc: 'Mesma seed, mesma sequência.' },
          { kind: 'method', signature: 'random(): number', desc: 'Float em <code>[0, 1)</code>, no lugar de <code>Math.random</code>.' },
          { kind: 'constructor', signature: 'new SimplexNoise(new RNG(seed))', desc: 'Como o <code>ChunkData</code> usa: o ruído inteiro herda o determinismo.' }
        ],
        example: {
          title: 'Mesma seed, mesmo relevo — provado lado a lado',
          note: 'Três volumes gerados agora: os dois da esquerda usam a seed 1337; o da direita, 2024. A comparação célula a célula sai no console.',
          code: `const SIZE = 28;

const gerar = (seed) => new ChunkData({
  size: SIZE, height: SIZE,
  startX: 0, endX: SIZE, startY: 0, endY: SIZE, startZ: 0, endZ: SIZE,
  worldParams: { seed, worldType: 'docs-terreno', terrain: { scale: 42, magnitude: 8, offset: 6, octaves: 4, persistence: 0.5 } }
});

const a = gerar(1337);
const b = gerar(1337);
const c = gerar(2024);

const comparar = (x, y) => {
  let iguais = 0;
  for (let i = 0; i < x.blocks.length; i++) if (x.blocks[i] === y.blocks[i]) iguais++;
  return (100 * iguais / x.blocks.length).toFixed(2) + '%';
};

print('seed 1337 vs 1337:', comparar(a, b), 'de células idênticas');
print('seed 1337 vs 2024:', comparar(a, c), 'de células idênticas');

const view = view3D({ target: [0, 12, SIZE / 2], distance: 125 });
[[a, -SIZE * 1.15], [b, 0], [c, SIZE * 1.15]].forEach(([chunk, x]) => {
  const geo = new ChunkGeometry(chunk.getData()).getData();
  const solido = voxelMesh(geo.opaque);
  const agua = voxelMesh(geo.water, { transparent: true, opacity: 0.6 });
  solido.position.x = x;
  agua.position.x = x;
  view.add(solido);
  view.add(agua);
});
view.hud('esquerda e centro: seed 1337 (idênticos) · direita: seed 2024');

const r1 = new RNG(1337), r2 = new RNG(1337), r3 = new RNG(2024);
print('1337 ->', Array.from({ length: 4 }, () => r1.random().toFixed(6)).join(' '));
print('1337 ->', Array.from({ length: 4 }, () => r2.random().toFixed(6)).join(' '), '(idêntica)');
print('2024 ->', Array.from({ length: 4 }, () => r3.random().toFixed(6)).join(' '));`
        }
      }
    ]
  },
  {
    id: 'render',
    title: 'Render & Shaders',
    icon: 'polyline',
    blurb: 'A pilha de tela cheia: SSAO, volumétrica, bloom, tonemap, FXAA, sombras e o raymarch de brickmap.',
    modules: [
      {
        id: 'post-processor',
        name: 'PostProcessor',
        kind: 'class',
        entry: "import { PostProcessor, FULLSCREEN_VERTEX, bindSceneUniforms, type ScreenPass } from '@voxel/engine/worker';",
        file: 'engine/render/PostProcessor.ts',
        summary:
          'A infraestrutura de passes de tela cheia: alvo da cena com profundidade isolada, ping-pong entre buffers e os uniforms do quadro ligados por declaração — basta o material declarar <code>uniform float uDaylight;</code> para recebê-lo. Um passe é qualquer objeto <code>ScreenPass</code>.',
        summaryPlain: 'Passes de tela cheia com ping-pong e uniforms de cena por declaração.',
        members: [
          { kind: 'method', signature: 'add(pass: ScreenPass)', desc: 'Ordenados por <code>order</code> (padrão 0).' },
          { kind: 'method', signature: 'remove(pass)', desc: 'Ordenados por <code>order</code> (padrão 0).' },
          { kind: 'method', signature: 'render(scene, camera)', desc: 'Desenha a cena no alvo e roda a cadeia de passes até a tela.' },
          { kind: 'property', signature: 'ScreenPass { enabled, material, order?, needsDepth?, prepare?, setSize?, dispose? }', desc: 'O <code>PostProcessor</code> injeta <code>tDiffuse</code> e desenha o quad com o seu material.' },
          { kind: 'property', signature: 'PostFrame { camera, time, sunDirection, sunColor, skyColor, daylight, underwater, wetness, worldScale, depth, sunScreen, resolution }', desc: 'O estado do quadro, exposto aos passes.' },
          { kind: 'property', signature: 'FULLSCREEN_VERTEX', desc: 'Vertex shader do quad e a ligação manual dos uniforms, para passes internos.' },
          { kind: 'method', signature: 'bindSceneUniforms(material, frame)', desc: 'Vertex shader do quad e a ligação manual dos uniforms, para passes internos.' },
          { kind: 'method', signature: 'bindFrameUniforms(material)', desc: 'Vertex shader do quad e a ligação manual dos uniforms, para passes internos.' },
          { kind: 'property', signature: 'uniforms automáticos', desc: '<code>tDepth</code>, <code>uResolution</code>, <code>uTexel</code>, <code>uTime</code>, <code>uNear</code>, <code>uFar</code>, <code>uProjection</code>, <code>uInvProjection</code>, <code>uView</code>, <code>uInvView</code>, <code>uCameraPos</code>, <code>uSunDirection</code>, <code>uSunScreen</code>, <code>uSunColor</code>, <code>uSkyColor</code>, <code>uDaylight</code>, <code>uUnderwater</code>, <code>uWetness</code>, <code>uWorldScale</code>.' }
        ],
        example: {
          title: 'Seu shader de tela cheia sobre a cena de voxels',
          note: 'O GLSL abaixo é compilado e entra na mesma pilha do SSAO/bloom/tonemap. Edite o fragment shader e execute de novo — o efeito troca na hora.',
          code: `// A pilha de passes precisa de um renderer e de uma cena — não de streaming.
const cena = voxelScene({
  size: 56,
  seed: 8,
  target: [28, 20, 28],
  distance: 95,
  shaders: 'medium'
});

// Um passe próprio: ondulação + vinheta que respondem à hora do dia.
const fragment = [
  'uniform sampler2D tDiffuse;',
  'uniform float uTime;',
  'uniform float uDaylight;',   // chega sozinho, por estar declarado
  'uniform vec2 uResolution;',
  'varying vec2 vUv;',
  'void main() {',
  '  vec2 uv = vUv;',
  '  uv.x += sin(uv.y * 24.0 + uTime * 1.6) * 0.0025;',
  '  vec3 cor = texture2D(tDiffuse, uv).rgb;',
  '  float d = distance(vUv, vec2(0.5));',
  '  cor *= 1.0 - smoothstep(0.35, 0.85, d) * 0.55;',
  '  cor = mix(cor, cor * vec3(0.75, 0.85, 1.25), 1.0 - uDaylight);',
  '  gl_FragColor = vec4(cor, 1.0);',
  '  #include <colorspace_fragment>',
  '}'
].join('\\n');

const material = new THREE.ShaderMaterial({
  vertexShader: FULLSCREEN_VERTEX,
  fragmentShader: fragment,
  uniforms: {
    tDiffuse: { value: null },
    uTime: { value: 0 },
    uDaylight: { value: 1 },
    uResolution: { value: new THREE.Vector2(1, 1) }
  }
});

const meuPasse = { enabled: true, material, order: 99 }; // depois de todos os outros
cena.postProcessor.add(meuPasse);
onStop(() => { cena.postProcessor.remove(meuPasse); material.dispose(); });

let ligado = true;
const timer = setInterval(() => {
  ligado = !ligado;
  meuPasse.enabled = ligado;
  cena.hud(ligado
    ? 'passe próprio LIGADO — ondulação + vinheta + tinta noturna'
    : 'passe próprio desligado (só a pilha padrão da engine)');
}, 4000);
onStop(() => clearInterval(timer));

print('o passe entrou na mesma pilha do SSAO/bloom/tonemap, com order 99.');
print('uTime, uDaylight e uResolution são preenchidos porque o material os declara.');`
        }
      },
      {
        id: 'shader-pipeline',
        name: 'ShaderPipeline',
        kind: 'class',
        entry: "import { ShaderPipeline, type ShaderQuality } from '@voxel/engine/worker';",
        file: 'engine/render/ShaderPipeline.ts',
        summary:
          'A pilha pronta, na ordem certa: SSAO → volumétrica → bloom → tonemap/grading → FXAA. Os presets de <code>setQuality</code> ligam e desligam passes, para que o jogo tenha um botão de qualidade em vez de vinte sliders.',
        summaryPlain: 'A pilha pronta de shaders, com presets de qualidade.',
        members: [
          { kind: 'method', signature: "setQuality('off' | 'low' | 'medium' | 'high' | 'ultra')", desc: '<code>low</code> liga só o grading; <code>medium</code> soma bloom e FXAA; <code>high</code> soma volumétrica; <code>ultra</code> soma SSAO e reforça AO e god rays.' },
          { kind: 'method', signature: 'setEnabled(on)', desc: 'Chave geral sem perder o preset (<code>/shaders</code>).' },
          { kind: 'property', signature: 'quality', desc: 'Chave geral sem perder o preset (<code>/shaders</code>).' },
          { kind: 'method', signature: 'update(state: ShaderFrameState)', desc: 'Por quadro: câmera, direção e cor do sol, cor do céu, <code>daylight</code>, submerso, <code>wetness</code>.' },
          { kind: 'property', signature: 'ssao', desc: 'Os passes, para ajuste fino direto.' },
          { kind: 'property', signature: 'volumetric', desc: 'Os passes, para ajuste fino direto.' },
          { kind: 'property', signature: 'bloom', desc: 'Os passes, para ajuste fino direto.' },
          { kind: 'property', signature: 'cinematic', desc: 'Os passes, para ajuste fino direto.' },
          { kind: 'property', signature: 'fxaa', desc: 'Os passes, para ajuste fino direto.' },
          { kind: 'method', signature: 'dispose()', desc: 'Libera os alvos de render.' }
        ],
        example: {
          title: 'Os cinco presets, trocando a cada 5 segundos',
          code: `const cena = voxelScene({
  size: 64,
  seed: 15,
  target: [32, 22, 32],
  distance: 110,
  shaders: 'high'
});

cena.sky.setTime('sunset'); // sol rasante: é quando a volumétrica aparece

const presets = ['off', 'low', 'medium', 'high', 'ultra'];
let i = 0;

const trocar = () => {
  const q = presets[i % presets.length];
  cena.shaders.setQuality(q);
  const p = cena.shaders;
  cena.hud(
    'qualidade: ' + q.toUpperCase() + '\\n' +
    'ssao ' + (p.ssao.enabled ? 'on' : 'off') +
    ' · volumétrica ' + (p.volumetric.enabled ? 'on' : 'off') +
    ' · bloom ' + (p.bloom.enabled ? 'on' : 'off') +
    ' · grading ' + (p.cinematic.enabled ? 'on' : 'off') +
    ' · fxaa ' + (p.fxaa.enabled ? 'on' : 'off') + '\\n' +
    'draw calls no quadro: ' + cena.renderer.info.render.calls
  );
  print('setQuality ->', q);
  i++;
};

trocar();
const timer = setInterval(trocar, 5000);
onStop(() => clearInterval(timer));`
        }
      },
      {
        id: 'cinematic-pass',
        name: 'CinematicPass',
        kind: 'class',
        entry: "import { CinematicPass, type TonemapCurve } from '@voxel/engine/worker';",
        file: 'engine/render/CinematicPass.ts',
        summary:
          'Tonemapping e color grading num passe só: curva (ACES, AgX, Hable, Reinhard), exposição separada para dia e noite, temperatura, contraste, saturação, vibrance, vinheta, grão e aberração cromática. É o passe que define a cara do jogo.',
        summaryPlain: 'Tonemap e color grading: curva, exposição, vinheta, grão.',
        members: [
          { kind: 'method', signature: "setTonemap('aces' | 'agx' | 'hable' | 'reinhard')", desc: 'A curva de tonemapping.' },
          { kind: 'method', signature: 'setExposure(day, night?)', desc: 'Exposição por fase do ciclo.' },
          { kind: 'method', signature: 'setTemperature(a)', desc: 'Grading de cor.' },
          { kind: 'method', signature: 'setContrast(a)', desc: 'Grading de cor.' },
          { kind: 'method', signature: 'setSaturation(a)', desc: 'Grading de cor.' },
          { kind: 'method', signature: 'setVibrance(a)', desc: 'Grading de cor.' },
          { kind: 'method', signature: 'setVignette(a)', desc: 'Efeitos de lente; <code>setBloom</code> encaminha para o <code>BloomPass</code>.' },
          { kind: 'method', signature: 'setGrain(a)', desc: 'Efeitos de lente; <code>setBloom</code> encaminha para o <code>BloomPass</code>.' },
          { kind: 'method', signature: 'setChromaticAberration(a)', desc: 'Efeitos de lente; <code>setBloom</code> encaminha para o <code>BloomPass</code>.' },
          { kind: 'method', signature: 'setBloom(força)', desc: 'Efeitos de lente; <code>setBloom</code> encaminha para o <code>BloomPass</code>.' },
          { kind: 'property', signature: 'shaders.cinematic', desc: 'Onde ele vive na pilha.' },
          { kind: 'property', signature: 'ctx.cinematicPass', desc: 'Onde ele vive na pilha.' }
        ],
        example: {
          title: 'Três visuais sobre a mesma cena',
          note: 'A cena não muda — só o grading. Edite os presets e execute de novo para desenhar o seu.',
          code: `const cena = voxelScene({
  size: 64,
  seed: 18,
  target: [32, 22, 32],
  distance: 105,
  shaders: 'high'
});

cena.sky.setTime('sunset');

const PRESETS = [
  { nome: 'neutro', tonemap: 'aces', exposicao: [1.0, 0.8], saturacao: 1.0, contraste: 1.0, temperatura: 0.0, vinheta: 0.15, grao: 0.02, aberracao: 0.0 },
  { nome: 'filme', tonemap: 'agx', exposicao: [1.15, 0.7], saturacao: 0.9, contraste: 1.1, temperatura: 0.15, vinheta: 0.35, grao: 0.07, aberracao: 0.25 },
  { nome: 'estourado', tonemap: 'hable', exposicao: [1.5, 1.0], saturacao: 1.3, contraste: 0.95, temperatura: -0.12, vinheta: 0.05, grao: 0.0, aberracao: 0.0 }
];

let i = 0;
const aplicar = () => {
  const p = PRESETS[i % PRESETS.length];
  const c = cena.shaders.cinematic;
  c.setTonemap(p.tonemap);
  c.setExposure(p.exposicao[0], p.exposicao[1]);
  c.setSaturation(p.saturacao);
  c.setContrast(p.contraste);
  c.setTemperature(p.temperatura);
  c.setVignette(p.vinheta);
  c.setGrain(p.grao);
  c.setChromaticAberration(p.aberracao);

  cena.hud(
    'preset: ' + p.nome + ' · tonemap ' + p.tonemap + '\\n' +
    'exposição ' + p.exposicao.join(' / ') + ' · saturação ' + p.saturacao +
    ' · contraste ' + p.contraste + ' · vinheta ' + p.vinheta + ' · grão ' + p.grao
  );
  print('grading ->', p.nome);
  i++;
};

aplicar();
const timer = setInterval(aplicar, 5000);
onStop(() => clearInterval(timer));`
        }
      },
      {
        id: 'post-passes',
        name: 'BloomPass · SsaoPass · VolumetricPass · FxaaPass',
        kind: 'class',
        entry: "import { BloomPass, SsaoPass, VolumetricPass, FxaaPass, FullscreenQuad } from '@voxel/engine/worker';",
        file: 'engine/render/post/',
        summary:
          'Os passes individuais da pilha, usáveis isolados quando o jogo quer montar a própria ordem. <code>COLOR_GLSL</code>, <code>TONEMAP_GLSL</code>, <code>DEPTH_GLSL</code> e <code>NOISE_GLSL</code> são os trechos compartilhados, para um efeito novo reusar a mesma reconstrução de profundidade e o mesmo ruído.',
        summaryPlain: 'Bloom, SSAO, volumétrica e FXAA como passes independentes.',
        members: [
          { kind: 'method', signature: 'BloomPass(options?)', desc: 'Bloom por downsample/upsample, com limiar e força.' },
          { kind: 'method', signature: 'SsaoPass(options?)', desc: 'Oclusão de ambiente em espaço de tela, a partir da profundidade (<code>needsDepth</code>).' },
          { kind: 'method', signature: 'VolumetricPass(options?)', desc: 'God rays na direção do sol, usando <code>sunScreen</code> do <code>PostFrame</code>.' },
          { kind: 'method', signature: 'FxaaPass()', desc: 'Antialiasing barato; é o último da fila.' },
          { kind: 'property', signature: 'FullscreenQuad', desc: 'O quad e o vertex shader que todo passe reaproveita.' },
          { kind: 'property', signature: 'FULLSCREEN_VERTEX', desc: 'O quad e o vertex shader que todo passe reaproveita.' },
          { kind: 'property', signature: 'COLOR_GLSL', desc: 'Trechos GLSL compartilhados.' },
          { kind: 'property', signature: 'TONEMAP_GLSL', desc: 'Trechos GLSL compartilhados.' },
          { kind: 'property', signature: 'DEPTH_GLSL', desc: 'Trechos GLSL compartilhados.' },
          { kind: 'property', signature: 'NOISE_GLSL', desc: 'Trechos GLSL compartilhados.' }
        ],
        example: {
          title: 'Um passe de cada vez, isolado',
          note: 'A pilha começa inteira; depois cada passe fica sozinho por 4 s, na mesma cena, para você ver o que cada um faz.',
          code: `const cena = voxelScene({
  size: 64,
  seed: 23,
  target: [32, 22, 32],
  distance: 105,
  shaders: 'ultra'
});

cena.sky.setTime('sunset');

const p = cena.shaders;
const todos = [p.ssao, p.volumetric, p.bloom, p.cinematic, p.fxaa];

const cenas = [
  ['pilha completa (ultra)', todos],
  ['só SSAO — oclusão de ambiente nos cantos dos voxels', [p.ssao]],
  ['só volumétrica — god rays na direção do sol', [p.volumetric]],
  ['só bloom — estouro nas áreas claras', [p.bloom]],
  ['só grading — tonemap, vinheta, grão', [p.cinematic]],
  ['só FXAA — serrilhado das arestas suavizado', [p.fxaa]],
  ['nenhum passe — imagem crua da cena', []]
];

let i = 0;
const trocar = () => {
  const [rotulo, ativos] = cenas[i % cenas.length];
  for (const passe of todos) passe.enabled = ativos.includes(passe);
  cena.postProcessor.enabled = ativos.length > 0;
  cena.hud(rotulo);
  print('passes ativos ->', rotulo);
  i++;
};

trocar();
const timer = setInterval(trocar, 4000);
onStop(() => clearInterval(timer));`
        }
      },
      {
        id: 'shadow-map',
        name: 'ShadowMap',
        kind: 'class',
        entry: "import { ShadowMap, SHADOW_LAYER, type ShadowMapOptions } from '@voxel/engine/worker';",
        file: 'engine/render/ShadowMap.ts',
        summary:
          'Shadow map direcional alinhado ao sol da dimensão, com snap ao texel (para a sombra não tremer quando a câmera anda), passo angular configurável e suavização. Só o que está na camada <code>SHADOW_LAYER</code> entra no mapa.',
        summaryPlain: 'Sombra direcional do sol, com snap ao texel e suavização.',
        members: [
          { kind: 'method', signature: 'world.setShadows(enabled, options?)', desc: 'O mundo cria e mantém o mapa: <code>{ resolution, radius, strength, softness }</code>.' },
          { kind: 'method', signature: 'world.renderShadows(renderer, scene)', desc: 'Desenhado antes da cena, e antes dos efeitos de câmera.' },
          { kind: 'method', signature: 'setResolution(r)', desc: 'Ajuste em tempo de execução (<code>/shadows</code>, <code>/shadowsoft</code>).' },
          { kind: 'method', signature: 'setRadius(raio)', desc: 'Ajuste em tempo de execução (<code>/shadows</code>, <code>/shadowsoft</code>).' },
          { kind: 'method', signature: 'setStrength(v)', desc: 'Ajuste em tempo de execução (<code>/shadows</code>, <code>/shadowsoft</code>).' },
          { kind: 'method', signature: 'setSoftness(v)', desc: 'Ajuste em tempo de execução (<code>/shadows</code>, <code>/shadowsoft</code>).' },
          { kind: 'method', signature: 'setAngleStep(graus)', desc: 'Quantização do sol e do deslocamento: é o que mata o shimmer.' },
          { kind: 'method', signature: 'setSnapToTexel(on)', desc: 'Quantização do sol e do deslocamento: é o que mata o shimmer.' },
          { kind: 'property', signature: 'SHADOW_LAYER', desc: 'Camada que define o que projeta sombra.' }
        ],
        example: {
          title: 'Sombra ligada, desligada, e em resoluções diferentes',
          note: 'O sol fica rasante (<code>sunset</code>), que é quando a sombra mais aparece. A torre é erguida com <code>setBlockAt</code> antes do teste.',
          code: `const demo = worldSandbox({
  world: { renderDistance: 6 },
  spawn: [0, 44, 0], lookAt: [0, 26, 0], distance: 80,
  shadows: true, shaders: 'high'
});

await demo.ready();
demo.world.setTime('sunset');

const topo = demo.world.drySurfaceAt(0, 0, 60, 0) ?? 30;
for (let y = 1; y <= 14; y++) {
  demo.world.setBlockAt(2, topo + y, 0, BLOCKS.stone);
  demo.world.setBlockAt(3, topo + y, 0, BLOCKS.stone);
}
for (let dx = -3; dx <= 5; dx++) demo.world.setBlockAt(dx, topo + 14, 0, BLOCKS.stone);
print('torre erguida com setBlockAt: é ela que projeta a sombra.');

const cenas = [
  ['sombras ligadas · 2048²', () => demo.world.setShadows(true, { resolution: 2048 })],
  ['sombras ligadas · 512² (repare na borda)', () => demo.world.setShadows(true, { resolution: 512 })],
  ['sombras desligadas', () => demo.world.setShadows(false)],
  ['sombras ligadas · 4096²', () => demo.world.setShadows(true, { resolution: 4096 })]
];

let i = 0;
const trocar = () => {
  const [rotulo, aplicar] = cenas[i % cenas.length];
  aplicar();
  demo.hud(rotulo + '\\nsol rasante (sunset) · a sombra segue a direção do sol da dimensão');
  print('shadow map ->', rotulo);
  i++;
};

trocar();
const timer = setInterval(trocar, 4500);
onStop(() => clearInterval(timer));`
        }
      },
      {
        id: 'brickmap',
        name: 'GlobalBrickMap · GlobalRaymarchPass',
        kind: 'class',
        entry: "// não exportado pelos barrels: vive dentro do ProceduralWorld\n// ligue com world: { chunkRenderer: 'brickmap' }",
        file: 'engine/render/brickmap/',
        summary:
          'O caminho alternativo de render: em vez de malha, o volume vai para a GPU como brickmap (textura 3D esparsa) e um passe de tela cheia faz raymarch DDA dentro dele. Troca triângulos por passos de ray, o que escala com a <b>densidade</b> do mundo e não com a área de superfície — é o caminho para micro-voxel.',
        summaryPlain: 'Render por raymarch em brickmap, em vez de malha.',
        members: [
          { kind: 'property', signature: "world: { chunkRenderer: 'mesh' | 'brickmap' }", desc: 'A opção que escolhe o caminho; <code>/brickmap</code> alterna em runtime.' },
          { kind: 'property', signature: 'GlobalBrickMap', desc: 'Mantém os bricks residentes na GPU e o índice esparso conforme os chunks entram e saem.' },
          { kind: 'property', signature: 'GlobalRaymarchPass', desc: 'Passe de tela cheia que marcha o ray pelo brickmap e resolve normal e material no fragment.' },
          { kind: 'property', signature: 'EmissiveLightField', desc: 'Campo de luz emissiva amostrado pelo raymarch (blocos com <code>luminance</code>).' },
          { kind: 'property', signature: 'GpuTexture3D', desc: 'Textura 3D com upload parcial, para atualizar só os bricks sujos.' },
          { kind: 'method', signature: 'world.attachRenderer(renderer)', desc: 'O brickmap só aloca as texturas depois que existe contexto WebGL.' }
        ],
        example: {
          title: 'O mesmo mundo, renderizado por raymarch',
          note: 'Se a sua GPU não suportar as texturas 3D necessárias, a engine cai no caminho de malha e avisa no console do navegador — o mesmo comportamento do jogo.',
          code: `const demo = worldSandbox({
  world: {
    chunkSize: 32,
    renderDistance: 4,
    verticalRenderDistance: 2,
    chunkRenderer: 'brickmap',   // troque para 'mesh' e compare os números
    voxelsPerBlock: 1
  },
  spawn: [0, 48, 0], lookAt: [0, 26, 0], distance: 90,
  shaders: 'low'
});

await demo.ready();

demo.onFrame(() => {
  const info = demo.renderer.info;
  demo.hud(
    "chunkRenderer: 'brickmap' — o volume vive na GPU como textura 3D esparsa\\n" +
    demo.world.getLoadedChunkCount() + ' chunks · ' +
    info.render.triangles.toLocaleString('pt-BR') + ' triângulos no quadro · ' +
    info.render.calls + ' draw calls · ' + info.memory.textures + ' texturas\\n' +
    'no caminho de malha, este mesmo mundo desenha dezenas de milhares de triângulos'
  );
});

print("troque chunkRenderer para 'mesh' e execute de novo para comparar.");`
        }
      }
    ]
  },
  {
    id: 'entidades',
    title: 'Entidades & Efeitos',
    icon: 'deployed_code',
    blurb: 'Corpos que não são voxel, e o pool de partículas.',
    modules: [
      {
        id: 'voxel-particles',
        name: 'VoxelParticles',
        kind: 'class',
        entry: "import { VoxelParticles } from '@voxel/engine/worker';",
        file: 'engine/effects/VoxelParticles.ts',
        summary:
          'Pool de cubinhos com física simples e colisão contra voxels, desenhados como um único <code>InstancedMesh</code> — milhares de partículas em um draw call. A engine simula; o plugin decide o que emitir. O pool compartilhado é <code>ctx.particles</code>.',
        summaryPlain: 'Milhares de partículas com colisão, em um único draw call.',
        members: [
          { kind: 'constructor', signature: 'new VoxelParticles(parent: Object3D, world: VoxelColliderWorld, { maxParticles = 2048 })', desc: 'Além do limite, as mais antigas são recicladas.' },
          { kind: 'method', signature: 'emit({ position, velocity?, color, size?, lifetime?, gravity?, drag?, groundFriction?, collide?, shrink? })', desc: 'Velocidade em blocos por tick; <code>lifetime</code> em ticks de 50 ms. Padrões: <code>size 0.15</code>, <code>lifetime 20</code>, <code>gravity 0.04</code>, <code>drag 0.98</code>.' },
          { kind: 'method', signature: 'update(deltaMs)', desc: 'Tick fixo de 50 ms por dentro.' },
          { kind: 'property', signature: 'count', desc: 'Tick fixo de 50 ms por dentro.' },
          { kind: 'method', signature: 'clear()', desc: 'Tick fixo de 50 ms por dentro.' },
          { kind: 'method', signature: 'dispose()', desc: 'Tick fixo de 50 ms por dentro.' },
          { kind: 'property', signature: 'mesh: InstancedMesh', desc: 'O objeto já adicionado ao <code>parent</code>.' }
        ],
        example: {
          title: 'Emissão contínua de partículas (InstancedMesh isolado)',
          note: 'Demonstração focada no pool de partículas: renderização em 1 draw call e física de colisão, sem carregar chunks ou mundo procedural.',
          code: `// Cena 3D limpa sem custo de geração de chunks ou terreno
const view = view3D({ target: [0, 5, 0], distance: 30 });

// Colisor plano leve em y <= 0 (cumpre a interface VoxelColliderWorld sem nenhum chunk)
const world = {
  isBlockSolid: (x, y, z) => y <= 0
};

// Grade leve apenas como referência visual de piso
view.add(new THREE.GridHelper(30, 30, 0x10b981, 0x334155));

const particulas = new VoxelParticles(view.scene, world, { maxParticles: 4000 });
onStop(() => particulas.dispose());

const CORES = [0xffcc66, 0xff7a59, 0xff3d00, 0x10b981, 0x38bdf8];

view.onFrame((dt) => {
  for (let i = 0; i < 10; i++) {
    const a = Math.random() * Math.PI * 2;
    const forca = 0.2 + Math.random() * 0.25;
    particulas.emit({
      position: { x: 0, y: 0.5, z: 0 },
      velocity: {
        x: Math.cos(a) * forca * 0.6,
        y: 0.35 + Math.random() * 0.3,
        z: Math.sin(a) * forca * 0.6
      },
      color: CORES[(Math.random() * CORES.length) | 0],
      size: 0.12 + Math.random() * 0.15,
      lifetime: 100,
      gravity: 0.03,
      groundFriction: 0.6,
      collide: true,
      shrink: true
    });
  }
  particulas.update(dt);

  view.hud(
    'partículas ativas: ' + particulas.count + ' de 4000 · tudo em 1 draw call (InstancedMesh)\\n' +
    'demonstração isolada: colisor plano leve sem carregar chunks ou terreno'
  );
});`
        }
      },
      {
        id: 'entities',
        name: 'Entity · EntityManager · entityRegistry',
        kind: 'class',
        entry: "import { Entity, EntityManager, entityRegistry, type EntityFactory } from '@voxel/engine/worker';",
        file: 'engine/entities/',
        summary:
          '<code>Entity</code> é abstrata: traz o <code>KinematicBody</code>, o mesh e a colisão contra o mundo; o jogo herda e implementa o comportamento. O <code>entityRegistry</code> mapeia um nome de tipo para uma fábrica, para que spawn venha de dado — um comando, um arquivo de nível — e não de <code>import</code>.',
        summaryPlain: 'Corpos que não são voxel: física AABB, mesh e spawn por nome.',
        members: [
          { kind: 'property', signature: 'abstract class Entity(world, dimensions: { width, height, depth? }, color?)', desc: 'Já monta <code>body: KinematicBody</code> e um mesh de caixa.' },
          { kind: 'property', signature: 'abstract update(deltaMs): void', desc: 'O comportamento é da subclasse; <code>applyPhysics(dtScale)</code> resolve o movimento.' },
          { kind: 'property', signature: 'position', desc: 'Atalhos para o corpo.' },
          { kind: 'property', signature: 'velocity', desc: 'Atalhos para o corpo.' },
          { kind: 'property', signature: 'isGrounded', desc: 'Atalhos para o corpo.' },
          { kind: 'property', signature: 'gravity', desc: 'Atalhos para o corpo.' },
          { kind: 'property', signature: 'friction', desc: 'Atalhos para o corpo.' },
          { kind: 'method', signature: 'addToScene(scene)', desc: 'Ciclo de vida visual.' },
          { kind: 'method', signature: 'removeFromScene(scene)', desc: 'Ciclo de vida visual.' },
          { kind: 'method', signature: 'dispose()', desc: 'Ciclo de vida visual.' },
          { kind: 'property', signature: 'protected onCollision(axis)', desc: 'Ganchos para a subclasse.' },
          { kind: 'property', signature: 'protected checkCollision(pos)', desc: 'Ganchos para a subclasse.' },
          { kind: 'method', signature: 'entityRegistry.register(type, factory)', desc: '<code>EntityFactory = (world, x, y, z) =&gt; Entity</code>.' },
          { kind: 'method', signature: 'create(type, world, x, y, z)', desc: '<code>EntityFactory = (world, x, y, z) =&gt; Entity</code>.' },
          { kind: 'method', signature: 'getAvailableTypes()', desc: '<code>EntityFactory = (world, x, y, z) =&gt; Entity</code>.' }
        ],
        example: {
          title: 'Blobs que pulam pelo terreno real',
          note: 'A subclasse é criada agora, registrada no <code>entityRegistry</code> e instanciada por nome. Colide contra o volume de voxels da cena, com o mesmo resolvedor AABB do jogador.',
          code: `// Entity precisa de um mundo com isBlockSolid e de uma cena: o volume de voxels
// desta página serve aos dois, sem subir chunk workers.
const cena = voxelScene({
  size: 56,
  seed: 33,
  target: [28, 20, 28],
  distance: 100,
  shaders: 'medium'
});

class Blob extends Entity {
  constructor(world, x, y, z, cor) {
    super(world, { width: 1.0, height: 1.0 }, cor);
    this.body.position.set(x, y, z);
    this.body.gravity = 0.06;
    this.cooldown = Math.floor(Math.random() * 20);
  }

  update(deltaMs) {
    if (this.isGrounded && --this.cooldown <= 0) {
      this.velocity.y = 0.42;
      this.velocity.x = (Math.random() - 0.5) * 0.3;
      this.velocity.z = (Math.random() - 0.5) * 0.3;
      this.cooldown = 14 + Math.floor(Math.random() * 20);
    }
    this.applyPhysics(deltaMs / 50); // 50 ms é o tick de referência
  }

  onCollision(eixo) {
    if (eixo === 'x' || eixo === 'z') {
      this.velocity.x *= -0.6;
      this.velocity.z *= -0.6;
    }
  }
}

// spawn por nome, não por import
entityRegistry.register('blob', (world, x, y, z) => new Blob(world, x, y, z, 0x7c3aed));
entityRegistry.register('blob-verde', (world, x, y, z) => new Blob(world, x, y, z, 0x34d399));
print('tipos registrados:', entityRegistry.getAvailableTypes().join(', '));

const vivos = [];
for (let i = 0; i < 12; i++) {
  const tipo = i % 2 === 0 ? 'blob' : 'blob-verde';
  const e = entityRegistry.create(tipo, cena.world, 20 + Math.random() * 16, 50, 20 + Math.random() * 16);
  e.addToScene(cena.scene);
  vivos.push(e);
}
onStop(() => { for (const e of vivos) { e.removeFromScene(cena.scene); e.dispose(); } });

cena.onTick((dt) => {
  for (const e of vivos) {
    e.update(dt);
    if (e.position.y < 2) e.position.set(20 + Math.random() * 16, 50, 20 + Math.random() * 16);
  }
  const noChao = vivos.filter((e) => e.isGrounded).length;
  cena.hud(
    vivos.length + ' entidades · ' + noChao + ' no chão\\n' +
    'cada uma tem o seu KinematicBody; a colisão é a mesma do jogador'
  );
});`
        }
      }
    ]
  }
];

export const MODULE_COUNT = GROUPS.reduce((n, g) => n + g.modules.length, 0);

const FLAT = GROUPS.flatMap((group) => group.modules.map((module) => ({ module, group })));

export function findModule(id: string):
  | { module: ApiModule; group: ApiGroup; previous: ApiModule | null; next: ApiModule | null }
  | null {
  const index = FLAT.findIndex((entry) => entry.module.id === id);
  if (index === -1) return null;
  return {
    module: FLAT[index].module,
    group: FLAT[index].group,
    previous: index > 0 ? FLAT[index - 1].module : null,
    next: index < FLAT.length - 1 ? FLAT[index + 1].module : null
  };
}

export const ALL_MODULES: ApiModule[] = FLAT.map((entry) => entry.module);
