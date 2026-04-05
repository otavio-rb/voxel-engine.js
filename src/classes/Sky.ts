import { DirectionalLight, AmbientLight, Group, Mesh, PlaneGeometry, ShaderMaterial, Vector3, Color, PerspectiveCamera, DoubleSide, SphereGeometry, BackSide, AdditiveBlending } from 'three';

export default class Sky extends Group {
  private sunMaterial!: ShaderMaterial;
  public sunMesh!: Mesh;
  private moonMaterial!: ShaderMaterial;
  private moonMesh!: Mesh;
  private cloudsMaterial!: ShaderMaterial;
  private skyMaterial!: ShaderMaterial;
  private directional!: DirectionalLight;
  public ambient!: AmbientLight;

  private dayTime = Math.PI / 2; // Start at Midday
  private readonly cycleSpeed = 0.05;

  constructor() {
    super();

    this.directional = new DirectionalLight(0xfff4e0, 1.2);
    this.ambient = new AmbientLight(0x87CEEB, 0.6);

    this.initSkyDome();
    this.initSunAndMoon();
    this.initClouds();
    this.add(this.directional, this.ambient);
  }

  private initSkyDome(): void {
    const skyGeom = new SphereGeometry(2000, 32, 32);
    this.skyMaterial = new ShaderMaterial({
      uniforms: {
        uSunHeight: { value: 1.0 },
        uDayColor: { value: new Color(0x87CEEB) },
        uNightColor: { value: new Color(0x050510) },
        uHorizonColor: { value: new Color(0xffa07a) }
      },
      vertexShader: `
        varying vec3 vWorldPosition;
        void main() {
          vec4 worldPosition = modelMatrix * vec4(position, 1.0);
          vWorldPosition = worldPosition.xyz;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform float uSunHeight;
        uniform vec3 uDayColor;
        uniform vec3 uNightColor;
        uniform vec3 uHorizonColor;
        varying vec3 vWorldPosition;

        void main() {
          vec3 viewDir = normalize(vWorldPosition);
          float height = max(0.0, viewDir.y);
          vec3 baseSky = mix(uNightColor, uDayColor, max(0.0, uSunHeight));
          float horizonFactor = pow(1.0 - abs(viewDir.y), 4.0);
          float sunHorizonEffect = pow(max(0.0, 1.0 - abs(uSunHeight)), 2.0);
          vec3 finalColor = mix(baseSky, uHorizonColor, horizonFactor * sunHorizonEffect * 0.8);
          finalColor = mix(finalColor, finalColor * 0.8, height);
          gl_FragColor = vec4(finalColor, 1.0);
        }
      `,
      side: BackSide
    });

    const skyMesh = new Mesh(skyGeom, this.skyMaterial);
    skyMesh.raycast = () => null;
    this.add(skyMesh);
  }

  private initSunAndMoon(): void {
    const sunGeom = new PlaneGeometry(100, 100);
    const moonGeom = new PlaneGeometry(80, 80);

    this.sunMaterial = new ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uColor: { value: new Color(0xfff4e0) } },
      vertexShader: `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: `
        uniform float uTime; uniform vec3 uColor; varying vec2 vUv;
        void main() {
          float dist = distance(vUv, vec2(0.5));
          float glow = pow(1.0 - smoothstep(0.0, 0.5, dist), 2.0);
          float core = 1.0 - smoothstep(0.0, 0.1, dist);
          vec3 finalColor = uColor + core * 2.0 + glow * 1.5;
          finalColor *= 1.0 + sin(uTime * 5.0) * 0.05;
          // Soft alpha for additive blending
          float alpha = smoothstep(0.5, 0.1, dist);
          gl_FragColor = vec4(finalColor * alpha, alpha);
        }
      `,
      transparent: true,
      side: DoubleSide,
      blending: AdditiveBlending,
      depthWrite: false
    });

    this.moonMaterial = new ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uColor: { value: new Color(0xb0c4de) } },
      vertexShader: `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: `
        uniform float uTime; uniform vec3 uColor; varying vec2 vUv;
        void main() {
          float dist = distance(vUv, vec2(0.5));
          float glow = pow(1.0 - smoothstep(0.0, 0.5, dist), 3.0);
          float core = 1.0 - smoothstep(0.0, 0.2, dist);
          vec3 finalColor = uColor + core * 0.8 + glow * 0.5;
          float alpha = smoothstep(0.5, 0.1, dist);
          gl_FragColor = vec4(finalColor * alpha, alpha);
        }
      `,
      transparent: true,
      side: DoubleSide,
      blending: AdditiveBlending,
      depthWrite: false
    });

    this.sunMesh = new Mesh(sunGeom, this.sunMaterial);
    this.moonMesh = new Mesh(moonGeom, this.moonMaterial);
    
    // Higher distance to avoid clipping clouds
    this.add(this.sunMesh, this.moonMesh);
  }

  private initClouds(): void {
    const cloudsGeometry = new PlaneGeometry(10000, 10000);
    this.cloudsMaterial = new ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uColor: { value: new Color(0xffffff) } },
      vertexShader: `varying vec2 vUv; void main() { vUv = uv * 100.0; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: `
        uniform float uTime; uniform vec3 uColor; varying vec2 vUv;
        float hash(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
        float noise(vec2 p) {
            vec2 i = floor(p); vec2 f = fract(p);
            float a = hash(i); float b = hash(i + vec2(1.0, 0.0));
            float c = hash(i + vec2(0.0, 1.0)); float d = hash(i + vec2(1.0, 1.0));
            vec2 u = f * f * (3.0 - 2.0 * f); return mix(a, b, u.x) + (c - a) * u.y * (1.0 - u.x) + (d - b) * u.x * u.y;
        }
        void main() {
          vec2 p = vUv + uTime * 0.02;
          vec2 iPos = floor(p * 2.0) / 2.0;
          float n = noise(iPos);
          float cloudMask = smoothstep(0.6, 0.7, n);
          if (cloudMask < 0.1) discard;
          gl_FragColor = vec4(uColor, cloudMask * 0.6);
        }
      `,
      transparent: true, side: DoubleSide,
      depthWrite: true // Clouds should write depth to avoid weird clipping
    });
    const clouds = new Mesh(cloudsGeometry, this.cloudsMaterial);
    clouds.position.y = 200;
    clouds.rotation.x = -Math.PI / 2;
    this.add(clouds);
  }

  tick(camera: PerspectiveCamera): void {
    this.dayTime += 0.005 * this.cycleSpeed;
    const angle = this.dayTime % (Math.PI * 2);
    
    // Higher distance (1000 instead of 500) to keep them behind clouds (Y=200)
    const dist = 1000;
    this.sunMesh.position.set(Math.cos(angle) * dist, Math.sin(angle) * dist, 0);
    this.moonMesh.position.set(Math.cos(angle + Math.PI) * dist, Math.sin(angle + Math.PI) * dist, 0);
    
    // Keep the sky group centered on the player for the horizon/dome to stay consistent
    this.position.set(camera.position.x, 0, camera.position.z);
    
    const sunHeight = Math.sin(angle);
    const isDay = sunHeight > 0;
    
    this.directional.position.copy(this.sunMesh.position);
    this.directional.intensity = Math.max(0, sunHeight * 1.5);
    
    const daySkyColor = new Color(0x87CEEB);
    const nightSkyColor = new Color(0x050510);
    this.ambient.color.lerpColors(nightSkyColor, daySkyColor, Math.max(0, sunHeight));
    this.ambient.intensity = isDay ? 0.6 : 0.2;

    this.sunMaterial.uniforms.uTime.value += 0.016;
    this.moonMaterial.uniforms.uTime.value += 0.016;
    this.cloudsMaterial.uniforms.uTime.value += 0.016;
    this.skyMaterial.uniforms.uSunHeight.value = sunHeight;
    
    this.sunMesh.lookAt(camera.position);
    this.moonMesh.lookAt(camera.position);

    this.cloudsMaterial.uniforms.uColor.value.lerpColors(new Color(0x333333), new Color(0xffffff), Math.max(0, sunHeight));
  }

  public setTime(phase: string): void {
    switch (phase.toLowerCase()) {
      case 'noon':
      case 'midday':
        this.dayTime = Math.PI / 2;
        break;
      case 'day':
      case 'sunrise':
        this.dayTime = 0;
        break;
      case 'night':
      case 'sunset':
        this.dayTime = Math.PI;
        break;
      case 'midnight':
        this.dayTime = Math.PI * 1.5;
        break;
      default:
        const t = parseFloat(phase);
        if (!isNaN(t)) this.dayTime = t;
    }
  }
}
