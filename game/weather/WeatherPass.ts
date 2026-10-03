import { Color, PerspectiveCamera, ShaderMaterial, Vector4 } from 'three';
import type { ScreenPass } from '@voxel/engine/worker';

/**
 * Clean atmospheric post-processing pass:
 * - Only activates during lightning strikes for a quick atmospheric thunder flash
 * - Completely avoids intrusive camera screen distortions or lens drops
 * - Stays disabled (zero GPU cost) during normal gameplay
 */
export class WeatherPass implements ScreenPass {
  public enabled = false;
  public readonly material: ShaderMaterial;
  public readonly order = 1;

  private flash = new Vector4(1, 1, 1, 0);

  constructor() {
    this.material = new ShaderMaterial({
      uniforms: {
        tDiffuse: { value: null },
        uLightningFlash: { value: this.flash }
      },
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = vec4(position.xy, 0.0, 1.0);
        }
      `,
      fragmentShader: `
        uniform sampler2D tDiffuse;
        uniform vec4 uLightningFlash; // rgb, intensity
        varying vec2 vUv;

        void main() {
          vec3 col = texture2D(tDiffuse, vUv).rgb;
          float f = clamp(uLightningFlash.w, 0.0, 1.0);
          if (f > 0.001) {
            col = mix(col, uLightningFlash.rgb, f * 0.55) + uLightningFlash.rgb * (f * 0.25);
          }
          gl_FragColor = vec4(col, 1.0);
          #include <colorspace_fragment>
        }
      `,
      depthTest: false,
      depthWrite: false
    });
  }

  public begin(_camera: PerspectiveCamera, _dtSeconds: number): void {
    // No camera manipulation
  }

  public addFlash(color: Color, intensity: number): void {
    if (intensity <= 0) return;
    this.flash.set(color.r, color.g, color.b, Math.min(1.0, this.flash.w + intensity));
  }

  public decayFlash(decayRate: number, dtSeconds: number): void {
    if (this.flash.w > 0) {
      this.flash.w = Math.max(0, this.flash.w - decayRate * dtSeconds);
    }
  }

  public end(): void {
    this.material.uniforms.uLightningFlash.value = this.flash;
    // Only enabled when an active flash is occurring
    this.enabled = this.flash.w > 0.005;
  }

  public dispose(): void {
    this.material.dispose();
  }
}
