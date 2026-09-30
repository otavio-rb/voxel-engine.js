import { Color, PerspectiveCamera, ShaderMaterial, Vector3, Vector4 } from 'three';
import type { ScreenPass } from '@voxel/engine/worker';

/** Sources of each kind drawn per frame; the nearest ones win. */
const MAX_FX = 4;

const vec4s = () => Array.from({ length: MAX_FX }, () => new Vector4());

/**
 * One full-screen pass for the heavy effects, so they cost a single pass together:
 * - lens: gravitational lensing, shadow and photon ring of black holes;
 * - glare: bloom, anamorphic streaks and heat shimmer of stars;
 * - shock: refracting shockwave rings and heat haze of explosions;
 * - flash: full-screen detonation flash, plus global chromatic aberration.
 * Each frame: `begin`, then `addLens` / `addGlare` / `addShock` / `addFlash`, then `end`.
 */
export class ScreenEffects implements ScreenPass {
  public enabled = false;
  public readonly material: ShaderMaterial;
  public readonly order = 0;

  private camera: PerspectiveCamera | null = null;
  private lensCount = 0;
  private glareCount = 0;
  private shockCount = 0;
  private flash = new Vector4();
  private flashPeak = 0;
  private aberration = 0;
  private time = 0;

  private readonly lens = vec4s();
  private readonly glare = vec4s();
  private readonly glareColor = Array.from({ length: MAX_FX }, () => new Color());
  private readonly shock = vec4s();
  private readonly haze = vec4s();
  private readonly projected = new Vector3();
  private readonly screen = new Vector4();

  constructor() {
    this.material = new ShaderMaterial({
      defines: { MAX_FX },
      uniforms: {
        tDiffuse: { value: null },
        uAspect: { value: 1 },
        uTime: { value: 0 },
        uAberration: { value: 0 },
        uLens: { value: this.lens },
        uGlare: { value: this.glare },
        uGlareColor: { value: this.glareColor },
        uShock: { value: this.shock },
        uHaze: { value: this.haze },
        uFlash: { value: this.flash }
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
        uniform float uAspect;
        uniform float uTime;
        uniform float uAberration;
        uniform vec4 uLens[MAX_FX];      // center (x in aspect units), horizon radius, strength
        uniform vec4 uGlare[MAX_FX];     // center, star radius, intensity
        uniform vec3 uGlareColor[MAX_FX];
        uniform vec4 uShock[MAX_FX];     // center, ring radius, strength
        uniform vec4 uHaze[MAX_FX];      // haze radius, haze strength, ring width, -
        uniform vec4 uFlash;             // rgb, intensity
        varying vec2 vUv;

        void main() {
          // Screen-height units, so circles stay round at any aspect
          vec2 s = vec2(vUv.x * uAspect, vUv.y);
          vec2 off = vec2(0.0);
          float shade = 1.0;
          vec3 glow = vec3(0.0);
          float ab = uAberration;

          // ── Black holes: light bent around the mass, a shadow and the photon ring ──
          for (int i = 0; i < MAX_FX; i++) {
            vec4 L = uLens[i];
            if (L.w <= 0.0) continue;
            vec2 d = s - L.xy;
            float dist = max(length(d), 1e-4);
            float rs = L.z;
            float rE = rs * 2.2; // Einstein ring radius
            off -= (d / dist) * (rE * rE / dist) * exp(-dist / (rs * 9.0)) * L.w;
            shade *= mix(1.0, smoothstep(rs * 1.25, rs * 1.55, dist), L.w);
            glow += vec3(1.0, 0.78, 0.5) * exp(-abs(dist - rs * 1.6) / (rs * 0.05)) * 0.9 * L.w;
          }

          // ── Explosions: a refracting shock ring expanding outward, heat haze over the fireball ──
          for (int i = 0; i < MAX_FX; i++) {
            vec4 S = uShock[i];
            if (S.w <= 0.0) continue;
            vec4 H = uHaze[i];
            vec2 d = s - S.xy;
            float dist = max(length(d), 1e-4);
            float width = max(H.z, 1e-3);
            float x = (dist - S.z) / width;
            float band = exp(-x * x);
            float bump = -x * band; // derivative of the ring: pushes pixels like a lens
            off += (d / dist) * bump * S.w * width * 0.9;
            ab += abs(bump) * S.w * 0.02;
            glow += vec3(1.0, 0.9, 0.8) * band * S.w * 0.06;

            float heat = H.y * smoothstep(H.x, H.x * 0.3, dist);
            off += vec2(sin(s.y * 90.0 + s.x * 20.0 + uTime * 14.0),
                        cos(s.x * 80.0 + s.y * 25.0 - uTime * 12.0)) * 0.0022 * heat;
          }

          // ── Stars: soft bloom, a hot core, anamorphic and cross streaks, heat shimmer ──
          for (int i = 0; i < MAX_FX; i++) {
            vec4 G = uGlare[i];
            if (G.w <= 0.0) continue;
            vec2 d = s - G.xy;
            float r = max(G.z, 0.004);
            float dist2 = dot(d, d);
            float dist = sqrt(dist2);
            float bloom = r * r / (dist2 + r * r * 0.6);
            float core = exp(-dist2 / (r * r * 1.2));
            float streakH = exp(-abs(d.y) / (r * 0.06)) * exp(-abs(d.x) / (r * 9.0));
            float streakX = exp(-abs(d.x * d.y) / (r * r * 0.015)) * exp(-dist / (r * 4.0));
            glow += uGlareColor[i] * (bloom * 0.35 + core * 0.8 + streakH * 0.6 + streakX * 0.35) * G.w;

            float heat = smoothstep(r * 3.0, r, dist) * G.w;
            off += vec2(sin(s.y * 120.0 + uTime * 9.0), cos(s.x * 110.0 + uTime * 8.0)) * 0.0012 * heat;
          }

          vec2 uv = vec2((s.x + off.x) / uAspect, s.y + off.y);
          vec3 col;
          if (ab > 0.0005) {
            vec2 c = uv - 0.5;
            col = vec3(texture2D(tDiffuse, 0.5 + c * (1.0 + ab)).r,
                       texture2D(tDiffuse, uv).g,
                       texture2D(tDiffuse, 0.5 + c * (1.0 - ab)).b);
          } else {
            col = texture2D(tDiffuse, uv).rgb;
          }

          col = col * shade + glow;
          float f = clamp(uFlash.w, 0.0, 1.0);
          col = mix(col, uFlash.rgb, f * 0.85) + uFlash.rgb * f * 0.3;

          gl_FragColor = vec4(col, 1.0);
          #include <colorspace_fragment>
        }
      `,
      depthTest: false,
      depthWrite: false
    });
  }

  /** Starts collecting sources for the frame about to be drawn with `camera`. */
  public begin(camera: PerspectiveCamera, dtSeconds: number): void {
    this.camera = camera;
    this.time += dtSeconds;
    this.lensCount = this.glareCount = this.shockCount = 0;
    this.flash.set(0, 0, 0, 0);
    this.flashPeak = 0;
    this.aberration = 0;
    for (let i = 0; i < MAX_FX; i++) {
      this.lens[i].w = 0;
      this.glare[i].w = 0;
      this.shock[i].w = 0;
    }
  }

  /** Black hole with an event horizon of `horizonRadius` world units. */
  public addLens(position: Vector3, horizonRadius: number, strength = 1): void {
    if (this.lensCount >= MAX_FX || !this.toScreen(position, horizonRadius, 12)) return;
    this.lens[this.lensCount++].set(this.screen.x, this.screen.y, this.screen.z, strength);
  }

  /** Star of `radius` world units; `intensity` already includes occlusion. */
  public addGlare(position: Vector3, radius: number, color: Color, intensity: number): void {
    if (intensity <= 0.001 || this.glareCount >= MAX_FX || !this.toScreen(position, radius, 10)) return;
    this.glareColor[this.glareCount].copy(color);
    this.glare[this.glareCount++].set(this.screen.x, this.screen.y, this.screen.z, intensity);
  }

  /** Shock ring of `ringRadius` world units around `position`, with heat haze over `hazeRadius`. */
  public addShock(
    position: Vector3, ringRadius: number, ringWidth: number, strength: number,
    hazeRadius: number, hazeStrength: number
  ): void {
    if (strength <= 0.001 || this.shockCount >= MAX_FX || !this.toScreen(position, 1, Infinity)) return;
    const unit = this.screen.z; // screen size of one world unit at that distance
    this.haze[this.shockCount].set(hazeRadius * unit, hazeStrength, Math.max(ringWidth * unit, 0.004), 0);
    this.shock[this.shockCount++].set(this.screen.x, this.screen.y, ringRadius * unit, strength);
  }

  /** Full-screen flash; several flashes add up, colored by the strongest. */
  public addFlash(color: Color, intensity: number): void {
    if (intensity <= 0) return;
    if (intensity > this.flashPeak) {
      this.flashPeak = intensity;
      this.flash.set(color.r, color.g, color.b, this.flash.w);
    }
    this.flash.w += intensity;
  }

  public addAberration(amount: number): void {
    this.aberration += amount;
  }

  /** Uploads the frame's sources; the pass only runs when something is visible. */
  public end(): void {
    const u = this.material.uniforms;
    u.uAspect.value = this.camera?.aspect ?? 1;
    u.uTime.value = this.time;
    u.uAberration.value = Math.min(this.aberration, 0.08);
    this.flash.w = Math.min(this.flash.w, 1);
    this.enabled = this.lensCount + this.glareCount + this.shockCount > 0 || this.flash.w > 0.001 || this.aberration > 0.0005;
  }

  public dispose(): void {
    this.material.dispose();
  }

  /**
   * Projects a sphere to the screen into `this.screen` (center x in aspect units, y, radius);
   * false when behind the camera or farther than `margin` radii off screen.
   */
  private toScreen(position: Vector3, worldRadius: number, margin: number): boolean {
    const camera = this.camera;
    if (!camera) return false;
    this.projected.copy(position).project(camera);
    if (this.projected.z < -1 || this.projected.z > 1) return false;

    const dist = Math.max(0.1, camera.position.distanceTo(position));
    const r = worldRadius / (2 * dist * Math.tan((camera.fov * Math.PI) / 360));
    const x = (this.projected.x * 0.5 + 0.5) * camera.aspect;
    const y = this.projected.y * 0.5 + 0.5;
    const pad = r * margin;
    if (x < -pad || x > camera.aspect + pad || y < -pad || y > 1 + pad) return false;
    this.screen.set(x, y, r, 0);
    return true;
  }
}
