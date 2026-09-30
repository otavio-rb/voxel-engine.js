import {
  Camera,
  HalfFloatType,
  Mesh,
  OrthographicCamera,
  PlaneGeometry,
  Scene,
  ShaderMaterial,
  Vector2,
  WebGLRenderer,
  WebGLRenderTarget
} from 'three';

/**
 * A full-screen shader pass. The material receives the previous image in its
 * `tDiffuse` uniform (linear color). Every pass should end with
 * `#include <colorspace_fragment>`: three only converts when drawing to the screen,
 * so it is a no-op for passes that write to an intermediate target.
 */
export interface ScreenPass {
  enabled: boolean;
  readonly material: ShaderMaterial;
  /** Passes run in ascending order (default 0). */
  readonly order?: number;
}

/**
 * Renders the scene straight to the canvas while no pass is enabled; otherwise to an
 * offscreen target, then through each enabled pass in order.
 */
export class PostProcessor {
  /** Master switch: when false the scene is drawn directly and no pass runs. */
  public enabled = true;
  private readonly passes: ScreenPass[] = [];
  private targets: [WebGLRenderTarget, WebGLRenderTarget] | null = null;
  private readonly size = new Vector2();
  private readonly quadScene = new Scene();
  private readonly quadCamera = new OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private readonly quad = new Mesh(new PlaneGeometry(2, 2));

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
      this.renderer.render(scene, camera);
      return;
    }

    let [read, write] = this.ensureTargets();
    this.renderer.setRenderTarget(read);
    this.renderer.render(scene, camera);

    for (let i = 0; i < active.length; i++) {
      const last = i === active.length - 1;
      const material = active[i].material;
      material.uniforms.tDiffuse.value = read.texture;
      this.quad.material = material;
      this.renderer.setRenderTarget(last ? null : write);
      this.renderer.render(this.quadScene, this.quadCamera);
      [read, write] = [write, read];
    }
  }

  public dispose(): void {
    this.targets?.forEach(t => t.dispose());
    this.targets = null;
    this.quad.geometry.dispose();
  }

  /** Targets are created on first use and follow the drawing buffer size. */
  private ensureTargets(): [WebGLRenderTarget, WebGLRenderTarget] {
    this.renderer.getDrawingBufferSize(this.size);
    const w = Math.max(1, this.size.x), h = Math.max(1, this.size.y);
    if (!this.targets) {
      const make = () => new WebGLRenderTarget(w, h, { type: HalfFloatType, samples: 4 });
      this.targets = [make(), make()];
    } else if (this.targets[0].width !== w || this.targets[0].height !== h) {
      this.targets.forEach(t => t.setSize(w, h));
    }
    return this.targets;
  }
}
