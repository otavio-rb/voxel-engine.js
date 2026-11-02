import {
  DepthFormat,
  DepthTexture,
  Matrix4,
  NearestFilter,
  OrthographicCamera,
  PerspectiveCamera,
  Scene,
  ShaderMaterial,
  UnsignedIntType,
  Vector2,
  Vector3,
  WebGLRenderer,
  WebGLRenderTarget
} from 'three';

/** Layer reservada aos meshes que projetam sombra. A camera de luz enxerga so ela. */
export const SHADOW_LAYER = 7;

export interface ShadowMapOptions {
  /** Lado do mapa em pixels. 2048 e o equilibrio; 4096 fica nitido e custa 4x a memoria. */
  resolution?: number;
  /** Raio coberto pelo mapa, em blocos. Quanto maior, mais longe a sombra vai e menos nitida fica. */
  radiusBlocks?: number;
  /** Quanto a sombra escurece a luz direta. 1 = sombra cheia. */
  strength?: number;
  /** Deslocamento ao longo da normal, em texels do mapa. Combate o acne de sombra. */
  normalBias?: number;
  /**
   * Largura da penumbra por unidade de distancia entre a superficie e o oclusor.
   * 0 = sombra dura. Default 0.06.
   */
  softness?: number;
  /**
   * Passo de quantizacao da direcao da luz, em graus. 0 = continuo (segue o sol suavemente).
   * Default 0.
   */
  angleStepDegrees?: number;
  /**
   * Se verdadeiro, quantiza a posicao da camera na grade de texels.
   * Default false (desativado para evitar saltos periodicos / tremores enquanto o sol orbita).
   */
  snapToTexel?: boolean;
}

/**
 * Shadow map direcional: a cena desenhada de novo do ponto de vista da luz, guardando
 * apenas profundidade. O terreno depois compara a sua propria distancia a luz com o que
 * esta gravado aqui, e o que estiver mais longe esta na sombra de outra coisa.
 *
 * E a peca que o lightmap de voxels nao resolve. O `LightEngine` propaga luz de ceu
 * celula a celula, o que diz se um bloco ve o ceu — mas nao em que DIRECAO o sol esta.
 * Por isso um pilao ao meio-dia e ao poente escurecia os mesmos vizinhos. Com o mapa, a
 * sombra se alonga e gira junto com o sol.
 *
 * Tres decisoes sao especificas de um mundo de voxels:
 *
 * - A camera de luz e ortografica e segue o jogador, mas a posicao dela e **arredondada
 *   para o texel** do mapa. Sem isso, andar meio texel reprojeta o mapa inteiro e as
 *   bordas de sombra fervem ("shadow shimmering") a cada passo.
 * - O bias e aplicado **ao longo da normal da face**, nao na profundidade. Um bias de
 *   profundidade em superficies planas e axis-aligned desgruda a sombra do objeto
 *   (peter-panning); deslocar o ponto de amostragem para fora da face resolve o acne sem
 *   mover a sombra.
 * - So os meshes na `SHADOW_LAYER` entram. O domo de ceu, as nuvens, o sol e o contorno
 *   de bloco estao na mesma cena, e qualquer um deles no mapa cobriria o mundo inteiro
 *   com uma sombra falsa.
 */
export class ShadowMap {
  public readonly camera = new OrthographicCamera(-1, 1, 1, -1, 0.5, 1000);
  /** Transforma posicao de mundo direto em UV + profundidade do mapa. */
  public readonly matrix = new Matrix4();
  public readonly texelSize = new Vector2();

  private target: WebGLRenderTarget | null = null;
  private depth: DepthTexture | null = null;
  private readonly depthMaterial: ShaderMaterial;
  private resolution: number;
  private radius: number;
  private strengthValue: number;
  private normalBiasValue: number;
  private softnessValue: number;
  private angleStep: number;
  private snapToTexel: boolean;

  private readonly lightDir = new Vector3(0, 1, 0);
  private readonly center = new Vector3();
  private readonly right = new Vector3(1, 0, 0);
  private readonly upOrtho = new Vector3(0, 1, 0);
  private readonly orthoRef = new Vector3(0, 0, 1);
  private readonly scratch = new Vector3();

  constructor(options: ShadowMapOptions = {}) {
    this.resolution = Math.max(256, Math.min(4096, Math.round(options.resolution ?? 2048)));
    this.radius = Math.max(8, options.radiusBlocks ?? 96);
    this.strengthValue = options.strength ?? 0.85;
    this.normalBiasValue = options.normalBias ?? 1.6;
    this.softnessValue = options.softness ?? 0.06;
    this.angleStep = (options.angleStepDegrees ?? 0) * Math.PI / 180;
    this.snapToTexel = options.snapToTexel ?? false;

    // Replica a animacao de subida do chunk do material opaco. Se o mapa ignorasse o
    // deslocamento, a sombra ficaria no lugar final enquanto o bloco ainda sobe.
    this.depthMaterial = new ShaderMaterial({
      uniforms: { uTime: { value: 0 } },
      vertexShader: /* glsl */ `
        attribute float creationTime;
        uniform float uTime;
        void main() {
          vec3 pos = position;
          float age = uTime - creationTime;
          float riseOffset = clamp(1.0 - (age / 1.0), 0.0, 1.0);
          pos.y -= pow(riseOffset, 2.0) * 25.0;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        void main() { gl_FragColor = vec4(1.0); }
      `
    });

    this.camera.layers.set(SHADOW_LAYER);
  }

  public get texture(): DepthTexture | null {
    return this.depth;
  }

  public get strength(): number {
    return this.strengthValue;
  }

  public setStrength(value: number): void {
    this.strengthValue = Math.max(0, Math.min(1, value));
  }

  /** Deslocamento ao longo da normal, em texels do mapa. */
  public get normalBias(): number {
    return this.normalBiasValue;
  }

  /**
   * Largura da penumbra por unidade de distancia ao oclusor. O sol real tem meio grau de
   * tamanho angular (fator ~0.009), o que daria sombras praticamente duras; os packs
   * exageram isso de proposito, e 0.06 e um meio-termo que ainda le como luz solar.
   */
  public get softness(): number {
    return this.softnessValue;
  }

  public setSoftness(value: number): void {
    this.softnessValue = Math.max(0, value);
  }

  /** Passo de quantizacao da direcao da luz, em graus. 0 desliga (rotacao continua). */
  public setAngleStep(degrees: number): void {
    this.angleStep = Math.max(0, degrees) * Math.PI / 180;
  }

  public get snap(): boolean {
    return this.snapToTexel;
  }

  public setSnapToTexel(enabled: boolean): void {
    this.snapToTexel = enabled;
  }

  /** Alcance de profundidade do mapa em unidades de cena: converte z do mapa em distancia. */
  public get depthRange(): number {
    return this.camera.far - this.camera.near;
  }

  public setResolution(resolution: number): void {
    const next = Math.max(256, Math.min(4096, Math.round(resolution)));
    if (next === this.resolution) return;
    this.resolution = next;
    this.target?.dispose();
    this.depth?.dispose();
    this.target = null;
    this.depth = null;
  }

  /** Raio coberto em unidades de cena (ja multiplicado por voxels por bloco). */
  public setRadius(radiusScene: number): void {
    this.radius = Math.max(1, radiusScene);
  }

  /**
   * Reposiciona a camera de luz em volta de `viewer` e desenha o mapa.
   * `lightDirection` aponta da cena para a luz (sol de dia, lua de noite).
   */
  public render(
    renderer: WebGLRenderer,
    scene: Scene,
    viewer: PerspectiveCamera,
    lightDirection: Vector3,
    time: number
  ): void {
    const target = this.ensureTarget();
    if (!Number.isFinite(lightDirection.x) || lightDirection.lengthSq() < 1e-4) {
      this.lightDir.set(0, 1, 0);
    } else {
      this.lightDir.copy(lightDirection).normalize();
    }

    // Quantiza a direcao da luz em azimute e elevacao. O ciclo de dia move o sol de forma
    // continua, e qualquer mudanca na direcao, por minima que seja, reprojeta o mapa
    // inteiro: a rasterizacao cai em texels diferentes e as bordas de sombra fervem. Com
    // o passo, o mapa fica identico por varios quadros e so atualiza em saltos pequenos.
    if (this.angleStep > 0) {
      const azimuth = Math.atan2(this.lightDir.z, this.lightDir.x);
      const elevation = Math.asin(Math.max(-1, Math.min(1, this.lightDir.y)));
      const qAzimuth = Math.round(azimuth / this.angleStep) * this.angleStep;
      const qElevation = Math.round(elevation / this.angleStep) * this.angleStep;
      const horizontal = Math.cos(qElevation);
      this.lightDir.set(
        Math.cos(qAzimuth) * horizontal,
        Math.sin(qElevation),
        Math.sin(qAzimuth) * horizontal
      );
    }

    const r = this.radius;
    const texelWorld = (2 * r) / this.resolution;
    this.texelSize.set(1 / this.resolution, 1 / this.resolution);

    // Base ortogonal estavel para a camera de luz.
    // Como a orbita do sol e no plano XY (Z=0), o vetor (0,0,1) e estritamente perpendicular
    // ao plano orbital. Isso garante que 'right' e 'upOrtho' girem suavemente com o sol
    // sem degeneracoes ou inversoes abruptas de 90 graus no horizonte.
    this.right.crossVectors(this.orthoRef, this.lightDir);
    if (this.right.lengthSq() < 1e-4) {
      this.right.crossVectors(new Vector3(0, 1, 0), this.lightDir);
    }
    this.right.normalize();
    this.upOrtho.crossVectors(this.lightDir, this.right).normalize();

    // Centro da camera de sombra: por padrao segue o jogador de forma continua.
    // Snapping para texels e opcional (`snapToTexel`), pois projetar uma posicao estatica
    // contra uma base em rotacao solar causa saltos periodicos de dente-de-serra (tremidos).
    this.center.copy(viewer.position);
    if (this.snapToTexel) {
      const alongRight = Math.round(this.center.dot(this.right) / texelWorld) * texelWorld;
      const alongUp = Math.round(this.center.dot(this.upOrtho) / texelWorld) * texelWorld;
      const alongLight = this.center.dot(this.lightDir);
      this.center
        .copy(this.right).multiplyScalar(alongRight)
        .addScaledVector(this.upOrtho, alongUp)
        .addScaledVector(this.lightDir, alongLight);
    }

    // A camera recua ao longo da direcao da luz o suficiente para que tudo dentro da
    // esfera de raio r caiba entre near e far.
    const distance = r * 2.0;
    this.scratch.copy(this.lightDir).multiplyScalar(distance).add(this.center);
    this.camera.position.copy(this.scratch);
    // O 'up' da camera TEM de ser o mesmo upOrtho em que o centro foi quantizado: o
    // lookAt do three monta x = normalize(cross(up, forward)), e com up = upOrtho isso
    // reproduz exatamente o `right` usado no snapping. Passar (0,1,0) aqui deixaria a
    // camera numa base diferente da do arredondamento, e o snapping nao valeria de nada.
    this.camera.up.copy(this.upOrtho);
    this.camera.lookAt(this.center);

    this.camera.left = -r;
    this.camera.right = r;
    this.camera.top = r;
    this.camera.bottom = -r;
    this.camera.near = 0.1;
    this.camera.far = distance + r * 2.0;
    this.camera.updateProjectionMatrix();
    this.camera.updateMatrixWorld();

    // De espaco de mundo para UV do mapa: projeta e remapeia [-1,1] para [0,1].
    this.matrix.set(
      0.5, 0.0, 0.0, 0.5,
      0.0, 0.5, 0.0, 0.5,
      0.0, 0.0, 0.5, 0.5,
      0.0, 0.0, 0.0, 1.0
    );
    this.matrix.multiply(this.camera.projectionMatrix);
    this.matrix.multiply(this.camera.matrixWorldInverse);

    this.depthMaterial.uniforms.uTime.value = time;

    const previousTarget = renderer.getRenderTarget();
    const previousOverride = scene.overrideMaterial;
    try {
      scene.overrideMaterial = this.depthMaterial;
      renderer.setRenderTarget(target);
      renderer.clear(true, true, false);
      renderer.render(scene, this.camera);
    } catch (err) {
      console.error('[ShadowMap] Render error:', err);
    } finally {
      scene.overrideMaterial = previousOverride;
      renderer.setRenderTarget(previousTarget);
    }
  }

  public dispose(): void {
    this.target?.dispose();
    this.depth?.dispose();
    this.target = null;
    this.depth = null;
    this.depthMaterial.dispose();
  }

  private ensureTarget(): WebGLRenderTarget {
    if (this.target) return this.target;
    const depth = new DepthTexture(this.resolution, this.resolution);
    depth.format = DepthFormat;
    depth.type = UnsignedIntType;
    depth.minFilter = NearestFilter;
    depth.magFilter = NearestFilter;
    this.depth = depth;
    this.target = new WebGLRenderTarget(this.resolution, this.resolution, {
      depthBuffer: true,
      depthTexture: depth,
      stencilBuffer: false
    });
    return this.target;
  }
}
