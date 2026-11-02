/**
 * GLSL compartilhado pelos passes de tela: tonemapping filmico, grading, reconstrucao de
 * geometria a partir do depth buffer e ruido. Cada bloco e uma string para ser interpolada
 * no `fragmentShader` de um passe, mantendo as formulas em um unico lugar.
 */

/** Luminancia, saturacao, contraste e vibrance. */
export const COLOR_GLSL = /* glsl */ `
  const vec3 LUMA = vec3(0.2126, 0.7152, 0.0722);

  float lumaOf(vec3 c) { return dot(c, LUMA); }

  vec3 saturate3(vec3 c) { return clamp(c, 0.0, 1.0); }

  /** Saturacao em torno da luminancia: 1.0 e neutro. */
  vec3 applySaturation(vec3 c, float amount) {
    return mix(vec3(lumaOf(c)), c, amount);
  }

  /**
   * Vibrance: satura o que esta apagado e poupa o que ja esta saturado, para o verde da
   * folhagem e o azul do ceu ficarem ricos sem estourar a pele dos blocos de luz.
   */
  vec3 applyVibrance(vec3 c, float amount) {
    float mx = max(max(c.r, c.g), c.b);
    float mn = min(min(c.r, c.g), c.b);
    float sat = mx - mn;
    return applySaturation(c, 1.0 + amount * (1.0 - sat));
  }

  /** Contraste em torno do cinza medio linear (0.18), preservando o ponto de ancoragem. */
  vec3 applyContrast(vec3 c, float amount) {
    return max(vec3(0.0), (c - 0.18) * amount + 0.18);
  }

  /** Lift / gamma / gain classico de colorista (sombras / meios / altas). */
  vec3 liftGammaGain(vec3 c, vec3 lift, vec3 gamma, vec3 gain) {
    c = c * (1.0 - lift) + lift;
    c = pow(max(c, vec3(1e-5)), 1.0 / max(gamma, vec3(1e-3)));
    return c * gain;
  }

  /** Split toning: tinge sombras e altas em direcoes opostas, como os packs de MC. */
  vec3 splitTone(vec3 c, vec3 shadowTint, vec3 highlightTint, float balance) {
    float l = pow(max(clamp(lumaOf(c), 0.0, 1.0), 1e-4), balance);
    vec3 tint = mix(shadowTint, highlightTint, l);
    return c * tint;
  }
`;

/**
 * Curvas de tonemapping. ACES (fit de Stephen Hill, com as matrizes de entrada e saida) da
 * o contraste e o roll-off que se espera de um shaderpack; AgX preserva matiz nas altas
 * saturadas (lava, sol) sem virar amarelo; Hable e mais suave nas sombras.
 */
export const TONEMAP_GLSL = /* glsl */ `
  const mat3 ACES_INPUT = mat3(
    0.59719, 0.07600, 0.02840,
    0.35458, 0.90834, 0.13383,
    0.04823, 0.01566, 0.83777);
  const mat3 ACES_OUTPUT = mat3(
     1.60475, -0.10208, -0.00327,
    -0.53108,  1.10813, -0.07276,
    -0.07367, -0.00605,  1.07602);

  vec3 rrtAndOdtFit(vec3 v) {
    vec3 a = v * (v + 0.0245786) - 0.000090537;
    vec3 b = v * (0.983729 * v + 0.4329510) + 0.238081;
    return a / b;
  }

  vec3 tonemapACES(vec3 color) {
    color = ACES_INPUT * max(color, vec3(0.0));
    color = rrtAndOdtFit(max(color, vec3(0.0)));
    return clamp(ACES_OUTPUT * color, 0.0, 1.0);
  }

  const mat3 AGX_IN = mat3(
    0.8424790622530600, 0.0423282422610123, 0.0423756549057051,
    0.0784335999999992, 0.8784686364697720, 0.0784336000000000,
    0.0792237451477643, 0.0791661274605434, 0.8791429737931040);
  const mat3 AGX_OUT = mat3(
     1.19687900512017, -0.0528968517574562, -0.0529716355144438,
    -0.0980208811401368, 1.15190312990417,  -0.0980434501171241,
    -0.0990297440797205, -0.0989611768448433, 1.15107367264116);

  vec3 agxContrast(vec3 x) {
    vec3 x2 = x * x;
    vec3 x4 = x2 * x2;
    return 15.5 * x4 * x2 - 40.14 * x4 * x + 31.96 * x4
         - 6.868 * x2 * x + 0.4298 * x2 + 0.1191 * x - 0.00232;
  }

  vec3 tonemapAgX(vec3 color) {
    color = AGX_IN * max(color, vec3(0.0));
    // Log2 em [-12.47, 4.03] EV, normalizado para a sigmoide.
    color = clamp(log2(max(color, vec3(1e-10))), -12.47393, 4.026069);
    color = (color + 12.47393) / (4.026069 + 12.47393);
    color = agxContrast(color);
    color = AGX_OUT * color;
    // A sigmoide devolve valores ja codificados; volta ao linear para o renderer converter.
    return clamp(pow(max(color, vec3(0.0)), vec3(2.2)), 0.0, 1.0);
  }

  vec3 hableCurve(vec3 x) {
    const float A = 0.15, B = 0.50, C = 0.10, D = 0.20, E = 0.02, F = 0.30;
    return ((x * (A * x + C * B) + D * E) / (x * (A * x + B) + D * F)) - E / F;
  }

  vec3 tonemapHable(vec3 color) {
    const float W = 11.2;
    return clamp(hableCurve(color * 2.0) / hableCurve(vec3(W)), 0.0, 1.0);
  }

  vec3 tonemapReinhardJodie(vec3 color) {
    float l = dot(color, vec3(0.2126, 0.7152, 0.0722));
    vec3 tv = color / (1.0 + color);
    return clamp(mix(color / (1.0 + l), tv, tv), 0.0, 1.0);
  }

  /** 0 = ACES, 1 = AgX, 2 = Hable, 3 = Reinhard-Jodie. */
  vec3 tonemap(vec3 color, float mode) {
    if (mode < 0.5) return tonemapACES(color);
    if (mode < 1.5) return tonemapAgX(color);
    if (mode < 2.5) return tonemapHable(color);
    return tonemapReinhardJodie(color);
  }
`;

/**
 * Reconstrucao de geometria a partir do depth buffer: profundidade linear em unidades de
 * cena, posicao de view/mundo por pixel e a normal estimada pelas derivadas da posicao.
 * Requer `tDepth`, `uNear`, `uFar`, `uInvProjection` e `uInvView`.
 */
export const DEPTH_GLSL = /* glsl */ `
  uniform sampler2D tDepth;
  uniform float uNear;
  uniform float uFar;
  uniform mat4 uInvProjection;
  uniform mat4 uInvView;

  float rawDepth(vec2 uv) { return texture2D(tDepth, uv).x; }

  /** True quando o pixel nao tem geometria (ceu): o depth ficou no plano distante. */
  bool isSky(float raw) { return raw >= 0.999999; }

  /** Profundidade em unidades de cena (voxels), positiva para frente. */
  float linearDepth(float raw) {
    float z = raw * 2.0 - 1.0;
    return (2.0 * uNear * uFar) / (uFar + uNear - z * (uFar - uNear));
  }

  vec3 viewPosition(vec2 uv, float raw) {
    vec4 ndc = vec4(uv * 2.0 - 1.0, raw * 2.0 - 1.0, 1.0);
    vec4 view = uInvProjection * ndc;
    return view.xyz / view.w;
  }

  vec3 worldPosition(vec2 uv, float raw) {
    return (uInvView * vec4(viewPosition(uv, raw), 1.0)).xyz;
  }

  /**
   * Normal de view estimada pelas derivadas de tela. Em terreno de voxels isso devolve
   * exatamente a normal da face, porque cada face e um plano alinhado ao eixo.
   */
  vec3 viewNormal(vec2 uv, vec2 texel, vec3 centerView) {
    vec3 right = viewPosition(uv + vec2(texel.x, 0.0), rawDepth(uv + vec2(texel.x, 0.0)));
    vec3 up    = viewPosition(uv + vec2(0.0, texel.y), rawDepth(uv + vec2(0.0, texel.y)));
    vec3 left  = viewPosition(uv - vec2(texel.x, 0.0), rawDepth(uv - vec2(texel.x, 0.0)));
    vec3 down  = viewPosition(uv - vec2(0.0, texel.y), rawDepth(uv - vec2(0.0, texel.y)));
    // Escolhe, em cada eixo, o vizinho mais proximo em profundidade: nas silhuetas isso
    // evita a normal "esticada" que mistura dois objetos distintos.
    vec3 dx = abs(right.z - centerView.z) < abs(centerView.z - left.z) ? right - centerView : centerView - left;
    vec3 dy = abs(up.z - centerView.z) < abs(centerView.z - down.z) ? up - centerView : centerView - down;
    return normalize(cross(dx, dy));
  }
`;

/** Ruido para dithering e jitter de amostragem (quebra banding e padroes de kernel). */
export const NOISE_GLSL = /* glsl */ `
  float hash12(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * 0.1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
  }

  /** Interleaved gradient noise (Jimenez): otimo como dither espacial em um unico quadro. */
  float ign(vec2 pixel) {
    return fract(52.9829189 * fract(dot(pixel, vec2(0.06711056, 0.00583715))));
  }
`;
