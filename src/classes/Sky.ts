import { DirectionalLight, AmbientLight, Group, Mesh, PlaneGeometry, ShaderMaterial, Vector3, Color, PerspectiveCamera, DoubleSide, SphereGeometry, BackSide, AdditiveBlending, BufferGeometry, BufferAttribute, PointsMaterial, Points } from 'three';
import { WorldType } from '../types';
import { DimensionDefinition } from '../core/dimension/Dimension';
import { dimensionRegistry } from '../core/dimension/DimensionRegistry';

export default class Sky extends Group {
  private sunMaterial!: ShaderMaterial;
  public sunMesh!: Mesh;
  private moonMaterial!: ShaderMaterial;
  private moonMesh!: Mesh;
  private cloudsMaterial!: ShaderMaterial;
  private skyMaterial!: ShaderMaterial;
  public directional!: DirectionalLight;
  public ambient!: AmbientLight;
  public worldType: WorldType = WorldType.Standard;
  public activeDimension: DimensionDefinition = dimensionRegistry.get('overworld')!;

  public dayTime = Math.PI / 2; // Start at Midday
  private readonly cycleSpeed = 0.02;

  constructor() {
    super();

    this.directional = new DirectionalLight(0xfff4e0, 1.2);
    this.ambient = new AmbientLight(0x87CEEB, 0.6);

    this.initSkyDome();
    this.initSunAndMoon();
    this.initClouds();
    this.add(this.directional, this.ambient);
  }

  public setDimension(dim: DimensionDefinition): void {
    this.activeDimension = dim;
    this.worldType = (dim.generatorId as WorldType) ?? WorldType.Standard;
  }

  public setWorldType(type: WorldType): void {
    this.worldType = type;
    const found = dimensionRegistry.get(type.toLowerCase());
    if (found) {
      this.activeDimension = found;
    }
  }

  private initSkyDome(): void {
    const skyGeom = new SphereGeometry(2000, 32, 32);
    this.skyMaterial = new ShaderMaterial({
      uniforms: {
        uSunHeight: { value: 1.0 },
        uDayColor: { value: new Color(0x87CEEB) },
        uNightColor: { value: new Color(0x050510) },
        uHorizonColor: { value: new Color(0xffa07a) },
        uTime: { value: 0 },
        uIsSpace: { value: 0.0 }
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
        uniform float uTime;
        uniform float uIsSpace;
        varying vec3 vWorldPosition;

        float hash(vec3 p) {
            p = fract(p * 0.3183099 + .1);
            p *= 17.0;
            return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
        }

        void main() {
          vec3 viewDir = normalize(vWorldPosition);
          float height = max(0.0, viewDir.y);
          vec3 baseSky = mix(uNightColor, uDayColor, max(0.0, uSunHeight));
          float horizonFactor = pow(1.0 - abs(viewDir.y), 4.0);
          float sunHorizonEffect = pow(max(0.0, 1.0 - abs(uSunHeight)), 2.0);
          vec3 finalColor = mix(baseSky, uHorizonColor, horizonFactor * sunHorizonEffect * 0.8);
          finalColor = mix(finalColor, finalColor * 0.8, height);

          // Starfield (Procedural)
          float h = hash(floor(viewDir * 250.0));
          float star = smoothstep(0.992, 1.0, h);
          vec3 stars = vec3(star) * (0.8 + 0.2 * sin(uTime * 2.0 + h * 100.0));
          
          finalColor += stars * uIsSpace;

          gl_FragColor = vec4(finalColor, 1.0);
        }
      `,
      side: BackSide
    });

    const skyMesh = new Mesh(skyGeom, this.skyMaterial);
    skyMesh.raycast = () => null;
    skyMesh.renderOrder = -1; // Draw behind everything
    this.add(skyMesh);
  }


  private initSunAndMoon(): void {
    const sunGeom = new PlaneGeometry(80, 80);
    const moonGeom = new PlaneGeometry(60, 60);

    this.sunMaterial = new ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uColor: { value: new Color(0xfff4e0) } },
      vertexShader: `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: `
        uniform float uTime; uniform vec3 uColor; varying vec2 vUv;
        
        float hash(vec2 p) {
            return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
        }

        void main() {
          // Square sun check
          float square = step(0.05, vUv.x) * step(0.05, 1.0 - vUv.x) * step(0.05, vUv.y) * step(0.05, 1.0 - vUv.y);
          if (square < 0.5) discard;
          
          // Border check
          float border = 0.0;
          if (vUv.x < 0.15 || vUv.x > 0.85 || vUv.y < 0.15 || vUv.y > 0.85) {
            border = 1.0;
          }

          vec3 yellow = vec3(1.0, 0.9, 0.2);
          vec3 orange = vec3(1.0, 0.5, 0.0);
          
          vec3 finalColor = mix(yellow, orange, border);
          
          // Scintillation effect
          float sparkle = hash(vUv + floor(uTime * 10.0));
          if (sparkle > 0.9) {
            finalColor += 2.0 * (sparkle - 0.9);
          }

          finalColor *= 2.0; 
          gl_FragColor = vec4(finalColor, 1.0);
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
          // Square moon
          float square = step(0.1, vUv.x) * step(0.1, 1.0 - vUv.x) * step(0.1, vUv.y) * step(0.1, 1.0 - vUv.y);
          if (square < 0.5) discard;
          
          vec3 finalColor = uColor * 1.5;
          gl_FragColor = vec4(finalColor, 1.0);
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

  tick(camera: PerspectiveCamera, delta: number = 16.6667): void {
    const atm = this.activeDimension.atmosphere;
    const dtScale = delta / (1000 / 60);

    if (atm.hasDayNightCycle) {
      this.dayTime += 0.005 * this.cycleSpeed * dtScale;
    }
    const angle = this.dayTime % (Math.PI * 2);
    
    // Higher distance (1000 instead of 500) to keep them behind clouds (Y=200)
    const dist = 1000;
    const sunScale = atm.sunScale ?? 1.5;
    this.sunMesh.scale.set(sunScale, sunScale, sunScale);
    
    this.sunMesh.position.set(Math.cos(angle) * dist, Math.sin(angle) * dist, 0);
    this.moonMesh.position.set(Math.cos(angle + Math.PI) * dist, Math.sin(angle + Math.PI) * dist, 0);
    
    // Keep the sky group centered on the player for the horizon/dome to stay consistent
    this.position.set(camera.position.x, 0, camera.position.z);
    
    const sunHeight = Math.sin(angle);
    const isDay = sunHeight > 0;
    
    this.directional.position.copy(this.sunMesh.position);
    this.directional.intensity = atm.hasSun ? Math.max(0, sunHeight * 1.5) : 0;
    
    const daySkyColor = new Color(atm.daySkyColor);
    const nightSkyColor = new Color(atm.nightSkyColor);
    const horizonColor = new Color(atm.horizonColor);
    const ambientDay = new Color(atm.ambientDayColor);
    const ambientNight = new Color(atm.ambientNightColor);
    const minAmbient = atm.ambientIntensity ?? 0.6;
    const cloudVisible = atm.hasClouds ? 0.6 : 0.0;
    const starsVisible = atm.starsVisible !== undefined ? atm.starsVisible : Math.max(0, -sunHeight);

    this.ambient.color.lerpColors(ambientNight, ambientDay, Math.max(0, sunHeight));
    this.ambient.intensity = isDay ? (atm.ambientIntensity ?? 0.7) : minAmbient;
    this.sunMesh.visible = atm.hasSun;
    this.moonMesh.visible = atm.hasMoon;

    this.sunMaterial.uniforms.uTime.value += 0.016 * dtScale;
    this.moonMaterial.uniforms.uTime.value += 0.016 * dtScale;
    this.cloudsMaterial.uniforms.uTime.value += 0.016 * dtScale;
    
    this.skyMaterial.uniforms.uTime.value += 0.01 * dtScale;
    this.skyMaterial.uniforms.uIsSpace.value = starsVisible;

    this.skyMaterial.uniforms.uSunHeight.value = atm.hasDayNightCycle ? sunHeight : 1.0;
    this.skyMaterial.uniforms.uDayColor.value.copy(daySkyColor);
    this.skyMaterial.uniforms.uNightColor.value.copy(nightSkyColor);
    this.skyMaterial.uniforms.uHorizonColor.value.copy(horizonColor);
    
    this.sunMesh.lookAt(camera.position);
    this.moonMesh.lookAt(camera.position);

    const cloudColor = new Color(atm.cloudColor ?? 0xffffff);
    this.cloudsMaterial.uniforms.uColor.value.lerpColors(new Color(0x333333).multiply(cloudColor), cloudColor, Math.max(0, sunHeight));
    this.cloudsMaterial.visible = cloudVisible > 0.01;
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
