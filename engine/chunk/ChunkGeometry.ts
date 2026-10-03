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

            if (blockRegistry.isAir(type) || blockRegistry.isCrossMesh(type)) {
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
            const blockLum = blockRegistry.getLightEmission(type);
            const blockEmissive = blockLum > 0 ? (blockLum / 15.0) : 0.0;

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
              // Pass emissive factor in uv.x (0.0 for non-emissive)
              tUv.push(isWater ? 0.0 : blockEmissive, 0.0);
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

    // ── Pass 3: 3D Micro-voxel models (flora, vines, mushrooms) ────────────
    this.buildMicrovoxelMeshes(chunkData, borders);
  }

  private addMicroBox(
    x0: number, y0: number, z0: number,
    x1: number, y1: number, z1: number,
    r: number, g: number, b: number,
    skyLight: number,
    blkLight: number = 0,
    emissive: number = 0
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
      this.opaqueUvs.push(emissive, 0);
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

  private renderMushroom(
    wx: number, wy: number, wz: number,
    skyLight: number, blkLight: number,
    isCeiling: boolean,
    stemR: number, stemG: number, stemB: number,
    capR: number, capG: number, capB: number,
    topR: number, topG: number, topB: number,
    hasSpots: boolean,
    spotR = 1.0, spotG = 1.0, spotB = 1.0,
    emissive: number = 0
  ): void {
    const spotEmissive = Math.min(1.0, emissive * 1.35 + 0.15);
    const stemEmissive = emissive * 0.5;
    const addBox = (x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, r: number, g: number, b: number, boxEmissive = emissive) => {
      if (isCeiling) {
        this.addMicroBox(wx + x0, wy + (1.0 - y1), wz + z0, wx + x1, wy + (1.0 - y0), wz + z1, r, g, b, skyLight, blkLight, boxEmissive);
      } else {
        this.addMicroBox(wx + x0, wy + y0, wz + z0, wx + x1, wy + y1, wz + z1, r, g, b, skyLight, blkLight, boxEmissive);
      }
    };

    // Deterministic pseudo-random variant (0 to 3) based on world coordinates
    const hash = Math.abs(Math.sin(wx * 12.9898 + wy * 78.233 + wz * 45.164) * 43758.5453);
    const variant = Math.floor((hash % 1) * 4);

    if (variant === 0) {
      // ── Variant 0: Classic Round Dome Mushroom ──────────────────────────
      // Stem
      addBox(0.42, 0.00, 0.42, 0.58, 0.36, 0.58, stemR, stemG, stemB, stemEmissive);
      // Main cap body
      addBox(0.20, 0.30, 0.20, 0.80, 0.56, 0.80, capR, capG, capB, emissive);
      // Upper dome
      addBox(0.28, 0.56, 0.28, 0.72, 0.72, 0.72, topR, topG, topB, emissive);
      // Crown peak
      addBox(0.38, 0.72, 0.38, 0.62, 0.78, 0.62, topR, topG, topB, emissive);

      if (hasSpots) {
        addBox(0.22, 0.46, 0.22, 0.32, 0.56, 0.32, spotR, spotG, spotB, spotEmissive);
        addBox(0.68, 0.46, 0.68, 0.78, 0.56, 0.78, spotR, spotG, spotB, spotEmissive);
        addBox(0.24, 0.48, 0.66, 0.34, 0.58, 0.76, spotR, spotG, spotB, spotEmissive);
        addBox(0.66, 0.48, 0.24, 0.76, 0.58, 0.34, spotR, spotG, spotB, spotEmissive);
        addBox(0.45, 0.74, 0.45, 0.55, 0.80, 0.55, spotR, spotG, spotB, spotEmissive);
      }
    } else if (variant === 1) {
      // ── Variant 1: Slender & Tall Mushroom ──────────────────────────────
      // Taller, slightly slender stem with small organic tilt
      addBox(0.45, 0.00, 0.44, 0.55, 0.54, 0.54, stemR, stemG, stemB, stemEmissive);
      // Conical bell cap
      addBox(0.30, 0.48, 0.29, 0.70, 0.68, 0.69, capR, capG, capB, emissive);
      addBox(0.36, 0.68, 0.35, 0.64, 0.84, 0.63, topR, topG, topB, emissive);
      addBox(0.42, 0.84, 0.41, 0.58, 0.90, 0.57, topR, topG, topB, emissive);

      if (hasSpots) {
        addBox(0.32, 0.58, 0.31, 0.40, 0.68, 0.39, spotR, spotG, spotB, spotEmissive);
        addBox(0.60, 0.60, 0.59, 0.68, 0.70, 0.67, spotR, spotG, spotB, spotEmissive);
        addBox(0.46, 0.86, 0.45, 0.54, 0.92, 0.53, spotR, spotG, spotB, spotEmissive);
      }
    } else if (variant === 2) {
      // ── Variant 2: Twin Cluster (Mother + Baby Mushroom) ─────────────────
      // Mother mushroom
      addBox(0.24, 0.00, 0.28, 0.38, 0.40, 0.42, stemR, stemG, stemB, stemEmissive);
      addBox(0.12, 0.34, 0.16, 0.52, 0.58, 0.56, capR, capG, capB, emissive);
      addBox(0.18, 0.58, 0.22, 0.46, 0.72, 0.50, topR, topG, topB, emissive);
      addBox(0.26, 0.72, 0.30, 0.38, 0.78, 0.42, topR, topG, topB, emissive);

      // Baby mushroom
      addBox(0.62, 0.00, 0.60, 0.72, 0.22, 0.70, stemR, stemG, stemB, stemEmissive);
      addBox(0.52, 0.18, 0.50, 0.82, 0.36, 0.80, capR, capG, capB, emissive);
      addBox(0.58, 0.36, 0.56, 0.76, 0.45, 0.74, topR, topG, topB, emissive);

      if (hasSpots) {
        addBox(0.16, 0.48, 0.20, 0.24, 0.56, 0.28, spotR, spotG, spotB, spotEmissive);
        addBox(0.40, 0.50, 0.44, 0.48, 0.58, 0.52, spotR, spotG, spotB, spotEmissive);
        addBox(0.70, 0.30, 0.68, 0.78, 0.38, 0.76, spotR, spotG, spotB, spotEmissive);
      }
    } else {
      // ── Variant 3: Wide Flattened Parasol / Umbrella ────────────────────
      // Stout stem
      addBox(0.43, 0.00, 0.43, 0.57, 0.30, 0.57, stemR, stemG, stemB, stemEmissive);
      // Gills ring under cap
      addBox(0.22, 0.26, 0.22, 0.78, 0.30, 0.78, stemR * 0.9, stemG * 0.9, stemB * 0.9, stemEmissive);
      // Wide flat brim
      addBox(0.10, 0.30, 0.10, 0.90, 0.42, 0.90, capR, capG, capB, emissive);
      // Middle plate
      addBox(0.26, 0.42, 0.26, 0.74, 0.50, 0.74, topR, topG, topB, emissive);
      // Central button
      addBox(0.40, 0.50, 0.40, 0.60, 0.56, 0.60, topR, topG, topB, emissive);

      if (hasSpots) {
        addBox(0.14, 0.38, 0.46, 0.22, 0.44, 0.54, spotR, spotG, spotB, spotEmissive);
        addBox(0.78, 0.38, 0.46, 0.86, 0.44, 0.54, spotR, spotG, spotB, spotEmissive);
        addBox(0.46, 0.38, 0.14, 0.54, 0.44, 0.22, spotR, spotG, spotB, spotEmissive);
        addBox(0.46, 0.38, 0.78, 0.54, 0.44, 0.86, spotR, spotG, spotB, spotEmissive);
      }
    }
  }

  private renderShelfFungus(
    wx: number, wy: number, wz: number,
    blocks: Int8Array, borders: ChunkBorders,
    startX: number, startY: number, startZ: number, size: number,
    skyLight: number, blkLight: number,
    emissive: number = 0
  ): void {
    const nXNeg = this.getNeighbourBlock(wx - 1, wy, wz, blocks, borders, startX, startY, startZ, size);
    const nXPos = this.getNeighbourBlock(wx + 1, wy, wz, blocks, borders, startX, startY, startZ, size);
    const nZNeg = this.getNeighbourBlock(wx, wy, wz - 1, blocks, borders, startX, startY, startZ, size);
    const nZPos = this.getNeighbourBlock(wx, wy, wz + 1, blocks, borders, startX, startY, startZ, size);

    const bR = 0.46, bG = 0.28, bB = 0.16; // Bark brown
    const rR = 0.82, rG = 0.65, rB = 0.42; // Tan outer rim
    const dR = 0.32, dG = 0.18, dB = 0.10; // Dark core

    if (nXNeg > 0 && blockRegistry.isSolid(nXNeg)) {
      // Attached to -X wall, extends into +X
      this.addMicroBox(wx, wy + 0.45, wz + 0.20, wx + 0.55, wy + 0.55, wz + 0.80, bR, bG, bB, skyLight, blkLight, emissive * 0.8);
      this.addMicroBox(wx + 0.45, wy + 0.47, wz + 0.25, wx + 0.58, wy + 0.54, wz + 0.75, rR, rG, rB, skyLight, blkLight, emissive);
      this.addMicroBox(wx, wy + 0.55, wz + 0.30, wx + 0.35, wy + 0.62, wz + 0.70, dR, dG, dB, skyLight, blkLight, emissive * 0.6);
      // Lower smaller shelf
      this.addMicroBox(wx, wy + 0.22, wz + 0.35, wx + 0.40, wy + 0.30, wz + 0.65, bR, bG, bB, skyLight, blkLight, emissive * 0.8);
      this.addMicroBox(wx + 0.35, wy + 0.23, wz + 0.38, wx + 0.43, wy + 0.29, wz + 0.62, rR, rG, rB, skyLight, blkLight, emissive);
    } else if (nXPos > 0 && blockRegistry.isSolid(nXPos)) {
      // Attached to +X wall, extends into -X
      this.addMicroBox(wx + 0.45, wy + 0.45, wz + 0.20, wx + 1.0, wy + 0.55, wz + 0.80, bR, bG, bB, skyLight, blkLight, emissive * 0.8);
      this.addMicroBox(wx + 0.42, wy + 0.47, wz + 0.25, wx + 0.55, wy + 0.54, wz + 0.75, rR, rG, rB, skyLight, blkLight, emissive);
      this.addMicroBox(wx + 0.65, wy + 0.55, wz + 0.30, wx + 1.0, wy + 0.62, wz + 0.70, dR, dG, dB, skyLight, blkLight, emissive * 0.6);
      // Lower smaller shelf
      this.addMicroBox(wx + 0.60, wy + 0.22, wz + 0.35, wx + 1.0, wy + 0.30, wz + 0.65, bR, bG, bB, skyLight, blkLight, emissive * 0.8);
      this.addMicroBox(wx + 0.57, wy + 0.23, wz + 0.38, wx + 0.65, wy + 0.29, wz + 0.62, rR, rG, rB, skyLight, blkLight, emissive);
    } else if (nZNeg > 0 && blockRegistry.isSolid(nZNeg)) {
      // Attached to -Z wall, extends into +Z
      this.addMicroBox(wx + 0.20, wy + 0.45, wz, wx + 0.80, wy + 0.55, wz + 0.55, bR, bG, bB, skyLight, blkLight, emissive * 0.8);
      this.addMicroBox(wx + 0.25, wy + 0.47, wz + 0.45, wx + 0.75, wy + 0.54, wz + 0.58, rR, rG, rB, skyLight, blkLight, emissive);
      this.addMicroBox(wx + 0.30, wy + 0.55, wz, wx + 0.70, wy + 0.62, wz + 0.35, dR, dG, dB, skyLight, blkLight, emissive * 0.6);
      // Lower smaller shelf
      this.addMicroBox(wx + 0.35, wy + 0.22, wz, wx + 0.65, wy + 0.30, wz + 0.40, bR, bG, bB, skyLight, blkLight, emissive * 0.8);
      this.addMicroBox(wx + 0.38, wy + 0.23, wz + 0.35, wx + 0.62, wy + 0.29, wz + 0.43, rR, rG, rB, skyLight, blkLight, emissive);
    } else if (nZPos > 0 && blockRegistry.isSolid(nZPos)) {
      // Attached to +Z wall, extends into -Z
      this.addMicroBox(wx + 0.20, wy + 0.45, wz + 0.45, wx + 0.80, wy + 0.55, wz + 1.0, bR, bG, bB, skyLight, blkLight, emissive * 0.8);
      this.addMicroBox(wx + 0.25, wy + 0.47, wz + 0.42, wx + 0.75, wy + 0.54, wz + 0.55, rR, rG, rB, skyLight, blkLight, emissive);
      this.addMicroBox(wx + 0.30, wy + 0.55, wz + 0.65, wx + 0.70, wy + 0.62, wz + 1.0, dR, dG, dB, skyLight, blkLight, emissive * 0.6);
      // Lower smaller shelf
      this.addMicroBox(wx + 0.35, wy + 0.22, wz + 0.60, wx + 0.65, wy + 0.30, wz + 1.0, bR, bG, bB, skyLight, blkLight, emissive * 0.8);
      this.addMicroBox(wx + 0.38, wy + 0.23, wz + 0.57, wx + 0.62, wy + 0.29, wz + 0.65, rR, rG, rB, skyLight, blkLight, emissive);
    } else {
      // Free-standing tiered bracket fungus on floor
      this.addMicroBox(wx + 0.42, wy, wz + 0.42, wx + 0.58, wy + 0.60, wz + 0.58, bR, bG, bB, skyLight, blkLight, emissive * 0.8);
      this.addMicroBox(wx + 0.25, wy + 0.25, wz + 0.25, wx + 0.75, wy + 0.33, wz + 0.75, rR, rG, rB, skyLight, blkLight, emissive);
      this.addMicroBox(wx + 0.20, wy + 0.45, wz + 0.20, wx + 0.80, wy + 0.53, wz + 0.80, rR, rG, rB, skyLight, blkLight, emissive);
    }
  }

  /**
   * Vitória-Régia (Victoria amazonica / Giant Water Lily 3D):
   * Prato flutuante octogonal com borda elevada curvada para cima, fenda de drenagem
   * e flor central multicamadas com pétalas rosa/brancas e pistilos dourados radiantes.
   */
  private renderVictoriaRegia(wx: number, wy: number, wz: number, skyLight: number, blkLight: number, emissive: number = 0): void {
    const hash = Math.abs(Math.sin(wx * 17.13 + wy * 31.41 + wz * 71.7) * 43758.5453);
    const variant = Math.floor((hash % 1) * 4);
    const flowerEmissive = Math.min(1.0, emissive * 1.4 + 0.2);

    // Cores botânicas realistas da vitória-régia
    const padG_R = 0.12, padG_G = 0.48, padG_B = 0.16; // Verde musgo aquático profundo
    const vein_R = 0.20, vein_G = 0.62, vein_B = 0.24; // Nervuras verde esmeralda
    const rimOut_R = 0.48, rimOut_G = 0.16, rimOut_B = 0.24; // Borda exterior arroxeada/carmesim
    const rimIn_R = 0.18, rimIn_G = 0.54, rimIn_B = 0.20; // Lábio superior verde vivo

    if (variant === 2) {
      // ── Variante 2: Dupla de folhas (folha mãe com flor + folhinha bebê ao lado) ──
      // Folha principal (ligeiramente deslocada)
      this.addMicroBox(wx + 0.04, wy + 0.01, wz + 0.04, wx + 0.68, wy + 0.05, wz + 0.68, padG_R, padG_G, padG_B, skyLight, blkLight, emissive * 0.4);
      // Bordas da folha principal
      this.addMicroBox(wx + 0.12, wy + 0.05, wz + 0.02, wx + 0.60, wy + 0.12, wz + 0.06, rimOut_R, rimOut_G, rimOut_B, skyLight, blkLight, emissive * 0.5);
      this.addMicroBox(wx + 0.12, wy + 0.05, wz + 0.66, wx + 0.60, wy + 0.12, wz + 0.70, rimOut_R, rimOut_G, rimOut_B, skyLight, blkLight, emissive * 0.5);
      this.addMicroBox(wx + 0.02, wy + 0.05, wz + 0.12, wx + 0.06, wy + 0.12, wz + 0.60, rimOut_R, rimOut_G, rimOut_B, skyLight, blkLight, emissive * 0.5);
      this.addMicroBox(wx + 0.66, wy + 0.05, wz + 0.12, wx + 0.70, wy + 0.12, wz + 0.60, rimOut_R, rimOut_G, rimOut_B, skyLight, blkLight, emissive * 0.5);

      // Flor na folha principal
      this.addMicroBox(wx + 0.28, wy + 0.05, wz + 0.28, wx + 0.44, wy + 0.12, wz + 0.44, 0.96, 0.75, 0.85, skyLight, blkLight, flowerEmissive);
      this.addMicroBox(wx + 0.32, wy + 0.12, wz + 0.32, wx + 0.40, wy + 0.18, wz + 0.40, 1.0, 0.90, 0.25, skyLight, blkLight, flowerEmissive);

      // Folha bebê adjacente
      this.addMicroBox(wx + 0.54, wy + 0.015, wz + 0.54, wx + 0.96, wy + 0.045, wz + 0.96, padG_R * 1.1, padG_G * 1.1, padG_B, skyLight, blkLight, emissive * 0.4);
      this.addMicroBox(wx + 0.58, wy + 0.045, wz + 0.52, wx + 0.92, wy + 0.09, wz + 0.56, rimOut_R, rimOut_G, rimOut_B, skyLight, blkLight, emissive * 0.5);
      this.addMicroBox(wx + 0.58, wy + 0.045, wz + 0.94, wx + 0.92, wy + 0.09, wz + 0.98, rimOut_R, rimOut_G, rimOut_B, skyLight, blkLight, emissive * 0.5);
      this.addMicroBox(wx + 0.52, wy + 0.045, wz + 0.58, wx + 0.56, wy + 0.09, wz + 0.92, rimOut_R, rimOut_G, rimOut_B, skyLight, blkLight, emissive * 0.5);
      this.addMicroBox(wx + 0.94, wy + 0.045, wz + 0.58, wx + 0.98, wy + 0.09, wz + 0.92, rimOut_R, rimOut_G, rimOut_B, skyLight, blkLight, emissive * 0.5);
      return;
    }

    // ── Disco foliar flutuante principal (formato octogonal amplo) ──
    this.addMicroBox(wx + 0.08, wy + 0.01, wz + 0.08, wx + 0.92, wy + 0.05, wz + 0.92, padG_R, padG_G, padG_B, skyLight, blkLight, emissive * 0.4);
    this.addMicroBox(wx + 0.18, wy + 0.01, wz + 0.04, wx + 0.82, wy + 0.05, wz + 0.96, padG_R, padG_G, padG_B, skyLight, blkLight, emissive * 0.4);
    this.addMicroBox(wx + 0.04, wy + 0.01, wz + 0.18, wx + 0.96, wy + 0.05, wz + 0.82, padG_R, padG_G, padG_B, skyLight, blkLight, emissive * 0.4);

    // Nervuras radiais salientes (textura biológica)
    this.addMicroBox(wx + 0.14, wy + 0.04, wz + 0.46, wx + 0.86, wy + 0.055, wz + 0.54, vein_R, vein_G, vein_B, skyLight, blkLight, emissive * 0.5);
    this.addMicroBox(wx + 0.46, wy + 0.04, wz + 0.14, wx + 0.54, wy + 0.055, wz + 0.86, vein_R, vein_G, vein_B, skyLight, blkLight, emissive * 0.5);
    this.addMicroBox(wx + 0.22, wy + 0.04, wz + 0.22, wx + 0.78, wy + 0.055, wz + 0.78, vein_R, vein_G, vein_B, skyLight, blkLight, emissive * 0.5);
    this.addMicroBox(wx + 0.22, wy + 0.04, wz + 0.78, wx + 0.78, wy + 0.055, wz + 0.22, vein_R, vein_G, vein_B, skyLight, blkLight, emissive * 0.5);

    // ── Borda elevada clássica (característica única da Vitória-Régia) ──
    // Borda Norte
    this.addMicroBox(wx + 0.18, wy + 0.05, wz + 0.04, wx + 0.82, wy + 0.14, wz + 0.09, rimOut_R, rimOut_G, rimOut_B, skyLight, blkLight, emissive * 0.5);
    this.addMicroBox(wx + 0.20, wy + 0.13, wz + 0.05, wx + 0.80, wy + 0.15, wz + 0.08, rimIn_R, rimIn_G, rimIn_B, skyLight, blkLight, emissive * 0.5);

    // Borda Sul — com a clássica fenda natural de escoamento (fissura)
    this.addMicroBox(wx + 0.18, wy + 0.05, wz + 0.91, wx + 0.44, wy + 0.14, wz + 0.96, rimOut_R, rimOut_G, rimOut_B, skyLight, blkLight, emissive * 0.5);
    this.addMicroBox(wx + 0.20, wy + 0.13, wz + 0.92, wx + 0.43, wy + 0.15, wz + 0.95, rimIn_R, rimIn_G, rimIn_B, skyLight, blkLight, emissive * 0.5);
    this.addMicroBox(wx + 0.56, wy + 0.05, wz + 0.91, wx + 0.82, wy + 0.14, wz + 0.96, rimOut_R, rimOut_G, rimOut_B, skyLight, blkLight, emissive * 0.5);
    this.addMicroBox(wx + 0.57, wy + 0.13, wz + 0.92, wx + 0.80, wy + 0.15, wz + 0.95, rimIn_R, rimIn_G, rimIn_B, skyLight, blkLight, emissive * 0.5);

    // Borda Oeste
    this.addMicroBox(wx + 0.04, wy + 0.05, wz + 0.18, wx + 0.09, wy + 0.14, wz + 0.82, rimOut_R, rimOut_G, rimOut_B, skyLight, blkLight, emissive * 0.5);
    this.addMicroBox(wx + 0.05, wy + 0.13, wz + 0.20, wx + 0.08, wy + 0.15, wz + 0.80, rimIn_R, rimIn_G, rimIn_B, skyLight, blkLight, emissive * 0.5);

    // Borda Leste
    this.addMicroBox(wx + 0.91, wy + 0.05, wz + 0.18, wx + 0.96, wy + 0.14, wz + 0.82, rimOut_R, rimOut_G, rimOut_B, skyLight, blkLight, emissive * 0.5);
    this.addMicroBox(wx + 0.92, wy + 0.13, wz + 0.20, wx + 0.95, wy + 0.15, wz + 0.80, rimIn_R, rimIn_G, rimIn_B, skyLight, blkLight, emissive * 0.5);

    // Cantos chanfrados em 45 graus
    this.addMicroBox(wx + 0.09, wy + 0.05, wz + 0.09, wx + 0.18, wy + 0.13, wz + 0.18, rimOut_R, rimOut_G, rimOut_B, skyLight, blkLight, emissive * 0.5);
    this.addMicroBox(wx + 0.82, wy + 0.05, wz + 0.09, wx + 0.91, wy + 0.13, wz + 0.18, rimOut_R, rimOut_G, rimOut_B, skyLight, blkLight, emissive * 0.5);
    this.addMicroBox(wx + 0.09, wy + 0.05, wz + 0.82, wx + 0.18, wy + 0.13, wz + 0.91, rimOut_R, rimOut_G, rimOut_B, skyLight, blkLight, emissive * 0.5);
    this.addMicroBox(wx + 0.82, wy + 0.05, wz + 0.82, wx + 0.91, wy + 0.13, wz + 0.91, rimOut_R, rimOut_G, rimOut_B, skyLight, blkLight, emissive * 0.5);

    if (variant === 1) {
      // ── Variante 1: Botão floral fechado (jovem botão de lótus rosa) ──
      this.addMicroBox(wx + 0.40, wy + 0.05, wz + 0.40, wx + 0.60, wy + 0.10, wz + 0.60, 0.32, 0.48, 0.20, skyLight, blkLight, emissive * 0.5);
      this.addMicroBox(wx + 0.42, wy + 0.10, wz + 0.42, wx + 0.58, wy + 0.20, wz + 0.58, 0.88, 0.32, 0.56, skyLight, blkLight, flowerEmissive);
      this.addMicroBox(wx + 0.45, wy + 0.20, wz + 0.45, wx + 0.55, wy + 0.26, wz + 0.55, 0.98, 0.60, 0.76, skyLight, blkLight, flowerEmissive);
      return;
    }

    // ── Variante 0 e 3: Grande Flor Aberta Radiante ──
    const isPureWhite = variant === 3;
    const petOutR = isPureWhite ? 0.95 : 0.98;
    const petOutG = isPureWhite ? 0.95 : 0.68;
    const petOutB = isPureWhite ? 0.98 : 0.82;

    const petInR = 1.0, petInG = 0.96, petInB = 0.92; // Branco perolado interno
    const stamR = 1.0, stamG = 0.86, stamB = 0.18;   // Centro dourado luminoso

    // Cálice floral
    this.addMicroBox(wx + 0.38, wy + 0.05, wz + 0.38, wx + 0.62, wy + 0.09, wz + 0.62, 0.30, 0.42, 0.20, skyLight, blkLight, emissive * 0.5);

    // Corola externa (pétalas em cruz e diagonais)
    this.addMicroBox(wx + 0.28, wy + 0.08, wz + 0.40, wx + 0.72, wy + 0.15, wz + 0.60, petOutR, petOutG, petOutB, skyLight, blkLight, flowerEmissive);
    this.addMicroBox(wx + 0.40, wy + 0.08, wz + 0.28, wx + 0.60, wy + 0.15, wz + 0.72, petOutR, petOutG, petOutB, skyLight, blkLight, flowerEmissive);
    this.addMicroBox(wx + 0.32, wy + 0.09, wz + 0.32, wx + 0.68, wy + 0.16, wz + 0.68, petOutR * 0.95, petOutG * 0.95, petOutB, skyLight, blkLight, flowerEmissive);

    // Pétalas internas voltadas para cima
    this.addMicroBox(wx + 0.36, wy + 0.13, wz + 0.36, wx + 0.64, wy + 0.22, wz + 0.64, petInR, petInG, petInB, skyLight, blkLight, flowerEmissive);
    this.addMicroBox(wx + 0.40, wy + 0.16, wz + 0.40, wx + 0.60, wy + 0.26, wz + 0.60, 1.0, 1.0, 0.98, skyLight, blkLight, flowerEmissive);

    // Pistilo central e estames dourados (brilham no escuro da caverna)
    this.addMicroBox(wx + 0.44, wy + 0.20, wz + 0.44, wx + 0.56, wy + 0.28, wz + 0.56, stamR, stamG, stamB, skyLight, blkLight, Math.min(1.0, emissive * 1.5 + 0.25));

    if (isPureWhite) {
      // Gotículas de água cristalina sobre a folha
      this.addMicroBox(wx + 0.22, wy + 0.05, wz + 0.34, wx + 0.26, wy + 0.08, wz + 0.38, 0.70, 0.90, 1.0, skyLight, blkLight, emissive * 0.6);
      this.addMicroBox(wx + 0.74, wy + 0.05, wz + 0.62, wx + 0.78, wy + 0.08, wz + 0.66, 0.70, 0.90, 1.0, skyLight, blkLight, emissive * 0.6);
    }
  }

  /**
   * Flor de Esporos (Spore Blossom 3D):
   * Flor exótica suspensa no teto com cálice verde, pétalas magenta/rosadas em leque,
   * bulbo reprodutor dourado bioluminescente e esporos suspensos no ar abaixo.
   */
  private renderSporeBlossom(wx: number, wy: number, wz: number, skyLight: number, blkLight: number, emissive: number = 0): void {
    const hash = Math.abs(Math.sin(wx * 23.45 + wy * 57.89 + wz * 13.11) * 43758.5453);
    const variant = Math.floor((hash % 1) * 3);
    const glowEmissive = Math.min(1.0, emissive * 1.35 + 0.15);

    // Ancoragem ao teto de rocha/musgo
    this.addMicroBox(wx + 0.44, wy + 0.88, wz + 0.44, wx + 0.56, wy + 1.0, wz + 0.56, 0.22, 0.44, 0.16, skyLight, blkLight, emissive * 0.4);
    // Cálice verde protetor
    this.addMicroBox(wx + 0.38, wy + 0.76, wz + 0.38, wx + 0.62, wy + 0.88, wz + 0.62, 0.28, 0.52, 0.18, skyLight, blkLight, emissive * 0.5);

    // Pétalas magenta/pink vibrantes
    const pR = 0.92, pG = 0.18, pB = 0.54;
    const pLightR = 0.98, pLightG = 0.42, pLightB = 0.72;

    // Disco superior de pétalas
    this.addMicroBox(wx + 0.26, wy + 0.64, wz + 0.26, wx + 0.74, wy + 0.76, wz + 0.74, pR, pG, pB, skyLight, blkLight, emissive);
    // Saia ampla de pétalas caídas
    this.addMicroBox(wx + 0.16, wy + 0.50, wz + 0.16, wx + 0.84, wy + 0.64, wz + 0.84, pLightR, pLightG, pLightB, skyLight, blkLight, emissive);

    // Pontas descaídas das pétalas (efeito sino/trombeta para baixo)
    this.addMicroBox(wx + 0.12, wy + 0.34, wz + 0.36, wx + 0.20, wy + 0.52, wz + 0.64, pR, pG, pB, skyLight, blkLight, emissive);
    this.addMicroBox(wx + 0.80, wy + 0.34, wz + 0.36, wx + 0.88, wy + 0.52, wz + 0.64, pR, pG, pB, skyLight, blkLight, emissive);
    this.addMicroBox(wx + 0.36, wy + 0.34, wz + 0.12, wx + 0.64, wy + 0.52, wz + 0.20, pR, pG, pB, skyLight, blkLight, emissive);
    this.addMicroBox(wx + 0.36, wy + 0.34, wz + 0.80, wx + 0.64, wy + 0.52, wz + 0.88, pR, pG, pB, skyLight, blkLight, emissive);

    // Bulbo central de pólen brilhante
    this.addMicroBox(wx + 0.38, wy + 0.46, wz + 0.38, wx + 0.62, wy + 0.62, wz + 0.62, 1.0, 0.88, 0.25, skyLight, blkLight, glowEmissive);
    this.addMicroBox(wx + 0.44, wy + 0.38, wz + 0.44, wx + 0.56, wy + 0.48, wz + 0.56, 1.0, 0.98, 0.50, skyLight, blkLight, glowEmissive);

    // Esporos bioluminescentes suspensos no ar logo abaixo da flor
    this.addMicroBox(wx + 0.46, wy + 0.22, wz + 0.46, wx + 0.54, wy + 0.30, wz + 0.54, 1.0, 0.85, 0.35, skyLight, blkLight, Math.min(1.0, glowEmissive + 0.1));
    if (variant !== 0) {
      this.addMicroBox(wx + 0.30, wy + 0.12, wz + 0.60, wx + 0.36, wy + 0.18, wz + 0.66, 0.96, 0.60, 0.85, skyLight, blkLight, glowEmissive);
      this.addMicroBox(wx + 0.62, wy + 0.06, wz + 0.34, wx + 0.68, wy + 0.12, wz + 0.40, 0.98, 0.75, 0.90, skyLight, blkLight, glowEmissive);
    }
  }

  /**
   * Flor da Caverna / Azaléia Florida (Cave Flower 3D):
   * Arbusto florido com folhagem espessa e ramalhetes florais exuberantes (azaléia, orquídea, lírio).
   */
  private renderCaveFlower(wx: number, wy: number, wz: number, skyLight: number, blkLight: number, emissive: number = 0): void {
    const hash = Math.abs(Math.sin(wx * 41.17 + wy * 19.33 + wz * 83.51) * 43758.5453);
    const variant = Math.floor((hash % 1) * 4);
    const flowerEmissive = Math.min(1.0, emissive * 1.35 + 0.15);

    // Folhagem rasteira densa
    this.addMicroBox(wx + 0.44, wy, wz + 0.44, wx + 0.56, wy + 0.36, wz + 0.56, 0.26, 0.55, 0.18, skyLight, blkLight, emissive * 0.4);
    this.addMicroBox(wx + 0.24, wy + 0.06, wz + 0.34, wx + 0.46, wy + 0.18, wz + 0.56, 0.28, 0.60, 0.20, skyLight, blkLight, emissive * 0.4);
    this.addMicroBox(wx + 0.54, wy + 0.08, wz + 0.44, wx + 0.76, wy + 0.20, wz + 0.66, 0.30, 0.64, 0.22, skyLight, blkLight, emissive * 0.4);
    this.addMicroBox(wx + 0.36, wy + 0.12, wz + 0.22, wx + 0.58, wy + 0.24, wz + 0.44, 0.24, 0.52, 0.16, skyLight, blkLight, emissive * 0.4);

    if (variant === 0) {
      // ── Azaléia Rosa Choque / Magenta Clássica ──
      // Pétalas externas
      this.addMicroBox(wx + 0.26, wy + 0.30, wz + 0.26, wx + 0.74, wy + 0.48, wz + 0.74, 0.95, 0.32, 0.62, skyLight, blkLight, flowerEmissive);
      // Pétalas internas mais claras
      this.addMicroBox(wx + 0.34, wy + 0.46, wz + 0.34, wx + 0.66, wy + 0.62, wz + 0.66, 0.98, 0.62, 0.80, skyLight, blkLight, flowerEmissive);
      // Pistilo dourado
      this.addMicroBox(wx + 0.42, wy + 0.60, wz + 0.42, wx + 0.58, wy + 0.70, wz + 0.58, 1.0, 0.92, 0.28, skyLight, blkLight, Math.min(1.0, flowerEmissive + 0.1));
    } else if (variant === 1) {
      // ── Orquídea Azul/Ciano Bioluminescente ──
      this.addMicroBox(wx + 0.24, wy + 0.32, wz + 0.28, wx + 0.76, wy + 0.48, wz + 0.72, 0.14, 0.78, 0.88, skyLight, blkLight, flowerEmissive);
      this.addMicroBox(wx + 0.32, wy + 0.48, wz + 0.32, wx + 0.68, wy + 0.66, wz + 0.68, 0.40, 0.92, 0.98, skyLight, blkLight, flowerEmissive);
      this.addMicroBox(wx + 0.43, wy + 0.64, wz + 0.43, wx + 0.57, wy + 0.74, wz + 0.57, 0.88, 1.0, 0.95, skyLight, blkLight, Math.min(1.0, flowerEmissive + 0.1));
    } else if (variant === 2) {
      // ── Lírio Dourado das Cavernas ──
      this.addMicroBox(wx + 0.28, wy + 0.28, wz + 0.28, wx + 0.72, wy + 0.46, wz + 0.72, 0.98, 0.68, 0.12, skyLight, blkLight, flowerEmissive);
      this.addMicroBox(wx + 0.36, wy + 0.44, wz + 0.36, wx + 0.64, wy + 0.64, wz + 0.64, 1.0, 0.88, 0.28, skyLight, blkLight, flowerEmissive);
      this.addMicroBox(wx + 0.44, wy + 0.62, wz + 0.44, wx + 0.56, wy + 0.72, wz + 0.56, 1.0, 1.0, 0.65, skyLight, blkLight, Math.min(1.0, flowerEmissive + 0.1));
    } else {
      // ── Buquê Duplo (Flor alta rosa + flor baixa lilás) ──
      // Flor principal
      this.addMicroBox(wx + 0.22, wy + 0.32, wz + 0.22, wx + 0.56, wy + 0.48, wz + 0.56, 0.92, 0.28, 0.58, skyLight, blkLight, flowerEmissive);
      this.addMicroBox(wx + 0.28, wy + 0.48, wz + 0.28, wx + 0.50, wy + 0.64, wz + 0.50, 0.98, 0.65, 0.82, skyLight, blkLight, flowerEmissive);
      // Flor companheira
      this.addMicroBox(wx + 0.52, wy + 0.22, wz + 0.48, wx + 0.78, wy + 0.38, wz + 0.76, 0.68, 0.38, 0.90, skyLight, blkLight, flowerEmissive);
      this.addMicroBox(wx + 0.58, wy + 0.38, wz + 0.54, wx + 0.72, wy + 0.48, wz + 0.70, 0.85, 0.62, 0.98, skyLight, blkLight, flowerEmissive);
    }
  }

  /**
   * Raízes Suspensas (Hanging Roots 3D):
   * Tufos de raízes retorcidas penduradas em blocos de musgo ou teto de caverna.
   */
  private renderHangingRoots(wx: number, wy: number, wz: number, skyLight: number, blkLight: number, emissive: number = 0): void {
    const rR = 0.48, rG = 0.33, rB = 0.18; // Marrom terroso orgânico
    const mR = 0.30, mG = 0.54, mB = 0.20; // Musgo superior

    // Colar superior ancorado ao teto
    this.addMicroBox(wx + 0.32, wy + 0.82, wz + 0.32, wx + 0.68, wy + 1.0, wz + 0.68, rR, rG, rB, skyLight, blkLight, emissive);
    this.addMicroBox(wx + 0.30, wy + 0.90, wz + 0.30, wx + 0.70, wy + 1.0, wz + 0.70, mR, mG, mB, skyLight, blkLight, emissive);

    // Raiz axial central ondulante
    this.addMicroBox(wx + 0.43, wy + 0.48, wz + 0.43, wx + 0.57, wy + 0.84, wz + 0.57, rR, rG, rB, skyLight, blkLight, emissive);
    this.addMicroBox(wx + 0.45, wy + 0.18, wz + 0.43, wx + 0.55, wy + 0.50, wz + 0.53, rR * 0.9, rG * 0.9, rB * 0.9, skyLight, blkLight, emissive);
    this.addMicroBox(wx + 0.47, wy + 0.02, wz + 0.46, wx + 0.53, wy + 0.20, wz + 0.52, rR * 0.8, rG * 0.8, rB * 0.8, skyLight, blkLight, emissive);

    // Ramificações laterais assimétricas
    this.addMicroBox(wx + 0.26, wy + 0.56, wz + 0.30, wx + 0.44, wy + 0.70, wz + 0.44, rR, rG, rB, skyLight, blkLight, emissive);
    this.addMicroBox(wx + 0.20, wy + 0.32, wz + 0.28, wx + 0.32, wy + 0.58, wz + 0.38, rR * 0.95, rG * 0.95, rB * 0.95, skyLight, blkLight, emissive);
    this.addMicroBox(wx + 0.56, wy + 0.48, wz + 0.54, wx + 0.72, wy + 0.66, wz + 0.66, rR, rG, rB, skyLight, blkLight, emissive);
    this.addMicroBox(wx + 0.62, wy + 0.22, wz + 0.58, wx + 0.72, wy + 0.50, wz + 0.68, rR * 0.88, rG * 0.88, rB * 0.88, skyLight, blkLight, emissive);
  }

  /**
   * Folha-Gota Gigante (Big Dripleaf 3D):
   * Planta suculenta exuberante com caule verde espesso, folhas em leque escalonadas
   * e ponta curva de gotejamento com gota de orvalho cristalina.
   */
  private renderBigDripleaf(wx: number, wy: number, wz: number, skyLight: number, blkLight: number, emissive: number = 0): void {
    const stemR = 0.28, stemG = 0.64, stemB = 0.22;
    const leafR = 0.24, leafG = 0.72, leafB = 0.26;
    const veinR = 0.42, veinG = 0.86, veinB = 0.34;
    const dripR = 0.20, dripG = 0.60, dripB = 0.20;

    // Caule principal ereto
    this.addMicroBox(wx + 0.44, wy, wz + 0.44, wx + 0.56, wy + 0.64, wz + 0.56, stemR, stemG, stemB, skyLight, blkLight, emissive);
    this.addMicroBox(wx + 0.46, wy + 0.64, wz + 0.46, wx + 0.54, wy + 0.84, wz + 0.54, stemR * 1.05, stemG * 1.05, stemB, skyLight, blkLight, emissive);

    // Folha inferior secundária (ramo em patamar)
    this.addMicroBox(wx + 0.32, wy + 0.34, wz + 0.44, wx + 0.44, wy + 0.42, wz + 0.56, stemR, stemG, stemB, skyLight, blkLight, emissive);
    this.addMicroBox(wx + 0.12, wy + 0.30, wz + 0.30, wx + 0.36, wy + 0.38, wz + 0.70, leafR, leafG, leafB, skyLight, blkLight, emissive);
    this.addMicroBox(wx + 0.08, wy + 0.24, wz + 0.38, wx + 0.16, wy + 0.32, wz + 0.62, dripR, dripG, dripB, skyLight, blkLight, emissive);

    // Grande folha superior em plataforma horizontal
    this.addMicroBox(wx + 0.38, wy + 0.72, wz + 0.20, wx + 0.90, wy + 0.82, wz + 0.80, leafR, leafG, leafB, skyLight, blkLight, emissive);
    // Nervura central mais clara
    this.addMicroBox(wx + 0.40, wy + 0.80, wz + 0.46, wx + 0.86, wy + 0.84, wz + 0.54, veinR, veinG, veinB, skyLight, blkLight, emissive * 1.1);

    // Ponta caída de gotejamento
    this.addMicroBox(wx + 0.84, wy + 0.62, wz + 0.30, wx + 0.96, wy + 0.74, wz + 0.70, dripR, dripG, dripB, skyLight, blkLight, emissive);

    // Gota d'água límpida prestes a cair da ponta da folha
    this.addMicroBox(wx + 0.89, wy + 0.52, wz + 0.46, wx + 0.95, wy + 0.62, wz + 0.54, 0.65, 0.88, 1.0, skyLight, blkLight, Math.min(1.0, emissive + 0.2));
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

          // ── Model dispatch per block type ──────────────────────────────────
          if (type === 47) {
            // Cave Vine (Vinha de Caverna): cordão 3D suspenso com folhinhas
            this.addMicroBox(wx + 0.44, wy, wz + 0.44, wx + 0.56, wy + 1.0, wz + 0.56, 0.26, 0.46, 0.16, skyLight, blkLight, emissive);
            this.addMicroBox(wx + 0.36, wy + 0.55, wz + 0.40, wx + 0.64, wy + 0.72, wz + 0.60, 0.32, 0.56, 0.20, skyLight, blkLight, emissive);
            this.addMicroBox(wx + 0.40, wy + 0.18, wz + 0.36, wx + 0.60, wy + 0.35, wz + 0.64, 0.30, 0.52, 0.18, skyLight, blkLight, emissive);
          } else if (type === 48) {
            // Glow Berries (Vinha com Bagas Luminosas):
            const berryEmissive = Math.min(1.0, emissive * 1.35 + 0.2);
            this.addMicroBox(wx + 0.44, wy, wz + 0.44, wx + 0.56, wy + 1.0, wz + 0.56, 0.26, 0.46, 0.16, skyLight, blkLight, emissive * 0.4);
            this.addMicroBox(wx + 0.30, wy + 0.12, wz + 0.30, wx + 0.70, wy + 0.52, wz + 0.70, 1.0, 0.74, 0.20, skyLight, blkLight, berryEmissive);
            this.addMicroBox(wx + 0.38, wy + 0.04, wz + 0.38, wx + 0.62, wy + 0.12, wz + 0.62, 1.0, 0.90, 0.40, skyLight, blkLight, berryEmissive);
            this.addMicroBox(wx + 0.36, wy + 0.60, wz + 0.36, wx + 0.64, wy + 0.72, wz + 0.64, 0.30, 0.54, 0.18, skyLight, blkLight, emissive * 0.4);
          } else if (type === 53) {
            // Glowshroom (Fungo Brilhante Ciano 3D com variações procedurais e teto)
            const blockAbove = this.getNeighbourBlock(wx, wy + 1, wz, blocks, borders, startX, startY, startZ, size);
            const isCeiling = blockAbove > 0 && blockRegistry.isSolid(blockAbove);
            this.renderMushroom(
              wx, wy, wz, skyLight, blkLight, isCeiling,
              0.55, 0.88, 0.85, // stem: pale ice-cyan
              0.16, 0.88, 0.82, // cap: vibrant cyan
              0.35, 0.98, 0.92, // top: radiant neon turquoise
              true,             // hasSpots
              0.80, 1.00, 0.98, // spot: bioluminescent white-cyan
              emissive
            );
          } else if (type === 63) {
            // Violet Glowshroom (Fungo Brilhante Violeta 3D com variações e teto)
            const blockAbove = this.getNeighbourBlock(wx, wy + 1, wz, blocks, borders, startX, startY, startZ, size);
            const isCeiling = blockAbove > 0 && blockRegistry.isSolid(blockAbove);
            this.renderMushroom(
              wx, wy, wz, skyLight, blkLight, isCeiling,
              0.72, 0.60, 0.86, // stem: lavender
              0.56, 0.14, 0.90, // cap: deep electric purple
              0.82, 0.26, 0.98, // top: bright magenta violet
              true,             // hasSpots
              0.96, 0.75, 1.00, // spot: glowing pink
              emissive
            );
          } else if (type === 64) {
            // Crimson Fungus (Fungo Carmesim 3D)
            this.renderMushroom(
              wx, wy, wz, skyLight, blkLight, false,
              0.78, 0.45, 0.50, // stem: fleshy crimson/pink
              0.88, 0.12, 0.18, // cap: vibrant crimson
              0.68, 0.08, 0.12, // top: deep scarlet
              true,             // hasSpots
              1.00, 0.75, 0.18, // spot: warm spore yellow
              emissive
            );
          } else if (type === 65) {
            // Warped Fungus (Fungo Distorcido 3D)
            this.renderMushroom(
              wx, wy, wz, skyLight, blkLight, false,
              0.22, 0.42, 0.44, // stem: dark teal
              0.06, 0.68, 0.62, // cap: warped cyan
              0.14, 0.86, 0.74, // top: bright aqua lime
              true,             // hasSpots
              0.94, 0.88, 0.28, // spot: neon dots
              emissive
            );
          } else if (type === 66) {
            // Golden Mushroom (Cogumelo Dourado Radiante 3D)
            this.renderMushroom(
              wx, wy, wz, skyLight, blkLight, false,
              0.92, 0.85, 0.62, // stem: ivory gold
              0.98, 0.70, 0.08, // cap: warm amber gold
              1.00, 0.88, 0.25, // top: radiant gold
              true,             // hasSpots
              1.00, 0.98, 0.76, // spot: gold sparkle
              emissive
            );
          } else if (type === 61) {
            // Red Mushroom (Amanita Muscaria Vermelho com Pontos Brancos 3D)
            this.renderMushroom(
              wx, wy, wz, skyLight, blkLight, false,
              0.90, 0.88, 0.82, // stem: bone white
              0.86, 0.16, 0.16, // cap: scarlet red
              0.76, 0.10, 0.10, // top: deep crimson
              true,             // hasSpots
              0.98, 0.98, 0.98, // spot: pure white spots
              emissive
            );
          } else if (type === 62) {
            // Brown Mushroom (Cogumelo Marrom Silvestre 3D)
            this.renderMushroom(
              wx, wy, wz, skyLight, blkLight, false,
              0.82, 0.76, 0.68, // stem: pale tan
              0.55, 0.36, 0.22, // cap: warm brown
              0.42, 0.26, 0.16, // top: dark umber
              true,             // hasSpots
              0.72, 0.56, 0.40, // spot: tan speckles
              emissive
            );
          } else if (type === 67) {
            // Shelf Fungus (Orelha-de-pau / Fungo de Parede 3D)
            this.renderShelfFungus(wx, wy, wz, blocks, borders, startX, startY, startZ, size, skyLight, blkLight, emissive);
          } else if (type === 58) {
            // Tall Grass (Grama Alta 3D): 3 lâminas volumétricas de alturas naturais
            this.addMicroBox(wx + 0.42, wy, wz + 0.42, wx + 0.58, wy + 0.82, wz + 0.58, 0.33, 0.68, 0.16, skyLight, blkLight, emissive);
            this.addMicroBox(wx + 0.26, wy, wz + 0.38, wx + 0.42, wy + 0.60, wz + 0.54, 0.38, 0.74, 0.18, skyLight, blkLight, emissive);
            this.addMicroBox(wx + 0.58, wy, wz + 0.44, wx + 0.74, wy + 0.48, wz + 0.62, 0.30, 0.62, 0.14, skyLight, blkLight, emissive);
          } else if (type === 59 || type === 60) {
            // Flores Vermelha e Amarela
            const isRed = type === 59;
            this.addMicroBox(wx + 0.45, wy, wz + 0.45, wx + 0.55, wy + 0.58, wz + 0.55, 0.28, 0.55, 0.12, skyLight, blkLight, emissive);
            this.addMicroBox(wx + 0.32, wy + 0.20, wz + 0.44, wx + 0.45, wy + 0.30, wz + 0.56, 0.32, 0.60, 0.15, skyLight, blkLight, emissive);
            const pr = isRed ? 0.90 : 0.99;
            const pg = isRed ? 0.22 : 0.85;
            const pb = isRed ? 0.21 : 0.21;
            this.addMicroBox(wx + 0.26, wy + 0.54, wz + 0.26, wx + 0.74, wy + 0.76, wz + 0.74, pr, pg, pb, skyLight, blkLight, Math.min(1.0, emissive + 0.2));
            const mr = isRed ? 1.0 : 0.88;
            const mg = isRed ? 0.92 : 0.50;
            const mb = isRed ? 0.22 : 0.10;
            this.addMicroBox(wx + 0.38, wy + 0.72, wz + 0.38, wx + 0.62, wy + 0.82, wz + 0.62, mr, mg, mb, skyLight, blkLight, Math.min(1.0, emissive + 0.3));
          } else if (type === 55) {
            // Amethyst Cluster (Cristais de Ametista 3D)
            const crystalEmissive = Math.min(1.0, emissive * 1.35 + 0.25);
            this.addMicroBox(wx + 0.36, wy, wz + 0.36, wx + 0.64, wy + 0.76, wz + 0.64, 0.70, 0.53, 0.94, skyLight, blkLight, crystalEmissive);
            this.addMicroBox(wx + 0.22, wy, wz + 0.34, wx + 0.40, wy + 0.44, wz + 0.52, 0.61, 0.40, 0.88, skyLight, blkLight, crystalEmissive);
            this.addMicroBox(wx + 0.60, wy, wz + 0.42, wx + 0.78, wy + 0.36, wz + 0.60, 0.79, 0.65, 1.0, skyLight, blkLight, crystalEmissive);
          } else if (type === 46) {
            // Glow Lichen (Líquen Luminoso): camada fina rente ao bloco
            this.addMicroBox(wx + 0.08, wy, wz + 0.08, wx + 0.92, wy + 0.08, wz + 0.92, 0.50, 0.89, 0.63, skyLight, blkLight, Math.min(1.0, emissive * 1.25 + 0.2));
          } else if (type === 68) {
            // Vitória-Régia (Giant Water Lily com flor e borda elevada)
            this.renderVictoriaRegia(wx, wy, wz, skyLight, blkLight, emissive);
          } else if (type === 69) {
            // Flor de Esporos (Spore Blossom suspensa no teto)
            this.renderSporeBlossom(wx, wy, wz, skyLight, blkLight, emissive);
          } else if (type === 70) {
            // Flor da Caverna / Azaléia florida 3D
            this.renderCaveFlower(wx, wy, wz, skyLight, blkLight, emissive);
          } else if (type === 71) {
            // Raízes Suspensas (Hanging Roots)
            this.renderHangingRoots(wx, wy, wz, skyLight, blkLight, emissive);
          } else if (type === 72) {
            // Folha-Gota Gigante (Big Dripleaf)
            this.renderBigDripleaf(wx, wy, wz, skyLight, blkLight, emissive);
          } else {
            // Fallback genérico para micro-voxels
            const color = blockRegistry.getColor(type);
            const cr = ((color >> 16) & 0xff) / 255;
            const cg = ((color >>  8) & 0xff) / 255;
            const cb = ( color        & 0xff) / 255;
            this.addMicroBox(wx + 0.28, wy, wz + 0.28, wx + 0.72, wy + 0.52, wz + 0.72, cr, cg, cb, skyLight, blkLight, emissive);
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
