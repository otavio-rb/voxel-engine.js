import {
  BufferAttribute,
  BufferGeometry,
  Color,
  DynamicDrawUsage,
  LineBasicMaterial,
  LineSegments,
  Object3D,
  PerspectiveCamera,
  Points,
  PointsMaterial,
  Vector2
} from 'three';

const RAIN_COUNT = 3072;
const SAND_COUNT = 2048;
const SNOW_COUNT = 1536;
const BOX_XZ = 56;
const BOX_Y = 36;
const STREAK_LEN = 1.6;

/**
 * Precipitation and storm particle system:
 * - Rain rendered as thin vertical LineSegments (never balloon into giant balls/points)
 * - Sandstorm rendered as high-speed horizontal sand needles
 * - Snow rendered as fine, gentle drifting flakes
 * - Always stays thin, sharp, and natural in front of the camera
 */
export class WeatherParticles {
  public readonly group = new Object3D();

  // Rain: LineSegments (2 vertices per streak = 6 floats)
  private rainGeom = new BufferGeometry();
  private rainBasePos = new Float32Array(RAIN_COUNT * 3);
  private rainLinePos = new Float32Array(RAIN_COUNT * 6);
  private rainMat: LineBasicMaterial;
  private rainLines: LineSegments;

  // Sand: LineSegments (horizontal flying needles, 2 vertices per streak)
  private sandGeom = new BufferGeometry();
  private sandBasePos = new Float32Array(SAND_COUNT * 3);
  private sandLinePos = new Float32Array(SAND_COUNT * 6);
  private sandMat: LineBasicMaterial;
  private sandLines: LineSegments;

  // Snow: fine micro-points
  private snowGeom = new BufferGeometry();
  private snowBasePos = new Float32Array(SNOW_COUNT * 3);
  private snowMat: PointsMaterial;
  private snowPoints: Points;

  private rainIntensity = 0;
  private sandIntensity = 0;
  private isSnow = false;

  constructor() {
    this.group.name = 'WeatherParticles';

    const halfX = BOX_XZ * 0.5;
    const halfY = BOX_Y * 0.5;
    const halfZ = BOX_XZ * 0.5;

    // ── 1. Rain setup (Thin vertical LineSegments) ──
    for (let i = 0; i < RAIN_COUNT; i++) {
      const i3 = i * 3;
      const x = (Math.random() - 0.5) * BOX_XZ;
      const y = (Math.random() - 0.5) * BOX_Y;
      const z = (Math.random() - 0.5) * BOX_XZ;
      this.rainBasePos[i3] = x;
      this.rainBasePos[i3 + 1] = y;
      this.rainBasePos[i3 + 2] = z;

      const i6 = i * 6;
      // Top of streak
      this.rainLinePos[i6] = x;
      this.rainLinePos[i6 + 1] = y + STREAK_LEN;
      this.rainLinePos[i6 + 2] = z;
      // Bottom of streak
      this.rainLinePos[i6 + 3] = x;
      this.rainLinePos[i6 + 4] = y;
      this.rainLinePos[i6 + 5] = z;
    }
    this.rainGeom.setAttribute('position', new BufferAttribute(this.rainLinePos, 3).setUsage(DynamicDrawUsage));
    this.rainMat = new LineBasicMaterial({
      color: 0x9bc8eb,
      transparent: true,
      opacity: 0.55,
      depthWrite: false
    });
    this.rainLines = new LineSegments(this.rainGeom, this.rainMat);
    this.rainLines.frustumCulled = false;
    this.group.add(this.rainLines);

    // ── 2. Sandstorm setup (Fine horizontal sand streaks) ──
    for (let i = 0; i < SAND_COUNT; i++) {
      const i3 = i * 3;
      const x = (Math.random() - 0.5) * BOX_XZ;
      const y = (Math.random() - 0.5) * BOX_Y;
      const z = (Math.random() - 0.5) * BOX_XZ;
      this.sandBasePos[i3] = x;
      this.sandBasePos[i3 + 1] = y;
      this.sandBasePos[i3 + 2] = z;

      const i6 = i * 6;
      this.sandLinePos[i6] = x;
      this.sandLinePos[i6 + 1] = y;
      this.sandLinePos[i6 + 2] = z;
      this.sandLinePos[i6 + 3] = x + 0.8;
      this.sandLinePos[i6 + 4] = y;
      this.sandLinePos[i6 + 5] = z;
    }
    this.sandGeom.setAttribute('position', new BufferAttribute(this.sandLinePos, 3).setUsage(DynamicDrawUsage));
    this.sandMat = new LineBasicMaterial({
      color: 0xdeb472,
      transparent: true,
      opacity: 0.65,
      depthWrite: false
    });
    this.sandLines = new LineSegments(this.sandGeom, this.sandMat);
    this.sandLines.frustumCulled = false;
    this.group.add(this.sandLines);

    // ── 3. Snow setup (Tiny micro-points) ──
    for (let i = 0; i < SNOW_COUNT; i++) {
      const i3 = i * 3;
      this.snowBasePos[i3] = (Math.random() - 0.5) * BOX_XZ;
      this.snowBasePos[i3 + 1] = (Math.random() - 0.5) * BOX_Y;
      this.snowBasePos[i3 + 2] = (Math.random() - 0.5) * BOX_XZ;
    }
    this.snowGeom.setAttribute('position', new BufferAttribute(this.snowBasePos, 3).setUsage(DynamicDrawUsage));
    this.snowMat = new PointsMaterial({
      color: 0xffffff,
      size: 0.08, // Very small micro dots, never huge balls
      transparent: true,
      opacity: 0.75,
      depthWrite: false
    });
    this.snowPoints = new Points(this.snowGeom, this.snowMat);
    this.snowPoints.frustumCulled = false;
    this.group.add(this.snowPoints);
  }

  public setShaderQuality(fancy: boolean): void {
    // Both LineBasicMaterial and micro-PointsMaterial work natively with 0 shader overhead
    this.rainMat.opacity = fancy ? 0.6 : 0.45;
    this.sandMat.opacity = fancy ? 0.7 : 0.5;
  }

  public update(dtSeconds: number, camera: PerspectiveCamera, rain: number, sand: number, windDir: Vector2, windSpd: number, isSnow = false): void {
    this.rainIntensity = rain;
    this.sandIntensity = sand;
    this.isSnow = isSnow;

    // Follow camera position
    this.group.position.set(camera.position.x, camera.position.y, camera.position.z);

    const halfX = BOX_XZ * 0.5;
    const halfY = BOX_Y * 0.5;
    const halfZ = BOX_XZ * 0.5;

    // ── Update Rain (Thin vertical lines) ──
    const rainActive = rain > 0.01 && !isSnow;
    this.rainLines.visible = rainActive;
    if (rainActive) {
      const activeCount = Math.floor(RAIN_COUNT * Math.min(1.0, rain));
      this.rainGeom.setDrawRange(0, activeCount * 2);

      const fallSpeed = 38.0;
      const tiltX = windDir.x * windSpd * 0.08;
      const tiltZ = windDir.y * windSpd * 0.08;

      const base = this.rainBasePos;
      const lines = this.rainLinePos;

      for (let i = 0; i < activeCount; i++) {
        const i3 = i * 3;
        const i6 = i * 6;

        base[i3] += tiltX * dtSeconds;
        base[i3 + 1] -= fallSpeed * dtSeconds;
        base[i3 + 2] += tiltZ * dtSeconds;

        if (base[i3 + 1] < -halfY) {
          base[i3 + 1] = halfY;
          base[i3] = (Math.random() - 0.5) * BOX_XZ;
          base[i3 + 2] = (Math.random() - 0.5) * BOX_XZ;
        }
        if (base[i3] < -halfX) base[i3] += BOX_XZ;
        else if (base[i3] > halfX) base[i3] -= BOX_XZ;
        if (base[i3 + 2] < -halfZ) base[i3 + 2] += BOX_XZ;
        else if (base[i3 + 2] > halfZ) base[i3 + 2] -= BOX_XZ;

        const bx = base[i3];
        const by = base[i3 + 1];
        const bz = base[i3 + 2];

        // Top of streak
        lines[i6] = bx - tiltX * 0.04;
        lines[i6 + 1] = by + STREAK_LEN;
        lines[i6 + 2] = bz - tiltZ * 0.04;

        // Bottom of streak
        lines[i6 + 3] = bx;
        lines[i6 + 4] = by;
        lines[i6 + 5] = bz;
      }
      this.rainGeom.attributes.position.needsUpdate = true;
      this.rainMat.opacity = Math.min(0.65, 0.35 + rain * 0.3);
    }

    // ── Update Snow ──
    const snowActive = rain > 0.01 && isSnow;
    this.snowPoints.visible = snowActive;
    if (snowActive) {
      const activeCount = Math.floor(SNOW_COUNT * Math.min(1.0, rain));
      this.snowGeom.setDrawRange(0, activeCount);
      const pos = this.snowBasePos;
      for (let i = 0; i < activeCount; i++) {
        const i3 = i * 3;
        pos[i3] += (windDir.x * 2.0 + Math.sin(pos[i3 + 1] * 0.5) * 0.8) * dtSeconds;
        pos[i3 + 1] -= 5.0 * dtSeconds;
        pos[i3 + 2] += (windDir.y * 2.0 + Math.cos(pos[i3 + 1] * 0.5) * 0.8) * dtSeconds;

        if (pos[i3 + 1] < -halfY) {
          pos[i3 + 1] = halfY;
          pos[i3] = (Math.random() - 0.5) * BOX_XZ;
          pos[i3 + 2] = (Math.random() - 0.5) * BOX_XZ;
        }
        if (pos[i3] < -halfX) pos[i3] += BOX_XZ;
        else if (pos[i3] > halfX) pos[i3] -= BOX_XZ;
        if (pos[i3 + 2] < -halfZ) pos[i3 + 2] += BOX_XZ;
        else if (pos[i3 + 2] > halfZ) pos[i3 + 2] -= BOX_XZ;
      }
      this.snowGeom.attributes.position.needsUpdate = true;
    }

    // ── Update Sandstorm (Fine horizontal streaks) ──
    const sandActive = sand > 0.01;
    this.sandLines.visible = sandActive;
    if (sandActive) {
      const activeCount = Math.floor(SAND_COUNT * Math.min(1.0, sand));
      this.sandGeom.setDrawRange(0, activeCount * 2);

      const vx = windDir.x * windSpd * 1.3;
      const vz = windDir.y * windSpd * 1.3;
      const needleLen = 0.9;

      const base = this.sandBasePos;
      const lines = this.sandLinePos;

      for (let i = 0; i < activeCount; i++) {
        const i3 = i * 3;
        const i6 = i * 6;

        base[i3] += vx * dtSeconds;
        base[i3 + 1] += Math.sin(base[i3] * 0.25) * 1.2 * dtSeconds;
        base[i3 + 2] += vz * dtSeconds;

        if (base[i3] < -halfX) base[i3] += BOX_XZ;
        else if (base[i3] > halfX) base[i3] -= BOX_XZ;
        if (base[i3 + 2] < -halfZ) base[i3 + 2] += BOX_XZ;
        else if (base[i3 + 2] > halfZ) base[i3 + 2] -= BOX_XZ;
        if (base[i3 + 1] < -halfY) base[i3 + 1] += BOX_Y;
        else if (base[i3 + 1] > halfY) base[i3 + 1] -= BOX_Y;

        const bx = base[i3];
        const by = base[i3 + 1];
        const bz = base[i3 + 2];

        lines[i6] = bx - windDir.x * needleLen;
        lines[i6 + 1] = by;
        lines[i6 + 2] = bz - windDir.y * needleLen;

        lines[i6 + 3] = bx;
        lines[i6 + 4] = by;
        lines[i6 + 5] = bz;
      }
      this.sandGeom.attributes.position.needsUpdate = true;
      this.sandMat.opacity = Math.min(0.7, 0.35 + sand * 0.35);
    }
  }

  public dispose(): void {
    this.rainGeom.dispose();
    this.rainMat.dispose();
    this.sandGeom.dispose();
    this.sandMat.dispose();
    this.snowGeom.dispose();
    this.snowMat.dispose();
  }
}
