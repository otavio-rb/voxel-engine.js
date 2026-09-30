import { Color, PerspectiveCamera, ShaderMaterial, Vector2, Vector3 } from 'three';
import type { ScreenPass } from '@voxel/engine/worker';

/** Radius of the rift opening in world units, used to size it on screen. */
const RIFT_OPENING_RADIUS = 0.9;
/** Beyond this distance a rift no longer bends the view. */
const LENS_MAX_DISTANCE = 10;
/** Seconds of the arrival animation (leaving the tunnel). */
const EXIT_DURATION = 0.9;
const SCREEN_CENTER = new Vector2(0.5, 0.5);

/**
 * Screen-space portal effect around the nearest rift:
 * - far: a subtle lens hugging the rift;
 * - approaching (`approach` 0-1): the opening grows around the view, showing the tunnel inside;
 * - inside (`transit` 0-1): the tunnel fills the screen and the camera flies through it;
 * - arrival (`triggerExit`): the tunnel opens up into the new world with a flash and shockwave.
 * Also bends the camera (FOV stretch, roll, shake) through `applyCamera` / `restoreCamera`.
 */
export class PortalWarp implements ScreenPass {
  public enabled = false;
  public readonly material: ShaderMaterial;
  /** Last: the tunnel covers everything else. */
  public readonly order = 100;

  private approach = 0;
  private transit = 0;
  private exit = 0;
  private time = 0;
  private spin = 0;
  private savedFov = 0;
  private cameraApplied = false;

  private readonly color = new Color(0x9c27b0);
  private readonly riftPos = new Vector3();
  private readonly edge = new Vector3();
  private readonly right = new Vector3();

  constructor() {
    this.material = new ShaderMaterial({
      uniforms: {
        tDiffuse: { value: null },
        uCenter: { value: new Vector2(0.5, 0.5) },
        uAspect: { value: 1 },
        uRadius: { value: 0.05 },
        uLens: { value: 0 },
        uApproach: { value: 0 },
        uTransit: { value: 0 },
        uExit: { value: 0 },
        uTime: { value: 0 },
        uColor: { value: this.color }
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
        uniform vec2 uCenter;
        uniform float uAspect;
        uniform float uRadius;
        uniform float uLens;
        uniform float uApproach;
        uniform float uTransit;
        uniform float uExit;
        uniform float uTime;
        uniform vec3 uColor;
        varying vec2 vUv;

        float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        // Value noise wrapping every 8 cells on x, so the tunnel has no seam where the angle wraps
        float noise(vec2 p) {
          vec2 i = floor(p), f = fract(p);
          vec2 u = f * f * (3.0 - 2.0 * f);
          float x0 = mod(i.x, 8.0), x1 = mod(i.x + 1.0, 8.0);
          return mix(mix(hash(vec2(x0, i.y)), hash(vec2(x1, i.y)), u.x),
                     mix(hash(vec2(x0, i.y + 1.0)), hash(vec2(x1, i.y + 1.0)), u.x), u.y);
        }

        // p: aspect-corrected offset from the portal center (y spans 0..1 of the screen)
        vec2 toUv(vec2 p) { return uCenter + p / vec2(uAspect, 1.0); }

        // The inside of the portal: a twisting tunnel seen from its axis
        vec3 tunnel(float ang, float d, float speed) {
          float depth = 0.25 / d + uTime * speed;
          vec2 tuv = vec2((ang + depth * 0.4) * 1.2732, depth * 1.4); // 4/pi: 8 cells around
          float walls = noise(tuv) * 0.7 + 0.3 * (0.5 + 0.5 * sin(tuv.x * 1.5708 + depth * 2.0));
          float bands = pow(0.5 + 0.5 * sin(depth * 9.42 + walls * 4.0), 3.0);
          // Streaks of light racing past
          float streak = step(0.93, hash(vec2(floor(tuv.x * 3.0), floor(depth * 1.5))))
                       * smoothstep(0.0, 0.4, fract(depth * 1.5))
                       * (1.0 - smoothstep(0.02, 0.07, abs(fract(tuv.x * 3.0) - 0.5))) // thin lines
                       * smoothstep(1.2, 0.3, d);                                      // not at the screen edge
          vec3 col = mix(uColor * 0.08, uColor, walls) + mix(uColor, vec3(1.0), 0.5) * bands * 0.8;
          col += vec3(streak * (0.6 + uTransit));
          // Far end of the tunnel: a white-hot point that grows as we near the other side
          float farGlow = exp(-d * mix(14.0, 3.0, uTransit * uTransit));
          return col * smoothstep(0.0, 0.25, d) + mix(uColor, vec3(1.0), 0.7) * farGlow * (0.5 + uTransit * 2.0);
        }

        void main() {
          vec2 p = (vUv - uCenter) * vec2(uAspect, 1.0);
          float d = max(length(p), 1e-4);
          float a = uApproach;
          float t = uTransit;
          float e = uExit;
          // How hard the camera is being sucked in: builds up approaching, peaks inside the tunnel
          float suck = max(a * a, t);

          // ── Suction: swirl around the center (tighter in the middle), space stretched into the hole ──
          float swirl = suck * (0.6 + 3.2 * exp(-d * 2.5)) + e * e * 1.4 * exp(-d * 2.0);
          float cs = cos(swirl), sn = sin(swirl);
          vec2 sp = mat2(cs, -sn, sn, cs) * p;
          sp *= 1.0 + suck * 0.4 * exp(-d * 1.5);
          float sd = max(length(sp), 1e-4);
          vec2 sdir = sp / sd;

          // Opening on screen: its projected size, swelling to cover the view as we get close,
          // full screen while inside, shrinking away on arrival
          float horizon = max(max(mix(uRadius * uLens, 1.5, a * a * a), t * 2.0), e * e * 2.0);

          // ── Lens: bends space only right next to the opening ──
          float falloff = exp(-max(sd - horizon, 0.0) / max(horizon * 0.6, 1e-3));
          float k = (uLens + a) * horizon * horizon * 0.35;
          vec2 q = sp - sdir * (k / sd) * falloff;
          float tw = (0.4 * uLens + a * a * 2.5) * falloff;
          q = mat2(cos(tw), -sin(tw), sin(tw), cos(tw)) * q;

          // Arrival shockwave, rippling out of the center
          float front = (1.0 - e) * 1.4;
          q += sdir * sin((sd - front) * 36.0) * 0.02 * e * exp(-abs(sd - front) * 6.0);

          // ── Scene: radial motion blur (one read per tap) + chromatic aberration (two reads) ──
          vec3 col = texture2D(tDiffuse, toUv(q)).rgb;
          float blur = suck * 0.24 + e * e * 0.14;
          if (blur > 0.002) {
            for (int i = 1; i < 6; i++) {
              col += texture2D(tDiffuse, toUv(q * (1.0 - blur * float(i) / 5.0))).rgb;
            }
            col /= 6.0;
          }
          float ab = (suck * 0.05 + e * 0.03) * (0.3 + sd) + (0.012 * uLens + a * 0.03) * falloff;
          if (ab > 0.001) {
            col.r = mix(col.r, texture2D(tDiffuse, toUv(q * (1.0 + ab))).r, 0.7);
            col.b = mix(col.b, texture2D(tDiffuse, toUv(q * (1.0 - ab))).b, 0.7);
          }

          // ── Tunnel inside the opening (from afar the rift mesh draws the opening itself) ──
          float show = max(smoothstep(0.0, 0.35, a), max(t, e));
          if (show > 0.0) {
            float ang = atan(sp.y, sp.x);
            float edge = horizon + (sin(ang * 5.0 + uTime * 3.0) + 0.5 * sin(ang * 11.0 - uTime * 5.0)) * 0.03 * horizon;
            float inside = smoothstep(edge + 0.01, edge - 0.02, sd) * show;
            if (inside > 0.001) {
              float speed = 0.6 + a * 1.5 + t * t * 9.0 + e * 4.0;
              col = mix(col, tunnel(ang, sd, speed), inside);
            }
            // Burning rim of the opening
            float rim = exp(-abs(sd - edge) / (0.006 + horizon * 0.03));
            float flicker = 0.7 + 0.3 * sin(ang * 9.0 - uTime * 12.0);
            col += mix(uColor, vec3(1.0), 0.35) * rim * flicker * smoothstep(0.0, 0.35, a) * (1.0 - t) * 1.6;
          }

          // Contrast pulse and a tinted vignette closing in
          float pulse = 1.0 + suck * (0.35 + 0.15 * sin(uTime * 14.0));
          col = max(vec3(0.0), (col - 0.18) * pulse + 0.18);
          float vig = smoothstep(0.3, 1.2 - suck * 0.45, length((vUv - 0.5) * vec2(uAspect, 1.0)));
          col = mix(col, uColor * 0.15, vig * suck * 0.85);

          // Arrival flash
          col = mix(col, mix(uColor, vec3(1.0), 0.6) * 1.8, pow(e, 4.0));

          gl_FragColor = vec4(col, 1.0);
          #include <colorspace_fragment>
        }
      `,
      depthTest: false,
      depthWrite: false
    });
  }

  /** Called every frame with the approach (0-1) and tunnel transit (0-1) of the nearest rift. */
  public update(dtSeconds: number, approach: number, transit: number, colorHex: number): void {
    this.time += dtSeconds;
    this.approach = approach;
    this.transit = transit;
    if (this.exit > 0) this.exit = Math.max(0, this.exit - dtSeconds / EXIT_DURATION);
    else this.color.setHex(colorHex);

    // Roll speeds up inside the tunnel and unwinds afterwards
    const drive = approach * approach * 1.5 + transit * 7.0;
    this.spin += dtSeconds * drive;
    if (drive === 0) this.spin *= Math.exp(-dtSeconds * 5.0);
  }

  /** Starts the arrival animation: the tunnel opens up into the new world. */
  public triggerExit(colorHex: number): void {
    this.color.setHex(colorHex);
    this.exit = 1;
    this.approach = 0;
    this.transit = 0;
  }

  /** Temporarily bends the camera; undo with `restoreCamera` after the frame is drawn. */
  public applyCamera(camera: PerspectiveCamera): void {
    const a = this.approach, t = this.transit, e = this.exit;
    if (a <= 0 && t <= 0 && e <= 0 && Math.abs(this.spin) < 1e-3) return;

    this.savedFov = camera.fov;
    this.cameraApplied = true;

    // Wide stretch while flying through, narrowing back on arrival
    const fovScale = 1 + 0.3 * a * a + 0.55 * t * t + 0.35 * e * e;
    camera.fov = Math.min(160, this.savedFov * fovScale);
    camera.updateProjectionMatrix();

    const shake = a * a * 0.02 + t * 0.03 + e * e * 0.015;
    camera.rotateZ(this.spin);
    camera.rotateX((Math.random() - 0.5) * shake);
    camera.rotateY((Math.random() - 0.5) * shake);
    camera.updateMatrixWorld();
  }

  public restoreCamera(camera: PerspectiveCamera): void {
    if (!this.cameraApplied) return;
    this.cameraApplied = false;
    camera.fov = this.savedFov;
    camera.updateProjectionMatrix();
  }

  /** Points the effect at a rift (or none) for the frame about to be drawn. */
  public aim(camera: PerspectiveCamera, rift: Vector3 | null): void {
    const u = this.material.uniforms;
    u.uAspect.value = camera.aspect;
    u.uTime.value = this.time;
    u.uApproach.value = this.approach;
    u.uTransit.value = this.transit;
    u.uExit.value = this.exit;

    let lens = 0;
    const center = u.uCenter.value as Vector2;
    center.copy(SCREEN_CENTER);
    if (rift) {
      this.riftPos.copy(rift).project(camera);
      if (this.riftPos.z > -1 && this.riftPos.z < 1) {
        center.set(this.riftPos.x * 0.5 + 0.5, this.riftPos.y * 0.5 + 0.5);

        // Opening radius on screen: project a point on its edge, sideways to the view
        this.right.setFromMatrixColumn(camera.matrixWorld, 0);
        this.edge.copy(rift).addScaledVector(this.right, RIFT_OPENING_RADIUS).project(camera);
        u.uRadius.value = Math.abs(this.edge.x - this.riftPos.x) * 0.5 * camera.aspect;

        const dist = camera.position.distanceTo(rift);
        const offscreen = Math.max(Math.abs(this.riftPos.x), Math.abs(this.riftPos.y));
        lens = (1 - smoothstep(LENS_MAX_DISTANCE * 0.5, LENS_MAX_DISTANCE, dist)) *
               (1 - smoothstep(1.0, 1.3, offscreen));
      }
    }

    // Close in, the portal drifts to the middle of the view (we are falling into it)
    const pull = Math.max(this.approach * this.approach, this.transit, this.exit);
    center.lerp(SCREEN_CENTER, pull);

    u.uLens.value = lens;
    this.enabled = lens > 0.001 || this.approach > 0.001 || this.transit > 0 || this.exit > 0;
  }

  public dispose(): void {
    this.material.dispose();
  }
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}
