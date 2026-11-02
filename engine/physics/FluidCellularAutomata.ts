import { AIR, blockRegistry } from '../blocks/BlockRegistry';
import type ProceduralWorld from '../world/ProceduralWorld';
import type { VoxelParticles } from '../effects/VoxelParticles';

export interface FluidCAOptions {
  /** Interval in ms between cellular automata simulation ticks (default 35ms = ~28 ticks/sec). */
  tickIntervalMs?: number;
  /** Max cell transitions processed per tick to protect frame budget (default 8000). */
  maxUpdatesPerTick?: number;
  /** Whether water + lava reactions occur (producing basalt/stone) (default true). */
  reactionsEnabled?: boolean;
  /** Whether particle effects are emitted on reactions (default true). */
  particlesEnabled?: boolean;
}

const X_OFFSET = 20000;
const Y_OFFSET = 2000;
const Z_OFFSET = 20000;
const MULT_Y = 40000;
const MULT_X = 160000000;

/** Pack 3D world integer coordinates into a safe integer JS number. */
export function packCoord(x: number, y: number, z: number): number {
  return (x + X_OFFSET) * MULT_X + (y + Y_OFFSET) * MULT_Y + (z + Z_OFFSET);
}

/** Unpack coordinate back into [x, y, z]. */
export function unpackCoord(k: number, out: [number, number, number]): void {
  const ox = Math.floor(k / MULT_X);
  const remX = k - ox * MULT_X;
  const oy = Math.floor(remX / MULT_Y);
  const oz = remX - oy * MULT_Y;
  out[0] = ox - X_OFFSET;
  out[1] = oy - Y_OFFSET;
  out[2] = oz - Z_OFFSET;
}

const HORIZONTAL_DIRECTIONS: Array<[number, number]> = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1]
];

/**
 * 3D Cellular Automata Fluid Simulator for Voxel Engine.
 * 
 * Implements discrete, mass-conserving particle-style lattice fluid dynamics:
 * - Gravity downward flow with terminal velocity
 * - Diagonal slope cascading (water tumbling off ledges & mountain slopes)
 * - Horizontal lateral pressure spreading (pool equalization & surface flattening)
 * - Water & Lava chemical reactions (solidifying into Basalt/Stone + steam)
 * - Sleeping cell optimization (stable lakes/reservoirs consume 0 CPU)
 */
export default class FluidCellularAutomata {
  private readonly world: ProceduralWorld;
  private readonly tickIntervalMs: number;
  private readonly maxUpdatesPerTick: number;
  private readonly reactionsEnabled: boolean;
  private readonly particlesEnabled: boolean;

  private readonly springs = new Set<number>();
  private activeSet = new Set<number>();
  private nextSet = new Set<number>();
  private timer = 0;
  private tickCount = 0;
  public enabled = true;

  // Reusable unpack buffer
  private readonly tempPos: [number, number, number] = [0, 0, 0];

  // Optional particle emitter
  public particles: VoxelParticles | null = null;

  constructor(world: ProceduralWorld, options: FluidCAOptions = {}) {
    this.world = world;
    this.tickIntervalMs = options.tickIntervalMs ?? 40;
    this.maxUpdatesPerTick = options.maxUpdatesPerTick ?? 3000;
    this.reactionsEnabled = options.reactionsEnabled ?? true;
    this.particlesEnabled = options.particlesEnabled ?? true;
  }

  public get activeCount(): number {
    return this.activeSet.size;
  }

  public get springCount(): number {
    return this.springs.size;
  }

  public clear(): void {
    this.activeSet.clear();
    this.nextSet.clear();
    this.springs.clear();
  }

  public addSpring(x: number, y: number, z: number): void {
    this.springs.add(packCoord(x, y, z));
  }

  public removeSpring(x: number, y: number, z: number): void {
    this.springs.delete(packCoord(x, y, z));
  }

  public isSpring(type: number): boolean {
    if (type <= 0) return false;
    return blockRegistry.isSpring(type);
  }

  /**
   * Register a fluid voxel as active.
   */
  public wakeVoxel(x: number, y: number, z: number): void {
    const type = this.world.getBlock(x, y, z);
    if (blockRegistry.isFluid(type)) {
      const k = packCoord(x, y, z);
      this.activeSet.add(k);
      this.nextSet.add(k);
    }
  }

  /**
   * Wake up all fluid voxels adjacent to the given coordinate in all 26 directions.
   * Called when a block is carved, broken or placed.
   */
  public wakeNeighbors(x: number, y: number, z: number): void {
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        for (let dz = -1; dz <= 1; dz++) {
          if (dx === 0 && dy === 0 && dz === 0) continue;
          const nx = x + dx;
          const ny = y + dy;
          const nz = z + dz;
          const type = this.world.getBlock(nx, ny, nz);
          if (blockRegistry.isFluid(type)) {
            const k = packCoord(nx, ny, nz);
            this.activeSet.add(k);
            this.nextSet.add(k);
          }
        }
      }
    }
  }

  /**
   * Wake up all fluid voxels inside a bounding box.
   */
  public wakeArea(minX: number, minY: number, minZ: number, maxX: number, maxY: number, maxZ: number): void {
    for (let x = minX; x <= maxX; x++) {
      for (let y = minY; y <= maxY; y++) {
        for (let z = minZ; z <= maxZ; z++) {
          const type = this.world.getBlock(x, y, z);
          if (blockRegistry.isFluid(type)) {
            const k = packCoord(x, y, z);
            this.activeSet.add(k);
            this.nextSet.add(k);
          }
        }
      }
    }
  }

  /**
   * Wake up all fluid voxels in a sphere radius around center.
   */
  public wakeRadius(cx: number, cy: number, cz: number, radius: number): void {
    const rCeil = Math.ceil(radius);
    const rSq = radius * radius;
    for (let dx = -rCeil; dx <= rCeil; dx++) {
      for (let dy = -rCeil; dy <= rCeil; dy++) {
        for (let dz = -rCeil; dz <= rCeil; dz++) {
          if (dx * dx + dy * dy + dz * dz <= rSq) {
            const wx = cx + dx;
            const wy = cy + dy;
            const wz = cz + dz;
            const type = this.world.getBlock(wx, wy, wz);
            if (blockRegistry.isFluid(type)) {
              const k = packCoord(wx, wy, wz);
              this.activeSet.add(k);
              this.nextSet.add(k);
            }
          }
        }
      }
    }
  }

  /**
   * Scans a newly generated or loaded chunk:
   * - Registers any Mountain Spring sources (WaterSpring) for living waterfalls
   * - Leaves natural generated seas, lakes, and reservoirs stable and resting (0 CPU, 0 ocean churning)
   */
  public scanChunk(data: { blocks: Int8Array | ArrayLike<number>; startX: number; startY: number; startZ: number }): void {
    if (!this.enabled) return;
    const blocks = data.blocks;
    if (!blocks) return;

    const s = this.world.chunkSize;
    const startX = data.startX;
    const startY = data.startY;
    const startZ = data.startZ;

    const idx = (lx: number, ly: number, lz: number) => ly * s * s + lz * s + lx;

    for (let ly = 0; ly < s; ly++) {
      const wy = startY + ly;
      for (let lz = 0; lz < s; lz++) {
        const wz = startZ + lz;
        for (let lx = 0; lx < s; lx++) {
          const i = idx(lx, ly, lz);
          const type = blocks[i];

          // Register natural water springs
          if (this.isSpring(type)) {
            this.springs.add(packCoord(startX + lx, wy, wz));
          }
        }
      }
    }
  }

  public update(deltaMs: number): void {
    if (!this.enabled) return;
    if (this.activeSet.size === 0 && this.springs.size === 0) return;

    this.timer += deltaMs;
    if (this.timer >= this.tickIntervalMs) {
      this.timer = 0;
      this.step();
    }
  }

  private isPassable(blockType: number): boolean {
    return blockType < 0 || (!blockRegistry.isSolid(blockType) && !blockRegistry.isFluid(blockType));
  }

  /**
   * Run one cellular automata tick across all active fluid cells.
   */
  public step(): void {
    this.tickCount++;
    const dirtyChunks = new Set<string>();
    const adjacentBorders = new Set<string>();
    const movedThisTick = new Set<number>();

    // ── Natural Springs Continuous Generation (Waterfalls) ───────────────
    if (this.springs.size > 0 && this.tickCount % 4 === 0) {
      for (const sKey of this.springs) {
        unpackCoord(sKey, this.tempPos);
        const sx = this.tempPos[0];
        const sy = this.tempPos[1];
        const sz = this.tempPos[2];

        const block = this.world.getBlock(sx, sy, sz);
        if (!this.isSpring(block)) {
          this.springs.delete(sKey);
          continue;
        }
        // A spring with no `fluidConfig.emitsFluidId` configured emits nothing — the core
        // has no notion of a "default" fluid to fall back to.
        const waterId = blockRegistry.getSpringEmittedFluidId(block);
        if (waterId < 0) continue;

        // 1. Emit directly below into empty air
        if (this.isPassable(this.world.getBlock(sx, sy - 1, sz))) {
          this.world.setBlockFast(sx, sy - 1, sz, waterId, dirtyChunks, adjacentBorders);
          const k = packCoord(sx, sy - 1, sz);
          this.nextSet.add(k);
          this.wakeNeighbors(sx, sy - 1, sz);
          continue;
        }

        // 2. Emit forward/sideways onto cliff edge
        for (let i = 0; i < 4; i++) {
          const [dx, dz] = HORIZONTAL_DIRECTIONS[i];
          const hx = sx + dx;
          const hz = sz + dz;
          if (this.isPassable(this.world.getBlock(hx, sy, hz))) {
            this.world.setBlockFast(hx, sy, hz, waterId, dirtyChunks, adjacentBorders);
            const k = packCoord(hx, sy, hz);
            this.nextSet.add(k);
            this.wakeNeighbors(hx, sy, hz);
            break;
          }
        }
      }
    }

    if (this.activeSet.size === 0) {
      if (dirtyChunks.size > 0) {
        this.world.flushDirtyChunks(dirtyChunks, adjacentBorders);
      }
      this.activeSet = this.nextSet;
      this.nextSet = new Set<number>();
      return;
    }

    const iterator = this.activeSet.values();
    let updatesDone = 0;

    for (const key of iterator) {
      if (updatesDone >= this.maxUpdatesPerTick) {
        this.nextSet.add(key);
        continue;
      }

      unpackCoord(key, this.tempPos);
      const x = this.tempPos[0];
      const y = this.tempPos[1];
      const z = this.tempPos[2];

      const currentType = this.world.getBlock(x, y, z);
      if (!blockRegistry.isFluid(currentType)) {
        continue;
      }

      // Viscosity: declarative ticks per step via BlockRegistry
      const viscosity = Math.max(1, blockRegistry.getFluidViscosity(currentType));
      if (viscosity > 1 && (this.tickCount % viscosity !== 0)) {
        this.nextSet.add(key);
        continue;
      }

      updatesDone++;

      // ── Rule 1: Declarative Contact Reactions (e.g. Water + Lava -> Basalt, if the game
      // configured that pair via BlockConfig.fluidConfig.reactions — the core has no
      // built-in notion of which fluids react or what they produce) ──
      if (this.reactionsEnabled) {
        const reactions = blockRegistry.getFluidReactions(currentType);
        let reacted = false;

        // Static 6 orthogonal neighbors without object allocations
        const neighborCoords = [
          x, y - 1, z,
          x, y + 1, z,
          x + 1, y, z,
          x - 1, y, z,
          x, y, z + 1,
          x, y, z - 1
        ];

        for (let n = 0; n < 18; n += 3) {
          const nx = neighborCoords[n];
          const ny = neighborCoords[n + 1];
          const nz = neighborCoords[n + 2];
          const neighborType = this.world.getBlock(nx, ny, nz);

          const rule = reactions?.[neighborType];
          if (rule) {
            const neighborTarget = rule.neighborBecomes ?? rule.resultBlockId ?? AIR;
            const selfTarget = rule.selfBecomes ?? rule.otherResultBlockId ?? AIR;
            this.world.setBlockFast(nx, ny, nz, neighborTarget, dirtyChunks, adjacentBorders);
            this.world.setBlockFast(x, y, z, selfTarget, dirtyChunks, adjacentBorders);
            this.wakeNeighbors(nx, ny, nz);
            this.wakeNeighbors(x, y, z);

            if (this.particlesEnabled && this.particles) {
              this.particles.emit({
                position: { x: nx + 0.5, y: ny + 1.0, z: nz + 0.5 },
                velocity: { x: (Math.random() - 0.5) * 0.1, y: 0.18, z: (Math.random() - 0.5) * 0.1 },
                color: rule.particleColor ?? 0xEEF2F7,
                size: 0.14,
                lifetime: 18,
                gravity: -0.015
              });
            }

            reacted = true;
            break;
          }
        }

        if (reacted) continue;
      }

      // ── Rule 2: Gravity Downward Flow ─────────────────────────────────────
      const downType = this.world.getBlock(x, y - 1, z);
      const downKey = packCoord(x, y - 1, z);

      if (this.isPassable(downType) && !movedThisTick.has(downKey)) {
        this.world.setBlockFast(x, y - 1, z, currentType, dirtyChunks, adjacentBorders);
        this.world.setBlockFast(x, y, z, AIR, dirtyChunks, adjacentBorders);
        movedThisTick.add(downKey);
        this.nextSet.add(downKey);
        this.wakeNeighbors(x, y, z);
        continue;
      }

      // ── Rule 3: Diagonal Downward Flow (Rolling off slopes & ledges) ───────
      const startDir = (this.tickCount + Math.abs(x + z)) % 4;
      let movedDiagonal = false;

      for (let i = 0; i < 4; i++) {
        const [dx, dz] = HORIZONTAL_DIRECTIONS[(startDir + i) % 4];
        const sideX = x + dx;
        const sideZ = z + dz;
        const sideType = this.world.getBlock(sideX, y, sideZ);
        const diagDownType = this.world.getBlock(sideX, y - 1, sideZ);
        const diagKey = packCoord(sideX, y - 1, sideZ);

        if (this.isPassable(sideType) && this.isPassable(diagDownType) && !movedThisTick.has(diagKey)) {
          this.world.setBlockFast(sideX, y - 1, sideZ, currentType, dirtyChunks, adjacentBorders);
          this.world.setBlockFast(x, y, z, AIR, dirtyChunks, adjacentBorders);
          movedThisTick.add(diagKey);
          this.nextSet.add(diagKey);
          this.wakeNeighbors(x, y, z);
          movedDiagonal = true;
          break;
        }
      }

      if (movedDiagonal) continue;

      // ── Rule 4: Lateral Horizontal Spreading (Pressure equalization) ──────
      // Lateral flow happens ONLY when:
      // - Next to a cliff ledge (rolls over edge), OR
      // - Under top pressure from above (hydrostatic leveling of piles).
      // Resting flat lakes NEVER move horizontally, preserving 60 FPS and 0 CPU.
      const topBlock = this.world.getBlock(x, y + 1, z);
      const hasTopPressure = blockRegistry.isFluid(topBlock) || blockRegistry.isSolid(topBlock);
      let movedLateral = false;

      for (let i = 0; i < 4; i++) {
        const [dx, dz] = HORIZONTAL_DIRECTIONS[(startDir + i) % 4];
        const nx = x + dx;
        const nz = z + dz;
        const targetType = this.world.getBlock(nx, y, nz);
        const targetKey = packCoord(nx, y, nz);

        if (this.isPassable(targetType) && !movedThisTick.has(targetKey)) {
          const belowNeighbor = this.world.getBlock(nx, y - 1, nz);
          const isLedge = this.isPassable(belowNeighbor);

          if (isLedge || hasTopPressure) {
            this.world.setBlockFast(nx, y, nz, currentType, dirtyChunks, adjacentBorders);
            this.world.setBlockFast(x, y, z, AIR, dirtyChunks, adjacentBorders);
            movedThisTick.add(targetKey);
            this.nextSet.add(targetKey);
            this.wakeNeighbors(x, y, z);
            movedLateral = true;
            break;
          }
        }
      }

      if (movedLateral) continue;

      // ── Rule 5: Stable Cell Sleeping ──────────────────────────────────────
      // The cell cannot move; it is omitted from nextSet and goes to sleep.
    }

    // Flush all affected chunks in a single batched pass
    if (dirtyChunks.size > 0) {
      this.world.flushDirtyChunks(dirtyChunks, adjacentBorders);
    }

    // Double buffer swap
    this.activeSet = this.nextSet;
    this.nextSet = new Set<number>();
  }
}
