import { Color, ShaderMaterial, Vector2, Vector3, WebGLRenderer } from 'three';
import { FULLSCREEN_VERTEX, type ScreenPass } from './PostProcessor';
import { COLOR_GLSL, NOISE_GLSL, TONEMAP_GLSL } from './post/postCommon';
import type { BloomPass } from './post/BloomPass';

/** Curvas disponiveis em `CinematicPass.setTonemap`. */
export type TonemapCurve = 'aces' | 'agx' | 'hable' | 'reinhard';

const TONEMAP_INDEX: Record<TonemapCurve, number> = {
  aces: 0,
  agx: 1,
  hable: 2,
  reinhard: 3
};

export interface CinematicPassOptions {
  /** Mantido por compatibilidade: encaminhado ao `BloomPass` ligado pelo pipeline. */
  bloomStrength?: number;
  vignetteStrength?: number;
  chromaticAberration?: number;
  /** Curva de tonemapping. `aces` e o padrao, com o contraste de um shaderpack. */
  tonemap?: TonemapCurve;
  /** Exposicao de dia, em stops lineares (1 = neutro). */
  exposure?: number;
  /** Exposicao de noite: simula a adaptacao do olho ao escuro. */
  nightExposure?: number;
  /**
   * Granulado de filme. Desligado por padrao: num mundo de voxels, de cores planas e
   * grandes areas uniformes, o ruido animado nao le como textura de pelicula, le como
   * tela suja. Ligue com `setGrain` se o jogo quiser esse acabamento.
   */
  grain?: number;
}

/**
 * Tonemapping e color grading: o passe que transforma o HDR da cena na imagem final.
 *
 * A ordem aqui e a ordem de uma pipeline de cinema, e cada etapa depende da anterior:
 * balanco de branco e exposicao acontecem em HDR linear (onde "dobrar a luz" significa
 * dobrar o numero); a curva filmica comprime a faixa; e so depois, em espaco de display,
 * entram contraste, vibrance e o split toning que da a sombra azulada e a luz dourada que
 * se associa a um shaderpack. Fazer grading antes do tonemap, como e tentador, satura o
 * que depois vai ser comprimido e devolve halos de cor nas bordas das altas.
 *
 * Fecha com aberracao cromatica radial, vinheta, granulado e dithering ordenado: o dither
 * e o que impede o degrade do ceu de virar faixas visiveis ao cair para 8 bits.
 */
export class CinematicPass implements ScreenPass {
  public enabled = true;
  public readonly material: ShaderMaterial;
  /** Roda no fim: compoe a cena HDR ja com bloom, AO e volumetria aplicados. */
  public readonly order = 90;

  /**
   * Bloom ligado pelo `ShaderPipeline`. Existe para que `setBloom` continue funcionando
   * depois de o bloom ter virado um passe proprio (ele precisa dos seus alvos de mip).
   */
  public bloom: BloomPass | null = null;

  private readonly resolution = new Vector2(1, 1);
  private time = 0;

  constructor(options: CinematicPassOptions = {}) {
    this.material = new ShaderMaterial({
      uniforms: {
        tDiffuse: { value: null },
        uResolution: { value: this.resolution },
        uTexel: { value: new Vector2() },
        uTime: { value: 0 },
        uDaylight: { value: 1.0 },
        uUnderwater: { value: 0.0 },
        uSunScreen: { value: new Vector3(0.5, 0.5, 0) },
        uSkyColor: { value: new Color(0x87ceeb) },

        uTonemap: { value: TONEMAP_INDEX[options.tonemap ?? 'aces'] },
        uExposure: { value: options.exposure ?? 1.05 },
        uNightExposure: { value: options.nightExposure ?? 1.75 },
        uTemperature: { value: 0.0 },

        uContrast: { value: 1.06 },
        uSaturation: { value: 1.04 },
        uVibrance: { value: 0.18 },
        uLift: { value: new Vector3(0.0, 0.0, 0.0) },
        uGamma: { value: new Vector3(1.0, 1.0, 1.0) },
        uGain: { value: new Vector3(1.0, 1.0, 1.0) },
        uShadowTint: { value: new Color(0.86, 0.93, 1.1) },
        uHighlightTint: { value: new Color(1.09, 1.015, 0.90) },
        uToneBalance: { value: 0.75 },

        uVignetteStrength: { value: options.vignetteStrength ?? 0.2 },
        uChromaticAberration: { value: options.chromaticAberration ?? 0.0022 },
        uGrain: { value: options.grain ?? 0.0 },
        uDither: { value: 1.0 }
      },
      vertexShader: FULLSCREEN_VERTEX,
      fragmentShader: /* glsl */ `
        uniform sampler2D tDiffuse;
        uniform vec2 uResolution;
        uniform float uTime;
        uniform float uDaylight;
        uniform float uUnderwater;
        uniform vec3 uSunScreen;
        uniform vec3 uSkyColor;

        uniform float uTonemap;
        uniform float uExposure;
        uniform float uNightExposure;
        uniform float uTemperature;

        uniform float uContrast;
        uniform float uSaturation;
        uniform float uVibrance;
        uniform vec3 uLift;
        uniform vec3 uGamma;
        uniform vec3 uGain;
        uniform vec3 uShadowTint;
        uniform vec3 uHighlightTint;
        uniform float uToneBalance;

        uniform float uVignetteStrength;
        uniform float uChromaticAberration;
        uniform float uGrain;
        uniform float uDither;

        varying vec2 vUv;
        ${COLOR_GLSL}
        ${TONEMAP_GLSL}
        ${NOISE_GLSL}

        /** Temperatura de cor: negativo esfria (azul), positivo esquenta (ambar). */
        vec3 whiteBalance(vec3 c, float t) {
          vec3 warm = vec3(1.0 + 0.18 * t, 1.0 + 0.02 * t, 1.0 - 0.16 * t);
          return c * warm;
        }

        void main() {
          vec2 texel = 1.0 / max(uResolution, vec2(1.0));
          vec2 center = vUv - 0.5;
          float r2 = dot(center, center);

          // Debaixo da agua a lamina de agua na frente da camera refrata: duas ondas
          // cruzadas deslocam a amostragem, e e esse movimento (nao a cor azul) que
          // comunica que se esta submerso.
          vec2 uv = vUv;
          if (uUnderwater > 0.5) {
            uv += vec2(
              sin(vUv.y * 26.0 + uTime * 1.7) * 0.0022,
              cos(vUv.x * 22.0 + uTime * 1.3) * 0.0022
            );
          }

          // Aberracao cromatica: a dispersao de uma lente cresce com o quadrado do raio,
          // entao o centro fica limpo e so os cantos separam os canais.
          vec3 color;
          float ca = r2 * uChromaticAberration;
          if (ca > 1e-5) {
            color.r = texture2D(tDiffuse, uv + center * ca).r;
            color.g = texture2D(tDiffuse, uv).g;
            color.b = texture2D(tDiffuse, uv - center * ca).b;
          } else {
            color = texture2D(tDiffuse, uv).rgb;
          }

          // ── HDR linear: exposicao e balanco de branco ────────────────────────────
          float night = 1.0 - clamp(uDaylight, 0.0, 1.0);
          float exposure = mix(uExposure, uNightExposure, night * night);
          color = whiteBalance(color, uTemperature) * exposure;

          if (uUnderwater > 0.5) {
            // Lei de Beer-Lambert: a agua absorve o vermelho muito antes do azul. Aplicar
            // isso antes do tonemap e o que faz a cena ficar azul-esverdeada de forma
            // plausivel, em vez de receber um filtro azul por cima.
            color *= vec3(0.42, 0.78, 1.0);
            color = mix(color, vec3(lumaOf(color)) * vec3(0.18, 0.46, 0.62), 0.28);
          }

          // ── Compressao filmica ───────────────────────────────────────────────────
          color = tonemap(color, uTonemap);

          // ── Espaco de display: grading ───────────────────────────────────────────
          color = applyContrast(color, uContrast);
          color = applyVibrance(color, uVibrance);
          color = applySaturation(color, uSaturation);
          color = liftGammaGain(color, uLift, uGamma, uGain);

          // De dia o ceu joga azul nas sombras e o sol joga ambar nas altas; de noite a
          // cena converge para um azul frio e dessaturado, como a visao escotopica.
          vec3 shadowTint = mix(vec3(0.72, 0.82, 1.08), uShadowTint, clamp(uDaylight, 0.0, 1.0));
          color = splitTone(color, shadowTint, uHighlightTint, uToneBalance);
          color = applySaturation(color, mix(0.78, 1.0, clamp(uDaylight * 1.4, 0.0, 1.0)));

          // ── Lente ────────────────────────────────────────────────────────────────
          if (uVignetteStrength > 0.001) {
            // cos^4 e a queda natural de uma lente; some um pouco com o sol de frente,
            // porque o flare clareia justamente os cantos.
            float falloff = pow(1.0 / (1.0 + 2.6 * r2), 2.0);
            float sunGlare = uSunScreen.z > 0.5 ? (1.0 - smoothstep(0.0, 0.7, length(vUv - uSunScreen.xy))) : 0.0;
            float vignette = mix(1.0, falloff, uVignetteStrength * (1.0 - 0.5 * sunGlare));
            color *= vignette;
          }

          if (uGrain > 0.001) {
            // Mais granulado nas sombras que nas altas, como em filme real.
            float n = hash12(gl_FragCoord.xy + fract(uTime) * 1733.0) - 0.5;
            float shadowWeight = 1.0 - lumaOf(color);
            color += n * uGrain * (0.35 + 0.65 * shadowWeight);
          }

          // Dither ordenado antes do corte para 8 bits: sem ele o degrade do ceu e os
          // halos de bloom aparecem como faixas de banding.
          if (uDither > 0.5) {
            color += (ign(gl_FragCoord.xy) - 0.5) / 255.0;
          }

          gl_FragColor = vec4(max(color, vec3(0.0)), 1.0);
          #include <colorspace_fragment>
        }
      `,
      depthTest: false,
      depthWrite: false
    });
  }

  /**
   * Mantido com a assinatura original. O `ShaderPipeline` ja alimenta os uniforms de
   * quadro pelo `PostProcessor`; isto cobre quem usa o passe sozinho.
   */
  public update(
    renderer: WebGLRenderer,
    isUnderwater: boolean,
    daylight: number,
    dtSeconds: number = 0.016
  ): void {
    renderer.getDrawingBufferSize(this.resolution);
    this.time += dtSeconds;
    this.material.uniforms.uResolution.value.copy(this.resolution);
    this.material.uniforms.uTime.value = this.time;
    this.material.uniforms.uUnderwater.value = isUnderwater ? 1.0 : 0.0;
    this.material.uniforms.uDaylight.value = daylight;
  }

  /** Encaminha para o `BloomPass` ligado; sem pipeline nao ha bloom a ajustar. */
  public setBloom(strength: number): void {
    this.bloom?.setStrength(strength);
  }

  public setVignette(strength: number): void {
    this.material.uniforms.uVignetteStrength.value = strength;
  }

  public setTonemap(curve: TonemapCurve): void {
    this.material.uniforms.uTonemap.value = TONEMAP_INDEX[curve];
  }

  /** Exposicao de dia e de noite, em multiplicadores lineares. */
  public setExposure(day: number, night?: number): void {
    this.material.uniforms.uExposure.value = Math.max(0.01, day);
    if (night !== undefined) {
      this.material.uniforms.uNightExposure.value = Math.max(0.01, night);
    }
  }

  /** -1 (frio) a 1 (quente). */
  public setTemperature(amount: number): void {
    this.material.uniforms.uTemperature.value = Math.max(-1, Math.min(1, amount));
  }

  public setContrast(amount: number): void {
    this.material.uniforms.uContrast.value = Math.max(0, amount);
  }

  public setSaturation(amount: number): void {
    this.material.uniforms.uSaturation.value = Math.max(0, amount);
  }

  public setVibrance(amount: number): void {
    this.material.uniforms.uVibrance.value = amount;
  }

  public setGrain(amount: number): void {
    this.material.uniforms.uGrain.value = Math.max(0, amount);
  }

  public setChromaticAberration(amount: number): void {
    this.material.uniforms.uChromaticAberration.value = Math.max(0, amount);
  }

  public dispose(): void {
    this.material.dispose();
  }
}
