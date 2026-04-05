# 🧱 Voxel Engine com Three.js

[Live demo](https://cursoredes-bf3ec.web.app/)

Este é um projeto de uma **Voxel Engine** feito em **JavaScript puro**, utilizando **Three.js** para renderização 3D.

 **Este projeto ainda está em desenvolvimento.**

---

## Status

> Em desenvolvimento ativo – funcionalidades básicas de chunks, blocos, renderização e geração procedural estão sendo implementadas.

---

## Funcionalidades

- ✅ Renderização de blocos voxel com Three.js
- ✅ Organização dos blocos em **chunks**
- ✅ **WebWorker** para geração multithread dos chunks
- ✅ Geração procedural de terreno com **Perlin Noise**
- ✅ Otimização dos blocos: ocultação de faces internas/invisíveis
- ⏳ Interação com blocos (colocar/remover)
- ⏳ Salvamento e carregamento de mundos
- ⏳ Suporte a diferentes tipos de blocos (ex: grama, pedra, água)


---

## Tecnologias utilizadas

- [Three.js](https://threejs.org/) – Biblioteca para renderização WebGL
- JavaScript (ES6+)
- **Web Workers** – Para geração em segundo plano dos chunks
- **Perlin Noise** – Geração procedural de terreno
- HTML5 + CSS3

---

## Como executar

```bash
  git clone https://github.com/otavio-rb/voxel.js.git
  cd voxel.js
  npm i
  npm run dev
```