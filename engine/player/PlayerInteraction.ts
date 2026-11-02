import { PerspectiveCamera, Vector3 } from 'three';
import ProceduralWorld from '../world/ProceduralWorld';
import { raycastVoxel } from '../physics/VoxelRaycaster';


/**
 * Gerencia a interação do jogador com o mundo voxel (seleção, destruição e colocação de blocos).
 * Utiliza o algoritmo DDA 3D para raycast em O(passos) no grid, eliminando checagem de malhas poligonais.
 */
export default class PlayerInteraction {
  private readonly rayOrigin = new Vector3();
  private readonly lookDirection = new Vector3();

  /** Alcance de interacao, em unidades de voxel (8 blocos por padrao). */
  public reach: number;
  public clickHandler?: (button: number) => boolean;

  private isLocked = false;
  private selectedBlockType: number = 0;
  private currentSlotIndex: number = 0;
  private hotbarTypes: number[] = [];
  private isBreaking = false;

  constructor(
    private readonly camera: PerspectiveCamera,
    private readonly world: ProceduralWorld,
    public onBlockDestroyed?: (pos: Vector3, normal: Vector3, blockType?: number) => void,
    public onBlockPlaced?: (pos: Vector3, normal: Vector3, type: number) => void,
    public onSelectionChange?: (type: number, slotIndex: number) => void
  ) {
    this.reach = 8 * world.voxelsPerBlock;
  }

  /** Block IDs bound to the number keys / mouse wheel, in slot order. */
  public setHotbar(types: number[]): void {
    this.hotbarTypes = [...types];
    if (this.currentSlotIndex >= this.hotbarTypes.length) {
      this.currentSlotIndex = Math.max(0, this.hotbarTypes.length - 1);
    }
    if (this.hotbarTypes.length > 0) {
      const currentSlotType = this.hotbarTypes[this.currentSlotIndex];
      // Só emite se o tipo do slot atual realmente diferir do selecionado
      if (currentSlotType !== this.selectedBlockType) {
        this.selectedBlockType = currentSlotType;
        this.onSelectionChange?.(this.selectedBlockType, this.currentSlotIndex);
      }
    }
  }

  public selectSlot(idx: number): void {
    if (idx < 0 || idx >= this.hotbarTypes.length) return;
    const prevSlot = this.currentSlotIndex;
    const prevType = this.selectedBlockType;
    this.currentSlotIndex = idx;
    this.selectedBlockType = this.hotbarTypes[idx];
    if (this.currentSlotIndex !== prevSlot || this.selectedBlockType !== prevType) {
      this.onSelectionChange?.(this.selectedBlockType, idx);
    }
  }

  public getSelectedBlockType(): number {
    return this.selectedBlockType;
  }

  public setSelectedBlockType(type: number): void {
    const prevSlot = this.currentSlotIndex;
    const prevType = this.selectedBlockType;
    const idx = this.hotbarTypes.indexOf(type);
    if (idx !== -1) {
      this.currentSlotIndex = idx;
    }
    this.selectedBlockType = type;
    if (this.currentSlotIndex !== prevSlot || this.selectedBlockType !== prevType) {
      this.onSelectionChange?.(type, this.currentSlotIndex);
    }
  }

  public onWheel(direction: number): void {
    if (this.hotbarTypes.length === 0) return;
    let newIdx = (this.currentSlotIndex + direction) % this.hotbarTypes.length;
    if (newIdx < 0) newIdx += this.hotbarTypes.length;
    this.selectSlot(newIdx);
  }

  public onKeyDown(key: string): void {
    if (key >= '1' && key <= '9') {
      this.selectSlot(parseInt(key, 10) - 1);
    }
  }

  private activeMouseButton: number | null = null;
  private continuousTimer = 0;
  /** Intervalo em ms para disparo contínuo ao segurar o botão do mouse (~14 ações/seg). */
  public continuousInterval = 70;

  public onMouseDown(button: number): void {
    this.activeMouseButton = button;
    this.continuousTimer = 0;
    this.triggerClick(button);
  }

  public onMouseUp(button: number): void {
    if (this.activeMouseButton === button) {
      this.activeMouseButton = null;
    }
  }

  public setLock(locked: boolean): void {
    this.isLocked = locked;
    if (!locked) {
      this.activeMouseButton = null;
      this.world.clearBlockOutline();
      this.isBreaking = false;
    }
  }

  /** Atualiza o contorno visual do bloco focado e a ação contínua do mouse (executado a cada frame). */
  public update(deltaMs: number = 16.6667): void {
    if (!this.isLocked) return;

    if (this.activeMouseButton !== null) {
      this.continuousTimer += deltaMs;
      if (this.continuousTimer >= this.continuousInterval) {
        this.continuousTimer = 0;
        this.triggerClick(this.activeMouseButton);
      }
    }

    this.camera.getWorldDirection(this.lookDirection);
    this.rayOrigin.copy(this.camera.position);

    const hit = raycastVoxel(this.world, this.rayOrigin, this.lookDirection, this.reach);

    if (!hit) {
      this.world.clearBlockOutline();
      this.isBreaking = false;
      return;
    }

    this.world.setBlockOutline(hit.blockPos.x, hit.blockPos.y, hit.blockPos.z, this.isBreaking);
  }

  /** Dispara a ação de clique do mouse (0: quebrar bloco, 2: colocar bloco). */
  public triggerClick(button: number): void {
    if (this.clickHandler && this.clickHandler(button)) {
      return;
    }

    this.camera.getWorldDirection(this.lookDirection);
    this.rayOrigin.copy(this.camera.position);

    const hit = raycastVoxel(this.world, this.rayOrigin, this.lookDirection, this.reach);
    if (!hit) return;

    if (button === 0) {
      // Botão esquerdo: Quebrar bloco
      this.isBreaking = true;
      this.world.destroyBlock(hit.point, hit.faceNormal);

      if (this.onBlockDestroyed) {
        this.onBlockDestroyed(hit.blockPos, hit.faceNormal, hit.blockType);
      }

      setTimeout(() => {
        this.isBreaking = false;
      }, 200);
    } else if (button === 2) {
      // Botão direito: Colocar bloco adjacente à face atingida
      this.world.addBlock(hit.point, hit.faceNormal, this.selectedBlockType);

      const placePos = new Vector3(
        hit.blockPos.x + hit.faceNormal.x,
        hit.blockPos.y + hit.faceNormal.y,
        hit.blockPos.z + hit.faceNormal.z
      );

      if (this.onBlockPlaced) {
        this.onBlockPlaced(placePos, hit.faceNormal, this.selectedBlockType);
      }
    }
  }
}
