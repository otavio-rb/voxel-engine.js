import { Euler, Camera } from 'three';

/**
 * A headless replacement for PointerLockControls that works in a Web Worker.
 * It receives movementX and movementY explicitly instead of relying on DOM events.
 * 
 * Manages yaw (horizontal look) and pitch (vertical look) explicitly in 'YXZ' order,
 * clamping pitch safely and keeping roll (Z axis) strictly at 0 to eliminate unwanted
 * camera tilting/rotations.
 */
export default class HeadlessControls {
  public isLocked = false;
  
  private pointerSpeed = 1.0;
  private pitch = 0; // Rotation around X (radians)
  private yaw = 0;   // Rotation around Y (radians)

  private readonly euler = new Euler(0, 0, 0, 'YXZ');

  constructor(private readonly camera: Camera) {
    this.camera.rotation.order = 'YXZ';
    this.syncFromCamera();
  }

  public syncFromCamera(): void {
    this.euler.setFromQuaternion(this.camera.quaternion, 'YXZ');
    this.pitch = this.euler.x;
    this.yaw = this.euler.y;
    this.euler.z = 0;
    this.camera.quaternion.setFromEuler(this.euler);
  }

  public lock(): void {
    this.isLocked = true;
  }

  public unlock(): void {
    this.isLocked = false;
  }

  /** Horizontal look angle in radians (0 faces -Z). */
  public getYaw(): number {
    return this.yaw;
  }

  public getPitch(): number {
    return this.pitch;
  }

  public setPointerSpeed(speed: number): void {
    this.pointerSpeed = speed;
  }

  public setOrientation(yaw: number, pitch: number): void {
    this.yaw = yaw;
    const maxPitch = Math.PI / 2 - 0.01;
    this.pitch = Math.max(-maxPitch, Math.min(maxPitch, pitch));
    this.euler.set(this.pitch, this.yaw, 0, 'YXZ');
    this.camera.quaternion.setFromEuler(this.euler);
  }

  public onMouseMove(movementX: number, movementY: number): void {
    if (!this.isLocked) return;

    this.yaw -= movementX * 0.002 * this.pointerSpeed;
    this.pitch -= movementY * 0.002 * this.pointerSpeed;

    // Clampa o pitch para não virar de cabeça para baixo nem travar no pólo (~89.4°)
    const maxPitch = Math.PI / 2 - 0.01;
    this.pitch = Math.max(-maxPitch, Math.min(maxPitch, this.pitch));

    // Garante roll estritamente ZERO
    this.euler.set(this.pitch, this.yaw, 0, 'YXZ');
    this.camera.quaternion.setFromEuler(this.euler);
  }
}
