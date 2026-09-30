import { Scene, Vector3 } from 'three';
import { Beam, BeamOptions, BeamType } from './Beam';
import { ExplosionManager } from './ExplosionManager';
import { Player } from '@voxel/engine/worker';
import { ProceduralWorld } from '@voxel/engine/worker';
import { raycastVoxel } from '@voxel/engine/worker';

export class BeamManager {
  private beams: Set<Beam> = new Set();
  private readonly scene: Scene;

  public onBeamFired?: (info: {
    type: BeamType;
    origin: Vector3;
    target: Vector3;
    radius: number;
  }) => void;

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
  ): Beam {
    const origin = player.camera.position.clone();
    const lookDir = new Vector3();
    player.camera.getWorldDirection(lookDir);

    // Raycast voxel de longo alcance (150 blocos)
    const hit = raycastVoxel(world, origin, lookDir, 150);
    const target = hit ? hit.point.clone() : origin.clone().add(lookDir.clone().multiplyScalar(90));

    let beamOrigin = origin.clone();
    let effectiveRadius = radius ?? (type === 'orbital' ? 10.0 : 5.0);

    if (type === 'lightning') {
      // O raio divino desce violentamente das nuvens sobre o ponto mirado
      const skyY = Math.min(130, Math.max(70, target.y + 65));
      beamOrigin = new Vector3(
        target.x + (Math.random() - 0.5) * 8,
        skyY,
        target.z + (Math.random() - 0.5) * 8
      );
      this.onChatMessage?.(`⚡ Relâmpago devastador invocado em [${Math.round(target.x)}, ${Math.round(target.y)}, ${Math.round(target.z)}]!`);
    } else if (type === 'orbital') {
      // Canhão de partículas orbital desce do ápice do céu
      beamOrigin = new Vector3(target.x, 155, target.z);
      effectiveRadius = Math.max(8.0, effectiveRadius);
      this.onChatMessage?.(`🛰️ Ataque orbital de partículas disparado em [${Math.round(target.x)}, ${Math.round(target.y)}, ${Math.round(target.z)}]!`);
    } else if (type === 'laser') {
      // Feixe de plasma concentrado da mão do jogador
      beamOrigin = origin.clone().add(new Vector3(0, -0.2, 0));
      this.onChatMessage?.(`🔴 Feixe de laser de alta energia disparado!`);
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

  public update(delta: number): void {
    const dtSeconds = delta / 1000;

    for (const beam of this.beams) {
      if (beam.isDisposed) {
        this.beams.delete(beam);
        continue;
      }
      beam.update(dtSeconds);
    }
  }

  public clear(): void {
    for (const beam of this.beams) {
      beam.dispose();
    }
    this.beams.clear();
  }

  public get count(): number {
    return this.beams.size;
  }
}
