import { PointerLockControls } from 'three/examples/jsm/Addons.js';
import { PerspectiveCamera, Vector3 } from 'three';
import ProceduralWorld from './Worlds/ProceduralWorld';
import UI from './UI';

export type PlayerMode = 'normal' | 'debug';

interface PlayerOptions {
  camera: PerspectiveCamera;
  ui: UI;
  world: ProceduralWorld;
  mode?: PlayerMode;
}

export default class Player {
  private readonly camera: PerspectiveCamera;
  private readonly controls: PointerLockControls;
  private readonly ui: UI;
  public readonly world: ProceduralWorld;
  private readonly keys: Record<string, boolean> = {};

  private readonly velocity = new Vector3();
  private readonly dimensions = { width: 0.5, height: 1.8, eyeHeight: 1.6 };
  private isGrounded = false;
  private canMove = true;
  private mode: PlayerMode;

  constructor({ camera, ui, world, mode = 'debug' }: PlayerOptions) {
    this.camera = camera;
    this.ui = ui;
    this.world = world;
    this.mode = mode;

    this.controls = new PointerLockControls(camera, document.body);
    this.initEvents();

    // Spawn: eyes at 41.6
    this.camera.position.set(2, 41.6, 2);
  }

  public setMode(mode: PlayerMode): void {
    this.mode = mode;
    this.velocity.set(0, 0, 0); // Reset velocity to avoid "sliding" into blocks
    if (mode === 'debug') {
      this.isGrounded = false;
    }
  }

  public teleport(x: number, y: number, z: number): void {
    this.camera.position.set(x, y, z);
    this.velocity.set(0, 0, 0);
  }

  private initEvents(): void {
    document.addEventListener('keydown', e => {
      if (document.activeElement?.tagName === 'INPUT') return;

      this.keys[e.key.toLowerCase()] = true;
      
      const k = e.key.toLowerCase();
      if (k === ';') { e.preventDefault(); this.ui.toggleChat(); }
      // Removed the 'v' key toggle to prefer commands
      
      // Jump
      if (k === ' ' && this.isGrounded && this.mode === 'normal') {
          this.velocity.y = 0.15;
          this.isGrounded = false;
      }
    });

    document.addEventListener('keyup', e => {
      this.keys[e.key.toLowerCase()] = false;
    });

    document.addEventListener('click', () => {
      const isChatInputFocused = document.activeElement?.classList.contains('chat-input');
      if (!isChatInputFocused && !this.controls.isLocked) {
        this.controls.lock();
      }
    });

    this.ui.onToggle = (isOpen) => {
      this.canMove = !isOpen;
      if (isOpen) {
        this.controls.unlock();
        Object.keys(this.keys).forEach(k => this.keys[k] = false);
      } else {
        this.controls.lock();
      }
    };
  }

  /**
   * Checks collision for an AABB centered at x/z of `pos`, 
   * with `pos.y` being the EYE level.
   */
  private isColliding(eyePos: Vector3): boolean {
    const w = this.dimensions.width / 2;
    const feetY = eyePos.y - this.dimensions.eyeHeight;
    const headY = feetY + this.dimensions.height;
    
    // We check several points: feet, eyes/head, and middle
    const points = [
      // Feet level
      { x: eyePos.x - w, y: feetY, z: eyePos.z - w },
      { x: eyePos.x + w, y: feetY, z: eyePos.z - w },
      { x: eyePos.x - w, y: feetY, z: eyePos.z + w },
      { x: eyePos.x + w, y: feetY, z: eyePos.z + w },
      
      // Top level
      { x: eyePos.x - w, y: headY, z: eyePos.z - w },
      { x: eyePos.x + w, y: headY, z: eyePos.z - w },
      { x: eyePos.x - w, y: headY, z: eyePos.z + w },
      { x: eyePos.x + w, y: headY, z: eyePos.z + w },
      
      // Mid level
      { x: eyePos.x - w, y: feetY + 0.9, z: eyePos.z - w },
      { x: eyePos.x + w, y: feetY + 0.9, z: eyePos.z - w },
      { x: eyePos.x - w, y: feetY + 0.9, z: eyePos.z + w },
      { x: eyePos.x + w, y: feetY + 0.9, z: eyePos.z + w },
    ];

    for (const p of points) {
      if (this.world.isBlockSolid(Math.floor(p.x), Math.floor(p.y), Math.floor(p.z))) {
        return true;
      }
    }
    return false;
  }

  private applyPhysics(): void {
    if (!this.canMove) return;

    // 1. Calculate Intent
    const moveSpeed = this.mode === 'debug' ? 0.6 : 0.12;
    const gravity = 0.008;

    const moveDir = new Vector3();
    if (this.keys['w']) moveDir.z += 1;
    if (this.keys['s']) moveDir.z -= 1;
    if (this.keys['a']) moveDir.x -= 1;
    if (this.keys['d']) moveDir.x += 1;
    moveDir.normalize();

    const forward = new Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion);
    const right = new Vector3(1, 0, 0).applyQuaternion(this.camera.quaternion);
    forward.y = 0; right.y = 0;
    forward.normalize(); right.normalize();

    const worldVelocity = forward.multiplyScalar(moveDir.z).add(right.multiplyScalar(moveDir.x)).multiplyScalar(moveSpeed);

    this.velocity.x = worldVelocity.x;
    this.velocity.z = worldVelocity.z;

    if (this.mode === 'debug') {
        this.velocity.y = 0;
        if (this.keys[' ']) this.camera.position.y += moveSpeed;
        if (this.keys['shift']) this.camera.position.y -= moveSpeed;
    } else {
        this.velocity.y -= gravity;
    }

    // 2. Resolve Collisions Axis-by-Axis
    const nextPos = this.camera.position.clone();

    // X
    nextPos.x += this.velocity.x;
    if (this.isColliding(nextPos)) {
        nextPos.x = this.camera.position.x;
        this.velocity.x = 0;
    }
    this.camera.position.x = nextPos.x;

    // Y
    nextPos.y += this.velocity.y;
    if (this.isColliding(nextPos)) {
        // Only set grounded if falling
        if (this.velocity.y < 0) {
            this.isGrounded = true;
        }
        nextPos.y = this.camera.position.y;
        this.velocity.y = 0;
    } else {
        this.isGrounded = false;
    }
    this.camera.position.y = nextPos.y;

    // Z
    nextPos.z += this.velocity.z;
    if (this.isColliding(nextPos)) {
        nextPos.z = this.camera.position.z;
        this.velocity.z = 0;
    }
    this.camera.position.z = nextPos.z;

    // 3. Fall Reset
    if (this.camera.position.y < -50) {
      this.camera.position.set(0, 41.6, 0);
      this.velocity.set(0,0,0);
    }
  }

  update(): void {
    this.applyPhysics();
  }
}
