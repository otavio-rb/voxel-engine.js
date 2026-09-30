import { Scene, Vector3 } from 'three';
import { Explosion, ExplosionOptions } from './Explosion';
import { NuclearExplosion, NuclearExplosionOptions } from './NuclearExplosion';
import { Player } from '@voxel/engine/worker';
import { ProceduralWorld } from '@voxel/engine/worker';

export class ExplosionManager {
  private explosions: Set<Explosion> = new Set();
  private nuclearExplosions: Set<NuclearExplosion> = new Set();
  private readonly scene: Scene;

  public onExplosion?: (info: {
    position: Vector3;
    radius: number;
    soundType?: 'explosion' | 'lightning' | 'nuke';
  }) => void;

  constructor(scene: Scene) {
    this.scene = scene;
  }

  public createExplosion(
    options: ExplosionOptions,
    world: ProceduralWorld,
    player: Player
  ): Explosion {
    const radius = Math.max(1.0, options.radius ?? 4.5);
    const power = Math.max(0.1, options.power ?? 1.0);

    // ── 1. Destruição Instantânea de Terreno em Lote ─────────────────────────
    const destroyedBlocks = world.destroySphere(options.position, radius);

    // ── 2. Criar e Adicionar Visual da Explosão ──────────────────────────────
    const explosion = new Explosion({
      ...options,
      radius,
      power,
      debrisBlocks: destroyedBlocks
    });

    this.explosions.add(explosion);
    this.scene.add(explosion);

    // ── 3. Knockback e Tremor no Jogador ─────────────────────────────────────
    const toPlayer = new Vector3().subVectors(player.camera.position, options.position);
    const distPlayer = toPlayer.length();
    const maxEffectDist = radius * 3.2;

    if (distPlayer < maxEffectDist && Number.isFinite(distPlayer)) {
      const dirPlayer = distPlayer > 0.001
        ? toPlayer.clone().divideScalar(distPlayer)
        : new Vector3(0, 1, 0);

      const proximity = Math.max(0, 1.0 - (distPlayer / maxEffectDist));
      const forceMag = proximity * power * 0.35;

      const blastForce = dirPlayer.clone().multiplyScalar(forceMag);
      blastForce.y = Math.max(0.15 * power, blastForce.y + 0.2 * proximity * power);

      player.applyForce(blastForce);
      player.addCameraShake(proximity * 0.75 * Math.min(2.0, power));
    }

    // ── 4. Knockback e Impulso em Animais/Entidades ──────────────────────────
    try {
      const em = world.getEntityManager();
      const entities = em.getEntities();

      for (const ent of entities) {
        if (!ent || !ent.position) continue;
        const toEnt = new Vector3().subVectors(ent.position, options.position);
        const distEnt = toEnt.length();

        if (distEnt < maxEffectDist && Number.isFinite(distEnt)) {
          const dirEnt = distEnt > 0.001
            ? toEnt.divideScalar(distEnt)
            : new Vector3(0, 1, 0);

          const proximity = Math.max(0, 1.0 - (distEnt / maxEffectDist));
          const impulse = proximity * power * 0.45;

          ent.velocity.x += dirEnt.x * impulse;
          ent.velocity.y += Math.max(0.25 * power, dirEnt.y * impulse + 0.3 * proximity * power);
          ent.velocity.z += dirEnt.z * impulse;
        }
      }
    } catch (e) {
      console.warn('Erro ao aplicar impulso de explosão em entidades:', e);
    }

    // ── 5. Notificar Evento Sonoro ──────────────────────────────────────────
    this.onExplosion?.({
      position: options.position,
      radius,
      soundType: radius >= 12 ? 'nuke' : 'explosion'
    });

    return explosion;
  }

  public createNuclearExplosion(
    options: NuclearExplosionOptions,
    world: ProceduralWorld,
    player: Player
  ): NuclearExplosion {
    const radius = Math.max(8.0, options.radius ?? 18.0);
    const cloudHeight = Math.max(40.0, options.cloudHeight ?? 75.0);

    // 1. Destruição colossal em lote da cratera
    const destroyedBlocks = world.destroySphere(options.position, radius);

    // 2. Criar e adicionar o cogumelo nuclear
    const nuke = new NuclearExplosion({
      ...options,
      radius,
      cloudHeight,
      debrisBlocks: destroyedBlocks
    });

    this.nuclearExplosions.add(nuke);
    this.scene.add(nuke);

    // 3. Tremor sísmico nuclear e onda de choque de pressão colossal
    const toPlayer = new Vector3().subVectors(player.camera.position, options.position);
    const distPlayer = toPlayer.length();
    const maxNukeDist = radius * 5.2;

    if (distPlayer < maxNukeDist && Number.isFinite(distPlayer)) {
      const dirPlayer = distPlayer > 0.001
        ? toPlayer.clone().divideScalar(distPlayer)
        : new Vector3(0, 1, 0);

      const proximity = Math.max(0, 1.0 - (distPlayer / maxNukeDist));
      const forceMag = proximity * 1.4;

      const blastForce = dirPlayer.clone().multiplyScalar(forceMag);
      blastForce.y = Math.max(0.4, blastForce.y + 0.45 * proximity);

      player.applyForce(blastForce);
      player.addCameraShake(Math.min(2.0, proximity * 1.8));
    }

    // 4. Ejetar entidades e animais a dezenas de blocos de distância
    try {
      const em = world.getEntityManager();
      const entities = em.getEntities();

      for (const ent of entities) {
        if (!ent || !ent.position) continue;
        const toEnt = new Vector3().subVectors(ent.position, options.position);
        const distEnt = toEnt.length();

        if (distEnt < maxNukeDist && Number.isFinite(distEnt)) {
          const dirEnt = distEnt > 0.001 ? toEnt.divideScalar(distEnt) : new Vector3(0, 1, 0);
          const proximity = Math.max(0, 1.0 - (distEnt / maxNukeDist));
          const impulse = proximity * 1.6;

          ent.velocity.x += dirEnt.x * impulse;
          ent.velocity.y += Math.max(0.6, dirEnt.y * impulse + 0.7 * proximity);
          ent.velocity.z += dirEnt.z * impulse;
        }
      }
    } catch (e) {
      console.warn('Erro ao arremessar entidades na explosão nuclear:', e);
    }

    // 5. Notificar áudio de Nuke
    this.onExplosion?.({
      position: options.position,
      radius,
      soundType: 'nuke'
    });

    return nuke;
  }

  public update(delta: number): void {
    const dtSeconds = delta / 1000;

    for (const exp of this.explosions) {
      if (exp.isDisposed) {
        this.explosions.delete(exp);
        continue;
      }
      exp.update(dtSeconds);
    }

    for (const nuke of this.nuclearExplosions) {
      if (nuke.isDisposed) {
        this.nuclearExplosions.delete(nuke);
        continue;
      }
      nuke.update(dtSeconds);
    }
  }

  public getExplosions(): ReadonlySet<Explosion> {
    return this.explosions;
  }

  public getNuclearExplosions(): ReadonlySet<NuclearExplosion> {
    return this.nuclearExplosions;
  }

  public clear(): void {
    for (const exp of this.explosions) {
      exp.dispose();
    }
    this.explosions.clear();

    for (const nuke of this.nuclearExplosions) {
      nuke.dispose();
    }
    this.nuclearExplosions.clear();
  }

  public get count(): number {
    return this.explosions.size + this.nuclearExplosions.size;
  }
}
