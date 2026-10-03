import {
  Group,
  Mesh,
  CylinderGeometry,
  SphereGeometry,
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

export type BeamType = 'lightning' | 'laser' | 'orbital' | 'kamehameha';

export interface BeamOptions {
  origin: Vector3;
  target: Vector3;
  type?: BeamType;
  thickness?: number;      // Espessura do feixe (default: 0.35, kamehameha: 1.35)
  color?: number;          // Cor neon do feixe (default: 0x00e5ff para raio, 0xff0055 para laser)
  duration?: number;       // Duração do feixe em segundos (default: 0.45s, kamehameha: 1.5s)
  radius?: number;         // Raio da explosão no ponto de impacto (default: 4.5, kamehameha: 12.0)
}

export class Beam extends Group {
  public readonly origin = new Vector3();
  public readonly target = new Vector3();
  public readonly type: BeamType;
  public readonly duration: number;
  public isDisposed = false;
  public elapsedTime = 0;

  public get progress(): number {
    return Math.min(1.0, this.elapsedTime / this.duration);
  }

  private readonly coreMesh?: Mesh;
  private readonly glowMesh?: Mesh;
  private readonly outerGlowMesh?: Mesh;
  private readonly originSphere?: Mesh;
  private readonly headSphere?: Mesh;
  private readonly lightningLines?: LineSegments;
  private readonly impactRing?: Mesh;
  private readonly surgeRings: Mesh[] = [];

  constructor(options: BeamOptions) {
    super();
    this.origin.copy(options.origin);
    this.target.copy(options.target);
    this.type = options.type ?? 'lightning';
    this.duration = options.duration ?? (
      this.type === 'kamehameha' ? 1.5 : this.type === 'lightning' ? 0.35 : 0.45
    );

    const delta = new Vector3().subVectors(this.target, this.origin);
    const length = Math.max(0.5, delta.length());
    const midPoint = new Vector3().addVectors(this.origin, this.target).multiplyScalar(0.5);

    // Orientação do feixe cilíndrico ao longo do vetor delta
    const dir = delta.clone().normalize();
    const up = new Vector3(0, 1, 0);
    const orientation = new Quaternion();
    if (Math.abs(dir.y + 1) < 0.0001) {
      orientation.set(1, 0, 0, 0);
    } else {
      orientation.setFromUnitVectors(up, dir);
    }

    const baseColor = options.color ?? (
      this.type === 'kamehameha' ? 0x00d0ff :
      this.type === 'lightning' ? 0x66eeff :
      this.type === 'laser' ? 0xff2244 : 0xffdd44
    );

    if (this.type === 'kamehameha') {
      // ── KAMEHAMEHA: Feixe Colossal de Energia Ki Multi-camadas ───────────────
      const thickness = options.thickness ?? 1.4;

      // Cone de energia: nasce fino e super concentrado nas mãos do jogador e se abre em um canhão devastador no alvo
      const radiusBaseCore = thickness * 0.12;
      const radiusTargetCore = thickness * 1.6;

      const radiusBaseInner = thickness * 0.24;
      const radiusTargetInner = thickness * 3.0;

      const radiusBaseOuter = thickness * 0.42;
      const radiusTargetOuter = thickness * 4.8;

      // 1. Núcleo Branco Puro Superbrilhante (cone truncado)
      const coreGeo = new CylinderGeometry(radiusTargetCore, radiusBaseCore, length, 24);
      const coreMat = new MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        blending: AdditiveBlending,
        opacity: 0.98,
        depthWrite: false
      });
      this.coreMesh = new Mesh(coreGeo, coreMat);
      this.coreMesh.position.copy(midPoint);
      this.coreMesh.quaternion.copy(orientation);
      this.add(this.coreMesh);

      // 2. Manto Interno de Plasma Ki Ciano Elétrico
      const glowGeo = new CylinderGeometry(radiusTargetInner, radiusBaseInner, length, 24);
      const glowMat = new MeshBasicMaterial({
        color: 0x00f5ff,
        side: DoubleSide,
        transparent: true,
        blending: AdditiveBlending,
        opacity: 0.85,
        depthWrite: false
      });
      this.glowMesh = new Mesh(glowGeo, glowMat);
      this.glowMesh.position.copy(midPoint);
      this.glowMesh.quaternion.copy(orientation);
      this.add(this.glowMesh);

      // 3. Vórtice Externo de Ki Azul Safira Profundo
      const outerGlowGeo = new CylinderGeometry(radiusTargetOuter, radiusBaseOuter, length, 24);
      const outerGlowMat = new MeshBasicMaterial({
        color: 0x0055ff,
        side: DoubleSide,
        transparent: true,
        blending: AdditiveBlending,
        opacity: 0.65,
        depthWrite: false
      });
      this.outerGlowMesh = new Mesh(outerGlowGeo, outerGlowMat);
      this.outerGlowMesh.position.copy(midPoint);
      this.outerGlowMesh.quaternion.copy(orientation);
      this.add(this.outerGlowMesh);

      // 4. Esfera de Ki na Origem (mãos do jogador - compacta para não tampar a visão)
      const originSphereGeo = new SphereGeometry(thickness * 0.25, 16, 16);
      const originSphereMat = new MeshBasicMaterial({
        color: 0x80ffff,
        side: DoubleSide,
        transparent: true,
        blending: AdditiveBlending,
        opacity: 0.95,
        depthWrite: false
      });
      this.originSphere = new Mesh(originSphereGeo, originSphereMat);
      this.originSphere.position.copy(this.origin);
      this.add(this.originSphere);

      // 5. Cabeça de Impacto de Ki na Ponta do Feixe
      const headSphereGeo = new SphereGeometry(thickness * 2.8, 16, 16);
      const headSphereMat = new MeshBasicMaterial({
        color: 0x00e5ff,
        side: DoubleSide,
        transparent: true,
        blending: AdditiveBlending,
        opacity: 0.9,
        depthWrite: false
      });
      this.headSphere = new Mesh(headSphereGeo, headSphereMat);
      this.headSphere.position.copy(this.target);
      this.add(this.headSphere);

      // 6. Arcos Elétricos de Ki ao redor do Feixe
      const segmentsCount = Math.min(160, Math.max(20, Math.floor(length * 1.5)));
      const positions = new Float32Array(segmentsCount * 2 * 3);
      this.generateLightningPath(positions, segmentsCount, this.origin, this.target);

      const lineGeo = new BufferGeometry();
      lineGeo.setAttribute('position', new BufferAttribute(positions, 3));
      const lineMat = new LineBasicMaterial({
        color: 0x66ffff,
        blending: AdditiveBlending,
        transparent: true,
        opacity: 0.9,
        linewidth: 2,
        depthWrite: false
      });
      this.lightningLines = new LineSegments(lineGeo, lineMat);
      this.add(this.lightningLines);

      // 7. Anel de Choque de Impacto (perpendicular ao vetor do feixe)
      const ringGeo = new RingGeometry(0.5, 6.0, 32);
      const ringMat = new MeshBasicMaterial({
        color: 0x00f0ff,
        side: DoubleSide,
        transparent: true,
        blending: AdditiveBlending,
        opacity: 0.95,
        depthWrite: false
      });
      this.impactRing = new Mesh(ringGeo, ringMat);
      this.impactRing.position.copy(this.target);
      this.impactRing.quaternion.copy(orientation);
      this.impactRing.rotateX(Math.PI * 0.5);
      this.add(this.impactRing);

      // 8. Anéis de Onda de Choque que viajam velozmente pelo feixe (surges de plasma)
      const surgeCount = 6;
      for (let i = 0; i < surgeCount; i++) {
        const surgeGeo = new RingGeometry(thickness * 0.35, thickness * 0.9, 24);
        const surgeMat = new MeshBasicMaterial({
          color: 0x80ffff,
          side: DoubleSide,
          transparent: true,
          blending: AdditiveBlending,
          opacity: 0.85,
          depthWrite: false
        });
        const ring = new Mesh(surgeGeo, surgeMat);
        ring.quaternion.copy(orientation);
        ring.rotateX(Math.PI * 0.5);
        this.surgeRings.push(ring);
        this.add(ring);
      }
    } else if (this.type === 'lightning') {
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

      // Anel no impacto
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

      // Anel no impacto
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
      const jitterFactor = Math.sin(t * Math.PI) * (this.type === 'kamehameha' ? 2.5 : 1.8);
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

    if (this.type === 'kamehameha') {
      const pulse = 1.0 + 0.12 * Math.sin(this.elapsedTime * 45);
      if (this.coreMesh) {
        this.coreMesh.scale.set(pulse, 1.0, pulse);
        (this.coreMesh.material as MeshBasicMaterial).opacity = opacity * 0.98;
      }
      if (this.glowMesh) {
        this.glowMesh.rotateY(dtSeconds * 8);
        this.glowMesh.scale.set(pulse, 1.0, pulse);
        (this.glowMesh.material as MeshBasicMaterial).opacity = opacity * 0.85;
      }
      if (this.outerGlowMesh) {
        this.outerGlowMesh.rotateY(-dtSeconds * 5);
        this.outerGlowMesh.scale.set(pulse * 1.05, 1.0, pulse * 1.05);
        (this.outerGlowMesh.material as MeshBasicMaterial).opacity = opacity * 0.65;
      }
      if (this.originSphere) {
        const s = pulse * (1.0 + progress * 0.6);
        this.originSphere.scale.set(s, s, s);
        (this.originSphere.material as MeshBasicMaterial).opacity = opacity * 0.95;
      }
      if (this.headSphere) {
        const s = 1.0 + progress * 2.2;
        this.headSphere.scale.set(s, s, s);
        (this.headSphere.material as MeshBasicMaterial).opacity = opacity * 0.9;
      }
      if (this.impactRing) {
        const s = 1.0 + progress * 4.0;
        this.impactRing.scale.set(s, s, 1.0);
        (this.impactRing.material as MeshBasicMaterial).opacity = opacity;
      }
      if (this.lightningLines) {
        (this.lightningLines.material as LineBasicMaterial).opacity = opacity * 0.9;
      }
      for (let i = 0; i < this.surgeRings.length; i++) {
        const ring = this.surgeRings[i];
        const phase = (this.elapsedTime * 2.8 + i / this.surgeRings.length) % 1.0;
        ring.position.lerpVectors(this.origin, this.target, phase);
        const currentScale = 1.0 + phase * 2.4;
        ring.scale.set(currentScale, currentScale, 1.0);
        (ring.material as MeshBasicMaterial).opacity = opacity * 0.9 * (1.0 - phase * 0.35);
      }
      return;
    }

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
    if (this.outerGlowMesh) {
      this.outerGlowMesh.geometry.dispose();
      (this.outerGlowMesh.material as MeshBasicMaterial).dispose();
    }
    if (this.originSphere) {
      this.originSphere.geometry.dispose();
      (this.originSphere.material as MeshBasicMaterial).dispose();
    }
    if (this.headSphere) {
      this.headSphere.geometry.dispose();
      (this.headSphere.material as MeshBasicMaterial).dispose();
    }
    if (this.lightningLines) {
      this.lightningLines.geometry.dispose();
      (this.lightningLines.material as LineBasicMaterial).dispose();
    }
    if (this.impactRing) {
      this.impactRing.geometry.dispose();
      (this.impactRing.material as MeshBasicMaterial).dispose();
    }
    for (const ring of this.surgeRings) {
      ring.geometry.dispose();
      (ring.material as MeshBasicMaterial).dispose();
    }
  }
}
