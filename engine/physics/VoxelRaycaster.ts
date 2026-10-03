import { Vector3 } from 'three';
import { blockRegistry } from '../blocks/BlockRegistry';

export interface VoxelRaycastHit {
  hit: boolean;
  /** Coordenadas inteiras exatas do bloco atingido no grid */
  blockPos: Vector3;
  /** Normal da face atingida (ex: [0, 1, 0] para topo, [0, -1, 0] para fundo) */
  faceNormal: Vector3;
  /** Ponto de intersecção exato no espaço 3D */
  point: Vector3;
  /** ID do tipo de bloco atingido */
  blockType: number;
  /** Distância da origem até o ponto de impacto */
  distance: number;
}

export interface VoxelWorldReader {
  getBlock(x: number, y: number, z: number): number;
}

/**
 * Algoritmo DDA (Digital Differential Analyzer) 3D rápido para raycasting em grids voxel (Amanatides & Woo).
 * Executa em O(passos) em tempo constante, sem criar arrays de meshes nem testar triângulos poligonais.
 */
export function raycastVoxel(
  world: VoxelWorldReader,
  origin: Vector3,
  direction: Vector3,
  maxDistance: number = 8,
  isSolidPredicate: (type: number) => boolean = (t) => blockRegistry.isInteractable(t)
): VoxelRaycastHit | null {
  // Posição inicial no grid
  let x = Math.floor(origin.x);
  let y = Math.floor(origin.y);
  let z = Math.floor(origin.z);

  const dx = direction.x;
  const dy = direction.y;
  const dz = direction.z;

  const stepX = dx > 0 ? 1 : dx < 0 ? -1 : 0;
  const stepY = dy > 0 ? 1 : dy < 0 ? -1 : 0;
  const stepZ = dz > 0 ? 1 : dz < 0 ? -1 : 0;

  const tDeltaX = stepX !== 0 ? Math.abs(1 / dx) : Infinity;
  const tDeltaY = stepY !== 0 ? Math.abs(1 / dy) : Infinity;
  const tDeltaZ = stepZ !== 0 ? Math.abs(1 / dz) : Infinity;

  let tMaxX = stepX > 0 ? (x + 1 - origin.x) * tDeltaX : (origin.x - x) * tDeltaX;
  let tMaxY = stepY > 0 ? (y + 1 - origin.y) * tDeltaY : (origin.y - y) * tDeltaY;
  let tMaxZ = stepZ > 0 ? (z + 1 - origin.z) * tDeltaZ : (origin.z - z) * tDeltaZ;

  let normalX = 0;
  let normalY = 0;
  let normalZ = 0;
  let distance = 0;

  const maxSteps = Math.ceil(maxDistance * 3);

  for (let i = 0; i < maxSteps; i++) {
    const block = world.getBlock(x, y, z);
    if (block !== -1 && isSolidPredicate(block)) {
      const point = new Vector3(
        origin.x + direction.x * distance,
        origin.y + direction.y * distance,
        origin.z + direction.z * distance
      );

      return {
        hit: true,
        blockPos: new Vector3(x, y, z),
        faceNormal: new Vector3(normalX, normalY, normalZ),
        point,
        blockType: block,
        distance
      };
    }

    if (tMaxX < tMaxY) {
      if (tMaxX < tMaxZ) {
        distance = tMaxX;
        if (distance > maxDistance) break;
        x += stepX;
        tMaxX += tDeltaX;
        normalX = -stepX;
        normalY = 0;
        normalZ = 0;
      } else {
        distance = tMaxZ;
        if (distance > maxDistance) break;
        z += stepZ;
        tMaxZ += tDeltaZ;
        normalX = 0;
        normalY = 0;
        normalZ = -stepZ;
      }
    } else {
      if (tMaxY < tMaxZ) {
        distance = tMaxY;
        if (distance > maxDistance) break;
        y += stepY;
        tMaxY += tDeltaY;
        normalX = 0;
        normalY = -stepY;
        normalZ = 0;
      } else {
        distance = tMaxZ;
        if (distance > maxDistance) break;
        z += stepZ;
        tMaxZ += tDeltaZ;
        normalX = 0;
        normalY = 0;
        normalZ = -stepZ;
      }
    }
  }

  return null;
}
