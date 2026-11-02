import HeadlessControls from './HeadlessControls';
import { PerspectiveCamera, Quaternion, Vector3 } from 'three';
import ProceduralWorld from '../world/ProceduralWorld';
import { AABB, KinematicBody } from '../physics/AABBPhysics';
import { blockRegistry } from '../blocks/BlockRegistry';

export type PlayerMode = 'normal' | 'debug';

export interface PlayerDimensions {
  width: number;
  height: number;
  eyeHeight: number;
}

export interface PlayerOptions {
  camera: PerspectiveCamera;
  world: ProceduralWorld;
  mode?: PlayerMode;
  /**
   * Quantos voxels cabem em um bloco (um metro). 1 e o voxel classico; 8 significa
   * minivoxels de 1/8 de bloco. O grid de voxels continua sendo a unidade da cena,
   * entao o jogador e a fisica e que crescem nessa proporcao.
   */
  voxelsPerBlock?: number;
  /**
   * Escala relativa do corpo do jogador (1.0 = proporção humana padrão;
   * valores menores como 0.35 criam um personagem menor adequado para mundos micro-voxel).
   */
  scale?: number;
  /** Custom player collider dimensions (in world voxel units). */
  dimensions?: Partial<PlayerDimensions>;
  /** Maximum obstacle height (in world voxel units) the player steps up automatically when grounded. */
  stepHeight?: number;
  /** Optional movement parameter overrides applied on top of `scaleMovement(voxelsPerBlock)`. */
  movement?: Partial<MovementTable>;
  /**
   * World Y threshold below which the player is automatically teleported back to origin spawn.
   * Default `-500 * voxelsPerBlock`. Pass `null` to disable void reset.
   */
  voidResetY?: number | null;
}

/**
 * Default human-scale movement profile (units: blocks and ticks of 50 ms) — fully
 * overridable per instance via `PlayerOptions.movement`, or replace `Player` with your own
 * class built on `KinematicBody` for a different feel entirely. The numbers below happen to
 * match Minecraft 1.8's formulas (a well-documented, well-tuned walking/jumping feel —
 * see https://www.mcpk.wiki/wiki/Horizontal_Movement_Formulas and
 * https://www.mcpk.wiki/wiki/Vertical_Movement_Formulas), not because the engine assumes
 * Minecraft-style gameplay.
 */
export const MOVEMENT = {
  TICK_MS: 50,
  GRAVITY: 0.08,
  VERTICAL_DRAG: 0.98,
  JUMP_VELOCITY: 0.42,
  SPRINT_JUMP_BOOST: 0.2,
  /** Ticks before holding jump triggers another jump. */
  JUMP_COOLDOWN: 10,
  /** Horizontal momentum kept each tick while airborne (multiplied by slipperiness on ground). */
  AIR_MOMENTUM: 0.91,
  WALK_SPEED: 0.1,
  SPRINT_MULTIPLIER: 1.3,
  SNEAK_MULTIPLIER: 0.3,
  /** Every movement input is scaled by 0.98, which is why 45° strafing is faster. */
  INPUT_FACTOR: 0.98,
  AIR_ACCELERATION: 0.02,
  SPRINT_AIR_ACCELERATION: 0.026,
  /** (0.6 * 0.91)³: ground acceleration is `speed * this / (slipperiness * 0.91)³`. */
  GROUND_ACCEL_NUMERATOR: 0.16277136,
  /** Velocities below this are zeroed at the start of each tick (1.8 value). */
  MOMENTUM_THRESHOLD: 0.005,
  FLUID_ACCELERATION: 0.02,
  WATER_DRAG: 0.8,
  LAVA_DRAG: 0.5,
  FLUID_SINK: 0.02,
  FLUID_SWIM_UP: 0.04,
  /** Boost when pushing against a wall at the fluid surface, to climb out. */
  FLUID_JUMP_OUT: 0.3,
  /** Stop sprinting when forward input drops below this. */
  SPRINT_MIN_FORWARD: 0.8,
  /** Max ticks between two forward presses to start sprinting. */
  DOUBLE_TAP_TICKS: 7,
  SNEAK_EYE_DROP: 0.08,
  SPRINT_FOV_MULTIPLIER: 1.15,
  /** View bobbing (EntityRenderer.setupViewBobbing): stride = distance walked × this. */
  BOB_STRIDE: 0.6,
  BOB_MAX: 0.1,
  BOB_SMOOTHING: 0.4,
  FALL_TILT_SMOOTHING: 0.8,
  /** Free-fly (debug) speed per tick. */
  FLY_SPEED: 1.8
} as const;

export type MovementTable = { -readonly [K in keyof typeof MOVEMENT]: number };

/** Grandezas de MOVEMENT que sao comprimentos (por tick) e portanto escalam com o voxel. */
const MOVEMENT_LENGTHS = [
  'GRAVITY', 'JUMP_VELOCITY', 'SPRINT_JUMP_BOOST', 'WALK_SPEED', 'AIR_ACCELERATION',
  'SPRINT_AIR_ACCELERATION', 'MOMENTUM_THRESHOLD', 'FLUID_ACCELERATION', 'FLUID_SINK',
  'FLUID_SWIM_UP', 'FLUID_JUMP_OUT', 'SNEAK_EYE_DROP', 'BOB_MAX', 'FLY_SPEED'
] as const satisfies ReadonlyArray<keyof typeof MOVEMENT>;

/**
 * Reescala MOVEMENT para um mundo cujos voxels sao menores que um bloco.
 *
 * So comprimentos escalam. Arrastos, multiplicadores, suavizacoes e contagens de tick
 * sao adimensionais e precisam ficar parados, senao a fisica do MC 1.8 deixa de valer.
 * BOB_STRIDE e fase-por-comprimento, logo escala ao contrario, para que o balanco da
 * caminhada mantenha a mesma frequencia visual.
 */
export function scaleMovement(voxelsPerBlock: number, playerScale: number = 1): MovementTable {
  const table = { ...MOVEMENT } as MovementTable;
  const factor = voxelsPerBlock * playerScale;
  if (factor === 1) return table;
  for (const key of MOVEMENT_LENGTHS) table[key] = MOVEMENT[key] * factor;
  table.BOB_STRIDE = MOVEMENT.BOB_STRIDE / factor;
  return table;
}

/** `setGravity` keeps the engine's historical unit, where 0.008 means 1 G. */
const GRAVITY_UNIT = 0.008;

/** 60 Hz step used by `externalVelocity`, which effects feed in per-frame units. */
const EXTERNAL_STEP_MS = 1000 / 60;

export default class Player {
  public readonly camera: PerspectiveCamera;
  public readonly controls: HeadlessControls;
  public readonly world: ProceduralWorld;
  public readonly body: KinematicBody;

  private readonly keys: Record<string, boolean> = {};
  /** Voxels por bloco; 1 no voxel classico. Ver PlayerOptions.voxelsPerBlock. */
  public readonly voxelsPerBlock: number;
  /** Escala relativa do corpo do jogador. */
  public playerScale: number;
  /**
   * Velocidade de voo livre, em unidades de mundo por tick de 50 ms. Default: o valor do
   * MC 1.8 escalado (1.8 blocos/tick, ~36 blocos/s).
   */
  public flySpeed: number;
  /** Mutable movement physics table for this player instance. */
  public mv: MovementTable;
  private readonly dimensions: PlayerDimensions;
  public voidResetY: number | null;
  private canMove = true;
  private mode: PlayerMode;
  /** Velocity pushed by effects (black holes, explosions), in blocks per 60 Hz frame. */
  public externalVelocity = new Vector3();
  private readonly pendingExternal = new Vector3();
  private shakeIntensity = 0;

  // ── Fixed 20 TPS simulation, interpolated for rendering ──────────────────
  private tickAccumulator = 0;
  private tickCount = 0;
  private readonly prevPosition = new Vector3();
  private renderT = 1;

  // ── Movement state ───────────────────────────────────────────────────────
  private sprinting = false;
  private sneaking = false;
  private jumpTicks = 0;
  private collidedHorizontally = false;
  private lastForwardTapTick = -Infinity;
  private sprintRequested = false;

  // ── Camera feel ──────────────────────────────────────────────────────────
  private readonly baseFov: number;
  private fovMultiplier = 1;
  private eyeDrop = 0;

  /** Sway the camera while walking, like Minecraft's "View Bobbing" option. */
  public viewBobbing = true;
  private distanceWalked = 0;
  private prevDistanceWalked = 0;
  private bobAmount = 0;
  private prevBobAmount = 0;
  private fallTilt = 0;
  private prevFallTilt = 0;
  private readonly basePosition = new Vector3();
  private readonly baseQuaternion = new Quaternion();
  private viewEffectsApplied = false;

  constructor({
    camera,
    world,
    mode = 'debug',
    voxelsPerBlock = 1,
    scale = 1,
    dimensions,
    stepHeight,
    movement,
    voidResetY
  }: PlayerOptions) {
    this.voxelsPerBlock = voxelsPerBlock;
    this.playerScale = scale;
    const factor = voxelsPerBlock * scale;
    this.mv = { ...scaleMovement(voxelsPerBlock, scale), ...movement };
    this.flySpeed = this.mv.FLY_SPEED;
    this.dimensions = {
      width:     dimensions?.width     ?? 0.6 * factor,
      height:    dimensions?.height    ?? 1.8 * factor,
      eyeHeight: dimensions?.eyeHeight ?? 1.62 * factor
    };
    this.voidResetY = voidResetY === undefined ? -500 * voxelsPerBlock : voidResetY;
    this.camera = camera;
    this.camera.rotation.order = 'YXZ';
    this.world = world;
    this.mode = mode;
    this.baseFov = camera.fov;

    this.controls = new HeadlessControls(camera);

    this.body = new KinematicBody({
      dimensions: { width: this.dimensions.width, height: this.dimensions.height },
      eyeHeight: this.dimensions.eyeHeight,
      stepHeight: stepHeight ?? 0.6 * factor,
      gravity: GRAVITY_UNIT,
      unitScale: factor
    });

    this.camera.position.set(2 * voxelsPerBlock, 41.6 * voxelsPerBlock, 2 * voxelsPerBlock);
    this.body.position.copy(this.camera.position);
    this.prevPosition.copy(this.body.position);
  }

  /**
   * Altera a escala do corpo e da física do jogador dinamicamente.
   */
  public setScale(scale: number): void {
    if (!Number.isFinite(scale) || scale <= 0.05) return;
    this.playerScale = scale;
    this.mv = scaleMovement(this.voxelsPerBlock, scale);
    this.flySpeed = this.mv.FLY_SPEED;
    const factor = this.voxelsPerBlock * scale;
    this.setDimensions({
      width:     0.6 * factor,
      height:    1.8 * factor,
      eyeHeight: 1.62 * factor
    });
    this.body.stepHeight = 0.6 * factor;
  }

  /** Current motion in blocks per tick (20 TPS). */
  public get velocity(): Vector3 {
    return this.body.velocity;
  }

  public get isGrounded(): boolean {
    return this.body.isGrounded;
  }

  public get isSprinting(): boolean {
    return this.sprinting;
  }

  public get isSneaking(): boolean {
    return this.sneaking;
  }

  public get stepHeight(): number {
    return this.body.stepHeight;
  }

  public set stepHeight(value: number) {
    this.body.stepHeight = value;
  }

  public getMode(): PlayerMode {
    return this.mode;
  }

  public setDimensions(dims: Partial<PlayerDimensions>): void {
    if (dims.width !== undefined) {
      this.dimensions.width = dims.width;
      this.body.dimensions.width = dims.width;
    }
    if (dims.height !== undefined) {
      this.dimensions.height = dims.height;
      this.body.dimensions.height = dims.height;
    }
    if (dims.eyeHeight !== undefined) {
      this.dimensions.eyeHeight = dims.eyeHeight;
      this.body.eyeHeight = dims.eyeHeight;
    }
  }

  public getDimensions(): Readonly<PlayerDimensions> {
    return this.dimensions;
  }

  public setMode(mode: PlayerMode): void {
    this.mode = mode;
    this.body.velocity.set(0, 0, 0);
    this.sprinting = false;
    if (mode === 'debug') {
      this.body.isGrounded = false;
      this.world.setDebugMode(true);
    } else {
      this.world.setDebugMode(false);
    }
  }

  public teleport(x: number, y: number, z: number, yaw?: number, pitch?: number): void {
    this.camera.position.set(x, y, z);
    this.body.position.copy(this.camera.position);
    this.prevPosition.copy(this.body.position);
    this.body.velocity.set(0, 0, 0);
    // Pushes queued before the teleport (portals, black holes) must not carry over
    this.externalVelocity.set(0, 0, 0);
    this.pendingExternal.set(0, 0, 0);
    if (yaw !== undefined || pitch !== undefined) {
      this.controls.setOrientation(yaw ?? 0, pitch ?? 0);
    }
  }

  /** Gravity in engine units (0.008 = 1 G, as used by dimensions). */
  public setGravity(value: number): void {
    this.body.gravity = value;
  }

  public applyForce(force: Vector3): void {
    if (Number.isFinite(force.x) && Number.isFinite(force.y) && Number.isFinite(force.z)) {
      this.externalVelocity.add(force);
    }
  }

  public addCameraShake(intensity: number): void {
    if (Number.isFinite(intensity) && intensity > 0) {
      this.shakeIntensity = Math.min(0.4, this.shakeIntensity + intensity);
    }
  }

  public onKeyDown(key: string): void {
    const k = key.toLowerCase();
    const isRepeat = this.keys[k];
    this.keys[k] = true;

    // Duplo toque em W inicia o sprint
    if (k === 'w' && !isRepeat) {
      if (this.tickCount - this.lastForwardTapTick <= this.mv.DOUBLE_TAP_TICKS) {
        this.sprintRequested = true;
      }
      this.lastForwardTapTick = this.tickCount;
    }

    if (k === ' ' && !isRepeat) {
      if (this.tickCount - this.lastForwardTapTick <= this.mv.DOUBLE_TAP_TICKS) {
        this.sprintRequested = true;
      }
    }
  }

  public onKeyUp(key: string): void {
    this.keys[key.toLowerCase()] = false;
  }

  public onMouseMove(movementX: number, movementY: number): void {
    this.controls.onMouseMove(movementX, movementY);
  }

  public setLock(locked: boolean): void {
    this.canMove = locked;
    if (locked) {
      this.controls.lock();
    } else {
      this.controls.unlock();
      Object.keys(this.keys).forEach((k) => (this.keys[k] = false));
      this.sprinting = false;
    }
  }

  /** Advances the simulation; called at the engine's fixed rate. */
  public update(deltaMs: number): void {
    if (!this.canMove) return;

    // Effects push in 60 Hz frame units: accumulate them as displacement for the next tick.
    const steps = deltaMs / EXTERNAL_STEP_MS;
    this.pendingExternal.addScaledVector(this.externalVelocity, steps * this.voxelsPerBlock);
    this.externalVelocity.multiplyScalar(Math.pow(0.9, steps));
    if (this.externalVelocity.lengthSq() < 0.00001) {
      this.externalVelocity.set(0, 0, 0);
    }

    this.tickAccumulator += deltaMs;
    while (this.tickAccumulator >= this.mv.TICK_MS) {
      this.tickAccumulator -= this.mv.TICK_MS;
      this.prevPosition.copy(this.body.position);
      this.tick();
      this.pendingExternal.set(0, 0, 0);
    }
  }

  /**
   * Places the camera between the last two ticks. `extraMs` is the time elapsed since
   * the last `update`, so motion stays smooth at any frame rate.
   */
  public render(extraMs: number, frameDeltaMs: number): void {
    const t = Math.min(1, Math.max(0, (this.tickAccumulator + extraMs) / this.mv.TICK_MS));
    this.renderT = t;
    this.camera.position.lerpVectors(this.prevPosition, this.body.position, t);

    const smoothing = 1 - Math.exp(-frameDeltaMs / 60);
    const targetDrop = this.sneaking && this.mode === 'normal' ? this.mv.SNEAK_EYE_DROP : 0;
    this.eyeDrop += (targetDrop - this.eyeDrop) * smoothing;
    this.camera.position.y -= this.eyeDrop;

    const targetFov = this.sprinting ? this.mv.SPRINT_FOV_MULTIPLIER : 1;
    const nextFov = this.fovMultiplier + (targetFov - this.fovMultiplier) * smoothing;
    if (Math.abs(nextFov - this.fovMultiplier) > 1e-4) {
      this.fovMultiplier = nextFov;
      this.camera.fov = this.baseFov * this.fovMultiplier;
      this.camera.updateProjectionMatrix();
    }

    if (this.shakeIntensity > 0.001) {
      this.shakeIntensity *= Math.pow(0.82, frameDeltaMs / EXTERNAL_STEP_MS);
    }
  }

  /**
   * Adds purely visual camera motion (view bobbing, fall tilt, shake) right before drawing.
   * Call `clearViewEffects` after rendering so aiming and physics keep the clean pose.
   */
  public applyViewEffects(): void {
    if (this.viewEffectsApplied) return;
    this.basePosition.copy(this.camera.position);
    this.baseQuaternion.copy(this.camera.quaternion);
    this.viewEffectsApplied = true;

    if (this.viewBobbing) {
      const t = this.renderT;
      const stride = this.distanceWalked - this.prevDistanceWalked;
      const phase = -(this.distanceWalked + stride * t) * Math.PI;
      const bob = this.prevBobAmount + (this.bobAmount - this.prevBobAmount) * t;
      const tilt = this.prevFallTilt + (this.fallTilt - this.prevFallTilt) * t;

      // Deslocamento lateral/vertical no espaço da câmera
      this.camera.translateX(-Math.sin(phase) * bob * 0.5);
      this.camera.translateY(Math.abs(Math.cos(phase) * bob));

      const deg = Math.PI / 180;
      const pitch = -(Math.abs(Math.cos(phase - 0.2) * bob) * 5 + tilt) * deg;
      const roll = -Math.sin(phase) * bob * 3 * deg;
      this.camera.rotateX(pitch);
      this.camera.rotateZ(roll);
    }

    if (this.shakeIntensity > 0.001) {
      const shake = this.shakeIntensity * this.voxelsPerBlock;
      this.camera.position.x += (Math.random() - 0.5) * shake;
      this.camera.position.y += (Math.random() - 0.5) * shake;
      this.camera.position.z += (Math.random() - 0.5) * shake;
    }
  }

  public clearViewEffects(): void {
    if (!this.viewEffectsApplied) return;
    this.camera.position.copy(this.basePosition);
    this.camera.quaternion.copy(this.baseQuaternion);
    this.viewEffectsApplied = false;
  }

  private tick(): void {
    this.tickCount++;
    this.prevDistanceWalked = this.distanceWalked;
    this.prevBobAmount = this.bobAmount;
    this.prevFallTilt = this.fallTilt;

    const pos = this.body.position;
    this.world.setUnderwater(
      blockRegistry.isSwimmable(this.world.getBlock(Math.floor(pos.x), Math.floor(pos.y), Math.floor(pos.z)))
    );

    if (this.mode === 'debug') {
      this.tickFlying();
    } else {
      this.tickWalking();
    }

    // Reset de queda abismal (quando configurado)
    if (this.voidResetY !== null && pos.y < this.voidResetY) {
      this.teleport(0, 41.6 * this.voxelsPerBlock, 0);
    }
  }

  /** Free noclip flight used by creative/debug mode. */
  private tickFlying(): void {
    const { forward, right } = this.horizontalAxes();
    const dir = new Vector3()
      .addScaledVector(forward, this.axis('w', 's'))
      .addScaledVector(right, this.axis('d', 'a'));
    if (dir.lengthSq() > 0) dir.normalize();

    const pos = this.body.position;
    pos.addScaledVector(dir, this.flySpeed).add(this.pendingExternal);
    if (this.keys[' ']) pos.y += this.flySpeed;
    if (this.keys['shift'] || this.keys['control']) pos.y -= this.flySpeed;
    this.sprinting = false;
    this.sneaking = false;
    this.updateBobbing();
  }

  /** One tick of Minecraft 1.8 walking physics (EntityLivingBase.moveEntityWithHeading). */
  private tickWalking(): void {
    const m = this.body.velocity;
    const gravityScale = this.body.gravity / GRAVITY_UNIT;

    if (Math.abs(m.x) < this.mv.MOMENTUM_THRESHOLD) m.x = 0;
    if (Math.abs(m.y) < this.mv.MOMENTUM_THRESHOLD) m.y = 0;
    if (Math.abs(m.z) < this.mv.MOMENTUM_THRESHOLD) m.z = 0;

    // ── Input ──────────────────────────────────────────────────────────────
    this.sneaking = !!this.keys['shift'];
    let forward = this.axis('w', 's');
    let strafe = this.axis('d', 'a');
    if (this.sneaking) {
      forward *= this.mv.SNEAK_MULTIPLIER;
      strafe *= this.mv.SNEAK_MULTIPLIER;
    }

    const wantsSprint = this.sprintRequested || !!this.keys['control'];
    this.sprintRequested = false;
    if (!this.sprinting && wantsSprint && forward >= this.mv.SPRINT_MIN_FORWARD) {
      this.sprinting = true;
    }
    if (this.sprinting && (forward < this.mv.SPRINT_MIN_FORWARD || this.collidedHorizontally)) {
      this.sprinting = false;
    }

    forward *= this.mv.INPUT_FACTOR;
    strafe *= this.mv.INPUT_FACTOR;

    const inWater = this.isInFluid((id) => blockRegistry.isSwimmable(id));
    const inLava = !inWater && this.isInFluid((id) => blockRegistry.isFluid(id) && !blockRegistry.isSwimmable(id));

    // ── Jump ───────────────────────────────────────────────────────────────
    if (this.jumpTicks > 0) this.jumpTicks--;
    if (this.keys[' ']) {
      if (inWater || inLava) {
        m.y += this.mv.FLUID_SWIM_UP;
      } else if (this.body.isGrounded && this.jumpTicks === 0) {
        m.y = this.mv.JUMP_VELOCITY;
        if (this.sprinting) {
          m.addScaledVector(this.horizontalAxes().forward, this.mv.SPRINT_JUMP_BOOST);
        }
        this.jumpTicks = this.mv.JUMP_COOLDOWN;
      }
    } else {
      this.jumpTicks = 0;
    }

    // ── Move ───────────────────────────────────────────────────────────────
    m.y += this.pendingExternal.y * 3;

    if (inWater || inLava) {
      const startY = this.body.position.y;
      this.moveRelative(strafe, forward, this.mv.FLUID_ACCELERATION);
      this.move();

      const drag = inWater ? this.mv.WATER_DRAG : this.mv.LAVA_DRAG;
      m.multiplyScalar(drag);
      m.y -= this.mv.FLUID_SINK * gravityScale;

      // Sair da água empurrando contra uma borda
      const climbY = m.y + 0.6 * this.voxelsPerBlock - (this.body.position.y - startY);
      if (this.collidedHorizontally && this.isOffsetFree(m.x, climbY, m.z)) {
        m.y = this.mv.FLUID_JUMP_OUT;
      }
      this.updateBobbing();
      return;
    }

    const momentum = this.body.isGrounded
      ? this.groundSlipperiness() * this.mv.AIR_MOMENTUM
      : this.mv.AIR_MOMENTUM;
    const acceleration = this.body.isGrounded
      ? this.mv.WALK_SPEED * (this.sprinting ? this.mv.SPRINT_MULTIPLIER : 1) *
        (this.mv.GROUND_ACCEL_NUMERATOR / (momentum * momentum * momentum))
      : (this.sprinting ? this.mv.SPRINT_AIR_ACCELERATION : this.mv.AIR_ACCELERATION);

    this.moveRelative(strafe, forward, acceleration);
    this.move();

    m.y -= this.mv.GRAVITY * gravityScale;
    m.y *= this.mv.VERTICAL_DRAG;
    m.x *= momentum;
    m.z *= momentum;
    this.updateBobbing();
  }

  /** EntityPlayer.onLivingUpdate: bob follows ground speed, tilt follows vertical speed in the air. */
  private updateBobbing(): void {
    const m = this.body.velocity;
    const flying = this.mode === 'debug';
    const grounded = this.body.isGrounded && !flying;

    const speed = grounded ? Math.min(this.mv.BOB_MAX, Math.hypot(m.x, m.z)) : 0;
    const tilt = grounded || flying ? 0 : Math.atan(-m.y * 0.2) * 15;

    this.bobAmount += (speed - this.bobAmount) * this.mv.BOB_SMOOTHING;
    this.fallTilt += (tilt - this.fallTilt) * this.mv.FALL_TILT_SMOOTHING;
  }

  /** Minecraft's moveFlying: adds input-direction acceleration, normalized when |input| > 1. */
  private moveRelative(strafe: number, forward: number, acceleration: number): void {
    let magnitude = strafe * strafe + forward * forward;
    if (magnitude < 1e-4) return;
    magnitude = Math.max(1, Math.sqrt(magnitude));
    const scale = acceleration / magnitude;

    const { forward: f, right: r } = this.horizontalAxes();
    this.body.velocity.x += (f.x * forward + r.x * strafe) * scale;
    this.body.velocity.z += (f.z * forward + r.z * strafe) * scale;
  }

  /** Applies motion plus pending external displacement, cancelling blocked axes. */
  private move(): void {
    const m = this.body.velocity;
    const result = this.body.moveAndCollide(
      this.world,
      m.x + this.pendingExternal.x * 3,
      m.y,
      m.z + this.pendingExternal.z * 3,
      this.sneaking
    );
    this.distanceWalked += Math.hypot(result.x, result.z) * this.mv.BOB_STRIDE;
    if (result.collidedX) m.x = 0;
    if (result.collidedY) m.y = 0;
    if (result.collidedZ) m.z = 0;
    this.collidedHorizontally = result.collidedX || result.collidedZ;
  }

  private groundSlipperiness(): number {
    const pos = this.body.position;
    const feetY = Math.floor(pos.y - this.dimensions.eyeHeight + 1e-6) - 1;
    return blockRegistry.getSlipperiness(this.world.getBlock(Math.floor(pos.x), feetY, Math.floor(pos.z)));
  }

  /** Fluid check with Minecraft's box: shrunk 0.4 vertically and 0.001 on every side. */
  private isInFluid(match: (id: number) => boolean): boolean {
    const box = this.body.getBounds();
    const s = this.voxelsPerBlock;
    return this.anyBlock({
      minX: box.minX + 0.001 * s, minY: box.minY + 0.4 * s, minZ: box.minZ + 0.001 * s,
      maxX: box.maxX - 0.001 * s, maxY: box.maxY - 0.4 * s, maxZ: box.maxZ - 0.001 * s
    }, match);
  }

  /** True when the box, moved by the offset, touches neither solids nor fluids. */
  private isOffsetFree(dx: number, dy: number, dz: number): boolean {
    const b = this.body.getBounds();
    const moved: AABB = {
      minX: b.minX + dx, minY: b.minY + dy, minZ: b.minZ + dz,
      maxX: b.maxX + dx, maxY: b.maxY + dy, maxZ: b.maxZ + dz
    };
    return !KinematicBody.intersectsSolid(this.world, moved) &&
      !this.anyBlock(moved, (id) => blockRegistry.isFluid(id));
  }

  private anyBlock(box: AABB, match: (id: number) => boolean): boolean {
    for (let x = Math.floor(box.minX); x <= Math.floor(box.maxX); x++) {
      for (let y = Math.floor(box.minY); y <= Math.floor(box.maxY); y++) {
        for (let z = Math.floor(box.minZ); z <= Math.floor(box.maxZ); z++) {
          if (match(this.world.getBlock(x, y, z))) return true;
        }
      }
    }
    return false;
  }

  /** Unit vectors along the ground plane for where the camera faces. */
  private horizontalAxes(): { forward: Vector3; right: Vector3 } {
    const yaw = this.controls.getYaw();
    const forward = new Vector3(-Math.sin(yaw), 0, -Math.cos(yaw));
    const right = new Vector3(-forward.z, 0, forward.x);
    return { forward, right };
  }

  private axis(positive: string, negative: string): number {
    return (this.keys[positive] ? 1 : 0) - (this.keys[negative] ? 1 : 0);
  }
}
