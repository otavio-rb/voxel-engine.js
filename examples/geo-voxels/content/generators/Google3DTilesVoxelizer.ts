import { AIR } from '@voxel/engine/chunk-worker';
import { BlockType, geoVegetationScore, rgbToGeoBlockId } from '../blocks';

export const GEO_RADIUS_METERS = 150;
export const GEO_GRID_HALF_XZ = GEO_RADIUS_METERS;
export const GEO_GRID_SIZE_XZ = GEO_GRID_HALF_XZ * 2; // 300x300 blocos (1m/bloco)
export const GEO_GRID_SIZE_Y = 160;                   // 0..159 blocos de altura (cobre arranha-céus e torres de Niemeyer)
export const SURFACE_VOXEL_Y = 28;                    // Nível base da Av. Paulista / Esplanada MASP
export const MAX_GEOMETRIC_ERROR = 2.85;

export interface GeoLocationPreset {
  id: string;
  name: string;
  description: string;
  lat: number;
  lon: number;
  alt: number;
}

export const GEO_PRESETS: Record<string, GeoLocationPreset> = {
  paulista_masp: {
    id: 'paulista_masp',
    name: 'Av. Paulista / MASP (SP)',
    description: 'Reconstrução 3D via Google Photorealistic 3D Tiles: MASP (pórticos vermelhos e Vão Livre), Parque Trianon e arranha-céus da Avenida Paulista.',
    lat: -23.561414,
    lon: -46.655882,
    alt: 815
  },
  trianon: {
    id: 'trianon',
    name: 'Parque Trianon & Paulista (SP)',
    description: 'Mata Atlântica remanescente do Parque Tenente Siqueira Campos (Trianon) cercada pelos edifícios da Avenida Paulista.',
    lat: -23.562420,
    lon: -46.656850,
    alt: 815
  },
  cristo: {
    id: 'cristo',
    name: 'Cristo Redentor • Corcovado (RJ)',
    description: 'Topo do Morro do Corcovado e monumento do Cristo Redentor reconstruídos em voxels 3D a partir do Google Map Tiles.',
    lat: -22.951916,
    lon: -43.210487,
    alt: 695
  },
  congresso: {
    id: 'congresso',
    name: 'Congresso Nacional (Brasília)',
    description: 'Eixo Monumental e cúpulas do Congresso Nacional de Oscar Niemeyer via Google Photorealistic 3D Tiles.',
    lat: -15.799710,
    lon: -47.864130,
    alt: 1040
  }
};

const GOOGLE_MAPS_API_KEY: string =
  (import.meta as any).env?.VITE_GOOGLE_MAPS_API_KEY ?? '';

/**
 * Versão do ALGORITMO de geração do volume. Suba este número a cada mudança que altere
 * os voxels produzidos -- paleta, amostragem, classificação de vegetação, solidificação.
 *
 * O volume pronto fica no IndexedDB do navegador, e um volume em cache é servido sem
 * nem olhar os tiles. Esquecer de subir isto faz o jogador continuar vendo o resultado
 * do algoritmo antigo, para sempre, sem nenhum sinal de que algo mudou -- e quem testa
 * num perfil limpo não reproduz o problema. Por isso o número vive num lugar só, e não
 * duplicado no nome do banco e na chave.
 *
 * v14: copas por watershed do CHM, decididas por forma da bacia e distância até parede.
 */
const GEN_ALGO_VERSION = 14;

const IDB_NAME = `geo-voxels-game-cache-v${GEN_ALGO_VERSION}`;
const IDB_STORE = 'volumes';
const STATUS_CHANNEL = 'geo-voxels-status';

export interface GeoStatusPayload {
  phase: 'tileset' | 'downloading' | 'solidifying' | 'ready' | 'error';
  text: string;
  progress: number;
}

function broadcastStatus(msg: GeoStatusPayload): void {
  try {
    if (typeof BroadcastChannel !== 'undefined') {
      const ch = new BroadcastChannel(STATUS_CHANNEL);
      ch.postMessage(msg);
      ch.close();
    }
  } catch {
    // Ignore broadcast errors
  }
}

interface DecodedTexture {
  width: number;
  height: number;
  data: Uint8ClampedArray;
}

interface ParsedPrimitive {
  positionsENU: Float32Array;
  uvs: Float32Array | null;
  indices: Uint32Array | null;
  texture: DecodedTexture | null;
  baseColor: [number, number, number];
  /**
   * Erro geometrico, em metros, do tile de onde esta primitiva veio. Tiles vizinhos
   * nem sempre terminam no mesmo nivel da hierarquia, entao o mesmo terreno pode ser
   * coberto por malhas de resolucoes diferentes. Rasterizar do mais grosso para o mais
   * fino faz o tile fino sempre vencer, em vez de vencer quem chegou por ultimo no lote.
   */
  geometricError: number;
}

function latLonAltToECEF(latDeg: number, lonDeg: number, alt: number): [number, number, number] {
  const a = 6378137.0;
  const e2 = 0.00669437999014;
  const lat = (latDeg * Math.PI) / 180;
  const lon = (lonDeg * Math.PI) / 180;
  const sinLat = Math.sin(lat);
  const cosLat = Math.cos(lat);
  const sinLon = Math.sin(lon);
  const cosLon = Math.cos(lon);
  const N = a / Math.sqrt(1 - e2 * sinLat * sinLat);
  return [
    (N + alt) * cosLat * cosLon,
    (N + alt) * cosLat * sinLon,
    (N * (1 - e2) + alt) * sinLat
  ];
}

function distToOBB(pt: [number, number, number], box: number[]): number {
  const cx = box[0], cy = box[1], cz = box[2];
  const ux = box[3], uy = box[4], uz = box[5];
  const vx = box[6], vy = box[7], vz = box[8];
  const wx = box[9], wy = box[10], wz = box[11];
  const lu = Math.hypot(ux, uy, uz);
  const lv = Math.hypot(vx, vy, vz);
  const lw = Math.hypot(wx, wy, wz);
  const dx = pt[0] - cx, dy = pt[1] - cy, dz = pt[2] - cz;
  const pu = lu > 0 ? Math.max(-lu, Math.min(lu, (dx * ux + dy * uy + dz * uz) / lu)) : 0;
  const pv = lv > 0 ? Math.max(-lv, Math.min(lv, (dx * vx + dy * vy + dz * vz) / lv)) : 0;
  const pw = lw > 0 ? Math.max(-lw, Math.min(lw, (dx * wx + dy * wy + dz * wz) / lw)) : 0;
  const closestX = cx + (lu > 0 ? (pu / lu) * ux : 0) + (lv > 0 ? (pv / lv) * vx : 0) + (lw > 0 ? (pw / lw) * wx : 0);
  const closestY = cy + (lu > 0 ? (pu / lu) * uy : 0) + (lv > 0 ? (pv / lv) * vy : 0) + (lw > 0 ? (pw / lw) * wy : 0);
  const closestZ = cz + (lu > 0 ? (pu / lu) * uz : 0) + (lv > 0 ? (pv / lv) * vz : 0) + (lw > 0 ? (pw / lw) * wz : 0);
  return Math.hypot(pt[0] - closestX, pt[1] - closestY, pt[2] - closestZ);
}

function multiplyMat4(a: number[], b: number[]): number[] {
  const out = new Array<number>(16);
  for (let col = 0; col < 4; col++) {
    for (let row = 0; row < 4; row++) {
      out[col * 4 + row] =
        a[0 * 4 + row] * b[col * 4 + 0] +
        a[1 * 4 + row] * b[col * 4 + 1] +
        a[2 * 4 + row] * b[col * 4 + 2] +
        a[3 * 4 + row] * b[col * 4 + 3];
    }
  }
  return out;
}

function composeNodeMatrix(node: any): number[] {
  if (Array.isArray(node.matrix) && node.matrix.length === 16) {
    return node.matrix;
  }
  const t = node.translation ?? [0, 0, 0];
  const r = node.rotation ?? [0, 0, 0, 1];
  const s = node.scale ?? [1, 1, 1];
  const [x, y, z, w] = r;
  const x2 = x + x, y2 = y + y, z2 = z + z;
  const xx = x * x2, xy = x * y2, xz = x * z2;
  const yy = y * y2, yz = y * z2, zz = z * z2;
  const wx = w * x2, wy = w * y2, wz = w * z2;
  const sx = s[0], sy = s[1], sz = s[2];

  return [
    (1 - (yy + zz)) * sx, (xy + wz) * sx, (xz - wy) * sx, 0,
    (xy - wz) * sy, (1 - (xx + zz)) * sy, (yz + wx) * sy, 0,
    (xz + wy) * sz, (yz - wx) * sz, (1 - (xx + yy)) * sz, 0,
    t[0], t[1], t[2], 1
  ];
}

function openCacheDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(IDB_STORE)) {
        db.createObjectStore(IDB_STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function readCachedVolume(key: string): Promise<Int16Array | null> {
  try {
    const db = await openCacheDB();
    return await new Promise<Int16Array | null>((resolve) => {
      const tx = db.transaction(IDB_STORE, 'readonly');
      const req = tx.objectStore(IDB_STORE).get(key);
      req.onsuccess = () => {
        db.close();
        resolve(req.result instanceof Int16Array ? req.result : null);
      };
      req.onerror = () => {
        db.close();
        resolve(null);
      };
    });
  } catch {
    return null;
  }
}

async function writeCachedVolume(key: string, data: Int16Array): Promise<void> {
  try {
    const db = await openCacheDB();
    await new Promise<void>((resolve) => {
      const tx = db.transaction(IDB_STORE, 'readwrite');
      tx.objectStore(IDB_STORE).put(data, key);
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => {
        db.close();
        resolve();
      };
    });
  } catch {
    // Ignore quota errors
  }
}

export async function clearGeoCache(): Promise<void> {
  try {
    const db = await openCacheDB();
    await new Promise<void>((resolve) => {
      const tx = db.transaction(IDB_STORE, 'readwrite');
      tx.objectStore(IDB_STORE).clear();
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => {
        db.close();
        resolve();
      };
    });
  } catch {
    // ignore
  }
}

export class Google3DTilesVoxelizer {
  private volumes = new Map<string, Int16Array>();
  private loadingPromises = new Map<string, Promise<Int16Array>>();

  public async ensurePresetLoaded(presetId: string): Promise<Int16Array> {
    const id = GEO_PRESETS[presetId] ? presetId : 'paulista_masp';
    if (this.volumes.has(id)) {
      return this.volumes.get(id)!;
    }
    if (this.loadingPromises.has(id)) {
      return this.loadingPromises.get(id)!;
    }
    const p = this.buildVolumeForPreset(GEO_PRESETS[id]).then((vol) => {
      this.volumes.set(id, vol);
      this.loadingPromises.delete(id);
      return vol;
    });
    this.loadingPromises.set(id, p);
    return p;
  }

  public getVoxel(presetId: string, worldX: number, worldY: number, worldZ: number): number {
    const id = GEO_PRESETS[presetId] ? presetId : 'paulista_masp';
    const vol = this.volumes.get(id);
    if (!vol) {
      return worldY <= SURFACE_VOXEL_Y ? rgbToGeoBlockId(45, 45, 48) : AIR;
    }
    const gx = worldX + GEO_GRID_HALF_XZ;
    const gz = worldZ + GEO_GRID_HALF_XZ;
    if (gx < 0 || gx >= GEO_GRID_SIZE_XZ || gz < 0 || gz >= GEO_GRID_SIZE_XZ) {
      if (worldY < 0) return AIR;
      if (worldY < SURFACE_VOXEL_Y) return rgbToGeoBlockId(58, 60, 64);
      if (worldY === SURFACE_VOXEL_Y) return rgbToGeoBlockId(45, 45, 48);
      return AIR;
    }
    if (worldY < 0) return AIR;
    if (worldY >= GEO_GRID_SIZE_Y) return AIR;

    const idx = (worldY * GEO_GRID_SIZE_XZ + gz) * GEO_GRID_SIZE_XZ + gx;
    return vol[idx];
  }

  /**
   * Decodifica a textura JPEG/PNG em um OffscreenCanvas ISOLADO por chamada,
   * eliminando qualquer condição de corrida entre tiles carregados em paralelo.
   */
  private async decodeImageBytes(bytes: Uint8Array, mimeType: string): Promise<DecodedTexture | null> {
    if (typeof createImageBitmap === 'undefined' || typeof OffscreenCanvas === 'undefined') {
      return null;
    }
    try {
      // Copia o slice para um Uint8Array próprio para garantir integridade do Blob
      const copy = new Uint8Array(bytes.byteLength);
      copy.set(bytes);
      const blob = new Blob([copy as unknown as BlobPart], { type: mimeType || 'image/jpeg' });
      const bitmap = await createImageBitmap(blob);
      const w = bitmap.width;
      const h = bitmap.height;
      const canvas = new OffscreenCanvas(w, h);
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) {
        bitmap.close();
        return null;
      }
      ctx.drawImage(bitmap, 0, 0);
      const data = new Uint8ClampedArray(ctx.getImageData(0, 0, w, h).data);
      bitmap.close();
      return { width: w, height: h, data };
    } catch {
      return null;
    }
  }

  private async buildVolumeForPreset(preset: GeoLocationPreset): Promise<Int16Array> {
    const totalVoxels = GEO_GRID_SIZE_XZ * GEO_GRID_SIZE_Y * GEO_GRID_SIZE_XZ;
    const cacheKey = `vol_v${GEN_ALGO_VERSION}_${preset.id}_${GEO_GRID_SIZE_XZ}_${GEO_GRID_SIZE_Y}`;

    const cached = await readCachedVolume(cacheKey);
    if (cached && cached.length === totalVoxels) {
      broadcastStatus({
        phase: 'ready',
        text: `${preset.name} pronto (cache local 3D)`,
        progress: 100
      });
      return cached;
    }

    if (!GOOGLE_MAPS_API_KEY) {
      broadcastStatus({
        phase: 'error',
        text: 'VITE_GOOGLE_MAPS_API_KEY não encontrada no .env!',
        progress: 100
      });
      return this.buildFallbackVolume();
    }

    try {
      broadcastStatus({
        phase: 'tileset',
        text: `Buscando árvore Google 3D Tiles: ${preset.name}...`,
        progress: 8
      });

      const originECEF = latLonAltToECEF(preset.lat, preset.lon, preset.alt);
      const maxSearchDist = GEO_RADIUS_METERS * 1.45;
      let sessionToken = '';

      const resolveTileUrl = (uri: string, baseUrl: string): string => {
        const u = new URL(uri, baseUrl);
        if (u.searchParams.has('session')) {
          sessionToken = u.searchParams.get('session')!;
        } else if (sessionToken) {
          u.searchParams.set('session', sessionToken);
        }
        u.searchParams.set('key', GOOGLE_MAPS_API_KEY);
        return u.toString();
      };

      const glbUrls: Array<{ url: string; geoErr: number }> = [];
      const visitedJson = new Set<string>();

      const traverseNode = async (node: any, baseUrl: string): Promise<void> => {
        if (node.boundingVolume?.box) {
          const d = distToOBB(originECEF, node.boundingVolume.box);
          if (d > maxSearchDist) return;
        }

        const uri: string | undefined = node.content?.uri || node.content?.url;
        const geoErr: number = node.geometricError ?? 0;

        if (uri && uri.includes('.json')) {
          const nextUrl = resolveTileUrl(uri, baseUrl);
          if (visitedJson.has(nextUrl)) return;
          visitedJson.add(nextUrl);
          const res = await fetch(nextUrl);
          if (!res.ok) return;
          const json = await res.json();
          if (json.root) {
            await traverseNode(json.root, nextUrl);
          }
          return;
        }

        if (!node.children || node.children.length === 0 || geoErr <= MAX_GEOMETRIC_ERROR) {
          if (uri && uri.includes('.glb')) {
            glbUrls.push({ url: resolveTileUrl(uri, baseUrl), geoErr });
          }
          return;
        }

        await Promise.all(node.children.map((child: any) => traverseNode(child, baseUrl)));
      };

      const rootUrl = `https://tile.googleapis.com/v1/3dtiles/root.json?key=${GOOGLE_MAPS_API_KEY}`;
      const rootRes = await fetch(rootUrl);
      if (!rootRes.ok) {
        throw new Error(`Google 3D Tiles API HTTP ${rootRes.status}`);
      }
      const rootJson = await rootRes.json();
      await traverseNode(rootJson.root, rootUrl);

      if (glbUrls.length === 0) {
        throw new Error('Nenhum tile .glb retornado pela API.');
      }

      const allPrimitives: ParsedPrimitive[] = [];
      const centerCellMinUp = new Float32Array(81).fill(Infinity);

      let loadedCount = 0;
      const concurrency = 16;
      for (let i = 0; i < glbUrls.length; i += concurrency) {
        const batch = glbUrls.slice(i, i + concurrency);
        const batchResults = await Promise.all(
          batch.map((tile) =>
            this.fetchAndParseGlb(
              tile.url,
              tile.geoErr,
              preset.lat,
              preset.lon,
              originECEF,
              centerCellMinUp
            )
          )
        );
        for (const prims of batchResults) {
          for (const p of prims) allPrimitives.push(p);
        }
        loadedCount += batch.length;
        const pct = Math.min(85, Math.round(12 + (loadedCount / glbUrls.length) * 73));
        broadcastStatus({
          phase: 'downloading',
          text: `Baixando e voxelizando Google 3D Tiles: ${loadedCount}/${glbUrls.length}...`,
          progress: pct
        });
      }

      const validCellMins: number[] = [];
      for (let c = 0; c < centerCellMinUp.length; c++) {
        if (Number.isFinite(centerCellMinUp[c])) validCellMins.push(centerCellMinUp[c]);
      }
      validCellMins.sort((a, b) => a - b);
      // Usa o percentil 55% para ancorar na esplanada/avenida (evitando o vale da 9 de Julho)
      const groundUpMeters =
        validCellMins.length > 0
          ? validCellMins[Math.floor(validCellMins.length * 0.55)]
          : 0;

      broadcastStatus({
        phase: 'solidifying',
        text: `Construindo estruturas 3D e filtrando cores fotogramétricas...`,
        progress: 92
      });

      const vol = new Int16Array(totalVoxels).fill(AIR);

      // Prioridade por voxel: quem ja escreveu ali e com que direito. Sem isto, a cor de
      // cada voxel era simplesmente a do ultimo triangulo que passou -- e como as malhas
      // de fotogrametria do Google tem geometria interna e de fundo atras da casca
      // visivel, "o ultimo" era arbitrario. Ver computeWritePriority.
      const priority = new Uint8Array(totalVoxels);

      // Rasteriza do tile mais grosso para o mais fino. Dentro de uma mesma resolucao, o
      // triangulo que passa mais perto do centro do voxel ganha.
      const errors = allPrimitives.map((pr) => pr.geometricError);
      const minErr = errors.length > 0 ? Math.min(...errors) : 0;
      const maxErr = errors.length > 0 ? Math.max(...errors) : 0;
      const sorted = allPrimitives.slice().sort((a, b) => b.geometricError - a.geometricError);
      for (const prim of sorted) {
        this.rasterizePrimitive(prim, groundUpMeters, vol, priority, minErr, maxErr);
      }

      this.solidifySubsurface(vol, preset.id);
      await writeCachedVolume(cacheKey, vol);

      broadcastStatus({
        phase: 'ready',
        text: `${preset.name} reconstruído (${glbUrls.length} tiles 3D)`,
        progress: 100
      });

      return vol;
    } catch (err: any) {
      broadcastStatus({
        phase: 'error',
        text: `Erro no Google 3D Tiles: ${err?.message || String(err)}`,
        progress: 100
      });
      return this.buildFallbackVolume();
    }
  }

  private async fetchAndParseGlb(
    url: string,
    geometricError: number,
    latDeg: number,
    lonDeg: number,
    originECEF: [number, number, number],
    centerCellMinUp: Float32Array
  ): Promise<ParsedPrimitive[]> {
    try {
      const res = await fetch(url);
      if (!res.ok) return [];
      const arrayBuf = await res.arrayBuffer();
      const view = new DataView(arrayBuf);
      const bytes = new Uint8Array(arrayBuf);

      if (arrayBuf.byteLength < 28 || view.getUint32(0, true) !== 0x46546c67) {
        return [];
      }

      const jsonLen = view.getUint32(12, true);
      const jsonText = new TextDecoder().decode(bytes.subarray(20, 20 + jsonLen));
      const gltf = JSON.parse(jsonText);
      const binOffset = 20 + jsonLen + 8;

      const decodedImages: Array<DecodedTexture | null> = [];
      if (Array.isArray(gltf.images)) {
        for (const img of gltf.images) {
          if (typeof img.bufferView === 'number') {
            const bv = gltf.bufferViews[img.bufferView];
            const start = binOffset + (bv.byteOffset || 0);
            const imgBytes = bytes.subarray(start, start + bv.byteLength);
            const tex = await this.decodeImageBytes(imgBytes, img.mimeType || 'image/jpeg');
            decodedImages.push(tex);
          } else {
            decodedImages.push(null);
          }
        }
      }

      const nodeWorldMatrices = new Map<number, number[]>();
      const visitNode = (nodeIdx: number, parentMat: number[]) => {
        const node = gltf.nodes?.[nodeIdx];
        if (!node) return;
        const localMat = composeNodeMatrix(node);
        const worldMat = multiplyMat4(parentMat, localMat);
        nodeWorldMatrices.set(nodeIdx, worldMat);
        if (Array.isArray(node.children)) {
          for (const childIdx of node.children) {
            visitNode(childIdx, worldMat);
          }
        }
      };

      const identity = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
      const rootNodes: number[] =
        gltf.scenes?.[gltf.scene ?? 0]?.nodes ??
        (Array.isArray(gltf.nodes) ? gltf.nodes.map((_: any, idx: number) => idx) : []);
      for (const nIdx of rootNodes) {
        if (!nodeWorldMatrices.has(nIdx)) visitNode(nIdx, identity);
      }

      const lat = (latDeg * Math.PI) / 180;
      const lon = (lonDeg * Math.PI) / 180;
      const sinLat = Math.sin(lat);
      const cosLat = Math.cos(lat);
      const sinLon = Math.sin(lon);
      const cosLon = Math.cos(lon);

      const primitivesOut: ParsedPrimitive[] = [];

      for (const [nodeIdx, mat] of nodeWorldMatrices.entries()) {
        const node = gltf.nodes[nodeIdx];
        if (typeof node.mesh !== 'number') continue;
        const mesh = gltf.meshes?.[node.mesh];
        if (!mesh || !Array.isArray(mesh.primitives)) continue;

        for (const prim of mesh.primitives) {
          if (prim.mode !== undefined && prim.mode !== 4) continue;
          const posAccIdx = prim.attributes?.POSITION;
          if (typeof posAccIdx !== 'number') continue;

          const posAcc = gltf.accessors[posAccIdx];
          const posBv = gltf.bufferViews[posAcc.bufferView];
          const posStart = binOffset + (posBv.byteOffset || 0) + (posAcc.byteOffset || 0);
          const posStride = posBv.byteStride || 12;
          const vCount = posAcc.count;

          const positionsENU = new Float32Array(vCount * 3);
          for (let i = 0; i < vCount; i++) {
            const off = posStart + i * posStride;
            const vx = view.getFloat32(off, true);
            const vy = view.getFloat32(off + 4, true);
            const vz = view.getFloat32(off + 8, true);

            const gx = mat[0] * vx + mat[4] * vy + mat[8] * vz + mat[12];
            const gy = mat[1] * vx + mat[5] * vy + mat[9] * vz + mat[13];
            const gz = mat[2] * vx + mat[6] * vy + mat[10] * vz + mat[14];

            const dx = gx - originECEF[0];
            const dy = -gz - originECEF[1];
            const dz = gy - originECEF[2];

            const east = -sinLon * dx + cosLon * dy;
            const north = -sinLat * cosLon * dx - sinLat * sinLon * dy + cosLat * dz;
            const up = cosLat * cosLon * dx + cosLat * sinLon * dy + sinLat * dz;

            positionsENU[i * 3] = east;
            positionsENU[i * 3 + 1] = north;
            positionsENU[i * 3 + 2] = up;

            if (Math.abs(east) <= 45 && Math.abs(north) <= 45) {
              const cx = Math.min(8, Math.max(0, Math.floor((east + 45) / 10)));
              const cz = Math.min(8, Math.max(0, Math.floor((north + 45) / 10)));
              const cellIdx = cz * 9 + cx;
              if (up < centerCellMinUp[cellIdx]) {
                centerCellMinUp[cellIdx] = up;
              }
            }
          }

          let uvs: Float32Array | null = null;
          const uvAccIdx = prim.attributes?.TEXCOORD_0;
          if (typeof uvAccIdx === 'number') {
            const uvAcc = gltf.accessors[uvAccIdx];
            const uvBv = gltf.bufferViews[uvAcc.bufferView];
            const uvStart = binOffset + (uvBv.byteOffset || 0) + (uvAcc.byteOffset || 0);
            const compType = uvAcc.componentType;
            const defaultStride = compType === 5126 ? 8 : compType === 5123 ? 4 : 2;
            const uvStride = uvBv.byteStride || defaultStride;
            uvs = new Float32Array(vCount * 2);

            for (let i = 0; i < vCount; i++) {
              const off = uvStart + i * uvStride;
              if (compType === 5126) {
                uvs[i * 2] = view.getFloat32(off, true);
                uvs[i * 2 + 1] = view.getFloat32(off + 4, true);
              } else if (compType === 5123) {
                uvs[i * 2] = view.getUint16(off, true) / 65535;
                uvs[i * 2 + 1] = view.getUint16(off + 2, true) / 65535;
              } else if (compType === 5121) {
                uvs[i * 2] = view.getUint8(off) / 255;
                uvs[i * 2 + 1] = view.getUint8(off + 1) / 255;
              }
            }
          }

          let indices: Uint32Array | null = null;
          if (typeof prim.indices === 'number') {
            const idxAcc = gltf.accessors[prim.indices];
            const idxBv = gltf.bufferViews[idxAcc.bufferView];
            const idxStart = binOffset + (idxBv.byteOffset || 0) + (idxAcc.byteOffset || 0);
            const iCount = idxAcc.count;
            indices = new Uint32Array(iCount);
            const compType = idxAcc.componentType;

            if (compType === 5123) {
              for (let i = 0; i < iCount; i++) {
                indices[i] = view.getUint16(idxStart + i * 2, true);
              }
            } else if (compType === 5125) {
              for (let i = 0; i < iCount; i++) {
                indices[i] = view.getUint32(idxStart + i * 4, true);
              }
            } else if (compType === 5121) {
              for (let i = 0; i < iCount; i++) {
                indices[i] = view.getUint8(idxStart + i);
              }
            }
          }

          let texture: DecodedTexture | null = null;
          let baseColor: [number, number, number] = [190, 195, 200];
          if (typeof prim.material === 'number') {
            const matDef = gltf.materials?.[prim.material];
            const pbr = matDef?.pbrMetallicRoughness;
            if (Array.isArray(pbr?.baseColorFactor)) {
              baseColor = [
                Math.round((pbr.baseColorFactor[0] ?? 1) * 255),
                Math.round((pbr.baseColorFactor[1] ?? 1) * 255),
                Math.round((pbr.baseColorFactor[2] ?? 1) * 255)
              ];
            }
            const texIdx = pbr?.baseColorTexture?.index;
            if (typeof texIdx === 'number') {
              const sourceIdx = gltf.textures?.[texIdx]?.source;
              if (typeof sourceIdx === 'number') {
                texture = decodedImages[sourceIdx] ?? null;
              }
            }
          }

          primitivesOut.push({
            positionsENU,
            uvs,
            indices,
            texture,
            baseColor,
            geometricError
          });
        }
      }

      return primitivesOut;
    } catch {
      return [];
    }
  }

  /**
   * Media dos texels cobertos pela pegada (footprint) de UM voxel na textura, ignorando o
   * padding preto [0,0,0] dos atlas empacotados do Google 3D Tiles.
   *
   * Substituiu uma janela fixa de 3x3 em resolucao cheia. A janela fixa errava nos dois
   * sentidos: quando um voxel de 1 m cobria dezenas de texels ela amostrava so o centro e
   * dava aliasing; quando cobria menos de um texel ela borrava tres e dessaturava a cor.
   * `halfU`/`halfV` vem da razao entre a area UV e a area em metros do triangulo, entao a
   * media cobre exatamente o que o voxel ocupa.
   */
  private sampleFootprintRGB(
    tex: DecodedTexture,
    u: number,
    v: number,
    halfU: number,
    halfV: number
  ): [number, number, number] {
    const w = tex.width;
    const h = tex.height;
    const data = tex.data;

    const cx = Math.floor((u - Math.floor(u)) * w);
    const cy = Math.floor((v - Math.floor(v)) * h);

    // Raio da pegada em texels, com pelo menos o texel central e teto de 5 para limitar
    // o custo: um voxel que cobre 400 texels nao fica mais fiel somando todos eles.
    const radX = Math.max(0, Math.min(5, Math.round(halfU * w)));
    const radY = Math.max(0, Math.min(5, Math.round(halfV * h)));

    let rSum = 0;
    let gSum = 0;
    let bSum = 0;
    let count = 0;

    for (let dy = -radY; dy <= radY; dy++) {
      const y = Math.min(h - 1, Math.max(0, cy + dy));
      for (let dx = -radX; dx <= radX; dx++) {
        const x = Math.min(w - 1, Math.max(0, cx + dx));
        const off = (y * w + x) * 4;
        const pr = data[off];
        const pg = data[off + 1];
        const pb = data[off + 2];
        if (pr < 12 && pg < 12 && pb < 12) continue;
        rSum += pr;
        gSum += pg;
        bSum += pb;
        count++;
      }
    }

    if (count === 0) {
      const off = (Math.min(h - 1, Math.max(0, cy)) * w + Math.min(w - 1, Math.max(0, cx))) * 4;
      const pr = data[off];
      const pg = data[off + 1];
      const pb = data[off + 2];
      if (pr < 12 && pg < 12 && pb < 12) {
        return [58, 62, 68];
      }
      return [pr, pg, pb];
    }

    return [rSum / count, gSum / count, bSum / count];
  }

  /**
   * Prioridade de escrita de uma amostra num voxel, empacotada num byte.
   *
   * Bits 6-7: nivel de resolucao do tile (0 = mais grosso, 3 = mais fino). Fica nos bits
   * altos de proposito -- um tile fino SEMPRE vence um grosso, por pior que seja a posicao
   * da amostra dentro do voxel, porque sua geometria e simplesmente mais confiavel.
   *
   * Bits 0-5: quao perto do centro do voxel a amostra caiu (63 = no centro). Dentro de uma
   * mesma resolucao, decide a superficie que de fato ocupa o voxel, em vez da que raspa um
   * canto dele. E isto que impede a geometria interna da malha de pintar a casca visivel.
   */
  private computeWritePriority(
    distSqToCenter: number,
    geometricError: number,
    minErr: number,
    maxErr: number
  ): number {
    const span = maxErr - minErr;
    const fineness = span > 1e-6 ? (maxErr - geometricError) / span : 1;
    const lodRank = Math.max(0, Math.min(3, Math.round(fineness * 3)));
    // 0.75 = distancia^2 maxima do centro de um cubo unitario ao seu canto (3 * 0.5^2).
    const closeness = Math.max(0, Math.min(63, Math.round((1 - distSqToCenter / 0.75) * 63)));
    return (lodRank << 6) | closeness;
  }

  private rasterizePrimitive(
    prim: ParsedPrimitive,
    groundUpMeters: number,
    vol: Int16Array,
    priority: Uint8Array,
    minErr: number,
    maxErr: number
  ): void {
    const pos = prim.positionsENU;
    const uvs = prim.uvs;
    const indices = prim.indices;
    const tex = prim.texture;
    const triCount = indices ? Math.floor(indices.length / 3) : Math.floor(pos.length / 9);

    const sizeXZ = GEO_GRID_SIZE_XZ;
    const sizeY = GEO_GRID_SIZE_Y;
    const halfXZ = GEO_GRID_HALF_XZ;
    const baseY = SURFACE_VOXEL_Y;

    for (let t = 0; t < triCount; t++) {
      const i0 = indices ? indices[t * 3] : t * 3;
      const i1 = indices ? indices[t * 3 + 1] : t * 3 + 1;
      const i2 = indices ? indices[t * 3 + 2] : t * 3 + 2;

      const x0 = pos[i0 * 3] + halfXZ;
      const y0 = pos[i0 * 3 + 2] - groundUpMeters + baseY;
      const z0 = -pos[i0 * 3 + 1] + halfXZ;

      const x1 = pos[i1 * 3] + halfXZ;
      const y1 = pos[i1 * 3 + 2] - groundUpMeters + baseY;
      const z1 = -pos[i1 * 3 + 1] + halfXZ;

      const x2 = pos[i2 * 3] + halfXZ;
      const y2 = pos[i2 * 3 + 2] - groundUpMeters + baseY;
      const z2 = -pos[i2 * 3 + 1] + halfXZ;

      if (
        (x0 < 0 && x1 < 0 && x2 < 0) ||
        (x0 >= sizeXZ && x1 >= sizeXZ && x2 >= sizeXZ) ||
        (z0 < 0 && z1 < 0 && z2 < 0) ||
        (z0 >= sizeXZ && z1 >= sizeXZ && z2 >= sizeXZ) ||
        (y0 < 0 && y1 < 0 && y2 < 0) ||
        (y0 >= sizeY && y1 >= sizeY && y2 >= sizeY)
      ) {
        continue;
      }

      const u0 = uvs ? uvs[i0 * 2] : 0.5;
      const v0 = uvs ? uvs[i0 * 2 + 1] : 0.5;
      const u1 = uvs ? uvs[i1 * 2] : 0.5;
      const v1 = uvs ? uvs[i1 * 2 + 1] : 0.5;
      const u2 = uvs ? uvs[i2 * 2] : 0.5;
      const v2 = uvs ? uvs[i2 * 2 + 1] : 0.5;

      const d01 = Math.hypot(x1 - x0, y1 - y0, z1 - z0);
      const d02 = Math.hypot(x2 - x0, y2 - y0, z2 - z0);
      const d12 = Math.hypot(x2 - x1, y2 - y1, z2 - z1);
      const maxEdge = Math.max(d01, d02, d12);

      // Pegada UV de um voxel de 1 m neste triangulo: raiz da razao entre a area no
      // espaco UV e a area em metros. Alimenta sampleFootprintRGB para que a media de
      // texels cubra exatamente o que o voxel ocupa, nem mais nem menos.
      const uvArea = Math.abs((u1 - u0) * (v2 - v0) - (u2 - u0) * (v1 - v0)) * 0.5;
      const ax = x1 - x0, ay = y1 - y0, az = z1 - z0;
      const bx = x2 - x0, by = y2 - y0, bz = z2 - z0;
      const nx = ay * bz - az * by;
      const ny = az * bx - ax * bz;
      const nz = ax * by - ay * bx;
      const worldArea = Math.hypot(nx, ny, nz) * 0.5;
      const uvPerMeter = worldArea > 1e-9 ? Math.sqrt(uvArea / worldArea) : 0;
      const halfFootprint = uvPerMeter * 0.5;

      // Caixa UV do triangulo, encolhida por meia pegada. Serve de limite duro contra
      // sangramento para a ilha vizinha do atlas empacotado. Substituiu o antigo "puxao de
      // 16% para o baricentro", que evitava o sangramento comprimindo a faixa tonal de
      // TODO triangulo em 16% -- custando contraste em cada voxel para resolver as bordas.
      const uMin = Math.min(u0, u1, u2);
      const uMax = Math.max(u0, u1, u2);
      const vMin = Math.min(v0, v1, v2);
      const vMax = Math.max(v0, v1, v2);
      const uLo = Math.min(uMin + halfFootprint, (uMin + uMax) * 0.5);
      const uHi = Math.max(uMax - halfFootprint, (uMin + uMax) * 0.5);
      const vLo = Math.min(vMin + halfFootprint, (vMin + vMax) * 0.5);
      const vHi = Math.max(vMax - halfFootprint, (vMin + vMax) * 0.5);

      const fallbackBlockId = rgbToGeoBlockId(
        prim.baseColor[0],
        prim.baseColor[1],
        prim.baseColor[2]
      );

      // 2.2 amostras por metro cobre um voxel de 1 m com folga. O teto antigo de 120 abria
      // buracos em qualquer triangulo com aresta acima de ~54 m -- e o chao e as fachadas
      // lisas dos tiles grossos sao exatamente triangulos grandes.
      const steps = Math.min(384, Math.max(1, Math.ceil(maxEdge * 2.2)));
      const invSteps = 1 / steps;

      for (let a = 0; a <= steps; a++) {
        const w1 = a * invSteps;
        const maxB = steps - a;
        for (let b = 0; b <= maxB; b++) {
          const w2 = b * invSteps;
          const w0 = 1 - w1 - w2;

          const fx = w0 * x0 + w1 * x1 + w2 * x2;
          const fy = w0 * y0 + w1 * y1 + w2 * y2;
          const fz = w0 * z0 + w1 * z1 + w2 * z2;

          const gx = Math.floor(fx);
          const gy = Math.floor(fy);
          const gz = Math.floor(fz);

          if (gx < 0 || gx >= sizeXZ || gy < 0 || gy >= sizeY || gz < 0 || gz >= sizeXZ) {
            continue;
          }

          const idx = (gy * sizeXZ + gz) * sizeXZ + gx;

          const cdx = fx - (gx + 0.5);
          const cdy = fy - (gy + 0.5);
          const cdz = fz - (gz + 0.5);
          const prio = this.computeWritePriority(
            cdx * cdx + cdy * cdy + cdz * cdz,
            prim.geometricError,
            minErr,
            maxErr
          );

          // `>=` e nao `>`: dentro de uma amostragem com prioridades empatadas o
          // comportamento volta a ser o antigo, mas o empate agora e raro.
          if (vol[idx] !== AIR && prio < priority[idx]) continue;

          let blockId = fallbackBlockId;
          if (tex) {
            let u = w0 * u0 + w1 * u1 + w2 * u2;
            let v = w0 * v0 + w1 * v1 + w2 * v2;
            if (u < uLo) u = uLo; else if (u > uHi) u = uHi;
            if (v < vLo) v = vLo; else if (v > vHi) v = vHi;
            const loc = this.sampleFootprintRGB(tex, u, v, halfFootprint, halfFootprint);
            blockId = rgbToGeoBlockId(loc[0], loc[1], loc[2]);
          }

          vol[idx] = blockId;
          priority[idx] = prio;
        }
      }
    }
  }

  private solidifySubsurface(vol: Int16Array, presetId: string): void {
    const sizeXZ = GEO_GRID_SIZE_XZ;
    const sizeY = GEO_GRID_SIZE_Y;
    const halfXZ = GEO_GRID_HALF_XZ;

    // ── Etapa 1: Determinar a cota real do terreno (limitada estritamente à banda de solo) ──
    // NUNCA permite que solidifySubsurface suba até prédios suspensos (como o MASP em gy=36..54)
    // ou copas de árvores quando o solo abaixo foi ocluído pela câmera aérea.
    const subsoilBlock = rgbToGeoBlockId(58, 60, 64);
    const sidewalkBlock = rgbToGeoBlockId(185, 185, 185);
    const slabBlock = rgbToGeoBlockId(125, 125, 125);
    const maspRedBlock = rgbToGeoBlockId(220, 42, 38);

    const maxTerrainScanY = SURFACE_VOXEL_Y + 4;
    const rawGroundY = new Int16Array(sizeXZ * sizeXZ).fill(-1);
    const rawGroundBlock = new Int16Array(sizeXZ * sizeXZ).fill(subsoilBlock);

    for (let gz = 0; gz < sizeXZ; gz++) {
      for (let gx = 0; gx < sizeXZ; gx++) {
        const colIdx = gz * sizeXZ + gx;
        for (let gy = 2; gy <= maxTerrainScanY; gy++) {
          const b = vol[(gy * sizeXZ + gz) * sizeXZ + gx];
          if (b >= 0) {
            rawGroundY[colIdx] = gy;
            rawGroundBlock[colIdx] = b;
            break;
          }
        }
      }
    }

    const clampedGroundY = new Int16Array(sizeXZ * sizeXZ).fill(SURFACE_VOXEL_Y);
    const clampedGroundBlock = new Int16Array(sizeXZ * sizeXZ).fill(subsoilBlock);

    for (let gz = 0; gz < sizeXZ; gz++) {
      for (let gx = 0; gx < sizeXZ; gx++) {
        const colIdx = gz * sizeXZ + gx;
        let localMin = 32767;
        let localBlock: number = subsoilBlock;
        for (let dz = -3; dz <= 3; dz++) {
          const nz = gz + dz;
          if (nz < 0 || nz >= sizeXZ) continue;
          for (let dx = -3; dx <= 3; dx++) {
            const nx = gx + dx;
            if (nx < 0 || nx >= sizeXZ) continue;
            const nIdx = nz * sizeXZ + nx;
            const ny = rawGroundY[nIdx];
            if (ny !== -1 && ny < localMin) {
              localMin = ny;
              localBlock = rawGroundBlock[nIdx];
            }
          }
        }
        if (localMin === 32767) {
          clampedGroundY[colIdx] = SURFACE_VOXEL_Y;
          clampedGroundBlock[colIdx] = sidewalkBlock;
        } else if (rawGroundY[colIdx] === -1 || rawGroundY[colIdx] > localMin + 2) {
          clampedGroundY[colIdx] = localMin;
          clampedGroundBlock[colIdx] = localBlock;
        } else {
          clampedGroundY[colIdx] = rawGroundY[colIdx];
          clampedGroundBlock[colIdx] = rawGroundBlock[colIdx];
        }
      }
    }

    // Suaviza colunas onde o solo estava ocluído pela estrutura superior (rawGroundY === -1)
    for (let pass = 0; pass < 4; pass++) {
      for (let gz = 1; gz < sizeXZ - 1; gz++) {
        for (let gx = 1; gx < sizeXZ - 1; gx++) {
          const colIdx = gz * sizeXZ + gx;
          if (rawGroundY[colIdx] === -1) {
            clampedGroundY[colIdx] = Math.round(
              (clampedGroundY[colIdx - 1] +
                clampedGroundY[colIdx + 1] +
                clampedGroundY[colIdx - sizeXZ] +
                clampedGroundY[colIdx + sizeXZ]) *
                0.25
            );
          }
        }
      }
    }

    // Preenche rocha subterrânea APENAS até o solo inferior
    // Preserva intactos túneis, passagens subterrâneas e vãos livres
    for (let gz = 0; gz < sizeXZ; gz++) {
      for (let gx = 0; gx < sizeXZ; gx++) {
        const colIdx = gz * sizeXZ + gx;
        const surfY = clampedGroundY[colIdx];
        if (vol[(surfY * sizeXZ + gz) * sizeXZ + gx] === AIR) {
          vol[(surfY * sizeXZ + gz) * sizeXZ + gx] = clampedGroundBlock[colIdx];
        }
        for (let gy = 0; gy < surfY; gy++) {
          const idx = (gy * sizeXZ + gz) * sizeXZ + gx;
          if (vol[idx] === AIR) {
            vol[idx] = subsoilBlock;
          }
        }
      }
    }

    // ── Etapa 2: Preservação do Vão Livre do MASP e Remoção de Cortinas de Oclusão ──
    // Na fotogrametria aérea do Google, câmeras oblíquas geram cortinas verticais de oclusão
    // sob a caixa suspensa de 70m x 29m do museu.
    // Usamos a rotação exata da Av. Paulista (-35.2°) para limpar 100% o Vão Livre (7m livres),
    // erguer os 4 pilares vermelhos nas 4 esquinas verdadeiras e destacar as vigas dos pórticos.
    if (presetId === 'paulista_masp') {
      const theta = (-35.2 * Math.PI) / 180;
      const cosT = Math.cos(theta);
      const sinT = Math.sin(theta);

      // Caixa orientada do MASP:
      // u: ao longo da Av. Paulista (span de ~71m cobrindo a caixa)
      // v: transversal (largura de ~29m entre a Paulista e o Mirante 9 de Julho)
      const minU = -37;
      const maxU = 34;
      const minV = -24; // Borda voltada para a 9 de Julho / Trianon
      const maxV = 5;   // Borda voltada para a calçada da Av. Paulista

      // 1. Abertura do Vão Livre e nivelamento da Esplanada sob o museu
      for (let gz = 0; gz < sizeXZ; gz++) {
        for (let gx = 0; gx < sizeXZ; gx++) {
          const dx = gx - halfXZ;
          const dz = -(gz - halfXZ);
          const u = dx * cosT + dz * sinT;
          const v = -dx * sinT + dz * cosT;

          if (u >= minU && u <= maxU && v >= minV && v <= maxV) {
            // Piso nivelado da Esplanada no nível da calçada (SURFACE_VOXEL_Y)
            for (let gy = 0; gy < SURFACE_VOXEL_Y; gy++) {
              vol[(gy * sizeXZ + gz) * sizeXZ + gx] = subsoilBlock;
            }
            vol[(SURFACE_VOXEL_Y * sizeXZ + gz) * sizeXZ + gx] = sidewalkBlock;

            // VÃO LIVRE 100% OCO E DESOBSTRUÍDO (7 metros de pé-direito livre)
            for (let gy = SURFACE_VOXEL_Y + 1; gy <= SURFACE_VOXEL_Y + 7; gy++) {
              vol[(gy * sizeXZ + gz) * sizeXZ + gx] = AIR;
            }

            // Laje inferior da caixa suspensa (SURFACE_VOXEL_Y + 8)
            const slabY = SURFACE_VOXEL_Y + 8;
            const slabIdx = (slabY * sizeXZ + gz) * sizeXZ + gx;
            if (vol[slabIdx] === AIR) {
              vol[slabIdx] = slabBlock;
            }
          }
        }
      }

      // 2. Os 4 Pilares Monumentais nas 4 extremidades dos 2 pórticos
      const pillarConfigs: Array<{ u: number; v: number }> = [
        { u: -35, v: -21 }, // NW - lado 9 de Julho
        { u: -35, v: -2 },  // NW - lado Av. Paulista
        { u: 32, v: -21 },  // SE - lado 9 de Julho
        { u: 32, v: -2 }    // SE - lado Av. Paulista
      ];

      for (const p of pillarConfigs) {
        const east = p.u * cosT - p.v * sinT;
        const north = p.u * sinT + p.v * cosT;
        const px = Math.round(halfXZ + east);
        const pz = Math.round(halfXZ - north);

        for (let dz = -1; dz <= 1; dz++) {
          for (let dx = -1; dx <= 1; dx++) {
            const gx = px + dx;
            const gz = pz + dz;
            if (gx >= 0 && gx < sizeXZ && gz >= 0 && gz < sizeXZ) {
              for (let gy = SURFACE_VOXEL_Y + 1; gy <= SURFACE_VOXEL_Y + 25; gy++) {
                vol[(gy * sizeXZ + gz) * sizeXZ + gx] = maspRedBlock;
              }
            }
          }
        }
      }

      // 3. As duas grandes vigas longitudinais superiores (Pórticos do MASP)
      for (let u = minU; u <= maxU; u++) {
        for (const beamV of [-21, -2]) {
          for (let dv = -1; dv <= 1; dv++) {
            const curV = beamV + dv;
            const east = u * cosT - curV * sinT;
            const north = u * sinT + curV * cosT;
            const gx = Math.round(halfXZ + east);
            const gz = Math.round(halfXZ - north);
            if (gx >= 0 && gx < sizeXZ && gz >= 0 && gz < sizeXZ) {
              for (let gy = SURFACE_VOXEL_Y + 21; gy <= SURFACE_VOXEL_Y + 26; gy++) {
                const idx = (gy * sizeXZ + gz) * sizeXZ + gx;
                if (vol[idx] !== AIR) {
                  vol[idx] = maspRedBlock;
                }
              }
            }
          }
        }
      }
    }

    // ── Etapa 3: Classificação Determinística e Reconstrução de Árvores ──
    this.proceduralizeTrees(vol, clampedGroundY, presetId);
  }


  /**
   * Troca os maciços de vegetação da fotogrametria aérea por árvores reconstruídas:
   * tronco de verdade, vão livre para andar por baixo e copa estruturada.
   *
   * A classificação é GEOMÉTRICA, não por cor. A versão anterior decidia por
   * `isFoliageBlock`, um teste de "verde" sobre a cor quantizada, e isso falhava de forma
   * sistemática: copa em sombra ou em contraluz sai cinza-oliva neutra na foto aérea e não
   * passava no teste. O resultado era o pior dos dois mundos -- metade da gororoba
   * removida, metade deixada no lugar, sem tronco. Medido sobre a paleta assada, o teste
   * antigo reconhecia só 2 das 64 cores escuras da paleta como folhagem.
   *
   * O que separa árvore de prédio numa superfície fotogramétrica é a forma do topo:
   * telhado é plano e tem borda reta; copa é rugosa em toda a sua extensão. Então o sinal
   * principal aqui é o resíduo de um ajuste de plano ao topo numa janela 5x5. A cor entra
   * só como voto, e a altura como faixa plausível. É por isso que não há mais a caixa
   * recortada à mão em volta do MASP: o museu tem laje plana, o classificador o reconhece
   * como estrutura por conta própria.
   */
  private proceduralizeTrees(
    vol: Int16Array,
    clampedGroundY: Int16Array,
    presetId: string
  ): void {
    const sizeXZ = GEO_GRID_SIZE_XZ;
    const sizeY = GEO_GRID_SIZE_Y;
    const halfXZ = GEO_GRID_HALF_XZ;
    const cols = sizeXZ * sizeXZ;

    // ── 1. Features por coluna: topo da superfície, altura e cor média ──────────
    const topY = new Int16Array(cols).fill(-1);
    const heightAboveGround = new Int16Array(cols);
    const vegColorScore = new Float32Array(cols);
    /**
     * Maior sequência contígua de voxels sólidos numa coluna, acima do solo.
     *
     * É o detector de "tem suporte embaixo". A malha do Google é só superfície, então
     * tanto o telhado quanto a copa aparecem como casca fina -- espessura não separa os
     * dois. Mas a coluna que passa por uma PAREDE atravessa sólido do chão até a laje e
     * dá uma corrida longa, enquanto casca de copa dá corridas de 1 a 3 voxels soltas no
     * ar. É a tradução direta de "o Google não captou o tronco".
     */
    const maxVerticalRun = new Int16Array(cols);

    for (let gz = 0; gz < sizeXZ; gz++) {
      for (let gx = 0; gx < sizeXZ; gx++) {
        const colIdx = gz * sizeXZ + gx;
        const groundY = clampedGroundY[colIdx];

        let highest = -1;
        let scoreSum = 0;
        let solidCount = 0;
        let run = 0;
        let bestRun = 0;
        for (let gy = groundY + 1; gy < sizeY; gy++) {
          const b = vol[(gy * sizeXZ + gz) * sizeXZ + gx];
          if (b === AIR) {
            run = 0;
            continue;
          }
          if (++run > bestRun) bestRun = run;
          if (gy > highest) highest = gy;
          scoreSum += geoVegetationScore(b);
          solidCount++;
        }

        maxVerticalRun[colIdx] = bestRun;
        topY[colIdx] = highest;
        heightAboveGround[colIdx] = highest < 0 ? 0 : highest - groundY;
        vegColorScore[colIdx] = solidCount > 0 ? scoreSum / solidCount : 0;
      }
    }

    // ── 2. Rugosidade do topo: resíduo de um ajuste de plano em janela 5x5 ──────
    // Telhado plano, laje de Niemeyer e pista de avenida ajustam bem a um plano e dão
    // resíduo próximo de zero, inclusive quando são inclinados -- é por isso que o ajuste
    // é de PLANO e não a simples variância do topo, que marcaria toda rampa como copa.
    /** Mínimo de vizinhos para um ajuste de plano significar alguma coisa (de 25 da janela). */
    const MIN_FIT_NEIGHBORS = 8;

    const roughness = new Float32Array(cols);
    /**
     * Quantos vizinhos o ajuste de plano conseguiu usar em cada coluna.
     *
     * Vizinhos de menos nao e um detalhe de implementacao, e um SINAL: significa que
     * nenhuma superficie coerente passa por ali, ou seja, a coluna e detrito solto no ar.
     * A versao anterior tratava esse caso como rugosidade 0 -- isto e, como se fosse uma
     * laje perfeitamente lisa -- e era por isso que 72% da gororoba restante do Trianon
     * escapava da mascara: nao conseguir medir virava prova de que era estrutura.
     */
    const fitNeighbors = new Int16Array(cols);
    const RW = 2; // janela 5x5

    for (let gz = 0; gz < sizeXZ; gz++) {
      for (let gx = 0; gx < sizeXZ; gx++) {
        const colIdx = gz * sizeXZ + gx;
        if (heightAboveGround[colIdx] <= 0) continue;

        // Só entram na janela os vizinhos cujo topo está a até BAND metros do topo desta
        // coluna. Sem esse corte, a silhueta de um edifício -- onde o topo despenca 40 m
        // de um voxel para o outro -- produzia o maior resíduo do mapa inteiro e o prédio
        // era classificado como copa. O resíduo tem de medir a TEXTURA da superfície, não
        // o degrau entre duas superfícies diferentes.
        const BAND = 8;
        const centerTop = topY[colIdx];

        // Mínimos quadrados de h = a + b*dx + c*dz sobre a janela.
        let n = 0;
        let sx = 0, sz = 0, sh = 0;
        let sxx = 0, szz = 0, sxz = 0, sxh = 0, szh = 0;

        for (let dz = -RW; dz <= RW; dz++) {
          const nz = gz + dz;
          if (nz < 0 || nz >= sizeXZ) continue;
          for (let dx = -RW; dx <= RW; dx++) {
            const nx = gx + dx;
            if (nx < 0 || nx >= sizeXZ) continue;
            const nIdx = nz * sizeXZ + nx;
            if (topY[nIdx] < 0) continue;
            const h = topY[nIdx];
            if (Math.abs(h - centerTop) > BAND) continue;
            n++;
            sx += dx; sz += dz; sh += h;
            sxx += dx * dx; szz += dz * dz; sxz += dx * dz;
            sxh += dx * h; szh += dz * h;
          }
        }

        fitNeighbors[colIdx] = n;
        if (n < MIN_FIT_NEIGHBORS) continue;

        // Resolve o sistema normal 3x3 por Cramer; se for singular, cai na média.
        const m = [
          [n, sx, sz],
          [sx, sxx, sxz],
          [sz, sxz, szz]
        ];
        const rhs = [sh, sxh, szh];
        const det =
          m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1]) -
          m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0]) +
          m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0]);

        let a = sh / n;
        let bCoef = 0;
        let cCoef = 0;
        if (Math.abs(det) > 1e-6) {
          const solve = (col: number): number => {
            const mm = m.map((row) => row.slice());
            for (let r = 0; r < 3; r++) mm[r][col] = rhs[r];
            return (
              mm[0][0] * (mm[1][1] * mm[2][2] - mm[1][2] * mm[2][1]) -
              mm[0][1] * (mm[1][0] * mm[2][2] - mm[1][2] * mm[2][0]) +
              mm[0][2] * (mm[1][0] * mm[2][1] - mm[1][1] * mm[2][0])
            ) / det;
          };
          a = solve(0);
          bCoef = solve(1);
          cCoef = solve(2);
        }

        let sumSq = 0;
        let count = 0;
        for (let dz = -RW; dz <= RW; dz++) {
          const nz = gz + dz;
          if (nz < 0 || nz >= sizeXZ) continue;
          for (let dx = -RW; dx <= RW; dx++) {
            const nx = gx + dx;
            if (nx < 0 || nx >= sizeXZ) continue;
            const nIdx = nz * sizeXZ + nx;
            if (topY[nIdx] < 0) continue;
            if (Math.abs(topY[nIdx] - centerTop) > BAND) continue;
            const pred = a + bCoef * dx + cCoef * dz;
            const d = topY[nIdx] - pred;
            sumSq += d * d;
            count++;
          }
        }
        roughness[colIdx] = count > 0 ? Math.sqrt(sumSq / count) : 0;
      }
    }

    /** Altura mínima acima do solo para a coluna poder ser copa (abaixo disso é gramado). */
    const MIN_VEG_HEIGHT = 3;
    /**
     * Teto de altura da vegetação.
     *
     * Chegou a 40 numa versão anterior, apostando que o detector de parede barraria
     * edifício alto. Não barra: a malha do Google drapeja a copa até o chão, então copa
     * também dá corrida vertical longa e o detector não distingue os dois. Medido na
     * Paulista, o teto de 40 convertia 345 estruturas altas em árvore, contra 31 com 28.
     */
    const MAX_VEG_HEIGHT = 28;
    /** Corrida vertical a partir da qual a coluna é parede de verdade, não casca. */
    const WALL_RUN = 15;
    /** Distância média até parede a partir da qual não há edifício plausível por perto. */
    const FAR_FROM_WALL = 12;
    /** Teto de área para uma bacia longe de qualquer prédio (dossel fechado é largo). */
    const MAX_CANOPY_AREA = 900;
    /** Bacia menor que isto é ruído de fotogrametria, não copa. */
    const MIN_CROWN_AREA = 8;
    /** Bacia maior que isto é quarteirão ou cobertura, não uma árvore. */
    const MAX_CROWN_AREA = 420;
    /** Queda mínima do ápice até a média da bacia, em metros: o abaulamento da copa. */
    const MIN_CROWN_DROP = 1.2;
    /** Tolerância, em metros, para considerar uma célula "na cota do ápice". */
    const FLAT_TOLERANCE = 1.5;
    /** Acima desta fração da bacia na cota do ápice, o topo é plano: telhado. */
    const MAX_CROWN_FLAT_RATIO = 0.5;
    /** Verde médio da bacia que, sozinho, já confirma vegetação. */
    const MIN_BASIN_GREEN = 0.16;
    /** Rugosidade média da bacia que, sozinha, já confirma vegetação. */
    const MIN_BASIN_ROUGH = 0.7;

    // ── 3. Domínio candidato e modelo de altura de copa (CHM) ─────────────────
    //
    // A partir daqui o trabalho é por REGIÃO, não por coluna. Classificar coluna a
    // coluna não funciona neste dado, e isso foi medido: copa fechada de parque, a 1 m
    // de voxel, é uma superfície ondulada tão lisa quanto uma laje (rugosidade não
    // separa); na foto aérea ela é oliva escura, com verde médio 0.256 contra 0.153 do
    // edificado (cor não separa); e a malha do Google drapeja a copa até o chão numa
    // saia contínua, então árvore também produz coluna de sólido contínuo e não existe
    // nenhuma coluna a mais de 25 células de uma "parede", nem no miolo do Trianon
    // (sustentação não separa). Os três sinais descrevem a superfície, e as duas
    // superfícies se parecem.
    //
    // O que separa é a FORMA da região: copa é uma bacia compacta e abaulada em torno
    // de um ápice; telhado é uma região grande de topo plano. Então o CHM é segmentado
    // por watershed a partir dos ápices, e a decisão é tomada por bacia.
    const candidate = new Uint8Array(cols);
    for (let i = 0; i < cols; i++) {
      const h = heightAboveGround[i];
      if (h >= MIN_VEG_HEIGHT && h <= MAX_VEG_HEIGHT) candidate[i] = 1;
    }

    // ── Distância até a parede mais próxima ───────────────────────────────────
    //
    // Uma versão anterior tratou corrida vertical >= 5 como parede e concluiu que não
    // existe coluna longe de parede nem no miolo do parque -- o que matou a ideia de usar
    // sustentação. O limiar é que estava errado. O histograma de corridas é claramente
    // bimodal: 67 mil colunas têm corrida de 1 a 5 (casca de superfície, inclusive a saia
    // que a malha do Google drapeja em volta de cada árvore) e só alguns milhares passam
    // de 15, que são empena e torre de verdade. Com o limiar em 15, 35 mil das 74 mil
    // colunas de estrutura ficam a mais de 20 células de qualquer parede -- o miolo do
    // Trianon reaparece como região sem nenhum apoio construído por perto.
    const distToWall = new Int32Array(cols).fill(0x3fffffff);
    {
      const queue = new Int32Array(cols);
      let head = 0;
      let tail = 0;
      for (let i = 0; i < cols; i++) {
        if (maxVerticalRun[i] >= WALL_RUN) {
          distToWall[i] = 0;
          queue[tail++] = i;
        }
      }
      while (head < tail) {
        const cur = queue[head++];
        const cx = cur % sizeXZ;
        const cz = (cur - cx) / sizeXZ;
        const nd = distToWall[cur] + 1;
        for (let d = 0; d < 4; d++) {
          const nx = cx + (d === 0 ? 1 : d === 1 ? -1 : 0);
          const nz = cz + (d === 2 ? 1 : d === 3 ? -1 : 0);
          if (nx < 0 || nx >= sizeXZ || nz < 0 || nz >= sizeXZ) continue;
          const ni = nz * sizeXZ + nx;
          if (distToWall[ni] <= nd) continue;
          distToWall[ni] = nd;
          queue[tail++] = ni;
        }
      }
    }

    // Média 3x3 dentro do domínio: sem suavizar, um maciço fotogramétrico rugoso dá
    // dezenas de ápices a dois voxels um do outro e empilha árvores falsas.
    const chm = new Float32Array(cols);
    for (let gz = 0; gz < sizeXZ; gz++) {
      for (let gx = 0; gx < sizeXZ; gx++) {
        const colIdx = gz * sizeXZ + gx;
        if (!candidate[colIdx]) continue;
        let sum = 0;
        let n = 0;
        for (let dz = -1; dz <= 1; dz++) {
          const nz = gz + dz;
          if (nz < 0 || nz >= sizeXZ) continue;
          for (let dx = -1; dx <= 1; dx++) {
            const nx = gx + dx;
            if (nx < 0 || nx >= sizeXZ) continue;
            const nIdx = nz * sizeXZ + nx;
            if (!candidate[nIdx]) continue;
            sum += heightAboveGround[nIdx];
            n++;
          }
        }
        chm[colIdx] = n > 0 ? sum / n : 0;
      }
    }

    // ── 4. Ápices: máximos locais com janela proporcional à altura ─────────────
    const seeds: number[] = [];
    for (let gz = 0; gz < sizeXZ; gz++) {
      for (let gx = 0; gx < sizeXZ; gx++) {
        const colIdx = gz * sizeXZ + gx;
        if (!candidate[colIdx]) continue;
        const h = chm[colIdx];
        if (h < MIN_VEG_HEIGHT) continue;
        // Janela de supressão proporcional à altura, mas com teto baixo: copa urbana
        // tem raio de 3 a 6 m, e num dossel contínuo como o do Trianon uma janela de 7
        // apaga os ápices vizinhos e funde o parque inteiro em poucas bacias -- medido:
        // 310 bacias no parque todo, contra as centenas de árvores que existem lá.
        const win = Math.max(2, Math.min(5, Math.round(h * 0.22)));

        let isPeak = true;
        for (let dz = -win; dz <= win && isPeak; dz++) {
          const nz = gz + dz;
          if (nz < 0 || nz >= sizeXZ) continue;
          for (let dx = -win; dx <= win; dx++) {
            const nx = gx + dx;
            if (nx < 0 || nx >= sizeXZ) continue;
            if (dx === 0 && dz === 0) continue;
            if (dx * dx + dz * dz > win * win) continue;
            const nh = chm[nz * sizeXZ + nx];
            if (nh > h) { isPeak = false; break; }
            // Desempate determinístico e estável para platôs de altura igual.
            if (nh === h && nx * 73 + nz * 37 > gx * 73 + gz * 37) { isPeak = false; break; }
          }
        }
        if (isPeak) seeds.push(colIdx);
      }
    }

    // ── 5. Watershed a partir dos ápices ───────────────────────────────────────
    //
    // Inundação por prioridade: a célula mais alta ainda na fronteira é sempre a próxima
    // a ser absorvida, então cada bacia cresce morro abaixo a partir do seu ápice e as
    // fronteiras caem nas gargantas entre copas. A fila é um balde por altura inteira
    // (0..GEO_GRID_SIZE_Y), o que torna a ordenação linear em vez de O(n log n).
    const label = new Int32Array(cols).fill(-1);
    const buckets: number[][] = new Array(sizeY + 1);
    for (let i = 0; i <= sizeY; i++) buckets[i] = [];

    const pushCell = (idx: number, lab: number): void => {
      label[idx] = lab;
      const h = Math.max(0, Math.min(sizeY, Math.round(chm[idx])));
      buckets[h].push(idx);
    };

    for (let i = 0; i < seeds.length; i++) pushCell(seeds[i], i);

    for (let h = sizeY; h >= 0; h--) {
      const bucket = buckets[h];
      // `bucket` cresce enquanto é percorrido: vizinhos mais baixos entram em baldes
      // menores, que ainda serão visitados; vizinhos de mesma altura entram aqui mesmo.
      for (let qi = 0; qi < bucket.length; qi++) {
        const cur = bucket[qi];
        const lab = label[cur];
        const cx = cur % sizeXZ;
        const cz = (cur - cx) / sizeXZ;
        for (let d = 0; d < 4; d++) {
          const nx = cx + (d === 0 ? 1 : d === 1 ? -1 : 0);
          const nz = cz + (d === 2 ? 1 : d === 3 ? -1 : 0);
          if (nx < 0 || nx >= sizeXZ || nz < 0 || nz >= sizeXZ) continue;
          const ni = nz * sizeXZ + nx;
          if (!candidate[ni] || label[ni] !== -1) continue;
          // Só desce: subir sairia da bacia deste ápice e invadiria a vizinha.
          if (chm[ni] > chm[cur]) continue;
          pushCell(ni, lab);
        }
      }
      bucket.length = 0;
    }

    // ── 6. Estatística de forma por bacia e decisão ────────────────────────────
    const basinCount = seeds.length;
    const area = new Int32Array(basinCount);
    const sumH = new Float64Array(basinCount);
    const flatCells = new Int32Array(basinCount);
    const sumGreen = new Float64Array(basinCount);
    const sumRough = new Float64Array(basinCount);
    const sumDist = new Float64Array(basinCount);
    const peakH = new Float32Array(basinCount);

    for (let i = 0; i < basinCount; i++) peakH[i] = chm[seeds[i]];
    for (let i = 0; i < cols; i++) {
      const lab = label[i];
      if (lab < 0) continue;
      area[lab]++;
      sumH[lab] += chm[i];
      sumGreen[lab] += vegColorScore[i];
      sumRough[lab] += roughness[i];
      sumDist[lab] += distToWall[i];
      if (chm[i] >= peakH[lab] - FLAT_TOLERANCE) flatCells[lab]++;
    }

    interface Crown {
      x: number;
      z: number;
      baseY: number;
      height: number;
      radius: number;
      vegColor: number;
      label: number;
    }
    const crowns: Crown[] = [];
    const isCrownBasin = new Uint8Array(basinCount);

    for (let lab = 0; lab < basinCount; lab++) {
      const a = area[lab];
      const drop = peakH[lab] - sumH[lab] / a;
      const flatRatio = flatCells[lab] / a;
      const green = sumGreen[lab] / a;
      const rough = sumRough[lab] / a;
      const dist = sumDist[lab] / a;

      if (a < MIN_CROWN_AREA) continue;

      // Longe de qualquer parede não há o que proteger: nenhum edifício se sustenta ali.
      // Esta é a saída para o dossel fechado, que é o caso em que forma e cor falham --
      // copa fechada forma platô, com topo tão plano quanto um telhado, e era isso que
      // sobrava em massas vermelhas no miolo do Trianon.
      const farFromBuilding = dist >= FAR_FROM_WALL;

      if (farFromBuilding) {
        if (a > MAX_CANOPY_AREA) continue;
      } else {
        if (a > MAX_CROWN_AREA) continue;
        // Perto de prédio a forma precisa convencer: copa cai do ápice, laje não.
        if (drop < MIN_CROWN_DROP || flatRatio > MAX_CROWN_FLAT_RATIO) continue;
        // E ainda assim, cor ou rugosidade para barrar cobertura pequena e acidentada.
        if (green < MIN_BASIN_GREEN && rough < MIN_BASIN_ROUGH) continue;
      }

      const seed = seeds[lab];
      const sx = seed % sizeXZ;
      const sz = (seed - sx) / sizeXZ;
      isCrownBasin[lab] = 1;
      crowns.push({
        x: sx,
        z: sz,
        baseY: clampedGroundY[seed],
        height: heightAboveGround[seed],
        // Raio efetivo do disco de mesma área: a copa plantada herda o tamanho medido
        // da bacia, em vez de um palpite a partir da altura.
        radius: Math.max(2, Math.min(7, Math.round(Math.sqrt(a / Math.PI)))),
        vegColor: green,
        label: lab
      });
    }

    // ── 7. Remoção da bacia inteira ────────────────────────────────────────────
    // É isto que resolve a casca ENTRE as copas: apaga-se a bacia toda, e não só as
    // colunas que individualmente pontuaram. A bacia cobre a garganta até a copa
    // vizinha, que era exatamente o material que sobrava.
    for (let gz = 0; gz < sizeXZ; gz++) {
      for (let gx = 0; gx < sizeXZ; gx++) {
        const colIdx = gz * sizeXZ + gx;
        const lab = label[colIdx];
        if (lab < 0 || !isCrownBasin[lab]) continue;
        const groundY = clampedGroundY[colIdx];
        const top = topY[colIdx];
        for (let gy = groundY + 1; gy <= top && gy < sizeY; gy++) {
          vol[(gy * sizeXZ + gz) * sizeXZ + gx] = AIR;
        }
      }
    }

    // ── 8. Plantio determinístico ──────────────────────────────────────────────
    for (const crown of crowns) {
      this.plantTree(
        vol,
        crown.x,
        crown.z,
        crown.baseY,
        crown.height,
        crown.radius,
        crown.vegColor,
        presetId,
        halfXZ
      );
    }
  }

  /**
   * Uma árvore no lugar de uma copa medida: tronco do chão até a copa, vão livre embaixo
   * para o jogador passar, e elipsoide de folhas com borda irregular.
   *
   * A espécie sai da cor média da vegetação que estava ali mais o preset, nunca de
   * sorteio: o volume vai para o cache do IndexedDB e o jogador precisa reencontrar o
   * mesmo parque a cada carga.
   */
  private plantTree(
    vol: Int16Array,
    x: number,
    z: number,
    baseY: number,
    height: number,
    radius: number,
    vegColor: number,
    presetId: string,
    halfXZ: number
  ): void {
    const sizeXZ = GEO_GRID_SIZE_XZ;
    const sizeY = GEO_GRID_SIZE_Y;

    // Mata Atlântica remanescente do Trianon e trecho sul da Paulista: copa tropical,
    // mais fechada e mais escura. Verde muito saturado também indica folhagem tropical.
    const isTropical =
      presetId === 'trianon' ||
      (presetId === 'paulista_masp' && z > halfXZ) ||
      vegColor > 0.55;
    const trunkBlock = isTropical ? BlockType.JungleLog : BlockType.Wood;
    const foliageBlock = isTropical ? BlockType.JungleLeaves : BlockType.Leaves;

    const clearHeight = Math.max(3, Math.min(6, Math.floor(height * 0.4)));
    const trunkTop = baseY + height - 2;

    for (let gy = baseY + 1; gy <= trunkTop && gy < sizeY; gy++) {
      vol[(gy * sizeXZ + z) * sizeXZ + x] = trunkBlock;
    }
    if (height >= 10) {
      for (let gy = baseY + 1; gy <= baseY + 2 && gy < sizeY; gy++) {
        if (z + 1 < sizeXZ) vol[(gy * sizeXZ + (z + 1)) * sizeXZ + x] = trunkBlock;
        if (x + 1 < sizeXZ) vol[(gy * sizeXZ + z) * sizeXZ + (x + 1)] = trunkBlock;
      }
    }

    const crownCenterY = baseY + clearHeight + Math.round((height - clearHeight) * 0.55);
    const ry = Math.max(2, Math.round((height - clearHeight) * 0.55));

    for (let dy = -ry; dy <= ry + 1; dy++) {
      const gy = crownCenterY + dy;
      if (gy < baseY + clearHeight || gy >= sizeY) continue;
      for (let dz = -radius; dz <= radius; dz++) {
        const gz = z + dz;
        if (gz < 0 || gz >= sizeXZ) continue;
        for (let dx = -radius; dx <= radius; dx++) {
          const gx = x + dx;
          if (gx < 0 || gx >= sizeXZ) continue;

          const distSq =
            (dx * dx) / (radius * radius) + (dz * dz) / (radius * radius) + (dy * dy) / (ry * ry);
          const jitter =
            Math.abs(Math.sin(gx * 12.9898 + gz * 78.233 + gy * 37.719) * 43758.5453) % 1;
          if (distSq <= 1.0 + (jitter - 0.5) * 0.32) {
            const idx = (gy * sizeXZ + gz) * sizeXZ + gx;
            if (vol[idx] === AIR) vol[idx] = foliageBlock;
          }
        }
      }
    }

    if (height >= 7) {
      const branchY = baseY + clearHeight + 1;
      const branches: Array<[number, number, number]> = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1]];
      for (const [bx, bz, by] of branches) {
        const gy = branchY + by;
        const gx = x + bx;
        const gz = z + bz;
        if (gx >= 0 && gx < sizeXZ && gz >= 0 && gz < sizeXZ && gy < sizeY) {
          vol[(gy * sizeXZ + gz) * sizeXZ + gx] = trunkBlock;
        }
      }
    }
  }

  private buildFallbackVolume(): Int16Array {
    const sizeXZ = GEO_GRID_SIZE_XZ;
    const sizeY = GEO_GRID_SIZE_Y;
    const vol = new Int16Array(sizeXZ * sizeY * sizeXZ).fill(AIR);
    const subsoilBlock = rgbToGeoBlockId(58, 60, 64);
    const roadBlock = rgbToGeoBlockId(45, 45, 48);
    for (let gz = 0; gz < sizeXZ; gz++) {
      for (let gx = 0; gx < sizeXZ; gx++) {
        for (let gy = 0; gy <= SURFACE_VOXEL_Y; gy++) {
          vol[(gy * sizeXZ + gz) * sizeXZ + gx] =
            gy === SURFACE_VOXEL_Y ? roadBlock : subsoilBlock;
        }
      }
    }
    return vol;
  }
}

export const google3DTilesVoxelizer = new Google3DTilesVoxelizer();

