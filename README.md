# 🧱 Voxel Engine com Three.js

🔗 **Live Demo:** https://voxel-engine-js.vercel.app/

Uma **Voxel Engine** desenvolvida em **JavaScript** utilizando **Three.js**, com foco em desempenho, geração procedural e arquitetura modular. O projeto implementa diversas técnicas utilizadas em engines voxel modernas, como geração procedural, otimização de malhas, processamento paralelo, shaders e sistemas básicos de inteligência artificial.

---

# ✨ Funcionalidades

## 🌍 Geração Procedural

- ✅ Geração procedural infinita utilizando **Perlin Noise**
- ✅ Sistema de **Simplex Noise 3D** para geração de cavernas (*Spaghetti Caves*)
- ✅ Definição de nível do mar
- ✅ Diversos biomas gerados proceduralmente
- ✅ Geração procedural de árvores
- ✅ Geração procedural de cavernas
- ✅ Suporte a múltiplos mundos gerados proceduralmente

---

## 🧱 Sistema de Blocos

- ✅ Múltiplos tipos de blocos (grama, terra, pedra, areia, água, etc.)
- ✅ Colocar blocos utilizando **Raycasting**
- ✅ Remover blocos utilizando **Raycasting**
- ✅ Atualização dinâmica das malhas dos chunks após alterações no mundo

---

## 📦 Sistema de Chunks

- ✅ Organização do mundo em **Chunks**
- ✅ Carregamento e descarregamento dinâmico de chunks
- ✅ Geração assíncrona utilizando **Web Workers**
- ✅ Arquitetura preparada para mundos de grande escala

---

## ⚡ Otimizações

- ✅ **Greedy Meshing (Malha Gulosa)** para reduzir drasticamente a quantidade de polígonos renderizados
- ✅ Ocultação automática de faces internas
- ✅ Geração de malhas em múltiplas threads utilizando **Web Workers**
- ✅ Estrutura voltada para alto desempenho

---

## 🎨 Renderização

- ✅ Renderização 3D utilizando **Three.js**
- ✅ Shader básico para iluminação
- ✅ Ciclo dinâmico de dia e noite
- ✅ Nuvens geradas proceduralmente com **Perlin Noise**

---

## 🧠 Identidades

- ✅ Máquina de estados (*Finite State Machine*) para controle de animais

### Planejado

- ⏳ Sistema de navegação baseado em grafos para que animais encontrem caminhos de forma inteligente.

---

## 🚧 Próximas funcionalidades

- ⏳ Salvamento e carregamento de mundos
- ⏳ Iluminação dinâmica
- ⏳ Estruturas complexas (vilas, ruínas, dungeons, etc.)
- ⏳ Geração procedural de rios e lagos
- ⏳ Sistema de inventário e crafting

---

# 🛠️ Tecnologias

- JavaScript (ES6+)
- Three.js
- Web Workers
- Perlin Noise
- Simplex Noise 3D
- HTML5
- CSS3

---

# 🚀 Executando o projeto

```bash
git clone https://github.com/otavio-rb/voxel.js.git

cd voxel.js

npm install

npm run dev
```

---

# 📌 Objetivos do projeto

O objetivo desta engine é estudar e implementar técnicas utilizadas em jogos voxel modernos, incluindo:

- Renderização eficiente de voxels
- Geração procedural de mundos
- Greedy Meshing
- Computação paralela com Web Workers
- Shaders
- Arquiteturas escaláveis para mundos extensos
- Simulação em tempo real
