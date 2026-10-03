# voxel-engine.js

Motor voxel no navegador desenvolvido com **Three.js** e **TypeScript**, focado em geração procedural de terreno, otimização de malha em tempo real com **Greedy Meshing**, iluminação voxel 3D e processamento concorrente em **Web Workers**.

**Demo online:** https://voxel-engine-js.vercel.app/

---

## Funcionalidades

- **Terreno Procedural**: Geração contínua com ruídos volumétricos Perlin e Simplex 3D (relevo, biomas, árvores e redes de cavernas estilo *spaghetti*).
- **Otimização de Malha (Greedy Meshing)**: Redução drástica da contagem de polígonos e vértices mesclando faces coplanares adjacentes com o mesmo material e descartando faces internas oclusas.
- **Processamento Concorrente em Segundo Plano**: Geração matemática de relevo e malhagem de chunks descarregadas em Web Workers dedicados para manter 60+ FPS estáveis na thread principal.
- **Iluminação Voxel Estilo Minecraft**: Propagação tridimensional de luz do sol (*Sky Light*) e luz emitida por blocos (*Block Light*) em níveis de 0 a 15 via *flood fill*, com interpolação suave de iluminação por vértice (*Smooth Lighting*) e *Ambient Occlusion* (AO).
- **Física e Movimento Fiel ao Minecraft 1.8**: Loop de física fixo a 20 ticks/s com interpolação suave da câmera, conservação de momentum, atrito por bloco (*slipperiness*), sprint-jump, trava de segurança em bordas ao agachar (*sneak*) e arrasto em água e lava.
- **Interação com o Mundo**: Inserção e destruição de blocos em tempo real com raycasting rápido em AABB voxel, disparando atualizações locais e incrementais de malha e luz.
- **Múltiplas Dimensões**: Suporte modular a diferentes dimensões (`overworld`, `nether`, `lunar`, `volcanic`, `cavern`, etc.), cada uma com gerador de terreno, atmosfera e gravidade próprios.
- **Ambiente Dinâmico e Efeitos**: Ciclo dia/noite em shaders customizados, atmosfera com névoa adaptativa, partículas e camada extensível de pós-processamento de tela.

---

## Arquitetura: Engine × Jogo

O repositório adota uma separação estrita em duas camadas. O núcleo do motor (`engine/`) é totalmente desacoplado e reutilizável, nunca importando código específico do jogo (`game/`). O script `npm run check:boundary` é executado no pipeline para validar essa fronteira.

```
engine/                  Motor reutilizável (agnóstico a conteúdo)
  ├── core/              VoxelEngine (thread principal, canvas, orquestração de workers)
  ├── worker.ts          @voxel/engine/worker (loop físico a 20Hz, grafo Three.js, plugins)
  ├── chunk-worker.ts    @voxel/engine/chunk-worker (geração de terreno, meshing, iluminação)
  ├── chunk/             Chunk, ChunkManager e algoritmo de Greedy Meshing
  ├── physics/           AABB, raycast de blocos, colisão contínua e física de fluidos
  ├── player/            Controlador cinemático do jogador e interpolação de câmera
  └── render/            Pipeline de materiais, iluminação e render loop Three.js

game/                    Conteúdo e gameplay construídos sobre a engine
  ├── main.ts            Menu inicial, HUD, áudio e ciclo de vida
  ├── workers/           Pontos de entrada dos workers (registram blocos e geradores)
  ├── content/           Definições de blocos, dimensões, biomas e entidades
  ├── dimensions/        DimensionManager e transição de mundos
  ├── effects/           Efeitos visuais, fendas dimensionais e pós-processamento
  └── plugins/           Plugins da engine (gameplay, chat, fauna, rede)
```

### Pipeline de Web Workers

A simulação e a renderização utilizam Web Workers para evitar quedas de quadros durante o carregamento de terreno:

1. **Main Thread (`VoxelEngine`)**:
   - Inicializa a viewport, gerencia a interface DOM/HUD, captura inputs do usuário (Pointer Lock, teclado e mouse) e despacha eventos para os workers.
2. **Engine Worker (`engine.worker.ts`)**:
   - Executa o loop de simulação física a 20 ticks por segundo, processa entidades, atualiza a posição do jogador, orquestra plugins e mantém o grafo de cena do Three.js.
3. **Chunk Worker (`chunk.worker.ts`)**:
   - Responsável pelo processamento matemático pesado: geração procedural de ruídos 3D, flood fill de iluminação e síntese geométrica das malhas via Greedy Meshing. Os dados são enviados de volta prontos para a GPU através de `Transferable Objects` (Float32Array), sem custo de cópia de memória.

### Sistema de Plugins

A lógica de jogo se conecta à engine através de plugins modulares que recebem o `EngineContext`:

```ts
export const meuPlugin: EnginePlugin = {
  name: 'meu-plugin',
  setup(ctx) {
    ctx.commands.register('/ola', () => ctx.emitToMain('chat:message', { text: 'Olá!' }));
    ctx.on('fixedUpdate', ({ deltaMs }) => { /* física ou lógica a cada tick */ });
    ctx.world.events.on('chunk:ready', ({ data }) => { /* chunk carregado */ });
    ctx.onMessage('minha-msg', (payload) => { /* comunicação direta com a main thread */ });
  }
};
```

---

## Otimização de Malha (Greedy Meshing)

Em vez de renderizar cubos individuais (o que geraria milhares de triângulos invisíveis), o motor utiliza **Greedy Meshing**:

1. **Descarte de Oclusão**: Faces adjacentes a blocos opacos são sumariamente eliminadas antes da montagem geométrica.
2. **Mesclagem de Faces Coplanares**: O algoritmo varre fatias 2D em cada um dos eixos (X, Y, Z). Blocos vizinhos com as mesmas propriedades de material, iluminação e normais são agrupados em quadriláteros únicos e contínuos.
3. **Resultados**: Redução de mais de 80% na contagem de vértices e triângulos, minimizando chamadas de desenho (*draw calls*) e permitindo distâncias de renderização elevadas no navegador.

---

## Iluminação Voxel

A engine implementa um sistema de iluminação volumétrica em grade:

- **Dois Canais de Luz (0 a 15)**:
  - **Sky Light**: Luz solar que penetra verticalmente pelo mundo e atenua ao entrar em cavernas e túneis fechados.
  - **Block Light**: Luz emitida por blocos luminosos (tochas, lava, pedras incandescentes) e propagada tridimensionalmente.
- **Propagação por Flood Fill**:
  - Quando a luz se propaga, cada passo para um bloco vizinho transparente diminui o nível em 1 unidade.
  - O cálculo da iluminação de cada chunk é feito pelo Chunk Worker durante a geração. A engine costura as bordas entre chunks contíguos de forma assíncrona.
- **Atualização Incremental em Tempo Real**:
  - Ao colocar ou quebrar um bloco emissor ou opaco, apenas os nós de luz afetados são recalculados através de filas BFS de adição e remoção, sem necessidade de regerar o terreno vizinho.
- **Smooth Lighting por Vértice**:
  - Os valores de luz dos blocos adjacentes e a oclusão de ambiente (AO) são interpolados nos vértices dos polígonos no shader, gerando sombras suaves e cantos sombreados sem custo adicional de geometria.

---

## Física e Movimento

O controlador do jogador reproduz as fórmulas do Minecraft 1.8:

- **Tempo Discreto**: Loop físico executado a 20 ticks por segundo, enquanto a câmera é interpolada a 60/144 Hz para renderização suave.
- **Cinemática**:
  - Aceleração e desaceleração baseadas no atrito do bloco em que o jogador pisa (`slipperiness`).
  - Preservação de velocidade em pulo contínuo durante a corrida (*sprint-jumping*).
  - Trava em bordas (*sneak*): ao andar agachado com Shift, o sistema de colisão impede que a caixa delimitadora (AABB) caia de blocos com ar abaixo.
  - Dinâmica de fluidos com flutuabilidade e resistência proporcional em água e lava.

---

## Controles

| Tecla / Ação | Função |
| :--- | :--- |
| **W, A, S, D** | Movimentação horizontal |
| **Espaço** | Pular / Nadar para cima |
| **2x W** ou **Ctrl** | Correr (*Sprint*) |
| **Shift** | Agachar (*Sneak* - trava em quinas) |
| **Clique Esquerdo** | Destruir bloco mirado |
| **Clique Direito** | Colocar bloco selecionado |
| **Scroll do Mouse** ou **1-9** | Selecionar bloco na Hotbar |
| **;** ou **Enter** | Abrir/fechar console de chat |
| **Esc** | Abrir/fechar menu do jogo |

---

## Comandos do Console / Chat

Pressione `;` no jogo para abrir a barra de comandos:

- `/clima [limpo|chuva|tempestade|tornado|areia]` ou `/weather [type]`: Altera o clima dinamicamente com transição suave (chuva vira neve em biomas gélidos, e tempestades de areia só ocorrem no deserto).
- `/tornado [spawn|clear]` ou `/redemoinho`: Gera ou dissipa um tornado colossal com vórtice e sucção física.
- `/sandstorm` ou `/areia`: Inicia uma tempestade de areia (disponível exclusivamente no bioma de deserto).
- `/storm` ou `/tempestade`: Inicia tempestade severa com trovões e relâmpagos (vira nevasca em biomas frios e não produz chuva no deserto).
- `/thunder`: Dispara um raio imediato que ilumina céu, nuvens e chão.
- `/shaders [on|off]`: Alterna entre shaders avançados e o modo de compatibilidade/fallback com materiais unlit.
- `/dim [overworld|nether|lunar|mercury|volcanic|astral_void|cavern]`: Teleporta para a dimensão especificada.
- `/dim list`: Lista todas as dimensões disponíveis e parâmetros de gravidade.
- `/dim info`: Exibe detalhes da dimensão atual.
- `/rift [dimensão]` ou `/fenda`: Abre uma fenda de viagem interdimensional.
- `/regen [dimensão]`: Regenera o terreno atual com o gerador informado.
- `/time [day|night|noon|midnight|<número>]`: Ajusta o horário do ciclo dia/noite.
- `/tp <x> <y> <z>`: Teleporta o jogador para coordenadas absolutas.
- `/bobbing [on|off]`: Ativa ou desativa o balanço dinâmico da câmera ao andar.
- `/help`: Exibe a lista de comandos no chat.

---

## Tecnologias

- **TypeScript**: Tipagem estrita em todo o motor e camada de jogo.
- **Three.js**: Renderização 3D WebGL, câmeras, malhas com buffers e materiais GLSL.
- **Web Workers**: Concorrência assíncrona para geração procedural e física.
- **Vite**: Servidor de desenvolvimento rápido e bundler otimizado para produção.

---

## Executando Localmente

### Pré-requisitos
- Node.js 18+ instalado
- npm ou yarn

### Instalação
```bash
git clone https://github.com/otavio-rb/voxel-engine.js.git
cd voxel-engine.js
npm install
npm run dev
```

### Scripts do Projeto
```bash
npm run dev             # Inicia o servidor local Vite
npm run build           # Compila para produção
npm run preview         # Visualiza o build de produção localmente
npm run typecheck       # Verificação de tipos TypeScript
npm run check:boundary  # Valida o desacoplamento estrito entre engine e game
```

---

## Próximos Passos

- [x] Sistema de colisão contínua e resolução de AABB por eixo
- [x] Iluminação Voxel (Sky Light + Block Light) com Smooth Lighting e AO
- [x] Suporte modular a múltiplas dimensões
- [ ] Persistência de mundo no navegador (IndexedDB)
- [ ] Sincronização multiplayer via WebSockets
