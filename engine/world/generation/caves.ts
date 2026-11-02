import type { ChunkContext } from '../WorldGenerator';
import { cellHash2, cellHash3 } from './noise';

/** Climate/position a cave biome rule is tested against, at one point inside the rock. */
export interface CaveClimate {
  temp: number;
  hum: number;
  y: number;
  /** Blocks below the surface at this column. */
  depth: number;
}

export interface CaveCellInfo {
  onFloor: boolean;
  onCeiling: boolean;
  onWater: boolean;
  /** A stable per-position roll in [0,1) (same hash every call) — use it for your own rarity thresholds. */
  roll: number;
}

/** What a `decorate`/`decorateStructure` callback can read and do, without reaching into carver internals. */
export interface CaveCarverHelpers {
  readonly ctx: ChunkContext;
  isAir(x: number, y: number, z: number): boolean;
  isSolid(x: number, y: number, z: number): boolean;
  isWater(x: number, y: number, z: number): boolean;
  /** How many open (air) cells exist starting at `(x,y,z)`, going `dir` (±1) in Y, up to `max`. */
  clearance(x: number, y: number, z: number, dir: 1 | -1, max: number): number;
  /** Which configured cave biome occupies this point (by id). */
  biomeAt(x: number, y: number, z: number): string;
  hash3(x: number, y: number, z: number, salt: number): number;
}

export interface CaveProfile {
  tunnelScale: number;
  tunnelWidth: number;
  tunnelSquash: number;
  /** Wavelength of the "cheese" chambers (large rounded bubbles). */
  chamberScale: number;
  /** Threshold of the chamber noise; lower = larger, more frequent chambers. */
  chamberThreshold: number;
  /** Block lining exposed walls. */
  wall: number;
  /** Block lining exposed floors. */
  floor: number;
  /** `false` leaves the original rock exposed — no themed lining at all. */
  lined: boolean;
  /** Replaces `floor`/`wall` in noise-patched spots (only while `lined`). */
  blotchFloorBlock?: number;
  blotchWallBlock?: number;
  /** Replaces `wall` in rarer, darker noise-patched spots — a vein look. */
  veinBlock?: number;
  /** Threshold for `veinBlock`; default -0.6. */
  veinThreshold?: number;
  /** Sparse rubble on the floor when `lined` is false. */
  looseFloorBlock?: number;
  /** Threshold for `looseFloorBlock`; default 0.70. */
  looseFloorThreshold?: number;
  /** Open cells below the column's lava-sea line (see `CaveCarverOptions.lavaSeaY`) flood with lava instead of staying air. */
  floodsWithLava?: boolean;
  /** Geodes (see `CaveCarverOptions.geodes`) may only form where `allowsGeodes` is true. */
  allowsGeodes?: boolean;
  /** Called once per exposed open cell adjacent to a floor/ceiling/water surface, inside this biome. */
  decorate?(h: CaveCarverHelpers, x: number, y: number, z: number, info: CaveCellInfo): void;
  /**
   * Called once per open-cell-on-floor across a WIDER, padded scan (so a structure anchored
   * near a chunk edge still gets its full footprint) — for rare, large decorations (a giant
   * mushroom, a crystal spire cluster...). Check `roll` yourself and return early; this runs
   * over far more cells than `decorate` and is only worth the cost for genuinely rare things.
   */
  decorateStructure?(h: CaveCarverHelpers, x: number, y: number, z: number, roll: number): void;
}

export interface CaveBiomeConfig {
  id: string;
  /** Evaluated in array order; the first rule that returns true wins. Keep a catch-all last (e.g. shallow/barren rock). */
  test(climate: CaveClimate): boolean;
  profile: CaveProfile;
}

export interface CaveEntranceOptions {
  scales?: [number, number];
  weight?: number;
  threshold?: number;
  /** Only columns at or above this surface height can open to the sky. Defaults to `seaLevel + 4`. */
  minSurfaceY?: number;
}

export interface CaveGeodeOptions {
  shellBlockId: number;
  bandBlockId: number;
  coreBlockId: number;
  /** Occasionally used instead of `coreBlockId` for variety (e.g. a cluster variant). */
  coreAltBlockId?: number;
  /** Chance (0-1) of `coreAltBlockId` over `coreBlockId`, per voxel. Default 0.45. */
  coreAltChance?: number;
  minY?: number;
  maxY?: number;
  cellXZ?: number;
  cellY?: number;
  /** Chance (0-1) a given cell actually has a geode. Default 0.12. */
  density?: number;
  minRadius?: number;
  radiusRange?: number;
}

export interface CaveCarverOptions {
  /** Ordered cave biomes; first matching rule wins, last entry is the fallback (e.g. shallow/barren rock). */
  biomes: CaveBiomeConfig[];
  seaLevel: number;
  waterBlockId: number;
  lavaBlockId: number;
  /** Which existing block ids caves are allowed to carve/line — everything else (ores already placed, custom content) is left untouched. */
  rockBlockIds: number[];
  /** Must agree with whatever generated the terrain above the caves — reuse `sampleHeight` or your own function. */
  sampleSurfaceHeight(ctx: ChunkContext, x: number, z: number): number;
  /** Columns where this returns true never open to the sky and start caving a bit deeper (e.g. under a volcano cone). */
  isUnderSurfaceFeature?(x: number, z: number): boolean;
  entrance?: CaveEntranceOptions;
  /**
   * Column-level Y below which open cells in a `floodsWithLava` biome fill with lava instead
   * of air. Omit to disable lava flooding entirely (every open cell stays air/water).
   */
  lavaSeaY?(ctx: ChunkContext, x: number, z: number, climate: { temp: number; hum: number }): number;
  /** Omit to disable geodes even where a biome sets `allowsGeodes`. */
  geodes?: CaveGeodeOptions;
  /** Called once per candidate chamber to resize/reshape it (e.g. enlarge in humid regions). Defaults to identity. */
  chamberSize?(ctx: ChunkContext, x: number, z: number, base: { rx: number; ry: number; rz: number }): { rx: number; ry: number; rz: number };
  /** Chance (0-1) a chamber has a lake at its base. Default computed per-chamber via hash > 0.42. */
  chamberLakeThreshold?: number;
}

const enum Cell {
  Solid = 0,
  Air = 1,
  Water = 2,
  Lava = 3,
  /** Outside the terrain volume (sky or open sea) — neither rock nor cave. */
  Outside = 4
}

interface Ravine {
  x: number; z: number;
  cos: number; sin: number;
  halfLength: number; halfWidth: number;
  topY: number; bottomY: number;
  seed: number;
}

interface Chamber {
  x: number; y: number; z: number;
  rx: number; ry: number; rz: number;
  lakeY: number;
  hasLake: boolean;
}

interface Shaft {
  x: number; z: number;
  radius: number;
  bottomY: number;
  seed: number;
}

interface Geode {
  x: number; y: number; z: number;
  radius: number;
}

const RAVINE_CELL = 224;
const CHAMBER_CELL = 160;
const SHAFT_CELL = 96;

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
/** Max vertical reach of a `decorateStructure` piece, so one anchored just outside the chunk still gets its full footprint. */
const MASK_PAD_Y = 8;

/**
 * Carves and decorates the caves of one chunk: 3D "worm" tunnels + "cheese" chambers for the
 * main network, plus ravines/shafts/geodes scattered on cell grids, all keyed to a cave biome
 * resolved per-point from climate (temperature/humidity) and depth. Everything that decides
 * is a pure function of world coordinates — no pass reads neighboring chunks — so galleries
 * line up seamlessly across chunks generated by different workers in any order.
 *
 * This is `CaveCarver` generalized out of a Minecraft-flavored example into pure geometry:
 * it carries no block names, no fixed biome list, and no built-in decoration — every bit of
 * "what this looks like" comes from `CaveCarverOptions`. See `examples/game/content/generators/caves.ts`
 * for the full dripstone/lush/fungal/crystal/magma configuration this replaced.
 */
export class CaveCarver {
  private readonly ctx: ChunkContext;
  private readonly options: CaveCarverOptions;
  private readonly rockBlockIds: Set<number>;
  private readonly helpers: CaveCarverHelpers;

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

  constructor(ctx: ChunkContext, options: CaveCarverOptions) {
    this.ctx = ctx;
    this.options = options;
    this.rockBlockIds = new Set(options.rockBlockIds);

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

    this.helpers = {
      ctx,
      isAir: (x, y, z) => this.maskAt(x, y, z) === Cell.Air,
      isSolid: (x, y, z) => this.maskAt(x, y, z) === Cell.Solid,
      isWater: (x, y, z) => this.maskAt(x, y, z) === Cell.Water,
      clearance: (x, y, z, dir, max) => this.clearance(x, y, z, dir, max),
      biomeAt: (x, y, z) => this.resolveBiome(x, y, z).id,
      hash3: cellHash3
    };

    this.collectStructures();
  }

  // ── Columns ──────────────────────────────────────────────────────────────

  private colBase(x: number, z: number): number {
    const lx = x - this.colStartX;
    const lz = z - this.colStartZ;
    if (lx < 0 || lx >= this.colSize || lz < 0 || lz >= this.colSize) return -1;
    return lz * this.colSize + lx;
  }

  private column(x: number, z: number, out: Float32Array): void {
    const base = this.colBase(x, z);
    if (base >= 0 && this.colReady[base]) {
      const o = base * COL_FIELDS;
      for (let i = 0; i < COL_FIELDS; i++) out[i] = this.cols[o + i];
      return;
    }

    const ctx = this.ctx;
    const opts = this.options;
    const sy = opts.sampleSurfaceHeight(ctx, x, z);

    const temp = ctx.simplex.noise((x + 50000) / 430, (z - 50000) / 430) +
                 ctx.simplex.noise((x + 50000) / 150, (z - 50000) / 150) * 0.25;
    const hum = ctx.simplex.noise((x - 70000) / 470, (z + 70000) / 470) +
                ctx.simplex.noise((x - 70000) / 160, (z + 70000) / 160) * 0.25;

    const widthVar = ctx.simplex.noise((x + 6100) / 310, (z - 6100) / 310) * 0.055;
    const chamberRegion = ctx.simplex.noise((x + 9000) / 560, (z - 9000) / 560);

    const ent = opts.entrance ?? {};
    const [es1, es2] = ent.scales ?? [130, 45];
    const entranceWeight = ent.weight ?? 0.4;
    const entranceThreshold = ent.threshold ?? 0.52;
    const minSurfaceY = ent.minSurfaceY ?? opts.seaLevel + 4;
    const entranceN = ctx.simplex.noise((x + 2000) / es1, (z - 2000) / es1) +
                      ctx.simplex.noise((x + 2000) / es2, (z - 2000) / es2) * entranceWeight;

    const onFeature = opts.isUnderSurfaceFeature?.(x, z) ?? false;
    const openToSky = entranceN > entranceThreshold && sy > minSurfaceY && !onFeature;

    let caveTop: number;
    if (onFeature) caveTop = sy - 10;
    else if (openToSky) caveTop = sy;
    else if (sy <= opts.seaLevel + 2) caveTop = sy - 6;
    else caveTop = sy - 4;

    out[COL_SURFACE] = sy;
    out[COL_CAVE_TOP] = caveTop;
    out[COL_TEMP] = temp;
    out[COL_HUM] = hum;
    out[COL_WIDTH_VAR] = widthVar;
    out[COL_CHAMBER_REGION] = chamberRegion;
    out[COL_ENTRANCE] = openToSky ? 1 : 0;
    out[COL_LAVA_Y] = opts.lavaSeaY ? opts.lavaSeaY(ctx, x, z, { temp, hum }) - 28 : -Infinity;

    if (base >= 0) {
      const o = base * COL_FIELDS;
      for (let i = 0; i < COL_FIELDS; i++) this.cols[o + i] = out[i];
      this.colReady[base] = 1;
    }
  }

  // ── Biome ────────────────────────────────────────────────────────────────

  private resolveBiome(x: number, y: number, z: number): CaveBiomeConfig {
    const c = this.colScratch;
    this.column(x, z, c);
    const climate: CaveClimate = { temp: c[COL_TEMP], hum: c[COL_HUM], y, depth: c[COL_SURFACE] - y };
    for (const biome of this.options.biomes) {
      if (biome.test(climate)) return biome;
    }
    return this.options.biomes[this.options.biomes.length - 1];
  }

  /** Cave biome id at any world point. */
  public biomeAt(x: number, y: number, z: number): string {
    return this.resolveBiome(x, y, z).id;
  }

  // ── Structures ───────────────────────────────────────────────────────────

  private collectStructures(): void {
    const ctx = this.ctx;
    const opts = this.options;
    const cx = Math.floor((ctx.startX + ctx.endX) / 2);
    const cy = Math.floor((ctx.startY + ctx.endY) / 2);
    const cz = Math.floor((ctx.startZ + ctx.endZ) / 2);

    // Ravines
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
          seed: ha * 100
        });
      }
    }

    // Chambers
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
        if (opts.chamberSize) {
          const sized = opts.chamberSize(ctx, chamberX, chamberZ, { rx, ry, rz: rx * (0.75 + hk * 0.5) });
          rx = sized.rx;
          ry = sized.ry;
        }

        const lakeThreshold = opts.chamberLakeThreshold ?? 0.42;

        this.chambers.push({
          x: chamberX,
          y: centerY,
          z: chamberZ,
          rx,
          ry,
          rz: rx * (0.75 + hk * 0.5),
          lakeY: centerY - ry * 0.52,
          hasLake: hk > lakeThreshold
        });
      }
    }

    // Shafts
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
          seed: hx * 100
        });
      }
    }

    // Geodes
    const g = opts.geodes;
    if (g) {
      const cellXZ = g.cellXZ ?? 112;
      const cellY = g.cellY ?? 72;
      const minY = g.minY ?? -150;
      const maxY = g.maxY ?? -45;
      const density = g.density ?? 0.12;

      const gcx = Math.floor(cx / cellXZ);
      const gcy = Math.floor(cy / cellY);
      const gcz = Math.floor(cz / cellXZ);
      for (let dx = -1; dx <= 1; dx++) {
        for (let dy = -1; dy <= 1; dy++) {
          for (let dz = -1; dz <= 1; dz++) {
            const gx = gcx + dx;
            const gy = gcy + dy;
            const gz = gcz + dz;
            if (cellHash3(gx, gy, gz, 401) > density) continue;

            const hx = cellHash3(gx, gy, gz, 419);
            const hy = cellHash3(gx, gy, gz, 433);
            const hz = cellHash3(gx, gy, gz, 449);
            const hr = cellHash3(gx, gy, gz, 463);

            const y = gy * cellY + 12 + Math.floor(hy * (cellY - 24));
            if (y > maxY || y < minY) continue;

            const x = gx * cellXZ + 16 + Math.floor(hx * (cellXZ - 32));
            const z = gz * cellXZ + 16 + Math.floor(hz * (cellXZ - 32));

            if (!this.resolveBiome(x, y, z).profile.allowsGeodes) continue;

            this.geodes.push({ x, y, z, radius: (g.minRadius ?? 5.5) + hr * (g.radiusRange ?? 3.5) });
          }
        }
      }
    }
  }

  private ravineAt(x: number, y: number, z: number): boolean {
    for (const r of this.ravines) {
      if (y > r.topY || y < r.bottomY) continue;

      const dx = x - r.x;
      const dz = z - r.z;
      const along = dx * r.cos + dz * r.sin;
      if (Math.abs(along) > r.halfLength) continue;

      const perp = -dx * r.sin + dz * r.cos;
      if (Math.abs(perp) > r.halfWidth + 5) continue;

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
    for (const s of this.shafts) {
      if (y < s.bottomY) continue;

      const dx = x - s.x;
      const dz = z - s.z;
      if (Math.abs(dx) > 9 || Math.abs(dz) > 9) continue;

      const wx = this.ctx.simplex.noise(y / 23, s.seed) * 4.0;
      const wz = this.ctx.simplex.noise(y / 23 + 50, s.seed) * 4.0;
      if (Math.hypot(dx - wx, dz - wz) < s.radius) return true;
    }
    return false;
  }

  private chamberAt(x: number, y: number, z: number): Chamber | null {
    for (const c of this.chambers) {
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

  // ── Carving ──────────────────────────────────────────────────────────────

  private sampleCell(x: number, y: number, z: number): Cell {
    const c = this.colScratch;
    this.column(x, z, c);

    const surfaceY = c[COL_SURFACE];
    if (y > surfaceY) return y <= this.options.seaLevel ? Cell.Water : Cell.Outside;
    if (y > c[COL_CAVE_TOP]) return Cell.Solid;

    const depth = surfaceY - y;
    const depthF = Math.min(Math.max(depth, 0) / 90, 1);
    const biome = this.resolveBiome(x, y, z);
    const p = biome.profile;

    const open: Cell = p.floodsWithLava && y < c[COL_LAVA_Y] ? Cell.Lava : Cell.Air;

    const chamber = this.chamberAt(x, y, z);
    if (chamber) {
      if (!chamber.hasLake || y > chamber.lakeY) return open;
      return p.floodsWithLava ? Cell.Lava : Cell.Water;
    }

    if (this.shaftAt(x, y, z)) return open;
    if (this.ravineAt(x, y, z)) return open;

    let width = p.tunnelWidth + depthF * 0.05 + c[COL_WIDTH_VAR];
    if (c[COL_ENTRANCE] > 0 && depth < 18) {
      width += 0.13 * (1 - depth / 18);
    }

    const s = p.tunnelScale;
    const ys = s * p.tunnelSquash;
    const a = this.ctx.simplex.noise3d(x / s, y / ys, z / s);
    const b = this.ctx.simplex.noise3d((x + 1337) / s, (y + 1337) / ys, (z + 1337) / s);
    if (Math.abs(a) + Math.abs(b) < width) return open;

    if (depth > 22) {
      const ns = 13;
      const e = this.ctx.simplex.noise3d((x - 4100) / ns, (y - 4100) / (ns * 1.6), (z - 4100) / ns);
      const f = this.ctx.simplex.noise3d((x + 8200) / ns, (y + 8200) / (ns * 1.6), (z + 8200) / ns);
      if (Math.abs(e) + Math.abs(f) < 0.075 + depthF * 0.03) return open;
    }

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

  /** Carves, lines, places geodes and decorates. Call once per chunk. */
  public apply(): void {
    this.buildMask();
    this.carveAndLine();
    if (this.options.geodes) this.placeGeodes();
    this.decorate();
    this.decorateStructures();
  }

  private carveAndLine(): void {
    const ctx = this.ctx;
    const { waterBlockId, lavaBlockId } = this.options;

    for (let y = ctx.startY; y < ctx.endY; y++) {
      for (let z = ctx.startZ; z < ctx.endZ; z++) {
        for (let x = ctx.startX; x < ctx.endX; x++) {
          const cell = this.maskAt(x, y, z);
          if (cell === Cell.Outside) continue;

          const existing = ctx.getBlock(x, y, z);
          if (existing < 0) continue;

          if (cell === Cell.Air) {
            if (existing === waterBlockId || existing === lavaBlockId) continue;
            ctx.clearBlock(x, y, z);
            continue;
          }
          if (cell === Cell.Water || cell === Cell.Lava) {
            ctx.setBlock(x, y, z, cell === Cell.Lava ? lavaBlockId : waterBlockId);
            continue;
          }

          if (!this.rockBlockIds.has(existing)) continue;

          const above = this.maskAt(x, y + 1, z);
          const exposed =
            above === Cell.Air || this.maskAt(x, y - 1, z) === Cell.Air ||
            this.maskAt(x + 1, y, z) === Cell.Air || this.maskAt(x - 1, y, z) === Cell.Air ||
            this.maskAt(x, y, z + 1) === Cell.Air || this.maskAt(x, y, z - 1) === Cell.Air;
          if (!exposed) continue;

          const p = this.resolveBiome(x, y, z).profile;
          const isFloor = above === Cell.Air;
          const blotch = ctx.simplex.noise3d(x / 11, y / 9, z / 11);

          if (!p.lined) {
            if (isFloor && p.looseFloorBlock !== undefined && blotch > (p.looseFloorThreshold ?? 0.70)) {
              ctx.setBlock(x, y, z, p.looseFloorBlock);
            }
            continue;
          }

          let type = isFloor ? p.floor : p.wall;
          if (blotch > 0.62) type = isFloor ? (p.blotchFloorBlock ?? p.floor) : (p.blotchWallBlock ?? p.wall);
          else if (p.veinBlock !== undefined && blotch < (p.veinThreshold ?? -0.6)) type = p.veinBlock;

          ctx.setBlock(x, y, z, type);
        }
      }
    }
  }

  // ── Geodes ───────────────────────────────────────────────────────────────

  private placeGeodes(): void {
    const ctx = this.ctx;
    const g = this.options.geodes!;
    const coreAltChance = g.coreAltChance ?? 0.45;

    for (const geode of this.geodes) {
      const r = Math.ceil(geode.radius) + 1;
      const x0 = Math.max(ctx.startX, geode.x - r);
      const x1 = Math.min(ctx.endX - 1, geode.x + r);
      const y0 = Math.max(ctx.startY, geode.y - r);
      const y1 = Math.min(ctx.endY - 1, geode.y + r);
      const z0 = Math.max(ctx.startZ, geode.z - r);
      const z1 = Math.min(ctx.endZ - 1, geode.z + r);
      if (x0 > x1 || y0 > y1 || z0 > z1) continue;

      for (let y = y0; y <= y1; y++) {
        for (let z = z0; z <= z1; z++) {
          for (let x = x0; x <= x1; x++) {
            const d = Math.hypot(x - geode.x, y - geode.y, z - geode.z) +
                      ctx.simplex.noise3d(x / 9, y / 9, z / 9) * 0.8;
            if (d > geode.radius) continue;

            if (d > geode.radius - 1.1) {
              ctx.setBlock(x, y, z, g.shellBlockId);
            } else if (d > geode.radius - 2.1) {
              ctx.setBlock(x, y, z, g.bandBlockId);
            } else if (d > geode.radius - 3.0) {
              const core = g.coreAltBlockId !== undefined && cellHash3(x, y, z, 509) > coreAltChance ? g.coreAltBlockId : g.coreBlockId;
              ctx.setBlock(x, y, z, core);
            } else {
              ctx.clearBlock(x, y, z);
            }
          }
        }
      }
    }
  }

  // ── Decoration ───────────────────────────────────────────────────────────

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
          const p = this.resolveBiome(x, y, z).profile;
          p.decorate?.(this.helpers, x, y, z, { onFloor, onCeiling, onWater, roll });
        }
      }
    }
  }

  private decorateStructures(): void {
    if (!this.options.biomes.some((b) => b.profile.decorateStructure)) return;

    const ctx = this.ctx;
    const pad = 3;

    for (let y = ctx.startY - MASK_PAD_Y; y <= ctx.endY; y++) {
      for (let z = ctx.startZ - pad; z < ctx.endZ + pad; z++) {
        for (let x = ctx.startX - pad; x < ctx.endX + pad; x++) {
          if (this.maskAt(x, y, z) !== Cell.Air) continue;
          if (this.maskAt(x, y - 1, z) !== Cell.Solid) continue;

          const p = this.resolveBiome(x, y, z).profile;
          if (!p.decorateStructure) continue;

          p.decorateStructure(this.helpers, x, y, z, cellHash3(x, y, z, 601));
        }
      }
    }
  }

  private clearance(x: number, y: number, z: number, dir: 1 | -1, max: number): number {
    let n = 0;
    for (let i = 1; i <= max; i++) {
      if (this.maskAt(x, y + dir * i, z) !== Cell.Air) break;
      n++;
    }
    return n;
  }
}
