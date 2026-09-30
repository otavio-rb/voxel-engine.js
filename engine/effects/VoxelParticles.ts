import {
  BoxGeometry,
  Color,
  DynamicDrawUsage,
  Euler,
  InstancedMesh,
  Matrix4,
  MeshLambertMaterial,
  Object3D,
  Quaternion,
  Vector3
} from 'three';
import type { VoxelColliderWorld } from '../physics/AABBPhysics';

/** Particle motion is expressed per tick of 50 ms, like the player's movement. */
const TICK_MS = 50;

export interface Vec3Like {
  x: number;
  y: number;
  z: number;
}

export interface ParticleOptions {
  position: Vec3Like;
  /** Blocks per tick. */
  velocity?: Vec3Like;
  color: number;
  /** Cube edge in blocks (default 0.15). */
  size?: number;
  /** Lifetime in ticks (default 20). */
  lifetime?: number;
  /** Downward acceleration per tick (default 0.04). */
  gravity?: number;
  /** Velocity multiplier per tick (default 0.98). */
  drag?: number;
  /** Horizontal velocity multiplier per tick while resting on a block (default 0.7). */
  groundFriction?: number;
  /** Stop against solid blocks (default true). */
  collide?: boolean;
  /** Shrink during the last third of the lifetime instead of vanishing (default true). */
  shrink?: boolean;
}

export interface VoxelParticlesOptions {
  /** Oldest particles are recycled beyond this count (default 2048). */
  maxParticles?: number;
}

interface Particle {
  position: Vector3;
  velocity: Vector3;
  rotation: Quaternion;
  size: number;
  age: number;
  lifetime: number;
  gravity: number;
  drag: number;
  groundFriction: number;
  collide: boolean;
  shrink: boolean;
  onGround: boolean;
}

/**
 * Pool of small colored cubes with simple physics and voxel collision,
 * drawn as a single InstancedMesh. What to emit, and when, is up to the game.
 */
export class VoxelParticles {
  public readonly mesh: InstancedMesh;
  private readonly maxParticles: number;
  private readonly particles: Particle[] = [];
  private readonly matrix = new Matrix4();
  private readonly scale = new Vector3();
  private readonly color = new Color();
  private readonly euler = new Euler();

  constructor(parent: Object3D, private readonly world: VoxelColliderWorld, options: VoxelParticlesOptions = {}) {
    this.maxParticles = options.maxParticles ?? 2048;
    this.mesh = new InstancedMesh(new BoxGeometry(1, 1, 1), new MeshLambertMaterial(), this.maxParticles);
    this.mesh.instanceMatrix.setUsage(DynamicDrawUsage);
    this.mesh.frustumCulled = false; // instâncias espalhadas: o bounding da geometria base não serve
    this.mesh.count = 0;
    parent.add(this.mesh);
  }

  public get count(): number {
    return this.particles.length;
  }

  public emit(options: ParticleOptions): void {
    if (this.particles.length >= this.maxParticles) {
      this.removeAt(0); // recicla a mais antiga
    }

    const index = this.particles.length;
    this.particles.push({
      position: new Vector3(options.position.x, options.position.y, options.position.z),
      velocity: options.velocity
        ? new Vector3(options.velocity.x, options.velocity.y, options.velocity.z)
        : new Vector3(),
      rotation: new Quaternion().setFromEuler(
        this.euler.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI)
      ),
      size: options.size ?? 0.15,
      age: 0,
      lifetime: options.lifetime ?? 20,
      gravity: options.gravity ?? 0.04,
      drag: options.drag ?? 0.98,
      groundFriction: options.groundFriction ?? 0.7,
      collide: options.collide ?? true,
      shrink: options.shrink ?? true,
      onGround: false
    });

    this.mesh.setColorAt(index, this.color.setHex(options.color));
    this.writeInstance(index);
    this.mesh.count = this.particles.length;
    this.markDirty();
  }

  public update(deltaMs: number): void {
    if (this.particles.length === 0) return;
    const dt = deltaMs / TICK_MS;

    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.age += dt;
      if (p.age >= p.lifetime) {
        this.removeAt(i);
        continue;
      }

      p.velocity.y -= p.gravity * dt;
      if (p.collide) {
        this.moveWithCollision(p, dt);
      } else {
        p.position.addScaledVector(p.velocity, dt);
      }
      p.velocity.multiplyScalar(Math.pow(p.drag, dt));
      if (p.onGround) {
        const friction = Math.pow(p.groundFriction, dt);
        p.velocity.x *= friction;
        p.velocity.z *= friction;
      }
      this.writeInstance(i);
    }

    this.mesh.count = this.particles.length;
    this.markDirty();
  }

  public clear(): void {
    this.particles.length = 0;
    this.mesh.count = 0;
  }

  public dispose(): void {
    this.clear();
    this.mesh.removeFromParent();
    this.mesh.geometry.dispose();
    (this.mesh.material as MeshLambertMaterial).dispose();
    this.mesh.dispose();
  }

  /** Swap-remove: moves the last particle (and its color) into the freed slot. */
  private removeAt(index: number): void {
    const last = this.particles.length - 1;
    if (index !== last) {
      this.particles[index] = this.particles[last];
      this.mesh.getColorAt(last, this.color);
      this.mesh.setColorAt(index, this.color);
      this.writeInstance(index);
    }
    this.particles.pop();
  }

  private moveWithCollision(p: Particle, dt: number): void {
    const half = p.size / 2;
    const pos = p.position;

    const nx = pos.x + p.velocity.x * dt;
    if (this.isSolid(nx, pos.y, pos.z)) p.velocity.x = 0;
    else pos.x = nx;

    const nz = pos.z + p.velocity.z * dt;
    if (this.isSolid(pos.x, pos.y, nz)) p.velocity.z = 0;
    else pos.z = nz;

    const ny = pos.y + p.velocity.y * dt;
    const probeY = p.velocity.y < 0 ? ny - half : ny + half;
    if (this.isSolid(pos.x, probeY, pos.z)) {
      if (p.velocity.y < 0) {
        p.onGround = true;
        pos.y = Math.floor(probeY) + 1 + half; // assenta rente ao topo do bloco
      }
      p.velocity.y = 0;
    } else {
      p.onGround = false;
      pos.y = ny;
    }
  }

  private isSolid(x: number, y: number, z: number): boolean {
    return this.world.isBlockSolid(Math.floor(x), Math.floor(y), Math.floor(z));
  }

  private writeInstance(index: number): void {
    const p = this.particles[index];
    const life = p.age / p.lifetime;
    const fade = p.shrink && life > 0.66 ? 1 - (life - 0.66) / 0.34 : 1;
    const s = p.size * Math.max(0.05, fade);
    this.scale.set(s, s, s);
    this.matrix.compose(p.position, p.rotation, this.scale);
    this.mesh.setMatrixAt(index, this.matrix);
  }

  private markDirty(): void {
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }
}
