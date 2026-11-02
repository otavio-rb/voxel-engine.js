import {
  Material,
  Mesh,
  OrthographicCamera,
  PlaneGeometry,
  Scene,
  WebGLRenderer,
  WebGLRenderTarget
} from 'three';

/**
 * Quad de tela inteira reutilizavel. Passes que precisam renderizar em alvos proprios
 * (cadeia de mips do bloom, buffer de AO) desenham por aqui em vez de montar cada um a
 * sua cena e camera ortografica.
 */
export class FullscreenQuad {
  private readonly scene = new Scene();
  private readonly camera = new OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private readonly mesh = new Mesh(new PlaneGeometry(2, 2));

  constructor() {
    this.mesh.frustumCulled = false;
    this.scene.add(this.mesh);
  }

  /** Desenha `material` em `target` (null = tela). `additive` acumula no conteudo atual. */
  public draw(
    renderer: WebGLRenderer,
    material: Material,
    target: WebGLRenderTarget | null,
    additive = false
  ): void {
    const previousAutoClear = renderer.autoClear;
    renderer.autoClear = !additive;
    this.mesh.material = material;
    renderer.setRenderTarget(target);
    renderer.render(this.scene, this.camera);
    renderer.autoClear = previousAutoClear;
  }

  public dispose(): void {
    this.mesh.geometry.dispose();
  }
}
