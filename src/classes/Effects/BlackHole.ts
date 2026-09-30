import {
  Group,
  Mesh,
  SphereGeometry,
  RingGeometry,
  CylinderGeometry,
  BoxGeometry,
  BufferGeometry,
  BufferAttribute,
  MeshBasicMaterial,
  ShaderMaterial,
  Points,
  PointsMaterial,
  Vector3,
  Color,
  DoubleSide,
  AdditiveBlending
} from 'three';
import Player from '../Player';
import ProceduralWorld from '../Worlds/ProceduralWorld';
import { blockRegistry } from '../../core/BlockRegistry';

export interface BlackHoleOptions {
  position: Vector3;
  radius?: number;          // Raio do horizonte de eventos (default: 3.0)
  influenceRadius?: number; // Raio de atração gravitacional (default: 35.0)
  devourRadius?: number;    // Raio de destruição de voxels (default: 16.0)
  lifetime?: number;        // Duração em segundos (0 = infinito, default: 45)
  onSpaghettify?: () => void;
  onDestroyBlock?: (pos: Vector3, blockType: number) => void;
  onExplode?: () => void;
}

interface DraggedBlock {
  mesh: Mesh;
  velocity: Vector3;
  angularVelocity: Vector3;
  scale: number;
  blockType: number;
}

export class BlackHole extends Group {
  public coreRadius: number;
  public baseRadius: number;
  public influenceRadius: number;
  public devourRadius: number;
  public mass: number;
  public velocity: Vector3 = new Vector3();
  public currentScale = 1.0;
  public targetScale = 1.0;
  public lifetime: number;
  public isImploding = false;
  public isDisposed = false;

  private elapsedTime = 0;
  private devourTimer = 0;
  private spaghettifyCooldown = 0;
  private readonly options: BlackHoleOptions;

  // Three.js visual components
  private singularityMesh: Mesh;
  private photonSphereMesh: Mesh;
  private accretionDiskMesh: Mesh;
  private verticalDiskMesh: Mesh;
  private northJetMesh: Mesh;
  private southJetMesh: Mesh;
  private diskMaterial: ShaderMaterial;
  private photonMaterial: ShaderMaterial;
  private jetMaterial: ShaderMaterial;

  // Particle vortex
  private particles: Points;
  private particlePositions: Float32Array;
  private particleData: Array<{ angle: number; dist: number; height: number; speed: number; verticalDrift: number }>;
  private particleCount = 450;

  // Dragged voxel blocks (ripped from the ground and pulled into the vortex)
  private draggedBlocks: DraggedBlock[] = [];
  private blockGeometry = new BoxGeometry(0.88, 0.88, 0.88);
  private materialCache = new Map<number, MeshBasicMaterial>();

  // Cores dinâmicas do disco de acreção e anéis de poeira (podem ser alteradas ao consumir estrelas)
  private targetColorInner = new Color(0xffffff);
  private targetColorMid = new Color(0xff5500);
  private targetColorOuter = new Color(0x7700ff);
  private targetGlowColor = new Color(0xff9922);
  private targetParticleColor = new Color(0xffaa33);

  // Implosion effect
  private implosionTime = 0;
  private shockwaveMesh: Mesh | null = null;

  // Gravitational wave merger effect
  private mergerWaveMesh: Mesh | null = null;
  private mergerWaveProgress = 0;

  constructor(options: BlackHoleOptions) {
    super();
    this.options = options;
    this.position.copy(options.position);
    this.coreRadius = Math.max(1.0, options.radius ?? 3.0);
    this.baseRadius = this.coreRadius;
    this.mass = this.coreRadius * 40.0;
    this.influenceRadius = options.influenceRadius ?? Math.max(45.0, this.coreRadius * 12.0);
    this.devourRadius = options.devourRadius ?? Math.max(30.0, this.coreRadius * 7.5);
    this.lifetime = options.lifetime ?? 45.0;

    // ── 1. Singularity (Event Horizon) ─────────────────────────────────────────
    const singularityGeo = new SphereGeometry(this.coreRadius, 32, 32);
    const singularityMat = new MeshBasicMaterial({ color: 0x000000 });
    this.singularityMesh = new Mesh(singularityGeo, singularityMat);
    this.add(this.singularityMesh);

    // ── 2. Photon Sphere / Gravitational Lensing Halo ──────────────────────────
    const photonGeo = new SphereGeometry(this.coreRadius * 1.08, 32, 32);
    this.photonMaterial = new ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uGlowColor: { value: new Color(0xff9922) }
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
        uniform vec3 uGlowColor;
        uniform float uTime;
        varying vec3 vNormal;
        varying vec3 vViewPosition;
        void main() {
          vec3 n = normalize(vNormal);
          vec3 v = normalize(vViewPosition);
          float fresnel = 1.0 - clamp(abs(dot(n, v)), 0.0, 1.0);
          fresnel = pow(max(0.001, fresnel), 2.8);
          float pulse = 0.85 + 0.15 * sin(uTime * 5.0);
          vec3 col = mix(vec3(1.0, 0.85, 0.3), uGlowColor, fresnel) * fresnel * pulse * 2.2;
          gl_FragColor = vec4(col, clamp(fresnel * 0.95, 0.0, 1.0));
        }
      `,
      transparent: true,
      blending: AdditiveBlending,
      depthWrite: false
    });
    this.photonSphereMesh = new Mesh(photonGeo, this.photonMaterial);
    this.add(this.photonSphereMesh);

    // ── 3. Accretion Disk (Interstellar-style swirling plasma) ──────────────────
    const diskInner = this.coreRadius * 1.35;
    const diskOuter = this.coreRadius * 4.0;
    const diskGeo = new RingGeometry(diskInner, diskOuter, 64, 16);

    this.diskMaterial = new ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uColorInner: { value: new Color(0xffffff) },
        uColorMid: { value: new Color(0xff5500) },
        uColorOuter: { value: new Color(0x7700ff) }
      },
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform float uTime;
        uniform vec3 uColorInner;
        uniform vec3 uColorMid;
        uniform vec3 uColorOuter;
        varying vec2 vUv;

        void main() {
          vec2 coord = (vUv - 0.5) * 2.0;
          float dist = length(coord);
          if (dist < 0.28 || dist > 0.98) discard;

          float angle = atan(coord.y, coord.x);
          float spiral = angle + 4.5 / (dist + 0.1) - uTime * 3.5;

          float n1 = sin(spiral * 5.0 + sin(dist * 20.0 - uTime * 4.0)) * 0.5 + 0.5;
          float n2 = sin(spiral * 9.0 - dist * 28.0 + uTime * 6.5) * 0.5 + 0.5;
          float turbulence = n1 * 0.6 + n2 * 0.4;

          vec3 col = mix(uColorInner, uColorMid, smoothstep(0.28, 0.6, dist));
          col = mix(col, uColorOuter, smoothstep(0.6, 0.98, dist));
          col += turbulence * 0.35 * uColorMid;

          // Relativistic Doppler beaming
          float doppler = 1.0 + 0.4 * sin(angle);
          col *= doppler;

          float alpha = smoothstep(0.28, 0.35, dist) * (1.0 - smoothstep(0.85, 0.98, dist));
          alpha *= (0.8 + turbulence * 0.2);

          gl_FragColor = vec4(col, clamp(alpha, 0.0, 1.0));
        }
      `,
      side: DoubleSide,
      transparent: true,
      blending: AdditiveBlending,
      depthWrite: false
    });

    // Primary tilted accretion disk
    this.accretionDiskMesh = new Mesh(diskGeo, this.diskMaterial);
    this.accretionDiskMesh.rotation.x = Math.PI * 0.38;
    this.accretionDiskMesh.rotation.y = Math.PI * 0.12;
    this.add(this.accretionDiskMesh);

    // Secondary vertical arched halo (Interstellar gravitational lensing illusion)
    const haloGeo = new RingGeometry(this.coreRadius * 1.25, this.coreRadius * 3.7, 64, 16);
    this.verticalDiskMesh = new Mesh(haloGeo, this.diskMaterial);
    this.verticalDiskMesh.rotation.y = Math.PI * 0.5;
    this.verticalDiskMesh.rotation.x = Math.PI * 0.08;
    this.add(this.verticalDiskMesh);

    // ── 4. Relativistic Polar Jets ─────────────────────────────────────────────
    const jetGeo = new CylinderGeometry(0.1, this.coreRadius * 0.6, this.coreRadius * 6.5, 16, 1, true);
    this.jetMaterial = new ShaderMaterial({
      uniforms: {
        uTime: { value: 0 }
      },
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform float uTime;
        varying vec2 vUv;
        void main() {
          float pulse = 0.7 + 0.3 * sin(uTime * 8.0 - vUv.y * 10.0);
          float fade = (1.0 - vUv.y) * pulse;
          vec3 col = mix(vec3(0.3, 0.1, 1.0), vec3(0.2, 0.9, 1.0), vUv.y);
          gl_FragColor = vec4(col * 2.0, clamp(fade * 0.5, 0.0, 1.0));
        }
      `,
      side: DoubleSide,
      transparent: true,
      blending: AdditiveBlending,
      depthWrite: false
    });

    this.northJetMesh = new Mesh(jetGeo, this.jetMaterial);
    this.northJetMesh.position.y = this.coreRadius * 3.25;
    this.add(this.northJetMesh);

    this.southJetMesh = new Mesh(jetGeo, this.jetMaterial);
    this.southJetMesh.position.y = -this.coreRadius * 3.25;
    this.southJetMesh.rotation.x = Math.PI;
    this.add(this.southJetMesh);

    // ── 5. Infalling Matter Particle Vortex ────────────────────────────────────
    const particleGeo = new BufferGeometry();
    this.particlePositions = new Float32Array(this.particleCount * 3);
    this.particleData = [];

    for (let i = 0; i < this.particleCount; i++) {
      const angle = Math.random() * Math.PI * 2;
      const dist = diskInner + Math.random() * (this.influenceRadius * 0.75 - diskInner);
      const height = (Math.random() - 0.5) * (this.coreRadius * 1.4);
      const speed = 1.2 + Math.random() * 2.0;
      const verticalDrift = (Math.random() - 0.5) * 0.2;

      this.particleData.push({ angle, dist, height, speed, verticalDrift });

      this.particlePositions[i * 3]     = Math.cos(angle) * dist;
      this.particlePositions[i * 3 + 1] = height;
      this.particlePositions[i * 3 + 2] = Math.sin(angle) * dist;
    }

    particleGeo.setAttribute('position', new BufferAttribute(this.particlePositions, 3));
    const particleMat = new PointsMaterial({
      color: 0xffaa33,
      size: 0.35,
      transparent: true,
      blending: AdditiveBlending,
      depthWrite: false
    });
    this.particles = new Points(particleGeo, particleMat);
    this.add(this.particles);
  }

  private getBlockMaterial(blockType: number): MeshBasicMaterial {
    let mat = this.materialCache.get(blockType);
    if (!mat) {
      const color = blockRegistry.getColor(blockType);
      mat = new MeshBasicMaterial({ color });
      this.materialCache.set(blockType, mat);
    }
    return mat;
  }

  public update(delta: number, player: Player, world: ProceduralWorld): void {
    if (this.isDisposed) return;

    const dtSeconds = delta / 1000;
    this.elapsedTime += dtSeconds;

    // ── Update Orbital Movement & Position ──────────────────────────────────
    if (this.velocity.lengthSq() > 0.00001) {
      this.position.addScaledVector(this.velocity, dtSeconds);
      // Soft vertical stabilization to maintain predominantly horizontal orbits
      this.velocity.y *= Math.pow(0.985, dtSeconds * 60);
    }

    // ── Update Dynamic Growth Scale (Hawking merger expansion) ──────────────
    if (Math.abs(this.currentScale - this.targetScale) > 0.001) {
      this.currentScale += (this.targetScale - this.currentScale) * (dtSeconds * 3.5);
      this.scale.set(this.currentScale, this.currentScale, this.currentScale);
    }

    // ── Update Gravitational Wave Ring ──────────────────────────────────────
    if (this.mergerWaveMesh) {
      this.mergerWaveProgress += dtSeconds * 1.5;
      const waveScale = 1.0 + this.mergerWaveProgress * (this.influenceRadius * 1.5);
      this.mergerWaveMesh.scale.set(waveScale, waveScale, 1.0);
      const mat = this.mergerWaveMesh.material as MeshBasicMaterial;
      mat.opacity = Math.max(0, 1.0 - this.mergerWaveProgress);

      if (this.mergerWaveProgress >= 1.0) {
        this.remove(this.mergerWaveMesh);
        this.mergerWaveMesh.geometry.dispose();
        mat.dispose();
        this.mergerWaveMesh = null;
      }
    }

    if (this.spaghettifyCooldown > 0) {
      this.spaghettifyCooldown -= dtSeconds;
    }

    // Check lifetime
    if (this.lifetime > 0 && !this.isImploding) {
      this.lifetime -= dtSeconds;
      if (this.lifetime <= 0) {
        this.implode();
      }
    }

    // ── Implosion Animation ─────────────────────────────────────────────────
    if (this.isImploding) {
      this.updateImplosion(dtSeconds, player);
      return;
    }

    // ── Update Visual Shaders & Rotations ───────────────────────────────────
    this.diskMaterial.uniforms.uTime.value = this.elapsedTime;
    this.photonMaterial.uniforms.uTime.value = this.elapsedTime;
    this.jetMaterial.uniforms.uTime.value = this.elapsedTime;

    // Transição suave (lerp) das cores do disco de acreção, halo de fótons e partículas de poeira
    const colorLerpRate = Math.min(1.0, dtSeconds * 3.2);
    (this.diskMaterial.uniforms.uColorInner.value as Color).lerp(this.targetColorInner, colorLerpRate);
    (this.diskMaterial.uniforms.uColorMid.value as Color).lerp(this.targetColorMid, colorLerpRate);
    (this.diskMaterial.uniforms.uColorOuter.value as Color).lerp(this.targetColorOuter, colorLerpRate);
    (this.photonMaterial.uniforms.uGlowColor.value as Color).lerp(this.targetGlowColor, colorLerpRate);
    (this.particles.material as PointsMaterial).color.lerp(this.targetParticleColor, colorLerpRate);

    this.accretionDiskMesh.rotation.z += dtSeconds * 0.7;
    this.verticalDiskMesh.rotation.z += dtSeconds * 0.45;

    // ── Update Particles Vortex ─────────────────────────────────────────────
    const posAttr = this.particles.geometry.getAttribute('position') as BufferAttribute;
    const array = posAttr.array as Float32Array;

    for (let i = 0; i < this.particleCount; i++) {
      const p = this.particleData[i];
      const angularSpeed = (p.speed / Math.max(1.0, p.dist * 0.5)) * dtSeconds;
      p.angle += angularSpeed;

      const inwardSpeed = (2.5 + 10.0 / Math.max(1.0, p.dist)) * dtSeconds;
      p.dist -= inwardSpeed;
      p.height += p.verticalDrift * dtSeconds;

      if (p.dist <= this.coreRadius * 0.95) {
        p.dist = this.coreRadius * 1.5 + Math.random() * (this.influenceRadius * 0.6);
        p.angle = Math.random() * Math.PI * 2;
        p.height = (Math.random() - 0.5) * (this.coreRadius * 1.2);
      }

      array[i * 3]     = Math.cos(p.angle) * p.dist;
      array[i * 3 + 1] = p.height;
      array[i * 3 + 2] = Math.sin(p.angle) * p.dist;
    }
    posAttr.needsUpdate = true;

    // ── Gravitational Pull on Player ────────────────────────────────────────
    this.applyPlayerGravity(player);

    // ── Gravitational Pull on World Entities (Animals) ──────────────────────
    this.applyEntitiesGravity(world);

    // ── Devour Voxel Terrain & Drag Blocks into the Sky ─────────────────────
    const radiusRatio = Math.max(0.6, this.coreRadius / 3.0);
    const devourInterval = Math.max(20, 80 / Math.sqrt(radiusRatio));
    this.devourTimer += delta;
    if (this.devourTimer >= devourInterval) {
      this.devourTimer = 0;
      this.devourBlock(world);
    }

    // ── Update Dragged Blocks (Swirling Voxel Maelstrom) ────────────────────
    this.updateDraggedBlocks(dtSeconds);
  }

  private applyPlayerGravity(player: Player): void {
    const toHole = new Vector3().subVectors(this.position, player.camera.position);
    const dist = toHole.length();

    if (!Number.isFinite(dist) || dist <= 0.001) return;

    if (dist <= this.influenceRadius) {
      const dir = toHole.clone().divideScalar(dist);

      const massScale = Math.pow(Math.max(0.6, this.coreRadius / 3.0), 1.2);
      const proximityFactor = Math.max(0, 1.0 - (dist / this.influenceRadius));
      const pullMagnitude = (0.22 + (proximityFactor * proximityFactor * 1.8)) * (1.0 / Math.max(0.7, dist * 0.14)) * massScale;

      // Direct pull force
      const pullForce = dir.clone().multiplyScalar(pullMagnitude * 0.038);

      // Safe tangential vortex swirl
      let up = new Vector3(0, 1, 0);
      if (Math.abs(dir.y) > 0.92) {
        up.set(1, 0, 0);
      }
      const swirlDir = new Vector3().crossVectors(dir, up);
      const swirlLen = swirlDir.length();
      if (swirlLen > 0.001) {
        swirlDir.divideScalar(swirlLen);
        const swirlForce = swirlDir.multiplyScalar(pullMagnitude * 0.018);
        player.applyForce(swirlForce);
      }

      player.applyForce(pullForce);

      // Camera shake proportional to proximity and black hole mass
      if (dist < this.coreRadius * 4.5) {
        const shake = Math.min(0.85, (1.0 - (dist / (this.coreRadius * 4.5))) * 0.20 * massScale);
        player.addCameraShake(shake);
      }

      // Event Horizon crossing (Spaghettification) with strict cooldown
      if (dist <= this.coreRadius * 1.15 && this.spaghettifyCooldown <= 0) {
        this.spaghettifyCooldown = 4.0;
        try {
          this.options.onSpaghettify?.();
        } catch (e) {
          console.warn('Erro ao disparar onSpaghettify:', e);
        }

        // Safely fling the player into a high orbit far above the black hole
        try {
          const safeTargetY = Math.min(95, Math.max(50, this.position.y + this.influenceRadius + 15));
          player.teleport(
            this.position.x + (Math.random() - 0.5) * 8,
            safeTargetY,
            this.position.z + (Math.random() - 0.5) * 8
          );
          player.externalVelocity.set(0, 0.25, 0);
          player.addCameraShake(0.5);
        } catch (e) {
          console.warn('Erro ao teleportar jogador no horizonte de eventos:', e);
        }
      }
    }
  }

  private applyEntitiesGravity(world: ProceduralWorld): void {
    const em = world.getEntityManager();
    const entities = em.getEntities();

    for (const entity of entities) {
      if (!entity || !entity.position) continue;

      const toHole = new Vector3().subVectors(this.position, entity.position);
      const dist = toHole.length();

      if (!Number.isFinite(dist) || dist <= 0.001) continue;

      if (dist <= this.influenceRadius) {
        const massScale = Math.pow(Math.max(0.6, this.coreRadius / 3.0), 1.2);
        const dir = toHole.divideScalar(dist);
        const pull = (0.14 + (1.0 - dist / this.influenceRadius) * 0.6) * (0.08 * massScale);

        entity.velocity.x += dir.x * pull;
        entity.velocity.y += dir.y * pull;
        entity.velocity.z += dir.z * pull;

        // Consumed by event horizon
        if (dist <= this.coreRadius * 1.2) {
          try {
            em.remove(entity);
          } catch (e) {
            console.warn('Erro ao consumir entidade no buraco negro:', e);
          }
        }
      }
    }
  }

  private devourBlock(world: ProceduralWorld): void {
    const radiusRatio = Math.max(0.6, this.coreRadius / 3.0);
    // Voxel devouring scales aggressively with radius and mass!
    const blocksPerCycle = Math.min(16, Math.max(2, Math.round(2.5 * radiusRatio * 1.5)));
    let destroyedCount = 0;
    const maxAttempts = blocksPerCycle * 15;

    for (let attempt = 0; attempt < maxAttempts && destroyedCount < blocksPerCycle; attempt++) {
      const angle = Math.random() * Math.PI * 2;
      const distXZ = 1.0 + Math.random() * (this.devourRadius - 1.0);
      const bx = Math.floor(this.position.x + Math.cos(angle) * distXZ);
      const bz = Math.floor(this.position.z + Math.sin(angle) * distXZ);

      // Top-down scan in this column to find the first solid block
      const startY = Math.min(128, Math.floor(this.position.y + 14));
      const endY = Math.max(-64, Math.floor(this.position.y - this.devourRadius));

      for (let y = startY; y >= endY; y--) {
        const blockType = world.getBlock(bx, y, bz);
        if (blockRegistry.isSolid(blockType)) {
          const dx = (bx + 0.5) - this.position.x;
          const dy = (y + 0.5) - this.position.y;
          const dz = (bz + 0.5) - this.position.z;
          const d3 = Math.sqrt(dx * dx + dy * dy + dz * dz);

          if (d3 <= this.devourRadius) {
            // Massive black holes carve deeper craters by stripping multiple vertical layers
            const depthLayers = radiusRatio >= 1.8 ? Math.min(3, Math.floor(radiusRatio)) : 1;
            for (let layer = 0; layer < depthLayers && (y - layer) >= endY && destroyedCount < blocksPerCycle; layer++) {
              const ly = y - layer;
              const lType = world.getBlock(bx, ly, bz);
              if (blockRegistry.isSolid(lType)) {
                const success = world.destroyBlockAt(bx, ly, bz);
                if (success) {
                  this.options.onDestroyBlock?.(new Vector3(bx, ly, bz), lType);
                  this.spawnDraggedBlock(new Vector3(bx + 0.5, ly + 0.5, bz + 0.5), lType);
                  destroyedCount++;
                }
              }
            }
          }
          break; // Done with the top surface of this column
        }
      }
    }
  }

  private spawnDraggedBlock(worldPos: Vector3, blockType: number): void {
    const radiusRatio = Math.max(0.6, this.coreRadius / 3.0);
    const maxDraggedBlocks = Math.min(250, Math.floor(65 * radiusRatio));
    if (this.draggedBlocks.length >= maxDraggedBlocks) return;

    const mat = this.getBlockMaterial(blockType);
    const mesh = new Mesh(this.blockGeometry, mat);

    // Position relative to BlackHole group
    const localPos = new Vector3().subVectors(worldPos, this.position);
    mesh.position.copy(localPos);
    this.add(mesh);

    const dist = Math.max(1.0, localPos.length());
    const toCenter = new Vector3().subVectors(new Vector3(0, 0, 0), localPos).divideScalar(dist);

    // Initial drag impulse: violent upward boost and fast accretion orbit
    const massFactor = Math.max(0.7, this.coreRadius / 3.0);
    const upBoost = new Vector3(0, 3.8 + 2.0 * Math.sqrt(massFactor), 0);
    const diskNormal = new Vector3(0, 1, 0);
    const tangent = new Vector3().crossVectors(toCenter, diskNormal);
    const tangentLen = tangent.length();
    if (tangentLen > 0.001) tangent.divideScalar(tangentLen);

    const initialVelocity = toCenter.multiplyScalar(4.5 + 3.0 * massFactor)
      .add(upBoost)
      .add(tangent.multiplyScalar(3.2 + 2.2 * massFactor));

    const spinSpeed = 6.0 + 3.0 * massFactor;
    this.draggedBlocks.push({
      mesh,
      velocity: initialVelocity,
      angularVelocity: new Vector3(
        (Math.random() - 0.5) * spinSpeed,
        (Math.random() - 0.5) * (spinSpeed * 1.3),
        (Math.random() - 0.5) * spinSpeed
      ),
      scale: 0.95,
      blockType
    });
  }

  private updateDraggedBlocks(dtSeconds: number): void {
    const massFactor = Math.max(0.7, this.coreRadius / 3.0);

    for (let i = this.draggedBlocks.length - 1; i >= 0; i--) {
      const b = this.draggedBlocks[i];
      const localPos = b.mesh.position;
      const dist = localPos.length();

      // Absorbed into event horizon singularity!
      if (dist <= this.coreRadius * 0.9 || b.scale <= 0.05) {
        this.remove(b.mesh);
        this.draggedBlocks.splice(i, 1);
        continue;
      }

      // 1. Inward gravitational pull towards singularity (0, 0, 0) scaled by mass
      const dir = localPos.clone().negate();
      if (dist > 0.001) dir.divideScalar(dist);

      const pull = (16.0 * massFactor + (90.0 * massFactor) / Math.max(1.0, dist)) * dtSeconds;
      b.velocity.addScaledVector(dir, pull);

      // 2. Swirling vortex orbital force around disk scaled by mass
      const diskNormal = new Vector3(0, 1, 0);
      const tangent = new Vector3().crossVectors(dir, diskNormal);
      const tangentLen = tangent.length();
      if (tangentLen > 0.001) {
        tangent.divideScalar(tangentLen);
        const swirl = (12.0 * massFactor + (40.0 * massFactor) / Math.max(1.0, dist)) * dtSeconds;
        b.velocity.addScaledVector(tangent, swirl);
      }

      // 3. Air damping so voxels spiral into an accretion stream
      b.velocity.multiplyScalar(Math.pow(0.965, dtSeconds * 60));

      // 4. Update position
      b.mesh.position.addScaledVector(b.velocity, dtSeconds);

      // 5. Tumble rotation while flying
      b.mesh.rotation.x += b.angularVelocity.x * dtSeconds;
      b.mesh.rotation.y += b.angularVelocity.y * dtSeconds;
      b.mesh.rotation.z += b.angularVelocity.z * dtSeconds;

      // 6. Tidal compression & spaghettification as it approaches the core
      const proximity = Math.min(1.0, dist / (this.coreRadius * 3.0));
      b.scale = Math.max(0.04, 0.95 * Math.pow(proximity, 0.6));
      b.mesh.scale.set(b.scale, b.scale, b.scale);
    }
  }

  public implode(): void {
    if (this.isImploding) return;
    this.isImploding = true;
    this.implosionTime = 0;
    this.options.onExplode?.();

    // Create expanding shockwave ring
    const shockGeo = new RingGeometry(0.1, 1.0, 32);
    const shockMat = new MeshBasicMaterial({
      color: 0xffffff,
      side: DoubleSide,
      transparent: true,
      blending: AdditiveBlending,
      opacity: 0.95
    });
    this.shockwaveMesh = new Mesh(shockGeo, shockMat);
    this.shockwaveMesh.rotation.x = Math.PI * 0.5;
    this.add(this.shockwaveMesh);
  }

  private updateImplosion(dtSeconds: number, player: Player): void {
    this.implosionTime += dtSeconds;
    const progress = this.implosionTime / 1.2;

    if (progress >= 1.0) {
      this.dispose();
      return;
    }

    const collapseScale = Math.max(0.001, 1.0 - Math.pow(progress, 1.5));
    this.singularityMesh.scale.setScalar(collapseScale);
    this.accretionDiskMesh.scale.setScalar(collapseScale);
    this.verticalDiskMesh.scale.setScalar(collapseScale);
    this.photonSphereMesh.scale.setScalar(collapseScale);

    if (this.shockwaveMesh) {
      const shockRadius = progress * (this.influenceRadius * 1.2);
      this.shockwaveMesh.scale.setScalar(shockRadius);
      (this.shockwaveMesh.material as MeshBasicMaterial).opacity = Math.max(0, 1.0 - progress);
    }

    // Blast wave pushes player
    const toPlayer = new Vector3().subVectors(player.camera.position, this.position);
    const dist = toPlayer.length();
    if (Number.isFinite(dist) && dist > 0.001 && dist < this.influenceRadius) {
      const blastDir = toPlayer.divideScalar(dist);
      const blastForce = blastDir.multiplyScalar((1.0 - (dist / this.influenceRadius)) * 0.28);
      player.applyForce(blastForce);
      player.addCameraShake((1.0 - dist / this.influenceRadius) * 0.35);
    }
  }

  /**
   * Absorve a assinatura cromática de uma estrela canibalizada,
   * alterando dinamicamente a cor do disco de acreção, anéis de poeira e halo fotônico.
   */
  public absorbStarColors(starColors: { hot: Color; mid: Color; dark: Color; corona: Color }, instant = false): void {
    this.targetColorInner.copy(starColors.hot);
    this.targetColorMid.copy(starColors.mid);
    this.targetColorOuter.copy(starColors.dark);
    this.targetGlowColor.copy(starColors.corona);
    this.targetParticleColor.copy(starColors.mid);

    if (instant) {
      (this.diskMaterial.uniforms.uColorInner.value as Color).copy(this.targetColorInner);
      (this.diskMaterial.uniforms.uColorMid.value as Color).copy(this.targetColorMid);
      (this.diskMaterial.uniforms.uColorOuter.value as Color).copy(this.targetColorOuter);
      (this.photonMaterial.uniforms.uGlowColor.value as Color).copy(this.targetGlowColor);
      (this.particles.material as PointsMaterial).color.copy(this.targetParticleColor);
    }
  }

  public spawnGravitationalWaveRing(customColor?: Color): void {
    if (this.mergerWaveMesh) {
      this.remove(this.mergerWaveMesh);
      this.mergerWaveMesh.geometry.dispose();
      (this.mergerWaveMesh.material as MeshBasicMaterial).dispose();
      this.mergerWaveMesh = null;
    }
    const waveGeo = new RingGeometry(0.5, 2.5, 48);
    const waveMat = new MeshBasicMaterial({
      color: customColor ? customColor.getHex() : 0x66ddff,
      side: DoubleSide,
      transparent: true,
      blending: AdditiveBlending,
      opacity: 0.95
    });
    this.mergerWaveMesh = new Mesh(waveGeo, waveMat);
    this.mergerWaveMesh.rotation.x = Math.PI * 0.5;
    this.add(this.mergerWaveMesh);
    this.mergerWaveProgress = 0;
  }

  public mergeWith(other: BlackHole): void {
    // Teorema da área de Hawking: A >= A1 + A2 -> R_final = sqrt(R1^2 + R2^2)
    const newRadius = Math.sqrt(this.coreRadius * this.coreRadius + other.coreRadius * other.coreRadius);

    // Conservação de Momento Linear
    const totalMass = this.mass + other.mass;
    if (totalMass > 0) {
      this.velocity.x = (this.velocity.x * this.mass + other.velocity.x * other.mass) / totalMass;
      this.velocity.y = (this.velocity.y * this.mass + other.velocity.y * other.mass) / totalMass;
      this.velocity.z = (this.velocity.z * this.mass + other.velocity.z * other.mass) / totalMass;

      // Mistura cromática na coalescência de buracos negros
      const weight = other.mass / totalMass;
      this.targetColorInner.lerp(other.targetColorInner, weight);
      this.targetColorMid.lerp(other.targetColorMid, weight);
      this.targetColorOuter.lerp(other.targetColorOuter, weight);
      this.targetGlowColor.lerp(other.targetGlowColor, weight);
      this.targetParticleColor.lerp(other.targetParticleColor, weight);
    }

    this.coreRadius = newRadius;
    this.mass = this.coreRadius * 40.0;
    this.influenceRadius = Math.max(45.0, this.coreRadius * 12.0);
    this.devourRadius = Math.max(30.0, this.coreRadius * 7.5);
    this.targetScale = newRadius / this.baseRadius;
    this.lifetime = Math.max(this.lifetime, other.lifetime) + 40.0;

    // Dispara pulso visual de onda gravitacional com a cor do halo fotônico
    this.spawnGravitationalWaveRing(this.targetGlowColor);

    // Descarta o buraco negro coalescido
    other.dispose();
  }

  public dispose(): void {
    if (this.isDisposed) return;
    this.isDisposed = true;

    if (this.parent) {
      this.parent.remove(this);
    }

    if (this.mergerWaveMesh) {
      this.mergerWaveMesh.geometry.dispose();
      (this.mergerWaveMesh.material as MeshBasicMaterial).dispose();
      this.mergerWaveMesh = null;
    }

    for (const b of this.draggedBlocks) {
      this.remove(b.mesh);
    }
    this.draggedBlocks = [];

    this.singularityMesh.geometry.dispose();
    (this.singularityMesh.material as MeshBasicMaterial).dispose();

    this.photonSphereMesh.geometry.dispose();
    this.photonMaterial.dispose();

    this.accretionDiskMesh.geometry.dispose();
    this.verticalDiskMesh.geometry.dispose();
    this.diskMaterial.dispose();

    this.northJetMesh.geometry.dispose();
    this.southJetMesh.geometry.dispose();
    this.jetMaterial.dispose();

    this.particles.geometry.dispose();
    (this.particles.material as PointsMaterial).dispose();

    if (this.shockwaveMesh) {
      this.shockwaveMesh.geometry.dispose();
      (this.shockwaveMesh.material as MeshBasicMaterial).dispose();
    }
    this.blockGeometry.dispose();

    for (const mat of this.materialCache.values()) {
      mat.dispose();
    }
    this.materialCache.clear();
  }
}
