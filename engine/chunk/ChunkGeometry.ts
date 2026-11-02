import blockSides from '../blocks/blockSides';
import { ChunkBorders, ChunkDataResult, ChunkLightBorders, ChunkWaterBorders, FaceCorner, FaceLabel } from '../types';
import { blockRegistry } from '../blocks/BlockRegistry';

export default class ChunkGeometry {
  private opaquePositions: number[] = [];
  private opaqueNormals:   number[] = [];
  private opaqueUvs:       number[] = [];
  private opaqueColors:    number[] = [];
  private opaqueAo:        number[] = [];
  private opaqueLight:     number[] = [];
  private opaqueVertices:  number[] = [];

  private waterPositions: number[] = [];
  private waterNormals:   number[] = [];
  private waterUvs:       number[] = [];
  private waterColors:    number[] = [];
  private waterAo:        number[] = [];
  private waterLight:     number[] = [];
  private waterVertices:  number[] = [];

  /** Packed light of this chunk (sky << 4 | block); undefined means fully sky-lit. */
  private readonly light?: Uint8Array;
  private readonly lightBorders: ChunkLightBorders;
  private readonly waterBorders: ChunkWaterBorders;
  private readonly greedyMeshing: boolean;

  constructor(
    chunkData: ChunkDataResult,
    neighbourBorderBlocks: ChunkBorders = {},
    light?: Uint8Array,
    neighbourBorderLight: ChunkLightBorders = {},
    neighbourBorderWaterLevels: ChunkWaterBorders = {},
    greedyMeshing: boolean = true
  ) {
    this.light = light;
    this.lightBorders = neighbourBorderLight;
    this.waterBorders = neighbourBorderWaterLevels;
    this.greedyMeshing = greedyMeshing;
    this.buildGreedy(chunkData, neighbourBorderBlocks);
  }

  // ─── Helpers ─────────────────────────────────────────────────────────────

  private getNeighbourBlock(
      nx: number, ny: number, nz: number,
      blocks: Int16Array,
      borders: ChunkBorders,
      startX: number, startY: number, startZ: number,
      size: number
  ): number {
    const lx = nx - startX;
    const ly = ny - startY;
    const lz = nz - startZ;

    if (lx >= 0 && lx < size && ly >= 0 && ly < size && lz >= 0 && lz < size) {
      return blocks[ly * size * size + lz * size + lx];
    }
    if (lx === -1   && borders.negX && ly >= 0 && ly < size && lz >= 0 && lz < size) return borders.negX[ly * size + lz];
    if (lx === size && borders.posX && ly >= 0 && ly < size && lz >= 0 && lz < size) return borders.posX[ly * size + lz];
    if (ly === -1   && borders.negY && lx >= 0 && lx < size && lz >= 0 && lz < size) return borders.negY[lz * size + lx];
    if (ly === size && borders.posY && lx >= 0 && lx < size && lz >= 0 && lz < size) return borders.posY[lz * size + lx];
    if (lz === -1   && borders.negZ && lx >= 0 && lx < size && ly >= 0 && ly < size) return borders.negZ[ly * size + lx];
    if (lz === size && borders.posZ && lx >= 0 && lx < size && ly >= 0 && ly < size) return borders.posZ[ly * size + lx];
    return -1;
  }

  /** Water level (0-255) at a cell, reading neighbor border slices; 255 when unknown. */
  private getNeighbourWaterLevel(
      wx: number, wy: number, wz: number,
      waterLevels: Uint8Array | undefined,
      startX: number, startY: number, startZ: number,
      size: number
  ): number {
    const lx = wx - startX, ly = wy - startY, lz = wz - startZ;
    const inX = lx >= 0 && lx < size, inY = ly >= 0 && ly < size, inZ = lz >= 0 && lz < size;
    if (inX && inY && inZ) return waterLevels ? waterLevels[ly * size * size + lz * size + lx] : 255;
    const b = this.waterBorders;
    if (lx === -1   && inY && inZ && b.negX) return b.negX[ly * size + lz];
    if (lx === size && inY && inZ && b.posX) return b.posX[ly * size + lz];
    if (ly === -1   && inX && inZ && b.negY) return b.negY[lz * size + lx];
    if (ly === size && inX && inZ && b.posY) return b.posY[lz * size + lx];
    if (lz === -1   && inX && inY && b.negZ) return b.negZ[ly * size + lx];
    if (lz === size && inX && inY && b.posZ) return b.posZ[ly * size + lx];
    return 255;
  }

  private getCornerWaterHeight(
    cx: number, cy: number, cz: number,
    blocks: Int16Array,
    waterLevels: Uint8Array | undefined,
    borders: ChunkBorders,
    startX: number, startY: number, startZ: number,
    size: number
  ): number {
    let sum = 0;
    let count = 0;

    const cells = [
      [cx - 1, cz - 1],
      [cx,     cz - 1],
      [cx - 1, cz],
      [cx,     cz]
    ];

    for (const [x, z] of cells) {
      const blockAbove = this.getNeighbourBlock(x, cy + 1, z, blocks, borders, startX, startY, startZ, size);
      if (blockRegistry.isFluid(blockAbove)) {
        return 1.0;
      }

      const b = this.getNeighbourBlock(x, cy, z, blocks, borders, startX, startY, startZ, size);
      if (blockRegistry.isFluid(b)) {
        const level = this.getNeighbourWaterLevel(x, cy, z, waterLevels, startX, startY, startZ, size) / 255.0;
        sum += Math.max(0.12, level * 0.90);
        count++;
      }
    }

    return count > 0 ? (sum / count) : 0.88;
  }

  private isSolid(
      nx: number, ny: number, nz: number,
      blocks: Int16Array, borders: ChunkBorders,
      startX: number, startY: number, startZ: number, size: number
  ): number {
    const t = this.getNeighbourBlock(nx, ny, nz, blocks, borders, startX, startY, startZ, size);
    return blockRegistry.isSolid(t) ? 1 : 0;
  }

  private vertexAO(side1: number, side2: number, corner: number): number {
    if (side1 && side2) return 0;
    return 3 - (side1 + side2 + corner);
  }

  private getAOValues(
      x: number, y: number, z: number,
      dir: [number, number, number],
      corners: any[],
      blocks: Int16Array, borders: ChunkBorders,
      startX: number, startY: number, startZ: number, size: number
  ): number[] {
    const axis  = dir.indexOf(dir.find(d => d !== 0)!);
    const perp1 = (axis + 1) % 3;
    const perp2 = (axis + 2) % 3;
    const aoValues: number[] = [];

    for (const corner of corners) {
      const cpos = corner.pos;
      const o1 = [0, 0, 0];
      const o2 = [0, 0, 0];
      o1[perp1] = cpos[perp1] === 0 ? -1 : 1;
      o2[perp2] = cpos[perp2] === 0 ? -1 : 1;

      const s1 = this.isSolid(x+dir[0]+o1[0], y+dir[1]+o1[1], z+dir[2]+o1[2], blocks, borders, startX, startY, startZ, size);
      const s2 = this.isSolid(x+dir[0]+o2[0], y+dir[1]+o2[1], z+dir[2]+o2[2], blocks, borders, startX, startY, startZ, size);
      const sc = this.isSolid(x+dir[0]+o1[0]+o2[0], y+dir[1]+o1[1]+o2[1], z+dir[2]+o1[2]+o2[2], blocks, borders, startX, startY, startZ, size);
      aoValues.push(this.vertexAO(s1, s2, sc));
    }
    return aoValues;
  }

  /** Packed light at a cell, reading neighbor border slices; -1 when unknown. */
  private getLight(
      nx: number, ny: number, nz: number,
      startX: number, startY: number, startZ: number, size: number
  ): number {
    if (!this.light) return 0xf0;
    const lx = nx - startX, ly = ny - startY, lz = nz - startZ;
    const inX = lx >= 0 && lx < size, inY = ly >= 0 && ly < size, inZ = lz >= 0 && lz < size;
    if (inX && inY && inZ) return this.light[ly * size * size + lz * size + lx];
    const b = this.lightBorders;
    if (lx === -1   && inY && inZ && b.negX) return b.negX[ly * size + lz];
    if (lx === size && inY && inZ && b.posX) return b.posX[ly * size + lz];
    if (ly === -1   && inX && inZ && b.negY) return b.negY[lz * size + lx];
    if (ly === size && inX && inZ && b.posY) return b.posY[lz * size + lx];
    if (lz === -1   && inX && inY && b.negZ) return b.negZ[ly * size + lx];
    if (lz === size && inX && inY && b.posZ) return b.posZ[ly * size + lx];
    return -1;
  }

  private isLightBlocker(
      nx: number, ny: number, nz: number,
      blocks: Int16Array, borders: ChunkBorders,
      startX: number, startY: number, startZ: number, size: number
  ): boolean {
    const t = this.getNeighbourBlock(nx, ny, nz, blocks, borders, startX, startY, startZ, size);
    return blockRegistry.getLightOpacity(t) >= 15;
  }

  /**
   * Smooth lighting per corner: average of the cell in front of the face and the (up to three)
   * cells around that corner, skipping opaque or unknown cells. Values are in quarter-levels
   * (0-60) packed as sky << 8 | block, so equal corners can be greedy-merged.
   */
  private getLightValues(
      x: number, y: number, z: number,
      dir: [number, number, number],
      corners: any[],
      blocks: Int16Array, borders: ChunkBorders,
      startX: number, startY: number, startZ: number, size: number
  ): number[] {
    const axis  = dir.indexOf(dir.find(d => d !== 0)!);
    const perp1 = (axis + 1) % 3;
    const perp2 = (axis + 2) % 3;
    const fx = x + dir[0], fy = y + dir[1], fz = z + dir[2];

    let front = this.getLight(fx, fy, fz, startX, startY, startZ, size);
    if (front < 0) front = 0xf0; // vizinho não carregado: assume céu aberto para não escurecer bordas

    const values: number[] = [];
    for (const corner of corners) {
      const o1 = [0, 0, 0];
      const o2 = [0, 0, 0];
      o1[perp1] = corner.pos[perp1] === 0 ? -1 : 1;
      o2[perp2] = corner.pos[perp2] === 0 ? -1 : 1;

      let sky = front >> 4, blk = front & 0x0f, count = 1;
      const sample = (dx: number, dy: number, dz: number): boolean => {
        const px = fx + dx, py = fy + dy, pz = fz + dz;
        if (this.isLightBlocker(px, py, pz, blocks, borders, startX, startY, startZ, size)) return false;
        const l = this.getLight(px, py, pz, startX, startY, startZ, size);
        if (l < 0) return true;
        sky += l >> 4; blk += l & 0x0f; count++;
        return true;
      };
      const open1 = sample(o1[0], o1[1], o1[2]);
      const open2 = sample(o2[0], o2[1], o2[2]);
      if (open1 || open2) sample(o1[0] + o2[0], o1[1] + o2[1], o1[2] + o2[2]);

      values.push((Math.round(sky * 4 / count) << 8) | Math.round(blk * 4 / count));
    }
    return values;
  }

  // ─── Meshing (Greedy & Naive) ──────────────────────────────────────────

  private isFaceVisible(
    type: number,
    nType: number,
    label: FaceLabel,
    wx: number,
    wy: number,
    wz: number,
    lx: number,
    ly: number,
    lz: number,
    chunkData: ChunkDataResult,
    startX: number,
    startY: number,
    startZ: number,
    size: number
  ): boolean {
    const isFluidBlock = blockRegistry.isFluid(type);
    if (isFluidBlock) {
      if (label === 'top') {
        return nType !== type;
      } else if (label === 'bottom') {
        return blockRegistry.isAir(nType);
      } else {
        if (blockRegistry.isAir(nType)) {
          return true;
        } else if (nType === type) {
          const myLvl = chunkData.waterLevels ? chunkData.waterLevels[ly * size * size + lz * size + lx] : 255;
          const nLvl = this.getNeighbourWaterLevel(wx, wy, wz, chunkData.waterLevels, startX, startY, startZ, size);
          return myLvl > nLvl + 20;
        } else if (blockRegistry.isFluid(nType)) {
          return true;
        }
        return false;
      }
    } else {
      if (blockRegistry.isAir(nType)) return true;
      if (blockRegistry.isFluid(nType) && blockRegistry.isTransparent(nType)) return true;
      if (blockRegistry.isTransparent(nType) && nType !== type) return true;
      return false;
    }
  }

  private emitQuad(
    chunkData: ChunkDataResult,
    borders: ChunkBorders,
    size: number,
    start: number[],
    axis: number,
    u: number,
    v: number,
    i: number,
    j: number,
    k: number,
    w: number,
    h: number,
    type: number,
    dir: [number, number, number],
    corners: FaceCorner[],
    aoVals: ArrayLike<number>,
    lightVals: ArrayLike<number>
  ): void {
    const isWater = blockRegistry.isFluid(type);
    const tPos  = isWater ? this.waterPositions : this.opaquePositions;
    const tNorm = isWater ? this.waterNormals   : this.opaqueNormals;
    const tCol  = isWater ? this.waterColors    : this.opaqueColors;
    const tUv   = isWater ? this.waterUvs       : this.opaqueUvs;
    const tVtx  = isWater ? this.waterVertices  : this.opaqueVertices;
    const tAo   = isWater ? this.waterAo        : this.opaqueAo;
    const tLight = isWater ? this.waterLight    : this.opaqueLight;

    const baseIdx = tPos.length / 3;
    const color = blockRegistry.getColor(type);
    const cr = ((color >> 16) & 0xff) / 255;
    const cg = ((color >>  8) & 0xff) / 255;
    const cb = ( color        & 0xff) / 255;
    const blockLum = blockRegistry.getLightEmission(type);
    const blockEmissive = blockLum > 0 ? (blockLum / 15.0) : 0.0;
    const surfaceTypeId = blockRegistry.getSurfaceTypeId(type);

    for (let vi = 0; vi < 4; vi++) {
      const { pos: cp } = corners[vi];
      const fc = [0, 0, 0];
      fc[axis] = start[axis] + i + cp[axis];
      fc[u]    = start[u]    + j + cp[u] * h;
      fc[v]    = start[v]    + k + cp[v] * w;

      if (isWater && chunkData.waterLevels) {
        const curLx = (axis === 0 ? i : u === 0 ? j : k);
        const curLy = (axis === 1 ? i : u === 1 ? j : k);
        const curLz = (axis === 2 ? i : u === 2 ? j : k);

        const wbx = start[0] + curLx;
        const wby = start[1] + curLy;
        const wbz = start[2] + curLz;

        if (cp[1] === 1) {
          const cornerH = this.getCornerWaterHeight(
            wbx + cp[0], wby, wbz + cp[2],
            chunkData.blocks, chunkData.waterLevels, borders,
            chunkData.startX, chunkData.startY, chunkData.startZ, size
          );
          fc[1] = wby + cornerH;
        } else {
          fc[1] = wby;
        }
      }

      tPos.push(fc[0], fc[1], fc[2]);
      tNorm.push(dir[0], dir[1], dir[2]);
      tCol.push(cr, cg, cb);
      tUv.push(isWater ? 0.0 : blockEmissive, surfaceTypeId);
      tAo.push(aoVals[vi] / 3.0);
      tLight.push((lightVals[vi] >> 8) / 60, (lightVals[vi] & 0xff) / 60);
    }

    if (aoVals[0] + aoVals[3] > aoVals[1] + aoVals[2]) {
      tVtx.push(baseIdx, baseIdx+1, baseIdx+2, baseIdx+2, baseIdx+1, baseIdx+3);
    } else {
      tVtx.push(baseIdx, baseIdx+1, baseIdx+3, baseIdx, baseIdx+3, baseIdx+2);
    }
  }

  private buildGreedy(chunkData: ChunkDataResult, borders: ChunkBorders): void {
    const { blocks, startX, startY, startZ, endX } = chunkData;
    const size  = endX - startX;
    const start = [startX, startY, startZ];

    for (const sideDef of blockSides) {
      const { dir, corners, label } = sideDef;

      const axis = dir.indexOf(dir.find(d => d !== 0)!);
      const u    = (axis + 1) % 3;
      const v    = (axis + 2) % 3;

      // Se greedy meshing estiver desligado, pulamos a alocação de máscaras e a Pass 2.
      const mask   = this.greedyMeshing ? new Int32Array(size * size) : null;
      const aoMask = this.greedyMeshing ? new Uint8Array(size * size * 4) : null;
      const lightMask = this.greedyMeshing ? new Uint16Array(size * size * 4) : null;

      // Sweep layers along the primary axis (i = local coord on `axis`)
      for (let i = 0; i < size; i++) {

        // ── Fast path: Naive meshing (1 quad direto por face exposta) ────────
        if (!this.greedyMeshing) {
          for (let j = 0; j < size; j++) {
            for (let k = 0; k < size; k++) {
              const lc = [0, 0, 0];
              lc[axis] = i; lc[u] = j; lc[v] = k;
              const lx = lc[0], ly = lc[1], lz = lc[2];

              const type = blocks[ly * size * size + lz * size + lx];
              if (blockRegistry.isAir(type) || blockRegistry.isCrossMesh(type)) continue;

              const wx = start[0] + lx + dir[0];
              const wy = start[1] + ly + dir[1];
              const wz = start[2] + lz + dir[2];
              const nType = this.getNeighbourBlock(wx, wy, wz, blocks, borders, startX, startY, startZ, size);

              if (!this.isFaceVisible(type, nType, label, wx, wy, wz, lx, ly, lz, chunkData, startX, startY, startZ, size)) {
                continue;
              }

              const ao = this.getAOValues(
                start[0] + lx, start[1] + ly, start[2] + lz,
                dir as any, corners, blocks, borders, startX, startY, startZ, size
              );
              const lv = this.getLightValues(
                start[0] + lx, start[1] + ly, start[2] + lz,
                dir as any, corners, blocks, borders, startX, startY, startZ, size
              );

              this.emitQuad(
                chunkData, borders, size, start,
                axis, u, v, i, j, k, 1, 1,
                type, dir as any, corners, ao, lv
              );
            }
          }
          continue;
        }

        // ── Greedy path: Pass 1 (Build visibility mask) ─────────────────────
        for (let j = 0; j < size; j++) {
          for (let k = 0; k < size; k++) {
            const lc = [0, 0, 0];
            lc[axis] = i; lc[u] = j; lc[v] = k;
            const lx = lc[0], ly = lc[1], lz = lc[2];

            const type = blocks[ly * size * size + lz * size + lx];

            if (blockRegistry.isAir(type) || blockRegistry.isCrossMesh(type)) {
              mask![j * size + k] = 0;
              continue;
            }

            const wx = start[0] + lx + dir[0];
            const wy = start[1] + ly + dir[1];
            const wz = start[2] + lz + dir[2];
            const nType = this.getNeighbourBlock(wx, wy, wz, blocks, borders, startX, startY, startZ, size);

            if (this.isFaceVisible(type, nType, label, wx, wy, wz, lx, ly, lz, chunkData, startX, startY, startZ, size)) {
              mask![j * size + k] = type + 1;
              const ao = this.getAOValues(
                start[0] + lx, start[1] + ly, start[2] + lz,
                dir as any, corners, blocks, borders, startX, startY, startZ, size
              );
              const mb = (j * size + k) * 4;
              aoMask![mb] = ao[0]; aoMask![mb+1] = ao[1]; aoMask![mb+2] = ao[2]; aoMask![mb+3] = ao[3];
              const lv = this.getLightValues(
                start[0] + lx, start[1] + ly, start[2] + lz,
                dir as any, corners, blocks, borders, startX, startY, startZ, size
              );
              lightMask![mb] = lv[0]; lightMask![mb+1] = lv[1]; lightMask![mb+2] = lv[2]; lightMask![mb+3] = lv[3];
            } else {
              mask![j * size + k] = 0;
            }
          }
        }

        // ── Greedy path: Pass 2 (Greedy expansion) ──────────────────────────
        for (let j = 0; j < size; j++) {
          for (let k = 0; k < size; k++) {
            const mIdx = j * size + k;
            const tpo  = mask![mIdx];
            if (tpo === 0) continue;

            const type = tpo - 1;
            const mb   = mIdx * 4;
            const ao0  = aoMask![mb], ao1 = aoMask![mb+1], ao2 = aoMask![mb+2], ao3 = aoMask![mb+3];
            const l0   = lightMask![mb], l1 = lightMask![mb+1], l2 = lightMask![mb+2], l3 = lightMask![mb+3];
            const sameShade = (nb: number) =>
              aoMask![nb] === ao0 && aoMask![nb+1] === ao1 && aoMask![nb+2] === ao2 && aoMask![nb+3] === ao3 &&
              lightMask![nb] === l0 && lightMask![nb+1] === l1 && lightMask![nb+2] === l2 && lightMask![nb+3] === l3;

            const isWater = blockRegistry.isFluid(type);
            const canGreedy = !isWater || !chunkData.waterLevels;
            let w = 1;
            if (canGreedy) {
              while (k + w < size) {
                const ni = j * size + (k + w);
                if (mask![ni] !== tpo) break;
                if (!sameShade(ni * 4)) break;
                w++;
              }
            }

            let h = 1;
            if (canGreedy) {
              outer: while (j + h < size) {
                for (let dw = 0; dw < w; dw++) {
                  const ni = (j + h) * size + (k + dw);
                  if (mask![ni] !== tpo) break outer;
                  if (!sameShade(ni * 4)) break outer;
                }
                h++;
              }
            }

            this.emitQuad(
              chunkData, borders, size, start,
              axis, u, v, i, j, k, w, h,
              type, dir as any, corners,
              [ao0, ao1, ao2, ao3],
              [l0, l1, l2, l3]
            );

            // Consume this rectangle from the mask
            for (let dh = 0; dh < h; dh++) {
              for (let dw = 0; dw < w; dw++) {
                mask![(j + dh) * size + (k + dw)] = 0;
              }
            }
          }
        }
      } // end layer sweep
    } // end face directions

    // ── Pass 3: Custom sub-voxel models registered via BlockConfig.meshBuilder ──
    this.buildMicrovoxelMeshes(chunkData, borders);
  }

  private addMicroBox(
    x0: number, y0: number, z0: number,
    x1: number, y1: number, z1: number,
    r: number, g: number, b: number,
    skyLight: number,
    blkLight: number = 0,
    emissive: number = 0,
    surfaceTypeId: number = 0
  ): void {
    const baseIdx = this.opaquePositions.length / 3;

    // 6 faces: Top (+Y), Bottom (-Y), Front (+Z), Back (-Z), Right (+X), Left (-X)
    const pos = [
      // Top (+Y)
      x0, y1, z1,  x1, y1, z1,  x0, y1, z0,  x1, y1, z0,
      // Bottom (-Y)
      x0, y0, z0,  x1, y0, z0,  x0, y0, z1,  x1, y0, z1,
      // Front (+Z)
      x0, y0, z1,  x1, y0, z1,  x0, y1, z1,  x1, y1, z1,
      // Back (-Z)
      x1, y0, z0,  x0, y0, z0,  x1, y1, z0,  x0, y1, z0,
      // Right (+X)
      x1, y0, z1,  x1, y0, z0,  x1, y1, z1,  x1, y1, z0,
      // Left (-X)
      x0, y0, z0,  x0, y0, z1,  x0, y1, z0,  x0, y1, z1,
    ];

    const norms = [
      // Top
      0, 1, 0,   0, 1, 0,   0, 1, 0,   0, 1, 0,
      // Bottom
      0, -1, 0,  0, -1, 0,  0, -1, 0,  0, -1, 0,
      // Front
      0, 0, 1,   0, 0, 1,   0, 0, 1,   0, 0, 1,
      // Back
      0, 0, -1,  0, 0, -1,  0, 0, -1,  0, 0, -1,
      // Right
      1, 0, 0,   1, 0, 0,   1, 0, 0,   1, 0, 0,
      // Left
      -1, 0, 0,  -1, 0, 0,  -1, 0, 0,  -1, 0, 0,
    ];

    for (let i = 0; i < 24; i++) {
      this.opaquePositions.push(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]);
      this.opaqueNormals.push(norms[i * 3], norms[i * 3 + 1], norms[i * 3 + 2]);
      this.opaqueUvs.push(emissive, surfaceTypeId);
      this.opaqueColors.push(r, g, b);
      this.opaqueAo.push(1.0);
      this.opaqueLight.push(skyLight, blkLight);
    }

    for (let f = 0; f < 6; f++) {
      const fi = baseIdx + f * 4;
      this.opaqueVertices.push(
        fi, fi + 1, fi + 2,
        fi + 1, fi + 3, fi + 2
      );
    }
  }

  private buildMicrovoxelMeshes(chunkData: ChunkDataResult, borders: ChunkBorders): void {
    const { blocks, startX, startY, startZ, endX } = chunkData;
    const size = endX - startX;

    for (let ly = 0; ly < size; ly++) {
      const wy = startY + ly;
      for (let lz = 0; lz < size; lz++) {
        const wz = startZ + lz;
        for (let lx = 0; lx < size; lx++) {
          const type = blocks[ly * size * size + lz * size + lx];
          if (type < 0 || !blockRegistry.isMicrovoxel(type)) continue;

          const wx = startX + lx;
          const lSelf = this.getLight(wx, wy, wz, startX, startY, startZ, size);
          const lUp   = this.getLight(wx, wy + 1, wz, startX, startY, startZ, size);
          const lDown = this.getLight(wx, wy - 1, wz, startX, startY, startZ, size);

          let rawSky = 0;
          let rawBlk = 0;
          if (lSelf >= 0) {
            rawSky = Math.max(rawSky, lSelf >> 4);
            rawBlk = Math.max(rawBlk, lSelf & 0x0f);
          }
          if (lUp >= 0) {
            rawSky = Math.max(rawSky, lUp >> 4);
            rawBlk = Math.max(rawBlk, lUp & 0x0f);
          }
          if (lDown >= 0) {
            rawSky = Math.max(rawSky, lDown >> 4);
            rawBlk = Math.max(rawBlk, lDown & 0x0f);
          }
          if (lSelf < 0 && lUp < 0 && lDown < 0) {
            rawSky = 15;
          }

          const lum = blockRegistry.getLightEmission(type);
          if (lum > 0) {
            rawBlk = Math.max(rawBlk, lum);
          }

          const skyLight = Math.min(1.0, Math.max(0.0, rawSky / 15.0));
          const blkLight = Math.min(1.0, Math.max(0.0, rawBlk / 15.0));
          const emissive = lum > 0 ? Math.min(1.0, lum / 15.0) : 0.0;
          const surfaceTypeId = blockRegistry.getSurfaceTypeId(type);

          const builder = blockRegistry.getMeshBuilder(type);
          if (builder) {
            builder({
              wx,
              wy,
              wz,
              skyLight,
              blkLight,
              emissive,
              getNeighbourBlock: (nx, ny, nz) =>
                this.getNeighbourBlock(nx, ny, nz, blocks, borders, startX, startY, startZ, size),
              addBox: (x0, y0, z0, x1, y1, z1, r, g, b, boxEmissive = emissive) =>
                this.addMicroBox(
                  wx + x0, wy + y0, wz + z0,
                  wx + x1, wy + y1, wz + z1,
                  r, g, b,
                  skyLight, blkLight, boxEmissive, surfaceTypeId
                )
            });
          } else {
            // Generic fallback sub-voxel box when no custom meshBuilder is registered
            const color = blockRegistry.getColor(type);
            const cr = ((color >> 16) & 0xff) / 255;
            const cg = ((color >>  8) & 0xff) / 255;
            const cb = ( color        & 0xff) / 255;
            this.addMicroBox(
              wx + 0.28, wy, wz + 0.28,
              wx + 0.72, wy + 0.52, wz + 0.72,
              cr, cg, cb,
              skyLight, blkLight, emissive, surfaceTypeId
            );
          }
        }
      }
    }
  }

  // ─── Output ───────────────────────────────────────────────────────────────

  getData() {
    return {
      opaque: {
        positions:    new Float32Array(this.opaquePositions),
        normals:      new Float32Array(this.opaqueNormals),
        uvs:          new Float32Array(this.opaqueUvs),
        colors:       new Float32Array(this.opaqueColors),
        ao:           new Float32Array(this.opaqueAo),
        light:        new Float32Array(this.opaqueLight),
        isWater:      new Float32Array(this.opaquePositions.length / 3).fill(0.0),
        creationTime: new Float32Array(this.opaquePositions.length / 3).fill(0.0),
        vertices:     new Uint32Array(this.opaqueVertices),
      },
      water: {
        positions:    new Float32Array(this.waterPositions),
        normals:      new Float32Array(this.waterNormals),
        uvs:          new Float32Array(this.waterUvs),
        colors:       new Float32Array(this.waterColors),
        ao:           new Float32Array(this.waterAo),
        light:        new Float32Array(this.waterLight),
        isWater:      new Float32Array(this.waterPositions.length / 3).fill(1.0),
        creationTime: new Float32Array(this.waterPositions.length / 3).fill(0.0),
        vertices:     new Uint32Array(this.waterVertices),
      }
    };
  }
}
