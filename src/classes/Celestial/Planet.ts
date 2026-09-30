import {
  Mesh,
  SphereGeometry,
  RingGeometry,
  ShaderMaterial,
  MeshBasicMaterial,
  Vector3,
  Color,
  DoubleSide,
  Line,
  Material
} from 'three';
import { CelestialBody } from './CelestialBody';

export type PlanetType = 'earth' | 'gas_giant' | 'lava' | 'ice';

export interface PlanetOptions {
  position: Vector3;
  type?: PlanetType;
  radius?: number;
  mass?: number;
  velocity?: Vector3;
}

export class Planet extends CelestialBody {
  public readonly planetType: PlanetType;
  public orbitLine?: Line;

  private surfaceMesh: Mesh;
  private surfaceMat: ShaderMaterial;
  private ringMesh?: Mesh;
  private elapsedTime = 0;

  constructor(options: PlanetOptions) {
    const type = options.type ?? 'earth';
    let defaultRadius = 3.2;
    let defaultMass = 35.0;

    if (type === 'gas_giant') {
      defaultRadius = 5.5;
      defaultMass = 95.0;
    } else if (type === 'lava') {
      defaultRadius = 2.8;
      defaultMass = 42.0;
    } else if (type === 'ice') {
      defaultRadius = 2.5;
      defaultMass = 25.0;
    }

    const r = options.radius ?? defaultRadius;
    const m = options.mass ?? defaultMass;
    super(m, r);

    this.planetType = type;
    this.position.copy(options.position);
    if (options.velocity) this.velocity.copy(options.velocity);

    const colors = this.getPlanetColors();

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

    this.surfaceMat = new ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uColorA: { value: colors.a },
        uColorB: { value: colors.b },
        uColorC: { value: colors.c }
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
        uniform vec3 uColorA;
        uniform vec3 uColorB;
        uniform vec3 uColorC;
        varying vec3 vNormal;
        varying vec3 vPosition;

        void main() {
          vec3 p = vPosition * 0.6;
          float n = fbm(p + vec3(0.0, uTime * 0.08, 0.0));

          vec3 col = mix(uColorA, uColorB, n);
          col = mix(col, uColorC, smoothstep(0.55, 0.85, n));

          // Sombreamento difuso simples
          vec3 lightDir = normalize(vec3(1.0, 1.0, 1.0));
          float diff = max(0.18, dot(vNormal, lightDir));
          gl_FragColor = vec4(col * diff, 1.0);
        }
      `
    });

    this.surfaceMesh = new Mesh(new SphereGeometry(this.radius, 32, 32), this.surfaceMat);
    this.add(this.surfaceMesh);

    // ── Anel Planetário para Gigante Gasoso ──────────────────────────────────
    if (this.planetType === 'gas_giant') {
      const ringGeo = new RingGeometry(this.radius * 1.4, this.radius * 2.5, 48);
      const ringMat = new MeshBasicMaterial({
        color: 0xddbb88,
        side: DoubleSide,
        transparent: true,
        opacity: 0.85
      });
      this.ringMesh = new Mesh(ringGeo, ringMat);
      this.ringMesh.rotation.x = Math.PI * 0.42;
      this.ringMesh.rotation.y = Math.PI * 0.15;
      this.add(this.ringMesh);
    }
  }

  private getPlanetColors(): { a: Color; b: Color; c: Color } {
    switch (this.planetType) {
      case 'gas_giant':
        return {
          a: new Color(0xd49b6a),
          b: new Color(0xe2be9f),
          c: new Color(0x8a5433)
        };
      case 'lava':
        return {
          a: new Color(0x22110c),
          b: new Color(0xaa2200),
          c: new Color(0xffaa00)
        };
      case 'ice':
        return {
          a: new Color(0x88ccee),
          b: new Color(0xcceeff),
          c: new Color(0xffffff)
        };
      case 'earth':
      default:
        return {
          a: new Color(0x1144aa), // Oceano
          b: new Color(0x228833), // Continentes
          c: new Color(0xeeeeee)  // Nuvens/Polos
        };
    }
  }

  public update(delta: number): void {
    if (this.isDisposed) return;

    const dtSeconds = delta / 1000;
    this.elapsedTime += dtSeconds;
    this.surfaceMat.uniforms.uTime.value = this.elapsedTime;

    // Rotação axial do planeta
    this.surfaceMesh.rotation.y += dtSeconds * 0.25;
    if (this.ringMesh) {
      this.ringMesh.rotation.z += dtSeconds * 0.08;
    }
  }

  public dispose(): void {
    if (this.isDisposed) return;
    this.isDisposed = true;

    if (this.parent) {
      this.parent.remove(this);
    }

    if (this.orbitLine) {
      if (this.orbitLine.parent) {
        this.orbitLine.parent.remove(this.orbitLine);
      }
      this.orbitLine.geometry.dispose();
      (this.orbitLine.material as Material).dispose();
      this.orbitLine = undefined;
    }

    this.surfaceMesh.geometry.dispose();
    this.surfaceMat.dispose();

    if (this.ringMesh) {
      this.ringMesh.geometry.dispose();
      (this.ringMesh.material as MeshBasicMaterial).dispose();
    }
  }
}
