import { DirectionalLight, AmbientLight, Group, Mesh, PlaneGeometry, ShaderMaterial, Vector3, Color, PerspectiveCamera, DoubleSide, SphereGeometry, BackSide, AdditiveBlending, BufferGeometry, BufferAttribute, PointsMaterial, Points } from 'three';
import { DimensionDefinition, DEFAULT_DIMENSION } from '../dimension/Dimension';

export default class Sky extends Group {
  private sunMaterial!: ShaderMaterial;
  public sunMesh!: Mesh;
  private moonMaterial!: ShaderMaterial;
  private moonMesh!: Mesh;
  private cloudsMaterial!: ShaderMaterial;
  private skyMaterial!: ShaderMaterial;
  public directional!: DirectionalLight;
  public ambient!: AmbientLight;
  public activeDimension: DimensionDefinition = DEFAULT_DIMENSION;

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
    this.sunMesh.renderOrder = 0;
    this.moonMesh.renderOrder = 0;
    
    this.add(this.sunMesh, this.moonMesh);
  }

  public weatherDaylightFactor = 1.0;
  public weatherCloudDensity = 0.0;
  public weatherCloudColor: Color | null = null;
  public weatherSkyColor: Color | null = null;
  public weatherLightningFlash = 0.0;

  private initClouds(): void {
    // Full atmospheric sphere proxy centered on camera
    const cloudsGeometry = new SphereGeometry(1800, 48, 32);

    this.cloudsMaterial = new ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uSunDirection: { value: new Vector3(0, 1, 0) },
        uSunColor: { value: new Color(0xfffaed) },
        uAmbientColor: { value: new Color(0x87ceeb) },
        uCloudBaseColor: { value: new Color(0xffffff) },
        uDensity: { value: 0.0 },
        uFlash: { value: 0.0 },
        uSunHeight: { value: 1.0 }
      },
      vertexShader: `
        varying vec3 vWorldPos;

        void main() {
          vec4 wp = modelMatrix * vec4(position, 1.0);
          vWorldPos = wp.xyz;
          gl_Position = projectionMatrix * viewMatrix * wp;
        }
      `,
      fragmentShader: `
        uniform float uTime;
        uniform vec3 uSunDirection;
        uniform vec3 uSunColor;
        uniform vec3 uAmbientColor;
        uniform vec3 uCloudBaseColor;
        uniform float uDensity;
        uniform float uFlash;
        uniform float uSunHeight;
        varying vec3 vWorldPos;

        // ── Fast, robust procedural hash with no origin singularity ──
        float hash2D(vec2 p) {
          vec2 q = p + vec2(17.3, 31.7);
          return fract(sin(dot(q, vec2(127.1, 311.7))) * 43758.5453123);
        }

        float noise2D(vec2 p) {
          vec2 i = floor(p);
          vec2 f = fract(p);
          vec2 u = f * f * (3.0 - 2.0 * f);
          float a = hash2D(i);
          float b = hash2D(i + vec2(1.0, 0.0));
          float c = hash2D(i + vec2(0.0, 1.0));
          float d = hash2D(i + vec2(1.0, 1.0));
          return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
        }

        float hash3D(vec3 p) {
          vec3 q = p + vec3(17.3, 31.7, 73.1);
          return fract(sin(dot(q, vec3(127.1, 311.7, 74.7))) * 43758.5453123);
        }

        float noise3D(vec3 p) {
          vec3 i = floor(p);
          vec3 f = fract(p);
          vec3 u = f * f * (3.0 - 2.0 * f);
          
          float a0 = hash3D(i + vec3(0.0, 0.0, 0.0));
          float a1 = hash3D(i + vec3(1.0, 0.0, 0.0));
          float a2 = hash3D(i + vec3(0.0, 1.0, 0.0));
          float a3 = hash3D(i + vec3(1.0, 1.0, 0.0));
          float b0 = hash3D(i + vec3(0.0, 0.0, 1.0));
          float b1 = hash3D(i + vec3(1.0, 0.0, 1.0));
          float b2 = hash3D(i + vec3(0.0, 1.0, 1.0));
          float b3 = hash3D(i + vec3(1.0, 1.0, 1.0));
          
          return mix(
            mix(mix(a0, a1, u.x), mix(a2, a3, u.x), u.y),
            mix(mix(b0, b1, u.x), mix(b2, b3, u.x), u.y),
            u.z
          );
        }

        // ── 3D Volumetric Cloud Density with balanced realistic proportion ──
        float getCloudDensity(vec3 p, vec3 wind, float h) {
          // Height profile: flat lifting condensation base, billowy mid-section, wispy top
          float heightGrad = smoothstep(0.0, 0.15, h) * smoothstep(1.0, 0.70, h);

          // Macro cloud cluster coverage (~500 block clusters)
          vec2 pXZ = (p.xz + wind.xz * 0.3) * 0.0020;
          float macroCov = noise2D(pXZ) * 0.7 + noise2D(pXZ * 2.5) * 0.3;

          // Balanced proportion: ~40% cloud coverage on clear days, leaving beautiful open blue sky
          float covThreshold = mix(0.42, 0.12, clamp(uDensity, 0.0, 1.0));
          float cov = smoothstep(covThreshold, covThreshold + 0.22, macroCov);
          if (cov <= 0.001) return 0.0;

          // 3D Billow Structure: Cumulus puff lobes (~80-120 blocks)
          vec3 p3D = (p + wind) * 0.007;
          float b1 = 1.0 - abs(noise3D(p3D) * 2.0 - 1.0);
          float b2 = 1.0 - abs(noise3D(p3D * 2.2) * 2.0 - 1.0);
          float billows = b1 * 0.65 + b2 * 0.35;

          // Well-defined cloud bodies with clear margins
          float baseShape = (billows * 1.2 - 0.2) * heightGrad * cov;
          if (baseShape <= 0.005) return 0.0;

          // Fluffy surface edge erosion
          float detail = noise3D(p3D * 3.5);
          float density = baseShape - detail * 0.15 * (1.0 - heightGrad * 0.5);
          density = max(0.0, density);

          return density * (2.2 + uDensity * 2.2);
        }

        // Fast density evaluation for secondary light-marching
        float getFastDensity(vec3 p, vec3 wind, float h) {
          float heightGrad = smoothstep(0.0, 0.15, h) * smoothstep(1.0, 0.70, h);
          vec2 pXZ = (p.xz + wind.xz * 0.3) * 0.0020;
          float macroCov = noise2D(pXZ) * 0.7 + noise2D(pXZ * 2.5) * 0.3;
          float covThreshold = mix(0.42, 0.12, clamp(uDensity, 0.0, 1.0));
          float cov = smoothstep(covThreshold, covThreshold + 0.22, macroCov);
          if (cov <= 0.001) return 0.0;

          vec3 p3D = (p + wind) * 0.007;
          float b1 = 1.0 - abs(noise3D(p3D) * 2.0 - 1.0);
          return max(0.0, (b1 * 1.2 - 0.2) * heightGrad * cov) * (2.2 + uDensity * 2.2);
        }

        void main() {
          vec3 rayDir = normalize(vWorldPos - cameraPosition);
          if (rayDir.y <= 0.001) discard;

          float CLOUD_BOTTOM = 140.0;
          float CLOUD_TOP = 300.0;

          float t0 = (CLOUD_BOTTOM - cameraPosition.y) / rayDir.y;
          float t1 = (CLOUD_TOP - cameraPosition.y) / rayDir.y;
          float tEnter = max(0.0, min(t0, t1));
          float tExit = max(0.0, max(t0, t1));

          // Allow ray to march all the way across the visible sky
          float marchDist = min(tExit - tEnter, 3200.0);
          if (marchDist <= 1.0) discard;

          const int STEPS = 24;
          float stepSize = marchDist / float(STEPS);

          // Interleaved gradient noise for smooth jitter with zero noise banding
          float jitter = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
          float t = tEnter + jitter * stepSize;

          // Natural wind breeze drift speed
          vec3 wind = vec3(uTime * 3.5, 0.0, uTime * 1.8);
          vec3 sunDir = normalize(uSunDirection);

          vec3 accumColor = vec3(0.0);
          float transmittance = 1.0;

          for (int i = 0; i < STEPS; i++) {
            vec3 p = cameraPosition + rayDir * t;
            float h = clamp((p.y - CLOUD_BOTTOM) / (CLOUD_TOP - CLOUD_BOTTOM), 0.0, 1.0);

            float density = getCloudDensity(p, wind, h);
            if (density > 0.006) {
              // 3 secondary light steps towards sun
              float shadowDensity = 0.0;
              float lStep = 22.0;
              for (int j = 1; j <= 3; j++) {
                vec3 lPos = p + sunDir * (float(j) * lStep);
                float lh = clamp((lPos.y - CLOUD_BOTTOM) / (CLOUD_TOP - CLOUD_BOTTOM), 0.0, 1.0);
                if (lh > 0.0 && lh < 1.0) {
                  shadowDensity += getFastDensity(lPos, wind, lh);
                }
              }

              // Optical transmission & powder sugar effect
              float beer = exp(-shadowDensity * 0.75);
              float powder = 1.0 - exp(-density * 4.0);
              float sunVis = beer * powder;

              // Henyey-Greenstein Silver Lining
              float cosTheta = dot(rayDir, sunDir);
              float hg = 0.28 / pow(1.50 - 1.40 * cosTheta, 1.5);
              float silver = hg * max(0.0, uSunHeight) * (1.0 - sunVis * 0.6);

              // Light composition
              vec3 ambient = uAmbientColor * mix(0.40, 1.0, h);
              vec3 direct = uSunColor * (sunVis * 1.7 + silver * 2.2);

              // Sunset / golden hour warm glow
              float sunsetFactor = pow(max(0.0, 1.0 - abs(uSunHeight) * 2.0), 2.2);
              vec3 sunsetGlow = vec3(1.0, 0.48, 0.18) * (sunsetFactor * 1.5);
              direct += sunsetGlow * (sunVis + silver);

              vec3 stepColor = (direct + ambient) * uCloudBaseColor;

              // Storm cumulonimbus slate darkening
              if (uDensity > 0.2) {
                vec3 stormSlate = vec3(0.12, 0.13, 0.17);
                stepColor = mix(stepColor, stormSlate * (0.4 + 0.6 * sunVis), (uDensity - 0.2) * 1.25);
              }

              // Lightning sheet flash illumination from within
              if (uFlash > 0.01) {
                vec3 flashGlow = vec3(0.9, 0.95, 1.1) * (uFlash * 3.2);
                stepColor += flashGlow * (0.6 + density * 1.4);
              }

              // Ray integration with optical thickness scaled for zenith and oblique angles
              float stepExtinction = density * (stepSize * 0.065 + 0.22);
              float stepT = exp(-stepExtinction);
              accumColor += stepColor * transmittance * (1.0 - stepT);
              transmittance *= stepT;
              if (transmittance < 0.01) break;
            }

            t += stepSize;
          }

          // Horizon atmospheric haze fade (gentle fade only at the true horizon line)
          float horizonFade = smoothstep(0.001, 0.04, rayDir.y);
          float alpha = clamp(1.0 - transmittance, 0.0, 1.0) * horizonFade;
          if (alpha <= 0.005) discard;

          gl_FragColor = vec4(accumColor, alpha);
        }
      `,
      transparent: true,
      side: BackSide,
      depthWrite: false
    });

    const clouds = new Mesh(cloudsGeometry, this.cloudsMaterial);
    clouds.frustumCulled = false;
    clouds.renderOrder = 1;
    this.add(clouds);
  }

  /**
   * How strongly sky light lights the terrain right now (0-1): full by day,
   * dim at night, 0 in dimensions without sky light.
   */
  public get daylight(): number {
    const atm = this.activeDimension.atmosphere;
    if (atm.hasSkyLight === false) return 0;
    let light = 1;
    if (atm.hasDayNightCycle) {
      const sunHeight = Math.sin(this.dayTime % (Math.PI * 2));
      const t = Math.min(1, Math.max(0, (sunHeight + 0.25) / 0.5));
      light = 0.2 + 0.8 * t * t * (3 - 2 * t);
    }
    return light * Math.max(0.05, Math.min(1.0, this.weatherDaylightFactor));
  }

  tick(camera: PerspectiveCamera, delta: number = 16.6667): void {
    const atm = this.activeDimension.atmosphere;
    const dtScale = delta / (1000 / 60);

    if (atm.hasDayNightCycle) {
      this.dayTime += 0.005 * this.cycleSpeed * dtScale;
    }
    const angle = this.dayTime % (Math.PI * 2);
    
    // Distance 1900 keeps sun/moon behind the 1800 clouds sphere and inside the 2000 sky dome
    const dist = 1900;
    const sunScale = (atm.sunScale ?? 1.5) * 1.9;
    this.sunMesh.scale.set(sunScale, sunScale, sunScale);
    this.moonMesh.scale.set(1.9, 1.9, 1.9);
    
    this.sunMesh.position.set(Math.cos(angle) * dist, Math.sin(angle) * dist, 0);
    this.moonMesh.position.set(Math.cos(angle + Math.PI) * dist, Math.sin(angle + Math.PI) * dist, 0);
    
    // Keep the sky group centered on the player for the horizon/dome to stay consistent
    this.position.copy(camera.position);
    
    const sunHeight = Math.sin(angle);
    const isDay = sunHeight > 0;
    
    this.directional.position.copy(this.sunMesh.position);
    this.directional.intensity = atm.hasSun ? Math.max(0, sunHeight * 1.5 * this.weatherDaylightFactor) : 0;
    
    const daySkyColor = new Color(atm.daySkyColor);
    const nightSkyColor = new Color(atm.nightSkyColor);
    const horizonColor = new Color(atm.horizonColor);
    const ambientDay = new Color(atm.ambientDayColor);
    const ambientNight = new Color(atm.ambientNightColor);
    const minAmbient = atm.ambientIntensity ?? 0.6;
    const cloudVisible = (atm.hasClouds || this.weatherCloudDensity > 0.05) ? 0.6 + this.weatherCloudDensity * 0.4 : 0.0;
    const starsVisible = atm.starsVisible !== undefined ? atm.starsVisible : Math.max(0, -sunHeight);

    this.ambient.color.lerpColors(ambientNight, ambientDay, Math.max(0, sunHeight));
    if (this.weatherSkyColor) {
      this.ambient.color.lerp(this.weatherSkyColor, 0.7);
      daySkyColor.lerp(this.weatherSkyColor, 0.75);
      horizonColor.lerp(this.weatherSkyColor, 0.65);
    }
    if (this.weatherLightningFlash > 0.01) {
      const flashCol = new Color(0.9, 0.95, 1.0);
      this.ambient.color.lerp(flashCol, Math.min(1.0, this.weatherLightningFlash * 0.8));
    }

    this.ambient.intensity = (isDay ? (atm.ambientIntensity ?? 0.7) : minAmbient) * (0.3 + 0.7 * this.weatherDaylightFactor);
    this.sunMesh.visible = atm.hasSun && this.weatherCloudDensity < 0.85;
    this.moonMesh.visible = atm.hasMoon && this.weatherCloudDensity < 0.85;

    this.sunMaterial.uniforms.uTime.value += 0.016 * dtScale;
    this.moonMaterial.uniforms.uTime.value += 0.016 * dtScale;
    this.cloudsMaterial.uniforms.uTime.value += 0.016 * dtScale;
    this.cloudsMaterial.uniforms.uDensity.value = this.weatherCloudDensity;
    this.cloudsMaterial.uniforms.uFlash.value = this.weatherLightningFlash;
    
    this.skyMaterial.uniforms.uTime.value += 0.01 * dtScale;
    this.skyMaterial.uniforms.uIsSpace.value = this.weatherCloudDensity > 0.5 ? 0.0 : starsVisible;

    this.skyMaterial.uniforms.uSunHeight.value = atm.hasDayNightCycle ? sunHeight : 1.0;
    this.skyMaterial.uniforms.uDayColor.value.copy(daySkyColor);
    this.skyMaterial.uniforms.uNightColor.value.copy(nightSkyColor);
    this.skyMaterial.uniforms.uHorizonColor.value.copy(horizonColor);
    
    this.sunMesh.lookAt(camera.position);
    this.moonMesh.lookAt(camera.position);

    const cloudColor = new Color(atm.cloudColor ?? 0xffffff);
    if (this.weatherCloudColor) {
      cloudColor.lerp(this.weatherCloudColor, 0.85);
    }
    this.cloudsMaterial.uniforms.uCloudBaseColor.value.copy(cloudColor);
    this.cloudsMaterial.uniforms.uSunDirection.value.copy(this.directional.position).normalize();
    this.cloudsMaterial.uniforms.uSunHeight.value = sunHeight;
    this.cloudsMaterial.uniforms.uSunColor.value.copy(this.directional.color).multiplyScalar(Math.max(0.4, this.directional.intensity));
    this.cloudsMaterial.uniforms.uAmbientColor.value.copy(this.ambient.color).multiplyScalar(Math.max(0.4, this.ambient.intensity));
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
