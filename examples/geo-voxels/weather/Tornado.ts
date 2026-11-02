import {
  AdditiveBlending,
  BoxGeometry,
  Color,
  CylinderGeometry,
  DoubleSide,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  Object3D,
  RingGeometry,
  ShaderMaterial,
  Vector3
} from 'three';
import type { Player } from '@voxel/engine/worker';

const DEBRIS_COUNT = 32;

export interface TornadoOptions {
  position: Vector3;
  radius?: number;
  height?: number;
  lifetime?: number;
  roamSpeed?: number;
}

/**
 * Epic Tornado Entity:
 * - Towering swirling funnel with sinusoidal oscillation and internal electrical arcs
 * - Ground debris cloud ring and rotating vortex bowl
 * - Orbiting voxel debris blocks sucked upwards into the cyclone
 * - Suction physics: pulls player inward, spins them in the vortex, and lifts them skyward
 * - Complete fallback to unlit materials when shaders are disabled
 */
export class Tornado {
  public readonly group = new Object3D();
  public readonly position: Vector3;
  public isDisposed = false;
  public elapsed = 0;
  public lifetime: number;
  public readonly baseRadius: number;
  public readonly height: number;

  private funnelMesh: Mesh;
  private funnelShaderMat: ShaderMaterial;
  private funnelFallbackMat: MeshBasicMaterial;

  private innerMesh: Mesh;
  private innerShaderMat: ShaderMaterial;
  private innerFallbackMat: MeshBasicMaterial;

  private dustBowlMesh: Mesh;
  private dustBowlShaderMat: ShaderMaterial;
  private dustBowlFallbackMat: MeshBasicMaterial;

  private debrisMesh: InstancedMesh;
  private debrisData: Array<{ angle: number; height: number; dist: number; speed: number; rotSpeed: number }> = [];
  private dummyMatrix = new Matrix4();

  private roamVelocity = new Vector3();
  private fancy = true;

  constructor(options: TornadoOptions) {
    this.position = options.position.clone();
    this.baseRadius = options.radius ?? 4.0;
    this.height = options.height ?? 175.0;
    this.lifetime = options.lifetime ?? 180.0; // 3 minutes default

    const angle = Math.random() * Math.PI * 2;
    const speed = options.roamSpeed ?? 3.5;
    this.roamVelocity.set(Math.cos(angle) * speed, 0, Math.sin(angle) * speed);

    this.group.name = 'Tornado';
    this.group.position.copy(this.position);

    // ── 1. Outer Funnel ──
    // Tapered cylinder: radiusTop=26, radiusBottom=4, height=175
    const funnelGeom = new CylinderGeometry(28, this.baseRadius, this.height, 32, 28, true);
    // Shift origin so bottom is at Y=0
    funnelGeom.translate(0, this.height * 0.5, 0);

    this.funnelShaderMat = new ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uColor: { value: new Color(0x282c35) },
        uHighlight: { value: new Color(0x6a7d96) },
        uLightning: { value: 0.0 }
      },
      vertexShader: `
        uniform float uTime;
        varying vec2 vUv;
        varying vec3 vWorldPos;
        varying float vHeightNorm;

        void main() {
          vUv = uv;
          vHeightNorm = position.y / 175.0;

          vec3 pos = position;
          // Organic sinusoidal oscillation along height
          float sway = sin(uTime * 2.4 + pos.y * 0.035) * 4.5 * vHeightNorm;
          float swayZ = cos(uTime * 2.0 + pos.y * 0.04) * 4.5 * vHeightNorm;
          pos.x += sway;
          pos.z += swayZ;

          // Twisting bulge pulsation
          float bulge = sin(uTime * 3.5 + pos.y * 0.1) * 0.6;
          pos.x += (pos.x / (length(pos.xz) + 1e-3)) * bulge;
          pos.z += (pos.z / (length(pos.xz) + 1e-3)) * bulge;

          vec4 wp = modelMatrix * vec4(pos, 1.0);
          vWorldPos = wp.xyz;
          gl_Position = projectionMatrix * viewMatrix * wp;
        }
      `,
      fragmentShader: `
        uniform float uTime;
        uniform vec3 uColor;
        uniform vec3 uHighlight;
        uniform float uLightning;
        varying vec2 vUv;
        varying vec3 vWorldPos;
        varying float vHeightNorm;

        float hash(vec2 p) {
          return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
        }

        float noise(vec2 p) {
          vec2 i = floor(p);
          vec2 f = fract(p);
          vec2 u = f * f * (3.0 - 2.0 * f);
          return mix(
            mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
            mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x),
            u.y
          );
        }

        void main() {
          // Rapid upward swirling noise bands
          vec2 uv = vec2(vUv.x * 6.0 + uTime * 1.8, vUv.y * 3.0 - uTime * 2.2);
          float n1 = noise(uv * 2.0);
          float n2 = noise(uv * 5.0 + vec2(uTime * 0.8, -uTime * 1.5));
          float n = n1 * 0.6 + n2 * 0.4;

          // Spiral bands
          float band = sin(vUv.x * 24.0 + vUv.y * 18.0 - uTime * 6.0) * 0.5 + 0.5;
          float alpha = smoothstep(0.18, 0.75, n) * (0.65 + band * 0.35);

          // Internal electric lightning sparks
          float spark = step(0.965, hash(floor(uv * 12.0) + floor(uTime * 14.0))) * 1.5;

          vec3 col = mix(uColor, uHighlight, n * 0.7);
          col += vec3(0.7, 0.85, 1.0) * (spark + uLightning * 1.8);

          // Soft ground fade and cloud top fade
          alpha *= smoothstep(0.0, 0.06, vHeightNorm);
          alpha = clamp(alpha * 0.82, 0.0, 0.92);

          gl_FragColor = vec4(col, alpha);
        }
      `,
      transparent: true,
      side: DoubleSide,
      depthWrite: false
    });

    this.funnelFallbackMat = new MeshBasicMaterial({
      color: 0x303642,
      transparent: true,
      opacity: 0.65,
      side: DoubleSide,
      depthWrite: false
    });

    this.funnelMesh = new Mesh(funnelGeom, this.funnelShaderMat);
    this.group.add(this.funnelMesh);

    // ── 2. Inner Dark Core ──
    const innerGeom = new CylinderGeometry(18, this.baseRadius * 0.6, this.height, 20, 16, true);
    innerGeom.translate(0, this.height * 0.5, 0);

    this.innerShaderMat = new ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uColor: { value: new Color(0x111317) }
      },
      vertexShader: `
        uniform float uTime;
        varying vec2 vUv;
        void main() {
          vUv = uv;
          vec3 pos = position;
          float sway = sin(uTime * 2.8 + pos.y * 0.04) * 3.0 * (pos.y / 175.0);
          pos.x += sway;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
        }
      `,
      fragmentShader: `
        uniform float uTime;
        uniform vec3 uColor;
        varying vec2 vUv;
        void main() {
          float pulse = sin(uTime * 5.0 + vUv.y * 10.0) * 0.15 + 0.85;
          gl_FragColor = vec4(uColor * pulse, 0.75);
        }
      `,
      transparent: true,
      side: DoubleSide,
      depthWrite: false
    });

    this.innerFallbackMat = new MeshBasicMaterial({
      color: 0x16181e,
      transparent: true,
      opacity: 0.7,
      side: DoubleSide,
      depthWrite: false
    });

    this.innerMesh = new Mesh(innerGeom, this.innerShaderMat);
    this.group.add(this.innerMesh);

    // ── 3. Ground Dust Bowl (Expanding ground disc) ──
    const dustBowlGeom = new RingGeometry(this.baseRadius * 0.3, this.baseRadius * 3.5, 32);
    dustBowlGeom.rotateX(-Math.PI * 0.5);
    dustBowlGeom.translate(0, 0.4, 0);

    this.dustBowlShaderMat = new ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uColor: { value: new Color(0x4a463c) }
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
        uniform vec3 uColor;
        varying vec2 vUv;
        void main() {
          vec2 c = vUv - 0.5;
          float d = length(c);
          float angle = atan(c.y, c.x);
          float swirl = sin(angle * 8.0 - uTime * 6.0 + d * 14.0) * 0.5 + 0.5;
          float alpha = smoothstep(0.48, 0.1, d) * smoothstep(0.04, 0.12, d) * (0.4 + swirl * 0.4);
          gl_FragColor = vec4(uColor, alpha * 0.75);
        }
      `,
      transparent: true,
      side: DoubleSide,
      depthWrite: false
    });

    this.dustBowlFallbackMat = new MeshBasicMaterial({
      color: 0x4a463c,
      transparent: true,
      opacity: 0.55,
      side: DoubleSide,
      depthWrite: false
    });

    this.dustBowlMesh = new Mesh(dustBowlGeom, this.dustBowlShaderMat);
    this.group.add(this.dustBowlMesh);

    // ── 4. Orbiting Debris Voxels (Wood, Dirt, Stone) ──
    const boxGeom = new BoxGeometry(0.8, 0.8, 0.8);
    const boxMat = new MeshBasicMaterial({ color: 0x5a4a3a });
    this.debrisMesh = new InstancedMesh(boxGeom, boxMat, DEBRIS_COUNT);
    this.debrisMesh.frustumCulled = false;

    for (let i = 0; i < DEBRIS_COUNT; i++) {
      this.debrisData.push({
        angle: Math.random() * Math.PI * 2,
        height: Math.random() * (this.height * 0.65) + 2,
        dist: this.baseRadius + Math.random() * 8.0,
        speed: 2.5 + Math.random() * 3.5,
        rotSpeed: 3.0 + Math.random() * 4.0
      });
    }
    this.group.add(this.debrisMesh);
  }

  public setShaderQuality(fancy: boolean): void {
    this.fancy = fancy;
    this.funnelMesh.material = fancy ? this.funnelShaderMat : this.funnelFallbackMat;
    this.innerMesh.material = fancy ? this.innerShaderMat : this.innerFallbackMat;
    this.dustBowlMesh.material = fancy ? this.dustBowlShaderMat : this.dustBowlFallbackMat;
  }

  public setLightningFlash(amount: number): void {
    if (this.funnelShaderMat.uniforms.uLightning) {
      this.funnelShaderMat.uniforms.uLightning.value = amount;
    }
  }

  public update(dtSeconds: number, player?: Player): void {
    this.elapsed += dtSeconds;
    if (this.elapsed >= this.lifetime) {
      this.isDisposed = true;
      return;
    }

    // Wandering motion
    this.position.x += this.roamVelocity.x * dtSeconds;
    this.position.z += this.roamVelocity.z * dtSeconds;
    this.group.position.copy(this.position);

    // Funnel rotation
    this.funnelMesh.rotation.y += 2.8 * dtSeconds;
    this.innerMesh.rotation.y -= 3.6 * dtSeconds;
    this.dustBowlMesh.rotation.y += 4.5 * dtSeconds;

    // Update shader uniforms
    if (this.fancy) {
      this.funnelShaderMat.uniforms.uTime.value = this.elapsed;
      this.innerShaderMat.uniforms.uTime.value = this.elapsed;
      this.dustBowlShaderMat.uniforms.uTime.value = this.elapsed;
    }

    // ── Update Debris Voxels ──
    for (let i = 0; i < DEBRIS_COUNT; i++) {
      const d = this.debrisData[i];
      d.angle += d.speed * dtSeconds;
      d.height += (14.0 + d.speed * 2.0) * dtSeconds;

      // Expand distance as debris rises along funnel shape
      const heightRatio = d.height / this.height;
      const currentRadius = this.baseRadius + heightRatio * 18.0 + (Math.sin(d.angle * 2.0) * 1.5);

      if (d.height > this.height * 0.75) {
        d.height = 2.0;
        d.angle = Math.random() * Math.PI * 2;
      }

      const dx = Math.cos(d.angle) * currentRadius;
      const dz = Math.sin(d.angle) * currentRadius;

      this.dummyMatrix.makeRotationY(d.angle * d.rotSpeed);
      this.dummyMatrix.setPosition(dx, d.height, dz);
      this.debrisMesh.setMatrixAt(i, this.dummyMatrix);
    }
    this.debrisMesh.instanceMatrix.needsUpdate = true;

    // ── Physics Suction on Player ──
    if (player) {
      this.applySuction(player, dtSeconds);
    }
  }

  private applySuction(player: Player, dtSeconds: number): void {
    const pPos = player.camera.position;
    const toCenter = new Vector3(this.position.x - pPos.x, 0, this.position.z - pPos.z);
    const dist = toCenter.length();
    const suctionRadius = 42.0;

    if (dist < suctionRadius && dist > 0.1) {
      const factor = 1.0 - dist / suctionRadius;
      toCenter.normalize();

      // Tangential orbital velocity (rotates around tornado)
      const tangent = new Vector3(-toCenter.z, 0, toCenter.x);

      // Inward pull (stronger closer to funnel)
      const pullStrength = factor * factor * 1.4;
      const spinStrength = factor * 1.1;

      const force = new Vector3(
        (toCenter.x * pullStrength + tangent.x * spinStrength),
        0,
        (toCenter.z * pullStrength + tangent.z * spinStrength)
      );

      // Updraft lift when close to eye (< 14 blocks)
      if (dist < 14.0) {
        const liftFactor = 1.0 - dist / 14.0;
        force.y += liftFactor * 0.95;
      }

      player.applyForce(force);
    }
  }

  public dispose(): void {
    this.isDisposed = true;
    this.group.parent?.remove(this.group);
    this.funnelMesh.geometry.dispose();
    this.funnelShaderMat.dispose();
    this.funnelFallbackMat.dispose();
    this.innerMesh.geometry.dispose();
    this.innerShaderMat.dispose();
    this.innerFallbackMat.dispose();
    this.dustBowlMesh.geometry.dispose();
    this.dustBowlShaderMat.dispose();
    this.dustBowlFallbackMat.dispose();
    this.debrisMesh.geometry.dispose();
    (this.debrisMesh.material as MeshBasicMaterial).dispose();
  }
}
