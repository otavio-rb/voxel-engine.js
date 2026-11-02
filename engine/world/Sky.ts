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
    this.tick(new PerspectiveCamera(), 0);
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
      side: BackSide,
      // O domo nao escreve profundidade: ele e o fundo, e a 2000 unidades estaria mais
      // perto que o plano distante. Deixando o depth intacto, os passes de tela
      // reconhecem o pixel como ceu (e o AO, a nevoa aerea e os raios de sol dependem
      // exatamente disso para saber onde ha geometria e onde ha ar).
      depthWrite: false
    });

    const skyMesh = new Mesh(skyGeom, this.skyMaterial);
    skyMesh.raycast = () => null;
    skyMesh.renderOrder = -2; // Draw behind everything
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
    this.sunMesh.renderOrder = -1;
    this.moonMesh.renderOrder = -1;
    
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

        // Fast, high-quality 3D hash & value noise (no origin singularity, smooth gradients)
        float hash13(vec3 p) {
          p = fract(p * 0.1031);
          p += dot(p, p.zyx + 31.32);
          return fract((p.x + p.y) * p.z);
        }

        float noise3D(vec3 p) {
          vec3 i = floor(p);
          vec3 f = fract(p);
          vec3 u = f * f * (3.0 - 2.0 * f);
          return mix(
            mix(mix(hash13(i + vec3(0.0, 0.0, 0.0)), hash13(i + vec3(1.0, 0.0, 0.0)), u.x),
                mix(hash13(i + vec3(0.0, 1.0, 0.0)), hash13(i + vec3(1.0, 1.0, 0.0)), u.x), u.y),
            mix(mix(hash13(i + vec3(0.0, 0.0, 1.0)), hash13(i + vec3(1.0, 0.0, 1.0)), u.x),
                mix(hash13(i + vec3(0.0, 1.0, 1.0)), hash13(i + vec3(1.0, 1.0, 1.0)), u.x), u.y),
            u.z
          );
        }

        float fbm(vec3 p) {
          return noise3D(p) * 0.65 + noise3D(p * 2.1) * 0.35;
        }

        // Volumetric 3D Cloud Density with balanced realistic cumulus billows
        float getCloudDensity(vec3 p, vec3 wind, float h) {
          // Height profile: flat lifting condensation base, billowy mid-section, soft wispy top
          float heightProfile = smoothstep(0.0, 0.16, h) * smoothstep(1.0, 0.68, h);
          if (heightProfile <= 0.001) return 0.0;

          // Macro cloud coverage (~600m clusters)
          vec2 pXZ = (p.xz + wind.xz * 0.25) * 0.0016;
          float macro = noise3D(vec3(pXZ, 0.0)) * 0.70 + noise3D(vec3(pXZ * 2.3, 0.8)) * 0.30;

          // Clear day: ~40% coverage leaving open blue sky; stormy weather fills in smoothly
          float coverage = mix(0.40, 0.14, clamp(uDensity, 0.0, 1.0));
          float cloudBase = smoothstep(coverage, coverage + 0.24, macro);
          if (cloudBase <= 0.001) return 0.0;

          // 3D puffy billows (cumulus lobes)
          vec3 p3 = (p + wind) * 0.0055;
          float billow = 1.0 - abs(fbm(p3) * 2.0 - 1.0);

          float d = (billow * 1.3 - 0.25) * heightProfile * cloudBase;
          if (d <= 0.005) return 0.0;

          // Fluffy surface edge erosion
          float detail = noise3D(p3 * 3.2);
          d -= detail * 0.16 * (1.0 - heightProfile * 0.4);
          d = max(0.0, d);

          return d * (2.2 + uDensity * 2.4);
        }

        // Secondary light-marching fast density
        float getFastDensity(vec3 p, vec3 wind, float h) {
          float heightProfile = smoothstep(0.0, 0.16, h) * smoothstep(1.0, 0.68, h);
          if (heightProfile <= 0.001) return 0.0;
          vec2 pXZ = (p.xz + wind.xz * 0.25) * 0.0016;
          float macro = noise3D(vec3(pXZ, 0.0)) * 0.70 + noise3D(vec3(pXZ * 2.3, 0.8)) * 0.30;
          float coverage = mix(0.40, 0.14, clamp(uDensity, 0.0, 1.0));
          float cloudBase = smoothstep(coverage, coverage + 0.24, macro);
          if (cloudBase <= 0.001) return 0.0;
          vec3 p3 = (p + wind) * 0.0055;
          float billow = 1.0 - abs(noise3D(p3) * 2.0 - 1.0);
          return max(0.0, (billow * 1.3 - 0.25) * heightProfile * cloudBase) * (2.2 + uDensity * 2.4);
        }

        void main() {
          vec3 rayDir = normalize(vWorldPos - cameraPosition);

          // Atmospheric horizon extinction fade: eliminates any hard cutting or seams!
          float horizonFade = smoothstep(-0.01, 0.10, rayDir.y);
          if (horizonFade <= 0.001) discard;

          // Curved atmospheric spherical shell geometry
          // Earth radius: 60,000 units. Cloud layer: 160m to 340m altitude.
          float R_EARTH = 60000.0;
          float CLOUD_BOTTOM = 160.0;
          float CLOUD_TOP = 340.0;
          
          float camY = max(0.0, cameraPosition.y);
          float Cy = R_EARTH + camY;
          float R0 = R_EARTH + CLOUD_BOTTOM;
          float R1 = R_EARTH + CLOUD_TOP;

          // Ray-sphere intersections: t^2 + 2(Cy*dy)t + (Cy^2 - R^2) = 0
          float b = Cy * rayDir.y;
          float c0 = Cy * Cy - R0 * R0;
          float c1 = Cy * Cy - R1 * R1;

          float disc0 = b * b - c0;
          float disc1 = b * b - c1;
          if (disc1 < 0.0) discard;

          float t0 = -b + sqrt(max(0.0, disc0));
          float t1 = -b + sqrt(max(0.0, disc1));

          float tEnter = max(0.0, min(t0, t1));
          float tExit = max(0.0, max(t0, t1));

          float marchDist = min(tExit - tEnter, 2800.0);
          if (marchDist <= 1.0) discard;

          const int STEPS = 28;
          float stepSize = marchDist / float(STEPS);

          // Sub-step dither to remove any banding
          float jitter = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453);
          float t = tEnter + jitter * stepSize * 0.5;

          vec3 wind = vec3(uTime * 3.2, 0.0, uTime * 1.6);
          vec3 sunDir = normalize(uSunDirection);

          vec3 accumColor = vec3(0.0);
          float transmittance = 1.0;

          for (int i = 0; i < STEPS; i++) {
            vec3 p = cameraPosition + rayDir * t;
            float h = clamp((p.y - CLOUD_BOTTOM) / (CLOUD_TOP - CLOUD_BOTTOM), 0.0, 1.0);

            float density = getCloudDensity(p, wind, h);
            if (density > 0.005) {
              // 2 secondary light march steps towards the sun
              float shadowDensity = 0.0;
              float lStep = 24.0;
              for (int j = 1; j <= 2; j++) {
                vec3 lPos = p + sunDir * (float(j) * lStep);
                float lh = clamp((lPos.y - CLOUD_BOTTOM) / (CLOUD_TOP - CLOUD_BOTTOM), 0.0, 1.0);
                if (lh > 0.0 && lh < 1.0) {
                  shadowDensity += getFastDensity(lPos, wind, lh);
                }
              }

              // Optical transmission & powder sugar effect
              float beer = exp(-shadowDensity * 0.70);
              float powder = 1.0 - exp(-density * 3.8);
              float sunVis = beer * powder;

              // Dual-lobe Henyey-Greenstein Silver Lining
              float cosTheta = dot(rayDir, sunDir);
              float hg1 = 0.28 / pow(1.48 - 1.38 * cosTheta, 1.5);
              float hg2 = 0.10 / pow(1.20 + 0.60 * cosTheta, 1.5);
              float silver = (hg1 * 0.75 + hg2 * 0.25) * max(0.0, uSunHeight) * (1.0 - sunVis * 0.5);

              // Light composition: ambient sky dome + warm direct sunlight
              vec3 ambient = uAmbientColor * mix(0.45, 1.0, h);
              vec3 direct = uSunColor * (sunVis * 1.8 + silver * 2.4);

              // Sunset / golden hour warm glow
              float sunsetFactor = pow(max(0.0, 1.0 - abs(uSunHeight) * 2.2), 2.0);
              vec3 sunsetGlow = vec3(1.0, 0.45, 0.15) * (sunsetFactor * 2.0);
              direct += sunsetGlow * (sunVis + silver * 1.2);

              vec3 stepColor = (direct + ambient) * uCloudBaseColor;

              // Storm cumulonimbus slate darkening
              if (uDensity > 0.15) {
                vec3 stormSlate = vec3(0.11, 0.12, 0.16);
                stepColor = mix(stepColor, stormSlate * (0.35 + 0.65 * sunVis), (uDensity - 0.15) * 1.3);
              }

              // Lightning sheet flash illumination from within
              if (uFlash > 0.01) {
                vec3 flashGlow = vec3(0.9, 0.95, 1.15) * (uFlash * 3.5);
                stepColor += flashGlow * (0.6 + density * 1.5);
              }

              // Optical extinction integration
              float stepExtinction = density * (stepSize * 0.06 + 0.18);
              float stepT = exp(-stepExtinction);
              accumColor += stepColor * transmittance * (1.0 - stepT);
              transmittance *= stepT;
              if (transmittance < 0.015) break;
            }

            t += stepSize;
          }

          float alpha = clamp(1.0 - transmittance, 0.0, 1.0) * horizonFade;
          if (alpha <= 0.005) discard;

          gl_FragColor = vec4(accumColor, alpha);
        }
      `,
      transparent: true,
      side: BackSide,
      depthTest: true,
      depthWrite: false
    });

    const clouds = new Mesh(cloudsGeometry, this.cloudsMaterial);
    clouds.frustumCulled = false;
    clouds.renderOrder = 0; // Behind water & particles, in front of sky dome
    this.add(clouds);
  }

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

    // ── Cor da luz direta ao longo do dia ──────────────────────────────────
    // Com o sol baixo a luz atravessa muito mais ar, e o espalhamento de Rayleigh come o
    // azul antes do vermelho: por isso o poente e ambar e o meio-dia e quase branco. A
    // cor era fixa aqui, o que dava a mesma luz as 6h e ao meio-dia; a rampa e o que
    // produz a hora dourada e a luz amarelada que se espera de um shaderpack.
    // O expoente baixo mantem o ambar por boa parte da subida do sol, em vez de pular
    // para o branco logo acima do horizonte.
    const sunHigh = new Color(atm.sunColor ?? 0xfff0cf);
    const sunLow = new Color(atm.sunHorizonColor ?? 0xffa64a);
    const sunElevation = Math.pow(Math.max(0, Math.min(1, sunHeight)), 0.45);
    if (atm.hasSun) {
      this.directional.color.lerpColors(sunLow, sunHigh, sunElevation);
      // A lua nao e uma lampada ambar: no pouco que ela ilumina, a luz e azul-fria.
      if (sunHeight <= 0) this.directional.color.setHex(0x9fb4d8);
    }

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
