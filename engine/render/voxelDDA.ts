/**
 * Referencia em JS do DDA de voxel que o shader de raymarch executa.
 *
 * Existe para ser testavel. O shader (`VoxelRaymarch.ts`) e uma transcricao linha a linha
 * desta funcao para GLSL; a aritmetica de travessia e de normal pode ser verificada aqui, em
 * Node, sem GPU e sem olhar para a tela. O que sobra de risco no shader e o encanamento
 * (formato de textura, versao de GLSL, composicao por depth), nao o algoritmo.
 *
 * Amanatides & Woo, "A Fast Voxel Traversal Algorithm for Ray Tracing" (1987).
 */

export interface VoxelDDAHit {
  /** Voxel atingido, em coordenadas locais do volume. */
  voxel: [number, number, number];
  /** Normal da face por onde o raio entrou no voxel. */
  normal: [number, number, number];
  /** Distancia ao longo do raio, do origem dado ate a face atingida. */
  distance: number;
  /** Quantos passos de DDA foram gastos. */
  steps: number;
}

/**
 * Intersecao de um raio com a caixa [0,size]^3 pelo teste de slabs.
 *
 * Retorna [tEnter, tExit, eixoDeEntrada]; tEnter < 0 quando a origem esta dentro, e nao ha
 * intersecao quando tExit < max(tEnter, 0). O eixo de entrada (0=X, 1=Y, 2=Z) sai daqui de
 * proposito: deduzi-lo depois exigiria comparar tEnter com os t de cada slab por igualdade
 * exata de float, que e justamente o tipo de teste que falha em raio rasante.
 */
export function clipRayToBox(
  ox: number, oy: number, oz: number,
  dx: number, dy: number, dz: number,
  size: number
): [number, number, number] {
  // 1/0 da Infinity com sinal, e os min/max abaixo lidam com isso corretamente: e o
  // comportamento que se quer para um raio paralelo a um eixo.
  const invX = 1 / dx, invY = 1 / dy, invZ = 1 / dz;

  const t1x = (0 - ox) * invX, t2x = (size - ox) * invX;
  const t1y = (0 - oy) * invY, t2y = (size - oy) * invY;
  const t1z = (0 - oz) * invZ, t2z = (size - oz) * invZ;

  const nearX = Math.min(t1x, t2x), nearY = Math.min(t1y, t2y), nearZ = Math.min(t1z, t2z);
  const tExit = Math.min(Math.max(t1x, t2x), Math.max(t1y, t2y), Math.max(t1z, t2z));

  let tEnter = nearX, axis = 0;
  if (nearY > tEnter) { tEnter = nearY; axis = 1; }
  if (nearZ > tEnter) { tEnter = nearZ; axis = 2; }
  return [tEnter, tExit, axis];
}

/**
 * Percorre o volume e devolve o primeiro voxel solido, ou null.
 *
 * `isSolid` recebe coordenadas locais inteiras. `maxSteps` existe para o shader nao ter laco
 * sem limite; num volume de lado S o DDA nunca passa de 3*S passos.
 */
export function traverseVoxels(
  ox: number, oy: number, oz: number,
  dx: number, dy: number, dz: number,
  size: number,
  isSolid: (x: number, y: number, z: number) => boolean,
  maxSteps = 3 * 64
): VoxelDDAHit | null {
  const [tEnter, tExit, entryAxis] = clipRayToBox(ox, oy, oz, dx, dy, dz, size);
  if (tExit < Math.max(tEnter, 0)) return null;

  // Entra na caixa; o episilon empurra para dentro da celula, senao o floor na face pode
  // cair no voxel de fora e o primeiro passo sai do volume.
  const t0 = Math.max(tEnter, 0);
  let px = ox + dx * t0, py = oy + dy * t0, pz = oz + dz * t0;

  let ix = Math.floor(px), iy = Math.floor(py), iz = Math.floor(pz);
  // Na face exata, floor devolve size; prende na ultima celula.
  if (ix < 0) ix = 0; else if (ix >= size) ix = size - 1;
  if (iy < 0) iy = 0; else if (iy >= size) iy = size - 1;
  if (iz < 0) iz = 0; else if (iz >= size) iz = size - 1;

  const stepX = dx > 0 ? 1 : -1, stepY = dy > 0 ? 1 : -1, stepZ = dz > 0 ? 1 : -1;
  const tDeltaX = Math.abs(1 / dx), tDeltaY = Math.abs(1 / dy), tDeltaZ = Math.abs(1 / dz);

  // Distancia ate o proximo plano de grade em cada eixo. ATENCAO: estes t sao medidos a
  // partir do ponto de ENTRADA (t0), nao da origem do raio. Toda distancia devolvida soma t0
  // de volta; esquecer isso faz o ponto de impacto cair fora do voxel atingido sempre que a
  // camera esta fora do volume.
  let tMaxX = (dx > 0 ? ix + 1 - px : px - ix) * tDeltaX;
  let tMaxY = (dy > 0 ? iy + 1 - py : py - iy) * tDeltaY;
  let tMaxZ = (dz > 0 ? iz + 1 - pz : pz - iz) * tDeltaZ;

  // Normal da face por onde o raio entrou na caixa, para o caso de o primeiro voxel ja ser
  // solido. Vem do eixo que o teste de slabs identificou.
  let nx = 0, ny = 0, nz = 0;
  if (tEnter > 0) {
    if (entryAxis === 0) nx = -stepX;
    else if (entryAxis === 1) ny = -stepY;
    else nz = -stepZ;
  }

  for (let step = 0; step < maxSteps; step++) {
    if (isSolid(ix, iy, iz)) {
      // t da face atingida: o tMax do eixo pelo qual entramos, menos seu delta.
      const relative = nx !== 0 ? tMaxX - tDeltaX
        : ny !== 0 ? tMaxY - tDeltaY
        : nz !== 0 ? tMaxZ - tDeltaZ
        : 0;
      const distance = t0 + relative;
      return {
        voxel: [ix, iy, iz],
        normal: [nx, ny, nz],
        distance: Math.max(t0, distance),
        steps: step
      };
    }

    // Avanca pelo eixo cujo plano de grade esta mais perto.
    if (tMaxX < tMaxY) {
      if (tMaxX < tMaxZ) { ix += stepX; tMaxX += tDeltaX; nx = -stepX; ny = 0; nz = 0; }
      else { iz += stepZ; tMaxZ += tDeltaZ; nx = 0; ny = 0; nz = -stepZ; }
    } else {
      if (tMaxY < tMaxZ) { iy += stepY; tMaxY += tDeltaY; nx = 0; ny = -stepY; nz = 0; }
      else { iz += stepZ; tMaxZ += tDeltaZ; nx = 0; ny = 0; nz = -stepZ; }
    }

    if (ix < 0 || ix >= size || iy < 0 || iy >= size || iz < 0 || iz >= size) return null;
  }
  return null;
}
