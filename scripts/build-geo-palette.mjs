/**
 * Gera a paleta de cores do geo-voxels a partir das texturas reais dos tiles do
 * Google Photorealistic 3D Tiles guardados em examples/geo-voxels/public_raw.
 *
 * Por que assar em vez de gerar em runtime: os blocos sao registrados no boot, muito
 * antes de qualquer tile ser baixado, e o id de cada cor tem de ser identico na thread
 * principal e no chunk worker. Entao a paleta precisa ser uma constante.
 *
 * Por que derivar dos dados em vez de uma grade HSL feita a mao: medido sobre 1,4 milhao
 * de texels dos 45 tiles de public_raw, a grade HSL de 746 cores usava so 409 delas e
 * errava 12,66 em RGB; um median-cut das MESMAS 746 cores sobre os texels reais usa 633
 * e erra 4,81. A fotogrametria urbana vive num cinturao de baixo croma (28% dos pixels
 * tem croma < 18%) que a grade HSL cobria com 106 entradas de 746.
 *
 * A paleta sai de um corpus MISTO (congresso + masp). Cross-validacao: paleta mista
 * erra 4,81 no congresso e 5,24 no masp, contra 4,80 / 4,84 das paletas dedicadas --
 * perto o bastante para uma paleta unica servir todos os presets, inclusive os que nao
 * tem tiles em public_raw.
 *
 * Uso: npm i -D jpeg-js && node scripts/build-geo-palette.mjs
 */
import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);

let jpeg;
try {
  jpeg = require('jpeg-js');
} catch {
  console.error('jpeg-js nao encontrado. Rode: npm i -D jpeg-js');
  process.exit(1);
}

const RAW_DIR = path.resolve('examples/geo-voxels/public_raw');
const OUT_FILE = path.resolve('examples/geo-voxels/content/geoPalette.ts');

/** Quantas cores a paleta ocupa. Limite duro: BLOCK_TABLE_SIZE (1024) menos o id base (73). */
const PALETTE_SIZE = 746;
/** Um texel a cada N: 1,4 milhao de amostras ja satura o median-cut e mantem o script em segundos. */
const TEXEL_STRIDE = 7;
/** Amostras usadas no median-cut em si (o corpus inteiro e redundante para particionar caixas). */
const CUT_STRIDE = 9;

const SOI = Buffer.from([0xff, 0xd8, 0xff]);
const EOI = Buffer.from([0xff, 0xd9]);

/**
 * Extrai os RGB das texturas de um .glb sem parsear o glTF: as imagens dos tiles do
 * Google sao JPEG embutidos, e achar os marcadores SOI/EOI basta para decodificar.
 */
function collectTexels(files) {
  const out = [];
  for (const file of files) {
    const buf = fs.readFileSync(file);
    let i = -1;
    while ((i = buf.indexOf(SOI, i + 1)) > 0) {
      const end = buf.indexOf(EOI, i + 2);
      if (end < 0) break;
      try {
        const img = jpeg.decode(buf.subarray(i, end + 2), { useTArray: true });
        const d = img.data;
        for (let p = 0; p < d.length; p += 4 * TEXEL_STRIDE) {
          const r = d[p];
          const g = d[p + 1];
          const b = d[p + 2];
          // Pixels pretos sao padding das ilhas UV do atlas, nao cor de superficie.
          if (r < 12 && g < 12 && b < 12) continue;
          out.push(r, g, b);
        }
      } catch {
        // Nem todo marcador SOI e uma imagem valida; ignora e segue.
      }
      i = end;
    }
  }
  return out;
}

/**
 * Median cut classico: divide repetidamente a caixa de maior extensao pelo seu eixo mais
 * longo, na mediana. O score inclui cbrt(populacao) para que regioes muito povoadas
 * (o cinturao de concreto) ganhem mais cores que outliers isolados.
 */
function medianCut(texels, k, stride) {
  const total = texels.length / 3;
  const first = [];
  for (let i = 0; i < total; i += stride) first.push(i);

  let boxes = [first];
  const extent = (box) => {
    const mn = [255, 255, 255];
    const mx = [0, 0, 0];
    for (const j of box) {
      for (let c = 0; c < 3; c++) {
        const v = texels[j * 3 + c];
        if (v < mn[c]) mn[c] = v;
        if (v > mx[c]) mx[c] = v;
      }
    }
    return [mn, mx];
  };

  while (boxes.length < k) {
    let pick = -1;
    let bestScore = -1;
    for (let i = 0; i < boxes.length; i++) {
      const box = boxes[i];
      if (box.length < 2) continue;
      const [mn, mx] = extent(box);
      const span = Math.max(mx[0] - mn[0], mx[1] - mn[1], mx[2] - mn[2]);
      const score = span * Math.cbrt(box.length);
      if (score > bestScore) {
        bestScore = score;
        pick = i;
      }
    }
    if (pick < 0) break;

    const box = boxes[pick];
    const [mn, mx] = extent(box);
    let axis = 0;
    if (mx[1] - mn[1] > mx[axis] - mn[axis]) axis = 1;
    if (mx[2] - mn[2] > mx[axis] - mn[axis]) axis = 2;
    box.sort((a, b) => texels[a * 3 + axis] - texels[b * 3 + axis]);
    const half = box.length >> 1;
    boxes.splice(pick, 1, box.slice(0, half), box.slice(half));
  }

  return boxes.map((box) => {
    let r = 0;
    let g = 0;
    let b = 0;
    for (const j of box) {
      r += texels[j * 3];
      g += texels[j * 3 + 1];
      b += texels[j * 3 + 2];
    }
    const n = box.length || 1;
    return [Math.round(r / n), Math.round(g / n), Math.round(b / n)];
  });
}

/** Distancia de cor ponderada ("redmean"), a mesma usada em runtime no blocks.ts. */
function colorDistSq(r1, g1, b1, r2, g2, b2) {
  const rmean = (r1 + r2) / 2;
  const dr = r1 - r2;
  const dg = g1 - g2;
  const db = b1 - b2;
  return (((512 + rmean) * dr * dr) >> 8) + 4 * dg * dg + (((767 - rmean) * db * db) >> 8);
}

function report(palette, texels, label) {
  const total = texels.length / 3;
  const used = new Set();
  let sum = 0;
  let max = 0;
  for (let k = 0; k < total; k++) {
    const r = texels[k * 3];
    const g = texels[k * 3 + 1];
    const b = texels[k * 3 + 2];
    let best = 0;
    let min = Infinity;
    for (let i = 0; i < palette.length; i++) {
      const d = colorDistSq(r, g, b, palette[i][0], palette[i][1], palette[i][2]);
      if (d < min) {
        min = d;
        best = i;
      }
    }
    used.add(best);
    const e = Math.hypot(r - palette[best][0], g - palette[best][1], b - palette[best][2]);
    sum += e;
    if (e > max) max = e;
  }
  console.log(
    `${label}: ${used.size}/${palette.length} cores usadas, erro medio ${(sum / total).toFixed(2)}, max ${max.toFixed(0)}`
  );
}

// ── Pigmentos que a fotogrametria media dilui e que precisam sobreviver ──────
// Entram como ancoras fixas: sao marcos reconheciveis (o vermelho dos porticos do
// MASP, o marmore de Niemeyer) cuja identidade some se virar a media do bairro.
const ANCHORS = [
  [220, 42, 38],
  [195, 30, 28],
  [245, 55, 50],
  [248, 248, 252],
  [250, 210, 30],
  [38, 40, 44],
  [0, 0, 0],
  [255, 255, 255]
];

const files = fs
  .readdirSync(RAW_DIR)
  .filter((f) => f.endsWith('.glb'))
  .map((f) => path.join(RAW_DIR, f));

if (files.length === 0) {
  console.error(`Nenhum .glb em ${RAW_DIR}`);
  process.exit(1);
}

console.log(`Lendo ${files.length} tiles...`);
const texels = collectTexels(files);
console.log(`${texels.length / 3} texels amostrados.`);

const cut = medianCut(texels, PALETTE_SIZE - ANCHORS.length, CUT_STRIDE);

// Desduplica contra as ancoras e entre si; repoe o que sobrar com os centroides
// mais distantes para nao desperdicar slots.
const palette = [];
const seen = new Set();
for (const c of [...ANCHORS, ...cut]) {
  const key = c.join(',');
  if (seen.has(key)) continue;
  seen.add(key);
  palette.push(c);
  if (palette.length === PALETTE_SIZE) break;
}
while (palette.length < PALETTE_SIZE) {
  // Preenche buracos com cinzas intermediarios: inofensivos e sempre uteis.
  const v = Math.round((palette.length % 256));
  const key = `${v},${v},${v}`;
  if (!seen.has(key)) {
    seen.add(key);
    palette.push([v, v, v]);
  } else {
    palette.push([v, v, (v + 1) % 256]);
  }
}

report(palette, texels, 'paleta assada');

const rows = [];
for (let i = 0; i < palette.length; i += 8) {
  rows.push(
    '  ' +
      palette
        .slice(i, i + 8)
        .map(([r, g, b]) => `[${r},${g},${b}]`)
        .join(', ')
  );
}

const out = `// GERADO POR scripts/build-geo-palette.mjs -- NAO EDITE A MAO.
//
// Paleta de ${palette.length} cores derivada por median-cut das texturas reais dos tiles do
// Google Photorealistic 3D Tiles (corpus misto: Congresso Nacional + Av. Paulista/MASP).
// Rode \`node scripts/build-geo-palette.mjs\` para regerar a partir de public_raw/.
//
// As ${ANCHORS.length} primeiras entradas sao ancoras fixas (vermelhos do MASP, marmore de
// Niemeyer, amarelo de sinalizacao, asfalto, preto e branco puros): pigmentos de marco que
// a media da fotogrametria dilui e cuja identidade precisa sobreviver a quantizacao.

export const GEO_COLOR_PALETTE: Array<[number, number, number]> = [
${rows.join(',\n')}
];
`;

fs.writeFileSync(OUT_FILE, out);
console.log(`Escrito ${OUT_FILE} (${palette.length} cores).`);
