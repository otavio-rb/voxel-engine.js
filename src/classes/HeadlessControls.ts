import { Euler, Camera } from 'three';

/**
 * A headless replacement for PointerLockControls that works in a Web Worker.
 * It receives movementX and movementY explicitly instead of relying on DOM events.
 */
export default class HeadlessControls {
  public isLocked = false;
  
  private pointerSpeed = 1.0;
  private minPolarAngle = 0; 
  private maxPolarAngle = Math.PI; 

  private euler = new Euler(0, 0, 0, 'YXZ');

  constructor(private readonly camera: Camera) {}

  public lock(): void {
    this.isLocked = true;
  }

  public unlock(): void {
    this.isLocked = false;
  }

  public onMouseMove(movementX: number, movementY: number): void {
      if (!this.isLocked) return;

      this.euler.setFromQuaternion(this.camera.quaternion);

      this.euler.y -= movementX * 0.002 * this.pointerSpeed;
      this.euler.x -= movementY * 0.002 * this.pointerSpeed;

      this.euler.x = Math.max(Math.PI / 2 - this.maxPolarAngle, Math.min(Math.PI / 2 - this.minPolarAngle, this.euler.x));

      this.camera.quaternion.setFromEuler(this.euler);
  }
}
