import { Color, Matrix4, ShaderMaterial, Vector2, Vector3 } from 'three';
import { FULLSCREEN_VERTEX, type ScreenPass } from '../PostProcessor';
import { COLOR_GLSL, DEPTH_GLSL, NOISE_GLSL } from './postCommon';

export interface VolumetricPassOptions {
  /** Intensidade dos raios de sol. 0 desliga. */
  shaftStrength?: number;
  /** Amostras por raio. 24 e suave; abaixo de 12 o dither comeca a aparecer. */
  shaftSamples?: number;
  /** Densidade da nevoa aerea em blocos^-1. 0 desliga (o terreno ja tem a sua nevoa). */
  fogDensity?: number;
  /** Altura (em blocos) em que a nevoa cai a 1/e: vale cheio de bruma, topo limpo. */
  fogHeightFalloff?: number;
  /** Altura (em blocos) da base da nevoa. */
  fogBaseHeight?: number;
}

/**
 * Luz volumetrica e perspectiva aerea.
 *
 * Duas coisas que separam um shaderpack de um render cru, e as duas dependem de saber a
 * geometria do quadro (por isso o passe pede `tDepth`):
 *
 * 1. Raios de sol: a luz que atravessa a folhagem e as bordas do terreno. Sem shadow map
 *    nao da para marchar por sombra de verdade, entao o passe faz o que os packs faziam
 *    antes disso: acumula o brilho do ceu ao longo da reta que vai de cada pixel ate o sol
 *    projetado na tela, e para de acumular onde encontra geometria. O resultado e o mesmo
 *    efeito visual (feixes saindo de tras das colinas) por uma fracao do custo.
 *
 * 2. Perspectiva aerea: nevoa que cresce com a distancia E cai com a altura, com
 *    espalhamento de Henyey-Greenstein na direcao do sol. E o que da escala ao horizonte e
 *    enche os vales de bruma dourada no nascer do sol, em vez do mesmo veu cinza em tudo.
 */
export class VolumetricPass implements ScreenPass {
  public enabled = true;
  public readonly order = 20;
  public readonly needsDepth = true;
  public readonly material: ShaderMaterial;

  constructor(options: VolumetricPassOptions = {}) {
    const samples = Math.max(6, Math.min(64, Math.round(options.shaftSamples ?? 24)));

    this.material = new ShaderMaterial({
      defines: { SHAFT_SAMPLES: samples },
      uniforms: {
        tDiffuse: { value: null },
        tDepth: { value: null },
        uTexel: { value: new Vector2() },
        uNear: { value: 0.1 },
        uFar: { value: 1000 },
        uInvProjection: { value: new Matrix4() },
        uInvView: { value: new Matrix4() },
        uCameraPos: { value: new Vector3() },
        uSunDirection: { value: new Vector3(0, 1, 0) },
        uSunScreen: { value: new Vector3(0.5, 0.5, 0) },
        uSunColor: { value: new Color(1, 1, 1) },
        uSkyColor: { value: new Color(0x87ceeb) },
        uDaylight: { value: 1 },
        uUnderwater: { value: 0 },
        uWorldScale: { value: 1 },
        uShaftStrength: { value: options.shaftStrength ?? 0.55 },
        uShaftDecay: { value: 0.97 },
        uShaftThreshold: { value: 0.25 },
        uFogDensity: { value: options.fogDensity ?? 0.0018 },
        uFogHeightFalloff: { value: options.fogHeightFalloff ?? 42 },
        uFogBaseHeight: { value: options.fogBaseHeight ?? 24 }
      },
      vertexShader: FULLSCREEN_VERTEX,
      fragmentShader: /* glsl */ `
        uniform sampler2D tDiffuse;
        uniform vec2 uTexel;
        uniform vec3 uCameraPos;
        uniform vec3 uSunDirection;
        uniform vec3 uSunScreen;
        uniform vec3 uSunColor;
        uniform vec3 uSkyColor;
        uniform float uDaylight;
        uniform float uUnderwater;
        uniform float uWorldScale;
        uniform float uShaftStrength;
        uniform float uShaftDecay;
        uniform float uShaftThreshold;
        uniform float uFogDensity;
        uniform float uFogHeightFalloff;
        uniform float uFogBaseHeight;
        varying vec2 vUv;
        ${COLOR_GLSL}
        ${DEPTH_GLSL}
        ${NOISE_GLSL}

        /**
         * Henyey-Greenstein: o espalhamento real de gotas de agua e poeira. g proximo de 1
         * concentra a luz para frente, e e por isso que a nevoa acende quando se olha na
         * direcao do sol e fica neutra de costas para ele.
         */
        float henyeyGreenstein(float cosTheta, float g) {
          float g2 = g * g;
          float denom = 1.0 + g2 - 2.0 * g * cosTheta;
          return (1.0 - g2) / (12.566370614 * pow(max(denom, 1e-4), 1.5));
        }

        /** Brilho de ceu no ponto amostrado, ou 0 se ali houver geometria bloqueando o feixe. */
        float shaftSource(vec2 uv) {
          if (!isSky(rawDepth(uv))) return 0.0;
          return max(lumaOf(texture2D(tDiffuse, uv).rgb) - uShaftThreshold, 0.0);
        }

        vec3 sunShafts(vec2 uv) {
          if (uSunScreen.z < 0.5) return vec3(0.0);

          vec2 sunUv = uSunScreen.xy;
          vec2 toSun = sunUv - uv;

          // Os raios so existem em volta do sol; fora disso o acumulo seria so um veu.
          float proximity = 1.0 - smoothstep(0.1, 1.1, length(toSun));
          if (proximity <= 0.001) return vec3(0.0);

          vec2 stepUv = toSun / float(SHAFT_SAMPLES);
          // Jitter por pixel: desloca o inicio da marcha para que a baixa contagem de
          // amostras apareca como ruido fino em vez de aneis concentricos.
          vec2 pos = uv + stepUv * ign(gl_FragCoord.xy);

          float accum = 0.0;
          float weight = 1.0;
          for (int i = 0; i < SHAFT_SAMPLES; i++) {
            accum += shaftSource(pos) * weight;
            weight *= uShaftDecay;
            pos += stepUv;
          }
          accum /= float(SHAFT_SAMPLES);

          vec3 tint = mix(uSunColor, vec3(0.35, 0.75, 0.95), uUnderwater);
          float gain = mix(1.0, 2.2, uUnderwater);
          return tint * accum * proximity * uShaftStrength * gain;
        }

        void main() {
          vec3 color = texture2D(tDiffuse, vUv).rgb;
          float raw = rawDepth(vUv);

          if (uFogDensity > 1e-6 && !isSky(raw)) {
            vec3 world = worldPosition(vUv, raw);
            vec3 toFrag = world - uCameraPos;
            float dist = length(toFrag) / max(uWorldScale, 1e-3);
            vec3 rayDir = toFrag / max(length(toFrag), 1e-4);

            // Integral analitica da densidade exponencial em altura ao longo do raio: da a
            // bruma acumulada sem marchar o volume. Quando o raio e quase horizontal a
            // razao degenera, e o limite e simplesmente a densidade da altura atual.
            float scale = max(uWorldScale, 1e-3);
            float h0 = (uCameraPos.y / scale) - uFogBaseHeight;
            float h1 = (world.y / scale) - uFogBaseHeight;
            float falloff = max(uFogHeightFalloff, 1e-3);
            float dh = (h1 - h0) / falloff;
            float d0 = exp(-max(h0, 0.0) / falloff);
            float integral = abs(dh) < 1e-3
              ? d0
              : (d0 - exp(-max(h1, 0.0) / falloff)) / dh;

            float optical = uFogDensity * dist * max(integral, 0.0);
            float fog = 1.0 - exp(-optical);

            float cosTheta = length(uSunDirection) > 1e-3 ? dot(rayDir, normalize(uSunDirection)) : 0.0;
            float scatter = henyeyGreenstein(cosTheta, 0.72) * 12.566370614;
            vec3 fogColor = mix(uSkyColor, uSunColor, clamp(scatter * 0.35, 0.0, 0.85) * uDaylight);
            fogColor = mix(fogColor * 0.22, fogColor, clamp(uDaylight + 0.15, 0.0, 1.0));
            fogColor = mix(fogColor, vec3(0.03, 0.16, 0.26), uUnderwater);

            // Fontes emissivas brilhantes (raios, lasers, plasma) brilham atraves da bruma
            float lum = max(color.r, max(color.g, color.b));
            float fogAmount = clamp(fog / (1.0 + max(0.0, lum - 0.7) * 2.5), 0.0, 1.0);
            color = mix(color, fogColor, fogAmount);
          }

          if (uShaftStrength > 0.001 && (uDaylight > 0.02 || uUnderwater > 0.5)) {
            color += sunShafts(vUv) * max(uDaylight, uUnderwater * 0.6);
          }

          gl_FragColor = vec4(color, 1.0);
          #include <colorspace_fragment>
        }
      `,
      depthTest: false,
      depthWrite: false
    });
  }

  public setShaftStrength(strength: number): void {
    this.material.uniforms.uShaftStrength.value = Math.max(0, strength);
  }

  /** Densidade em blocos^-1 e perfil de altura em blocos. */
  public setFog(density: number, heightFalloffBlocks?: number, baseHeightBlocks?: number): void {
    this.material.uniforms.uFogDensity.value = Math.max(0, density);
    if (heightFalloffBlocks !== undefined) {
      this.material.uniforms.uFogHeightFalloff.value = Math.max(0.1, heightFalloffBlocks);
    }
    if (baseHeightBlocks !== undefined) {
      this.material.uniforms.uFogBaseHeight.value = baseHeightBlocks;
    }
  }

  public dispose(): void {
    this.material.dispose();
  }
}
