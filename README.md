# voxel-engine.js

Motor voxel no navegador desenvolvido com Three.js e TypeScript, focado em geração de terreno procedural e otimização de malha em tempo real.

**Demo online:** https://voxel-engine-js.vercel.app/

## Funcionalidades

- **Terreno Procedural**: Geração contínua com Perlin e Simplex Noise 3D (relevo, biomas, árvores e cavernas estilo *spaghetti*).
- **Otimização de Malha (Greedy Meshing)**: Redução da contagem de polígonos mesclando faces coplanares adjacentes e descartando faces oclusas.
- **Processamento em Segundo Plano**: Geração e malhagem de chunks descarregadas em Web Workers para manter a taxa de quadros estável na thread principal.
- **Interação**: Inserção e destruição de blocos em tempo real com raycasting.
- **Ambiente**: Ciclo de dia e noite dinâmico com shaders customizados e nuvens procedurais.
- **Entidades**: Máquina de estados finitos (FSM) para controle e comportamento de animais/mobs.

## Arquitetura: engine × jogo

O repositório tem duas camadas, e a engine nunca importa código do jogo (`npm run check:boundary` garante isso):

```
engine/                  Motor reutilizável (sem conteúdo de jogo)
  index.ts               @voxel/engine              → thread principal (VoxelEngine)
  worker.ts              @voxel/engine/worker       → runEngineWorker, plugins, mundo, física, registries
  chunk-worker.ts        @voxel/engine/chunk-worker → runChunkWorker, blocos, geradores
game/                    O jogo construído sobre a engine
  main.ts                Menu, UI, áudio
  workers/               Entradas dos workers (chamam a engine com o conteúdo do jogo)
  content/               Blocos, dimensões, geradores de terreno, animais
  plugins/               Lógica que roda no worker: efeitos, dimensões, rede, vulcão, fauna
```

Como a simulação roda em Web Workers, cada worker tem seus próprios registries. O jogo, portanto, registra o conteúdo **dentro** dos workers:

```ts
// game/workers/engine.worker.ts
runEngineWorker({
  setup: registerGameContent,              // blocos, dimensões, entidades
  createChunkWorker: () => new Worker(new URL('./chunk.worker.ts', import.meta.url), { type: 'module' }),
  plugins: [meuPlugin],
  hotbar: [2, 0, 1]
});

// game/workers/chunk.worker.ts
runChunkWorker({ setup: registerTerrainContent }); // blocos + geradores

// game/main.ts
const engine = new VoxelEngine({
  canvas,
  worker: new Worker(new URL('./workers/engine.worker.ts', import.meta.url), { type: 'module' })
});
```

Um plugin recebe o `EngineContext` (mundo, jogador, cena, câmera, comandos) e se conecta aos hooks:

```ts
export const meuPlugin: EnginePlugin = {
  name: 'meu-plugin',
  setup(ctx) {
    ctx.commands.register('/ola', () => ctx.emitToMain('chat:message', { text: 'Olá!' }));
    ctx.on('fixedUpdate', ({ deltaMs }) => { /* ... */ });
    ctx.world.events.on('chunk:ready', ({ data }) => { /* ... */ });
    ctx.onMessage('minha-msg', (payload) => { /* vindo de engine.send('minha-msg', payload) */ });
  }
};
```

## Movimento

O jogador segue as fórmulas do Minecraft 1.8 ([horizontal](https://www.mcpk.wiki/wiki/Horizontal_Movement_Formulas), [vertical](https://www.mcpk.wiki/wiki/Vertical_Movement_Formulas)): 20 ticks por segundo com a câmera interpolada, momentum com `slipperiness` por bloco, aceleração aérea, sprint-jump, trava de borda no sneak e física de água e lava. Os controles no modo sobrevivência são WASD, Espaço para pular, W duas vezes ou Ctrl para correr, e Shift para agachar. A câmera balança ao andar (view bobbing); `/bobbing off` desliga.

## Tecnologias

- TypeScript
- Three.js
- Web Workers
- Vite

## Executando Localmente

```bash
git clone https://github.com/otavio-rb/voxel-engine.js.git
cd voxel-engine.js
npm install
npm run dev
```

## Próximos Passos

- [x] Sistema de colisão contínua e resolução de AABB por eixo
- [ ] Ambient Occlusion (AO) calculada por vértice nos blocos
- [ ] Persistência de mundo (IndexedDB / LocalStorage)
- [ ] Sincronização multiplayer via WebSockets
