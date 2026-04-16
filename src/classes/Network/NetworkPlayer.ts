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
        // LERP for smooth interpolation between network updates
        const lerpFactor = 0.2; // Adjust for smoothness vs responsiveness

        this.position.lerp(this.targetPosition, lerpFactor);

        // Rotation interpolation (Simple lerp, avoiding quaternion complexity for now since it only rotates Y)
        // Wait, simple lerp for angles can be weird if crossing PI/-PI, but for basic rotation it's fine for now.
        const rotDiff = this.targetRotationY - this.rotation.y;
        
        // Normalize angle to -PI to PI
        let normalizedDiff = rotDiff;
        while (normalizedDiff > Math.PI) normalizedDiff -= Math.PI * 2;
        while (normalizedDiff < -Math.PI) normalizedDiff += Math.PI * 2;

        this.rotation.y += normalizedDiff * lerpFactor;
    }
}
