import {
  Color,
  LinearFilter,
  Matrix4,
  RGBAFormat,
  ShaderMaterial,
  Texture,
  UnsignedByteType,
  Vector2,
  WebGLRenderer,
  WebGLRenderTarget
} from 'three';
import { FULLSCREEN_VERTEX, bindSceneUniforms, type PostFrame, type ScreenPass } from '../PostProcessor';
import { FullscreenQuad } from './FullscreenQuad';
import { COLOR_GLSL, DEPTH_GLSL, NOISE_GLSL } from './postCommon';

export interface SsaoPassOptions {
  /** Raio de busca em blocos. 0.9 cobre os cantos de um bloco sem escurecer o campo todo. */
  radiusBlocks?: number;
  /** Forca da oclusao: 0 desliga, 1 e um canto bem fechado. */
  intensity?: number;
  /** Amostras por pixel. 12 e um bom equilibrio; 20 fica limpo, 6 pede mais blur. */
  samples?: number;
  /** Escala do buffer de AO (0.5 = meia resolucao). */
  scale?: number;
}

/**
 * Oclusao de ambiente em espaco de tela, calculada so a partir do depth buffer.
 *
 * O mesher ja grava um AO por vertice, que resolve o canto imediato de cada face, mas ele
 * nao ve nada alem dos vizinhos de um voxel: um paredao a tres blocos de distancia nao
 * escurece o chao, e e justamente esse contato de media escala que faz o terreno parecer
 * iluminado por um ceu em vez de por uma luz constante. Este passe cobre essa faixa.
 *
 * A normal vem das derivadas do depth, nao de um g-buffer: num mundo de voxels cada face e
 * um plano alinhado ao eixo, entao a estimativa acerta a normal exata e economiza um
 * attachment inteiro. Em seguida um blur bilateral (que respeita descontinuidade de
 * profundidade) limpa o ruido das amostras sem vazar sombra por cima das silhuetas.
 */
export class SsaoPass implements ScreenPass {
  public enabled = true;
  public readonly order = 10;
  public readonly needsDepth = true;
  public readonly material: ShaderMaterial;

  private readonly quad = new FullscreenQuad();
  private readonly aoMaterial: ShaderMaterial;
  private readonly blurMaterial: ShaderMaterial;
  private aoTarget: WebGLRenderTarget | null = null;
  private blurTarget: WebGLRenderTarget | null = null;
  private readonly scale: number;
  private width = 0;
  private height = 0;

  constructor(options: SsaoPassOptions = {}) {
    this.scale = Math.min(1, Math.max(0.25, options.scale ?? 0.5));
    const samples = Math.max(4, Math.min(32, Math.round(options.samples ?? 12)));

    this.aoMaterial = new ShaderMaterial({
      defines: { AO_SAMPLES: samples },
      uniforms: {
        tDepth: { value: null },
        uTexel: { value: new Vector2() },
        uAoTexel: { value: new Vector2() },
        uNear: { value: 0.1 },
        uFar: { value: 1000 },
        uProjection: { value: new Matrix4() },
        uInvProjection: { value: new Matrix4() },
        uInvView: { value: new Matrix4() },
        uRadius: { value: 1 },
        uIntensity: { value: options.intensity ?? 0.85 },
        uWorldScale: { value: 1 }
      },
      vertexShader: FULLSCREEN_VERTEX,
      fragmentShader: /* glsl */ `
        uniform vec2 uTexel;
        uniform vec2 uAoTexel;
        uniform mat4 uProjection;
        uniform float uRadius;
        uniform float uIntensity;
        uniform float uWorldScale;
        varying vec2 vUv;
        ${DEPTH_GLSL}
        ${NOISE_GLSL}

        void main() {
          float raw = rawDepth(vUv);
          if (isSky(raw)) {
            gl_FragColor = vec4(1.0);
            return;
          }

          vec3 origin = viewPosition(vUv, raw);
          vec3 normal = viewNormal(vUv, uTexel, origin);
          float radius = uRadius * uWorldScale;

          // Espiral de angulo dourado girada por pixel: distribui as amostras de forma
          // uniforme e troca banding por um ruido fino que o blur dissolve.
          float rotation = ign(gl_FragCoord.xy) * 6.2831853;
          float occlusion = 0.0;

          for (int i = 0; i < AO_SAMPLES; i++) {
            float fi = (float(i) + 0.5) / float(AO_SAMPLES);
            float angle = rotation + fi * 6.2831853 * 3.0;
            // sqrt distribui as amostras por area, nao por raio: sem acumulo no centro.
            float r = sqrt(fi) * radius;
            vec3 dir = vec3(cos(angle), sin(angle), 0.0);

            // Reflete para o hemisferio da normal: amostrar atras da superficie sempre
            // acusaria oclusao e escureceria tudo por igual.
            vec3 offset = dir - normal * min(0.0, dot(dir, normal)) * 2.0;
            vec3 samplePos = origin + offset * r + normal * radius * 0.08;

            vec4 clip = uProjection * vec4(samplePos, 1.0);
            if (clip.w <= 0.0) continue;
            vec2 sampleUv = (clip.xy / clip.w) * 0.5 + 0.5;
            if (sampleUv.x < 0.0 || sampleUv.x > 1.0 || sampleUv.y < 0.0 || sampleUv.y > 1.0) continue;

            float sampleRaw = rawDepth(sampleUv);
            if (isSky(sampleRaw)) continue;
            vec3 scenePos = viewPosition(sampleUv, sampleRaw);

            vec3 toSample = scenePos - origin;
            float dist = length(toSample);
            if (dist < 1e-4) continue;

            // Peso por cosseno (quanto o oclusor esta "na frente" da normal) e queda com a
            // distancia: um objeto na borda do raio quase nao conta, o que evita o halo
            // escuro que um corte seco deixaria.
            float cosine = max(dot(normal, toSample / dist), 0.0);
            float falloff = 1.0 - clamp(dist / radius, 0.0, 1.0);
            occlusion += cosine * falloff * falloff;
          }

          occlusion = occlusion / float(AO_SAMPLES);
          float ao = clamp(1.0 - occlusion * uIntensity * 2.4, 0.0, 1.0);
          gl_FragColor = vec4(ao, ao, ao, 1.0);
        }
      `,
      depthTest: false,
      depthWrite: false
    });

    this.blurMaterial = new ShaderMaterial({
      uniforms: {
        tAO: { value: null },
        tDepth: { value: null },
        uAoTexel: { value: new Vector2() },
        uNear: { value: 0.1 },
        uFar: { value: 1000 },
        uInvProjection: { value: new Matrix4() },
        uInvView: { value: new Matrix4() }
      },
      vertexShader: FULLSCREEN_VERTEX,
      fragmentShader: /* glsl */ `
        uniform sampler2D tAO;
        uniform vec2 uAoTexel;
        varying vec2 vUv;
        ${DEPTH_GLSL}

        /**
         * Blur bilateral 4x4: mistura so vizinhos com profundidade parecida. Um blur comum
         * aqui arrastaria a sombra do canto por cima da silhueta, o halo classico de SSAO.
         */
        void main() {
          float centerDepth = linearDepth(rawDepth(vUv));
          float total = 0.0;
          float weightSum = 0.0;
          float threshold = max(0.5, centerDepth * 0.03);

          for (int x = -2; x <= 1; x++) {
            for (int y = -2; y <= 1; y++) {
              vec2 offset = vec2(float(x) + 0.5, float(y) + 0.5) * uAoTexel;
              vec2 uv = vUv + offset;
              float d = linearDepth(rawDepth(uv));
              float w = 1.0 - clamp(abs(d - centerDepth) / threshold, 0.0, 1.0);
              total += texture2D(tAO, uv).r * w;
              weightSum += w;
            }
          }

          float ao = weightSum > 1e-3 ? total / weightSum : texture2D(tAO, vUv).r;
          gl_FragColor = vec4(ao, ao, ao, 1.0);
        }
      `,
      depthTest: false,
      depthWrite: false
    });

    this.material = new ShaderMaterial({
      uniforms: {
        tDiffuse: { value: null },
        tAO: { value: null },
        uSkyColor: { value: new Color(0x87ceeb) },
        uDaylight: { value: 1 }
      },
      vertexShader: FULLSCREEN_VERTEX,
      fragmentShader: /* glsl */ `
        uniform sampler2D tDiffuse;
        uniform sampler2D tAO;
        uniform vec3 uSkyColor;
        uniform float uDaylight;
        varying vec2 vUv;
        ${COLOR_GLSL}

        void main() {
          vec3 color = texture2D(tDiffuse, vUv).rgb;
          float ao = texture2D(tAO, vUv).r;

          // Emissivos nao sao ocluidos: uma tocha no canto da parede continua brilhando.
          float emissive = clamp(lumaOf(color) - 1.0, 0.0, 1.0);
          ao = mix(ao, 1.0, emissive);

          // A oclusao tira luz ambiente do ceu, nao a cor toda. Multiplicar o RGB cru
          // deixa um cinza morto no canto; retirar a cor do ceu mantem a sombra azulada
          // de dia e neutra de noite, como se o ceu fosse a fonte bloqueada.
          float shadow = 1.0 - ao;
          vec3 skyTint = normalize(max(uSkyColor, vec3(0.08))) * 1.732;
          vec3 occluded = color * mix(vec3(1.0), skyTint * 0.55, uDaylight * 0.6);
          gl_FragColor = vec4(mix(color, occluded * ao, shadow), 1.0);
          #include <colorspace_fragment>
        }
      `,
      depthTest: false,
      depthWrite: false
    });

    this.setRadius(options.radiusBlocks ?? 0.9);
  }

  public setSize(width: number, height: number): void {
    const w = Math.max(1, Math.floor(width * this.scale));
    const h = Math.max(1, Math.floor(height * this.scale));
    if (this.width === w && this.height === h && this.aoTarget) return;
    this.width = w;
    this.height = h;
    this.aoTarget?.dispose();
    this.blurTarget?.dispose();
    const make = () => new WebGLRenderTarget(w, h, {
      type: UnsignedByteType,
      format: RGBAFormat,
      minFilter: LinearFilter,
      magFilter: LinearFilter,
      depthBuffer: false,
      stencilBuffer: false
    });
    this.aoTarget = make();
    this.blurTarget = make();
    const texel = new Vector2(1 / w, 1 / h);
    this.aoMaterial.uniforms.uAoTexel.value.copy(texel);
    this.blurMaterial.uniforms.uAoTexel.value.copy(texel);
  }

  public prepare(renderer: WebGLRenderer, _input: Texture, frame: PostFrame): void {
    if (!this.aoTarget || !this.blurTarget) {
      const size = renderer.getDrawingBufferSize(new Vector2());
      this.setSize(Math.max(1, size.x), Math.max(1, size.y));
      if (!this.aoTarget || !this.blurTarget) return;
    }
    if (!frame.depth) return;

    const previousTarget = renderer.getRenderTarget();
    bindSceneUniforms(this.aoMaterial, frame);
    bindSceneUniforms(this.blurMaterial, frame);
    this.quad.draw(renderer, this.aoMaterial, this.aoTarget);
    this.blurMaterial.uniforms.tAO.value = this.aoTarget.texture;
    this.quad.draw(renderer, this.blurMaterial, this.blurTarget);
    this.material.uniforms.tAO.value = this.blurTarget.texture;
    renderer.setRenderTarget(previousTarget);
  }

  /** Raio em blocos; convertido para unidades de cena pelo `uWorldScale` do quadro. */
  public setRadius(radiusBlocks: number): void {
    this.aoMaterial.uniforms.uRadius.value = Math.max(0.05, radiusBlocks);
  }

  public setIntensity(intensity: number): void {
    this.aoMaterial.uniforms.uIntensity.value = Math.max(0, intensity);
  }

  public dispose(): void {
    this.aoTarget?.dispose();
    this.blurTarget?.dispose();
    this.aoTarget = null;
    this.blurTarget = null;
    this.quad.dispose();
    this.aoMaterial.dispose();
    this.blurMaterial.dispose();
    this.material.dispose();
  }
}
