import { Vector3, Mesh, BoxGeometry, MeshStandardMaterial, Scene } from 'three';
import ProceduralWorld from '../Worlds/ProceduralWorld';
import { KinematicBody } from '../../core/physics/AABBPhysics';

export interface EntityDimensions {
  width: number;
  height: number;
  depth?: number;
}

export abstract class Entity {
  public readonly body: KinematicBody;
  public mesh: Mesh;
  protected readonly world: ProceduralWorld;

  constructor(world: ProceduralWorld, dimensions: EntityDimensions, color: number = 0xffffff) {
    this.world = world;
    this.body = new KinematicBody({ dimensions });

    const geo = new BoxGeometry(dimensions.width, dimensions.height, dimensions.depth ?? dimensions.width);
    const mat = new MeshStandardMaterial({ color });
    this.mesh = new Mesh(geo, mat);
    this.mesh.castShadow = true;
    this.mesh.receiveShadow = true;
  }

  public get position(): Vector3 {
    return this.body.position;
  }

  public get velocity(): Vector3 {
    return this.body.velocity;
  }

  public get isGrounded(): boolean {
    return this.body.isGrounded;
  }

  public set isGrounded(value: boolean) {
    this.body.isGrounded = value;
  }

  public get dimensions(): EntityDimensions {
    return this.body.dimensions;
  }

  public get gravity(): number {
    return this.body.gravity;
  }

  public set gravity(value: number) {
    this.body.gravity = value;
  }

  public get friction(): number {
    return this.body.friction;
  }

  public set friction(value: number) {
    this.body.friction = value;
  }

  public abstract update(deltaTime: number): void;

  protected applyPhysics(dtScale: number = 1.0): void {
    this.body.stepPhysics(this.world, dtScale, true, (axis) => this.onCollision(axis));

    this.mesh.position.set(
      this.body.position.x,
      this.body.position.y + this.body.dimensions.height / 2,
      this.body.position.z
    );
  }

  protected checkCollision(pos: Vector3): boolean {
    return this.body.checkCollisionAt(pos, this.world);
  }

  protected onCollision(_axis: 'x' | 'y' | 'z'): void {
    // Callback para subclasses tratarem colisões
  }

  public addToScene(scene: Scene): void {
    scene.add(this.mesh);
  }

  public removeFromScene(scene: Scene): void {
    scene.remove(this.mesh);
  }

  public dispose(): void {
    this.mesh.geometry.dispose();
    (this.mesh.material as MeshStandardMaterial).dispose();
  }
}
