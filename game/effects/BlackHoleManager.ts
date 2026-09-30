import { Scene, Vector3 } from 'three';
import { BlackHole, BlackHoleOptions } from './BlackHole';
import { Player } from '@voxel/engine/worker';
import { ProceduralWorld } from '@voxel/engine/worker';

export class BlackHoleManager {
  private blackHoles: Set<BlackHole> = new Set();
  private readonly scene: Scene;
  public onChatMessage?: (text: string) => void;
  public onMerger?: (pos: Vector3, newRadius: number) => void;

  constructor(scene: Scene) {
    this.scene = scene;
  }

  public spawn(options: {
    position: Vector3;
    radius?: number;
    lifetime?: number;
  }): BlackHole {
    const hole = new BlackHole({
      position: options.position,
      radius: options.radius ?? 3.0,
      lifetime: options.lifetime ?? 45,
      onSpaghettify: () => {
        this.onChatMessage?.('🌀 Você cruzou o Horizonte de Eventos e foi espaguetificado!');
      },
      onExplode: () => {
        this.onChatMessage?.('💥 Colapso gravitacional! O buraco negro implodiu e liberou radiação Hawking.');
      }
    });

    // Se já existem outros buracos negros no espaço, inicializa um momento orbital mútuo (sistema binário)
    for (const other of this.blackHoles) {
      if (other.isDisposed || other.isImploding) continue;

      const diff = new Vector3().subVectors(hole.position, other.position);
      const dist = diff.length();

      if (dist > 1.0 && dist < (hole.influenceRadius + other.influenceRadius) * 2.5) {
        const dir = diff.clone().divideScalar(dist);
        // Vetor tangente perpendicular no plano horizontal XZ
        const tangent = new Vector3(-dir.z, 0, dir.x).normalize();

        // Velocidade orbital kepleriana estimada v = sqrt(G * (M1 + M2) / r)
        const G = 25.0;
        const totalMass = hole.mass + other.mass;
        const vOrb = Math.min(9.0, Math.sqrt((G * totalMass) / Math.max(8.0, dist)));

        // Impulso inicial oposto para gerar dança orbital em espiral estável
        hole.velocity.add(tangent.clone().multiplyScalar(vOrb * 0.7));
        other.velocity.add(tangent.clone().multiplyScalar(-vOrb * 0.7 * (hole.mass / other.mass)));
      }
    }

    this.blackHoles.add(hole);
    this.scene.add(hole);

    const posStr = `[${Math.round(options.position.x)}, ${Math.round(options.position.y)}, ${Math.round(options.position.z)}]`;
    const lifeStr = (options.lifetime ?? 45) > 0 ? `${options.lifetime ?? 45}s` : 'Permanente';
    this.onChatMessage?.(`🌌 Singularidade estelar criada em ${posStr} | Raio: ${options.radius ?? 3} | Duração: ${lifeStr}`);

    if (this.blackHoles.size >= 2) {
      this.onChatMessage?.(`🪐 Sistema de corpos múltiplos ativo! Singularidades exercem atração gravitacional e orbitam entre si.`);
    }

    return hole;
  }

  public update(delta: number, player: Player, world: ProceduralWorld): void {
    const dtSeconds = delta / 1000;
    const G = 32.0; // Constante gravitacional entre singularidades

    // ── 1. Interação N-Corpos entre Múltiplos Buracos Negros ───────────────
    const activeHoles = Array.from(this.blackHoles).filter((h) => !h.isDisposed && !h.isImploding);
    const mergers: Array<{ primary: BlackHole; absorbed: BlackHole }> = [];

    for (let i = 0; i < activeHoles.length; i++) {
      for (let j = i + 1; j < activeHoles.length; j++) {
        const h1 = activeHoles[i];
        const h2 = activeHoles[j];
        if (h1.isDisposed || h2.isDisposed) continue;

        const toH2 = new Vector3().subVectors(h2.position, h1.position);
        const dist = toH2.length();

        if (!Number.isFinite(dist) || dist <= 0.001) continue;

        // Limiar de coalescência: os horizontes de eventos se tocam!
        const mergerDistance = (h1.coreRadius + h2.coreRadius) * 0.95;
        if (dist <= mergerDistance) {
          if (h1.coreRadius >= h2.coreRadius) {
            mergers.push({ primary: h1, absorbed: h2 });
          } else {
            mergers.push({ primary: h2, absorbed: h1 });
          }
          continue;
        }

        const dir = toH2.clone().divideScalar(dist);

        // Força gravitacional com softening para estabilidade física
        const softening = 3.5;
        const forceMagnitude = (G * h1.mass * h2.mass) / (dist * dist + softening * softening);

        // Aceleração mútua
        const a1 = dir.clone().multiplyScalar((forceMagnitude / h1.mass) * dtSeconds);
        const a2 = dir.clone().multiplyScalar(-(forceMagnitude / h2.mass) * dtSeconds);

        h1.velocity.add(a1);
        h2.velocity.add(a2);

        // Amortecimento gravitacional por emissão de ondas de maré (Peters inspiral decay)
        const inspiralFactor = Math.pow(0.996, dtSeconds * 60);
        h1.velocity.multiplyScalar(inspiralFactor);
        h2.velocity.multiplyScalar(inspiralFactor);
      }
    }

    // ── 2. Processar Fusões (Black Hole Mergers) ───────────────────────────
    for (const { primary, absorbed } of mergers) {
      if (primary.isDisposed || absorbed.isDisposed) continue;

      const oldR1 = primary.coreRadius;
      const oldR2 = absorbed.coreRadius;

      primary.mergeWith(absorbed);
      this.blackHoles.delete(absorbed);

      player.addCameraShake(1.1);
      this.onChatMessage?.(
        `🌀 FUSÃO GRAVITACIONAL! Duas singularidades (r=${oldR1.toFixed(1)} e r=${oldR2.toFixed(1)}) colapsaram em uma singularidade supermassiva de raio ${primary.coreRadius.toFixed(1)}!`
      );
      this.onMerger?.(primary.position, primary.coreRadius);
    }

    // ── 3. Atualizar cada singularidade individualmente ────────────────────
    for (const hole of this.blackHoles) {
      if (hole.isDisposed) {
        this.blackHoles.delete(hole);
        continue;
      }
      hole.update(delta, player, world);
    }
  }

  public clear(): void {
    const count = this.blackHoles.size;
    if (count === 0) {
      this.onChatMessage?.('✨ Nenhum buraco negro ativo para dissipar.');
      return;
    }
    for (const hole of this.blackHoles) {
      hole.implode();
    }
    this.onChatMessage?.(`⚡ Dissipando ${count} buraco(s) negro(s)...`);
  }

  public get count(): number {
    return this.blackHoles.size;
  }

  public getBlackHoles(): BlackHole[] {
    return Array.from(this.blackHoles);
  }
}
