import { Vector3 } from 'three';

export interface VoxelColliderWorld {
  isBlockSolid(x: number, y: number, z: number): boolean;
}

export interface BoxDimensions {
  width: number;
  height: number;
  depth?: number;
}

export interface AABB {
  minX: number;
  minY: number;
  minZ: number;
  maxX: number;
  maxY: number;
  maxZ: number;
}

export interface MoveResult {
  /** Displacement actually applied after collisions. */
  x: number;
  y: number;
  z: number;
  collidedX: boolean;
  collidedY: boolean;
  collidedZ: boolean;
  /** Landed on something while moving down. */
  onGround: boolean;
}

/** Tolerance for "touching" faces, so flush contacts aren't treated as overlaps. */
const EPS = 1e-7;

export interface KinematicBodyOptions {
  dimensions: BoxDimensions;
  gravity?: number;
  friction?: number;
  eyeHeight?: number;
  /** Maximum obstacle height (in world units) the body can step up automatically when grounded. Default 0. */
  stepHeight?: number;
  /** Unidades de mundo por bloco. Escala as granularidades internas do resolvedor. */
  unitScale?: number;
}

/**
 * Resolvedor de física e colisão de AABB (Axis-Aligned Bounding Box) em grids voxel.
 * Executa resolução eixo a eixo (Y, X, Z) por varredura volumétrica para evitar tunneling.
 */
export class KinematicBody {
  public readonly position = new Vector3();
  public readonly velocity = new Vector3();
  public dimensions: BoxDimensions;
  public gravity: number;
  public friction: number;
  public eyeHeight: number;
  public stepHeight: number;
  public readonly unitScale: number;
  public isGrounded = false;

  constructor(options: KinematicBodyOptions) {
    this.dimensions = options.dimensions;
    this.gravity = options.gravity ?? 0.008;
    this.friction = options.friction ?? 0.9;
    this.eyeHeight = options.eyeHeight ?? 0;
    this.stepHeight = options.stepHeight ?? 0;
    this.unitScale = options.unitScale ?? 1;
  }

  /**
   * Checa se o volume AABB colide com algum bloco sólido na posição especificada.
   */
  public checkCollisionAt(pos: Vector3, world: VoxelColliderWorld): boolean {
    return KinematicBody.intersectsSolid(world, this.getBounds(pos));
  }

  /**
   * Atualiza a física de movimento, gravidade e colisão eixo por eixo usando `moveAndCollide`.
   */
  public stepPhysics(
    world: VoxelColliderWorld,
    dtScale: number = 1.0,
    applyGravity: boolean = true,
    onCollision?: (axis: 'x' | 'y' | 'z') => void
  ): void {
    if (applyGravity) {
      this.velocity.y -= this.gravity * dtScale;
    }

    const result = this.moveAndCollide(
      world,
      this.velocity.x * dtScale,
      this.velocity.y * dtScale,
      this.velocity.z * dtScale,
      false
    );

    if (result.collidedX) {
      this.velocity.x = 0;
      onCollision?.('x');
    }
    if (result.collidedY) {
      this.velocity.y = 0;
      onCollision?.('y');
    }
    if (result.collidedZ) {
      this.velocity.z = 0;
      onCollision?.('z');
    }

    // Aplica atrito horizontal
    const frictionFactor = Math.pow(this.friction, dtScale);
    this.velocity.x *= frictionFactor;
    this.velocity.z *= frictionFactor;
  }

  /** Axis-aligned box around the body; `position` sits `eyeHeight` above its bottom. */
  public getBounds(pos: Vector3 = this.position): AABB {
    const hw = this.dimensions.width / 2;
    const hd = (this.dimensions.depth ?? this.dimensions.width) / 2;
    const minY = pos.y - this.eyeHeight;
    return {
      minX: pos.x - hw, minY, minZ: pos.z - hd,
      maxX: pos.x + hw, maxY: minY + this.dimensions.height, maxZ: pos.z + hd
    };
  }

  /** True if the box overlaps any solid block. */
  public static intersectsSolid(world: VoxelColliderWorld, box: AABB): boolean {
    for (let x = Math.floor(box.minX + EPS); x <= Math.floor(box.maxX - EPS); x++) {
      for (let y = Math.floor(box.minY + EPS); y <= Math.floor(box.maxY - EPS); y++) {
        for (let z = Math.floor(box.minZ + EPS); z <= Math.floor(box.maxZ - EPS); z++) {
          if (world.isBlockSolid(x, y, z)) return true;
        }
      }
    }
    return false;
  }

  /**
   * Moves the body by (dx, dy, dz), clipping each axis against solid blocks so it ends
   * flush with what it hits (Y first, then X, then Z).
   * With `sneakEdge`, a grounded body won't walk off ledges.
   * When `stepHeight > 0` and grounded, automatically climbs obstacles up to `stepHeight`.
   */
  public moveAndCollide(
    world: VoxelColliderWorld,
    dx: number,
    dy: number,
    dz: number,
    sneakEdge = false
  ): MoveResult {
    const wasGrounded = this.isGrounded;
    const startX = this.position.x;
    const startY = this.position.y;
    const startZ = this.position.z;

    const flatResult = this.sweepAxes(world, dx, dy, dz, sneakEdge);

    if (
      this.stepHeight > 0 &&
      wasGrounded &&
      !sneakEdge &&
      (flatResult.collidedX || flatResult.collidedZ) &&
      (dx !== 0 || dz !== 0)
    ) {
      const flatDistSq = flatResult.x * flatResult.x + flatResult.z * flatResult.z;
      const flatEndX = this.position.x;
      const flatEndY = this.position.y;
      const flatEndZ = this.position.z;
      const flatGrounded = this.isGrounded;

      // Restore start pose to test stepping over obstacle
      this.position.set(startX, startY, startZ);
      this.isGrounded = wasGrounded;

      const upResult = this.sweepAxes(world, 0, this.stepHeight, 0, false);
      const actualUp = upResult.y;

      if (actualUp > 0.05) {
        const horizResult = this.sweepAxes(world, dx, 0, dz, false);
        const downResult = this.sweepAxes(world, 0, -actualUp + dy, 0, false);
        const steppedDistSq = horizResult.x * horizResult.x + horizResult.z * horizResult.z;

        if (steppedDistSq > flatDistSq + 0.001) {
          return {
            x: horizResult.x,
            y: actualUp + downResult.y,
            z: horizResult.z,
            collidedX: horizResult.collidedX,
            collidedY: downResult.collidedY,
            collidedZ: horizResult.collidedZ,
            onGround: downResult.onGround
          };
        }
      }

      // Obstacle too high: keep original flat move
      this.position.set(flatEndX, flatEndY, flatEndZ);
      this.isGrounded = flatGrounded;
    }

    return flatResult;
  }

  private sweepAxes(
    world: VoxelColliderWorld,
    dx: number,
    dy: number,
    dz: number,
    sneakEdge: boolean
  ): MoveResult {
    const box = this.getBounds();
    const reqY = dy;

    if (sneakEdge && this.isGrounded) {
      const step = 0.05 * this.unitScale;
      const hasGround = (ox: number, oz: number) =>
        KinematicBody.intersectsSolid(world, offset(box, ox, -1, oz));
      while (dx !== 0 && !hasGround(dx, 0)) {
        dx = Math.abs(dx) < step ? 0 : dx - Math.sign(dx) * step;
      }
      while (dz !== 0 && !hasGround(0, dz)) {
        dz = Math.abs(dz) < step ? 0 : dz - Math.sign(dz) * step;
      }
      while (dx !== 0 && dz !== 0 && !hasGround(dx, dz)) {
        dx = Math.abs(dx) < step ? 0 : dx - Math.sign(dx) * step;
        dz = Math.abs(dz) < step ? 0 : dz - Math.sign(dz) * step;
      }
    }
    const sneakX = dx, sneakZ = dz;

    const solids = collectSolids(world, {
      minX: Math.min(box.minX, box.minX + dx), maxX: Math.max(box.maxX, box.maxX + dx),
      minY: Math.min(box.minY, box.minY + dy), maxY: Math.max(box.maxY, box.maxY + dy),
      minZ: Math.min(box.minZ, box.minZ + dz), maxZ: Math.max(box.maxZ, box.maxZ + dz)
    });

    for (const b of solids) dy = clipY(b, box, dy);
    box.minY += dy; box.maxY += dy;
    for (const b of solids) dx = clipX(b, box, dx);
    box.minX += dx; box.maxX += dx;
    for (const b of solids) dz = clipZ(b, box, dz);
    box.minZ += dz; box.maxZ += dz;

    this.position.x += dx;
    this.position.y += dy;
    this.position.z += dz;

    const collidedX = dx !== sneakX;
    const collidedY = dy !== reqY;
    const collidedZ = dz !== sneakZ;
    const onGround = collidedY && reqY < 0;
    this.isGrounded = onGround;

    return { x: dx, y: dy, z: dz, collidedX, collidedY, collidedZ, onGround };
  }
}

function offset(box: AABB, x: number, y: number, z: number): AABB {
  return {
    minX: box.minX + x, minY: box.minY + y, minZ: box.minZ + z,
    maxX: box.maxX + x, maxY: box.maxY + y, maxZ: box.maxZ + z
  };
}

function collectSolids(world: VoxelColliderWorld, region: AABB): AABB[] {
  const boxes: AABB[] = [];
  for (let x = Math.floor(region.minX); x <= Math.floor(region.maxX); x++) {
    for (let y = Math.floor(region.minY); y <= Math.floor(region.maxY); y++) {
      for (let z = Math.floor(region.minZ); z <= Math.floor(region.maxZ); z++) {
        if (world.isBlockSolid(x, y, z)) {
          boxes.push({ minX: x, minY: y, minZ: z, maxX: x + 1, maxY: y + 1, maxZ: z + 1 });
        }
      }
    }
  }
  return boxes;
}

const overlapsX = (a: AABB, b: AABB) => a.maxX > b.minX + EPS && a.minX < b.maxX - EPS;
const overlapsY = (a: AABB, b: AABB) => a.maxY > b.minY + EPS && a.minY < b.maxY - EPS;
const overlapsZ = (a: AABB, b: AABB) => a.maxZ > b.minZ + EPS && a.minZ < b.maxZ - EPS;

function clipY(b: AABB, box: AABB, dy: number): number {
  if (!overlapsX(b, box) || !overlapsZ(b, box)) return dy;
  if (dy > 0 && box.maxY <= b.minY + EPS) return Math.min(dy, b.minY - box.maxY);
  if (dy < 0 && box.minY >= b.maxY - EPS) return Math.max(dy, b.maxY - box.minY);
  return dy;
}

function clipX(b: AABB, box: AABB, dx: number): number {
  if (!overlapsY(b, box) || !overlapsZ(b, box)) return dx;
  if (dx > 0 && box.maxX <= b.minX + EPS) return Math.min(dx, b.minX - box.maxX);
  if (dx < 0 && box.minX >= b.maxX - EPS) return Math.max(dx, b.maxX - box.minX);
  return dx;
}

function clipZ(b: AABB, box: AABB, dz: number): number {
  if (!overlapsX(b, box) || !overlapsY(b, box)) return dz;
  if (dz > 0 && box.maxZ <= b.minZ + EPS) return Math.min(dz, b.minZ - box.maxZ);
  if (dz < 0 && box.minZ >= b.maxZ - EPS) return Math.max(dz, b.maxZ - box.minZ);
  return dz;
}
