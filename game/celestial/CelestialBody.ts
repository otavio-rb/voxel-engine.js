import { Group, Vector3 } from 'three';

export abstract class CelestialBody extends Group {
  public velocity: Vector3 = new Vector3();
  public mass: number;
  public radius: number;
  public isDisposed: boolean = false;

  constructor(mass: number, radius: number) {
    super();
    this.mass = Math.max(0.1, mass);
    this.radius = Math.max(0.5, radius);
  }

  /**
   * Calcula a aceleração gravitacional newtoniana com softening mínimo
   */
  public getGravitationalAcceleration(
    otherPos: Vector3,
    otherMass: number,
    G: number = 32.0,
    softening: number = 1.0
  ): Vector3 {
    const toOther = new Vector3().subVectors(otherPos, this.position);
    const distSq = toOther.lengthSq();
    const dist = Math.sqrt(distSq);
    if (!Number.isFinite(dist) || dist <= 0.001) return new Vector3();

    const force = (G * otherMass) / (distSq + softening * softening);
    return toOther.divideScalar(dist).multiplyScalar(force);
  }

  /**
   * Aplica atração gravitacional newtoniana mútua
   */
  public applyGravitationalPull(
    otherPos: Vector3,
    otherMass: number,
    dtSeconds: number,
    G: number = 32.0,
    softening: number = 1.0
  ): void {
    const accel = this.getGravitationalAcceleration(otherPos, otherMass, G, softening);
    this.velocity.addScaledVector(accel, dtSeconds);
  }

  public abstract update(delta: number): void;
  public abstract dispose(): void;
}
