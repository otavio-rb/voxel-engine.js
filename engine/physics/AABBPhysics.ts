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
}

/**
 * Resolvedor de física e colisão de AABB (Axis-Aligned Bounding Box) em grids voxel.
 * Executa resolução eixo a eixo (X, Y, Z) para evitar tunneling em esquinas.
 */
export class KinematicBody {
  public readonly position = new Vector3();
  public readonly velocity = new Vector3();
  public dimensions: BoxDimensions;
  public gravity: number;
  public friction: number;
  public eyeHeight: number;
  public isGrounded = false;

  constructor(options: KinematicBodyOptions) {
    this.dimensions = options.dimensions;
    this.gravity = options.gravity ?? 0.008;
    this.friction = options.friction ?? 0.9;
    this.eyeHeight = options.eyeHeight ?? 0;
  }

  /**
   * Checa se o volume AABB colide com algum bloco sólido na posição especificada.
   */
  public checkCollisionAt(pos: Vector3, world: VoxelColliderWorld): boolean {
    const w = this.dimensions.width / 2;
    const d = (this.dimensions.depth ?? this.dimensions.width) / 2;
    const h = this.dimensions.height;
    const baseY = pos.y - this.eyeHeight;

    const points = [
      // Base / Pés
      { x: pos.x - w, y: baseY, z: pos.z - d },
      { x: pos.x + w, y: baseY, z: pos.z - d },
      { x: pos.x - w, y: baseY, z: pos.z + d },
      { x: pos.x + w, y: baseY, z: pos.z + d },

      // Nível Médio
      { x: pos.x - w, y: baseY + h * 0.5, z: pos.z - d },
      { x: pos.x + w, y: baseY + h * 0.5, z: pos.z - d },
      { x: pos.x - w, y: baseY + h * 0.5, z: pos.z + d },
      { x: pos.x + w, y: baseY + h * 0.5, z: pos.z + d },

      // Topo / Cabeça
      { x: pos.x - w, y: baseY + h, z: pos.z - d },
      { x: pos.x + w, y: baseY + h, z: pos.z - d },
      { x: pos.x - w, y: baseY + h, z: pos.z + d },
      { x: pos.x + w, y: baseY + h, z: pos.z + d },
    ];

    for (const p of points) {
      if (world.isBlockSolid(Math.floor(p.x), Math.floor(p.y), Math.floor(p.z))) {
        return true;
      }
    }
    return false;
  }

  /**
   * Atualiza a física de movimento, gravidade e colisão eixo por eixo.
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

    const nextPos = this.position.clone();

    // 1. Resolução Eixo X
    nextPos.x += this.velocity.x;
    if (this.checkCollisionAt(nextPos, world)) {
      nextPos.x = this.position.x;
      this.velocity.x = 0;
      onCollision?.('x');
    }
    this.position.x = nextPos.x;

    // 2. Resolução Eixo Y
    nextPos.y += this.velocity.y * dtScale;
    if (this.checkCollisionAt(nextPos, world)) {
      if (this.velocity.y < 0) {
        this.isGrounded = true;
      }
      nextPos.y = this.position.y;
      this.velocity.y = 0;
      onCollision?.('y');
    } else {
      this.isGrounded = false;
    }
    this.position.y = nextPos.y;

    // 3. Resolução Eixo Z
    nextPos.z += this.velocity.z;
    if (this.checkCollisionAt(nextPos, world)) {
      nextPos.z = this.position.z;
      this.velocity.z = 0;
      onCollision?.('z');
    }
    this.position.z = nextPos.z;

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
   * flush with what it hits (Y first, then X, then Z — same order as Minecraft's
   * `Entity.moveEntity`). With `sneakEdge`, a grounded body won't walk off ledges.
   */
  public moveAndCollide(
    world: VoxelColliderWorld,
    dx: number,
    dy: number,
    dz: number,
    sneakEdge = false
  ): MoveResult {
    const box = this.getBounds();
    const reqY = dy;

    if (sneakEdge && this.isGrounded) {
      const step = 0.05;
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
