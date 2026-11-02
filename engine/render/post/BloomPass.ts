import {
  AdditiveBlending,
  ClampToEdgeWrapping,
  HalfFloatType,
  UnsignedByteType,
  LinearFilter,
  ShaderMaterial,
  Texture,
  Vector2,
  WebGLRenderer,
  WebGLRenderTarget
} from 'three';
import { FULLSCREEN_VERTEX, type PostFrame, type ScreenPass } from '../PostProcessor';
import { FullscreenQuad } from './FullscreenQuad';
import { COLOR_GLSL } from './postCommon';

export interface BloomPassOptions {
  /** Quanto do bloom entra na imagem final. 0.05 e discreto, 0.2 e um pack bem brilhante. */
  strength?: number;
  /**
   * Luminancia a partir da qual um pixel floresce. O default 1.1 fica logo acima do que o
   * terreno em pleno sol atinge, entao o brilho sai do sol, da lava e dos emissivos, e nao
   * de cada parede iluminada (que e o que produz o veu leitoso).
   */
  threshold?: number;
  /** Largura da transicao em volta do threshold: evita a borda dura de "liga/desliga". */
  softKnee?: number;
  /** 0 = brilho curto e cravado na fonte, 1 = halo largo atmosferico. */
  scatter?: number;
  /** Niveis da cadeia de mips. Mais niveis = halo mais largo e mais suave. */
  levels?: number;
}

/**
 * Bloom de verdade: cadeia de mips com downsample de 13 taps e upsample em tenda de 9
 * taps (o filtro dual do Call of Duty apresentado por Jorge Jimenez), em vez do punhado
 * de amostras fixas que um passe unico consegue pagar.
 *
 * Isso importa para o visual: um halo construido em multiplas escalas cai com a distancia
 * como luz real espalhada na lente, entao o sol e a lava ganham um nucleo intenso com um
 * brilho largo e suave em volta, sem o anel duplicado nem o serrilhado que aparece quando
 * se tenta alargar o raio de um blur de passe unico.
 *
 * O prefiltro usa a media de Karis para que um unico pixel muito claro (uma cintilacao de
 * especular na agua) nao vire um borrao piscante entre quadros.
 */
export class BloomPass implements ScreenPass {
  public enabled = true;
  public readonly order = 30;
  public readonly material: ShaderMaterial;

  private readonly quad = new FullscreenQuad();
  private readonly prefilterMaterial: ShaderMaterial;
  private readonly downsampleMaterial: ShaderMaterial;
  private readonly upsampleMaterial: ShaderMaterial;
  private mips: WebGLRenderTarget[] = [];
  private readonly levels: number;
  private rendererIsFloat: boolean | null = null;
  private width = 0;
  private height = 0;

  constructor(options: BloomPassOptions = {}) {
    this.levels = Math.max(2, Math.min(8, Math.round(options.levels ?? 6)));

    this.prefilterMaterial = new ShaderMaterial({
      uniforms: {
        tDiffuse: { value: null },
        uTexel: { value: new Vector2() },
        uThreshold: { value: options.threshold ?? 1.1 },
        uSoftKnee: { value: options.softKnee ?? 0.55 }
      },
      vertexShader: FULLSCREEN_VERTEX,
      fragmentShader: /* glsl */ `
        uniform sampler2D tDiffuse;
        uniform vec2 uTexel;
        uniform float uThreshold;
        uniform float uSoftKnee;
        varying vec2 vUv;
        ${COLOR_GLSL}

        /**
         * Media de Karis: pondera cada amostra por 1/(1+luma), entao um pixel isolado e
         * absurdamente claro nao domina o bloco. E o que mantem o bloom estavel em
         * movimento (sem "vagalumes" piscando nas cristas da agua).
         */
        vec3 karisAverage(vec3 a, vec3 b, vec3 c, vec3 d) {
          float wa = 1.0 / (1.0 + lumaOf(a));
          float wb = 1.0 / (1.0 + lumaOf(b));
          float wc = 1.0 / (1.0 + lumaOf(c));
          float wd = 1.0 / (1.0 + lumaOf(d));
          return (a * wa + b * wb + c * wc + d * wd) / max(wa + wb + wc + wd, 1e-4);
        }

        void main() {
          vec2 o = uTexel;
          vec3 c = karisAverage(
            texture2D(tDiffuse, vUv + vec2(-o.x, -o.y)).rgb,
            texture2D(tDiffuse, vUv + vec2( o.x, -o.y)).rgb,
            texture2D(tDiffuse, vUv + vec2(-o.x,  o.y)).rgb,
            texture2D(tDiffuse, vUv + vec2( o.x,  o.y)).rgb
          );

          // Curva quadratica no joelho: o brilho cresce suave a partir do threshold, em
          // vez de aparecer de uma vez e desenhar um contorno visivel no limite.
          float luma = lumaOf(c);
          float knee = max(uSoftKnee, 1e-4);
          float soft = clamp(luma - uThreshold + knee, 0.0, 2.0 * knee);
          soft = soft * soft / (4.0 * knee);
          float weight = max(soft, luma - uThreshold) / max(luma, 1e-4);

          gl_FragColor = vec4(c * clamp(weight, 0.0, 1.0), 1.0);
        }
      `,
      depthTest: false,
      depthWrite: false
    });

    this.downsampleMaterial = new ShaderMaterial({
      uniforms: {
        tDiffuse: { value: null },
        uTexel: { value: new Vector2() }
      },
      vertexShader: FULLSCREEN_VERTEX,
      fragmentShader: /* glsl */ `
        uniform sampler2D tDiffuse;
        uniform vec2 uTexel;
        varying vec2 vUv;

        /**
         * Downsample de 13 taps: um bloco central de 4 (peso alto) mais os 3x3 das bordas.
         * Custa mais que um box filter de 4, e a diferenca e justamente a ausencia do
         * padrao quadriculado que um box deixa quando a cadeia tem 6 niveis.
         */
        void main() {
          vec2 o = uTexel;
          vec3 a = texture2D(tDiffuse, vUv + vec2(-2.0, 2.0) * o).rgb;
          vec3 b = texture2D(tDiffuse, vUv + vec2( 0.0, 2.0) * o).rgb;
          vec3 c = texture2D(tDiffuse, vUv + vec2( 2.0, 2.0) * o).rgb;
          vec3 d = texture2D(tDiffuse, vUv + vec2(-2.0, 0.0) * o).rgb;
          vec3 e = texture2D(tDiffuse, vUv).rgb;
          vec3 f = texture2D(tDiffuse, vUv + vec2( 2.0, 0.0) * o).rgb;
          vec3 g = texture2D(tDiffuse, vUv + vec2(-2.0,-2.0) * o).rgb;
          vec3 h = texture2D(tDiffuse, vUv + vec2( 0.0,-2.0) * o).rgb;
          vec3 i = texture2D(tDiffuse, vUv + vec2( 2.0,-2.0) * o).rgb;
          vec3 j = texture2D(tDiffuse, vUv + vec2(-1.0, 1.0) * o).rgb;
          vec3 k = texture2D(tDiffuse, vUv + vec2( 1.0, 1.0) * o).rgb;
          vec3 l = texture2D(tDiffuse, vUv + vec2(-1.0,-1.0) * o).rgb;
          vec3 m = texture2D(tDiffuse, vUv + vec2( 1.0,-1.0) * o).rgb;

          vec3 result = e * 0.125;
          result += (a + c + g + i) * 0.03125;
          result += (b + d + f + h) * 0.0625;
          result += (j + k + l + m) * 0.125;
          gl_FragColor = vec4(result, 1.0);
        }
      `,
      depthTest: false,
      depthWrite: false
    });

    this.upsampleMaterial = new ShaderMaterial({
      uniforms: {
        tDiffuse: { value: null },
        uTexel: { value: new Vector2() },
        uRadius: { value: 0.85 }
      },
      vertexShader: FULLSCREEN_VERTEX,
      fragmentShader: /* glsl */ `
        uniform sampler2D tDiffuse;
        uniform vec2 uTexel;
        uniform float uRadius;
        varying vec2 vUv;

        /** Filtro em tenda de 9 taps: o upsample que nao deixa blocos do mip menor. */
        void main() {
          vec2 o = uTexel * uRadius;
          vec3 result = texture2D(tDiffuse, vUv).rgb * 4.0;
          result += texture2D(tDiffuse, vUv + vec2(-o.x,  0.0)).rgb * 2.0;
          result += texture2D(tDiffuse, vUv + vec2( o.x,  0.0)).rgb * 2.0;
          result += texture2D(tDiffuse, vUv + vec2( 0.0, -o.y)).rgb * 2.0;
          result += texture2D(tDiffuse, vUv + vec2( 0.0,  o.y)).rgb * 2.0;
          result += texture2D(tDiffuse, vUv + vec2(-o.x, -o.y)).rgb;
          result += texture2D(tDiffuse, vUv + vec2( o.x, -o.y)).rgb;
          result += texture2D(tDiffuse, vUv + vec2(-o.x,  o.y)).rgb;
          result += texture2D(tDiffuse, vUv + vec2( o.x,  o.y)).rgb;
          gl_FragColor = vec4(result / 16.0, 1.0);
        }
      `,
      blending: AdditiveBlending,
      depthTest: false,
      depthWrite: false
    });

    this.material = new ShaderMaterial({
      uniforms: {
        tDiffuse: { value: null },
        tBloom: { value: null },
        uStrength: { value: options.strength ?? 0.085 },
        uScatter: { value: options.scatter ?? 0.72 },
        uDaylight: { value: 1 }
      },
      vertexShader: FULLSCREEN_VERTEX,
      fragmentShader: /* glsl */ `
        uniform sampler2D tDiffuse;
        uniform sampler2D tBloom;
        uniform float uStrength;
        uniform float uScatter;
        uniform float uDaylight;
        varying vec2 vUv;
        ${COLOR_GLSL}

        void main() {
          vec3 scene = texture2D(tDiffuse, vUv).rgb;
          vec3 bloom = texture2D(tBloom, vUv).rgb;

          // A noite o olho esta adaptado ao escuro: o mesmo tocha/lava espalha mais.
          float nightGain = mix(1.6, 1.0, clamp(uDaylight, 0.0, 1.0));
          gl_FragColor = vec4(scene + bloom * uStrength * uScatter * nightGain, 1.0);
          #include <colorspace_fragment>
        }
      `,
      depthTest: false,
      depthWrite: false
    });
  }

  public setSize(width: number, height: number): void {
    if (this.width === width && this.height === height) return;
    this.width = width;
    this.height = height;
    this.disposeMips();

    // A cadeia comeca na metade da resolucao: o bloom e inerentemente de baixa frequencia,
    // e cada nivel economizado paga por mais niveis de halo largo pelo mesmo custo.
    let w = Math.max(1, Math.floor(width / 2));
    let h = Math.max(1, Math.floor(height / 2));
    for (let i = 0; i < this.levels; i++) {
      const target = new WebGLRenderTarget(w, h, {
        type: (this.rendererIsFloat ?? true) ? HalfFloatType : UnsignedByteType,
        minFilter: LinearFilter,
        magFilter: LinearFilter,
        wrapS: ClampToEdgeWrapping,
        wrapT: ClampToEdgeWrapping,
        depthBuffer: false,
        stencilBuffer: false
      });
      this.mips.push(target);
      if (w <= 2 || h <= 2) break;
      w = Math.max(1, Math.floor(w / 2));
      h = Math.max(1, Math.floor(h / 2));
    }
  }

  public prepare(renderer: WebGLRenderer, input: Texture, frame: PostFrame): void {
    if (this.mips.length === 0) {
      const size = renderer.getDrawingBufferSize(new Vector2());
      this.setSize(Math.max(1, size.x), Math.max(1, size.y));
      if (this.mips.length === 0) return;
    }

    if (this.rendererIsFloat === null) {
      this.rendererIsFloat = !!(renderer.capabilities.isWebGL2 && renderer.extensions.has('EXT_color_buffer_float'));
    }
    const previousTarget = renderer.getRenderTarget();

    // 1. Prefiltro: isola o que passa do threshold, ja na metade da resolucao.
    this.prefilterMaterial.uniforms.tDiffuse.value = input;
    this.prefilterMaterial.uniforms.uTexel.value.set(1 / this.width, 1 / this.height);
    this.quad.draw(renderer, this.prefilterMaterial, this.mips[0]);

    // 2. Desce a cadeia, cada nivel na metade do anterior.
    for (let i = 1; i < this.mips.length; i++) {
      const src = this.mips[i - 1];
      this.downsampleMaterial.uniforms.tDiffuse.value = src.texture;
      this.downsampleMaterial.uniforms.uTexel.value.set(1 / src.width, 1 / src.height);
      this.quad.draw(renderer, this.downsampleMaterial, this.mips[i]);
    }

    // 3. Sobe somando: o nivel maior recebe, aditivamente, o menor filtrado em tenda.
    //    Somar na subida e o que faz o halo decair suavemente em varias escalas.
    for (let i = this.mips.length - 2; i >= 0; i--) {
      const src = this.mips[i + 1];
      this.upsampleMaterial.uniforms.tDiffuse.value = src.texture;
      this.upsampleMaterial.uniforms.uTexel.value.set(1 / src.width, 1 / src.height);
      this.quad.draw(renderer, this.upsampleMaterial, this.mips[i], true);
    }

    this.material.uniforms.tBloom.value = this.mips[0].texture;
    this.material.uniforms.uDaylight.value = frame.daylight;
    renderer.setRenderTarget(previousTarget);
  }

  public setStrength(strength: number): void {
    this.material.uniforms.uStrength.value = Math.max(0, strength);
  }

  public setThreshold(threshold: number): void {
    this.prefilterMaterial.uniforms.uThreshold.value = threshold;
  }

  public setScatter(scatter: number): void {
    this.material.uniforms.uScatter.value = Math.max(0, scatter);
    // Um espalhamento maior tambem alarga a tenda do upsample, senao so fica mais claro.
    this.upsampleMaterial.uniforms.uRadius.value = 0.6 + scatter * 0.8;
  }

  public get strength(): number {
    return this.material.uniforms.uStrength.value as number;
  }

  public dispose(): void {
    this.disposeMips();
    this.quad.dispose();
    this.material.dispose();
    this.prefilterMaterial.dispose();
    this.downsampleMaterial.dispose();
    this.upsampleMaterial.dispose();
  }

  private disposeMips(): void {
    for (const mip of this.mips) mip.dispose();
    this.mips = [];
  }
}
