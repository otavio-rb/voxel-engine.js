import {
  Camera,
  Color,
  DepthFormat,
  DepthTexture,
  HalfFloatType,
  Mesh,
  NearestFilter,
  OrthographicCamera,
  PerspectiveCamera,
  PlaneGeometry,
  Scene,
  ShaderMaterial,
  Texture,
  UnsignedByteType,
  UnsignedIntType,
  Vector2,
  Vector3,
  WebGLRenderer,
  WebGLRenderTarget
} from 'three';

/**
 * Estado da cena que os passes de tela precisam para parecerem fisicamente plausiveis
 * (sol, ceu, hora do dia, profundidade). O `PostProcessor` preenche isso uma vez por
 * quadro e injeta nos uniforms de cada passe que os declarar: um passe novo so precisa
 * declarar `uniform vec3 uSunDirection;` para receber o sol.
 */
export interface PostFrame {
  /** Camera do quadro; usada para reconstruir posicao de mundo a partir do depth. */
  camera: PerspectiveCamera | null;
  /** Segundos acumulados, para ruido e animacao. */
  time: number;
  deltaSeconds: number;
  /** Direcao (normalizada) da camera para o sol, em espaco de mundo. */
  readonly sunDirection: Vector3;
  readonly sunColor: Color;
  readonly skyColor: Color;
  /** 0 = noite fechada, 1 = meio-dia. */
  daylight: number;
  underwater: boolean;
  /** 0 = seco, 1 = encharcado (chuva). Deixa as superficies especulares. */
  wetness: number;
  /** Voxels por bloco: converte raios e distancias escritos em blocos. */
  worldScale: number;
  /** Depth da cena deste quadro, ou null quando nenhum passe ativo pediu depth. */
  depth: Texture | null;
  /** Sol projetado na tela: `xy` em UV, `z` = 1 quando esta a frente da camera. */
  readonly sunScreen: Vector3;
  /** Tamanho do buffer de desenho em pixels. */
  readonly resolution: Vector2;
}

/**
 * A full-screen shader pass. The material receives the previous image in its
 * `tDiffuse` uniform (linear color). Every pass should end with
 * `#include <colorspace_fragment>`: three only converts when drawing to the screen,
 * so it is a no-op for passes that write to an intermediate target.
 *
 * Uniforms opcionais preenchidos automaticamente quando declarados pelo material:
 * `tDepth`, `uResolution`, `uTexel`, `uTime`, `uNear`, `uFar`, `uProjection`,
 * `uInvProjection`, `uView`, `uInvView`, `uCameraPos`, `uSunDirection`, `uSunScreen`,
 * `uSunColor`, `uSkyColor`, `uDaylight`, `uUnderwater`, `uWetness`, `uWorldScale`.
 */
export interface ScreenPass {
  enabled: boolean;
  readonly material: ShaderMaterial;
  /** Passes run in ascending order (default 0). */
  readonly order?: number;
  /**
   * Quando true o alvo da cena ganha uma `DepthTexture` e o passe recebe `tDepth`.
   * Custa um attachment a mais, entao so os passes que leem geometria pedem.
   */
  readonly needsDepth?: boolean;
  /**
   * Chamado antes do passe desenhar. Um passe pode renderizar nos proprios alvos aqui
   * (e o caso do bloom, que monta uma cadeia de mips): o `PostProcessor` restaura o
   * alvo certo depois. `input` e a imagem produzida pelos passes anteriores.
   */
  prepare?(renderer: WebGLRenderer, input: Texture, frame: PostFrame): void;
  /** Chamado quando o buffer de desenho muda de tamanho. */
  setSize?(width: number, height: number): void;
  dispose?(): void;
}

/** Vertex shader compartilhado por todo passe de tela: desenha o quad em NDC. */
export const FULLSCREEN_VERTEX = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

/**
 * Copia o estado do quadro para os uniforms que o material declarar, ignorando os que ele
 * nao usa. Passes internos (cadeia do bloom, buffer de AO) chamam isso direto, porque o
 * `PostProcessor` so alimenta automaticamente o material final de cada passe.
 */
export function bindSceneUniforms(material: ShaderMaterial, frame: PostFrame): void {
  const u = material.uniforms;
  const cam = frame.camera;

  if (u.tDepth) u.tDepth.value = frame.depth;
  if (u.uResolution) u.uResolution.value.copy(frame.resolution);
  if (u.uTexel) u.uTexel.value.set(1 / Math.max(1, frame.resolution.x), 1 / Math.max(1, frame.resolution.y));
  if (u.uTime) u.uTime.value = frame.time;
  if (u.uDaylight) u.uDaylight.value = frame.daylight;
  if (u.uUnderwater) u.uUnderwater.value = frame.underwater ? 1 : 0;
  if (u.uWetness) u.uWetness.value = frame.wetness;
  if (u.uWorldScale) u.uWorldScale.value = frame.worldScale;
  if (u.uSunDirection) u.uSunDirection.value.copy(frame.sunDirection);
  if (u.uSunColor) u.uSunColor.value.copy(frame.sunColor);
  if (u.uSkyColor) u.uSkyColor.value.copy(frame.skyColor);
  if (u.uSunScreen) u.uSunScreen.value.copy(frame.sunScreen);

  if (!cam) return;
  if (u.uNear) u.uNear.value = cam.near;
  if (u.uFar) u.uFar.value = cam.far;
  if (u.uProjection) u.uProjection.value.copy(cam.projectionMatrix);
  if (u.uInvProjection) u.uInvProjection.value.copy(cam.projectionMatrixInverse);
  if (u.uView) u.uView.value.copy(cam.matrixWorldInverse);
  if (u.uInvView) u.uInvView.value.copy(cam.matrixWorld);
  if (u.uCameraPos) u.uCameraPos.value.copy(cam.position);
}

/**
 * Renders the scene straight to the canvas while no pass is enabled; otherwise to an
 * offscreen target, then through each enabled pass in order.
 */
export class PostProcessor {
  /** Master switch: when false the scene is drawn directly and no pass runs. */
  public enabled = true;
  /** Estado da cena injetado nos passes; o runtime atualiza antes de desenhar. */
  public readonly frame: PostFrame = {
    camera: null,
    time: 0,
    deltaSeconds: 1 / 60,
    sunDirection: new Vector3(0, 1, 0),
    sunColor: new Color(1, 1, 1),
    skyColor: new Color(0x87ceeb),
    daylight: 1,
    underwater: false,
    wetness: 0,
    worldScale: 1,
    depth: null,
    sunScreen: new Vector3(0.5, 0.5, 0),
    resolution: new Vector2(1, 1)
  };

  private readonly passes: ScreenPass[] = [];
  private sceneTarget: WebGLRenderTarget | null = null;
  private pingPongTargets: [WebGLRenderTarget, WebGLRenderTarget] | null = null;
  private depthTexture: DepthTexture | null = null;
  private readonly size = new Vector2();
  private readonly texel = new Vector2();
  private readonly quadScene = new Scene();
  private readonly quadCamera = new OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private readonly quad = new Mesh(new PlaneGeometry(2, 2));
  private readonly sunWorld = new Vector3();
  private readonly camForward = new Vector3();

  constructor(private readonly renderer: WebGLRenderer) {
    this.quad.frustumCulled = false;
    this.quadScene.add(this.quad);
  }

  public add(pass: ScreenPass): void {
    if (this.passes.includes(pass)) return;
    this.passes.push(pass);
    this.passes.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  }

  public remove(pass: ScreenPass): void {
    const i = this.passes.indexOf(pass);
    if (i >= 0) this.passes.splice(i, 1);
  }

  public render(scene: Scene, camera: Camera): void {
    const active = this.enabled ? this.passes.filter(p => p.enabled) : [];
    if (active.length === 0) {
      this.renderer.setRenderTarget(null);
      this.renderer.render(scene, camera);
      return;
    }

    try {
      if ((camera as PerspectiveCamera).isPerspectiveCamera) {
        this.frame.camera = camera as PerspectiveCamera;
      }
      this.updateSunScreenPosition();

      const wantsDepth = active.some(p => p.needsDepth === true);
      this.ensureTargets(wantsDepth);

      // 1. Desenha a cena 3D no sceneTarget (o depth fica isolado e protegido)
      this.renderer.setRenderTarget(this.sceneTarget);
      this.renderer.render(scene, camera);

      // 2. Executa a cadeia de passes de post-processing em ping-pong
      let readTexture: Texture = this.sceneTarget!.texture;
      let writeIndex = 0;

      for (let i = 0; i < active.length; i++) {
        const pass = active[i];
        const last = i === active.length - 1;
        const writeTarget = last ? null : this.pingPongTargets![writeIndex];

        pass.prepare?.(this.renderer, readTexture, this.frame);
        pass.material.uniforms.tDiffuse.value = readTexture;
        this.bindFrameUniforms(pass.material);
        this.quad.material = pass.material;

        this.renderer.setRenderTarget(writeTarget);
        this.renderer.render(this.quadScene, this.quadCamera);

        if (!last) {
          readTexture = this.pingPongTargets![writeIndex].texture;
          writeIndex = 1 - writeIndex;
        }
      }
    } catch (err) {
      console.error('[PostProcessor] Render pass error, falling back to direct render:', err);
      this.renderer.setRenderTarget(null);
      this.renderer.render(scene, camera);
    }
  }

  /**
   * Preenche os uniforms de quadro que o material declarar. O material manda: declarar
   * `uniform float uDaylight;` basta para o passe receber a hora do dia.
   */
  public bindFrameUniforms(material: ShaderMaterial): void {
    bindSceneUniforms(material, this.frame);
  }

  public dispose(): void {
    this.sceneTarget?.dispose();
    this.sceneTarget = null;
    this.pingPongTargets?.forEach(t => t.dispose());
    this.pingPongTargets = null;
    this.depthTexture?.dispose();
    this.depthTexture = null;
    this.quad.geometry.dispose();
    for (const pass of this.passes) pass.dispose?.();
  }

  /**
   * Projeta o sol na tela para os raios de luz. `z` guarda a visibilidade: 0 quando o sol
   * esta atras da camera, 1 quando esta a frente, e o passe volumetrico multiplica por isso.
   */
  private updateSunScreenPosition(): void {
    const cam = this.frame.camera;
    if (!cam || !Number.isFinite(this.frame.sunDirection.x) || this.frame.sunDirection.lengthSq() < 1e-4) {
      this.frame.sunScreen.set(0.5, 0.5, 0);
      return;
    }
    this.camForward.set(0, 0, -1).applyQuaternion(cam.quaternion);
    const facing = this.frame.sunDirection.dot(this.camForward);
    this.sunWorld.copy(this.frame.sunDirection).multiplyScalar(1e4).add(cam.position).project(cam);
    if (!Number.isFinite(this.sunWorld.x) || !Number.isFinite(this.sunWorld.y)) {
      this.frame.sunScreen.set(0.5, 0.5, 0);
      return;
    }
    this.frame.sunScreen.set(
      this.sunWorld.x * 0.5 + 0.5,
      this.sunWorld.y * 0.5 + 0.5,
      facing > 0 ? 1 : 0
    );
  }

  /** Targets are created on first use and follow the drawing buffer size. */
  private ensureTargets(wantsDepth: boolean): void {
    this.renderer.getDrawingBufferSize(this.size);
    const w = Math.max(1, this.size.x), h = Math.max(1, this.size.y);
    this.texel.set(1 / w, 1 / h);
    this.frame.resolution.set(w, h);

    if (this.sceneTarget && (this.depthTexture !== null) !== wantsDepth) {
      this.sceneTarget.dispose();
      this.sceneTarget = null;
      this.pingPongTargets?.forEach(t => t.dispose());
      this.pingPongTargets = null;
      this.depthTexture?.dispose();
      this.depthTexture = null;
    }

    if (!this.sceneTarget || !this.pingPongTargets) {
      if (wantsDepth) {
        const depth = new DepthTexture(w, h);
        depth.format = DepthFormat;
        depth.type = UnsignedIntType;
        depth.minFilter = NearestFilter;
        depth.magFilter = NearestFilter;
        this.depthTexture = depth;
      }
      const targetType = (this.renderer.capabilities.isWebGL2 && this.renderer.extensions.has('EXT_color_buffer_float'))
        ? HalfFloatType
        : UnsignedByteType;

      // O sceneTarget recebe a cena 3D inteira com a DepthTexture anexada
      this.sceneTarget = new WebGLRenderTarget(w, h, {
        type: targetType,
        depthBuffer: true,
        depthTexture: this.depthTexture ?? undefined
      });

      // Os alvos de ping-pong nunca anexam depthTexture, impedindo feedback loops de WebGL
      this.pingPongTargets = [
        new WebGLRenderTarget(w, h, { type: targetType, depthBuffer: false }),
        new WebGLRenderTarget(w, h, { type: targetType, depthBuffer: false })
      ];

      for (const pass of this.passes) pass.setSize?.(w, h);
    } else if (this.sceneTarget.width !== w || this.sceneTarget.height !== h) {
      this.sceneTarget.setSize(w, h);
      this.pingPongTargets.forEach(t => t.setSize(w, h));
      for (const pass of this.passes) pass.setSize?.(w, h);
    }
    this.frame.depth = this.depthTexture;
  }
}
