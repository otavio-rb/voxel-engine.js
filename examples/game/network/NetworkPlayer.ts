import { Group, Mesh, BoxGeometry, MeshStandardMaterial, Vector3 } from 'three';

export class NetworkPlayer extends Group {
    private targetPosition: Vector3 = new Vector3();
    private targetRotationY: number = 0;

    constructor(public readonly networkId: string, color: number) {
        super();

        // Simple Player Representation (Floating colored box)
        const geo = new BoxGeometry(0.8, 1.8, 0.8);
        const mat = new MeshStandardMaterial({ color: color });
        const mesh = new Mesh(geo, mat);
        mesh.position.y = 0.9; // Center of the geometry is at 0.9 up from feet
        mesh.castShadow = true;
        mesh.receiveShadow = true;

        this.add(mesh);
    }

    public syncPosition(x: number, y: number, z: number, ry: number) {
        this.targetPosition.set(x, y, z);
        this.targetRotationY = ry;
    }

    public update(deltaTime: number) {
        // LERP frame-rate independent para interpolação suave
        const dt = Math.min(deltaTime, 100) / 1000;
        const lerpFactor = 1.0 - Math.exp(-12 * dt); // Suave e idêntico a 60, 144, 180+ FPS

        this.position.lerp(this.targetPosition, lerpFactor);

        // Interpolação de rotação Y
        const rotDiff = this.targetRotationY - this.rotation.y;
        let normalizedDiff = rotDiff;
        while (normalizedDiff > Math.PI) normalizedDiff -= Math.PI * 2;
        while (normalizedDiff < -Math.PI) normalizedDiff += Math.PI * 2;

        this.rotation.y += normalizedDiff * lerpFactor;
    }
}
