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

- [ ] Sistema de colisão contínua e resolução de AABB por eixo
- [ ] Ambient Occlusion (AO) calculada por vértice nos blocos
- [ ] Persistência de mundo (IndexedDB / LocalStorage)
- [ ] Sincronização multiplayer via WebSockets
