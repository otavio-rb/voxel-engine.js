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
  AdditiveBlending
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
  private readonly shockwaveMesh: Mesh;
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
    const fireGeo = new SphereGeometry(1.0, 20, 20);
    const fireMat = new MeshBasicMaterial({
      color: options.color ?? 0xff7711,
      transparent: true,
      blending: AdditiveBlending,
      opacity: 0.95
    });
    this.fireballMesh = new Mesh(fireGeo, fireMat);
    this.add(this.fireballMesh);

    // ── 2. Anel de Onda de Choque Planar ──────────────────────────────────────
    const shockGeo = new RingGeometry(0.2, 1.2, 32);
    const shockMat = new MeshBasicMaterial({
      color: 0xffeedd,
      side: DoubleSide,
      transparent: true,
      blending: AdditiveBlending,
      opacity: 0.9
    });
    this.shockwaveMesh = new Mesh(shockGeo, shockMat);
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

    const fireMat = this.fireballMesh.material as MeshBasicMaterial;
    fireMat.opacity = Math.max(0, 1.0 - Math.pow(progress, 1.8));

    // ── Animação da Onda de Choque ───────────────────────────────────────────
    const shockScale = Math.max(0.1, (this.radius * 1.6) * expansionEase);
    this.shockwaveMesh.scale.set(shockScale, shockScale, 1.0);

    const shockMat = this.shockwaveMesh.material as MeshBasicMaterial;
    shockMat.opacity = Math.max(0, 1.0 - progress);

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
    (this.fireballMesh.material as MeshBasicMaterial).dispose();

    this.shockwaveMesh.geometry.dispose();
    (this.shockwaveMesh.material as MeshBasicMaterial).dispose();

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
