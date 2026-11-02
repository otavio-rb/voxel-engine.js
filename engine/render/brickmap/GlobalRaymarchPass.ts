import {
  AlwaysDepth,
  BufferAttribute,
  BufferGeometry,
  Color,
  DataTexture,
  GLSL3,
  Matrix4,
  Mesh,
  NearestFilter,
  RGBAFormat,
  ShaderMaterial,
  UnsignedByteType,
  Vector3,
  type PerspectiveCamera
} from 'three';
import { blockRegistry } from '../../blocks/BlockRegistry';
import { AIR_TEXEL, BRICK, type GlobalBrickMap } from './GlobalBrickMap';
import { MAX_ACTIVE_LIGHTS, type EmissiveLightField } from './EmissiveLightField';

/**
 * Paleta indexada por id de bloco: RGB e a cor, A e a emissao (0 a 1).
 *
 * A emissao vai no alpha porque o shader precisa dela no mesmo fetch da cor -- um voxel de
 * cristal precisa brilhar sozinho, alem de iluminar os vizinhos pela lista de luzes.
 */
export function createPaletteTexture(): DataTexture {
  const data = new Uint8Array(256 * 4);
  const color = new Color();
  for (const block of blockRegistry.getAll()) {
    if (block.id < 0 || block.id > 255) continue;
    color.setHex(blockRegistry.getColor(block.id));
    const o = block.id * 4;
    data[o] = Math.round(color.r * 255);
    data[o + 1] = Math.round(color.g * 255);
    data[o + 2] = Math.round(color.b * 255);
    data[o + 3] = Math.round((blockRegistry.getLightEmission(block.id) / 15) * 255);
  }
  const texture = new DataTexture(data, 256, 1, RGBAFormat, UnsignedByteType);
  texture.minFilter = NearestFilter;
  texture.magFilter = NearestFilter;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  return texture;
}

/**
 * Triangulo que cobre a tela inteira em clip space.
 *
 * Um triangulo, e nao dois: na emenda diagonal de um quad a GPU roda os quads de 2x2 pixels
 * duas vezes, o que num shader deste tamanho e desperdicio puro.
 */
function fullscreenTriangle(): BufferGeometry {
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(new Float32Array([
    -1, -1, 0,
     3, -1, 0,
    -1,  3, 0
  ]), 3));
  return geometry;
}

const VERTEX_SHADER = /* glsl */ `
  out vec2 vNdc;

  void main() {
    vNdc = position.xy;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

const FRAGMENT_SHADER = /* glsl */ `
  precision highp float;
  precision highp int;
  precision highp usampler3D;

  layout(location = 0) out highp vec4 pc_fragColor;

  in vec2 vNdc;

  uniform usampler3D uIndirection;
  uniform usampler3D uAtlas;
  uniform sampler2D uPalette;
  uniform sampler2D uLights;

  uniform ivec3 uWindowOriginBrick;
  uniform ivec3 uWindowSize;
  uniform ivec3 uAtlasBricks;

  uniform mat4 uInvViewProjection;
  uniform mat4 uViewProjection;

  uniform vec3 uSunDirection;
  uniform vec3 uSunColor;
  uniform vec3 uSkyColor;
  uniform vec3 uAmbientColor;
  uniform float uDaylight;
  uniform float uMinLight;

  uniform float uFogNear;
  uniform float uFogFar;
  uniform float uVoxelGrain;
  uniform float uVoxelEdge;
  uniform float uVoxelEdgeFade;

  uniform int uLightCount;
  uniform int uShadowBudget;
  uniform float uSunShadowLength;
  uniform float uSkyProbeLength;
  uniform int uMaxBrickSteps;
  uniform float uDebugSteps;

  /**
   * Voxels de MUNDO por celula deste nivel. 1 no anel proximo, 4 ou 16 nos distantes.
   *
   * Todo o DDA trabalha em espaco de CELULA. A unica diferenca entre um anel e outro e a
   * conversao na entrada (origem e alcance divididos por isto) e na saida (a distancia do
   * acerto multiplicada de volta). E o que permite um anel de LOD reusar este shader
   * inteiro em vez de uma segunda copia do laco de travessia dentro dele.
   */
  uniform float uVoxelScale;
  /**
   * Distancia de mundo, a partir da camera, onde este anel comeca a desenhar.
   *
   * O anel distante precisa ignorar o que o proximo ja cobre, senao desenha a versao grossa
   * do terreno na frente da fina.
   */
  uniform float uNearClip;

  const uint AIR = ${AIR_TEXEL}u;
  const uint TAG_UNIFORM = 0x80000000u;
  const uint SLOT_MASK   = 0x3FFFFFFFu;
  const int  B = ${BRICK};

  /** Divisao inteira com piso. '>>' sobre negativo e indefinido em GLSL ES; isto nao e. */
  int floorDivB(int a) {
    return a >= 0 ? a / B : -(((-a) + B - 1) / B);
  }

  ivec3 brickOf(ivec3 v) {
    return ivec3(floorDivB(v.x), floorDivB(v.y), floorDivB(v.z));
  }

  /** Enderecamento em toro: o brick global 'b' mora sempre no texel 'b mod N'. */
  ivec3 wrap(ivec3 b) {
    return ((b % uWindowSize) + uWindowSize) % uWindowSize;
  }

  bool insideWindow(ivec3 b) {
    ivec3 rel = b - uWindowOriginBrick;
    return all(greaterThanEqual(rel, ivec3(0))) && all(lessThan(rel, uWindowSize));
  }

  /** Canto do slot 's' dentro do atlas, em texels. */
  ivec3 slotOrigin(uint s) {
    int i = int(s);
    return ivec3(
      i % uAtlasBricks.x,
      (i / uAtlasBricks.x) % uAtlasBricks.y,
      i / (uAtlasBricks.x * uAtlasBricks.y)
    ) * B;
  }

  /**
   * Id do bloco em QUALQUER coordenada de voxel do mundo, ou AIR.
   *
   * E isto que torna o apron desnecessario: AO, sombra e normal consultam o mundo direto, sem
   * depender de uma casca copiada na fronteira do chunk.
   */
  uint voxelAt(ivec3 v) {
    ivec3 b = brickOf(v);
    if (!insideWindow(b)) return AIR;
    uint cell = texelFetch(uIndirection, wrap(b), 0).r;
    if (cell == 0u) return AIR;
    if ((cell & TAG_UNIFORM) != 0u) return cell & 0xFFu;
    return texelFetch(uAtlas, slotOrigin(cell & SLOT_MASK) + (v - b * B), 0).r;
  }

  bool solidAt(ivec3 v) {
    return voxelAt(v) != AIR;
  }

  struct Hit {
    bool  valid;
    float t;       // distancia ao longo do raio, a partir da origem passada
    ivec3 voxel;
    vec3  normal;
    uint  id;
    int   steps;
  };

  /**
   * DDA hierarquico de dois niveis sobre o brickmap global.
   *
   * Nivel 1 anda na grade de bricks: um brick vazio custa UM passo e pula 8 voxels; um brick
   * uniforme colide na face de entrada sem olhar voxel nenhum. Nivel 2 so roda dentro de brick
   * misto, no maximo 3*8 passos.
   *
   * Os limites de celula sao calculados a partir do ponto de entrada real ('ro + rd * tStart'),
   * nunca de uma coordenada arredondada e depois presa com 'clamp': entrar exatamente sobre um
   * plano de brick e o caso comum (e a borda da janela), e o 'clamp' fazia o tMax nascer ate 8
   * voxels adiantado, o que o olho le como furo na parede.
   */
  Hit march(vec3 ro, vec3 rd, float tStart, float tMax, int maxBrickSteps) {
    Hit h;
    h.valid = false;
    h.t = tMax;
    h.voxel = ivec3(0);
    h.normal = vec3(0.0);
    h.id = AIR;
    h.steps = 0;

    vec3 safeDir = rd;
    if (abs(safeDir.x) < 1e-6) safeDir.x = safeDir.x >= 0.0 ? 1e-6 : -1e-6;
    if (abs(safeDir.y) < 1e-6) safeDir.y = safeDir.y >= 0.0 ? 1e-6 : -1e-6;
    if (abs(safeDir.z) < 1e-6) safeDir.z = safeDir.z >= 0.0 ? 1e-6 : -1e-6;
    vec3 invDir = 1.0 / safeDir;

    vec3 p = ro + rd * tStart;
    ivec3 stepDir = ivec3(sign(safeDir));
    vec3 stepPos = max(vec3(stepDir), vec3(0.0));   // 1 quando avanca, 0 quando recua

    ivec3 bc = brickOf(ivec3(floor(p)));
    vec3 tDeltaB = abs(invDir) * float(B);
    vec3 tMaxB = ((vec3(bc) + stepPos) * float(B) - p) * invDir;

    // Eixo pelo qual o raio entrou na primeira celula; -1 quando a camera nasce dentro dela.
    int axis = -1;
    float t = 0.0;
    float span = tMax - tStart;

    for (int i = 0; i < 1024; i++) {
      if (i >= maxBrickSteps || t > span) break;
      h.steps++;

      if (!insideWindow(bc)) break;

      uint cell = texelFetch(uIndirection, wrap(bc), 0).r;

      if (cell != 0u) {
        if ((cell & TAG_UNIFORM) != 0u) {
          h.valid = true;
          h.t = tStart + t;
          h.voxel = ivec3(floor(p + rd * t));
          h.voxel = clamp(h.voxel, bc * B, bc * B + (B - 1));
          h.id = cell & 0xFFu;
          h.normal = axis < 0 ? vec3(0.0)
            : (axis == 0 ? vec3(float(-stepDir.x), 0.0, 0.0)
            :  axis == 1 ? vec3(0.0, float(-stepDir.y), 0.0)
            :              vec3(0.0, 0.0, float(-stepDir.z)));
          return h;
        }

        // --- Nivel 2: micro-DDA dentro do brick misto ---
        ivec3 origin = slotOrigin(cell & SLOT_MASK);
        vec3 pb = p + rd * t;
        ivec3 vMin = bc * B;
        ivec3 vc = clamp(ivec3(floor(pb)), vMin, vMin + (B - 1));

        vec3 tDeltaV = abs(invDir);
        vec3 tMaxV = (vec3(vc) + stepPos - pb) * invDir;

        int vAxis = axis;
        float tv = 0.0;

        for (int j = 0; j < ${BRICK * 3}; j++) {
          h.steps++;
          uint id = texelFetch(uAtlas, origin + (vc - vMin), 0).r;
          if (id != AIR) {
            h.valid = true;
            h.t = tStart + t + tv;
            h.voxel = vc;
            h.id = id;
            h.normal = vAxis < 0 ? vec3(0.0)
              : (vAxis == 0 ? vec3(float(-stepDir.x), 0.0, 0.0)
              :  vAxis == 1 ? vec3(0.0, float(-stepDir.y), 0.0)
              :               vec3(0.0, 0.0, float(-stepDir.z)));
            return h;
          }

          if (tMaxV.x < tMaxV.y) {
            if (tMaxV.x < tMaxV.z) { tv = tMaxV.x; vc.x += stepDir.x; tMaxV.x += tDeltaV.x; vAxis = 0; }
            else                   { tv = tMaxV.z; vc.z += stepDir.z; tMaxV.z += tDeltaV.z; vAxis = 2; }
          } else {
            if (tMaxV.y < tMaxV.z) { tv = tMaxV.y; vc.y += stepDir.y; tMaxV.y += tDeltaV.y; vAxis = 1; }
            else                   { tv = tMaxV.z; vc.z += stepDir.z; tMaxV.z += tDeltaV.z; vAxis = 2; }
          }

          if (any(lessThan(vc, vMin)) || any(greaterThan(vc, vMin + (B - 1)))) break;
        }
      }

      // --- Avanca um brick ---
      if (tMaxB.x < tMaxB.y) {
        if (tMaxB.x < tMaxB.z) { t = tMaxB.x; bc.x += stepDir.x; tMaxB.x += tDeltaB.x; axis = 0; }
        else                   { t = tMaxB.z; bc.z += stepDir.z; tMaxB.z += tDeltaB.z; axis = 2; }
      } else {
        if (tMaxB.y < tMaxB.z) { t = tMaxB.y; bc.y += stepDir.y; tMaxB.y += tDeltaB.y; axis = 1; }
        else                   { t = tMaxB.z; bc.z += stepDir.z; tMaxB.z += tDeltaB.z; axis = 2; }
      }
    }

    return h;
  }

  /**
   * Raio de sombra: so interessa SE bate, nao onde.
   *
   * Nao e 'march' reaproveitado de proposito. Um pixel chama isto ate cinco vezes (sol, ceu e
   * o orcamento de luzes), e o GLSL nao tem chamada de funcao de verdade -- tudo e inline.
   * Cinco copias de 'march', com o struct Hit, a normal e o id, estouram o orcamento de
   * registradores e derrubam a ocupancia da GPU. Esta versao so precisa saber se parou, entao
   * sai no primeiro solido e nao carrega nada alem dos contadores do DDA.
   */
  bool occluded(vec3 ro, vec3 rd, float maxDist, int maxBrickSteps) {
    if (maxDist <= 0.0) return false;

    vec3 safeDir = rd;
    if (abs(safeDir.x) < 1e-6) safeDir.x = safeDir.x >= 0.0 ? 1e-6 : -1e-6;
    if (abs(safeDir.y) < 1e-6) safeDir.y = safeDir.y >= 0.0 ? 1e-6 : -1e-6;
    if (abs(safeDir.z) < 1e-6) safeDir.z = safeDir.z >= 0.0 ? 1e-6 : -1e-6;
    vec3 invDir = 1.0 / safeDir;

    ivec3 stepDir = ivec3(sign(safeDir));
    vec3 stepPos = max(vec3(stepDir), vec3(0.0));

    ivec3 bc = brickOf(ivec3(floor(ro)));
    vec3 tDeltaB = abs(invDir) * float(B);
    vec3 tMaxB = ((vec3(bc) + stepPos) * float(B) - ro) * invDir;
    float t = 0.0;

    for (int i = 0; i < 128; i++) {
      if (i >= maxBrickSteps || t > maxDist) return false;
      if (!insideWindow(bc)) return false;

      uint cell = texelFetch(uIndirection, wrap(bc), 0).r;

      if ((cell & TAG_UNIFORM) != 0u) return true;

      if (cell != 0u) {
        ivec3 origin = slotOrigin(cell & SLOT_MASK);
        vec3 pb = ro + rd * t;
        ivec3 vMin = bc * B;
        ivec3 vc = clamp(ivec3(floor(pb)), vMin, vMin + (B - 1));
        vec3 tMaxV = (vec3(vc) + stepPos - pb) * invDir;
        vec3 tDeltaV = abs(invDir);
        float tv = 0.0;

        for (int j = 0; j < ${BRICK * 3}; j++) {
          if (texelFetch(uAtlas, origin + (vc - vMin), 0).r != AIR) {
            return t + tv < maxDist;
          }
          if (tMaxV.x < tMaxV.y) {
            if (tMaxV.x < tMaxV.z) { tv = tMaxV.x; vc.x += stepDir.x; tMaxV.x += tDeltaV.x; }
            else                   { tv = tMaxV.z; vc.z += stepDir.z; tMaxV.z += tDeltaV.z; }
          } else {
            if (tMaxV.y < tMaxV.z) { tv = tMaxV.y; vc.y += stepDir.y; tMaxV.y += tDeltaV.y; }
            else                   { tv = tMaxV.z; vc.z += stepDir.z; tMaxV.z += tDeltaV.z; }
          }
          if (any(lessThan(vc, vMin)) || any(greaterThan(vc, vMin + (B - 1)))) break;
        }
      }

      if (tMaxB.x < tMaxB.y) {
        if (tMaxB.x < tMaxB.z) { t = tMaxB.x; bc.x += stepDir.x; tMaxB.x += tDeltaB.x; }
        else                   { t = tMaxB.z; bc.z += stepDir.z; tMaxB.z += tDeltaB.z; }
      } else {
        if (tMaxB.y < tMaxB.z) { t = tMaxB.y; bc.y += stepDir.y; tMaxB.y += tDeltaB.y; }
        else                   { t = tMaxB.z; bc.z += stepDir.z; tMaxB.z += tDeltaB.z; }
      }
    }

    return false;
  }

  float hash13(vec3 p) {
    p = fract(p * 0.3183099 + 0.1);
    p *= 17.0;
    return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
  }

  /**
   * Oclusao de ambiente por voxel, de verdade.
   *
   * No caminho de malha a AO e por vertice, e um quad fundido de 8x8 voxels interpola uma AO
   * so -- que e parte do motivo de uma parede de minivoxels parecer uma parede de blocos
   * grandes. Aqui o voxel exato e conhecido, entao a AO e a dele.
   *
   * Sao os 8 vizinhos do plano da face (4 lados + 4 diagonais), com a diagonal pesando menos,
   * mais um toque de oclusao do voxel imediatamente a frente para fechar fendas estreitas.
   */
  float voxelAO(ivec3 v, vec3 n) {
    vec3 ta = abs(n.y) > 0.5 ? vec3(1.0, 0.0, 0.0) : vec3(0.0, 1.0, 0.0);
    vec3 tb = cross(n, ta);
    ivec3 nn = ivec3(n), ia = ivec3(ta), ib = ivec3(tb);

    float side = 0.0;
    side += solidAt(v + nn + ia) ? 1.0 : 0.0;
    side += solidAt(v + nn - ia) ? 1.0 : 0.0;
    side += solidAt(v + nn + ib) ? 1.0 : 0.0;
    side += solidAt(v + nn - ib) ? 1.0 : 0.0;

    float diag = 0.0;
    diag += solidAt(v + nn + ia + ib) ? 1.0 : 0.0;
    diag += solidAt(v + nn + ia - ib) ? 1.0 : 0.0;
    diag += solidAt(v + nn - ia + ib) ? 1.0 : 0.0;
    diag += solidAt(v + nn - ia - ib) ? 1.0 : 0.0;

    return clamp(1.0 - 0.16 * side - 0.07 * diag, 0.08, 1.0);
  }

  void main() {
    // --- Raio da camera, reconstruido do NDC ---
    vec4 nearH = uInvViewProjection * vec4(vNdc, -1.0, 1.0);
    vec4 farH  = uInvViewProjection * vec4(vNdc,  1.0, 1.0);
    vec3 roWorld = nearH.xyz / nearH.w;
    vec3 rd = normalize(farH.xyz / farH.w - roWorld);
    // Daqui para baixo tudo esta em espaco de CELULA. Ver uVoxelScale.
    vec3 ro = roWorld / uVoxelScale;

    // --- Recorte na janela residente, em coordenadas de voxel do mundo ---
    vec3 wMin = vec3(uWindowOriginBrick * B);
    vec3 wMax = vec3((uWindowOriginBrick + uWindowSize) * B);

    vec3 safeDir = rd;
    if (abs(safeDir.x) < 1e-6) safeDir.x = safeDir.x >= 0.0 ? 1e-6 : -1e-6;
    if (abs(safeDir.y) < 1e-6) safeDir.y = safeDir.y >= 0.0 ? 1e-6 : -1e-6;
    if (abs(safeDir.z) < 1e-6) safeDir.z = safeDir.z >= 0.0 ? 1e-6 : -1e-6;
    vec3 inv = 1.0 / safeDir;
    vec3 ta = (wMin - ro) * inv;
    vec3 tb = (wMax - ro) * inv;
    vec3 tn = min(ta, tb);
    vec3 tf = max(ta, tb);
    float tEnter = max(max(tn.x, tn.y), tn.z);
    float tExit  = min(min(tf.x, tf.y), tf.z);

    // Um epsilon para dentro: entrar exatamente sobre o plano da janela deixa 'brickOf' do
    // lado de fora por arredondamento, e o raio morre no primeiro teste.
    float t0 = max(max(tEnter, 0.0), uNearClip / uVoxelScale) + 1e-3;
    if (tExit <= t0) discard;

    Hit hit = march(ro, rd, t0, min(tExit, uFogFar * 1.25 / uVoxelScale), uMaxBrickSteps);

    // Sem acerto, o pixel pertence ao ceu: deixa o Sky desenhar por baixo.
    if (!hit.valid) discard;

    vec3 cellHit = ro + rd * hit.t;
    vec3 worldHit = cellHit * uVoxelScale;
    float worldDist = hit.t * uVoxelScale;
    vec4 clip = uViewProjection * vec4(worldHit, 1.0);
    gl_FragDepth = clamp((clip.z / clip.w) * 0.5 + 0.5, 0.0, 1.0);

    // Custo por pixel: quantos passos de DDA foram gastos. Verde barato, vermelho caro.
    // E a leitura direta de onde o pulo de espaco vazio nao esta funcionando.
    if (uDebugSteps > 0.5) {
      float load = float(hit.steps) / float(uMaxBrickSteps);
      pc_fragColor = vec4(load, 1.0 - load, 0.0, 1.0);
      return;
    }

    vec3 n = hit.normal;
    // Camera nascida dentro de um voxel solido: sem face de entrada, usa a direcao do raio.
    if (dot(n, n) < 0.5) n = -normalize(rd);

    vec4 pal = texelFetch(uPalette, ivec2(int(hit.id), 0), 0);
    vec3 albedo = pal.rgb;
    float emission = pal.a;

    // Grao por voxel: aqui sai de graca, o voxel exato ja e conhecido.
    float grain = hash13(vec3(hit.voxel) + 17.0);
    albedo *= 1.0 - uVoxelGrain * 0.5 + uVoxelGrain * grain;

    float ao = voxelAO(hit.voxel, n);

    // Origem das secundarias, deslocada da face para nao bater no proprio voxel.
    vec3 shadowOrigin = cellHit + n * 0.03;

    vec3 lighting = vec3(0.0);

    // --- Sol, com sombra tracada ---
    if (uDaylight > 0.01) {
      float ndl = max(dot(n, uSunDirection), 0.0);
      if (ndl > 0.0 && !occluded(shadowOrigin, uSunDirection, uSunShadowLength / uVoxelScale, 96)) {
        lighting += uSunColor * ndl * uDaylight;
      }
    }

    // --- Ceu: uma sondagem para cima diz se este ponto ve o aberto ---
    // E o que separa a caverna do exterior sem precisar de lightmap: dentro da caverna o raio
    // bate no teto e o ambiente cai para 'uMinLight', que e a escuridao de fundo da cena.
    vec3 skyDir = normalize(n + vec3(0.0, 1.6, 0.0));
    float skyVis = occluded(shadowOrigin, skyDir, uSkyProbeLength / uVoxelScale, 48) ? 0.0 : 1.0;
    lighting += uAmbientColor * mix(0.06, 0.9, skyVis) * uDaylight;


    // --- Luzes emissivas ---
    // A lista chega ordenada da mais forte para a mais fraca (ver EmissiveLightField.refresh),
    // entao gastar o orcamento de sombra nas primeiras e gasta-lo onde se enxerga a diferenca.
    int shadowsLeft = uShadowBudget;
    for (int i = 0; i < ${MAX_ACTIVE_LIGHTS}; i++) {
      if (i >= uLightCount) break;

      vec4 lp = texelFetch(uLights, ivec2(i * 2, 0), 0);
      vec3 toLight = (lp.xyz - worldHit) / uVoxelScale;   // espaco de celula
      float dist = length(toLight);
      float reach = lp.w / uVoxelScale;
      if (dist > reach) continue;

      vec3 ldir = toLight / max(dist, 1e-4);
      float ndl = max(dot(n, ldir), 0.0);
      if (ndl <= 0.0) continue;

      vec4 lc = texelFetch(uLights, ivec2(i * 2 + 1, 0), 0);
      float falloff = 1.0 - dist / reach;
      float atten = falloff * falloff * lc.w;
      if (atten < 0.004) continue;

      if (shadowsLeft > 0) {
        shadowsLeft--;
        if (occluded(shadowOrigin, ldir, dist - 0.6, 64)) continue;
      }

      lighting += lc.rgb * ndl * atten;
    }

    // Piso de luz: sem ele o fundo da caverna e preto puro e some junto com o relevo.
    lighting = max(lighting, vec3(uMinLight));

    vec3 shaded = albedo * lighting * ao;
    // O proprio voxel emissivo acende, para que o cristal tenha nucleo e nao so halo.
    // 1.25 e nao 2.2: acima de ~1.3 o nucleo satura antes do bloom e o cristal vira uma
    // mancha branca sem cor -- um aglomerado de neon ciano chegava na tela como papel.
    shaded += albedo * emission * 1.25;

    // --- Contorno de voxel ---
    // A posicao exata dentro do voxel e conhecida: nao precisa de fract do mundo nem de
    // heuristica de derivada como no caminho de malha.
    if (uVoxelEdge > 0.0) {
      vec3 inVoxel = cellHit - vec3(hit.voxel);
      vec3 d = abs(inVoxel - 0.5);
      vec3 planeMask = 1.0 - abs(n);
      float edge = max(max(d.x * planeMask.x, d.y * planeMask.y), d.z * planeMask.z);
      float line = smoothstep(0.40, 0.5, edge);
      float fade = 1.0 - smoothstep(uVoxelEdgeFade * 0.35, uVoxelEdgeFade, worldDist);
      shaded *= 1.0 - uVoxelEdge * line * fade;
    }

    float fog = smoothstep(uFogNear, uFogFar, worldDist);
    pc_fragColor = vec4(mix(shaded, uSkyColor, fog), 1.0);
  }
`;

export interface GlobalRaymarchPassOptions {
  voxelsPerBlock: number;
  voxelGrain: number;
  voxelEdge: number;
  voxelEdgeFadeBlocks: number;
  /** Quantos raios de sombra de luz pontual cada pixel pode gastar. */
  shadowBudget?: number;
  /**
   * Distancia de mundo onde este anel comeca a desenhar. 0 no anel proximo.
   *
   * Um anel de LOD cobre o que esta ALEM do anel anterior; sem isto ele desenharia a versao
   * grossa do terreno por cima da fina.
   */
  nearClip?: number;
  /**
   * Ordem de desenho. Aneis mais grossos desenham primeiro (valor menor), e o anel fino
   * escreve por cima: as faixas sao disjuntas em distancia, entao quem desenha depois esta
   * sempre mais perto.
   */
  renderOrder?: number;
  /**
   * Se este passe e quem recalcula a lista de luzes do quadro. Default true.
   *
   * Com dois aneis desenhando, os dois chamam `update` por quadro e a lista seria
   * reordenada duas vezes para o mesmo resultado. O anel fino manda; o distante so le.
   */
  ownsLights?: boolean;
}

/**
 * O mundo inteiro em um draw call.
 *
 * O objeto e um triangulo de tela cheia com `depthFunc: Always` e escrita de profundidade:
 * ele desenha primeiro, preenche o z-buffer com a profundidade real do voxel atingido, e tudo
 * que vem depois -- ceu, particulas, entidades, contorno do bloco mirado, mao do jogador --
 * testa contra ele normalmente. Pixel sem acerto faz `discard`, entao o ceu aparece por baixo
 * sem precisar de ordem especial.
 *
 * `depthTest` fica LIGADO com funcao `Always` em vez de desligado: com o teste de profundidade
 * desligado o OpenGL tambem nao escreve profundidade, e o mundo ficaria por cima de tudo.
 */
export class GlobalRaymarchPass {
  public readonly mesh: Mesh;
  public readonly material: ShaderMaterial;

  private readonly palette: DataTexture;
  private readonly ownsLights: boolean;
  private readonly invViewProjection = new Matrix4();
  private readonly viewProjection = new Matrix4();

  constructor(
    private readonly brickMap: GlobalBrickMap,
    private readonly lights: EmissiveLightField,
    options: GlobalRaymarchPassOptions
  ) {
    this.palette = createPaletteTexture();
    this.ownsLights = options.ownsLights ?? true;

    const s = options.voxelsPerBlock;
    const atlas = brickMap.atlas;

    this.material = new ShaderMaterial({
      glslVersion: GLSL3,
      vertexShader: VERTEX_SHADER,
      fragmentShader: FRAGMENT_SHADER,
      depthTest: true,
      depthWrite: true,
      depthFunc: AlwaysDepth,
      transparent: false,
      uniforms: {
        uIndirection: { value: brickMap.indirection.texture },
        uAtlas: { value: atlas.texture },
        uPalette: { value: this.palette },
        uLights: { value: lights.texture },

        uWindowOriginBrick: { value: new Vector3(0, 0, 0) },
        uWindowSize: { value: new Vector3(brickMap.nx, brickMap.ny, brickMap.nz) },
        uAtlasBricks: {
          value: new Vector3(atlas.width / BRICK, atlas.height / BRICK, atlas.depth / BRICK)
        },

        uInvViewProjection: { value: this.invViewProjection },
        uViewProjection: { value: this.viewProjection },

        uSunDirection: { value: new Vector3(0.4, 0.9, 0.2).normalize() },
        uSunColor: { value: new Color(1.0, 0.96, 0.9) },
        uSkyColor: { value: new Color(0x87ceeb) },
        uAmbientColor: { value: new Color(0.55, 0.66, 0.86) },
        uDaylight: { value: 1.0 },
        uMinLight: { value: 0.025 },

        uFogNear: { value: 96 * s },
        uFogFar: { value: 200 * s },
        uVoxelGrain: { value: options.voxelGrain },
        uVoxelEdge: { value: options.voxelEdge },
        uVoxelEdgeFade: { value: options.voxelEdgeFadeBlocks * s },

        uLightCount: { value: 0 },
        uShadowBudget: { value: options.shadowBudget ?? 3 },
        // Sombra de sol curta de proposito: ela existe para dar relevo de contato, nao para
        // projetar a montanha inteira. Longa, custaria o dobro do raio primario por pixel.
        uSunShadowLength: { value: 6 * s },
        uSkyProbeLength: { value: 5 * s },
        uMaxBrickSteps: { value: 256 },
        uVoxelScale: { value: brickMap.voxelScale },
        uNearClip: { value: options.nearClip ?? 0 },
        uDebugSteps: { value: 0.0 }
      }
    });

    this.mesh = new Mesh(fullscreenTriangle(), this.material);
    this.mesh.frustumCulled = false;
    // Antes de tudo: ele e quem preenche o z-buffer do mundo.
    this.mesh.renderOrder = options.renderOrder ?? -1000;
    this.mesh.matrixAutoUpdate = false;

    // A matriz da camera e lida AQUI, e nao no tick do mundo, porque o raio primario sai
    // dela: um quadro de defasagem entre a camera do raymarch e a do resto da cena aparece
    // como o mundo deslizando contra as particulas e a mao do jogador a cada giro de mouse.
    // `onBeforeRender` roda imediatamente antes do draw, com a camera que vai ser usada.
    this.mesh.onBeforeRender = (_renderer, _scene, camera) => {
      this.update(camera as PerspectiveCamera);
    };
  }

  public get windowBricksX(): number { return this.brickMap.nx; }
  public get windowBricksY(): number { return this.brickMap.ny; }
  public get windowBricksZ(): number { return this.brickMap.nz; }

  /** A janela residente segue a camera, alinhada ao brick. */
  public setWindowOriginBrick(bx: number, by: number, bz: number): void {
    this.material.uniforms.uWindowOriginBrick.value.set(bx, by, bz);
  }

  public update(camera: PerspectiveCamera): void {
    camera.updateMatrixWorld();
    this.viewProjection.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    this.invViewProjection.copy(this.viewProjection).invert();

    if (this.ownsLights) this.lights.refresh(camera.position);
    this.material.uniforms.uLightCount.value = this.lights.activeCount;

    // O teto de passos cobre a diagonal da janela em bricks: um raio rasante atravessa tudo.
    const diagonal = Math.ceil(
      Math.sqrt(this.brickMap.nx ** 2 + this.brickMap.ny ** 2 + this.brickMap.nz ** 2)
    );
    this.material.uniforms.uMaxBrickSteps.value = Math.min(1024, diagonal + 8);
  }

  public setDebugSteps(on: boolean): void {
    this.material.uniforms.uDebugSteps.value = on ? 1.0 : 0.0;
  }

  public dispose(): void {
    this.mesh.geometry.dispose();
    this.material.dispose();
    this.palette.dispose();
  }
}
