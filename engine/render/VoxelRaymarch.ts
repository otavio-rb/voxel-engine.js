import {
  BackSide,
  ClampToEdgeWrapping,
  Color,
  Data3DTexture,
  DataTexture,
  GLSL3,
  NearestFilter,
  RGBAFormat,
  RedIntegerFormat,
  Matrix4,
  ShaderMaterial,
  UnsignedByteType,
  Vector3
} from 'three';
import { blockRegistry } from '../blocks/BlockRegistry';

/**
 * Renderizador alternativo de chunk: raymarch de voxels em textura 3D, em vez de malha.
 *
 * PROTOTIPO, atras de `chunkRenderer: 'raymarch'`. O caminho de malha continua o default e
 * intocado.
 *
 * ## Por que
 *
 * Medido neste projeto, num chunk 64^3 de superficie do mundo de minivoxels:
 *
 *   faces expostas .................... 20.270
 *   quads apos greedy meshing ......... 10.161   (fusao de apenas 1,99x)
 *   geometria ......................... 2,7 MB   (10,9x os dados de voxel)
 *   tempo de meshing .................. ~76 ms   (56 ms so da varredura, mesmo liso)
 *
 * O fator de fusao de 1,99x e o nucleo do problema: greedy meshing depende de superficie
 * plana, e superficie plana e exatamente o que faz um minivoxel parecer um bloco grande.
 * Quanto melhor o terreno fica, pior a malha fica — a tensao e estrutural.
 *
 * No raymarch o custo escala com PIXELS, nao com voxels de superficie. Terreno mais rugoso
 * passa a ser gratis. A memoria de GPU cai para o proprio dado de voxel (1 byte/voxel, 256 KB
 * por chunk 64^3 contra 2,7 MB de geometria), nao existe passo de meshing, e uma edicao e um
 * reenvio de textura em vez de remalhar o chunk.
 *
 * ## O que ainda falta para virar o renderizador de verdade
 *
 *  - Pular espaco vazio (mip de ocupancia ou brickmap). Sem isso, raio rasante paga o DDA
 *    inteiro. Num unico chunk de lado 64 o teto e 3*64 = 192 passos, aceitavel para prototipo.
 *  - Luz de verdade: o prototipo sombreia por face e AO local, sem o lightmap por voxel que o
 *    caminho de malha ja calcula. E para julgar forma e desempenho, nao a iluminacao final.
 *  - Escrever gl_FragDepth desliga early-Z. Com muitos chunks sobrepostos isso pesa.
 *
 * ## Risco conhecido
 *
 * A aritmetica do DDA e uma transcricao de `voxelDDA.ts`, que tem teste em Node: 4.000 raios
 * mirados com normal e ponto de impacto conferidos, e 3.000 raios conferidos contra oraculo de
 * forca bruta. O que NAO esta verificado e o encanamento de GPU — formato de textura inteira,
 * os defines de compatibilidade do three para GLSL3, e a composicao por depth.
 */

/** 255 e como -1 (ar, em Int8Array) aparece ao ler o mesmo buffer como Uint8. */
const AIR_TEXEL = 255;

export interface VoxelRaymarchUniformValues {
  sunDirection: Vector3;
  skyColor: Color;
  fogNear: number;
  fogFar: number;
  daylight: number;
  minLight: number;
  voxelEdge: number;
  voxelEdgeFade: number;
  voxelGrain: number;
}

/**
 * Textura 3D de ids de bloco, compartilhando o buffer do chunk sem copia.
 *
 * O array de blocos e Int8Array indexado por `ly * S*S + lz * S + lx`, e a Data3DTexture le os
 * dados com x variando mais rapido, depois y, depois z. Logo o eixo Y do voxel vira o eixo Z
 * da textura: a amostragem no shader usa `ivec3(x, z, y)`. Ler o mesmo buffer como Uint8 faz
 * o ar (-1) aparecer como 255, o que serve direto como sentinela.
 */
export function createVoxelTexture(blocks: Int8Array, size: number): Data3DTexture {
  // O cast existe porque o tipo de `buffer` admite SharedArrayBuffer, que Data3DTexture nao
  // aceita. Os buffers de chunk vem de ArrayBuffer comum (gerados no worker e transferidos).
  const view = new Uint8Array(blocks.buffer as ArrayBuffer, blocks.byteOffset, blocks.length);
  const texture = new Data3DTexture(view, size, size, size);
  texture.format = RedIntegerFormat;
  texture.type = UnsignedByteType;
  texture.internalFormat = 'R8UI';
  texture.minFilter = NearestFilter;
  texture.magFilter = NearestFilter;
  texture.wrapS = ClampToEdgeWrapping;
  texture.wrapT = ClampToEdgeWrapping;
  texture.wrapR = ClampToEdgeWrapping;
  texture.unpackAlignment = 1;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  return texture;
}

/** Paleta de cores indexada por id de bloco, como textura 256x1. */
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
    data[o + 3] = 255;
  }
  const texture = new DataTexture(data, 256, 1, RGBAFormat, UnsignedByteType);
  texture.minFilter = NearestFilter;
  texture.magFilter = NearestFilter;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  return texture;
}

const VERTEX_SHADER = /* glsl */ `
  varying vec3 vWorldPos;

  void main() {
    vec4 world = modelMatrix * vec4(position, 1.0);
    vWorldPos = world.xyz;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

/**
 * Transcricao de `voxelDDA.ts` para GLSL. Mantida proxima da referencia de proposito: a
 * referencia e o que tem teste, e divergir dela sem motivo tira o valor desse teste.
 */
const FRAGMENT_SHADER = /* glsl */ `
  precision highp float;
  precision highp int;
  precision highp usampler3D;

  uniform usampler3D uVoxels;
  uniform sampler2D uPalette;
  uniform vec3 uChunkOrigin;
  uniform float uChunkSize;
  uniform int uMaxSteps;

  uniform vec3 uSunDirection;
  uniform vec3 uSkyColor;
  uniform float uFogNear;
  uniform float uFogFar;
  uniform float uDaylight;
  uniform float uMinLight;
  uniform float uVoxelEdge;
  uniform float uVoxelEdgeFade;
  uniform float uVoxelGrain;
  uniform float uDebugSteps;

  /**
   * Matriz de projecao, passada a mao.
   *
   * O three declara viewMatrix e cameraPosition no prefixo do fragment shader, mas
   * projectionMatrix so no do vertex. Usar o nome direto aqui nao compila.
   * (E: sem backtick dentro deste template literal, que e GLSL dentro de JS.)
   */
  uniform mat4 uProjection;

  varying vec3 vWorldPos;

  bool solidAt(ivec3 v) {
    // Ver createVoxelTexture: o Y do voxel e o Z da textura.
    return texelFetch(uVoxels, ivec3(v.x, v.z, v.y), 0).r != ${AIR_TEXEL}u;
  }

  uint idAt(ivec3 v) {
    return texelFetch(uVoxels, ivec3(v.x, v.z, v.y), 0).r;
  }

  float hash13(vec3 p) {
    p = fract(p * 0.3183099 + 0.1);
    p *= 17.0;
    return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
  }

  void main() {
    vec3 origin = cameraPosition - uChunkOrigin;
    vec3 dir = normalize(vWorldPos - cameraPosition);

    // ── Recorte na caixa [0, size]^3 (teste de slabs) ───────────────────────
    vec3 inv = 1.0 / dir;
    vec3 t1 = (vec3(0.0) - origin) * inv;
    vec3 t2 = (vec3(uChunkSize) - origin) * inv;
    vec3 near = min(t1, t2);
    vec3 far = max(t1, t2);

    float tExit = min(min(far.x, far.y), far.z);
    float tEnter = near.x;
    int entryAxis = 0;
    if (near.y > tEnter) { tEnter = near.y; entryAxis = 1; }
    if (near.z > tEnter) { tEnter = near.z; entryAxis = 2; }

    float t0 = max(tEnter, 0.0);
    if (tExit < t0) discard;

    // ── Celula inicial ──────────────────────────────────────────────────────
    vec3 p = origin + dir * t0;
    ivec3 cell = clamp(ivec3(floor(p)), ivec3(0), ivec3(int(uChunkSize) - 1));

    ivec3 stepDir = ivec3(dir.x > 0.0 ? 1 : -1, dir.y > 0.0 ? 1 : -1, dir.z > 0.0 ? 1 : -1);
    vec3 tDelta = abs(inv);
    // Distancias medidas a partir de t0, nao da origem do raio: a distancia final soma t0.
    vec3 tMax = vec3(
      (dir.x > 0.0 ? float(cell.x) + 1.0 - p.x : p.x - float(cell.x)) * tDelta.x,
      (dir.y > 0.0 ? float(cell.y) + 1.0 - p.y : p.y - float(cell.y)) * tDelta.y,
      (dir.z > 0.0 ? float(cell.z) + 1.0 - p.z : p.z - float(cell.z)) * tDelta.z
    );

    vec3 normal = vec3(0.0);
    if (tEnter > 0.0) {
      if (entryAxis == 0) normal.x = -float(stepDir.x);
      else if (entryAxis == 1) normal.y = -float(stepDir.y);
      else normal.z = -float(stepDir.z);
    }

    // ── Travessia ───────────────────────────────────────────────────────────
    bool hit = false;
    int steps = 0;
    for (int i = 0; i < uMaxSteps; i++) {
      if (solidAt(cell)) { hit = true; steps = i; break; }

      if (tMax.x < tMax.y) {
        if (tMax.x < tMax.z) { cell.x += stepDir.x; tMax.x += tDelta.x; normal = vec3(-float(stepDir.x), 0.0, 0.0); }
        else                 { cell.z += stepDir.z; tMax.z += tDelta.z; normal = vec3(0.0, 0.0, -float(stepDir.z)); }
      } else {
        if (tMax.y < tMax.z) { cell.y += stepDir.y; tMax.y += tDelta.y; normal = vec3(0.0, -float(stepDir.y), 0.0); }
        else                 { cell.z += stepDir.z; tMax.z += tDelta.z; normal = vec3(0.0, 0.0, -float(stepDir.z)); }
      }

      if (any(lessThan(cell, ivec3(0))) || any(greaterThanEqual(cell, ivec3(int(uChunkSize))))) break;
      steps = i;
    }

    if (!hit) discard;

    float relative = normal.x != 0.0 ? tMax.x - tDelta.x
      : normal.y != 0.0 ? tMax.y - tDelta.y
      : normal.z != 0.0 ? tMax.z - tDelta.z
      : 0.0;
    float dist = max(t0, t0 + relative);

    vec3 localHit = origin + dir * dist;
    vec3 worldHit = localHit + uChunkOrigin;

    // ── Cor e sombreado ─────────────────────────────────────────────────────
    uint id = idAt(cell);
    vec3 albedo = texelFetch(uPalette, ivec2(int(id), 0), 0).rgb;

    // Grao por voxel: aqui ele sai de graca, o voxel exato ja e conhecido.
    float grain = hash13(vec3(cell) + 17.0);
    albedo *= 1.0 - uVoxelGrain * 0.5 + uVoxelGrain * grain;

    // AO por voxel, de verdade: no caminho de malha a AO e por vertice e um quad fundido de
    // 8x8 voxels interpola uma AO so. Aqui cada voxel tem a sua.
    vec3 tangentA = abs(normal.y) > 0.5 ? vec3(1.0, 0.0, 0.0) : vec3(0.0, 1.0, 0.0);
    vec3 tangentB = cross(normal, tangentA);
    float occl = 0.0;
    occl += solidAt(cell + ivec3(normal + tangentA)) ? 1.0 : 0.0;
    occl += solidAt(cell + ivec3(normal - tangentA)) ? 1.0 : 0.0;
    occl += solidAt(cell + ivec3(normal + tangentB)) ? 1.0 : 0.0;
    occl += solidAt(cell + ivec3(normal - tangentB)) ? 1.0 : 0.0;
    float ao = 1.0 - 0.22 * occl;

    float face = normal.y > 0.5 ? 1.0 : (normal.y < -0.5 ? 0.5 : (abs(normal.x) > 0.5 ? 0.7 : 0.85));
    float diffuse = max(dot(normal, normalize(uSunDirection)), 0.0);
    float lit = mix(1.0, 0.78 + 0.34 * diffuse, uDaylight);
    vec3 shaded = albedo * max(vec3(face * lit * ao), vec3(uMinLight * face));

    // Contorno de voxel: a posicao exata dentro do voxel e conhecida, nao precisa de fract do
    // mundo nem de heuristica.
    if (uVoxelEdge > 0.0) {
      vec3 inVoxel = localHit - vec3(cell);
      vec3 d = abs(inVoxel - 0.5);
      vec3 planeMask = 1.0 - abs(normal);
      float edge = max(max(d.x * planeMask.x, d.y * planeMask.y), d.z * planeMask.z);
      float line = smoothstep(0.40, 0.5, edge);
      float fade = 1.0 - smoothstep(uVoxelEdgeFade * 0.35, uVoxelEdgeFade, dist);
      shaded *= 1.0 - uVoxelEdge * line * fade;
    }

    // ── Nevoa ───────────────────────────────────────────────────────────────
    float fog = smoothstep(uFogNear, uFogFar, dist);
    vec3 color = mix(shaded, uSkyColor, fog);

    // Visualizacao de custo: quantos passos de DDA cada pixel gastou.
    if (uDebugSteps > 0.5) {
      float load = float(steps) / float(uMaxSteps);
      color = vec3(load, 1.0 - load, 0.0);
    }

    gl_FragColor = vec4(color, 1.0);

    // Profundidade real do voxel atingido, para compor com a malha, o ceu e as particulas.
    vec4 clip = uProjection * viewMatrix * vec4(worldHit, 1.0);
    gl_FragDepth = (clip.z / clip.w) * 0.5 + 0.5;
  }
`;

/**
 * Material de raymarch. Um clone por chunk, porque a textura de voxel e a origem sao uniforms;
 * clones compartilham o programa compilado, entao nao multiplicam compilacao de shader.
 */
export function createVoxelRaymarchMaterial(chunkSize: number): ShaderMaterial {
  return new ShaderMaterial({
    glslVersion: GLSL3,
    // A caixa precisa produzir fragmento tambem quando a camera esta DENTRO dela, senao o
    // chunk em que o jogador esta simplesmente desaparece.
    side: BackSide,
    transparent: false,
    uniforms: {
      uVoxels: { value: null },
      uPalette: { value: null },
      uChunkOrigin: { value: new Vector3() },
      uChunkSize: { value: chunkSize },
      // Teto teorico do DDA num volume de lado S: 3*S.
      uMaxSteps: { value: 3 * chunkSize },
      uSunDirection: { value: new Vector3(1, 1, 1).normalize() },
      uSkyColor: { value: new Color(0x87ceeb) },
      uFogNear: { value: 128.0 },
      uFogFar: { value: 256.0 },
      uDaylight: { value: 1.0 },
      uMinLight: { value: 0.03 },
      uVoxelEdge: { value: 0.0 },
      uVoxelEdgeFade: { value: 20.0 },
      uVoxelGrain: { value: 0.06 },
      uDebugSteps: { value: 0.0 },
      uProjection: { value: new Matrix4() }
    },
    vertexShader: VERTEX_SHADER,
    fragmentShader: FRAGMENT_SHADER
  });
}
