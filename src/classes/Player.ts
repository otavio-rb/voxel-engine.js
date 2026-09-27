import HeadlessControls from './HeadlessControls';
import { PerspectiveCamera, Vector3 } from 'three';
import ProceduralWorld from './Worlds/ProceduralWorld';
import { KinematicBody } from '../core/physics/AABBPhysics';

export type PlayerMode = 'normal' | 'debug';

interface PlayerOptions {
  camera: PerspectiveCamera;
  world: ProceduralWorld;
  mode?: PlayerMode;
}

export default class Player {
  public readonly camera: PerspectiveCamera;
  public readonly controls: HeadlessControls;
  public readonly world: ProceduralWorld;
  public readonly body: KinematicBody;

  private readonly keys: Record<string, boolean> = {};
  private readonly dimensions = { width: 0.5, height: 1.8, eyeHeight: 1.6 };
  private canMove = true;
  private mode: PlayerMode;

  constructor({ camera, world, mode = 'debug' }: PlayerOptions) {
    this.camera = camera;
    this.world = world;
    this.mode = mode;

    this.controls = new HeadlessControls(camera);

    this.body = new KinematicBody({
      dimensions: { width: this.dimensions.width, height: this.dimensions.height },
      eyeHeight: this.dimensions.eyeHeight,
      gravity: 0.008,
      friction: 0.9
    });

    // Posição inicial: olhos em 41.6
    this.camera.position.set(2, 41.6, 2);
    this.body.position.copy(this.camera.position);
  }

  public get velocity(): Vector3 {
    return this.body.velocity;
  }

  public get isGrounded(): boolean {
    return this.body.isGrounded;
  }

  public setMode(mode: PlayerMode): void {
    this.mode = mode;
    this.body.velocity.set(0, 0, 0);
    if (mode === 'debug') {
      this.body.isGrounded = false;
      this.world.setDebugMode(true);
    } else {
      this.world.setDebugMode(false);
    }
  }

  public teleport(x: number, y: number, z: number): void {
    this.camera.position.set(x, y, z);
    this.body.position.copy(this.camera.position);
    this.body.velocity.set(0, 0, 0);
  }

  public setGravity(value: number): void {
    this.body.gravity = value;
  }

  public onKeyDown(key: string): void {
    this.keys[key.toLowerCase()] = true;

    // Pulo
    if (key === ' ' && this.body.isGrounded && this.mode === 'normal') {
      this.body.velocity.y = 0.16;
      this.body.isGrounded = false;
    }
  }

  public onKeyUp(key: string): void {
    this.keys[key.toLowerCase()] = false;
  }

  public onMouseMove(movementX: number, movementY: number): void {
    this.controls.onMouseMove(movementX, movementY);
  }

  public setLock(locked: boolean): void {
    this.canMove = locked;
    if (locked) {
      this.controls.lock();
    } else {
      this.controls.unlock();
      Object.keys(this.keys).forEach((k) => (this.keys[k] = false));
    }
  }

  private applyPhysics(dtScale: number = 1.0): void {
    if (!this.canMove) return;

    // 1. Calcula vetor de intenção
    const baseSpeed = this.mode === 'debug' ? 0.6 : 0.12;
    const moveSpeed = baseSpeed * dtScale;

    const moveDir = new Vector3();
    if (this.keys['w']) moveDir.z += 1;
    if (this.keys['s']) moveDir.z -= 1;
    if (this.keys['a']) moveDir.x -= 1;
    if (this.keys['d']) moveDir.x += 1;
    moveDir.normalize();

    const forward = new Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion);
    const right = new Vector3(1, 0, 0).applyQuaternion(this.camera.quaternion);
    forward.y = 0;
    right.y = 0;
    forward.normalize();
    right.normalize();

    const worldVelocity = forward
      .multiplyScalar(moveDir.z)
      .add(right.multiplyScalar(moveDir.x))
      .multiplyScalar(moveSpeed);

    this.body.velocity.x = worldVelocity.x;
    this.body.velocity.z = worldVelocity.z;

    const footBlock = this.world.getBlock(
      Math.floor(this.camera.position.x),
      Math.floor(this.camera.position.y - this.dimensions.eyeHeight + 0.1),
      Math.floor(this.camera.position.z)
    );
    const eyeBlock = this.world.getBlock(
      Math.floor(this.camera.position.x),
      Math.floor(this.camera.position.y),
      Math.floor(this.camera.position.z)
    );
    const inWater = footBlock === 6 || eyeBlock === 6;

    // Efeito visual subaquático
    this.world.setUnderwater(eyeBlock === 6);

    if (this.mode === 'debug') {
      this.body.velocity.y = 0;
      if (this.keys[' ']) this.camera.position.y += moveSpeed;
      if (this.keys['shift'] || this.keys['control']) this.camera.position.y -= moveSpeed;
      this.camera.position.x += this.body.velocity.x;
      this.camera.position.z += this.body.velocity.z;
      this.body.position.copy(this.camera.position);
    } else {
      // Dinâmica de água ou gravidade padrão
      if (inWater) {
        this.body.velocity.y -= this.body.gravity * 0.2 * dtScale;
        this.body.velocity.y = Math.max(this.body.velocity.y, -0.05);

        if (this.keys[' ']) {
          this.body.velocity.y = eyeBlock !== 6 ? 0.15 : 0.06;
        }
      }

      // Sincroniza posição do corpo com a câmera antes da resolução física
      this.body.position.copy(this.camera.position);

      // Executa passo de física unificada AABB
      this.body.stepPhysics(this.world, dtScale, !inWater);

      // Sincroniza a câmera com a nova posição dos olhos resolvida
      this.camera.position.copy(this.body.position);
    }

    // Reset de queda abismal
    if (this.camera.position.y < -500) {
      this.teleport(0, 41.6, 0);
    }
  }

  public update(dtScale: number = 1.0): void {
    this.applyPhysics(dtScale);
  }
}
