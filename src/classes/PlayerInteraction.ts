import { Raycaster, Vector2, PerspectiveCamera, Vector3 } from 'three';
import ProceduralWorld from './Worlds/ProceduralWorld';

/** Maximum block reach in world units. */
const REACH = 8;

/**
 * Handles player interactions with the voxel world (block destruction, etc.).
 * Raycasts from the camera centre on left-click while the pointer is locked.
 */
export default class PlayerInteraction {
  private readonly raycaster = new Raycaster();
  private readonly center    = new Vector2(0, 0); // screen centre
  private isLocked = false;
  private selectedBlockType: number = 2; // Default to Grass (2)
  private isBreaking = false;
  private breakTimer = 0;

  constructor(
    private readonly camera: PerspectiveCamera,
    private readonly world:  ProceduralWorld,
    public onBlockDestroyed?: (point: Vector3, normal: Vector3) => void,
    public onBlockPlaced?: (point: Vector3, normal: Vector3, type: number) => void,
    public onSelectionChange?: (type: number) => void
  ) {
    this.raycaster.far = REACH;
  }

  public onKeyDown(key: string): void {
    if (key >= '1' && key <= '9') {
      const types = [2, 0, 1, 3, 4, 9, 10, 7, 8]; // Grass, Stone, Dirt, Sand, Snow, Wood, Leaves, Coal, Iron
      const newType = types[parseInt(key) - 1] ?? 2;
      if (newType !== this.selectedBlockType) {
        this.selectedBlockType = newType;
        if (this.onSelectionChange) this.onSelectionChange(newType);
      }
    }
  }

  public setLock(locked: boolean): void {
    this.isLocked = locked;
    if (!locked) {
      this.world.clearBlockOutline();
      this.isBreaking = false;
    }
  }

  /** Called every frame — updates the hover outline. */
  public update(): void {
    if (!this.isLocked) return;

    this.raycaster.setFromCamera(this.center, this.camera);
    const meshes     = this.world.getChunkMeshes();
    const intersects = this.raycaster.intersectObjects(meshes, false);

    if (intersects.length === 0 || !intersects[0].face) {
      this.world.clearBlockOutline();
      this.isBreaking = false;
      return;
    }

    const hit = intersects[0];
    const worldNormal = hit.face!.normal.clone().transformDirection(hit.object.matrixWorld);
    const bx = Math.floor(hit.point.x - worldNormal.x * 0.5);
    const by = Math.floor(hit.point.y - worldNormal.y * 0.5);
    const bz = Math.floor(hit.point.z - worldNormal.z * 0.5);
    
    this.world.setBlockOutline(bx, by, bz, this.isBreaking);
  }

  public triggerClick(button: number): void {
    this.raycaster.setFromCamera(this.center, this.camera);

    const meshes       = this.world.getChunkMeshes();
    const intersects   = this.raycaster.intersectObjects(meshes, false);

    if (intersects.length === 0) return;

    const hit = intersects[0];
    if (!hit.face) return;

    // hit.face.normal is in local (mesh) space — transform to world space.
    const worldNormal = hit.face.normal.clone().transformDirection(hit.object.matrixWorld);
    
    if (button === 0) {
      // Left click: Destroy
      this.isBreaking = true;
      this.world.destroyBlock(hit.point, worldNormal);
      
      if (this.onBlockDestroyed) {
          this.onBlockDestroyed(hit.point, worldNormal);
      }
      
      // Reset isBreaking after a short delay for visual effect
      setTimeout(() => { this.isBreaking = false; }, 200);
    } else if (button === 2) {
      // Right click: Place
      this.world.addBlock(hit.point, worldNormal, this.selectedBlockType);
      
      if (this.onBlockPlaced) {
        this.onBlockPlaced(hit.point, worldNormal, this.selectedBlockType);
      }
    }
  }
}
