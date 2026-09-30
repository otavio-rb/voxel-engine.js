import { PerspectiveCamera, Vector3 } from 'three';
import ProceduralWorld from '../world/ProceduralWorld';
import { raycastVoxel } from '../physics/VoxelRaycaster';

/** Alcance máximo de interação do jogador em blocos. */
const REACH = 8;

/**
 * Gerencia a interação do jogador com o mundo voxel (seleção, destruição e colocação de blocos).
 * Utiliza o algoritmo DDA 3D para raycast em O(passos) no grid, eliminando checagem de malhas poligonais.
 */
export default class PlayerInteraction {
  private readonly rayOrigin = new Vector3();
  private readonly lookDirection = new Vector3();

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
    public onSelectionChange?: (type: number) => void
  ) {}

  /** Block IDs bound to the number keys / mouse wheel, in slot order. */
  public setHotbar(types: number[]): void {
    this.hotbarTypes = [...types];
    this.currentSlotIndex = 0;
    if (types.length > 0) this.selectedBlockType = types[0];
  }

  public selectSlot(idx: number): void {
    if (idx < 0 || idx >= this.hotbarTypes.length) return;
    this.currentSlotIndex = idx;
    const newType = this.hotbarTypes[idx];
    if (newType !== this.selectedBlockType) {
      this.selectedBlockType = newType;
      if (this.onSelectionChange) this.onSelectionChange(newType);
    }
  }

  public setSelectedBlockType(type: number): void {
    const idx = this.hotbarTypes.indexOf(type);
    if (idx !== -1) {
      this.currentSlotIndex = idx;
    }
    if (type !== this.selectedBlockType) {
      this.selectedBlockType = type;
      if (this.onSelectionChange) this.onSelectionChange(type);
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
    } else if (key === '0') {
      this.selectSlot(9);
    } else if (key === '-' || key === '_') {
      this.selectSlot(10);
    } else if (key === '=' || key === '+') {
      this.selectSlot(11);
    }
  }

  public setLock(locked: boolean): void {
    this.isLocked = locked;
    if (!locked) {
      this.world.clearBlockOutline();
      this.isBreaking = false;
    }
  }

  /** Atualiza o contorno visual do bloco focado (executado a cada frame). */
  public update(): void {
    if (!this.isLocked) return;

    this.camera.getWorldDirection(this.lookDirection);
    this.rayOrigin.copy(this.camera.position);

    const hit = raycastVoxel(this.world, this.rayOrigin, this.lookDirection, REACH);

    if (!hit) {
      this.world.clearBlockOutline();
      this.isBreaking = false;
      return;
    }

    this.world.setBlockOutline(hit.blockPos.x, hit.blockPos.y, hit.blockPos.z, this.isBreaking);
  }

  /** Dispara a ação de clique do mouse (0: quebrar bloco, 2: colocar bloco). */
  public triggerClick(button: number): void {
    this.camera.getWorldDirection(this.lookDirection);
    this.rayOrigin.copy(this.camera.position);

    const hit = raycastVoxel(this.world, this.rayOrigin, this.lookDirection, REACH);
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
