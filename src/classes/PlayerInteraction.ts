import { Raycaster, Vector2, PerspectiveCamera } from 'three';
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

  constructor(
    private readonly camera: PerspectiveCamera,
    private readonly world:  ProceduralWorld,
  ) {
    this.raycaster.far = REACH;
  }

  public triggerClick(): void {
    this.raycaster.setFromCamera(this.center, this.camera);

    const meshes       = this.world.getChunkMeshes();
    const intersects   = this.raycaster.intersectObjects(meshes, false);

    if (intersects.length === 0) return;

    const hit = intersects[0];
    if (!hit.face) return;

    // hit.face.normal is in local (mesh) space — transform to world space.
    const worldNormal = hit.face.normal.clone().transformDirection(hit.object.matrixWorld);
    this.world.destroyBlock(hit.point, worldNormal);
  }
}
