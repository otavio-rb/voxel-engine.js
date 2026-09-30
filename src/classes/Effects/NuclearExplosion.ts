import {
  Group,
  Mesh,
  SphereGeometry,
  CylinderGeometry,
  RingGeometry,
  BoxGeometry,
  LineSegments,
  BufferGeometry,
  BufferAttribute,
  LineBasicMaterial,
  ShaderMaterial,
  MeshBasicMaterial,
  Vector3,
  Color,
  DoubleSide,
  AdditiveBlending
} from 'three';
import { blockRegistry } from '../../core/BlockRegistry';

export interface NuclearExplosionOptions {
  position: Vector3;
  radius?: number;          // Raio da cratera terrestre (default: 18.0)
  cloudHeight?: number;     // Altura final do cogumelo (default: 80.0)
  duration?: number;        // Duração total em segundos (default: 11.0s)
  debrisBlocks?: Array<{ pos: Vector3; blockType: number }>;
}

interface NuclearDebris {
  mesh: Mesh;
  velocity: Vector3;
  angularVelocity: Vector3;
}

interface SmokeBillow {
  mesh: Mesh;
  baseOffset: Vector3;
  scale: number;
  rotSpeed: number;
  angle: number;
}

export class NuclearExplosion extends Group {
  public readonly craterRadius: number;
  public readonly cloudHeight: number;
  public readonly duration: number;
  public isDisposed = false;

  private elapsedTime = 0;

  // Shaders e Malhas Principais do Cogumelo
  private fireballMesh: Mesh;
  private fireballMat: ShaderMaterial;

  private stemMesh: Mesh;
  private stemMat: ShaderMaterial;

  private capDomeMesh: Mesh;
  private capDomeMat: ShaderMaterial;

  // Lóbulos volumétricos de fumaça turbilhonante ao redor do chapéu
  private billows: SmokeBillow[] = [];
  private billowGeometry: SphereGeometry;
  private billowMaterial: ShaderMaterial;

  // Arcos Elétricos / Relâmpagos Estáticos Nucleares
  private lightningLines?: LineSegments;
  private lightningTimer = 0;

  // Anéis de Choque e Condensação
  private wilsonRingUpper: Mesh;
  private wilsonRingLower: Mesh;
  private groundShockwave: Mesh;
  private shockMatUpper: MeshBasicMaterial;
  private shockMatLower: MeshBasicMaterial;
  private groundShockMat: MeshBasicMaterial;

  // Detritos em arco balístico
  private debris: NuclearDebris[] = [];
  private debrisGeometry: BoxGeometry;
  private debrisMaterialCache = new Map<number, MeshBasicMaterial>();

  constructor(options: NuclearExplosionOptions) {
    super();
    this.position.copy(options.position);
    this.craterRadius = Math.max(8.0, options.radius ?? 18.0);
    this.cloudHeight = Math.max(45.0, options.cloudHeight ?? 80.0);
    this.duration = options.duration ?? 11.0;

    // ── 1. Shaders de Fogo e Fumaça Turbulenta com Deformação de Vértices ────
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

    // ── A. Material da Bola de Fogo Inicial ──────────────────────────────────
    this.fireballMat = new ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uProgress: { value: 0 },
        uOpacity: { value: 1.0 }
      },
      vertexShader: `
        ${noiseGLSL}
        uniform float uTime;
        varying vec3 vNormal;
        varying vec3 vPos;
        void main() {
          vNormal = normalize(normalMatrix * normal);
          vec3 displaced = position + normal * (fbm(position * 0.35 + uTime * 2.5) * 0.45);
          vPos = displaced;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(displaced, 1.0);
        }
      `,
      fragmentShader: `
        ${noiseGLSL}
        uniform float uTime;
        uniform float uProgress;
        uniform float uOpacity;
        varying vec3 vNormal;
        varying vec3 vPos;
        void main() {
          float n = fbm(vPos * 0.4 - vec3(0.0, uTime * 1.8, 0.0));
          vec3 coreWhite = vec3(1.0, 1.0, 0.95);
          vec3 fireGold  = vec3(1.0, 0.75, 0.15);
          vec3 fireRed   = vec3(1.0, 0.25, 0.02);
          vec3 darkAsh   = vec3(0.12, 0.08, 0.07);

          vec3 col = mix(coreWhite, fireGold, smoothstep(0.1, 0.4, n));
          col = mix(col, fireRed, smoothstep(0.4, 0.75, n));
          col = mix(col, darkAsh, smoothstep(0.75, 1.0, n + uProgress * 0.6));

          gl_FragColor = vec4(col * 2.2, clamp(uOpacity * (0.8 + 0.2 * n), 0.0, 1.0));
        }
      `,
      transparent: true,
      blending: AdditiveBlending,
      depthWrite: false
    });
    this.fireballMesh = new Mesh(new SphereGeometry(1.0, 32, 32), this.fireballMat);
    this.add(this.fireballMesh);

    // ── B. Material da Haste Ascendente (Stem) ───────────────────────────────
    this.stemMat = new ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uProgress: { value: 0 },
        uOpacity: { value: 0.95 }
      },
      vertexShader: `
        ${noiseGLSL}
        uniform float uTime;
        varying vec2 vUv;
        varying vec3 vPos;
        void main() {
          vUv = uv;
          vec3 displaced = position;
          // Ondulação turbulenta nas bordas da coluna
          float n = fbm(position * 0.25 + vec3(0.0, -uTime * 3.0, 0.0));
          displaced.x += normal.x * n * 0.4;
          displaced.z += normal.z * n * 0.4;
          vPos = displaced;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(displaced, 1.0);
        }
      `,
      fragmentShader: `
        ${noiseGLSL}
        uniform float uTime;
        uniform float uProgress;
        uniform float uOpacity;
        varying vec2 vUv;
        varying vec3 vPos;
        void main() {
          // Coordenadas UV rolam para cima continuamente simulando convecção rápida
          vec3 p = vPos * 0.3 + vec3(0.0, -uTime * 3.5, 0.0);
          float n = fbm(p);

          vec3 fireCore = vec3(1.0, 0.85, 0.3);
          vec3 fireBody = vec3(1.0, 0.4, 0.05);
          vec3 smoke    = vec3(0.18, 0.14, 0.12);
          vec3 coldAsh  = vec3(0.06, 0.05, 0.05);

          float fireMask = (1.0 - smoothstep(0.0, 0.7, uProgress)) * (1.0 - vUv.y * 0.4);
          vec3 col = mix(coldAsh, smoke, n);
          col = mix(col, fireBody, n * fireMask * 1.5);
          col = mix(col, fireCore, smoothstep(0.65, 0.95, n) * fireMask);

          float edgeFade = sin(vUv.y * 3.14159);
          gl_FragColor = vec4(col * (1.0 + fireMask * 1.8), uOpacity * smoothstep(0.0, 0.15, edgeFade));
        }
      `,
      transparent: true,
      side: DoubleSide,
      blending: AdditiveBlending,
      depthWrite: false
    });
    this.stemMesh = new Mesh(new CylinderGeometry(0.85, 1.8, 1.0, 32, 24, true), this.stemMat);
    this.add(this.stemMesh);

    // ── C. Material do Chapéu do Cogumelo (Cap Dome) ────────────────────────
    this.capDomeMat = new ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uProgress: { value: 0 },
        uOpacity: { value: 0.95 }
      },
      vertexShader: `
        ${noiseGLSL}
        uniform float uTime;
        varying vec3 vNormal;
        varying vec3 vPos;
        varying vec2 vUv;
        void main() {
          vUv = uv;
          vNormal = normalize(normalMatrix * normal);
          // Expansão fractal em lóbulos esféricos simulando Rayleigh-Taylor
          float n = fbm(position * 0.28 + vec3(0.0, uTime * 0.8, 0.0));
          vec3 displaced = position + normal * (n * 0.65);
          vPos = displaced;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(displaced, 1.0);
        }
      `,
      fragmentShader: `
        ${noiseGLSL}
        uniform float uTime;
        uniform float uProgress;
        uniform float uOpacity;
        varying vec3 vNormal;
        varying vec3 vPos;
        varying vec2 vUv;
        void main() {
          float n = fbm(vPos * 0.25 - vec3(0.0, uTime * 0.9, 0.0));

          vec3 coreHot   = vec3(1.0, 0.9, 0.4);
          vec3 plasma    = vec3(1.0, 0.45, 0.08);
          vec3 hotSmoke  = vec3(0.45, 0.22, 0.12);
          vec3 darkSmoke = vec3(0.12, 0.10, 0.09);

          float fireFactor = max(0.0, 1.0 - uProgress * 1.8);
          vec3 col = mix(darkSmoke, hotSmoke, n);
          col = mix(col, plasma, n * fireFactor * 1.6);
          col = mix(col, coreHot, smoothstep(0.6, 0.95, n) * fireFactor);

          gl_FragColor = vec4(col * (1.0 + fireFactor * 1.5), uOpacity * 0.95);
        }
      `,
      transparent: true,
      side: DoubleSide,
      blending: AdditiveBlending,
      depthWrite: false
    });
    this.capDomeMesh = new Mesh(
      new SphereGeometry(1.0, 36, 24, 0, Math.PI * 2, 0, Math.PI * 0.65),
      this.capDomeMat
    );
    this.add(this.capDomeMesh);

    // ── 2. Lóbulos Volumétricos de Fumaça (16 Billowing Spheres) ────────────
    this.billowGeometry = new SphereGeometry(1.0, 16, 16);
    this.billowMaterial = this.capDomeMat;

    const billowCount = 16;
    for (let i = 0; i < billowCount; i++) {
      const angle = (i / billowCount) * Math.PI * 2;
      const mesh = new Mesh(this.billowGeometry, this.billowMaterial);
      this.add(mesh);

      this.billows.push({
        mesh,
        baseOffset: new Vector3(Math.cos(angle), -0.22, Math.sin(angle)),
        scale: 0.38 + Math.random() * 0.16,
        rotSpeed: 0.6 + Math.random() * 0.6,
        angle
      });
    }

    // ── 3. Anéis de Condensação de Wilson Duplos ─────────────────────────────
    const ringGeo = new RingGeometry(0.5, 2.5, 48);

    this.shockMatUpper = new MeshBasicMaterial({
      color: 0xffffff,
      side: DoubleSide,
      transparent: true,
      blending: AdditiveBlending,
      opacity: 0.85
    });
    this.wilsonRingUpper = new Mesh(ringGeo, this.shockMatUpper);
    this.wilsonRingUpper.rotation.x = Math.PI * 0.5;
    this.add(this.wilsonRingUpper);

    this.shockMatLower = new MeshBasicMaterial({
      color: 0xffeecc,
      side: DoubleSide,
      transparent: true,
      blending: AdditiveBlending,
      opacity: 0.85
    });
    this.wilsonRingLower = new Mesh(ringGeo, this.shockMatLower);
    this.wilsonRingLower.rotation.x = Math.PI * 0.5;
    this.add(this.wilsonRingLower);

    // ── 4. Onda de Choque de Solo (Ground Blast Wave) ────────────────────────
    this.groundShockMat = new MeshBasicMaterial({
      color: 0xffaa44,
      side: DoubleSide,
      transparent: true,
      blending: AdditiveBlending,
      opacity: 0.95
    });
    this.groundShockwave = new Mesh(new RingGeometry(0.5, 4.0, 64), this.groundShockMat);
    this.groundShockwave.rotation.x = Math.PI * 0.5;
    this.add(this.groundShockwave);

    // ── 5. Tempestade de Detritos Voxel Balísticos (Fallout Ejecta) ──────────
    this.debrisGeometry = new BoxGeometry(0.75, 0.75, 0.75);
    const debrisList = options.debrisBlocks && options.debrisBlocks.length > 0
      ? options.debrisBlocks.slice(0, 50)
      : null;
    const count = debrisList ? debrisList.length : 40;

    for (let i = 0; i < count; i++) {
      const type = debrisList ? debrisList[i].blockType : 1;
      let mat = this.debrisMaterialCache.get(type);
      if (!mat) {
        mat = new MeshBasicMaterial({ color: blockRegistry.getColor(type) });
        this.debrisMaterialCache.set(type, mat);
      }
      const mesh = new Mesh(this.debrisGeometry, mat);
      mesh.position.set(
        (Math.random() - 0.5) * 6.0,
        Math.random() * 3.0,
        (Math.random() - 0.5) * 6.0
      );
      this.add(mesh);

      const angle = Math.random() * Math.PI * 2;
      const horiz = 12.0 + Math.random() * 30.0;
      const vert = 18.0 + Math.random() * 42.0;

      const velocity = new Vector3(Math.cos(angle) * horiz, vert, Math.sin(angle) * horiz);
      const angularVelocity = new Vector3(
        (Math.random() - 0.5) * 18.0,
        (Math.random() - 0.5) * 18.0,
        (Math.random() - 0.5) * 18.0
      );
      this.debris.push({ mesh, velocity, angularVelocity });
    }
  }

  private updateNuclearLightning(currentHeight: number): void {
    if (this.lightningLines) {
      this.remove(this.lightningLines);
      this.lightningLines.geometry.dispose();
      (this.lightningLines.material as LineBasicMaterial).dispose();
      this.lightningLines = undefined;
    }

    // Apenas nos primeiros 3.5 segundos ocorrem relâmpagos estáticos da ionização
    if (this.elapsedTime > 3.8) return;

    const segmentsCount = 20;
    const positions = new Float32Array(segmentsCount * 2 * 3);

    const startY = currentHeight * (0.4 + Math.random() * 0.4);
    const startAngle = Math.random() * Math.PI * 2;
    const startRad = this.craterRadius * 0.6;
    let curr = new Vector3(
      Math.cos(startAngle) * startRad,
      startY,
      Math.sin(startAngle) * startRad
    );

    const end = new Vector3(
      curr.x + (Math.random() - 0.5) * 15,
      0,
      curr.z + (Math.random() - 0.5) * 15
    );

    for (let i = 0; i < segmentsCount; i++) {
      const t = (i + 1) / segmentsCount;
      const next = new Vector3().lerpVectors(curr, end, 1.0 / (segmentsCount - i));
      next.x += (Math.random() - 0.5) * 2.8;
      next.z += (Math.random() - 0.5) * 2.8;

      if (i === segmentsCount - 1) next.copy(end);

      const idx = i * 6;
      positions[idx]     = curr.x;
      positions[idx + 1] = curr.y;
      positions[idx + 2] = curr.z;

      positions[idx + 3] = next.x;
      positions[idx + 4] = next.y;
      positions[idx + 5] = next.z;

      curr = next;
    }

    const geo = new BufferGeometry();
    geo.setAttribute('position', new BufferAttribute(positions, 3));
    const mat = new LineBasicMaterial({
      color: 0xaa88ff,
      blending: AdditiveBlending,
      transparent: true,
      opacity: 0.95
    });

    this.lightningLines = new LineSegments(geo, mat);
    this.add(this.lightningLines);
  }

  public update(dtSeconds: number): void {
    if (this.isDisposed) return;

    this.elapsedTime += dtSeconds;
    const progress = Math.min(1.0, this.elapsedTime / this.duration);

    if (progress >= 1.0) {
      this.dispose();
      return;
    }

    // Atualiza uniforms de tempo nos shaders
    this.fireballMat.uniforms.uTime.value = this.elapsedTime;
    this.fireballMat.uniforms.uProgress.value = progress;

    this.stemMat.uniforms.uTime.value = this.elapsedTime;
    this.stemMat.uniforms.uProgress.value = progress;

    this.capDomeMat.uniforms.uTime.value = this.elapsedTime;
    this.capDomeMat.uniforms.uProgress.value = progress;

    // ── Fase 1: Flash & Bola de Fogo Inicial (0.0s a 0.22s) ─────────────────
    const fireballProg = Math.min(1.0, progress / 0.20);
    const fireScale = Math.max(0.1, (this.craterRadius * 1.8) * Math.sin(fireballProg * Math.PI * 0.5));
    this.fireballMesh.scale.set(fireScale, fireScale, fireScale);
    this.fireballMesh.position.set(0, fireScale * 0.65, 0);

    const fireOpacity = fireballProg < 0.25 ? 1.0 : Math.max(0, 1.0 - (fireballProg - 0.25) / 0.75);
    this.fireballMat.uniforms.uOpacity.value = fireOpacity;

    // ── Fase 2: Subida da Haste / Coluna de Fogo e Cinzas ────────────────────
    const riseEase = 1.0 - Math.pow(1.0 - Math.min(1.0, progress / 0.52), 3);
    const currentHeight = Math.max(2.0, this.cloudHeight * riseEase);
    const stemRadius = Math.max(2.0, (this.craterRadius * 0.42) * (0.8 + 0.35 * progress));

    this.stemMesh.scale.set(stemRadius, currentHeight, stemRadius);
    this.stemMesh.position.set(0, currentHeight * 0.5, 0);

    // ── Fase 3: Expansão do Chapéu / Capitel do Cogumelo ─────────────────────
    const capProg = Math.min(1.0, Math.max(0, (progress - 0.10) / 0.65));
    const capEase = 1.0 - Math.pow(1.0 - capProg, 2.5);
    const capRadius = Math.max(1.0, (this.craterRadius * 2.2) * capEase);
    const capHeight = capRadius * 0.52;

    const topY = currentHeight;
    this.capDomeMesh.position.set(0, topY, 0);
    this.capDomeMesh.scale.set(capRadius, capHeight, capRadius);

    // ── Fase 4: Lóbulos Volumétricos de Fumaça em Vórtice Toroidal ──────────
    for (const b of this.billows) {
      b.angle += dtSeconds * b.rotSpeed;
      const r = capRadius * 0.85;
      const bx = Math.cos(b.angle) * r;
      const bz = Math.sin(b.angle) * r;
      const by = topY - capHeight * 0.18 + Math.sin(b.angle * 2.0) * (capHeight * 0.1);

      b.mesh.position.set(bx, by, bz);
      const bScale = capRadius * b.scale;
      b.mesh.scale.set(bScale, bScale * 0.85, bScale);
    }

    // ── Fase 5: Relâmpagos Estáticos Nucleares ───────────────────────────────
    this.lightningTimer += dtSeconds;
    if (this.lightningTimer >= 0.09) {
      this.lightningTimer = 0;
      this.updateNuclearLightning(currentHeight);
    }

    // ── Fase 6: Dupla Onda de Choque de Wilson (Atmosférica) ─────────────────
    const wilsonProg = Math.min(1.0, progress / 0.48);
    const wilsonScale1 = Math.max(1.0, (this.craterRadius * 2.8) * Math.pow(wilsonProg, 0.7));
    this.wilsonRingUpper.position.set(0, currentHeight * 0.72, 0);
    this.wilsonRingUpper.scale.set(wilsonScale1, wilsonScale1, 1.0);
    this.shockMatUpper.opacity = Math.max(0, (1.0 - wilsonProg) * 0.85);

    const wilsonScale2 = Math.max(1.0, (this.craterRadius * 2.4) * Math.pow(Math.max(0, wilsonProg - 0.08), 0.75));
    this.wilsonRingLower.position.set(0, currentHeight * 0.38, 0);
    this.wilsonRingLower.scale.set(wilsonScale2, wilsonScale2, 1.0);
    this.shockMatLower.opacity = Math.max(0, (1.0 - wilsonProg) * 0.75);

    // ── Fase 7: Onda de Choque de Solo (Ground Blast Wave) ───────────────────
    const blastProg = Math.min(1.0, progress / 0.38);
    const blastScale = Math.max(1.0, (this.craterRadius * 4.5) * Math.pow(blastProg, 0.65));
    this.groundShockwave.position.set(0, 0.3, 0);
    this.groundShockwave.scale.set(blastScale, blastScale, 1.0);
    this.groundShockMat.opacity = Math.max(0, (1.0 - blastProg) * 0.95);

    // Fade out suave na etapa final
    const fadeOut = progress > 0.65 ? Math.max(0, 1.0 - (progress - 0.65) / 0.35) : 1.0;
    this.stemMat.uniforms.uOpacity.value = 0.95 * fadeOut;
    this.capDomeMat.uniforms.uOpacity.value = 0.95 * fadeOut;

    // ── Fase 8: Física dos Detritos Voxel Incandescentes ─────────────────────
    for (const d of this.debris) {
      d.velocity.y -= 26.0 * dtSeconds;
      d.mesh.position.addScaledVector(d.velocity, dtSeconds);

      d.mesh.rotation.x += d.angularVelocity.x * dtSeconds;
      d.mesh.rotation.y += d.angularVelocity.y * dtSeconds;
      d.mesh.rotation.z += d.angularVelocity.z * dtSeconds;

      if (progress > 0.7) {
        const shrink = Math.max(0.01, 1.0 - (progress - 0.7) / 0.3);
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

    if (this.lightningLines) {
      this.remove(this.lightningLines);
      this.lightningLines.geometry.dispose();
      (this.lightningLines.material as LineBasicMaterial).dispose();
      this.lightningLines = undefined;
    }

    this.fireballMesh.geometry.dispose();
    this.fireballMat.dispose();

    this.stemMesh.geometry.dispose();
    this.stemMat.dispose();

    this.capDomeMesh.geometry.dispose();
    this.capDomeMat.dispose();

    this.billowGeometry.dispose();

    this.wilsonRingUpper.geometry.dispose();
    this.shockMatUpper.dispose();

    this.wilsonRingLower.geometry.dispose();
    this.shockMatLower.dispose();

    this.groundShockwave.geometry.dispose();
    this.groundShockMat.dispose();

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
