import { Vector3 } from 'three';

export interface VoxelColliderWorld {
  isBlockSolid(x: number, y: number, z: number): boolean;
}

export interface BoxDimensions {
  width: number;
  height: number;
  depth?: number;
}

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
}
