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
  Points,
  Quaternion,
  Camera
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
  private readonly parentQuat = new Quaternion();

  constructor(options: DimensionalRiftOptions) {
    super();
    this.basePosition = options.position.clone();
    this.position.copy(options.position);
    this.targetDimId = options.targetDimId ?? 'nether';

    const baseColor = new Color(options.portalColor ?? 0x9c27b0);
    const hotColor = baseColor.clone().offsetHSL(0.06, 0.3, 0.35);
    const darkColor = baseColor.clone().offsetHSL(-0.04, 0.1, -0.45);

    // ── 1. Fenda Central: Rasgo de Plasma Dimensional ─────────────────────────
    const fissureGeo = new PlaneGeometry(2.4, 4.4, 24, 24);

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

        // Ruído de valor que repete a cada 8 células em x (sem costura onde o ângulo dá a volta)
        float noise(vec2 p) {
          vec2 i = floor(p);
          vec2 f = fract(p);
          vec2 u = f * f * (3.0 - 2.0 * f);
          float x0 = mod(i.x, 8.0), x1 = mod(i.x + 1.0, 8.0);
          return mix(mix(hash(vec2(x0, i.y)), hash(vec2(x1, i.y)), u.x),
                     mix(hash(vec2(x0, i.y + 1.0)), hash(vec2(x1, i.y + 1.0)), u.x), u.y);
        }

        void main() {
          vec2 coord = (vUv - 0.5) * 2.0;
          coord.y *= 1.6; // Proporção da fenda vertical

          // ── Contorno do rasgo: lente vertical com bordas onduladas que se abre com a sucção ──
          float open = 0.42 + uSuction * 0.38;
          float wobble = sin(coord.y * 7.0 + uTime * 3.1) * 0.06 + sin(coord.y * 13.0 - uTime * 4.3) * 0.03;
          float halfWidth = open * sqrt(max(0.0, 1.0 - pow(coord.y / 1.45, 2.0)));
          float edgeDist = abs(coord.x + wobble * (1.0 - uSuction * 0.5)) - halfWidth;
          // Longe do rasgo não há nada para desenhar: sai antes do túnel
          if (edgeDist > 0.8) discard;
          float inside = 1.0 - smoothstep(-0.03, 0.03, edgeDist);

          vec2 tc = vec2(coord.x / max(open, 0.01), coord.y / 1.45);
          float angle = atan(tc.y, tc.x);
          vec3 col = vec3(0.0);

          // ── Túnel para a outra dimensão: coordenadas polares com profundidade 1/r ──
          if (inside > 0.001) {
            float r = length(tc) + 1e-3;
            float depth = 0.45 / r + uTime * (1.2 + uSuction * 7.0);
            vec2 tunnelUv = vec2((angle + depth * (0.35 + uSuction * 0.6)) * 1.2732, depth * 1.6); // 4/pi: 8 faixas
            float walls = noise(tunnelUv) * 0.7 + 0.3 * (0.5 + 0.5 * sin(tunnelUv.x * 1.5708 + depth * 2.0));
            float bands = pow(0.5 + 0.5 * sin(depth * 9.42 + walls * 4.0), 3.0);
            float stars = step(0.985, hash(floor(tunnelUv * vec2(6.0, 6.0))));

            vec3 tunnel = mix(uDarkColor, uCoronaColor, walls) + uEdgeColor * bands * 0.9 + vec3(stars * 0.8);
            // Fundo do túnel: singularidade escura; paredes clareiam perto da borda
            tunnel *= smoothstep(0.05, 0.6, r) * (0.6 + 0.4 * r);
            tunnel = mix(tunnel, uCoreColor, smoothstep(0.35, 0.0, r) * (1.0 - uSuction * 0.4));
            col = tunnel * inside;
          }

          // ── Borda incandescente com arcos elétricos ──
          float rim = exp(-abs(edgeDist) * 28.0);
          float arcs = pow(noise(vec2(angle * 2.546 + uTime * 3.0, coord.y * 9.0 - uTime * 6.0)), 3.0);
          col += (uEdgeColor * (0.9 + arcs * 1.8) + vec3(0.4) * pow(rim, 4.0)) * rim;

          // Coroa externa esmaecendo no espaço ao redor
          float corona = exp(-max(edgeDist, 0.0) * 5.0) * (1.0 - inside);
          col += uCoronaColor * corona * 0.6;

          col *= (0.9 + 0.1 * sin(uTime * 8.0)) * (1.0 + uSuction * 0.8);

          float edgeFade = 1.0 - smoothstep(0.75, 1.0, max(abs(vUv.x - 0.5), abs(vUv.y - 0.5)) * 2.0);
          float alpha = max(inside, max(rim, corona * 0.7)) * edgeFade;

          gl_FragColor = vec4(col, clamp(alpha, 0.0, 1.0));
        }
      `,
      side: DoubleSide,
      transparent: true,
      depthWrite: false
    });

    this.fissureMesh = new Mesh(fissureGeo, this.fissureMaterial);
    this.fissureMesh.onBeforeRender = (_r, _s, camera) => this.faceCamera(this.fissureMesh, camera);
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
    this.haloMesh.onBeforeRender = (_r, _s, camera) => this.faceCamera(this.haloMesh, camera);
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

  /** Billboards a child so the portal opening always faces the viewer (matches the screen-space lens). */
  private faceCamera(mesh: Mesh, camera: Camera): void {
    this.getWorldQuaternion(this.parentQuat).invert();
    mesh.quaternion.copy(this.parentQuat).multiply(camera.quaternion);
    mesh.updateMatrixWorld();
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
