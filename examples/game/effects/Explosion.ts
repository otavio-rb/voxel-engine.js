import {
  Group,
  Mesh,
  SphereGeometry,
  RingGeometry,
  BoxGeometry,
  MeshBasicMaterial,
  Vector3,
  Color,
  DoubleSide,
  AdditiveBlending,
  ShaderMaterial
} from 'three';
import { blockRegistry } from '@voxel/engine/worker';

export interface ExplosionOptions {
  position: Vector3;
  radius?: number;          // Raio de destruição em blocos (default: 4.5)
  power?: number;           // Força de empurrão/knockback (default: 1.0)
  duration?: number;        // Duração visual em segundos (default: 0.8s)
  color?: number;           // Cor do plasma da explosão (default: 0xffaa22)
  triggerDebris?: boolean;  // Se lança detritos de blocos no ar (default: true)
  debrisBlocks?: Array<{ pos: Vector3; blockType: number }>;
}

interface VoxelDebris {
  mesh: Mesh;
  velocity: Vector3;
  angularVelocity: Vector3;
}

export class Explosion extends Group {
  public readonly radius: number;
  public readonly power: number;
  public isDisposed = false;

  private elapsedTime = 0;
  private readonly maxDuration: number;
  private readonly fireballMesh: Mesh;
  private readonly fireMat: ShaderMaterial;
  private readonly shockwaveMesh: Mesh;
  private readonly shockMat: ShaderMaterial;
  private readonly debris: VoxelDebris[] = [];
  private readonly debrisGeometry: BoxGeometry;
  private readonly debrisMaterialCache = new Map<number, MeshBasicMaterial>();

  constructor(options: ExplosionOptions) {
    super();
    this.position.copy(options.position);
    this.radius = Math.max(1.0, options.radius ?? 4.5);
    this.power = Math.max(0.1, options.power ?? 1.0);
    this.maxDuration = options.duration ?? 0.85;

    // ── 1. Esfera de Plasma / Bola de Fogo Incandescente ──────────────────────
    // Plasma turbulento: núcleo branco que esfria para laranja e fuligem, borda em fresnel
    const fireGeo = new SphereGeometry(1.0, 24, 18);
    this.fireMat = new ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uProgress: { value: 0 },
        uOpacity: { value: 1 },
        uColor: { value: new Color(options.color ?? 0xff7711) }
      },
      vertexShader: `
        uniform float uTime;
        uniform float uProgress;
        varying vec3 vNormalV;
        varying vec3 vViewDir;
        varying vec3 vLocal;
        void main() {
          vLocal = position;
          // Superfície borbulhando: lóbulos que crescem enquanto a bola expande
          float lobes = sin(position.x * 5.0 + uTime * 9.0) * sin(position.y * 6.0 - uTime * 7.0) * sin(position.z * 5.5 + uTime * 8.0);
          vec3 pos = position * (1.0 + lobes * (0.08 + uProgress * 0.18));
          vec4 mv = modelViewMatrix * vec4(pos, 1.0);
          vNormalV = normalize(normalMatrix * normal);
          vViewDir = normalize(-mv.xyz);
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: `
        uniform float uTime;
        uniform float uProgress;
        uniform float uOpacity;
        uniform vec3 uColor;
        varying vec3 vNormalV;
        varying vec3 vViewDir;
        varying vec3 vLocal;

        float hash(vec3 p) {
          p = fract(p * 0.3183099 + 0.1);
          p *= 17.0;
          return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
        }
        float noise(vec3 x) {
          vec3 p = floor(x), f = fract(x);
          f = f * f * (3.0 - 2.0 * f);
          return mix(mix(mix(hash(p), hash(p + vec3(1, 0, 0)), f.x),
                         mix(hash(p + vec3(0, 1, 0)), hash(p + vec3(1, 1, 0)), f.x), f.y),
                     mix(mix(hash(p + vec3(0, 0, 1)), hash(p + vec3(1, 0, 1)), f.x),
                         mix(hash(p + vec3(0, 1, 1)), hash(p + vec3(1, 1, 1)), f.x), f.y), f.z);
        }

        void main() {
          // Visto de frente é o centro quente; na borda é gás mais frio e fino
          float facing = clamp(dot(normalize(vNormalV), normalize(vViewDir)), 0.0, 1.0);
          vec3 p = vLocal * 2.6 + vec3(0.0, -uTime * 3.0, 0.0);
          float turb = noise(p) * 0.65 + noise(p * 2.3 + uTime) * 0.35;

          // Temperatura cai com o tempo e em direção à borda
          float heat = clamp(facing * 1.2 + turb * 0.5 - uProgress * 1.1, 0.0, 1.0);
          vec3 smoke = vec3(0.12, 0.1, 0.09);
          vec3 col = mix(smoke, uColor, smoothstep(0.05, 0.45, heat));
          col = mix(col, vec3(1.0, 0.92, 0.6), smoothstep(0.45, 0.8, heat));
          col = mix(col, vec3(1.0), smoothstep(0.8, 1.0, heat));
          col *= 1.0 + heat * 1.5;

          float edge = smoothstep(0.0, 0.35, facing);
          float alpha = uOpacity * edge * (0.55 + 0.45 * turb);
          gl_FragColor = vec4(col * alpha, alpha);
        }
      `,
      transparent: true,
      blending: AdditiveBlending,
      depthWrite: false
    });
    this.fireballMesh = new Mesh(fireGeo, this.fireMat);
    this.add(this.fireballMesh);

    // ── 2. Anel de Onda de Choque Planar ──────────────────────────────────────
    // Frente de choque: borda externa brilhante com poeira arrastada para dentro
    const shockGeo = new RingGeometry(0.2, 1.2, 48);
    this.shockMat = new ShaderMaterial({
      uniforms: {
        uOpacity: { value: 0.9 },
        uColor: { value: new Color(0xffeedd) }
      },
      vertexShader: `
        varying vec2 vLocal;
        void main() {
          vLocal = position.xy;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform float uOpacity;
        uniform vec3 uColor;
        varying vec2 vLocal;
        void main() {
          float t = (length(vLocal) - 0.2) / 1.0; // 0 na borda interna, 1 na externa
          float front = smoothstep(0.55, 0.92, t) * (1.0 - smoothstep(0.92, 1.0, t));
          float wake = smoothstep(0.0, 0.9, t) * 0.25;
          float a = (front + wake) * uOpacity;
          gl_FragColor = vec4(mix(vec3(0.55, 0.45, 0.4), uColor, front) * a, a);
        }
      `,
      side: DoubleSide,
      transparent: true,
      blending: AdditiveBlending,
      depthWrite: false
    });
    this.shockwaveMesh = new Mesh(shockGeo, this.shockMat);
    this.shockwaveMesh.rotation.x = Math.PI * 0.5;
    this.add(this.shockwaveMesh);

    // ── 3. Voxel Debris (Estilhaços de blocos arremessados) ───────────────────
    this.debrisGeometry = new BoxGeometry(0.42, 0.42, 0.42);

    if (options.triggerDebris !== false) {
      const debrisSample = options.debrisBlocks && options.debrisBlocks.length > 0
        ? options.debrisBlocks.slice(0, 36)
        : null;

      const debrisCount = debrisSample ? Math.min(32, debrisSample.length) : 24;

      for (let i = 0; i < debrisCount; i++) {
        const blockType = debrisSample ? debrisSample[i].blockType : 1;
        let mat = this.debrisMaterialCache.get(blockType);
        if (!mat) {
          const col = blockRegistry.getColor(blockType);
          mat = new MeshBasicMaterial({ color: col });
          this.debrisMaterialCache.set(blockType, mat);
        }

        const mesh = new Mesh(this.debrisGeometry, mat);
        mesh.position.set(
          (Math.random() - 0.5) * 1.5,
          Math.random() * 1.0,
          (Math.random() - 0.5) * 1.5
        );
        this.add(mesh);

        // Velocidade balística radial para fora com componente para cima
        const angle = Math.random() * Math.PI * 2;
        const horizSpeed = (3.0 + Math.random() * 8.0) * (0.8 + this.power * 0.4);
        const vertSpeed = (4.0 + Math.random() * 10.0) * (0.8 + this.power * 0.4);

        const velocity = new Vector3(
          Math.cos(angle) * horizSpeed,
          vertSpeed,
          Math.sin(angle) * horizSpeed
        );

        const angularVelocity = new Vector3(
          (Math.random() - 0.5) * 12.0,
          (Math.random() - 0.5) * 12.0,
          (Math.random() - 0.5) * 12.0
        );

        this.debris.push({ mesh, velocity, angularVelocity });
      }
    }
  }

  /** 0-1 through the explosion's lifetime. */
  public get progress(): number {
    return Math.min(1, this.elapsedTime / this.maxDuration);
  }

  public update(dtSeconds: number): void {
    if (this.isDisposed) return;

    this.elapsedTime += dtSeconds;
    const progress = Math.min(1.0, this.elapsedTime / this.maxDuration);

    if (progress >= 1.0) {
      this.dispose();
      return;
    }

    // ── Animação da Bola de Fogo ─────────────────────────────────────────────
    // Expande rápido nos primeiros 25% do tempo, depois dissipa a opacidade
    const expansionEase = 1.0 - Math.pow(1.0 - progress, 3);
    const fireScale = Math.max(0.1, this.radius * (0.4 + 0.8 * expansionEase));
    this.fireballMesh.scale.set(fireScale, fireScale, fireScale);

    this.fireMat.uniforms.uTime.value = this.elapsedTime;
    this.fireMat.uniforms.uProgress.value = progress;
    this.fireMat.uniforms.uOpacity.value = Math.max(0, 1.0 - Math.pow(progress, 1.8));

    // ── Animação da Onda de Choque ───────────────────────────────────────────
    const shockScale = Math.max(0.1, (this.radius * 1.6) * expansionEase);
    this.shockwaveMesh.scale.set(shockScale, shockScale, 1.0);

    this.shockMat.uniforms.uOpacity.value = Math.max(0, 1.0 - progress);

    // ── Atualização dos Detritos Voxel ───────────────────────────────────────
    for (const d of this.debris) {
      // Gravidade
      d.velocity.y -= 22.0 * dtSeconds;
      d.mesh.position.addScaledVector(d.velocity, dtSeconds);

      // Rotação
      d.mesh.rotation.x += d.angularVelocity.x * dtSeconds;
      d.mesh.rotation.y += d.angularVelocity.y * dtSeconds;
      d.mesh.rotation.z += d.angularVelocity.z * dtSeconds;

      // Encolhimento gradual no final
      if (progress > 0.6) {
        const shrink = Math.max(0.01, 1.0 - (progress - 0.6) / 0.4);
        d.mesh.scale.set(shrink, shrink, shrink);
      }
    }
  }

  public dispose(): void {
    if (this.isDisposed) return;
    this.isDisposed = true;

    if (this.parent) {
      this.parent.remove(this);
    }

    this.fireballMesh.geometry.dispose();
    this.fireMat.dispose();

    this.shockwaveMesh.geometry.dispose();
    this.shockMat.dispose();

    this.debrisGeometry.dispose();
    for (const mat of this.debrisMaterialCache.values()) {
      mat.dispose();
    }
    this.debrisMaterialCache.clear();

    for (const d of this.debris) {
      this.remove(d.mesh);
    }
    this.debris.length = 0;
  }
}
