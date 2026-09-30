import {
  Group,
  Mesh,
  CylinderGeometry,
  RingGeometry,
  MeshBasicMaterial,
  Vector3,
  Quaternion,
  DoubleSide,
  AdditiveBlending,
  LineSegments,
  BufferGeometry,
  BufferAttribute,
  LineBasicMaterial
} from 'three';

export type BeamType = 'lightning' | 'laser' | 'orbital';

export interface BeamOptions {
  origin: Vector3;
  target: Vector3;
  type?: BeamType;
  thickness?: number;      // Espessura do feixe (default: 0.35)
  color?: number;          // Cor neon do feixe (default: 0x00e5ff para raio, 0xff0055 para laser)
  duration?: number;       // Duração do feixe em segundos (default: 0.45s)
  radius?: number;         // Raio da explosão no ponto de impacto (default: 4.5)
}

export class Beam extends Group {
  public readonly origin = new Vector3();
  public readonly target = new Vector3();
  public readonly type: BeamType;
  public readonly duration: number;
  public isDisposed = false;

  private elapsedTime = 0;
  private readonly coreMesh?: Mesh;
  private readonly glowMesh?: Mesh;
  private readonly lightningLines?: LineSegments;
  private readonly impactRing?: Mesh;

  constructor(options: BeamOptions) {
    super();
    this.origin.copy(options.origin);
    this.target.copy(options.target);
    this.type = options.type ?? 'lightning';
    this.duration = options.duration ?? (this.type === 'lightning' ? 0.35 : 0.45);

    const delta = new Vector3().subVectors(this.target, this.origin);
    const length = delta.length();
    const midPoint = new Vector3().addVectors(this.origin, this.target).multiplyScalar(0.5);

    // Orientação do feixe cilíndrico ao longo do vetor delta
    const dir = delta.clone().normalize();
    const up = new Vector3(0, 1, 0);
    const orientation = new Quaternion().setFromUnitVectors(up, dir);

    const baseColor = options.color ?? (
      this.type === 'lightning' ? 0x66eeff : this.type === 'laser' ? 0xff2244 : 0xffdd44
    );

    if (this.type === 'lightning') {
      // ── Relâmpago Ziguezagueante com Arcos Elétricos e Núcleo Luminoso ─────
      // 1. Núcleo cilíndrico fino semi-transparente
      const coreGeo = new CylinderGeometry(0.12, 0.12, length, 8);
      const coreMat = new MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        blending: AdditiveBlending,
        opacity: 0.95
      });
      this.coreMesh = new Mesh(coreGeo, coreMat);
      this.coreMesh.position.copy(midPoint);
      this.coreMesh.quaternion.copy(orientation);
      this.add(this.coreMesh);

      // 2. Trajetória fractal de faíscas e arcos (LineSegments com jitter)
      const segmentsCount = Math.max(12, Math.floor(length * 2.2));
      const positions = new Float32Array(segmentsCount * 2 * 3);

      this.generateLightningPath(positions, segmentsCount, this.origin, this.target);

      const lineGeo = new BufferGeometry();
      lineGeo.setAttribute('position', new BufferAttribute(positions, 3));
      const lineMat = new LineBasicMaterial({
        color: baseColor,
        blending: AdditiveBlending,
        transparent: true,
        opacity: 0.95,
        linewidth: 2
      });
      this.lightningLines = new LineSegments(lineGeo, lineMat);
      this.add(this.lightningLines);
    } else if (this.type === 'laser' || this.type === 'orbital') {
      // ── Feixe Cilíndrico Concentrico de Alta Potência ──────────────────────
      const radiusScale = this.type === 'orbital' ? 2.5 : 1.0;
      const thickness = (options.thickness ?? 0.35) * radiusScale;

      // Núcleo branco incandescente
      const coreGeo = new CylinderGeometry(thickness * 0.45, thickness * 0.45, length, 16);
      const coreMat = new MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        blending: AdditiveBlending,
        opacity: 0.95
      });
      this.coreMesh = new Mesh(coreGeo, coreMat);
      this.coreMesh.position.copy(midPoint);
      this.coreMesh.quaternion.copy(orientation);
      this.add(this.coreMesh);

      // Halo externo de plasma neon
      const glowGeo = new CylinderGeometry(thickness, thickness, length, 16);
      const glowMat = new MeshBasicMaterial({
        color: baseColor,
        side: DoubleSide,
        transparent: true,
        blending: AdditiveBlending,
        opacity: 0.75
      });
      this.glowMesh = new Mesh(glowGeo, glowMat);
      this.glowMesh.position.copy(midPoint);
      this.glowMesh.quaternion.copy(orientation);
      this.add(this.glowMesh);
    }

    // ── Anel Luminoso no Ponto de Impacto ─────────────────────────────────────
    const ringGeo = new RingGeometry(0.3, 2.2, 32);
    const ringMat = new MeshBasicMaterial({
      color: baseColor,
      side: DoubleSide,
      transparent: true,
      blending: AdditiveBlending,
      opacity: 0.9
    });
    this.impactRing = new Mesh(ringGeo, ringMat);
    this.impactRing.position.copy(this.target);
    this.impactRing.rotation.x = Math.PI * 0.5;
    this.add(this.impactRing);
  }

  private generateLightningPath(
    positions: Float32Array,
    count: number,
    start: Vector3,
    end: Vector3
  ): void {
    let lastPoint = start.clone();

    for (let i = 0; i < count; i++) {
      const t = (i + 1) / count;
      const basePoint = new Vector3().lerpVectors(start, end, t);

      // Deslocamento transversal aleatório fractal
      const jitterFactor = Math.sin(t * Math.PI) * 1.8;
      const nextPoint = basePoint.clone().add(
        new Vector3(
          (Math.random() - 0.5) * jitterFactor,
          (Math.random() - 0.5) * jitterFactor,
          (Math.random() - 0.5) * jitterFactor
        )
      );

      if (i === count - 1) {
        nextPoint.copy(end);
      }

      const idx = i * 6;
      positions[idx]     = lastPoint.x;
      positions[idx + 1] = lastPoint.y;
      positions[idx + 2] = lastPoint.z;

      positions[idx + 3] = nextPoint.x;
      positions[idx + 4] = nextPoint.y;
      positions[idx + 5] = nextPoint.z;

      lastPoint = nextPoint;
    }
  }

  public update(dtSeconds: number): void {
    if (this.isDisposed) return;

    this.elapsedTime += dtSeconds;
    const progress = Math.min(1.0, this.elapsedTime / this.duration);

    if (progress >= 1.0) {
      this.dispose();
      return;
    }

    // Fade out suave
    const opacity = Math.max(0, 1.0 - progress);

    if (this.coreMesh) {
      (this.coreMesh.material as MeshBasicMaterial).opacity = opacity * 0.95;
    }
    if (this.glowMesh) {
      (this.glowMesh.material as MeshBasicMaterial).opacity = opacity * 0.75;
    }
    if (this.lightningLines) {
      (this.lightningLines.material as LineBasicMaterial).opacity = opacity * 0.95;
    }
    if (this.impactRing) {
      const ringScale = 1.0 + progress * 2.5;
      this.impactRing.scale.set(ringScale, ringScale, 1.0);
      (this.impactRing.material as MeshBasicMaterial).opacity = opacity;
    }
  }

  public dispose(): void {
    if (this.isDisposed) return;
    this.isDisposed = true;

    if (this.parent) {
      this.parent.remove(this);
    }

    if (this.coreMesh) {
      this.coreMesh.geometry.dispose();
      (this.coreMesh.material as MeshBasicMaterial).dispose();
    }
    if (this.glowMesh) {
      this.glowMesh.geometry.dispose();
      (this.glowMesh.material as MeshBasicMaterial).dispose();
    }
    if (this.lightningLines) {
      this.lightningLines.geometry.dispose();
      (this.lightningLines.material as LineBasicMaterial).dispose();
    }
    if (this.impactRing) {
      this.impactRing.geometry.dispose();
      (this.impactRing.material as MeshBasicMaterial).dispose();
    }
  }
}
