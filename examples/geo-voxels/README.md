# Geo-Voxels (Real-World Voxel Explorer)

Exemplo de exploração de mapas do mundo real construídos proceduralmente em voxels a partir de dados geográficos abertos (**OpenStreetMap** e **Modelos Digitais de Elevação**).

## Destaques

- **Escala 1:1:** 1 bloco voxel = 1 metro real.
- **Topografia e Relevo:** Inclinação de terreno e altitude real sobre o nível do mar.
- **Estruturas do OpenStreetMap:** Extração de polígonos de prédios, alturas e traçado de ruas.
- **Vão Livre do MASP:** Reconstrução com o vão livre icônico aberto e os 4 pilares vermelhos estruturais.
- **Desacoplado:** Totalmente independente do exemplo `game/`, utilizando apenas a API pública do `@voxel/engine`.

## Como executar

Inicie o servidor Vite:
```bash
npm run dev
```

Abra no navegador:
```
http://localhost:5175/examples/geo-voxels/
```

## Como carregar outros locais

Você pode usar o utilitário incluído na raiz:
```bash
node scripts/fetch-geo.mjs --lat=-22.9519 --lon=-43.2105 --name=cristo --radius=350
```
O script baixará os dados do OpenStreetMap e gerará o arquivo pronto para ser consumido pelo gerador.

