import blockSides from '../../constants/block-sides';
import blockTypes from '../../constants/block-types';
import { BlockType, ChunkBorders, ChunkDataResult } from '../../types';

export default class ChunkGeometry {
  private opaquePositions: number[] = [];
  private opaqueNormals:   number[] = [];
  private opaqueUvs:       number[] = [];
  private opaqueColors:    number[] = [];
  private opaqueAo:        number[] = [];
  private opaqueVertices:  number[] = [];

  private waterPositions: number[] = [];
  private waterNormals:   number[] = [];
  private waterUvs:       number[] = [];
  private waterColors:    number[] = [];
  private waterAo:        number[] = [];
  private waterVertices:  number[] = [];

  constructor(chunkData: ChunkDataResult, neighbourBorderBlocks: ChunkBorders = {}) {
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

  private isSolid(
      nx: number, ny: number, nz: number,
      blocks: Int8Array, borders: ChunkBorders,
      startX: number, startY: number, startZ: number, size: number
  ): number {
    const t = this.getNeighbourBlock(nx, ny, nz, blocks, borders, startX, startY, startZ, size);
    return (t !== -1 && t !== BlockType.Empty && t !== BlockType.Water) ? 1 : 0;
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

            if (type === -1 || type === BlockType.Empty) {
              mask[j * size + k] = 0;
              continue;
            }

            // Neighbour world-coords in the face direction
            const wx = start[0] + lx + dir[0];
            const wy = start[1] + ly + dir[1];
            const wz = start[2] + lz + dir[2];
            const nType = this.getNeighbourBlock(wx, wy, wz, blocks, borders, startX, startY, startZ, size);

            let visible = false;
            if (type === BlockType.Water) {
              // Water faces are only visible toward air or unknown chunk borders.
              // water→solid: culled — the solid already renders its face toward water
              //              (that solid face is what you see through the transparent water).
              // water→water: culled — interior of the water volume.
              if (nType === -1 || nType === BlockType.Empty) visible = true;
            } else {
              // Solid block faces
              if (nType === -1 || nType === BlockType.Empty) visible = true;
              else if (nType === BlockType.Water)             visible = true; // visible through transparent water
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

            // Expand w along k (v-axis)
            // Water is intentionally NOT greedy-merged: the wave shader displaces
            // pos.y per-vertex using sin/cos. Merging water into large quads reduces
            // vertex density and the GPU's linear interpolation loses the wave shape
            // (a 32-unit quad has only 4 verts, missing all intermediate sine cycles).
            // Solid blocks have no per-vertex displacement so greedy is safe for them.
            const isWater = type === BlockType.Water;
            let w = 1;
            if (!isWater) {
              while (k + w < size) {
                const ni = j * size + (k + w);
                if (mask[ni] !== tpo) break;
                const nb = ni * 4;
                if (aoMask[nb] !== ao0 || aoMask[nb+1] !== ao1 || aoMask[nb+2] !== ao2 || aoMask[nb+3] !== ao3) break;
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
                  const nb = ni * 4;
                  if (aoMask[nb] !== ao0 || aoMask[nb+1] !== ao1 || aoMask[nb+2] !== ao2 || aoMask[nb+3] !== ao3) break outer;
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

            const baseIdx = tPos.length / 3;
            const def = blockTypes[type as BlockType];
            const cr = ((def.color >> 16) & 0xff) / 255;
            const cg = ((def.color >>  8) & 0xff) / 255;
            const cb = ( def.color        & 0xff) / 255;
            const aoVals = [ao0, ao1, ao2, ao3];

            for (let vi = 0; vi < 4; vi++) {
              const { pos: cp, uv } = corners[vi];
              // cp[axis] = 0 or 1 → offset in the normal direction (no expansion here)
              // cp[u]    = 0 or 1 → corner extent on u-axis; h expands this direction
              // cp[v]    = 0 or 1 → corner extent on v-axis; w expands this direction
              const fc = [0, 0, 0];
              fc[axis] = start[axis] + i + cp[axis];
              fc[u]    = start[u]    + j + cp[u] * h;
              fc[v]    = start[v]    + k + cp[v] * w;

              tPos.push(fc[0], fc[1], fc[2]);
              tNorm.push(dir[0], dir[1], dir[2]);
              tCol.push(cr, cg, cb);
              // UV tiles per block: scale by quad dimensions
              // uv[0] spans the v-axis (k), uv[1] spans the u-axis (j)
              tUv.push(uv[0] * w, uv[1] * h);
              tAo.push(aoVals[vi] / 3.0);
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
        isWater:      new Float32Array(this.waterPositions.length / 3).fill(1.0),
        creationTime: new Float32Array(this.waterPositions.length / 3).fill(0.0),
        vertices:     new Uint32Array(this.waterVertices),
      }
    };
  }
}
