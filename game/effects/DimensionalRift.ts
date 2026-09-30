import {
  Group,
  Mesh,
  PlaneGeometry,
  RingGeometry,
  DodecahedronGeometry,
  ShaderMaterial,
  MeshBasicMaterial,
  DoubleSide,
  AdditiveBlending,
  Color,
  Vector3,
  BufferGeometry,
  BufferAttribute,
  PointsMaterial,
  Points
} from 'three';

export interface DimensionalRiftOptions {
  position: Vector3;
  targetDimId?: string;
  portalColor?: number;
}

export class DimensionalRift extends Group {
  // 1. Fenda de Plasma Central
  private fissureMesh: Mesh;
  private fissureMaterial: ShaderMaterial;

  // 2. Disco de Acreção Inclinado
  private accretionMesh: Mesh;
  private accretionMaterial: ShaderMaterial;

  // 3. Halo de Lente Gravitacional (Anel de Einstein)
  private haloMesh: Mesh;
  private haloMaterial: ShaderMaterial;

  // 4. Fragmentos de Realidade Flutuantes
  private shards: Mesh[] = [];
  private shardData: Array<{ radius: number; angle: number; speed: number; y: number; rotSpeed: Vector3 }> = [];

  // 5. Vórtice 3D de Partículas Cósmicas
  private particles: Points;
  private particlePositions: Float32Array;
  private particleData: Array<{ angle: number; radius: number; speed: number; y: number; zOffset: number }>;
  private particleCount = 240;

  // 6. Pulso de Onda de Choque Dimensional
  private pulseWaveMesh: Mesh;
  private pulseProgress = 0;

  private elapsedTime = 0;
  public suctionIntensity = 0.0;
  public isDisposed = false;
  public readonly targetDimId: string;
  public readonly basePosition: Vector3;

  constructor(options: DimensionalRiftOptions) {
    super();
    this.basePosition = options.position.clone();
    this.position.copy(options.position);
    this.targetDimId = options.targetDimId ?? 'nether';

    const baseColor = new Color(options.portalColor ?? 0x9c27b0);
    const hotColor = baseColor.clone().offsetHSL(0.06, 0.3, 0.35);
    const darkColor = baseColor.clone().offsetHSL(-0.04, 0.1, -0.45);

    // ── 1. Fenda Central: Rasgo de Plasma Dimensional ─────────────────────────
    const fissureGeo = new PlaneGeometry(2.4, 4.4, 48, 48);

    this.fissureMaterial = new ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uSuction: { value: 0 },
        uCoreColor: { value: new Color(0x020005) },
        uEdgeColor: { value: hotColor },
        uCoronaColor: { value: baseColor },
        uDarkColor: { value: darkColor }
      },
      vertexShader: `
        varying vec2 vUv;
        varying vec3 vWorldPosition;
        uniform float uTime;
        uniform float uSuction;

        void main() {
          vUv = uv;
          vec3 pos = position;

          // Deformação ondulante da fenda no espaço tridimensional
          float waveX = sin(pos.y * 3.5 - uTime * 5.0);
          float waveY = cos(pos.x * 5.0 + uTime * 4.0);
          pos.z += (waveX * waveY) * (0.15 + uSuction * 0.35);

          // Efeito de sucção elástica: fenda se estica em direção ao observador
          pos.z += sin(length(pos.xy) * 4.0 - uTime * 6.0) * (0.05 + uSuction * 0.2);

          vWorldPosition = (modelMatrix * vec4(pos, 1.0)).xyz;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
        }
      `,
      fragmentShader: `
        uniform float uTime;
        uniform float uSuction;
        uniform vec3 uCoreColor;
        uniform vec3 uEdgeColor;
        uniform vec3 uCoronaColor;
        uniform vec3 uDarkColor;
        varying vec2 vUv;

        float hash(vec2 p) {
          return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
        }

        float noise(vec2 p) {
          vec2 i = floor(p);
          vec2 f = fract(p);
          vec2 u = f * f * (3.0 - 2.0 * f);
          return mix(
            mix(hash(i + vec2(0.0, 0.0)), hash(i + vec2(1.0, 0.0)), u.x),
            mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x),
            u.y
          );
        }

        float fbm(vec2 p) {
          float v = 0.0;
          v += 0.500 * noise(p); p *= 2.02;
          v += 0.250 * noise(p); p *= 2.03;
          v += 0.125 * noise(p);
          return v;
        }

        void main() {
          vec2 coord = (vUv - 0.5) * 2.0;
          coord.y *= 1.6; // Proporção da fenda vertical
          float dist = length(coord);

          // Vórtice angular espiral
          float angle = atan(coord.y, coord.x);
          float swirlSpeed = 4.0 + uSuction * 14.0;
          float spiral = angle + (4.0 + uSuction * 5.0) / (dist + 0.1) - uTime * swirlSpeed;

          // Costura do rasgo dimensional (raio fractal com arcos elétricos)
          float slitOffset = fbm(vec2(coord.y * 3.5, uTime * 2.5) + spiral * 0.35);
          float slit = abs(coord.x + (slitOffset - 0.5) * 0.55);

          // Centelhas e filamentos de alta energia
          float arcs = pow(max(0.0, 1.0 - slit * 6.0), 4.0) * (0.8 + 0.2 * sin(uTime * 25.0 + coord.y * 20.0));

          // Singularidade do horizonte de eventos (núcleo abismal)
          float eventHorizon = smoothstep(0.12, 0.45 + uSuction * 0.2, dist);

          // Camada cromática
          vec3 col = mix(uCoreColor, uDarkColor, eventHorizon);
          col = mix(col, uCoronaColor, pow(max(0.0, 1.0 - dist), 2.0));
          col += uEdgeColor * arcs * 3.5;
          col += uCoronaColor * pow(max(0.0, 1.0 - slit * 3.0), 2.5) * 1.8;

          // Pulsação e brilho
          float pulse = 0.88 + 0.12 * sin(uTime * 8.0);
          col *= pulse * (1.0 + uSuction * 1.5);

          // Alpha com desvanecimento suave nas bordas
          float edgeFade = 1.0 - smoothstep(0.7, 1.05, max(abs(coord.x * 1.2), abs(coord.y * 0.65)));
          float alpha = clamp(edgeFade * (0.85 + uSuction * 0.15), 0.0, 1.0);

          gl_FragColor = vec4(col, alpha);
        }
      `,
      side: DoubleSide,
      transparent: true,
      blending: AdditiveBlending,
      depthWrite: false
    });

    this.fissureMesh = new Mesh(fissureGeo, this.fissureMaterial);
    this.add(this.fissureMesh);

    // ── 2. Disco de Acreção Espiral Inclinado ──────────────────────────────────
    const accretionGeo = new RingGeometry(0.8, 2.8, 48, 8);
    this.accretionMaterial = new ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uColor: { value: hotColor },
        uCorona: { value: baseColor }
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
        uniform vec3 uCorona;
        varying vec2 vUv;

        void main() {
          vec2 coord = (vUv - 0.5) * 2.0;
          float dist = length(coord);
          if (dist < 0.28 || dist > 0.98) discard;

          float angle = atan(coord.y, coord.x);
          float spiral = angle + 4.0 / (dist + 0.08) - uTime * 4.0;
          float arms = sin(spiral * 4.0) * 0.5 + 0.5;

          vec3 col = mix(uCorona, uColor, smoothstep(0.3, 0.8, dist)) + arms * uColor * 0.8;
          float alpha = smoothstep(0.28, 0.45, dist) * (1.0 - smoothstep(0.85, 0.98, dist)) * 0.65;
          gl_FragColor = vec4(col, alpha);
        }
      `,
      side: DoubleSide,
      transparent: true,
      blending: AdditiveBlending,
      depthWrite: false
    });

    this.accretionMesh = new Mesh(accretionGeo, this.accretionMaterial);
    this.accretionMesh.rotation.x = Math.PI * 0.38;
    this.accretionMesh.rotation.y = Math.PI * 0.15;
    this.add(this.accretionMesh);

    // ── 3. Anel de Halo Gravitacional (Gravitational Lensing) ──────────────────
    const haloGeo = new RingGeometry(1.6, 2.3, 48);
    this.haloMaterial = new ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uColor: { value: hotColor }
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
          vec2 coord = (vUv - 0.5) * 2.0;
          float dist = length(coord);
          float ring = smoothstep(0.65, 0.82, dist) * (1.0 - smoothstep(0.85, 0.98, dist));
          float pulse = 0.8 + 0.2 * sin(uTime * 6.0);
          gl_FragColor = vec4(uColor * 2.0, ring * pulse * 0.5);
        }
      `,
      side: DoubleSide,
      transparent: true,
      blending: AdditiveBlending,
      depthWrite: false
    });

    this.haloMesh = new Mesh(haloGeo, this.haloMaterial);
    this.add(this.haloMesh);

    // ── 4. Fragmentos e Lascas de Espaço-Tempo Orbitando ───────────────────────
    const shardGeo = new DodecahedronGeometry(0.12, 0);
    const shardMat = new MeshBasicMaterial({
      color: 0x110822,
      wireframe: false
    });

    for (let i = 0; i < 8; i++) {
      const shard = new Mesh(shardGeo, shardMat);
      const radius = 1.4 + Math.random() * 0.9;
      const angle = (i / 8) * Math.PI * 2;
      const speed = 1.0 + Math.random() * 1.5;
      const y = (Math.random() - 0.5) * 2.2;
      const rotSpeed = new Vector3(
        (Math.random() - 0.5) * 4,
        (Math.random() - 0.5) * 4,
        (Math.random() - 0.5) * 4
      );

      this.shardData.push({ radius, angle, speed, y, rotSpeed });
      this.shards.push(shard);
      this.add(shard);
    }

    // ── 5. Vórtice 3D de Partículas Cósmicas ──────────────────────────────────
    const particleGeo = new BufferGeometry();
    this.particlePositions = new Float32Array(this.particleCount * 3);
    this.particleData = [];

    for (let i = 0; i < this.particleCount; i++) {
      const angle = Math.random() * Math.PI * 2;
      const radius = 0.4 + Math.random() * 2.2;
      const speed = 2.0 + Math.random() * 4.0;
      const y = (Math.random() - 0.5) * 3.6;
      const zOffset = (Math.random() - 0.5) * 1.4;

      this.particleData.push({ angle, radius, speed, y, zOffset });

      this.particlePositions[i * 3]     = Math.cos(angle) * radius;
      this.particlePositions[i * 3 + 1] = y;
      this.particlePositions[i * 3 + 2] = Math.sin(angle) * radius * 0.35 + zOffset;
    }

    particleGeo.setAttribute('position', new BufferAttribute(this.particlePositions, 3));
    const particleMat = new PointsMaterial({
      color: hotColor,
      size: 0.22,
      transparent: true,
      blending: AdditiveBlending,
      depthWrite: false
    });

    this.particles = new Points(particleGeo, particleMat);
    this.add(this.particles);

    // ── 6. Onda de Pulso Dimensional ──────────────────────────────────────────
    const pulseGeo = new RingGeometry(0.1, 0.4, 32);
    const pulseMat = new MeshBasicMaterial({
      color: hotColor,
      side: DoubleSide,
      transparent: true,
      blending: AdditiveBlending,
      opacity: 0.8
    });
    this.pulseWaveMesh = new Mesh(pulseGeo, pulseMat);
    this.add(this.pulseWaveMesh);
  }

  public update(dtSeconds: number): void {
    if (this.isDisposed) return;
    this.elapsedTime += dtSeconds;

    // Levitação suave do portal flutuante
    this.position.y = this.basePosition.y + Math.sin(this.elapsedTime * 2.0) * 0.12;

    // Atualiza Shaders
    this.fissureMaterial.uniforms.uTime.value = this.elapsedTime;
    this.fissureMaterial.uniforms.uSuction.value = this.suctionIntensity;

    this.accretionMaterial.uniforms.uTime.value = this.elapsedTime;
    this.accretionMesh.rotation.z += dtSeconds * (1.2 + this.suctionIntensity * 3.0);

    this.haloMaterial.uniforms.uTime.value = this.elapsedTime;

    // ── Atualiza Fragmentos Orbitais ─────────────────────────────────────────
    for (let i = 0; i < this.shards.length; i++) {
      const s = this.shards[i];
      const data = this.shardData[i];
      data.angle += data.speed * dtSeconds * (1.0 + this.suctionIntensity * 2.0);

      s.position.x = Math.cos(data.angle) * data.radius;
      s.position.y = data.y + Math.sin(this.elapsedTime * 3.0 + i) * 0.18;
      s.position.z = Math.sin(data.angle) * (data.radius * 0.6);

      s.rotation.x += data.rotSpeed.x * dtSeconds;
      s.rotation.y += data.rotSpeed.y * dtSeconds;
      s.rotation.z += data.rotSpeed.z * dtSeconds;
    }

    // ── Atualiza Partículas Infalling ─────────────────────────────────────────
    const posAttr = this.particles.geometry.getAttribute('position') as BufferAttribute;
    const array = posAttr.array as Float32Array;
    const speedMult = 1.0 + this.suctionIntensity * 4.0;

    for (let i = 0; i < this.particleCount; i++) {
      const p = this.particleData[i];

      p.angle += (p.speed / Math.max(0.4, p.radius)) * dtSeconds * speedMult;
      const pull = (0.9 + this.suctionIntensity * 3.5) * dtSeconds;
      p.radius -= pull;
      p.y += (0 - p.y) * 1.8 * dtSeconds; // Converge para a fenda

      if (p.radius <= 0.06) {
        p.radius = 1.6 + Math.random() * 1.0;
        p.angle = Math.random() * Math.PI * 2;
        p.y = (Math.random() - 0.5) * 3.2;
      }

      array[i * 3]     = Math.cos(p.angle) * p.radius;
      array[i * 3 + 1] = p.y;
      array[i * 3 + 2] = Math.sin(p.angle) * (p.radius * 0.4) + p.zOffset * (p.radius / 2.0);
    }
    posAttr.needsUpdate = true;

    // ── Atualiza Pulso Dimensional Expansivo ─────────────────────────────────
    this.pulseProgress += dtSeconds * 0.7;
    if (this.pulseProgress >= 1.0) {
      this.pulseProgress = 0;
    }
    const pulseScale = 0.5 + this.pulseProgress * 5.0;
    this.pulseWaveMesh.scale.set(pulseScale, pulseScale, 1.0);
    (this.pulseWaveMesh.material as MeshBasicMaterial).opacity = Math.max(0, (1.0 - this.pulseProgress) * 0.75);
  }

  public dispose(): void {
    if (this.isDisposed) return;
    this.isDisposed = true;

    if (this.parent) {
      this.parent.remove(this);
    }

    this.fissureMesh.geometry.dispose();
    this.fissureMaterial.dispose();

    this.accretionMesh.geometry.dispose();
    this.accretionMaterial.dispose();

    this.haloMesh.geometry.dispose();
    this.haloMaterial.dispose();

    for (const s of this.shards) {
      s.geometry.dispose();
      (s.material as MeshBasicMaterial).dispose();
    }
    this.shards = [];

    this.particles.geometry.dispose();
    (this.particles.material as PointsMaterial).dispose();

    this.pulseWaveMesh.geometry.dispose();
    (this.pulseWaveMesh.material as MeshBasicMaterial).dispose();
  }
}
