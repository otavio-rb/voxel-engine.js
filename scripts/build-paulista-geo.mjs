import fs from 'fs';
import path from 'path';

const xml = fs.readFileSync('scripts/paulista_raw.xml', 'utf8');

// Center at MASP
const ORIGIN_LAT = -23.561414;
const ORIGIN_LON = -46.655882;
const BASE_ELEVATION_M = 824; // MASP ground altitude
const BASE_VOXEL_Y = 32;      // Comfortable spawn height in voxel world

const DEG_TO_RAD = Math.PI / 180;
const METERS_PER_DEG_LAT = 111319.5;
const METERS_PER_DEG_LON = 111319.5 * Math.cos(ORIGIN_LAT * DEG_TO_RAD);

function latLonToVoxel(lat, lon) {
  const x = (lon - ORIGIN_LON) * METERS_PER_DEG_LON;
  const z = -(lat - ORIGIN_LAT) * METERS_PER_DEG_LAT;
  return [Math.round(x), Math.round(z)];
}

// 1. Parse nodes
const nodes = new Map();
const nodeRegex = /<node\s+([^>]+)>/g;
let m;
while ((m = nodeRegex.exec(xml)) !== null) {
  const attrs = m[1];
  const idM = /id="(\d+)"/.exec(attrs);
  const latM = /lat="([^"]+)"/.exec(attrs);
  const lonM = /lon="([^"]+)"/.exec(attrs);
  if (idM && latM && lonM) {
    nodes.set(idM[1], {
      lat: parseFloat(latM[1]),
      lon: parseFloat(lonM[1]),
      voxel: latLonToVoxel(parseFloat(latM[1]), parseFloat(lonM[1]))
    });
  }
}

// 2. Parse ways (buildings and highways)
const wayRegex = /<way\s+([^>]+)>([\s\S]*?)<\/way>/g;
const buildings = [];
const roads = [];

while ((m = wayRegex.exec(xml)) !== null) {
  const attrs = m[1];
  const id = (/id="(\d+)"/.exec(attrs) || [])[1];
  const body = m[2];

  const tags = {};
  const tagRegex = /<tag\s+k="([^"]+)"\s+v="([^"]+)"\/>/g;
  let tm;
  while ((tm = tagRegex.exec(body)) !== null) {
    tags[tm[1]] = tm[2];
  }

  const pts = [];
  const ndRegex = /<nd\s+ref="(\d+)"\/>/g;
  let nm;
  while ((nm = ndRegex.exec(body)) !== null) {
    const node = nodes.get(nm[1]);
    if (node) pts.push(node.voxel);
  }

  if (pts.length < 2) continue;

  if (tags.building && pts.length >= 3) {
    let height = 24; // default ~8 floors
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

    // Material inference
    let material = 'concrete';
    const matTag = (tags['building:material'] || tags['facade:material'] || '').toLowerCase();
    if (matTag.includes('glass')) material = 'glass';
    else if (matTag.includes('brick') || matTag.includes('tijolo')) material = 'brick';
    else if (height > 50) material = 'glass'; // Tall modern skyskrapers on Paulista usually glass/concrete

    // Compute bounding box
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (const [x, z] of pts) {
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (z < minZ) minZ = z;
      if (z > maxZ) maxZ = z;
    }

    buildings.push({
      id,
      name: tags.name || tags['addr:street'] || tags['addr:housenumber'] ? `${tags.name || ''} ${tags['addr:street'] || ''} ${tags['addr:housenumber'] || ''}`.trim() : 'Edifício',
      polygon: pts,
      bbox: [minX, minZ, maxX, maxZ],
      height: Math.min(height, 140), // Clamp max height to avoid exceeding chunk upper limits
      minHeight,
      material
    });
  } else if (tags.highway && pts.length >= 2) {
    const hw = tags.highway;
    let width = 10;
    if (hw === 'primary' || (tags.name && tags.name.includes('Paulista'))) {
      width = 24; // Avenida Paulista is very wide
    } else if (hw === 'secondary' || hw === 'tertiary') {
      width = 14;
    } else if (hw === 'residential' || hw === 'service') {
      width = 8;
    }

    // Bbox for road
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

const geoData = {
  name: 'Avenida Paulista & MASP, São Paulo',
  center: { lat: ORIGIN_LAT, lon: ORIGIN_LON },
  baseElevationM: BASE_ELEVATION_M,
  baseVoxelY: BASE_VOXEL_Y,
  buildings,
  roads
};

const outDir = path.resolve('public/geo');
if (!fs.existsSync(outDir)) {
  fs.mkdirSync(outDir, { recursive: true });
}

const outPath = path.join(outDir, 'paulista.json');
fs.writeFileSync(outPath, JSON.stringify(geoData, null, 2));

console.log(`Successfully generated ${outPath}!`);
console.log(`- Total Buildings: ${buildings.length}`);
console.log(`- Total Roads: ${roads.length}`);

const masp = buildings.find(b => b.name.includes('MASP') || b.name.includes('Museu de Arte'));
if (masp) {
  console.log('MASP found in geoData:', JSON.stringify(masp, null, 2));
}

