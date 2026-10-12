import type { ChunkContext } from '@voxel/engine/chunk-worker';
import { BlockType } from '../blocks';
import { SEA_LEVEL, cellHash2, cellHash3, getVolcanoInCell, surfaceHeightAt } from './overworldShape';

/**
 * Biomas cavernosos, do mais raso ao mais fundo.
 *
 * `barren` é a rocha nua logo abaixo da superfície: é por aí que se entra, e
 * deliberadamente não tem tema nenhum. Os quatro biomas temáticos só começam
 * bem mais fundo, cada um na faixa de profundidade que lhe faz sentido, com
 * `dripstone` (carso calcário) a preencher o que sobra entre eles.
 */
export type CaveBiome = 'barren' | 'dripstone' | 'lush' | 'fungal' | 'crystal' | 'magma';

/**
 * Estratigrafia: as fronteiras verticais entre zonas cavernosas.
 *
 * As faixas não se sobrepõem e cobrem todo o subsolo, por isso o bioma de um
 * ponto sai de uma cascata de comparações, não de um sorteio — a mesma coluna
 * atravessa sempre as mesmas zonas pela mesma ordem ao descer.
 */
/** Rocha nua enquanto não se descerem tantos blocos abaixo da superfície. */
const THEMED_MIN_DEPTH = 32;
/** E também enquanto se estiver acima desta cota: nada de temas no alto das montanhas. */
const THEMED_MAX_Y = SEA_LEVEL + 16;
/** Base da zona cársica: entre ela e THEMED_MAX_Y só há calcário. */
const KARST_FLOOR_Y = 12;
/** Base da zona húmida rasa (verdejante). Aprofundada para permitir biomas cavernosos colossais. */
const LUSH_FLOOR_Y = -75;
/** Base das zonas fúngica e de cristal. */
const DEEP_FLOOR_Y = -120;
/** Abaixo disto é sempre abismo magmático, seja qual for o clima. */
const ABYSS_Y = -160;
/** O calor regional sobe o magma, mas nunca acima desta cota. */
const MAGMA_CEILING_Y = -55;

/**
 * Cota a partir da qual uma coluna passa a ser magmática, dado o seu calor.
 * Regiões quentes ficam magmáticas 55 blocos abaixo do mar; as frias só perto
 * do abismo.
 */
function magmaOnsetY(temp: number): number {
  return Math.min(MAGMA_CEILING_Y, -((0.95 - temp) * 120 + 20));
}

/**
 * Como cada bioma esculpe a rocha.
 *
 * `tunnelSquash` é o factor aplicado ao comprimento de onda vertical do ruído:
 * valores altos esticam as galerias na vertical (fendas altas e estreitas),
 * valores baixos achatam-nas (salões largos e baixos).
 */
interface CaveProfile {
  tunnelScale: number;
  tunnelWidth: number;
  tunnelSquash: number;
  /** Comprimento de onda das câmaras "queijo" (bolhas grandes). */
  chamberScale: number;
  /** Limiar do ruído de câmara; mais baixo = câmaras maiores e mais frequentes. */
  chamberThreshold: number;
  /** Rocha que forra as paredes expostas. */
  wall: BlockType;
  /** Rocha do chão da caverna. */
  floor: BlockType;
  /** Falso deixa a rocha original à vista, sem forro temático. */
  lined: boolean;
}

const PROFILES: Record<CaveBiome, CaveProfile> = {
  // Rocha nua: a rede que liga as bocas da superfície ao resto. Sem forro.
  barren: {
    tunnelScale: 38, tunnelWidth: 0.225, tunnelSquash: 1.15,
    chamberScale: 44, chamberThreshold: 0.52,
    wall: BlockType.Stone, floor: BlockType.Stone, lined: false,
  },
  // Calcário: fendas altas e estreitas, cheias de estalactites.
  dripstone: {
    tunnelScale: 36, tunnelWidth: 0.215, tunnelSquash: 2.10,
    chamberScale: 48, chamberThreshold: 0.56,
    wall: BlockType.Dripstone, floor: BlockType.Dripstone, lined: true,
  },
  // Verdejante: galerias colossais, tetos abobadados imponentes, lagoas e musgo.
  lush: {
    tunnelScale: 52, tunnelWidth: 0.33, tunnelSquash: 0.82,
    chamberScale: 48, chamberThreshold: 0.28,
    wall: BlockType.Moss, floor: BlockType.Moss, lined: true,
  },
  // Fúngico: salões imensos e baixos, chão de micélio e cogumelos gigantes.
  fungal: {
    tunnelScale: 52, tunnelWidth: 0.235, tunnelSquash: 0.55,
    chamberScale: 36, chamberThreshold: 0.36,
    wall: BlockType.Tuff, floor: BlockType.Mycelium, lined: true,
  },
  // Cristal: bolsas pequenas e angulosas, calcite e ametista.
  crystal: {
    tunnelScale: 30, tunnelWidth: 0.200, tunnelSquash: 1.25,
    chamberScale: 54, chamberThreshold: 0.62,
    wall: BlockType.Calcite, floor: BlockType.Tuff, lined: true,
  },
  // Magma: planícies vastas e baixas sobre lagos de lava.
  magma: {
    tunnelScale: 42, tunnelWidth: 0.235, tunnelSquash: 0.60,
    chamberScale: 34, chamberThreshold: 0.34,
    wall: BlockType.Basalt, floor: BlockType.Basalt, lined: true,
  },
};

/** Valores do mapa de ocupação usado pelas passagens de escavação e decoração. */
const enum Cell {
  Solid = 0,
  Air = 1,
  Water = 2,
  Lava = 3,
  /** Fora do terreno (céu ou oceano): não é rocha nem caverna. */
  Outside = 4,
}

// ── Estruturas subterrâneas ──────────────────────────────────────────────────

/** Ravina: fenda longa e estreita que rasga o terreno de cima a baixo. */
interface Ravine {
  x: number; z: number;
  cos: number; sin: number;
  halfLength: number;
  halfWidth: number;
  topY: number; bottomY: number;
  seed: number;
}

/** Salão colossal, opcionalmente com um lago no fundo. */
interface Chamber {
  x: number; y: number; z: number;
  rx: number; ry: number; rz: number;
  lakeY: number;
  hasLake: boolean;
}

/** Poço vertical que liga a superfície à rede de cavernas. */
interface Shaft {
  x: number; z: number;
  radius: number;
  bottomY: number;
  seed: number;
}

/** Geodo: casca de basalto liso, camada de calcite e interior de ametista. */
interface Geode {
  x: number; y: number; z: number;
  radius: number;
}

const RAVINE_CELL = 224;
const CHAMBER_CELL = 160;
const SHAFT_CELL = 96;
const GEODE_CELL_XZ = 112;
const GEODE_CELL_Y = 72;
/** Faixa onde a mineralização forma geodos, dentro da zona de cristal. */
const GEODE_MIN_Y = -150;
const GEODE_MAX_Y = -45;

// ── Cache de coluna ──────────────────────────────────────────────────────────

const COL_PAD = 4;
const COL_FIELDS = 8;
const COL_SURFACE = 0;
const COL_CAVE_TOP = 1;
const COL_TEMP = 2;
const COL_HUM = 3;
const COL_WIDTH_VAR = 4;
const COL_CHAMBER_REGION = 5;
const COL_ENTRANCE = 6;
const COL_LAVA_Y = 7;

const MASK_PAD_XZ = 1;
/** Alcance vertical máximo de uma decoração (cogumelo gigante), para que uma
 *  peça ancorada fora do chunk ainda seja gerada e encaixe sem cortes. */
const MASK_PAD_Y = 8;

/**
 * Escava e decora as cavernas de um chunk.
 *
 * Tudo o que decide é função pura das coordenadas do mundo — nenhuma passagem lê
 * blocos de chunks vizinhos — por isso galerias, ravinas e salões encaixam sem
 * costuras mesmo gerados por workers diferentes e em ordens diferentes.
 */
export class CaveCarver {
  private readonly ctx: ChunkContext;

  private readonly colSize: number;
  private readonly colStartX: number;
  private readonly colStartZ: number;
  private readonly cols: Float32Array;
  private readonly colReady: Uint8Array;
  private readonly colScratch = new Float32Array(COL_FIELDS);

  private readonly maskW: number;
  private readonly maskH: number;
  private readonly maskStartX: number;
  private readonly maskStartY: number;
  private readonly maskStartZ: number;
  private readonly mask: Uint8Array;

  private readonly ravines: Ravine[] = [];
  private readonly chambers: Chamber[] = [];
  private readonly shafts: Shaft[] = [];
  private readonly geodes: Geode[] = [];

  constructor(ctx: ChunkContext) {
    this.ctx = ctx;

    this.colSize = ctx.size + COL_PAD * 2;
    this.colStartX = ctx.startX - COL_PAD;
    this.colStartZ = ctx.startZ - COL_PAD;
    this.cols = new Float32Array(this.colSize * this.colSize * COL_FIELDS);
    this.colReady = new Uint8Array(this.colSize * this.colSize);

    this.maskW = ctx.size + MASK_PAD_XZ * 2;
    this.maskH = ctx.size + MASK_PAD_Y * 2;
    this.maskStartX = ctx.startX - MASK_PAD_XZ;
    this.maskStartY = ctx.startY - MASK_PAD_Y;
    this.maskStartZ = ctx.startZ - MASK_PAD_XZ;
    this.mask = new Uint8Array(this.maskW * this.maskH * this.maskW);

    this.collectStructures();
  }

  // ── Colunas ────────────────────────────────────────────────────────────────

  private colBase(x: number, z: number): number {
    const lx = x - this.colStartX;
    const lz = z - this.colStartZ;
    if (lx < 0 || lx >= this.colSize || lz < 0 || lz >= this.colSize) return -1;
    return lz * this.colSize + lx;
  }

  /** Escreve os sete campos da coluna (x, z) em `out`, com cache dentro do padding. */
  private column(x: number, z: number, out: Float32Array): void {
    const base = this.colBase(x, z);
    if (base >= 0 && this.colReady[base]) {
      const o = base * COL_FIELDS;
      for (let i = 0; i < COL_FIELDS; i++) out[i] = this.cols[o + i];
      return;
    }

    const ctx = this.ctx;
    const sy = surfaceHeightAt(ctx, x, z);

    // Clima subterrâneo em macro-escala: regiões de 400-900 blocos.
    const temp = ctx.simplex.noise((x + 50000) / 430, (z - 50000) / 430) +
                 ctx.simplex.noise((x + 50000) / 150, (z - 50000) / 150) * 0.25;
    const hum = ctx.simplex.noise((x - 70000) / 470, (z + 70000) / 470) +
                ctx.simplex.noise((x - 70000) / 160, (z + 70000) / 160) * 0.25;

    // Faixas largas onde as galerias engordam ou estrangulam.
    const widthVar = ctx.simplex.noise((x + 6100) / 310, (z - 6100) / 310) * 0.055;
    const chamberRegion = ctx.simplex.noise((x + 9000) / 560, (z - 9000) / 560);

    // Zonas de boca de caverna: onde o terreno abre para a luz do dia.
    const entranceN = ctx.simplex.noise((x + 2000) / 130, (z - 2000) / 130) +
                      ctx.simplex.noise((x + 2000) / 45, (z - 2000) / 45) * 0.4;

    // Vulcões selam a sua própria encosta: nada de buracos no cone.
    let onCone = false;
    const cellX = Math.floor(x / 640);
    const cellZ = Math.floor(z / 640);
    for (let dx = -1; dx <= 1 && !onCone; dx++) {
      for (let dz = -1; dz <= 1 && !onCone; dz++) {
        const v = getVolcanoInCell(cellX + dx, cellZ + dz);
        if (!v.exists) continue;
        if (Math.hypot(x - v.x, z - v.z) < v.radius) onCone = true;
      }
    }

    const openToSky = entranceN > 0.52 && sy > SEA_LEVEL + 4 && !onCone;
    let caveTop: number;
    if (onCone) caveTop = sy - 10;
    else if (openToSky) caveTop = sy;
    else if (sy <= SEA_LEVEL + 2) caveTop = sy - 6;
    else caveTop = sy - 4;

    out[COL_SURFACE] = sy;
    out[COL_CAVE_TOP] = caveTop;
    out[COL_TEMP] = temp;
    out[COL_HUM] = hum;
    out[COL_WIDTH_VAR] = widthVar;
    out[COL_CHAMBER_REGION] = chamberRegion;
    out[COL_ENTRANCE] = openToSky ? 1 : 0;

    // Mar de lava: 28 blocos abaixo de onde o bioma de magma começa nesta
    // coluna, para se descer por cavernas magmáticas antes de chegar ao fogo.
    out[COL_LAVA_Y] = Math.max(ABYSS_Y, magmaOnsetY(temp)) - 28;

    if (base >= 0) {
      const o = base * COL_FIELDS;
      for (let i = 0; i < COL_FIELDS; i++) this.cols[o + i] = out[i];
      this.colReady[base] = 1;
    }
  }

  // ── Bioma ──────────────────────────────────────────────────────────────────

  /**
   * Cascata estratigráfica: cada zona é descartada antes de se chegar à seguinte,
   * por isso a sequência de biomas ao descer uma coluna é sempre a mesma ordem.
   */
  private biomeFrom(temp: number, hum: number, y: number, depth: number): CaveBiome {
    // Manto raso: rocha nua, qualquer que seja o clima. É onde ficam as bocas.
    if (depth < THEMED_MIN_DEPTH || y > THEMED_MAX_Y) return 'barren';

    // Abismo e bolsões quentes, de baixo para cima.
    if (y < ABYSS_Y || y < magmaOnsetY(temp)) return 'magma';

    // Carso vs Lush: a faixa logo abaixo do manto raso é calcária,
    // mas em regiões húmidas as cavernas verdejantes sobem até junto do manto raso!
    if (y > KARST_FLOOR_Y) {
      if (hum > 0.24 && y <= THEMED_MAX_Y) return 'lush';
      return 'dripstone';
    }

    // Lençol freático: o verdejante precisa de água, prosperando em ampla faixa de humidade.
    if (y > LUSH_FLOOR_Y) return hum > 0.10 ? 'lush' : 'dripstone';

    // Zona profunda: esporos onde é húmido, mineralização onde é frio e seco.
    if (y > DEEP_FLOOR_Y) {
      if (hum > 0.22) return 'fungal';
      if (temp < -0.25) return 'crystal';
      return 'dripstone';
    }

    // Entre a zona profunda e o abismo só restam os veios frios de cristal.
    return temp < -0.25 ? 'crystal' : 'magma';
  }

  /** Bioma cavernoso em qualquer ponto do mundo. */
  public biomeAt(x: number, y: number, z: number): CaveBiome {
    const c = this.colScratch;
    this.column(x, z, c);
    return this.biomeFrom(c[COL_TEMP], c[COL_HUM], y, c[COL_SURFACE] - y);
  }

  // ── Estruturas ─────────────────────────────────────────────────────────────

  private collectStructures(): void {
    const ctx = this.ctx;
    const cx = Math.floor((ctx.startX + ctx.endX) / 2);
    const cy = Math.floor((ctx.startY + ctx.endY) / 2);
    const cz = Math.floor((ctx.startZ + ctx.endZ) / 2);

    // Ravinas
    const rcx = Math.floor(cx / RAVINE_CELL);
    const rcz = Math.floor(cz / RAVINE_CELL);
    for (let dx = -1; dx <= 1; dx++) {
      for (let dz = -1; dz <= 1; dz++) {
        const gx = rcx + dx;
        const gz = rcz + dz;
        if (cellHash2(gx, gz, 11) > 0.34) continue;

        const hx = cellHash2(gx, gz, 23);
        const hz = cellHash2(gx, gz, 37);
        const ha = cellHash2(gx, gz, 53);
        const hl = cellHash2(gx, gz, 67);
        const hw = cellHash2(gx, gz, 79);
        const ht = cellHash2(gx, gz, 97);

        const angle = ha * Math.PI * 2;
        const topY = 54 + Math.floor(ht * 30);
        this.ravines.push({
          x: gx * RAVINE_CELL + 40 + Math.floor(hx * (RAVINE_CELL - 80)),
          z: gz * RAVINE_CELL + 40 + Math.floor(hz * (RAVINE_CELL - 80)),
          cos: Math.cos(angle),
          sin: Math.sin(angle),
          halfLength: 34 + Math.floor(hl * 36),
          halfWidth: 2.4 + hw * 3.2,
          topY,
          bottomY: topY - (42 + Math.floor(hl * 34)),
          seed: ha * 100,
        });
      }
    }

    // Salões colossais padrão e salões verdejantes expandidos
    const ccx = Math.floor(cx / CHAMBER_CELL);
    const ccz = Math.floor(cz / CHAMBER_CELL);
    for (let dx = -1; dx <= 1; dx++) {
      for (let dz = -1; dz <= 1; dz++) {
        const gx = ccx + dx;
        const gz = ccz + dz;
        if (cellHash2(gx, gz, 131) > 0.45) continue;

        const hx = cellHash2(gx, gz, 149);
        const hz = cellHash2(gx, gz, 163);
        const hy = cellHash2(gx, gz, 181);
        const hr = cellHash2(gx, gz, 199);
        const hh = cellHash2(gx, gz, 211);
        const hk = cellHash2(gx, gz, 227);

        const chamberX = gx * CHAMBER_CELL + 32 + Math.floor(hx * (CHAMBER_CELL - 64));
        const chamberZ = gz * CHAMBER_CELL + 32 + Math.floor(hz * (CHAMBER_CELL - 64));
        const centerY = 36 - Math.floor(hy * 150);

        let rx = 13 + hr * 13;
        let ry = 7 + hh * 9;
        let hasLake = hk > 0.42;
        let lakeY = centerY - ry * 0.52;

        // Se o salão cair na faixa verdejante (lush), expande muito seu volume e adiciona lagoas
        if (centerY <= THEMED_MAX_Y && centerY >= LUSH_FLOOR_Y) {
          const col = this.colScratch;
          this.column(chamberX, chamberZ, col);
          if (col[COL_HUM] > 0.10) {
            rx = 18 + hr * 16;   // Raio horizontal ampliado
            ry = 10 + hh * 11;  // Teto mais alto e majestoso
            hasLake = hk > 0.14; // 86% de chance de lago límpido em salões lush
            lakeY = centerY - ry * 0.45;
          }
        }

        this.chambers.push({
          x: chamberX,
          y: centerY,
          z: chamberZ,
          rx,
          ry,
          rz: rx * (0.75 + hk * 0.5),
          lakeY,
          hasLake,
        });
      }
    }

    // Grutas verdejantes adicionais com lagoas subterrâneas e vitórias-régias
    const LUSH_GROTTO_CELL = 96;
    const lcx = Math.floor(cx / LUSH_GROTTO_CELL);
    const lcz = Math.floor(cz / LUSH_GROTTO_CELL);
    for (let dx = -1; dx <= 1; dx++) {
      for (let dz = -1; dz <= 1; dz++) {
        const gx = lcx + dx;
        const gz = lcz + dz;
        if (cellHash2(gx, gz, 733) > 0.52) continue;

        const hx = cellHash2(gx, gz, 743);
        const hz = cellHash2(gx, gz, 751);
        const hy = cellHash2(gx, gz, 761);
        const hr = cellHash2(gx, gz, 773);
        const hh = cellHash2(gx, gz, 787);
        const hk = cellHash2(gx, gz, 797);

        const x = gx * LUSH_GROTTO_CELL + 20 + Math.floor(hx * (LUSH_GROTTO_CELL - 40));
        const z = gz * LUSH_GROTTO_CELL + 20 + Math.floor(hz * (LUSH_GROTTO_CELL - 40));
        const centerY = 12 - Math.floor(hy * 80); // Entre Y = 12 e Y = -68

        const col = this.colScratch;
        this.column(x, z, col);
        if (col[COL_HUM] <= 0.10) continue;

        const rx = 16 + hr * 14;
        const ry = 8 + hh * 10;
        this.chambers.push({
          x,
          y: centerY,
          z,
          rx,
          ry,
          rz: rx * (0.80 + hk * 0.40),
          lakeY: centerY - ry * 0.44,
          hasLake: hk > 0.10, // 90% das grutas lush têm lagos límpidos
        });
      }
    }

    // Poços verticais (as bocas de caverna mais fiáveis)
    const scx = Math.floor(cx / SHAFT_CELL);
    const scz = Math.floor(cz / SHAFT_CELL);
    for (let dx = -1; dx <= 1; dx++) {
      for (let dz = -1; dz <= 1; dz++) {
        const gx = scx + dx;
        const gz = scz + dz;
        if (cellHash2(gx, gz, 311) > 0.38) continue;

        const hx = cellHash2(gx, gz, 331);
        const hz = cellHash2(gx, gz, 347);
        const hr = cellHash2(gx, gz, 359);
        const hb = cellHash2(gx, gz, 373);

        this.shafts.push({
          x: gx * SHAFT_CELL + 16 + Math.floor(hx * (SHAFT_CELL - 32)),
          z: gz * SHAFT_CELL + 16 + Math.floor(hz * (SHAFT_CELL - 32)),
          radius: 1.7 + hr * 1.8,
          bottomY: 26 - Math.floor(hb * 92),
          seed: hx * 100,
        });
      }
    }

    // Geodos
    const gcx = Math.floor(cx / GEODE_CELL_XZ);
    const gcy = Math.floor(cy / GEODE_CELL_Y);
    const gcz = Math.floor(cz / GEODE_CELL_XZ);
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        for (let dz = -1; dz <= 1; dz++) {
          const gx = gcx + dx;
          const gy = gcy + dy;
          const gz = gcz + dz;
          if (cellHash3(gx, gy, gz, 401) > 0.12) continue;

          const hx = cellHash3(gx, gy, gz, 419);
          const hy = cellHash3(gx, gy, gz, 433);
          const hz = cellHash3(gx, gy, gz, 449);
          const hr = cellHash3(gx, gy, gz, 463);

          const y = gy * GEODE_CELL_Y + 12 + Math.floor(hy * (GEODE_CELL_Y - 24));
          if (y > GEODE_MAX_Y || y < GEODE_MIN_Y) continue;

          const x = gx * GEODE_CELL_XZ + 16 + Math.floor(hx * (GEODE_CELL_XZ - 32));
          const z = gz * GEODE_CELL_XZ + 16 + Math.floor(hz * (GEODE_CELL_XZ - 32));

          // Um geodo é uma bolha de gás mineralizada: só se forma na rocha que
          // de facto mineraliza, nunca numa caverna húmida ou magmática.
          const col = this.colScratch;
          this.column(x, z, col);
          if (this.biomeFrom(col[COL_TEMP], col[COL_HUM], y, col[COL_SURFACE] - y) !== 'crystal') continue;

          this.geodes.push({ x, y, z, radius: 5.5 + hr * 3.5 });
        }
      }
    }
  }

  private ravineAt(x: number, y: number, z: number): boolean {
    for (let i = 0; i < this.ravines.length; i++) {
      const r = this.ravines[i];
      if (y > r.topY || y < r.bottomY) continue;

      const dx = x - r.x;
      const dz = z - r.z;
      const along = dx * r.cos + dz * r.sin;
      if (Math.abs(along) > r.halfLength) continue;

      const perp = -dx * r.sin + dz * r.cos;
      if (Math.abs(perp) > r.halfWidth + 5) continue;

      // Afina nas pontas e estrangula em direção ao fundo: um V, não uma caixa.
      const t = along / r.halfLength;
      const vt = (y - r.bottomY) / (r.topY - r.bottomY);
      const width = r.halfWidth * (1 - t * t) * (0.3 + 0.7 * Math.pow(vt, 0.65));
      if (width < 0.6) continue;

      const wobble = this.ctx.simplex.noise(along / 26 + r.seed, y / 70) * 3.4;
      if (Math.abs(perp - wobble) < width) return true;
    }
    return false;
  }

  private shaftAt(x: number, y: number, z: number): boolean {
    for (let i = 0; i < this.shafts.length; i++) {
      const s = this.shafts[i];
      if (y < s.bottomY) continue;

      const dx = x - s.x;
      const dz = z - s.z;
      if (Math.abs(dx) > 9 || Math.abs(dz) > 9) continue;

      // O poço serpenteia ao descer, para não parecer um tubo perfurado.
      const wx = this.ctx.simplex.noise(y / 23, s.seed) * 4.0;
      const wz = this.ctx.simplex.noise(y / 23 + 50, s.seed) * 4.0;
      if (Math.hypot(dx - wx, dz - wz) < s.radius) return true;
    }
    return false;
  }

  /** Salão que contém o ponto, ou `null`. */
  private chamberAt(x: number, y: number, z: number): Chamber | null {
    for (let i = 0; i < this.chambers.length; i++) {
      const c = this.chambers[i];
      const dx = (x - c.x) / c.rx;
      if (dx < -1.3 || dx > 1.3) continue;
      const dy = (y - c.y) / c.ry;
      if (dy < -1.3 || dy > 1.3) continue;
      const dz = (z - c.z) / c.rz;
      if (dz < -1.3 || dz > 1.3) continue;

      const d = dx * dx + dy * dy + dz * dz;
      if (d > 1.5) continue;

      const wobble = this.ctx.simplex.noise3d(x / 19, y / 19, z / 19) * 0.2;
      if (d + wobble < 1) return c;
    }
    return null;
  }

  // ── Escavação ──────────────────────────────────────────────────────────────

  /**
   * Estado de uma célula do mundo: rocha, ar de caverna, fluido ou fora do terreno.
   * Função pura: o mesmo ponto devolve o mesmo valor em qualquer chunk.
   */
  private sampleCell(x: number, y: number, z: number): Cell {
    const c = this.colScratch;
    this.column(x, z, c);

    const surfaceY = c[COL_SURFACE];
    if (y > surfaceY) return y <= SEA_LEVEL ? Cell.Water : Cell.Outside;
    if (y > c[COL_CAVE_TOP]) return Cell.Solid;

    const depth = surfaceY - y;
    const depthF = Math.min(Math.max(depth, 0) / 90, 1);

    const biome = this.biomeFrom(c[COL_TEMP], c[COL_HUM], y, depth);
    const p = PROFILES[biome];

    // Abaixo do nível do mar de lava, tudo o que seria vazio é lava: é o que dá
    // ao abismo magmático a sua identidade. (A lava não escorre, só assenta.)
    const open: Cell = biome === 'magma' && y < c[COL_LAVA_Y] ? Cell.Lava : Cell.Air;

    const chamber = this.chamberAt(x, y, z);
    if (chamber) {
      if (!chamber.hasLake || y > chamber.lakeY) return open;
      return biome === 'magma' ? Cell.Lava : Cell.Water;
    }

    if (this.shaftAt(x, y, z)) return open;
    if (this.ravineAt(x, y, z)) return open;

    // Galerias principais: interseção de dois campos de ruído ("worm noise").
    let width = p.tunnelWidth + depthF * 0.05 + c[COL_WIDTH_VAR];
    if (c[COL_ENTRANCE] > 0 && depth < 18) {
      // Alarga a boca junto à superfície para que a galeria chegue mesmo à luz.
      width += 0.13 * (1 - depth / 18);
    }

    const s = p.tunnelScale;
    const ys = s * p.tunnelSquash;
    const a = this.ctx.simplex.noise3d(x / s, y / ys, z / s);
    const b = this.ctx.simplex.noise3d((x + 1337) / s, (y + 1337) / ys, (z + 1337) / s);
    if (Math.abs(a) + Math.abs(b) < width) return open;

    // Fios finos: garantem que tudo lá em baixo está ligado, sem engordar nada.
    if (depth > 22) {
      const ns = 13;
      const e = this.ctx.simplex.noise3d((x - 4100) / ns, (y - 4100) / (ns * 1.6), (z - 4100) / ns);
      const f = this.ctx.simplex.noise3d((x + 8200) / ns, (y + 8200) / (ns * 1.6), (z + 8200) / ns);
      if (Math.abs(e) + Math.abs(f) < 0.075 + depthF * 0.03) return open;
    }

    // Câmaras "queijo": bolhas grandes, restritas a distritos com relevo próprio.
    const region = c[COL_CHAMBER_REGION];
    if (region > 0.18 && depth > 14) {
      const cs = p.chamberScale;
      const n = this.ctx.simplex.noise3d(x / cs, y / (cs * 0.45), z / cs);
      if (n > p.chamberThreshold - (region - 0.18) * 0.45) return open;
    }

    return Cell.Solid;
  }

  private maskIdx(x: number, y: number, z: number): number {
    const lx = x - this.maskStartX;
    const ly = y - this.maskStartY;
    const lz = z - this.maskStartZ;
    if (lx < 0 || lx >= this.maskW || ly < 0 || ly >= this.maskH || lz < 0 || lz >= this.maskW) return -1;
    return (ly * this.maskW + lz) * this.maskW + lx;
  }

  private maskAt(x: number, y: number, z: number): Cell {
    const i = this.maskIdx(x, y, z);
    return i === -1 ? this.sampleCell(x, y, z) : (this.mask[i] as Cell);
  }

  private buildMask(): void {
    for (let y = this.maskStartY; y < this.maskStartY + this.maskH; y++) {
      for (let z = this.maskStartZ; z < this.maskStartZ + this.maskW; z++) {
        for (let x = this.maskStartX; x < this.maskStartX + this.maskW; x++) {
          this.mask[this.maskIdx(x, y, z)] = this.sampleCell(x, y, z);
        }
      }
    }
  }

  /** Escava, forra as paredes, insere geodos e decora. Chamado uma vez por chunk. */
  public apply(): void {
    this.buildMask();
    this.carveAndLine();
    this.placeGeodes();
    this.decorate();
    this.decorateGiantMushrooms();
  }

  private carveAndLine(): void {
    const ctx = this.ctx;

    for (let y = ctx.startY; y < ctx.endY; y++) {
      for (let z = ctx.startZ; z < ctx.endZ; z++) {
        for (let x = ctx.startX; x < ctx.endX; x++) {
          const cell = this.maskAt(x, y, z);
          if (cell === Cell.Outside) continue;

          const existing = ctx.getBlock(x, y, z);
          if (existing < 0) continue;

          if (cell === Cell.Air) {
            if (existing === BlockType.Water || existing === BlockType.Lava) continue;
            ctx.clearBlock(x, y, z);
            continue;
          }
          if (cell === Cell.Water || cell === Cell.Lava) {
            ctx.setBlock(x, y, z, cell === Cell.Lava ? BlockType.Lava : BlockType.Water);
            continue;
          }

          // Rocha: forra apenas o que ficou exposto a uma cavidade.
          if (existing !== BlockType.Stone && existing !== BlockType.Deepslate && existing !== BlockType.Tuff) continue;

          const above = this.maskAt(x, y + 1, z);
          const exposed =
            above === Cell.Air || this.maskAt(x, y - 1, z) === Cell.Air ||
            this.maskAt(x + 1, y, z) === Cell.Air || this.maskAt(x - 1, y, z) === Cell.Air ||
            this.maskAt(x, y, z + 1) === Cell.Air || this.maskAt(x, y, z - 1) === Cell.Air;
          if (!exposed) continue;

          const p = PROFILES[this.biomeAt(x, y, z)];
          const isFloor = above === Cell.Air;
          const blotch = ctx.simplex.noise3d(x / 11, y / 9, z / 11);

          if (!p.lined) {
            // Zona rasa: nada de forro temático, só cascalho solto no chão.
            if (isFloor && blotch > 0.70) ctx.setBlock(x, y, z, BlockType.Gravel);
            continue;
          }

          let type = isFloor ? p.floor : p.wall;

          // Manchas de cascalho e tufo quebram a uniformidade das paredes.
          if (blotch > 0.62) type = isFloor ? BlockType.Gravel : BlockType.Tuff;
          else if (p.wall === BlockType.Basalt && blotch < -0.68) type = BlockType.Obsidian;
          else if (p.wall === BlockType.Calcite && blotch < -0.60) type = BlockType.Amethyst;

          ctx.setBlock(x, y, z, type);
        }
      }
    }
  }

  // ── Geodos ─────────────────────────────────────────────────────────────────

  private placeGeodes(): void {
    const ctx = this.ctx;

    for (const g of this.geodes) {
      const r = Math.ceil(g.radius) + 1;
      const x0 = Math.max(ctx.startX, g.x - r);
      const x1 = Math.min(ctx.endX - 1, g.x + r);
      const y0 = Math.max(ctx.startY, g.y - r);
      const y1 = Math.min(ctx.endY - 1, g.y + r);
      const z0 = Math.max(ctx.startZ, g.z - r);
      const z1 = Math.min(ctx.endZ - 1, g.z + r);
      if (x0 > x1 || y0 > y1 || z0 > z1) continue;

      for (let y = y0; y <= y1; y++) {
        for (let z = z0; z <= z1; z++) {
          for (let x = x0; x <= x1; x++) {
            const d = Math.hypot(x - g.x, y - g.y, z - g.z) +
                      ctx.simplex.noise3d(x / 9, y / 9, z / 9) * 0.8;
            if (d > g.radius) continue;

            if (d > g.radius - 1.1) {
              ctx.setBlock(x, y, z, BlockType.SmoothBasalt);
            } else if (d > g.radius - 2.1) {
              ctx.setBlock(x, y, z, BlockType.Calcite);
            } else if (d > g.radius - 3.0) {
              // Revestimento interior: ametista maciça com drusas viradas para dentro.
              ctx.setBlock(x, y, z, cellHash3(x, y, z, 509) > 0.45 ? BlockType.Amethyst : BlockType.AmethystCluster);
            } else {
              ctx.clearBlock(x, y, z);
            }
          }
        }
      }
    }
  }

  // ── Decoração ──────────────────────────────────────────────────────────────

  private decorate(): void {
    const y0 = this.maskStartY + 1;
    const y1 = this.maskStartY + this.maskH - 2;
    const x0 = this.maskStartX + 1;
    const x1 = this.maskStartX + this.maskW - 2;
    const z0 = this.maskStartZ + 1;
    const z1 = this.maskStartZ + this.maskW - 2;

    for (let y = y0; y <= y1; y++) {
      for (let z = z0; z <= z1; z++) {
        for (let x = x0; x <= x1; x++) {
          if (this.maskAt(x, y, z) !== Cell.Air) continue;

          const onFloor = this.maskAt(x, y - 1, z) === Cell.Solid;
          const onCeiling = this.maskAt(x, y + 1, z) === Cell.Solid;
          const onWater = this.maskAt(x, y - 1, z) === Cell.Water;
          if (!onFloor && !onCeiling && !onWater) continue;

          const roll = cellHash3(x, y, z, 601);

          switch (this.biomeAt(x, y, z)) {
            case 'barren': this.decorateBarren(x, y, z, onFloor, roll); break;
            case 'dripstone': this.decorateDripstone(x, y, z, onFloor, onCeiling, roll); break;
            case 'lush': this.decorateLush(x, y, z, onFloor, onCeiling, onWater, roll); break;
            case 'fungal': this.decorateFungal(x, y, z, onFloor, onCeiling, roll); break;
            case 'crystal': this.decorateCrystal(x, y, z, onFloor, onCeiling, roll); break;
            case 'magma': this.decorateMagma(x, y, z, onFloor, onCeiling, roll); break;
          }
        }
      }
    }
  }

  /**
   * Cogumelos gigantes: o chapéu chega a 2 blocos de distância na horizontal e 6
   * na vertical, logo o pé pode estar fora do chunk. Varre-se uma região mais
   * larga do que o mapa de ocupação, com o sorteio a filtrar quase tudo antes de
   * se pagar por uma amostragem.
   */
  private decorateGiantMushrooms(): void {
    const ctx = this.ctx;
    const pad = 3;

    for (let y = ctx.startY - 7; y <= ctx.endY; y++) {
      for (let z = ctx.startZ - pad; z < ctx.endZ + pad; z++) {
        for (let x = ctx.startX - pad; x < ctx.endX + pad; x++) {
          if (cellHash3(x, y, z, 601) <= 0.985) continue;
          if (this.maskAt(x, y, z) !== Cell.Air) continue;
          if (this.maskAt(x, y - 1, z) !== Cell.Solid) continue;
          if (this.biomeAt(x, y, z) !== 'fungal') continue;
          this.buildGiantMushroom(x, y, z);
        }
      }
    }
  }

  /** Quantos blocos de ar livres existem a partir de (x,y,z) na direção vertical `dir`. */
  private clearance(x: number, y: number, z: number, dir: number, max: number): number {
    let n = 0;
    for (let i = 1; i <= max; i++) {
      if (this.maskAt(x, y + dir * i, z) !== Cell.Air) break;
      n++;
    }
    return n;
  }

  /** Zona rasa: só rocha solta. Tudo o que tem carácter mora mais fundo. */
  private decorateBarren(x: number, y: number, z: number, onFloor: boolean, roll: number): void {
    if (!onFloor) return;
    if (roll > 0.94) this.ctx.setBlock(x, y - 1, z, BlockType.Gravel);
    else if (roll < 0.03) this.ctx.setBlock(x, y - 1, z, BlockType.Dirt);
  }

  private decorateDripstone(x: number, y: number, z: number, onFloor: boolean, onCeiling: boolean, roll: number): void {
    const ctx = this.ctx;

    if (onCeiling && roll > 0.80) {
      const room = this.clearance(x, y, z, -1, 7);

      // Coluna completa quando estalactite e estalagmite se encontram.
      if (room <= 5 && cellHash3(x, y, z, 613) > 0.80) {
        for (let i = 0; i <= room; i++) ctx.setBlock(x, y - i, z, BlockType.Dripstone);
        return;
      }

      const len = Math.min(1 + Math.floor(cellHash3(x, y, z, 607) * 5), room + 1);
      for (let i = 0; i < len; i++) ctx.setBlock(x, y - i, z, BlockType.Dripstone);
      return;
    }

    if (!onFloor) return;

    if (roll > 0.84) {
      const room = this.clearance(x, y, z, 1, 6);
      const len = Math.min(1 + Math.floor(cellHash3(x, y, z, 619) * 4), room + 1);
      for (let i = 0; i < len; i++) ctx.setBlock(x, y + i, z, BlockType.Dripstone);
    } else if (roll > 0.74) {
      ctx.setBlock(x, y - 1, z, BlockType.Gravel);
    }
  }

  private decorateLush(
    x: number, y: number, z: number,
    onFloor: boolean, onCeiling: boolean, onWater: boolean,
    roll: number
  ): void {
    const ctx = this.ctx;

    // ── Superfície da água: Vitória-Régia dispersa e elegante (apenas ~8% da água) ──
    if (onWater) {
      if (roll > 0.92) {
        ctx.setBlock(x, y, z, BlockType.VictoriaRegia);
      }
      return;
    }

    // ── Teto da Caverna: Decorações pontuais (~12% do teto, deixando 88% limpo e aberto) ──
    if (onCeiling) {
      if (roll > 0.985) {
        // Flor de Esporos rara e imponente no alto
        ctx.setBlock(x, y, z, BlockType.SporeBlossom);
        return;
      }
      if (roll > 0.955) {
        // Raízes suspensas orgânicas pontuais
        ctx.setBlock(x, y, z, BlockType.HangingRoots);
        return;
      }
      if (roll > 0.880) {
        // Trepadeiras com bagas luminosas espaçadas
        const room = this.clearance(x, y, z, -1, 9);
        const len = Math.min(1 + Math.floor(cellHash3(x, y, z, 631) * 6), Math.max(room, 1));
        for (let i = 0; i < len; i++) {
          const isTip = i === len - 1;
          ctx.setBlock(x, y - i, z, isTip && cellHash3(x, y, z, 641) > 0.35 ? BlockType.GlowBerries : BlockType.CaveVine);
        }
        return;
      }
      return;
    }

    if (!onFloor) return;

    // ── Chão da Caverna: Vegetação espaçada (~14% de flora, 86% de musgo limpo e aberto) ──
    if (roll > 0.965) {
      // Flores da caverna espaçadas e destacadas
      ctx.setBlock(x, y, z, BlockType.CaveFlower);
    } else if (roll > 0.935) {
      // Folha-Gota Gigante pontual
      ctx.setBlock(x, y, z, BlockType.BigDripleaf);
    } else if (roll > 0.895) {
      // Grama alta suave
      ctx.setBlock(x, y, z, BlockType.TallGrass);
    } else if (roll > 0.855) {
      // Líquen luminoso sutil
      ctx.setBlock(x, y, z, BlockType.GlowLichen);
    } else if (roll < 0.05) {
      // Argila suave perto das margens
      ctx.setBlock(x, y - 1, z, BlockType.Clay);
    } else {
      // Chão de musgo limpo e livre para caminhar e explorar
      ctx.setBlock(x, y - 1, z, BlockType.Moss);
    }
  }

  private decorateFungal(x: number, y: number, z: number, onFloor: boolean, onCeiling: boolean, roll: number): void {
    const ctx = this.ctx;

    if (onCeiling && roll > 0.88) {
      const isViolet = roll > 0.94;
      ctx.setBlock(x, y, z, isViolet ? BlockType.VioletGlowshroom : BlockType.Glowshroom);
      return;
    }

    if (!onFloor) return;

    // roll > 0.985 fica para decorateGiantMushrooms: o chapéu passa dos limites
    // do mapa de ocupação e precisa de uma varredura mais larga.
    if (roll > 0.985) return;
    if (roll > 0.88) {
      const sub = cellHash3(x, y, z, 773);
      if (sub < 0.28) {
        ctx.setBlock(x, y, z, BlockType.Glowshroom);
      } else if (sub < 0.48) {
        ctx.setBlock(x, y, z, BlockType.VioletGlowshroom);
      } else if (sub < 0.65) {
        ctx.setBlock(x, y, z, BlockType.WarpedFungus);
      } else if (sub < 0.80) {
        ctx.setBlock(x, y, z, BlockType.CrimsonFungus);
      } else if (sub < 0.89) {
        ctx.setBlock(x, y, z, BlockType.BrownMushroom);
      } else if (sub < 0.96) {
        ctx.setBlock(x, y, z, BlockType.RedMushroom);
      } else {
        ctx.setBlock(x, y, z, BlockType.GoldenMushroom);
      }
    } else if (roll > 0.60) {
      ctx.setBlock(x, y - 1, z, BlockType.Mycelium);
    }
  }

  /** Cogumelo gigante: pé de 3-6 blocos e chapéu em disco com aba descaída. */
  private buildGiantMushroom(x: number, y: number, z: number): void {
    const ctx = this.ctx;
    const h = 3 + Math.floor(cellHash3(x, y, z, 653) * 4);
    if (this.clearance(x, y, z, 1, h + 1) < h) return;

    for (let i = 0; i < h; i++) ctx.setBlock(x, y + i, z, BlockType.MushroomStem);

    // Orelha-de-pau (Shelf Fungus) anexada ao tronco do cogumelo gigante
    if (h >= 4) {
      const shelfY = y + 1 + Math.floor(cellHash3(x, y, z, 901) * (h - 2));
      const dir = Math.floor(cellHash3(x, y, z, 902) * 4);
      const dx = dir === 0 ? 1 : dir === 1 ? -1 : 0;
      const dz = dir === 2 ? 1 : dir === 3 ? -1 : 0;
      if (this.maskAt(x + dx, shelfY, z + dz) === Cell.Air) {
        ctx.setBlock(x + dx, shelfY, z + dz, BlockType.ShelfFungus);
      }
    }

    const cap = cellHash3(x, y, z, 659) > 0.5 ? BlockType.RedMushroomCap : BlockType.BrownMushroomCap;
    const capY = y + h;
    for (let dx = -2; dx <= 2; dx++) {
      for (let dz = -2; dz <= 2; dz++) {
        const d = dx * dx + dz * dz;
        if (d > 5) continue;
        if (this.maskAt(x + dx, capY, z + dz) !== Cell.Air) continue;
        ctx.setBlock(x + dx, capY, z + dz, cap);
        if (d >= 4 && this.maskAt(x + dx, capY - 1, z + dz) === Cell.Air) {
          ctx.setBlock(x + dx, capY - 1, z + dz, cap);
        }
      }
    }
  }

  private decorateCrystal(x: number, y: number, z: number, onFloor: boolean, onCeiling: boolean, roll: number): void {
    const ctx = this.ctx;

    if (onFloor && roll > 0.975) {
      // Espigão de cristal: ametista maciça encimada por uma drusa.
      const h = 2 + Math.floor(cellHash3(x, y, z, 673) * 4);
      const room = this.clearance(x, y, z, 1, h);
      for (let i = 0; i < Math.min(h, room + 1); i++) ctx.setBlock(x, y + i, z, BlockType.Amethyst);
      if (room >= h) ctx.setBlock(x, y + h, z, BlockType.AmethystCluster);
      return;
    }

    if (roll > 0.90) ctx.setBlock(x, y, z, BlockType.AmethystCluster);
    else if (onFloor && roll > 0.66) ctx.setBlock(x, y - 1, z, BlockType.Calcite);
    else if (onCeiling && roll < 0.08) ctx.setBlock(x, y + 1, z, BlockType.Calcite);
  }

  private decorateMagma(x: number, y: number, z: number, onFloor: boolean, onCeiling: boolean, roll: number): void {
    const ctx = this.ctx;

    if (onFloor) {
      if (roll > 0.90) ctx.setBlock(x, y - 1, z, BlockType.Magma);
      else if (roll > 0.80) ctx.setBlock(x, y - 1, z, BlockType.Obsidian);
      else if (roll < 0.16) {
        // Poça de lava só em depressões, nunca num declive que a escorra.
        let walls = 0;
        if (this.maskAt(x + 1, y, z) !== Cell.Air) walls++;
        if (this.maskAt(x - 1, y, z) !== Cell.Air) walls++;
        if (this.maskAt(x, y, z + 1) !== Cell.Air) walls++;
        if (this.maskAt(x, y, z - 1) !== Cell.Air) walls++;
        if (walls === 4) ctx.setBlock(x, y, z, BlockType.Lava);
      }
      return;
    }

    if (onCeiling && roll > 0.94) ctx.setBlock(x, y + 1, z, BlockType.Magma);
  }
}
