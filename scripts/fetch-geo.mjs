#!/usr/bin/env node
/**
 * Utilitário CLI para baixar e processar dados do OpenStreetMap e Elevação
 * para o VoxelEngine.
 * 
 * Uso:
 *   node scripts/fetch-geo.mjs --lat=-23.561414 --lon=-46.655882 --name=paulista --radius=300
 */

import fs from 'fs';
import path from 'path';

const args = Object.fromEntries(
  process.argv.slice(2).map(arg => {
    const [k, v] = arg.replace(/^--/, '').split('=');
    return [k, v ?? true];
  })
);

const lat = parseFloat(args.lat ?? -23.561414);
const lon = parseFloat(args.lon ?? -46.655882);
const name = args.name ?? 'paulista';
const radiusM = parseFloat(args.radius ?? 300);

const DEG_TO_RAD = Math.PI / 180;
const METERS_PER_DEG_LAT = 111319.5;
const METERS_PER_DEG_LON = 111319.5 * Math.cos(lat * DEG_TO_RAD);

const deltaLat = radiusM / METERS_PER_DEG_LAT;
const deltaLon = radiusM / METERS_PER_DEG_LON;

const south = (lat - deltaLat).toFixed(7);
const north = (lat + deltaLat).toFixed(7);
const west = (lon - deltaLon).toFixed(7);
const east = (lon + deltaLon).toFixed(7);

console.log(`[GeoFetcher] Baixando área '${name}': [${south}, ${west}, ${north}, ${east}]...`);

async function fetchGeo() {
  const url = `https://api.openstreetmap.org/api/0.6/map?bbox=${west},${south},${east},${north}`;
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'VoxelEngine/1.0 (contact: developer@voxelengine.local)',
      'Accept': 'application/xml'
    }
  });

  if (!res.ok) {
    throw new Error(`Falha ao baixar do OpenStreetMap (${res.status}): ${res.statusText}`);
  }

  const xml = await res.text();
  console.log(`[GeoFetcher] Recebido XML do OSM (${(xml.length / 1024).toFixed(1)} KB)`);

  // Parse nodes
  const nodes = new Map();
  const nodeTagRegex = /<node\s+([^>]+)>/g;
  let m;
  while ((m = nodeTagRegex.exec(xml)) !== null) {
    const attrs = m[1];
    const idM = /id="(\d+)"/.exec(attrs);
    const latM = /lat="([^"]+)"/.exec(attrs);
    const lonM = /lon="([^"]+)"/.exec(attrs);
    if (idM && latM && lonM) {
      const nLat = parseFloat(latM[1]);
      const nLon = parseFloat(lonM[1]);
      const vx = Math.round((nLon - lon) * METERS_PER_DEG_LON);
      const vz = Math.round(-(nLat - lat) * METERS_PER_DEG_LAT);
      nodes.set(idM[1], [vx, vz]);
    }
  }

  // Parse ways
  const wayRegex = /<way\s+([^>]+)>([\s\S]*?)<\/way>/g;
  const tagRegex = /<tag\s+k="([^"]+)"\s+v="([^"]+)"\/>/g;
  const ndRegex = /<nd\s+ref="(\d+)"\/>/g;

  const buildings = [];
  const roads = [];

  while ((m = wayRegex.exec(xml)) !== null) {
    const attrs = m[1];
    const id = (/id="(\d+)"/.exec(attrs) || [])[1];
    const body = m[2];

    const tags = {};
    let tm;
    while ((tm = tagRegex.exec(body)) !== null) {
      tags[tm[1]] = tm[2];
    }

    const pts = [];
    let nm;
    while ((nm = ndRegex.exec(body)) !== null) {
      const pt = nodes.get(nm[1]);
      if (pt) pts.push(pt);
    }

    if (pts.length < 2) continue;

    if (tags.building && pts.length >= 3) {
      let height = 24;
      if (tags.height) {
        const h = parseFloat(tags.height.replace(',', '.'));
        if (!isNaN(h) && h > 0) height = Math.round(h);
      } else if (tags['building:levels']) {
        const levels = parseInt(tags['building:levels'], 10);
        if (!isNaN(levels) && levels > 0) height = Math.round(levels * 3.5);
      }

      let minHeight = 0;
      if (tags.min_height) {
        const mh = parseFloat(tags.min_height.replace(',', '.'));
        if (!isNaN(mh) && mh > 0) minHeight = Math.round(mh);
      }

      let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
      for (const [x, z] of pts) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (z < minZ) minZ = z;
        if (z > maxZ) maxZ = z;
      }

      buildings.push({
        id,
        name: tags.name || tags['addr:street'] ? `${tags.name || ''} ${tags['addr:street'] || ''}`.trim() : 'Edifício',
        polygon: pts,
        bbox: [minX, minZ, maxX, maxZ],
        height: Math.min(height, 140),
        minHeight,
        material: height > 50 ? 'glass' : 'concrete'
      });
    } else if (tags.highway && pts.length >= 2) {
      const hw = tags.highway;
      let width = 10;
      if (hw === 'primary' || (tags.name && tags.name.includes('Paulista'))) width = 24;
      else if (hw === 'secondary' || hw === 'tertiary') width = 14;
      else if (hw === 'residential') width = 8;

      let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
      for (const [x, z] of pts) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (z < minZ) minZ = z;
        if (z > maxZ) maxZ = z;
      }

      roads.push({
        id,
        name: tags.name || hw,
        points: pts,
        bbox: [minX - width, minZ - width, maxX + width, maxZ + width],
        width
      });
    }
  }

  const output = {
    name,
    center: { lat, lon },
    baseVoxelY: 32,
    buildings,
    roads
  };

  const outPath = path.resolve(`public/geo/${name}.json`);
  fs.writeFileSync(outPath, JSON.stringify(output, null, 2));
  console.log(`[GeoFetcher] Salvo com sucesso em: ${outPath} (${buildings.length} prédios, ${roads.length} ruas)`);
}

fetchGeo().catch(console.error);

