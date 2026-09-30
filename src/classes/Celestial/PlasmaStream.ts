import {
  Group,
  Mesh,
  TubeGeometry,
  CubicBezierCurve3,
  ShaderMaterial,
  Points,
  BufferGeometry,
  BufferAttribute,
  PointsMaterial,
  Vector3,
  Color,
  AdditiveBlending,
  DoubleSide
} from 'three';
import { Star } from './Star';
import { BlackHole } from '../Effects/BlackHole';

export class PlasmaStream extends Group {
  public readonly star: Star;
  public readonly blackHole: BlackHole;
  public isDisposed = false;

  private elapsedTime = 0;
  private tubeMesh: Mesh;
  private tubeMaterial: ShaderMaterial;
  private tubeGeometry?: TubeGeometry;

  // Enxame de partículas de plasma aceleradas ao longo do feixe
  private particles: Points;
  private particleCount = 140;
  private particleProgress: Float32Array;
  private particleSpeeds: Float32Array;
  private particlePositions: Float32Array;

  // Pontos de controle da curva de Bezier relativística
  private p0 = new Vector3();
  private p1 = new Vector3();
  private p2 = new Vector3();
  private p3 = new Vector3();
  private curve: CubicBezierCurve3;

  constructor(star: Star, blackHole: BlackHole) {
    super();
    this.star = star;
    this.blackHole = blackHole;

    this.calculateCurvePoints();
    this.curve = new CubicBezierCurve3(this.p0, this.p1, this.p2, this.p3);

    // ── 1. Shader do Tubo de Plasma Superaquecido ────────────────────────────
    const starColor = this.getStarPrimaryColor();

    this.tubeMaterial = new ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uStarColor: { value: starColor },
        uCoreColor: { value: new Color(0xffffff) },
        uHotColor: { value: new Color(0xff9900) }
      },
      vertexShader: `
        varying vec2 vUv;
        varying vec3 vNormal;
        void main() {
          vUv = uv;
          vNormal = normalize(normalMatrix * normal);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform float uTime;
        uniform vec3 uStarColor;
        uniform vec3 uCoreColor;
        uniform vec3 uHotColor;
        varying vec2 vUv;
        varying vec3 vNormal;

        void main() {
          // Deslocamento contínuo do plasma em direção ao buraco negro
          float flow = fract(vUv.x * 6.0 - uTime * 4.5);
          float pulse = 0.8 + 0.2 * sin(vUv.x * 20.0 - uTime * 12.0);

          // Conforme se aproxima do buraco negro (vUv.x -> 1.0), o plasma superaquece
          vec3 col = mix(uStarColor, uHotColor, vUv.x);
          col = mix(col, uCoreColor, smoothstep(0.7, 1.0, vUv.x));

          // Efeito de pulso e brilho central
          col *= (1.4 + 0.6 * flow) * pulse;

          float alpha = clamp(0.75 + 0.25 * sin(vUv.x * 3.14159), 0.0, 1.0);
          gl_FragColor = vec4(col * 2.2, alpha * 0.92);
        }
      `,
      transparent: true,
      blending: AdditiveBlending,
      side: DoubleSide,
      depthWrite: false
    });

    this.tubeGeometry = new TubeGeometry(this.curve, 36, Math.max(0.4, star.radius * 0.35), 12, false);
    this.tubeMesh = new Mesh(this.tubeGeometry, this.tubeMaterial);
    this.add(this.tubeMesh);

    // ── 2. Partículas de Plasma Fluindo em Aceleração Relativística ─────────
    this.particleProgress = new Float32Array(this.particleCount);
    this.particleSpeeds = new Float32Array(this.particleCount);
    this.particlePositions = new Float32Array(this.particleCount * 3);

    for (let i = 0; i < this.particleCount; i++) {
      this.particleProgress[i] = Math.random();
      this.particleSpeeds[i] = 0.4 + Math.random() * 0.5;
    }

    const partGeo = new BufferGeometry();
    partGeo.setAttribute('position', new BufferAttribute(this.particlePositions, 3));
    const partMat = new PointsMaterial({
      color: 0xffffff,
      size: 0.65,
      transparent: true,
      blending: AdditiveBlending,
      opacity: 0.95
    });
    this.particles = new Points(partGeo, partMat);
    this.add(this.particles);
  }

  private getStarPrimaryColor(): Color {
    switch (this.star.starType) {
      case 'blue': return new Color(0x55ccff);
      case 'red': return new Color(0xff3300);
      case 'neutron': return new Color(0x99ffff);
      case 'sol':
      default: return new Color(0xffaa00);
    }
  }

  private calculateCurvePoints(): void {
    const toHole = new Vector3().subVectors(this.blackHole.position, this.star.position);
    const dist = toHole.length();
    const dir = dist > 0.001 ? toHole.clone().divideScalar(dist) : new Vector3(1, 0, 0);

    // P0: Ponta da lágrima da estrela mais próxima do buraco negro
    this.p0.copy(this.star.position).addScaledVector(dir, this.star.radius * 1.5);

    // Vetor tangente para criar espiral de acreção orbital ao redor do buraco negro
    const diskNormal = new Vector3(0, 1, 0);
    let tangent = new Vector3().crossVectors(dir, diskNormal).normalize();
    if (tangent.lengthSq() < 0.001) tangent.set(0, 0, 1);

    // P1: Ponto intermediário de curvatura gravitacional
    this.p1.copy(this.p0).addScaledVector(dir, dist * 0.35).addScaledVector(tangent, dist * 0.22);

    // P2: Ponto de entrada no disco de acreção (espiral tangencial)
    const diskEntranceRadius = this.blackHole.coreRadius * 2.8;
    this.p2.copy(this.blackHole.position).addScaledVector(tangent, diskEntranceRadius).addScaledVector(dir, -diskEntranceRadius * 0.5);

    // P3: Mergulho final no horizonte de eventos
    this.p3.copy(this.blackHole.position);
  }

  public update(dtSeconds: number): void {
    if (this.isDisposed) return;

    this.elapsedTime += dtSeconds;
    this.tubeMaterial.uniforms.uTime.value = this.elapsedTime;

    // Recalcula a trajetória curvada conforme os corpos se movem no espaço
    this.calculateCurvePoints();
    this.curve.v0.copy(this.p0);
    this.curve.v1.copy(this.p1);
    this.curve.v2.copy(this.p2);
    this.curve.v3.copy(this.p3);

    // Reconstrói a geometria do tubo suavemente
    if (this.tubeGeometry) {
      this.tubeGeometry.dispose();
    }
    const currentThickness = Math.max(0.25, this.star.radius * 0.32);
    this.tubeGeometry = new TubeGeometry(this.curve, 32, currentThickness, 10, false);
    this.tubeMesh.geometry = this.tubeGeometry;

    // ── Atualiza Partículas de Plasma Fluindo pelo Riacho ───────────────────
    const posAttr = this.particles.geometry.getAttribute('position') as BufferAttribute;
    const posArr = posAttr.array as Float32Array;

    for (let i = 0; i < this.particleCount; i++) {
      // Conforme a partícula se aproxima do buraco negro (progress -> 1.0), ela acelera
      const accel = 1.0 + this.particleProgress[i] * 2.5;
      this.particleProgress[i] += dtSeconds * this.particleSpeeds[i] * accel;

      if (this.particleProgress[i] >= 1.0) {
        this.particleProgress[i] = 0;
      }

      const p = this.curve.getPointAt(this.particleProgress[i]);

      // Leve dispersão turbulenta ao redor do tubo central
      const jitter = (1.0 - this.particleProgress[i]) * 0.6;
      posArr[i * 3]     = p.x + (Math.random() - 0.5) * jitter;
      posArr[i * 3 + 1] = p.y + (Math.random() - 0.5) * jitter;
      posArr[i * 3 + 2] = p.z + (Math.random() - 0.5) * jitter;
    }
    posAttr.needsUpdate = true;
  }

  public dispose(): void {
    if (this.isDisposed) return;
    this.isDisposed = true;

    if (this.parent) {
      this.parent.remove(this);
    }

    if (this.tubeGeometry) {
      this.tubeGeometry.dispose();
    }
    this.tubeMaterial.dispose();

    this.particles.geometry.dispose();
    (this.particles.material as PointsMaterial).dispose();
  }
}
