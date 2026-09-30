import { Vector3, Color } from 'three';
import { dimensionRegistry } from '../../core/dimension/DimensionRegistry';
import { DimensionDefinition, DimensionTravelOptions } from '../../core/dimension/Dimension';
import ProceduralWorld from '../Worlds/ProceduralWorld';
import Player from '../Player';
import { DimensionalRift } from '../Effects/DimensionalRift';

export class DimensionManager {
  private currentDimensionId = 'overworld';
  private savedPositions = new Map<string, Vector3>();
  private portalCooldown = 0;
  private portalContactTimer = 0;
  private readonly portalTransitDuration = 1.35; // Segundos de sucção até a travessia

  private activeRifts = new Set<DimensionalRift>();
  private riftsByDimension = new Map<string, DimensionalRift[]>();

  public onChatMessage?: (text: string) => void;
  public onWarpEffect?: (dim: DimensionDefinition, isEntering: boolean) => void;
  public onAbsorptionProgress?: (progress: number, targetDimId: string, colorHex: number) => void;

  constructor() {
    this.savedPositions.set('overworld', new Vector3(0, 42, 0));
  }

  public get currentDimension(): DimensionDefinition {
    return dimensionRegistry.get(this.currentDimensionId) ?? dimensionRegistry.get('overworld')!;
  }

  public get currentId(): string {
    return this.currentDimensionId;
  }

  /**
   * Rasga uma Fenda Dimensional flutuante no espaço (sem blocos, apenas a fenda cósmica)
   */
  public spawnDimensionalRift(
    world: ProceduralWorld,
    pos: Vector3,
    targetDimId: string = 'nether'
  ): DimensionalRift {
    const targetDim = dimensionRegistry.get(targetDimId);
    const portalColor = targetDim?.portalColor ?? 0x9c27b0;

    const rift = new DimensionalRift({
      position: pos.clone(),
      targetDimId,
      portalColor
    });

    world.add(rift);
    this.activeRifts.add(rift);

    if (!this.riftsByDimension.has(this.currentDimensionId)) {
      this.riftsByDimension.set(this.currentDimensionId, []);
    }
    this.riftsByDimension.get(this.currentDimensionId)!.push(rift);

    this.onChatMessage?.(
      `⚡ FENDA DIMENSIONAL aberta para [${targetDim?.name ?? targetDimId}] em (${pos.x.toFixed(1)}, ${pos.y.toFixed(1)}, ${pos.z.toFixed(1)})!`
    );

    return rift;
  }

  /**
   * Mantido para compatibilidade com o comando de portal
   */
  public buildPortalFrame(
    world: ProceduralWorld,
    basePos: Vector3,
    _axis: 'x' | 'z' = 'x',
    targetDimId: string = 'nether'
  ): void {
    // Agora gera uma fenda dimensional pura sem blocos
    const riftPos = new Vector3(basePos.x, basePos.y + 1.8, basePos.z);
    this.spawnDimensionalRift(world, riftPos, targetDimId);
  }

  /**
   * Realiza a travessia dimensional
   */
  public async travelTo(
    targetDimId: string,
    world: ProceduralWorld,
    player: Player,
    options: DimensionTravelOptions = {}
  ): Promise<boolean> {
    const targetDim = dimensionRegistry.get(targetDimId);
    if (!targetDim) {
      this.onChatMessage?.(`❌ Dimensão "${targetDimId}" não encontrada no registro da engine.`);
      return false;
    }

    if (targetDim.id === this.currentDimensionId && !options.targetPosition) {
      this.onChatMessage?.(`ℹ️ Você já está na dimensão [${targetDim.name}].`);
      return false;
    }

    // 1. Salva coordenadas na dimensão de origem
    const playerPos = player.camera.position.clone();
    this.savedPositions.set(this.currentDimensionId, playerPos);

    // 2. Remove rifts da dimensão atual da cena
    for (const r of this.activeRifts) {
      world.remove(r);
    }
    this.activeRifts.clear();

    // 3. Calcula destino
    let dest = new Vector3();
    if (options.targetPosition) {
      dest.copy(options.targetPosition);
    } else if (this.savedPositions.has(targetDim.id)) {
      dest.copy(this.savedPositions.get(targetDim.id)!);
    } else {
      const currentScale = this.currentDimension.coordinateScale ?? 1.0;
      const targetScale = targetDim.coordinateScale ?? 1.0;

      const overworldX = playerPos.x * currentScale;
      const overworldZ = playerPos.z * currentScale;

      const destX = overworldX / targetScale;
      const destZ = overworldZ / targetScale;
      const destY = targetDim.defaultSpawnY ?? 40;

      dest.set(destX, destY, destZ);
    }

    // 4. Executa transição no mundo
    this.onWarpEffect?.(targetDim, true);
    world.switchDimension(targetDim, dest);

    // 5. Atualiza física e teletransporta o jogador com câmera limpa
    player.setGravity(targetDim.physics.gravity);
    player.teleport(dest.x, dest.y, dest.z);

    // 6. Restaura ou cria rifts da dimensão de destino
    const prevRifts = this.riftsByDimension.get(targetDim.id);
    if (prevRifts && prevRifts.length > 0) {
      for (const r of prevRifts) {
        if (!r.isDisposed) {
          world.add(r);
          this.activeRifts.add(r);
        }
      }
    }

    // Gera fenda de retorno flutuante se solicitado (sem blocos!)
    if (options.createReturnPortal !== false) {
      const returnPos = dest.clone().add(new Vector3(2.5, 1.8, 0));
      this.spawnDimensionalRift(world, returnPos, this.currentDimensionId);
    }

    this.currentDimensionId = targetDim.id;
    this.portalCooldown = 3.5;
    this.portalContactTimer = 0;
    this.onAbsorptionProgress?.(0, '', 0);

    this.onChatMessage?.(
      `🌌 [DIMENSÃO]: Entrando em ${targetDim.name}! Gravidade: ${(targetDim.physics.gravity / 0.008).toFixed(2)}G | ${targetDim.description ?? ''}`
    );

    return true;
  }

  /**
   * Monitoramento contínuo: sucção gravitacional suave e absorção óptica
   */
  public update(dtSeconds: number, world: ProceduralWorld, player: Player): void {
    // Atualiza shaders, fragmentos e partículas dos rifts ativos
    for (const rift of this.activeRifts) {
      if (rift.isDisposed) {
        this.activeRifts.delete(rift);
      } else {
        rift.update(dtSeconds);
      }
    }

    if (this.portalCooldown > 0) {
      this.portalCooldown -= dtSeconds;
      return;
    }

    const playerPos = player.camera.position;

    // Encontra a fenda dimensional mais próxima
    let nearestRift: DimensionalRift | null = null;
    let minRiftDist = Infinity;

    for (const rift of this.activeRifts) {
      const d = playerPos.distanceTo(rift.position);
      if (d < minRiftDist) {
        minRiftDist = d;
        nearestRift = rift;
      }
    }

    // Proximidade para ser aspirado pela fenda
    const isNearRift = nearestRift !== null && minRiftDist <= 2.2;

    if (isNearRift && nearestRift) {
      this.portalContactTimer += dtSeconds;
      const progress = Math.min(1.0, this.portalContactTimer / this.portalTransitDuration);

      const targetDim = nearestRift.targetDimId;
      const targetDimDef = dimensionRegistry.get(targetDim);
      const portalColor = targetDimDef?.portalColor ?? 0x9c27b0;

      nearestRift.suctionIntensity = progress;

      // ── Puxão Físico Gravitacional: atrai suavemente o corpo para o centro da fenda ──
      const toRift = new Vector3().subVectors(nearestRift.position, playerPos);
      const dist = toRift.length();
      if (dist > 0.05) {
        const suctionForce = (1.5 + progress * 5.0) * progress;
        player.applyForce(toRift.normalize().multiplyScalar(suctionForce * dtSeconds));
      }

      // ── Notifica o overlay de tela cheia (absorção puramente óptica) ─────────────────
      this.onAbsorptionProgress?.(progress, targetDim, portalColor);

      // Transição dimensional final
      if (this.portalContactTimer >= this.portalTransitDuration) {
        this.travelTo(targetDim, world, player, {
          createReturnPortal: true,
          useCoordinateScaling: true
        });
      }
    } else {
      if (this.portalContactTimer > 0) {
        this.portalContactTimer = Math.max(0, this.portalContactTimer - dtSeconds * 3.0);
        this.onAbsorptionProgress?.(this.portalContactTimer / this.portalTransitDuration, '', 0);
      }

      for (const rift of this.activeRifts) {
        rift.suctionIntensity = Math.max(0, rift.suctionIntensity - dtSeconds * 2.5);
      }
    }
  }
}
