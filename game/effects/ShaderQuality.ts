import {
  Color,
  LineBasicMaterial,
  Material,
  MeshBasicMaterial,
  Object3D,
  PointsMaterial,
  ShaderMaterial
} from 'three';

type Drawable = Object3D & { material: Material | Material[]; isMesh?: boolean; isPoints?: boolean; isLine?: boolean };

/** Original shader of each drawable swapped to a simple material. */
const originals = new WeakMap<Drawable, Material>();
/** One simple stand-in per shader, shared by every mesh using it. */
const fallbacks = new WeakMap<ShaderMaterial, Material>();

/**
 * Switches an effect between its custom shaders and plain unlit materials (for `/shaders off`).
 * Effects keep updating their shader uniforms either way; only what gets drawn changes.
 * Safe to call repeatedly: already-switched drawables are skipped.
 */
export function applyShaderQuality(root: Object3D, fancy: boolean): void {
  root.traverse((obj) => {
    const d = obj as Drawable;
    if (!d.isMesh && !d.isPoints && !d.isLine) return;

    if (fancy) {
      const original = originals.get(d);
      if (original) {
        d.material = original;
        originals.delete(d);
      }
      return;
    }

    if (originals.has(d) || Array.isArray(d.material)) return;
    const shader = d.material as ShaderMaterial;
    if (!shader.isShaderMaterial) return;
    originals.set(d, shader);
    d.material = fallbackFor(shader, d);
  });
}

function fallbackFor(shader: ShaderMaterial, d: Drawable): Material {
  let simple = fallbacks.get(shader);
  if (simple) return simple;

  const common = {
    color: pickColor(shader),
    transparent: shader.transparent,
    opacity: shader.transparent ? 0.6 : 1,
    blending: shader.blending,
    side: shader.side,
    depthWrite: shader.depthWrite,
    depthTest: shader.depthTest
  };
  simple = d.isPoints ? new PointsMaterial({ ...common, size: 0.2 })
    : d.isLine ? new LineBasicMaterial(common)
    : new MeshBasicMaterial(common);
  fallbacks.set(shader, simple);
  return simple;
}

/** The shader's brightest Color uniform (its glow), so the stand-in keeps the effect's hue. */
function pickColor(shader: ShaderMaterial): Color {
  let best: Color | null = null;
  for (const u of Object.values(shader.uniforms ?? {})) {
    const c = u?.value as Color;
    if (c?.isColor && (!best || c.r + c.g + c.b > best.r + best.g + best.b)) best = c;
  }
  return best ? best.clone() : new Color(0xffffff);
}
