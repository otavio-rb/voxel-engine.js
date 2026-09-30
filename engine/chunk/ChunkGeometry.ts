import blockSides from '../blocks/blockSides';
import { ChunkBorders, ChunkDataResult, ChunkLightBorders, ChunkWaterBorders } from '../types';
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

  constructor(
    chunkData: ChunkDataResult,
    neighbourBorderBlocks: ChunkBorders = {},
    light?: Uint8Array,
    neighbourBorderLight: ChunkLightBorders = {},
    neighbourBorderWaterLevels: ChunkWaterBorders = {}
  ) {
    this.light = light;
    this.lightBorders = neighbourBorderLight;
    this.waterBorders = neighbourBorderWaterLevels;
    this.buildGreedy(chunkData, neighbourBorderBlocks);
  }

  // ─── Helpers ─────────────────────────────────────────────────────────────

  private getNeighbourBlock(
      nx: number, ny: number, nz: number,
      blocks: Int8Array,
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
    blocks: Int8Array,
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
      blocks: Int8Array, borders: ChunkBorders,
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
      blocks: Int8Array, borders: ChunkBorders,
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
      blocks: Int8Array, borders: ChunkBorders,
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
      blocks: Int8Array, borders: ChunkBorders,
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

  // ─── Greedy Meshing ───────────────────────────────────────────────────────

  private buildGreedy(chunkData: ChunkDataResult, borders: ChunkBorders): void {
    const { blocks, startX, startY, startZ, endX } = chunkData;
    const size  = endX - startX;
    // start[0]=startX, start[1]=startY, start[2]=startZ for indexed access
    const start = [startX, startY, startZ];

    for (const sideDef of blockSides) {
      const { dir, corners, label } = sideDef;

      // axis: the axis the face's normal points along (0=X, 1=Y, 2=Z)
      // j sweeps along u, k sweeps along v (the two face-plane axes)
      const axis = dir.indexOf(dir.find(d => d !== 0)!);
      const u    = (axis + 1) % 3;
      const v    = (axis + 2) % 3;

      // Reuse typed arrays across layers to avoid GC pressure
      const mask   = new Int32Array(size * size);  // typePlusOne per cell
      const aoMask = new Uint8Array(size * size * 4); // 4 AO values per cell
      const lightMask = new Uint16Array(size * size * 4); // 4 smooth-light values per cell

      // Sweep layers along the primary axis (i = local coord on `axis`)
      for (let i = 0; i < size; i++) {

        if (label === 'bottom' && start[1] + i === 0) continue;

        // ── Pass 1: Build visibility mask ─────────────────────────────────────
        for (let j = 0; j < size; j++) {
          for (let k = 0; k < size; k++) {
            // Reconstruct (lx, ly, lz) from (i, j, k) using axis mapping:
            //   localCoords[axis] = i,  localCoords[u] = j,  localCoords[v] = k
            // blocks[] is always stored as [ly * size² + lz * size + lx]
            const lc = [0, 0, 0];
            lc[axis] = i; lc[u] = j; lc[v] = k;
            const lx = lc[0], ly = lc[1], lz = lc[2];

            const type = blocks[ly * size * size + lz * size + lx];

            if (blockRegistry.isAir(type)) {
              mask[j * size + k] = 0;
              continue;
            }

            // Neighbour world-coords in the face direction
            const wx = start[0] + lx + dir[0];
            const wy = start[1] + ly + dir[1];
            const wz = start[2] + lz + dir[2];
            const nType = this.getNeighbourBlock(wx, wy, wz, blocks, borders, startX, startY, startZ, size);

            let visible = false;
            const isFluidBlock = blockRegistry.isFluid(type);
            if (isFluidBlock) {
              if (label === 'top') {
                if (nType !== type) visible = true;
              } else if (label === 'bottom') {
                if (blockRegistry.isAir(nType)) visible = true;
              } else {
                if (blockRegistry.isAir(nType)) {
                  visible = true;
                } else if (nType === type) {
                  const myLvl = chunkData.waterLevels ? chunkData.waterLevels[ly * size * size + lz * size + lx] : 255;
                  const nLvl = this.getNeighbourWaterLevel(wx, wy, wz, chunkData.waterLevels, startX, startY, startZ, size);
                  if (myLvl > nLvl + 20) {
                    visible = true;
                  }
                } else if (blockRegistry.isFluid(nType)) {
                  visible = true; // boundary between water and lava
                }
              }
            } else {
              // Solid block faces
              if (blockRegistry.isAir(nType)) visible = true;
              else if (blockRegistry.isFluid(nType) && blockRegistry.isTransparent(nType)) visible = true; // visible through transparent water
              else if (blockRegistry.isTransparent(nType) && nType !== type) visible = true;
              // solid→solid: culled ✅
            }

            if (visible) {
              mask[j * size + k] = type + 1; // +1 so Stone (0) ≠ empty sentinel
              const ao = this.getAOValues(
                start[0] + lx, start[1] + ly, start[2] + lz,
                dir as any, corners, blocks, borders, startX, startY, startZ, size
              );
              const mb = (j * size + k) * 4;
              aoMask[mb] = ao[0]; aoMask[mb+1] = ao[1]; aoMask[mb+2] = ao[2]; aoMask[mb+3] = ao[3];
              const lv = this.getLightValues(
                start[0] + lx, start[1] + ly, start[2] + lz,
                dir as any, corners, blocks, borders, startX, startY, startZ, size
              );
              lightMask[mb] = lv[0]; lightMask[mb+1] = lv[1]; lightMask[mb+2] = lv[2]; lightMask[mb+3] = lv[3];
            } else {
              mask[j * size + k] = 0;
            }
          }
        }

        // ── Pass 2: Greedy expansion ──────────────────────────────────────────
        for (let j = 0; j < size; j++) {
          for (let k = 0; k < size; k++) {
            const mIdx = j * size + k;
            const tpo  = mask[mIdx]; // type + 1
            if (tpo === 0) continue;

            const type = tpo - 1;
            const mb   = mIdx * 4;
            const ao0  = aoMask[mb], ao1 = aoMask[mb+1], ao2 = aoMask[mb+2], ao3 = aoMask[mb+3];
            const l0   = lightMask[mb], l1 = lightMask[mb+1], l2 = lightMask[mb+2], l3 = lightMask[mb+3];
            const sameShade = (nb: number) =>
              aoMask[nb] === ao0 && aoMask[nb+1] === ao1 && aoMask[nb+2] === ao2 && aoMask[nb+3] === ao3 &&
              lightMask[nb] === l0 && lightMask[nb+1] === l1 && lightMask[nb+2] === l2 && lightMask[nb+3] === l3;

            // Expand w along k (v-axis)
            // Water is intentionally NOT greedy-merged: the wave shader displaces
            // pos.y per-vertex using sin/cos. Merging water into large quads reduces
            // vertex density and the GPU's linear interpolation loses the wave shape
            // (a 32-unit quad has only 4 verts, missing all intermediate sine cycles).
            // Solid blocks have no per-vertex displacement so greedy is safe for them.
            const isWater = blockRegistry.isFluid(type);
            let w = 1;
            if (!isWater) {
              while (k + w < size) {
                const ni = j * size + (k + w);
                if (mask[ni] !== tpo) break;
                if (!sameShade(ni * 4)) break;
                w++;
              }
            }

            // Expand h along j (u-axis)
            let h = 1;
            if (!isWater) {
              outer: while (j + h < size) {
                for (let dw = 0; dw < w; dw++) {
                  const ni = (j + h) * size + (k + dw);
                  if (mask[ni] !== tpo) break outer;
                  if (!sameShade(ni * 4)) break outer;
                }
                h++;
              }
            }


            // ── Emit merged quad ──────────────────────────────────────────────
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
            const aoVals = [ao0, ao1, ao2, ao3];
            const lightVals = [l0, l1, l2, l3];

            for (let vi = 0; vi < 4; vi++) {
              const { pos: cp, uv } = corners[vi];
              // cp[axis] = 0 or 1 → offset in the normal direction (no expansion here)
              // cp[u]    = 0 or 1 → corner extent on u-axis; h expands this direction
              // cp[v]    = 0 or 1 → corner extent on v-axis; w expands this direction
              const fc = [0, 0, 0];
              fc[axis] = start[axis] + i + cp[axis];
              fc[u]    = start[u]    + j + cp[u] * h;
              fc[v]    = start[v]    + k + cp[v] * w;

              if (isWater) {
                const curLx = (axis === 0 ? i : u === 0 ? j : k);
                const curLy = (axis === 1 ? i : u === 1 ? j : k);
                const curLz = (axis === 2 ? i : u === 2 ? j : k);

                const wbx = start[0] + curLx;
                const wby = start[1] + curLy;
                const wbz = start[2] + curLz;

                if (cp[1] === 1) {
                  // Canto superior: calcula altura inclinada adaptativa pelo campo escalar
                  const cornerH = this.getCornerWaterHeight(
                    wbx + cp[0], wby, wbz + cp[2],
                    blocks, chunkData.waterLevels, borders,
                    startX, startY, startZ, size
                  );
                  fc[1] = wby + cornerH;
                } else {
                  // Base do bloco
                  fc[1] = wby;
                }
              }

              tPos.push(fc[0], fc[1], fc[2]);
              tNorm.push(dir[0], dir[1], dir[2]);
              tCol.push(cr, cg, cb);
              // UV tiles per block: scale by quad dimensions
              // uv[0] spans the v-axis (k), uv[1] spans the u-axis (j)
              tUv.push(uv[0] * w, uv[1] * h);
              tAo.push(aoVals[vi] / 3.0);
              tLight.push((lightVals[vi] >> 8) / 60, (lightVals[vi] & 0xff) / 60);
            }

            // AO-driven triangle flip (identical to original single-face logic)
            if (aoVals[0] + aoVals[3] > aoVals[1] + aoVals[2]) {
              tVtx.push(baseIdx, baseIdx+1, baseIdx+2, baseIdx+2, baseIdx+1, baseIdx+3);
            } else {
              tVtx.push(baseIdx, baseIdx+1, baseIdx+3, baseIdx, baseIdx+3, baseIdx+2);
            }

            // Consume this rectangle from the mask
            for (let dh = 0; dh < h; dh++) {
              for (let dw = 0; dw < w; dw++) {
                mask[(j + dh) * size + (k + dw)] = 0;
              }
            }
          }
        }
      } // end layer sweep
    } // end face directions
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
