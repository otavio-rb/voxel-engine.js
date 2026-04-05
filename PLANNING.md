# Planejamento: Sistema de Colisão Baseado em Grid (O(1))

Implementar um sistema de colisão robusto e não-quadrático para o motor voxel. Como o mundo é uma grade, podemos alcançar complexidade **O(1)** por etapa de movimento.

## 1. Conceito da AABB (Axis-Aligned Bounding Box)
O jogador será representado por uma caixa delimitadora:
- **Largura/Profundidade:** 0.6 blocos.
- **Altura:** 1.8 blocos.

## 2. Resolução por Eixo (Axis-by-Axis)
Para garantir que o jogador nunca atravesse quinas (tunneling), atualizaremos cada componente da posição separadamente:
1.  Atualizar **X**, verificar colisão, resolver.
2.  Atualizar **Y**, verificar colisão, resolver.
3.  Atualizar **Z**, verificar colisão, resolver.

## 3. Busca de Blocos Solidificáveis (O(1))
Adicionaremos um método ao `ProceduralWorld` que permite verificar se uma coordenada `(x, y, z)` contém um bloco sólido. Isso será feito via `BlocksMap` do chunk correspondente, o que é uma operação de tempo constante.

## 4. Algoritmo de Física
- Implementar gravidade (`velocity.y`).
- Implementar atrito horizontal para paradas suaves.
- Verificar apenas os blocos nos cantos da AABB do jogador (máximo de 8-12 blocos por quadro).

## 5. Passos da Implementação
1.  **ProceduralWorld.ts**: Adicionar `getBlock(x, y, z)`.
2.  **Player.ts**: Implementar a função `checkCollision(newPos)` e a lógica de atualização com gravidade.

Este plano é eficiente porque não depende do número total de blocos ou de entidades na cena, apenas da geometria local do jogador.
