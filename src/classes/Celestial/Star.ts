import {
  Mesh,
  SphereGeometry,
  CylinderGeometry,
  ShaderMaterial,
  MeshBasicMaterial,
  Points,
  BufferGeometry,
  BufferAttribute,
  PointsMaterial,
  Vector3,
  Color,
  Quaternion,
  DoubleSide,
  AdditiveBlending
} from 'three';
import { CelestialBody } from './CelestialBody';

export type StarType = 'sol' | 'blue' | 'red' | 'neutron';

export interface StarOptions {
  position: Vector3;
  type?: StarType;
  radius?: number;
  mass?: number;
  velocity?: Vector3;
}

export class Star extends CelestialBody {
  public readonly starType: StarType;
  public readonly maxRadius: number;
  public isBeingConsumed = false;

  private elapsedTime = 0;
  private photosphereMesh: Mesh;
  private coronaMesh: Mesh;
  private photosphereMat: ShaderMaterial;
  private coronaMat: ShaderMaterial;

  // Jatos polares de rádio para estrelas de nêutrons / pulsars
  private northJetMesh?: Mesh;
  private southJetMesh?: Mesh;

  // Partículas de plasma coronal
  private flares: Points;
  private flareCount = 120;
  private flarePositions: Float32Array;
  private flareData: Array<{ angle: number; dist: number; height: number; speed: number }>;

  // Deformação de maré estelar (Tidal elongation / Roche Lobe overflow)
  private tidalDirection: Vector3 = new Vector3();
  private tidalStrength = 0;
  private currentScale = new Vector3(1, 1, 1);

  constructor(options: StarOptions) {
    const type = options.type ?? 'sol';
    let defaultRadius = 4.0;
    let defaultMass = 140.0;

    if (type === 'blue') {
      defaultRadius = 6.0;
      defaultMass = 380.0;
    } else if (type === 'red') {
      defaultRadius = 8.5;
      defaultMass = 260.0;
    } else if (type === 'neutron') {
      defaultRadius = 2.0;
      defaultMass = 450.0;
    }

    const r = options.radius ?? defaultRadius;
    const m = options.mass ?? defaultMass;
    super(m, r);

    this.starType = type;
    this.maxRadius = r;
    this.position.copy(options.position);
    if (options.velocity) this.velocity.copy(options.velocity);

    const colors = this.getStarColors();

    // ── 1. Fotosfera Solar com Convecção Térmica Procedural ──────────────────
    const noiseGLSL = `
      float hash(vec3 p) {
        p = fract(p * 0.3183099 + 0.1);
        p *= 17.0;
        return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
      }
      float noise(vec3 x) {
        vec3 p = floor(x);
        vec3 f = fract(x);
        f = f * f * (3.0 - 2.0 * f);
        return mix(
          mix(mix(hash(p + vec3(0,0,0)), hash(p + vec3(1,0,0)), f.x),
              mix(hash(p + vec3(0,1,0)), hash(p + vec3(1,1,0)), f.x), f.y),
          mix(mix(hash(p + vec3(0,0,1)), hash(p + vec3(1,0,1)), f.x),
              mix(hash(p + vec3(0,1,1)), hash(p + vec3(1,1,1)), f.x), f.y), f.z
        );
      }
      float fbm(vec3 p) {
        float f = 0.0;
        f += 0.5000 * noise(p); p *= 2.02;
        f += 0.2500 * noise(p); p *= 2.03;
        f += 0.1250 * noise(p);
        return f;
      }
    `;

    this.photosphereMat = new ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uColorHot: { value: colors.hot },
        uColorMid: { value: colors.mid },
        uColorDark: { value: colors.dark }
      },
      vertexShader: `
        varying vec3 vNormal;
        varying vec3 vPosition;
        void main() {
          vNormal = normalize(normalMatrix * normal);
          vPosition = position;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        ${noiseGLSL}
        uniform float uTime;
        uniform vec3 uColorHot;
        uniform vec3 uColorMid;
        uniform vec3 uColorDark;
        varying vec3 vNormal;
        varying vec3 vPosition;
        void main() {
          float speed = 0.45;
          float n = fbm(vPosition * 0.8 + vec3(uTime * speed, uTime * speed * 0.7, 0.0));
          float n2 = fbm(vPosition * 1.6 - vec3(0.0, uTime * speed * 1.2, uTime * speed * 0.5));
          float granulation = n * 0.65 + n2 * 0.35;

          vec3 col = mix(uColorDark, uColorMid, granulation);
          col = mix(col, uColorHot, smoothstep(0.5, 0.85, granulation));

          gl_FragColor = vec4(col * 1.8, 1.0);
        }
      `
    });

    this.photosphereMesh = new Mesh(new SphereGeometry(this.radius, 32, 32), this.photosphereMat);
    this.add(this.photosphereMesh);

    // ── 2. Corona Solar e Halo de Fresnel ────────────────────────────────────
    this.coronaMat = new ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uCoronaColor: { value: colors.corona }
      },
      vertexShader: `
        varying vec3 vNormal;
        varying vec3 vViewPosition;
        void main() {
          vNormal = normalize(normalMatrix * normal);
          vec4 mvPos = modelViewMatrix * vec4(position, 1.0);
          vViewPosition = -mvPos.xyz;
          gl_Position = projectionMatrix * mvPos;
        }
      `,
      fragmentShader: `
        uniform float uTime;
        uniform vec3 uCoronaColor;
        varying vec3 vNormal;
        varying vec3 vViewPosition;
        void main() {
          vec3 n = normalize(vNormal);
          vec3 v = normalize(vViewPosition);
          float fresnel = 1.0 - clamp(abs(dot(n, v)), 0.0, 1.0);
          fresnel = pow(max(0.001, fresnel), 2.2);

          float pulse = 0.9 + 0.1 * sin(uTime * 4.0);
          gl_FragColor = vec4(uCoronaColor * fresnel * pulse * 2.5, clamp(fresnel * 0.95, 0.0, 1.0));
        }
      `,
      transparent: true,
      blending: AdditiveBlending,
      side: DoubleSide,
      depthWrite: false
    });

    this.coronaMesh = new Mesh(new SphereGeometry(this.radius * 1.22, 32, 32), this.coronaMat);
    this.add(this.coronaMesh);

    // ── 3. Partículas de Flares / Proeminências Solares ──────────────────────
    this.flarePositions = new Float32Array(this.flareCount * 3);
    this.flareData = [];

    for (let i = 0; i < this.flareCount; i++) {
      const angle = Math.random() * Math.PI * 2;
      const dist = this.radius * (1.1 + Math.random() * 0.5);
      const height = (Math.random() - 0.5) * this.radius * 0.9;
      const speed = 0.5 + Math.random() * 1.5;

      this.flarePositions[i * 3]     = Math.cos(angle) * dist;
      this.flarePositions[i * 3 + 1] = height;
      this.flarePositions[i * 3 + 2] = Math.sin(angle) * dist;

      this.flareData.push({ angle, dist, height, speed });
    }

    const flareGeo = new BufferGeometry();
    flareGeo.setAttribute('position', new BufferAttribute(this.flarePositions, 3));
    const flareMat = new PointsMaterial({
      color: colors.corona,
      size: 0.45,
      transparent: true,
      blending: AdditiveBlending,
      opacity: 0.85
    });
    this.flares = new Points(flareGeo, flareMat);
    this.add(this.flares);

    // ── 4. Jatos de Radiação para Estrela de Nêutrons (Pulsar) ───────────────
    if (this.starType === 'neutron') {
      const jetGeo = new CylinderGeometry(0.12, 0.6, this.radius * 9.0, 16, 1, true);
      const jetMat = new MeshBasicMaterial({
        color: 0x88eeff,
        transparent: true,
        blending: AdditiveBlending,
        opacity: 0.8
      });
      this.northJetMesh = new Mesh(jetGeo, jetMat);
      this.northJetMesh.position.set(0, this.radius * 4.5, 0);
      this.add(this.northJetMesh);

      this.southJetMesh = new Mesh(jetGeo, jetMat);
      this.southJetMesh.position.set(0, -this.radius * 4.5, 0);
      this.southJetMesh.rotation.x = Math.PI;
      this.add(this.southJetMesh);
    }
  }

  private getStarColors(): { hot: Color; mid: Color; dark: Color; corona: Color } {
    switch (this.starType) {
      case 'blue':
        return {
          hot: new Color(0xffffff),
          mid: new Color(0x66ccff),
          dark: new Color(0x0044aa),
          corona: new Color(0x3399ff)
        };
      case 'red':
        return {
          hot: new Color(0xffaa44),
          mid: new Color(0xff3300),
          dark: new Color(0x550a00),
          corona: new Color(0xff2200)
        };
      case 'neutron':
        return {
          hot: new Color(0xffffff),
          mid: new Color(0xaaccff),
          dark: new Color(0x2244bb),
          corona: new Color(0x88ddff)
        };
      case 'sol':
      default:
        return {
          hot: new Color(0xffffff),
          mid: new Color(0xffbb00),
          dark: new Color(0xaa2200),
          corona: new Color(0xff8800)
        };
    }
  }

  public getColors(): { hot: Color; mid: Color; dark: Color; corona: Color } {
    return this.getStarColors();
  }

  /**
   * Aplica deformação de maré de Roche esticando a estrela na direção do buraco negro
   */
  public setTidalStretch(towards: Vector3, intensity: number): void {
    this.isBeingConsumed = true;
    this.tidalDirection.copy(towards).normalize();
    this.tidalStrength = Math.min(1.8, Math.max(0, intensity));
  }

  public resetTidalStretch(): void {
    this.isBeingConsumed = false;
    this.tidalStrength = 0;
  }

  /**
   * Drena massa da estrela conforme ela é sugada. Retorna true se a estrela foi totalmente consumida.
   */
  public drainMass(amount: number): boolean {
    this.mass = Math.max(0, this.mass - amount);
    // Raio decresce proporcional à raiz cúbica da massa
    const volumeRatio = Math.max(0.01, this.mass / (this.maxRadius * 35.0));
    this.radius = Math.max(0.35, this.maxRadius * Math.cbrt(volumeRatio));

    if (this.mass <= 1.0 || this.radius <= 0.4) {
      return true; // Estrela foi destruída e tragada por completo
    }
    return false;
  }

  public update(delta: number): void {
    if (this.isDisposed) return;

    const dtSeconds = delta / 1000;
    this.elapsedTime += dtSeconds;

    // Atualiza shaders
    this.photosphereMat.uniforms.uTime.value = this.elapsedTime;
    this.coronaMat.uniforms.uTime.value = this.elapsedTime;

    // Rotação estelar própria (pulsar gira vertiginosamente)
    const rotSpeed = this.starType === 'neutron' ? 18.0 : 0.4;
    this.photosphereMesh.rotation.y += dtSeconds * rotSpeed;
    this.coronaMesh.rotation.y += dtSeconds * (rotSpeed * 0.8);

    // ── Deformação de Maré Elipsoidal de Roche (Lágrima Estelar) ────────────
    const baseScale = this.radius / this.maxRadius;

    if (this.tidalStrength > 0.01) {
      // Estica ao longo do eixo da maré e afina lateralmente (conservação volumétrica)
      const stretchLongitudinal = 1.0 + this.tidalStrength * 1.1;
      const squeezeLateral = 1.0 / Math.sqrt(stretchLongitudinal);

      this.currentScale.set(
        baseScale * squeezeLateral,
        baseScale * squeezeLateral,
        baseScale * stretchLongitudinal
      );

      // Alinha a rotação do grupo em direção ao vetor da maré
      const up = new Vector3(0, 0, 1);
      const quat = new Quaternion().setFromUnitVectors(up, this.tidalDirection);
      this.quaternion.slerp(quat, dtSeconds * 8.0);
    } else {
      // Retorna para a esfera perfeita
      this.currentScale.set(baseScale, baseScale, baseScale);
    }

    this.scale.copy(this.currentScale);

    // ── Atualiza Partículas de Flares / Proeminências ────────────────────────
    const attr = this.flares.geometry.getAttribute('position') as BufferAttribute;
    const arr = attr.array as Float32Array;

    for (let i = 0; i < this.flareCount; i++) {
      const f = this.flareData[i];
      f.angle += dtSeconds * f.speed;

      arr[i * 3]     = Math.cos(f.angle) * f.dist;
      arr[i * 3 + 1] = f.height + Math.sin(this.elapsedTime * 2.0 + i) * (this.radius * 0.15);
      arr[i * 3 + 2] = Math.sin(f.angle) * f.dist;
    }
    attr.needsUpdate = true;
  }

  public dispose(): void {
    if (this.isDisposed) return;
    this.isDisposed = true;

    if (this.parent) {
      this.parent.remove(this);
    }

    this.photosphereMesh.geometry.dispose();
    this.photosphereMat.dispose();

    this.coronaMesh.geometry.dispose();
    this.coronaMat.dispose();

    this.flares.geometry.dispose();
    (this.flares.material as PointsMaterial).dispose();

    if (this.northJetMesh) {
      this.northJetMesh.geometry.dispose();
      (this.northJetMesh.material as MeshBasicMaterial).dispose();
    }
    if (this.southJetMesh) {
      this.southJetMesh.geometry.dispose();
      (this.southJetMesh.material as MeshBasicMaterial).dispose();
    }
  }
}
