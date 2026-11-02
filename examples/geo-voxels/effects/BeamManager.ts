import { Scene, Vector3, Mesh, SphereGeometry, MeshBasicMaterial, AdditiveBlending, DoubleSide } from 'three';
import { Beam, BeamOptions, BeamType } from './Beam';
import { ExplosionManager } from './ExplosionManager';
import { Player } from '@voxel/engine/worker';
import { ProceduralWorld } from '@voxel/engine/worker';
import { raycastVoxel } from '@voxel/engine/worker';

export class BeamManager {
  private beams: Set<Beam> = new Set();
  private readonly scene: Scene;

  private chargingPlayer: Player | null = null;
  private chargeStartTime = 0;
  private chargeOrb: Mesh | null = null;
  private chargeAura: Mesh | null = null;
  private lastKamehamehaTime = 0;

  public onBeamFired?: (info: {
    type: BeamType;
    origin: Vector3;
    target: Vector3;
    radius: number;
    charge?: number;
  }) => void;

  public onChargingStart?: (info: { origin: Vector3 }) => void;
  public onChargingStop?: () => void;
  public onChatMessage?: (text: string) => void;

  constructor(scene: Scene) {
    this.scene = scene;
  }

  public fireBeam(
    options: BeamOptions,
    world: ProceduralWorld,
    explosionManager: ExplosionManager,
    player: Player
  ): Beam {
    const beam = new Beam(options);
    this.beams.add(beam);
    this.scene.add(beam);

    const radius = options.radius ?? (options.type === 'orbital' ? 10.0 : 5.0);
    const power = options.type === 'orbital' ? 2.5 : options.type === 'lightning' ? 1.5 : 1.1;

    // Dispara a explosão devastadora no ponto de impacto
    explosionManager.createExplosion(
      {
        position: options.target,
        radius,
        power,
        color: options.color
      },
      world,
      player
    );

    this.onBeamFired?.({
      type: options.type ?? 'lightning',
      origin: options.origin,
      target: options.target,
      radius
    });

    return beam;
  }

  public fireFromPlayer(
    player: Player,
    world: ProceduralWorld,
    explosionManager: ExplosionManager,
    type: BeamType = 'lightning',
    radius?: number
  ): Beam | null {
    const origin = player.camera.position.clone();
    const lookDir = new Vector3();
    player.camera.getWorldDirection(lookDir);

    // Raycast voxel de longo alcance (150 blocos)
    const hit = raycastVoxel(world, origin, lookDir, 150);
    const target = hit ? hit.point.clone() : origin.clone().add(lookDir.clone().multiplyScalar(90));

    let beamOrigin = origin.clone();
    let effectiveRadius = radius ?? (type === 'orbital' ? 10.0 : 5.0);

    if (type === 'kamehameha') {
      return this.fireKamehameha(player, world, explosionManager, 1.0);
    }

    if (type === 'lightning') {
      const skyY = Math.min(130, Math.max(70, target.y + 65));
      beamOrigin = new Vector3(
        target.x + (Math.random() - 0.5) * 8,
        skyY,
        target.z + (Math.random() - 0.5) * 8
      );
    } else if (type === 'orbital') {
      beamOrigin = new Vector3(target.x, 155, target.z);
      effectiveRadius = Math.max(8.0, effectiveRadius);
    } else if (type === 'laser') {
      beamOrigin = origin.clone().add(new Vector3(0, -0.2, 0));
    }

    return this.fireBeam(
      {
        origin: beamOrigin,
        target,
        type,
        radius: effectiveRadius
      },
      world,
      explosionManager,
      player
    );
  }

  /** Posição confortável das mãos do jogador: à frente e no canto inferior direito, livre da mira */
  public getHandPosition(player: Player): Vector3 {
    const origin = player.camera.position.clone();
    const lookDir = new Vector3();
    player.camera.getWorldDirection(lookDir);

    const right = new Vector3(lookDir.z, 0, -lookDir.x).normalize();
    const up = new Vector3(0, 1, 0);

    return origin
      .addScaledVector(lookDir, 1.25)
      .addScaledVector(right, 0.38)
      .addScaledVector(up, -0.40);
  }

  public isCharging(): boolean {
    return this.chargingPlayer !== null;
  }

  public getChargingRatio(): number {
    if (!this.chargingPlayer) return 0;
    const elapsed = (performance.now() - this.chargeStartTime) / 1000;
    return Math.min(1.25, Math.max(0.15, elapsed / 2.0));
  }

  /** Inicia o carregamento contínuo de Ki ao segurar a tecla [K] */
  public startCharging(player: Player): void {
    if (this.chargingPlayer) return;
    this.chargingPlayer = player;
    this.chargeStartTime = performance.now();

    const handPos = this.getHandPosition(player);

    // 1. Núcleo brilhante da esfera de Ki em concentração
    const orbGeo = new SphereGeometry(0.08, 16, 16);
    const orbMat = new MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      blending: AdditiveBlending,
      opacity: 0.95,
      depthWrite: false
    });
    this.chargeOrb = new Mesh(orbGeo, orbMat);
    this.chargeOrb.position.copy(handPos);
    this.scene.add(this.chargeOrb);

    // 2. Halo externo de Ki elétrico ciano
    const auraGeo = new SphereGeometry(0.18, 16, 16);
    const auraMat = new MeshBasicMaterial({
      color: 0x00f0ff,
      side: DoubleSide,
      transparent: true,
      blending: AdditiveBlending,
      opacity: 0.8,
      depthWrite: false
    });
    this.chargeAura = new Mesh(auraGeo, auraMat);
    this.chargeAura.position.copy(handPos);
    this.scene.add(this.chargeAura);

    this.onChargingStart?.({ origin: handPos });
  }

  /** Dispara o Kamehameha ao soltar a tecla [K], com potência proporcional ao tempo carregado */
  public stopCharging(
    player: Player,
    world: ProceduralWorld,
    explosionManager: ExplosionManager,
    chargeMultiplier?: number
  ): Beam | null {
    if (!this.chargingPlayer && chargeMultiplier === undefined) return null;

    let ratio = chargeMultiplier;
    if (ratio === undefined && this.chargingPlayer) {
      const elapsed = (performance.now() - this.chargeStartTime) / 1000;
      // 2.0 segundos para carga total (1.0x), mínimo 0.2x, até 1.25x se segurar um pouco mais
      ratio = Math.min(1.25, Math.max(0.2, elapsed / 2.0));
    }

    this.cleanupChargeVisuals();
    this.chargingPlayer = null;
    this.onChargingStop?.();

    return this.fireKamehameha(player, world, explosionManager, ratio ?? 1.0);
  }

  private cleanupChargeVisuals(): void {
    if (this.chargeOrb) {
      this.scene.remove(this.chargeOrb);
      this.chargeOrb.geometry.dispose();
      (this.chargeOrb.material as MeshBasicMaterial).dispose();
      this.chargeOrb = null;
    }
    if (this.chargeAura) {
      this.scene.remove(this.chargeAura);
      this.chargeAura.geometry.dispose();
      (this.chargeAura.material as MeshBasicMaterial).dispose();
      this.chargeAura = null;
    }
  }

  /** Dispara a rajada de Kamehameha escalada pelo nível de carga (0.2x a 1.25x) */
  public fireKamehameha(
    player: Player,
    world: ProceduralWorld,
    explosionManager: ExplosionManager,
    charge = 1.0
  ): Beam | null {
    const now = performance.now();
    if (now - this.lastKamehamehaTime < 250) return null;
    this.lastKamehamehaTime = now;

    const origin = player.camera.position.clone();
    const lookDir = new Vector3();
    player.camera.getWorldDirection(lookDir);

    const beamOrigin = this.getHandPosition(player);

    // Alcance: 140 blocos para cargas fracas, até 240 blocos em carga máxima
    const maxDist = Math.floor(140 + charge * 80);
    const hit = raycastVoxel(world, origin, lookDir, maxDist);
    let target: Vector3;

    if (hit && hit.distance > 1.8) {
      target = hit.point.clone();
    } else {
      target = origin.clone().addScaledVector(lookDir, 120 + charge * 40);
    }

    // Escala dos parâmetros com o tempo de carregamento
    const powerScale = 0.5 + charge * 1.1; // 0.6x a 1.9x
    const explosionRadius = Math.max(4.0, 5.0 + charge * 15.0); // Cratera de 5 até 24 blocos!
    const explosionPower = 1.5 + charge * 3.5;
    const beamDuration = 1.1 + charge * 1.1; // 1.3s a 2.5s
    const beamThickness = 0.7 * powerScale;

    // 1. Detonação devastadora no alvo (com cratera proporcional)
    explosionManager.createExplosion(
      {
        position: target,
        radius: explosionRadius,
        power: explosionPower,
        color: 0x00f0ff
      },
      world,
      player
    );

    // 2. Tremor na câmera proporcional à força (sem jogar o jogador para trás)
    player.addCameraShake(0.15 + charge * 0.25);

    // 3. Instanciação do Feixe de Kamehameha
    const beam = new Beam({
      origin: beamOrigin,
      target,
      type: 'kamehameha',
      thickness: beamThickness,
      duration: beamDuration,
      color: 0x00d0ff,
      radius: explosionRadius
    });

    this.beams.add(beam);
    this.scene.add(beam);

    this.onBeamFired?.({
      type: 'kamehameha',
      origin: beamOrigin,
      target,
      radius: explosionRadius,
      charge
    });

    return beam;
  }

  public getBeams(): Iterable<Beam> {
    return this.beams;
  }

  public update(delta: number): void {
    const dtSeconds = delta / 1000;

    // Animação da esfera de Ki sendo carregada nas mãos do jogador
    if (this.chargingPlayer && this.chargeOrb && this.chargeAura) {
      const handPos = this.getHandPosition(this.chargingPlayer);
      this.chargeOrb.position.copy(handPos);
      this.chargeAura.position.copy(handPos);

      const ratio = this.getChargingRatio();
      const time = performance.now() * 0.001;
      const pulse = 1.0 + 0.18 * Math.sin(time * 30);

      // A esfera de energia cresce de 0.06m até 0.32m conforme acumula Ki
      const orbScale = (0.8 + ratio * 2.2) * pulse;
      this.chargeOrb.scale.set(orbScale, orbScale, orbScale);

      const auraScale = (1.0 + ratio * 2.8) * (1.0 + 0.15 * Math.cos(time * 25));
      this.chargeAura.scale.set(auraScale, auraScale, auraScale);
      this.chargeAura.rotateY(dtSeconds * 12);
      this.chargeAura.rotateZ(dtSeconds * 8);

      // Vibração sutil de Ki no jogador durante o carregamento
      this.chargingPlayer.addCameraShake(0.015 + ratio * 0.05);
    }

    for (const beam of this.beams) {
      if (beam.isDisposed) {
        this.beams.delete(beam);
        continue;
      }
      beam.update(dtSeconds);
    }
  }

  public clear(): void {
    this.cleanupChargeVisuals();
    this.chargingPlayer = null;
    for (const beam of this.beams) {
      beam.dispose();
    }
    this.beams.clear();
  }

  public get count(): number {
    return this.beams.size;
  }
}
