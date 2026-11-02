import { ShaderMaterial, Vector2 } from 'three';
import { FULLSCREEN_VERTEX, type ScreenPass } from '../PostProcessor';

/**
 * FXAA: antialiasing como passe de tela.
 *
 * O MSAA do contexto nao vale para esta pipeline, porque a cena nao e desenhada na tela,
 * e sim em um alvo HDR que depois e lido por varios passes (e um alvo multisample nao
 * resolve junto com a `DepthTexture` que o AO e a volumetria leem). Entao a borda e
 * suavizada aqui, no fim, sobre a imagem ja tonemapeada: num mundo de voxels, onde quase
 * toda aresta e uma diagonal de alto contraste, isso e o que tira a escada da silhueta do
 * terreno contra o ceu.
 */
export class FxaaPass implements ScreenPass {
  public enabled = true;
  public readonly order = 95;
  public readonly material: ShaderMaterial;

  constructor() {
    this.material = new ShaderMaterial({
      uniforms: {
        tDiffuse: { value: null },
        uTexel: { value: new Vector2(1 / 1024, 1 / 1024) },
        uSubpixel: { value: 0.75 },
        uEdgeThreshold: { value: 0.125 },
        uEdgeThresholdMin: { value: 0.0312 }
      },
      vertexShader: FULLSCREEN_VERTEX,
      fragmentShader: /* glsl */ `
        uniform sampler2D tDiffuse;
        uniform vec2 uTexel;
        uniform float uSubpixel;
        uniform float uEdgeThreshold;
        uniform float uEdgeThresholdMin;
        varying vec2 vUv;

        #define FXAA_SEARCH_STEPS 10

        /**
         * Luma em espaco perceptual: a raiz aproxima a curva de gama, e sem ela o filtro
         * subestima as bordas nas sombras, justamente onde o serrilhado mais incomoda.
         */
        float fxaaLuma(vec3 c) {
          return sqrt(dot(c, vec3(0.299, 0.587, 0.114)));
        }

        float lumaAt(vec2 uv) {
          return fxaaLuma(texture2D(tDiffuse, uv).rgb);
        }

        void main() {
          vec2 texel = uTexel;
          vec3 center = texture2D(tDiffuse, vUv).rgb;
          float lumaM = fxaaLuma(center);
          float lumaN = lumaAt(vUv + vec2(0.0, -texel.y));
          float lumaS = lumaAt(vUv + vec2(0.0,  texel.y));
          float lumaW = lumaAt(vUv + vec2(-texel.x, 0.0));
          float lumaE = lumaAt(vUv + vec2( texel.x, 0.0));

          float rangeMin = min(lumaM, min(min(lumaN, lumaS), min(lumaW, lumaE)));
          float rangeMax = max(lumaM, max(max(lumaN, lumaS), max(lumaW, lumaE)));
          float range = rangeMax - rangeMin;

          // Contraste local baixo = superficie lisa: filtrar ali so borraria textura.
          if (range < max(uEdgeThresholdMin, rangeMax * uEdgeThreshold)) {
            gl_FragColor = vec4(center, 1.0);
            #include <colorspace_fragment>
            return;
          }

          float lumaNW = lumaAt(vUv + vec2(-texel.x, -texel.y));
          float lumaNE = lumaAt(vUv + vec2( texel.x, -texel.y));
          float lumaSW = lumaAt(vUv + vec2(-texel.x,  texel.y));
          float lumaSE = lumaAt(vUv + vec2( texel.x,  texel.y));

          float lumaNS = lumaN + lumaS;
          float lumaWE = lumaW + lumaE;
          float lumaNWSW = lumaNW + lumaSW;
          float lumaNESE = lumaNE + lumaSE;
          float lumaNWNE = lumaNW + lumaNE;
          float lumaSWSE = lumaSW + lumaSE;

          // Gradiente horizontal contra vertical: decide ao longo de qual eixo a borda
          // corre, para que a busca seguinte ande na direcao dela e nao atravessada.
          float edgeHoriz = abs(-2.0 * lumaW + lumaNWSW) + abs(-2.0 * lumaM + lumaNS) * 2.0 + abs(-2.0 * lumaE + lumaNESE);
          float edgeVert  = abs(-2.0 * lumaN + lumaNWNE) + abs(-2.0 * lumaM + lumaWE) * 2.0 + abs(-2.0 * lumaS + lumaSWSE);
          bool horizontal = edgeHoriz >= edgeVert;

          float luma1 = horizontal ? lumaN : lumaW;
          float luma2 = horizontal ? lumaS : lumaE;
          float gradient1 = abs(luma1 - lumaM);
          float gradient2 = abs(luma2 - lumaM);
          bool steepest1 = gradient1 >= gradient2;
          float gradientScaled = 0.25 * max(gradient1, gradient2);

          float stepLength = horizontal ? texel.y : texel.x;
          float lumaLocalAverage;
          if (steepest1) {
            stepLength = -stepLength;
            lumaLocalAverage = 0.5 * (luma1 + lumaM);
          } else {
            lumaLocalAverage = 0.5 * (luma2 + lumaM);
          }

          vec2 currentUv = vUv;
          if (horizontal) currentUv.y += stepLength * 0.5;
          else            currentUv.x += stepLength * 0.5;

          // Caminha pela borda nos dois sentidos ate achar onde ela termina. A distancia
          // ate cada ponta e o que diz o quanto este pixel deve se misturar ao vizinho.
          vec2 offset = horizontal ? vec2(texel.x, 0.0) : vec2(0.0, texel.y);
          vec2 uv1 = currentUv - offset;
          vec2 uv2 = currentUv + offset;
          float lumaEnd1 = lumaAt(uv1) - lumaLocalAverage;
          float lumaEnd2 = lumaAt(uv2) - lumaLocalAverage;
          bool reached1 = abs(lumaEnd1) >= gradientScaled;
          bool reached2 = abs(lumaEnd2) >= gradientScaled;
          if (!reached1) uv1 -= offset;
          if (!reached2) uv2 += offset;

          if (!reached1 || !reached2) {
            for (int i = 2; i < FXAA_SEARCH_STEPS; i++) {
              if (reached1 && reached2) break;
              if (!reached1) {
                lumaEnd1 = lumaAt(uv1) - lumaLocalAverage;
                reached1 = abs(lumaEnd1) >= gradientScaled;
              }
              if (!reached2) {
                lumaEnd2 = lumaAt(uv2) - lumaLocalAverage;
                reached2 = abs(lumaEnd2) >= gradientScaled;
              }
              // Passos crescentes: as pontas distantes sao alcancadas sem pagar um laco
              // longo nas bordas curtas, que sao a maioria.
              if (!reached1) uv1 -= offset * 1.5;
              if (!reached2) uv2 += offset * 1.5;
            }
          }

          float distance1 = horizontal ? (vUv.x - uv1.x) : (vUv.y - uv1.y);
          float distance2 = horizontal ? (uv2.x - vUv.x) : (uv2.y - vUv.y);
          bool isDirection1 = distance1 < distance2;
          float distanceFinal = min(distance1, distance2);
          float edgeThickness = distance1 + distance2;

          float lumaEndFinal = isDirection1 ? lumaEnd1 : lumaEnd2;
          bool correctVariation = ((lumaM - lumaLocalAverage) < 0.0) != (lumaEndFinal < 0.0);
          float pixelOffset = correctVariation
            ? (-distanceFinal / max(edgeThickness, 1e-5) + 0.5)
            : 0.0;

          // Termo de subpixel: trata o detalhe fino (um voxel isolado, uma folha) que nao
          // forma borda longa e que o deslocamento de borda sozinho deixaria tremendo.
          float lumaAverage = (1.0 / 12.0) * (2.0 * (lumaNS + lumaWE) + lumaNWSW + lumaNESE);
          float subpixelOffset = clamp(abs(lumaAverage - lumaM) / max(range, 1e-5), 0.0, 1.0);
          subpixelOffset = (-2.0 * subpixelOffset + 3.0) * subpixelOffset * subpixelOffset;
          subpixelOffset = subpixelOffset * subpixelOffset * uSubpixel;

          float finalOffset = max(pixelOffset, subpixelOffset);
          vec2 finalUv = vUv;
          if (horizontal) finalUv.y += finalOffset * stepLength;
          else            finalUv.x += finalOffset * stepLength;

          gl_FragColor = vec4(texture2D(tDiffuse, finalUv).rgb, 1.0);
          #include <colorspace_fragment>
        }
      `,
      depthTest: false,
      depthWrite: false
    });
  }

  public setSize(width: number, height: number): void {
    this.material.uniforms.uTexel.value.set(1 / Math.max(1, width), 1 / Math.max(1, height));
  }

  public dispose(): void {
    this.material.dispose();
  }
}
